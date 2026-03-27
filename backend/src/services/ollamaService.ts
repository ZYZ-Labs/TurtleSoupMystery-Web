import axios, { AxiosError } from 'axios';
import { nanoid } from 'nanoid';
import { z } from 'zod';
import { buildOllamaApiUrl, normalizeOllamaBaseUrl, normalizeText, unique } from '../lib/utils.js';
import type {
  GuessEvaluation,
  ModelCategory,
  OllamaModel,
  OllamaSupplier,
  Puzzle,
  PuzzleGenerationRequest,
  QuestionEvaluation,
  RoomContext
} from '../types/domain.js';

const generatedPuzzleSchema = z.object({
  title: z.string().min(4),
  soupSurface: z.string().min(8),
  truthStory: z.string().min(20),
  facts: z
    .array(
      z.object({
        factId: z.string().optional(),
        statement: z.string().min(4),
        importance: z.number().int().min(1).max(10).default(6),
        discoverable: z.boolean().default(true),
        keywords: z.array(z.string()).default([])
      })
    )
    .min(4),
  misleadingPoints: z.array(z.string()).default([]),
  keyTriggers: z.array(z.string()).default([]),
  difficulty: z.enum(['easy', 'medium', 'hard']),
  tags: z.array(z.string()).default([])
});

const questionSchema = z.object({
  answerCode: z.enum(['yes', 'no', 'irrelevant', 'partial', 'unknown']),
  matchedFactIds: z.array(z.string()).default([]),
  revealedFactIds: z.array(z.string()).default([]),
  progressDelta: z.number().int().min(0).max(30).default(0),
  reasoning: z.string().default('')
});

const guessSchema = z.object({
  accepted: z.boolean(),
  score: z.number().int().min(0).max(100).default(0),
  missingPoints: z.array(z.string()).default([]),
  reasoning: z.string().default('')
});

interface CheckResult {
  reachable: boolean;
  normalizedBaseUrl: string;
  models: OllamaModel[];
  message: string;
}

interface OllamaChatMessage {
  role: 'system' | 'user';
  content: string;
}

interface OllamaChatChunk {
  error?: string;
  done?: boolean;
  message?: {
    role?: string;
    content?: string;
  };
}

interface StreamChatResult {
  content: string;
}

export class OllamaService {
  async checkConnection(baseUrl: string, timeoutMs: number): Promise<CheckResult> {
    const normalizedBaseUrl = normalizeOllamaBaseUrl(baseUrl);

    if (!normalizedBaseUrl) {
      return {
        reachable: false,
        normalizedBaseUrl,
        models: [],
        message: '请先填写 Ollama 服务地址。'
      };
    }

    try {
      const response = await axios.get<{ models?: Array<Record<string, unknown>> }>(
        buildOllamaApiUrl(normalizedBaseUrl, 'tags'),
        {
          timeout: timeoutMs
        }
      );

      const models = (response.data.models ?? []).map((item) => this.mapOllamaModel(item));

      return {
        reachable: true,
        normalizedBaseUrl,
        models,
        message: models.length > 0 ? '连接成功，已获取模型列表。' : '连接成功，但没有返回可用模型。'
      };
    } catch (error) {
      const message =
        error instanceof AxiosError
          ? error.message
          : error instanceof Error
            ? error.message
            : '连接失败。';

      return {
        reachable: false,
        normalizedBaseUrl,
        models: [],
        message
      };
    }
  }

  async generatePuzzle(supplier: OllamaSupplier | null, model: string, request: PuzzleGenerationRequest): Promise<Puzzle> {
    const selectedModel = model.trim();

    if (!supplier?.baseUrl || !selectedModel) {
      return this.generateFallbackPuzzle(request);
    }

    try {
      const { content } = await this.streamChat(supplier, {
        model: selectedModel,
        messages: [
          {
            role: 'system',
            content: [
              'You are generating a turtle soup mystery puzzle.',
              'Return JSON only.',
              'The puzzle must be logically solvable through yes/no questions.',
              'Do not use supernatural answers unless explicitly requested.',
              'Facts must stay internally consistent and should support later judging.'
            ].join('\n')
          },
          {
            role: 'user',
            content: JSON.stringify(
              {
                task: 'generate-puzzle',
                request,
                outputShape: {
                  title: 'string',
                  soupSurface: 'string',
                  truthStory: 'string',
                  facts: [
                    {
                      factId: 'string',
                      statement: 'string',
                      importance: 1,
                      discoverable: true,
                      keywords: ['string']
                    }
                  ],
                  misleadingPoints: ['string'],
                  keyTriggers: ['string'],
                  difficulty: request.difficulty,
                  tags: ['string']
                }
              },
              null,
              2
            )
          }
        ]
      });

      const parsed = this.parseStructuredJson(content, generatedPuzzleSchema);

      return {
        puzzleId: `generated-${nanoid(12)}`,
        title: parsed.title,
        soupSurface: parsed.soupSurface,
        truthStory: parsed.truthStory,
        facts: parsed.facts.map((fact, index) => ({
          factId: fact.factId?.trim() || `fact-${index + 1}`,
          statement: fact.statement,
          importance: fact.importance,
          discoverable: fact.discoverable,
          keywords: this.ensureKeywords(fact.statement, fact.keywords)
        })),
        misleadingPoints: parsed.misleadingPoints,
        keyTriggers: parsed.keyTriggers,
        difficulty: parsed.difficulty,
        tags: parsed.tags.length > 0 ? parsed.tags : ['dynamic']
      };
    } catch {
      return this.generateFallbackPuzzle(request);
    }
  }

  async evaluateQuestion(supplier: OllamaSupplier | null, model: string, puzzle: Puzzle, context: RoomContext, question: string) {
    const selectedModel = model.trim();

    if (!supplier?.baseUrl || !selectedModel) {
      return this.evaluateQuestionHeuristically(puzzle, context, question);
    }

    try {
      const { content } = await this.streamChat(supplier, {
        model: selectedModel,
        messages: [
          {
            role: 'system',
            content: [
              'You are the strict host of a turtle soup mystery.',
              'You must judge only from the supplied truth.',
              'Never invent new facts.',
              'Return JSON only.'
            ].join('\n')
          },
          {
            role: 'user',
            content: JSON.stringify(
              {
                task: 'judge-question',
                question,
                puzzle,
                context,
                rules: [
                  'If the question aligns with known truth, answer yes.',
                  'If it contradicts known truth, answer no.',
                  'If it only partially overlaps with truth, answer partial.',
                  'If it does not help solve the mystery, answer irrelevant.',
                  'Use unknown only when the wording is impossible to disambiguate.'
                ],
                outputShape: {
                  answerCode: 'yes|no|irrelevant|partial|unknown',
                  matchedFactIds: ['fact-id'],
                  revealedFactIds: ['fact-id'],
                  progressDelta: 0,
                  reasoning: 'short reason'
                }
              },
              null,
              2
            )
          }
        ]
      });

      const parsed = this.parseStructuredJson(content, questionSchema);

      return {
        ...parsed,
        matchedFactIds: unique(parsed.matchedFactIds).filter((factId) =>
          puzzle.facts.some((fact) => fact.factId === factId)
        ),
        revealedFactIds: unique(parsed.revealedFactIds).filter((factId) =>
          puzzle.facts.some((fact) => fact.factId === factId)
        ),
        source: 'ollama'
      } satisfies QuestionEvaluation;
    } catch {
      return this.evaluateQuestionHeuristically(puzzle, context, question);
    }
  }

  async evaluateFinalGuess(supplier: OllamaSupplier | null, model: string, puzzle: Puzzle, context: RoomContext, guess: string) {
    const selectedModel = model.trim();

    if (!supplier?.baseUrl || !selectedModel) {
      return this.evaluateGuessHeuristically(puzzle, guess);
    }

    try {
      const { content } = await this.streamChat(supplier, {
        model: selectedModel,
        messages: [
          {
            role: 'system',
            content: [
              'You are evaluating the final answer in a turtle soup game.',
              'Judge only against the supplied truth story and facts.',
              'Return JSON only.'
            ].join('\n')
          },
          {
            role: 'user',
            content: JSON.stringify(
              {
                task: 'judge-final-guess',
                guess,
                puzzle,
                context,
                outputShape: {
                  accepted: true,
                  score: 0,
                  missingPoints: ['point'],
                  reasoning: 'short reason'
                }
              },
              null,
              2
            )
          }
        ]
      });

      const parsed = this.parseStructuredJson(content, guessSchema);

      return {
        ...parsed,
        source: 'ollama'
      } satisfies GuessEvaluation;
    } catch {
      return this.evaluateGuessHeuristically(puzzle, guess);
    }
  }

  private async streamChat(supplier: OllamaSupplier, options: { model: string; messages: OllamaChatMessage[] }): Promise<StreamChatResult> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), supplier.timeoutMs);

    try {
      const response = await fetch(buildOllamaApiUrl(supplier.baseUrl, 'chat'), {
        method: 'POST',
        headers: {
          'content-type': 'application/json'
        },
        body: JSON.stringify({
          model: options.model,
          stream: true,
          format: 'json',
          messages: options.messages
        }),
        signal: controller.signal
      });

      if (!response.ok) {
        throw new Error((await response.text()) || `Ollama stream request failed with ${response.status}.`);
      }

      if (!response.body) {
        throw new Error('Ollama did not return a readable stream.');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let content = '';

      const processLine = (line: string) => {
        const trimmed = line.trim();

        if (!trimmed) {
          return;
        }

        const chunk = JSON.parse(trimmed) as OllamaChatChunk;

        if (typeof chunk.error === 'string' && chunk.error.trim()) {
          throw new Error(chunk.error);
        }

        if (typeof chunk.message?.content === 'string') {
          content += chunk.message.content;
        }
      };

      while (true) {
        const { done, value } = await reader.read();
        buffer += decoder.decode(value ?? new Uint8Array(), { stream: !done });

        let newlineIndex = buffer.indexOf('\n');

        while (newlineIndex !== -1) {
          const line = buffer.slice(0, newlineIndex);
          buffer = buffer.slice(newlineIndex + 1);
          processLine(line);
          newlineIndex = buffer.indexOf('\n');
        }

        if (done) {
          break;
        }
      }

      if (buffer.trim()) {
        processLine(buffer);
      }

      return {
        content: content.trim()
      };
    } finally {
      clearTimeout(timeoutId);
    }
  }

  private parseStructuredJson<T>(raw: string, schema: z.ZodType<T>) {
    const normalized = raw.trim();
    const candidates = [
      normalized,
      normalized.replace(/^```json\s*/iu, '').replace(/^```\s*/u, '').replace(/\s*```$/u, '').trim(),
      this.extractJsonBlock(normalized)
    ].filter((item): item is string => Boolean(item));

    for (const candidate of candidates) {
      try {
        return schema.parse(JSON.parse(candidate));
      } catch {
        // Keep trying with the next normalized candidate.
      }
    }

    throw new Error('Unable to parse structured JSON from Ollama stream output.');
  }

  private extractJsonBlock(value: string) {
    const firstBrace = value.indexOf('{');
    const lastBrace = value.lastIndexOf('}');

    if (firstBrace !== -1 && lastBrace > firstBrace) {
      return value.slice(firstBrace, lastBrace + 1);
    }

    return '';
  }

  private mapOllamaModel(item: Record<string, unknown>): OllamaModel {
    const name = String(item.name ?? item.model ?? '');
    const model = String(item.model ?? item.name ?? '');
    const details =
      item.details && typeof item.details === 'object' ? (item.details as Record<string, unknown>) : undefined;

    return {
      name,
      model,
      family: this.deriveModelFamily(name, model),
      category: this.deriveModelCategory(name, model),
      size: Number(item.size ?? 0),
      modifiedAt: String(item.modified_at ?? ''),
      parameterSize: details ? String(details.parameter_size ?? '') : undefined,
      quantizationLevel: details ? String(details.quantization_level ?? '') : undefined
    };
  }

  private deriveModelFamily(name: string, model: string) {
    return (name || model).split(':')[0]?.trim() || name || model || 'unknown';
  }

  private deriveModelCategory(name: string, model: string): Exclude<ModelCategory, 'all'> {
    const normalized = `${name} ${model}`.toLowerCase();

    if (/embed|embedding|rerank/u.test(normalized)) {
      return 'other';
    }

    if (/vision|llava|vl\b|moondream|minicpm-v|bakllava/u.test(normalized)) {
      return 'multimodal';
    }

    if (/r1\b|qwq|reason|thinking|think/u.test(normalized)) {
      return 'reasoning';
    }

    if (/\b0\.5b\b|\b1\.5b\b|\b1b\b|\b2b\b|\b3b\b|\b4b\b|\b7b\b|mini|small|tiny/u.test(normalized)) {
      return 'lightweight';
    }

    return 'balanced';
  }

  private evaluateQuestionHeuristically(puzzle: Puzzle, context: RoomContext, question: string): QuestionEvaluation {
    const normalizedQuestion = normalizeText(question);
    const matchedFacts = puzzle.facts.filter((fact) =>
      fact.keywords.some((keyword) => normalizedQuestion.includes(normalizeText(keyword)))
    );

    const revealedFactIds = matchedFacts
      .filter((fact) => fact.discoverable && !context.revealedFactIds.includes(fact.factId))
      .map((fact) => fact.factId);

    if (matchedFacts.length === 0) {
      return {
        answerCode: 'irrelevant',
        matchedFactIds: [],
        revealedFactIds: [],
        progressDelta: 0,
        reasoning: '没有找到与问题明确对应的事实。',
        source: 'heuristic'
      };
    }

    const importance = matchedFacts.reduce((total, fact) => total + fact.importance, 0);
    const answerCode = /\b(no|not|never|without)\b|不是|并非|没有/u.test(question) ? 'partial' : 'yes';

    return {
      answerCode,
      matchedFactIds: matchedFacts.map((fact) => fact.factId),
      revealedFactIds,
      progressDelta: Math.min(24, Math.max(4, Math.round(importance / matchedFacts.length))),
      reasoning: '问题命中了题面事实关键词。',
      source: 'heuristic'
    };
  }

  private evaluateGuessHeuristically(puzzle: Puzzle, guess: string): GuessEvaluation {
    const normalizedGuess = normalizeText(guess);
    const matchedFacts = puzzle.facts.filter((fact) =>
      fact.keywords.some((keyword) => normalizedGuess.includes(normalizeText(keyword)))
    );
    const totalImportance = puzzle.facts.reduce((total, fact) => total + fact.importance, 0);
    const matchedImportance = matchedFacts.reduce((total, fact) => total + fact.importance, 0);
    const score = totalImportance === 0 ? 0 : Math.round((matchedImportance / totalImportance) * 100);

    return {
      accepted: score >= 70,
      score,
      missingPoints: puzzle.facts
        .filter((fact) => !matchedFacts.some((matched) => matched.factId === fact.factId))
        .map((fact) => fact.statement)
        .slice(0, 3),
      reasoning: '根据最终猜测覆盖到的事实关键词估算得分。',
      source: 'heuristic'
    };
  }

  private ensureKeywords(statement: string, keywords: string[]) {
    const explicit = keywords.filter((item) => item.trim().length > 0);

    if (explicit.length > 0) {
      return unique(explicit);
    }

    const stopWords = new Set([
      'the',
      'and',
      'for',
      'with',
      'that',
      'this',
      'from',
      'were',
      'been',
      'have',
      'has',
      'had',
      'into',
      'onto',
      'your',
      'about',
      'there',
      'their',
      'them',
      'they',
      'what',
      'when',
      'where',
      'which',
      'while'
    ]);
    const fragments = statement
      .replace(/[，。、“”"':：；！？()（）]/g, ' ')
      .split(/\s+/)
      .map((item) => item.trim())
      .filter((item) => {
        const normalized = item.toLowerCase();
        const hasChinese = /[\u4e00-\u9fff]/u.test(item);

        if (hasChinese) {
          return normalized.length >= 2;
        }

        return normalized.length >= 4 && !stopWords.has(normalized);
      });

    return unique(fragments).slice(0, 8);
  }

  private generateFallbackPuzzle(request: PuzzleGenerationRequest): Puzzle {
    const prompt = request.prompt.trim() || '都市、心理、误导性强';
    const templates = [
      {
        title: '消失的请假条',
        soupSurface: '一个学生明明拿到了准假，却在回家路上主动报警。',
        truthStory:
          '学生原本打算装病逃课，班主任看穿后仍然批了假，因为她在请假条背面写下了“你父亲正在学校找你”。学生回家路上意识到父亲根本不在城里，于是判断有人冒充家长进入了学校，立刻报警。',
        facts: [
          '学生本来想装病逃课。',
          '班主任其实识破了学生的借口。',
          '班主任批假是为了让学生尽快离开危险区域。',
          '关键线索写在请假条背面。',
          '有人冒充学生父亲进入了学校。',
          '学生报警是因为意识到存在冒名者。'
        ],
        misleadingPoints: ['表面像是学生心虚，实际上是老师在暗中保护他。'],
        keyTriggers: ['请假条上是否还有别的信息？', '报警和父亲有关吗？'],
        tags: ['校园', '身份伪装']
      },
      {
        title: '没响的闹钟',
        soupSurface: '男人醒来后发现闹钟没响，立刻把早餐扔进垃圾桶。',
        truthStory:
          '男人是一名火车司机，前一天参加了应急演练，知道凌晨会有一次全城测试警报代替闹钟。如果闹钟没响但他却自然醒来，就说明外面的警报已经响过，而他所在的房间做了隔音处理。早餐是酒店送来的，意味着有人故意把他隔离在这里不想让他去上班，于是他意识到列车可能被人动过手脚，立刻中止行程并报警。',
        facts: [
          '男人的职业和准点上班高度相关。',
          '前一天有关于警报的应急演练。',
          '自然醒来而非闹钟叫醒是异常线索。',
          '房间隔音意味着有人有意隔离他。',
          '早餐是别人提前安排好的。',
          '他怀疑有人想让列车在没有他的情况下出发。'
        ],
        misleadingPoints: ['看似讨厌早餐，实际上早餐只是被困的证明。'],
        keyTriggers: ['闹钟以外是否还有叫醒机制？', '早餐和职业有关吗？'],
        tags: ['都市', '职业']
      },
      {
        title: '被退回的照片',
        soupSurface: '女人把刚洗出来的照片全部退回，却对老板说“谢谢你救了我”。',
        truthStory:
          '女人长期被前男友跟踪，对方一直不知道她已经结婚。照相馆老板发现照片里的反光处总是出现同一个陌生男人，而且每张照片的拍摄角度都像是被远距离偷拍，于是故意说底片损坏，阻止照片外流，并提醒她注意安全。女人回家复盘后意识到自己被跟踪，这才明白老板是在保护她。',
        facts: [
          '女人处在被跟踪的危险中。',
          '照片反光里反复出现同一个陌生男人。',
          '老板退回照片是为了防止风险扩大。',
          '真正关键的是照片里的背景细节。',
          '老板在不惊动跟踪者的前提下提醒了她。',
          '女人后来才理解老板的用意。'
        ],
        misleadingPoints: ['看似是服务问题，实际上是安全预警。'],
        keyTriggers: ['照片里是否藏着危险信息？', '老板是不是提前看到了什么？'],
        tags: ['现实', '悬疑']
      }
    ];

    const selected = templates[Math.abs([...prompt].reduce((total, char) => total + char.charCodeAt(0), 0)) % templates.length];

    return {
      puzzleId: `generated-${nanoid(12)}`,
      title: `${selected.title} ${request.difficulty.toUpperCase()}`,
      soupSurface: selected.soupSurface,
      truthStory: selected.truthStory,
      facts: selected.facts.map((statement, index) => ({
        factId: `fact-${index + 1}`,
        statement,
        importance: Math.max(4, 10 - index),
        discoverable: true,
        keywords: this.ensureKeywords(statement, [])
      })),
      misleadingPoints: [...selected.misleadingPoints, `生成提示词：${prompt}`],
      keyTriggers: selected.keyTriggers,
      difficulty: request.difficulty,
      tags: unique([...selected.tags, 'dynamic', prompt.slice(0, 12)])
    };
  }
}
