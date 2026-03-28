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
    .min(5),
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

const hintSchema = z.object({
  hint: z.string().min(6).max(120)
});

const puzzleAuditSchema = z.object({
  valid: z.boolean(),
  coherenceScore: z.number().int().min(0).max(100).default(0),
  reasons: z.array(z.string()).default([])
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

interface StreamChatOptions {
  model: string;
  messages: OllamaChatMessage[];
  format?: 'json';
  options?: Record<string, unknown>;
}

interface GenerationBlueprint {
  noveltyToken: string;
  setting: string;
  atmosphere: string;
  relationship: string;
  contradiction: string;
  hiddenMechanism: string;
  pressure: string;
  keyObject: string;
  redHerring: string;
  revealAnchor: string;
}

const EASY_SETTINGS = ['校园', '办公室', '家庭', '便利店', '小区', '餐馆', '商场'];
const MEDIUM_SETTINGS = ['现代都市', '医院', '旅馆', '摄影棚', '短途列车', '演出后台', '旅游大巴'];
const HARD_SETTINGS = ['心理咨询室', '档案馆', '停运车站', '航运码头', '实验楼', '闭馆展厅', '深夜值班室'];

const ATMOSPHERES = ['现实向', '压抑克制', '表面平静', '带轻微悬疑', '误导性很强', '像日常小事'];
const RELATIONSHIPS = ['同事之间', '师生之间', '家人之间', '陌生人之间', '前任与现任之间', '雇主与员工之间'];
const CONTRADICTIONS = [
  '主角看起来像在害人，其实是在保护人',
  '主角看起来像在逃避，其实是在求救',
  '旁观者以为是意外，其实是提前识破了危险',
  '表面像情绪失控，实际上是对隐藏线索的准确反应',
  '看起来像服务失误，其实是刻意中断风险'
];
const HIDDEN_MECHANISMS = [
  '身份被冒用',
  '时间差造成误判',
  '声音或影像是延迟出现的',
  '有人故意制造了错误印象',
  '关键证据藏在普通物件里',
  '主角提前知道一条外人不知道的规则'
];
const PRESSURES = ['必须在几分钟内决定', '如果继续原计划会出大事', '不能直接说破真相', '一旦打草惊蛇后果更糟'];
const KEY_OBJECTS = ['照片', '请假条', '闹钟', '外卖袋', '旧门卡', '车票', '录音', '药盒', '收据', '工牌'];
const RED_HERRINGS = ['像感情纠纷', '像服务事故', '像主角撒谎', '像单纯的误会', '像报复行为'];
const REVEAL_ANCHORS = ['背景反光', '时间点对不上', '物件位置异常', '一句看似多余的话', '重复出现的小动作', '被刻意忽略的职业信息'];

type FallbackBuilder = (request: PuzzleGenerationRequest, blueprint: GenerationBlueprint) => Puzzle;

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

  async generatePuzzle(
    supplier: OllamaSupplier | null,
    model: string,
    request: PuzzleGenerationRequest,
    auditOptions?: {
      supplier?: OllamaSupplier | null;
      model?: string;
    }
  ): Promise<Puzzle> {
    const selectedModel = model.trim();
    const blueprint = this.createGenerationBlueprint(request);
    const auditSupplier =
      auditOptions?.supplier?.baseUrl && auditOptions.model?.trim()
        ? auditOptions.supplier
        : supplier;
    const auditModel = auditOptions?.model?.trim() || selectedModel;

    if (!supplier?.baseUrl || !selectedModel) {
      return this.generateFallbackPuzzle(request, blueprint);
    }

    let lastFailureReason = 'AI 生成题目未通过校验，请重试。';

    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        const parsed = await this.requestStructuredOutput(
          supplier,
          selectedModel,
          generatedPuzzleSchema,
          this.buildGenerationMessages(request, blueprint, attempt > 0),
          {
          temperature: 0.95,
          top_p: 0.92,
          repeat_penalty: 1.08,
          num_ctx: 12_288,
          num_predict: 1_400
          }
        );
        const puzzle = this.normalizeGeneratedPuzzle(parsed, request, blueprint);
        const localAudit = this.auditGeneratedPuzzleLocally(puzzle, request, blueprint);

        if (!localAudit.valid) {
          lastFailureReason = localAudit.reasons[0] ?? lastFailureReason;
          continue;
        }

        const remoteAudit = await this.auditGeneratedPuzzleWithModel(auditSupplier, auditModel, request, blueprint, puzzle);

        if (remoteAudit.valid) {
          return puzzle;
        }

        lastFailureReason = remoteAudit.reasons[0] ?? lastFailureReason;
      } catch (error) {
        lastFailureReason = error instanceof Error ? error.message : lastFailureReason;
      }
    }

    throw new Error(lastFailureReason);
  }

  async generateHint(supplier: OllamaSupplier | null, model: string, puzzle: Puzzle, context: RoomContext) {
    const selectedModel = model.trim();
    const fallbackHint = this.buildFallbackHint(puzzle, context);

    if (!supplier?.baseUrl || !selectedModel) {
      return {
        hint: fallbackHint,
        source: 'heuristic' as const
      };
    }

    try {
      const parsed = await this.requestStructuredOutput(
        supplier,
        selectedModel,
        hintSchema,
        this.buildHintMessages(puzzle, context),
        {
          temperature: 0.3,
          top_p: 0.9,
          repeat_penalty: 1.03,
          num_ctx: 12_288,
          num_predict: 220
        }
      );
      const normalizedHint = parsed.hint.trim();

      return this.isHintSafe(normalizedHint, puzzle)
        ? {
            hint: normalizedHint,
            source: 'ollama' as const
          }
        : {
            hint: fallbackHint,
            source: 'heuristic' as const
          };
    } catch {
      return {
        hint: fallbackHint,
        source: 'heuristic' as const
      };
    }
  }

  async evaluateQuestion(
    supplier: OllamaSupplier | null,
    model: string,
    puzzle: Puzzle,
    context: RoomContext,
    question: string
  ) {
    const selectedModel = model.trim();

    if (!supplier?.baseUrl || !selectedModel) {
      return this.evaluateQuestionHeuristically(puzzle, context, question);
    }

    try {
      const parsed = await this.requestStructuredOutput(
        supplier,
        selectedModel,
        questionSchema,
        this.buildQuestionMessages(puzzle, context, question),
        {
          temperature: 0.15,
          top_p: 0.9,
          repeat_penalty: 1.02,
          num_ctx: 12_288,
          num_predict: 500
        }
      );

      return {
        ...parsed,
        matchedFactIds: unique(parsed.matchedFactIds).filter((factId) => puzzle.facts.some((fact) => fact.factId === factId)),
        revealedFactIds: unique(parsed.revealedFactIds).filter((factId) =>
          puzzle.facts.some((fact) => fact.factId === factId && fact.discoverable)
        ),
        source: 'ollama'
      } satisfies QuestionEvaluation;
    } catch {
      return this.evaluateQuestionHeuristically(puzzle, context, question);
    }
  }

  async evaluateFinalGuess(
    supplier: OllamaSupplier | null,
    model: string,
    puzzle: Puzzle,
    context: RoomContext,
    guess: string
  ) {
    const selectedModel = model.trim();

    if (!supplier?.baseUrl || !selectedModel) {
      return this.evaluateGuessHeuristically(puzzle, guess);
    }

    try {
      const parsed = await this.requestStructuredOutput(
        supplier,
        selectedModel,
        guessSchema,
        this.buildFinalGuessMessages(puzzle, context, guess),
        {
          temperature: 0.12,
          top_p: 0.88,
          repeat_penalty: 1.02,
          num_ctx: 12_288,
          num_predict: 650
        }
      );

      return {
        ...parsed,
        missingPoints: parsed.missingPoints.filter((item) => item.trim().length > 0).slice(0, 4),
        source: 'ollama'
      } satisfies GuessEvaluation;
    } catch {
      return this.evaluateGuessHeuristically(puzzle, guess);
    }
  }

  private async requestStructuredOutput<T>(
    supplier: OllamaSupplier,
    model: string,
    schema: z.ZodType<T>,
    messages: OllamaChatMessage[],
    options: Record<string, unknown>
  ) {
    let lastError: unknown = null;
    const attempts: OllamaChatMessage[][] = [
      messages,
      [
        ...messages,
        {
          role: 'user',
          content: [
            'Your last answer was not accepted.',
            'Return exactly one valid JSON object.',
            'No markdown, no comments, no extra prose, no code fences.'
          ].join('\n')
        }
      ]
    ];

    for (const attemptMessages of attempts) {
      try {
        const { content } = await this.streamChat(supplier, {
          model,
          messages: attemptMessages,
          format: 'json',
          options
        });

        return this.parseStructuredJson(content, schema);
      } catch (error) {
        lastError = error;
      }
    }

    throw lastError ?? new Error('Unable to obtain structured JSON output.');
  }

  private buildGenerationMessages(
    request: PuzzleGenerationRequest,
    blueprint: GenerationBlueprint,
    retryMode = false
  ): OllamaChatMessage[] {
    return [
      {
        role: 'system',
        content: [
          'You design original turtle soup mysteries for Chinese-speaking players.',
          'Write all natural-language fields in Simplified Chinese.',
          'Return JSON only.',
          'The puzzle must be solvable through careful yes/no questioning.',
          'Avoid stale stock plots unless they are clearly subverted.',
          'Do not use supernatural explanations, dream endings, or pure coincidence.',
          'Soup surface, truth story, facts, and key triggers must all be mutually consistent.',
          'The soup surface must describe the same event that the truth story fully explains.',
          'Use the same concrete anchors across the entire puzzle, not different unrelated stories.',
          'The truth story must describe one concrete incident, not an abstract summary of reasoning or professional judgment.',
          'Reject vague templates such as "the protagonist noticed something was wrong and interrupted the process" unless you explain the exact event in detail.',
          ...(retryMode
            ? [
                'The previous draft was rejected for inconsistency.',
                'Rebuild the puzzle from scratch and keep every field tied to one single causal chain.',
                'Make the truth story more concrete, more event-driven, and less generic than before.'
              ]
            : [])
        ].join('\n')
      },
      {
        role: 'user',
        content: [
          'Task: generate one original turtle soup puzzle.',
          '',
          `Difficulty: ${request.difficulty}`,
          `User theme preference: ${request.prompt.trim() || '随机主题，用户没有额外要求'}`,
          '',
          'Creative brief:',
          `- Setting: ${blueprint.setting}`,
          `- Atmosphere: ${blueprint.atmosphere}`,
          `- Relationship focus: ${blueprint.relationship}`,
          `- Surface contradiction: ${blueprint.contradiction}`,
          `- Hidden mechanism: ${blueprint.hiddenMechanism}`,
          `- Immediate pressure: ${blueprint.pressure}`,
          `- Key object: ${blueprint.keyObject}`,
          `- Red-herring flavor: ${blueprint.redHerring}`,
          `- Reveal anchor: ${blueprint.revealAnchor}`,
          `- Novelty token: ${blueprint.noveltyToken}`,
          '',
          'Output requirements:',
          '- title: memorable, not generic',
          '- soupSurface: 1-2 concise sentences, strange but fair, no direct spoiler',
          '- truthStory: complete causal chain, clearly explain why the surface happened',
          '- soupSurface and truthStory must point to the same people, event, and hidden mechanism',
          '- at least one anchor from setting / key object / reveal anchor should appear in both soupSurface and truthStory',
          '- truthStory must include a concrete trigger, a concrete action, and a concrete outcome',
          '- truthStory must not stop at abstract phrases like "the protagonist knew a rule" or "there was risk in the process"',
          '- explain what actually happened to whom, where, and why',
          '- facts: 5-8 canonical facts with concrete wording',
          '- every fact must support the same story, not introduce a separate subplot',
          '- misleadingPoints: 2-4 believable but wrong assumptions players may make',
          '- keyTriggers: 2-4 good yes/no question directions',
          '- difficulty must match the requested difficulty',
          '- tags should be short Chinese labels',
          '',
          'JSON shape:',
          JSON.stringify(
            {
              title: 'string',
              soupSurface: 'string',
              truthStory: 'string',
              facts: [
                {
                  factId: 'fact-1',
                  statement: 'string',
                  importance: 8,
                  discoverable: true,
                  keywords: ['string']
                }
              ],
              misleadingPoints: ['string'],
              keyTriggers: ['string'],
              difficulty: request.difficulty,
              tags: ['string']
            },
            null,
            2
          )
        ].join('\n')
      }
    ];
  }

  private buildPuzzleAuditMessages(
    request: PuzzleGenerationRequest,
    blueprint: GenerationBlueprint,
    puzzle: Puzzle
  ): OllamaChatMessage[] {
    return [
      {
        role: 'system',
        content: [
          'You are auditing a turtle soup puzzle before it is published.',
          'Return JSON only.',
          'Be strict: reject any puzzle whose soup surface, truth story, and facts do not describe the same event chain.',
          'Reject abstract truth stories that only summarize reasoning, profession, or vague risk without a concrete incident.',
          'Reject any puzzle where facts drift away from the soup surface or introduce a different story.'
        ].join('\n')
      },
      {
        role: 'user',
        content: [
          'Task: decide whether this puzzle is playable as a coherent turtle soup mystery.',
          '',
          `Requested difficulty: ${request.difficulty}`,
          `User theme preference: ${request.prompt.trim() || '随机主题，用户没有额外要求'}`,
          `Blueprint setting: ${blueprint.setting}`,
          `Blueprint key object: ${blueprint.keyObject}`,
          `Blueprint reveal anchor: ${blueprint.revealAnchor}`,
          '',
          'Candidate puzzle JSON:',
          JSON.stringify(puzzle, null, 2),
          '',
          'Audit rules:',
          '1. Soup surface, truth story, and facts must describe one single concrete incident.',
          '2. Truth story must contain specific event details, not only abstract explanation.',
          '3. Facts must support the same incident and should not feel like a different story.',
          '4. If the truth story could not be acted out as a specific scene, reject it.',
          '',
          'JSON shape:',
          JSON.stringify(
            {
              valid: true,
              coherenceScore: 0,
              reasons: ['short Chinese reason']
            },
            null,
            2
          )
        ].join('\n')
      }
    ];
  }

  private buildHintMessages(puzzle: Puzzle, context: RoomContext): OllamaChatMessage[] {
    const unrevealedFacts = puzzle.facts
      .filter((fact) => fact.discoverable && !context.revealedFactIds.includes(fact.factId))
      .map((fact) => `- [${fact.factId}] importance=${fact.importance}; statement=${fact.statement}`)
      .join('\n');

    return [
      {
        role: 'system',
        content: [
          'You are a careful turtle soup host.',
          'Return JSON only.',
          'Write the hint in Simplified Chinese.',
          'Give a directional hint, not the answer.',
          'Do not reveal the exact truth story.',
          'Do not quote canonical facts verbatim.',
          'Do not mention murderer, culprit, identity, or the final twist explicitly unless they are already obvious from the public surface.'
        ].join('\n')
      },
      {
        role: 'user',
        content: [
          'Task: produce one short non-spoiler hint for the current room.',
          '',
          this.buildPuzzleDossier(puzzle, context),
          '',
          `Hints already used in this room: ${context.hintUsageCount}`,
          `Suggested yes/no trigger directions: ${puzzle.keyTriggers.join(' / ') || 'none'}`,
          'Unrevealed discoverable facts:',
          unrevealedFacts || '- none',
          '',
          'Hint requirements:',
          '- 1 or 2 short sentences',
          '- push players toward a better questioning direction',
          '- do not copy any fact statement verbatim',
          '- do not state the answer directly',
          '',
          'JSON shape:',
          JSON.stringify(
            {
              hint: 'string'
            },
            null,
            2
          )
        ].join('\n')
      }
    ];
  }

  private buildQuestionMessages(puzzle: Puzzle, context: RoomContext, question: string): OllamaChatMessage[] {
    return [
      {
        role: 'system',
        content: [
          'You are a rigorous turtle soup host and referee.',
          'Judge only from the canonical puzzle dossier.',
          'Common sense must not override the dossier.',
          'Soup surface is player-facing setup; truth story and facts are authoritative.',
          'You may use unrevealed facts to judge yes/no, but only reveal discoverable facts.',
          'Prefer "irrelevant" for questions that do not help solve the core mystery.',
          'Prefer "unknown" only when the wording is too ambiguous to judge fairly.',
          'Return JSON only.'
        ].join('\n')
      },
      {
        role: 'user',
        content: [
          'Task: judge a player question.',
          '',
          this.buildPuzzleDossier(puzzle, context),
          '',
          'Current question:',
          question,
          '',
          'Judging rules:',
          '1. If the question matches the truth, answer yes.',
          '2. If the question contradicts the truth, answer no.',
          '3. If only part of it is right, answer partial.',
          '4. If it is off-track or too detached from the mystery, answer irrelevant.',
          '5. Use unknown only when the question is structurally ambiguous.',
          '6. Reveal at most 2 discoverable facts in one answer.',
          '',
          'JSON shape:',
          JSON.stringify(
            {
              answerCode: 'yes|no|irrelevant|partial|unknown',
              matchedFactIds: ['fact-id'],
              revealedFactIds: ['fact-id'],
              progressDelta: 0,
              reasoning: 'short reason in Chinese'
            },
            null,
            2
          )
        ].join('\n')
      }
    ];
  }

  private buildFinalGuessMessages(puzzle: Puzzle, context: RoomContext, guess: string): OllamaChatMessage[] {
    return [
      {
        role: 'system',
        content: [
          'You are evaluating the final reconstruction in a turtle soup game.',
          'Judge only against the canonical puzzle dossier.',
          'The player does not need every sentence to be identical, but the causal chain must be substantially correct.',
          'If a guess misses a core turning point, the score must stay clearly below passing.',
          'Return JSON only.'
        ].join('\n')
      },
      {
        role: 'user',
        content: [
          'Task: score the player final guess.',
          '',
          this.buildPuzzleDossier(puzzle, context),
          '',
          'Player final guess:',
          guess,
          '',
          'Scoring rubric:',
          '- accepted = true only if the major causal chain is correct.',
          '- score should reflect how many core facts are covered.',
          '- missingPoints should mention the most important missing or wrong points.',
          '- Keep reasoning concise and in Chinese.',
          '',
          'JSON shape:',
          JSON.stringify(
            {
              accepted: true,
              score: 0,
              missingPoints: ['point'],
              reasoning: 'short reason in Chinese'
            },
            null,
            2
          )
        ].join('\n')
      }
    ];
  }

  private buildPuzzleDossier(puzzle: Puzzle, context: RoomContext) {
    const revealedSet = new Set(context.revealedFactIds);
    const recentHistory = context.questionHistory.slice(-10);
    const factsSection = puzzle.facts
      .map(
        (fact) =>
          `- [${fact.factId}] importance=${fact.importance}; discoverable=${fact.discoverable ? 'yes' : 'no'}; revealed=${
            revealedSet.has(fact.factId) ? 'yes' : 'no'
          }; statement=${fact.statement}`
      )
      .join('\n');
    const historySection =
      recentHistory.length > 0
        ? recentHistory.map((item, index) => `${index + 1}. Q=${item.question} | A=${item.answerCode}`).join('\n')
        : 'none';

    return [
      'Canonical puzzle dossier:',
      `Title: ${puzzle.title}`,
      `Soup surface: ${puzzle.soupSurface}`,
      `Truth story: ${puzzle.truthStory}`,
      `Tags: ${puzzle.tags.join(' / ') || 'none'}`,
      `Key triggers: ${puzzle.keyTriggers.join(' / ') || 'none'}`,
      `Misleading points: ${puzzle.misleadingPoints.join(' / ') || 'none'}`,
      '',
      'Canonical facts:',
      factsSection,
      '',
      `Already revealed fact ids: ${context.revealedFactIds.join(', ') || 'none'}`,
      `Current progress score: ${context.progressScore}`,
      'Recent question history:',
      historySection
    ].join('\n');
  }

  private normalizeGeneratedPuzzle(
    parsed: z.infer<typeof generatedPuzzleSchema>,
    request: PuzzleGenerationRequest,
    blueprint: GenerationBlueprint
  ): Puzzle {
    const promptTags = this.extractPromptFragments(request.prompt);

    return {
      puzzleId: `generated-${nanoid(12)}`,
      title: parsed.title.trim(),
      soupSurface: parsed.soupSurface.trim(),
      truthStory: parsed.truthStory.trim(),
      facts: parsed.facts.map((fact, index) => ({
        factId: fact.factId?.trim() || `fact-${index + 1}`,
        statement: fact.statement.trim(),
        importance: fact.importance,
        discoverable: fact.discoverable,
        keywords: this.ensureKeywords(fact.statement, fact.keywords)
      })),
      misleadingPoints: unique(parsed.misleadingPoints.map((item) => item.trim()).filter(Boolean)).slice(0, 5),
      keyTriggers: unique(parsed.keyTriggers.map((item) => item.trim()).filter(Boolean)).slice(0, 4),
      difficulty: request.difficulty,
      tags: unique([...parsed.tags.map((item) => item.trim()).filter(Boolean), 'dynamic', blueprint.setting, ...promptTags]).slice(0, 8)
    };
  }

  private auditGeneratedPuzzleLocally(puzzle: Puzzle, request: PuzzleGenerationRequest, blueprint: GenerationBlueprint) {
    const reasons: string[] = [];

    if (!this.isGeneratedPuzzleCoherent(puzzle, request, blueprint)) {
      reasons.push('题面、汤底和事实链没有稳定落在同一条因果链上。');
    }

    if (this.isAbstractTruthStory(puzzle.truthStory)) {
      reasons.push('汤底过于抽象，缺少可具体还原的事件经过。');
    }

    if (!this.hasConcreteEventStructure(puzzle)) {
      reasons.push('汤底没有同时交代清楚触发点、人物动作和结果。');
    }

    return {
      valid: reasons.length === 0,
      coherenceScore: reasons.length === 0 ? 100 : Math.max(0, 82 - reasons.length * 22),
      reasons
    };
  }

  private async auditGeneratedPuzzleWithModel(
    supplier: OllamaSupplier | null,
    model: string,
    request: PuzzleGenerationRequest,
    blueprint: GenerationBlueprint,
    puzzle: Puzzle
  ) {
    const selectedModel = model.trim();

    if (!supplier?.baseUrl || !selectedModel) {
      return this.auditGeneratedPuzzleLocally(puzzle, request, blueprint);
    }

    try {
      const parsed = await this.requestStructuredOutput(
        supplier,
        selectedModel,
        puzzleAuditSchema,
        this.buildPuzzleAuditMessages(request, blueprint, puzzle),
        {
          temperature: 0.08,
          top_p: 0.85,
          repeat_penalty: 1.01,
          num_ctx: 12_288,
          num_predict: 300
        }
      );

      return {
        valid: parsed.valid,
        coherenceScore: parsed.coherenceScore,
        reasons: parsed.reasons.filter((item) => item.trim().length > 0).slice(0, 3)
      };
    } catch {
      return this.auditGeneratedPuzzleLocally(puzzle, request, blueprint);
    }
  }

  private isGeneratedPuzzleCoherent(puzzle: Puzzle, request: PuzzleGenerationRequest, blueprint: GenerationBlueprint) {
    const surfaceTokens = new Set(this.extractComparableTokens([puzzle.soupSurface]));
    const truthTokens = new Set(this.extractComparableTokens([puzzle.truthStory]));
    const factTokens = new Set(this.extractComparableTokens(puzzle.facts.map((fact) => `${fact.statement} ${fact.keywords.join(' ')}`)));
    const roomTokens = new Set(
      this.extractComparableTokens([puzzle.title, puzzle.soupSurface, puzzle.truthStory, ...puzzle.tags, blueprint.setting, blueprint.keyObject])
    );
    const promptTokens = this.extractComparableTokens([request.prompt]);
    const anchorTokens = this.extractComparableTokens([blueprint.setting, blueprint.keyObject, blueprint.revealAnchor]);
    const surfaceBridge = this.countSharedTokens(surfaceTokens, truthTokens, factTokens);
    const truthBridge = this.countSharedTokens(truthTokens, surfaceTokens, factTokens);
    const linkedFacts = puzzle.facts.filter((fact) => {
      const factTokensForCurrent = new Set(this.extractComparableTokens([fact.statement, ...fact.keywords]));
      return this.countSharedTokens(factTokensForCurrent, surfaceTokens, truthTokens) > 0;
    }).length;
    const promptAligned = promptTokens.length === 0 || promptTokens.some((token) => roomTokens.has(token));
    const anchorAligned = anchorTokens.some((token) => roomTokens.has(token));

    return surfaceBridge >= 2 && truthBridge >= 2 && linkedFacts >= 3 && promptAligned && anchorAligned;
  }

  private isAbstractTruthStory(truthStory: string) {
    const abstractPatterns = [
      /主角的职业让他知道一种外人不熟悉的判断标准/u,
      /主角在.+中注意到一条只有自己看懂的异常线索/u,
      /故意说出一个会被误解的理由/u,
      /避免对方继续留在危险区域/u,
      /暴露出的风险/u,
      /说明眼前并不是普通.+问题/u,
      /借着.+伪装真正的风险/u,
      /只能先做出那个看似多余的动作/u,
      /真正决定性的线索来自/u,
      /关键不是.+而是.+/u
    ];
    const hits = abstractPatterns.filter((pattern) => pattern.test(truthStory)).length;
    const sentenceCount = truthStory.split(/[。！？]/u).map((item) => item.trim()).filter(Boolean).length;

    return hits >= 2 || (hits >= 1 && sentenceCount <= 2 && truthStory.length < 140);
  }

  private hasConcreteEventStructure(puzzle: Puzzle) {
    const actionSignals = ['报警', '离开', '打断', '打翻', '拒绝', '更换', '锁上', '跟踪', '冒充', '拿走', '送来', '退回', '中断'];
    const outcomeSignals = ['结果', '于是', '因此', '随后', '最后', '为了', '导致', '避免', '阻止', '发现', '意识到'];
    const narrativeText = `${puzzle.soupSurface} ${puzzle.truthStory} ${puzzle.facts.slice(0, 3).map((fact) => fact.statement).join(' ')}`;
    const actionCount = actionSignals.filter((signal) => narrativeText.includes(signal)).length;
    const outcomeCount = outcomeSignals.filter((signal) => narrativeText.includes(signal)).length;

    return actionCount >= 2 && outcomeCount >= 1;
  }

  private buildFallbackHint(puzzle: Puzzle, context: RoomContext) {
    const unusedTriggers = puzzle.keyTriggers.filter((item) => item.trim().length > 0).slice(context.hintUsageCount);

    if (unusedTriggers.length > 0) {
      return `提示：先围绕“${unusedTriggers[0]}”这个方向继续追问，会更接近关键。`;
    }

    const unrevealedFact = puzzle.facts
      .filter((fact) => fact.discoverable && !context.revealedFactIds.includes(fact.factId))
      .sort((left, right) => right.importance - left.importance)[0];

    if (!unrevealedFact) {
      return '提示：这局更值得追问事件触发条件、人物身份和时间顺序，而不是只盯着表面情绪。';
    }

    const keywords = unrevealedFact.keywords.filter((item) => item.trim().length >= 2).slice(0, 2);

    if (keywords.length > 0) {
      return `提示：别急着还原全貌，先围绕“${keywords.join(' / ')}”继续缩小范围。`;
    }

    return '提示：先拆清楚谁掌握了额外信息，以及那个看似普通的细节为什么会触发行动。';
  }

  private isHintSafe(hint: string, puzzle: Puzzle) {
    if (!hint.trim()) {
      return false;
    }

    return ![puzzle.truthStory, ...puzzle.facts.map((fact) => fact.statement)].some((sourceText) =>
      this.hasStrongTextOverlap(hint, sourceText)
    );
  }

  private async streamChat(supplier: OllamaSupplier, options: StreamChatOptions): Promise<StreamChatResult> {
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
          messages: options.messages,
          ...(options.format ? { format: options.format } : {}),
          ...(options.options ? { options: options.options } : {})
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
        // Try the next candidate.
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
    const derivedTerms = this.extractSearchTerms([question]);
    const matchedFacts = puzzle.facts.filter((fact) => this.factMatchesQuestion(fact, normalizedQuestion, derivedTerms));
    const revealedFactIds = matchedFacts
      .filter((fact) => fact.discoverable && !context.revealedFactIds.includes(fact.factId))
      .slice(0, 2)
      .map((fact) => fact.factId);

    if (matchedFacts.length === 0) {
      const isBroadQuestion = derivedTerms.length <= 1 || /为什么|怎么|具体|到底|真相/u.test(question);

      return {
        answerCode: isBroadQuestion ? 'unknown' : 'irrelevant',
        matchedFactIds: [],
        revealedFactIds: [],
        progressDelta: 0,
        reasoning: isBroadQuestion ? '问题过于宽泛，无法仅凭当前信息直接判定。' : '没有命中与谜题核心直接相关的事实。',
        source: 'heuristic'
      };
    }

    const importance = matchedFacts.reduce((total, fact) => total + fact.importance, 0);
    const answerCode = this.resolveHeuristicAnswerCode(question, matchedFacts);

    return {
      answerCode,
      matchedFactIds: matchedFacts.map((fact) => fact.factId),
      revealedFactIds,
      progressDelta: Math.min(24, Math.max(4, Math.round(importance / matchedFacts.length))),
      reasoning: '问题命中了谜题事实中的关键词与核心对象。',
      source: 'heuristic'
    };
  }

  private evaluateGuessHeuristically(puzzle: Puzzle, guess: string): GuessEvaluation {
    const normalizedGuess = normalizeText(guess);
    const guessTerms = this.extractSearchTerms([guess, puzzle.soupSurface]);
    const matchedFacts = puzzle.facts.filter((fact) => this.factMatchesQuestion(fact, normalizedGuess, guessTerms));
    const totalImportance = puzzle.facts.reduce((total, fact) => total + fact.importance, 0);
    const matchedImportance = matchedFacts.reduce((total, fact) => total + fact.importance, 0);
    const score = totalImportance === 0 ? 0 : Math.round((matchedImportance / totalImportance) * 100);

    return {
      accepted: score >= 72,
      score,
      missingPoints: puzzle.facts
        .filter((fact) => !matchedFacts.some((matched) => matched.factId === fact.factId))
        .map((fact) => fact.statement)
        .slice(0, 4),
      reasoning: '根据最终猜测覆盖到的核心事实关键词估算得分。',
      source: 'heuristic'
    };
  }

  private factMatchesQuestion(fact: Puzzle['facts'][number], normalizedQuestion: string, derivedTerms: string[]) {
    const factText = normalizeText([fact.statement, ...fact.keywords].join(' '));

    if (!factText) {
      return false;
    }

    return derivedTerms.some((term) => factText.includes(term)) || fact.keywords.some((keyword) => normalizedQuestion.includes(normalizeText(keyword)));
  }

  private resolveHeuristicAnswerCode(question: string, matchedFacts: Puzzle['facts']) {
    const normalized = normalizeText(question);

    if (/是不是|是否|有关|有关系|有影响|参与|在场|看到|听到/u.test(question)) {
      return 'yes';
    }

    if (/吗/u.test(question) && /\bnot\b|不是|没有|并非|未曾/u.test(normalized)) {
      return 'partial';
    }

    if (matchedFacts.length >= 2) {
      return 'partial';
    }

    return 'yes';
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
        const lowered = item.toLowerCase();
        const hasChinese = /[\u4e00-\u9fff]/u.test(item);

        if (hasChinese) {
          return lowered.length >= 2;
        }

        return lowered.length >= 4 && !stopWords.has(lowered);
      });

    return unique(fragments).slice(0, 8);
  }

  private createGenerationBlueprint(request: PuzzleGenerationRequest): GenerationBlueprint {
    const settings = request.difficulty === 'easy' ? EASY_SETTINGS : request.difficulty === 'hard' ? HARD_SETTINGS : MEDIUM_SETTINGS;

    return {
      noveltyToken: nanoid(6),
      setting: this.pickRandom(settings),
      atmosphere: this.pickRandom(ATMOSPHERES),
      relationship: this.pickRandom(RELATIONSHIPS),
      contradiction: this.pickRandom(CONTRADICTIONS),
      hiddenMechanism: this.pickRandom(HIDDEN_MECHANISMS),
      pressure: this.pickRandom(PRESSURES),
      keyObject: this.pickRandom(KEY_OBJECTS),
      redHerring: this.pickRandom(RED_HERRINGS),
      revealAnchor: this.pickRandom(REVEAL_ANCHORS)
    };
  }

  private generateFallbackPuzzle(request: PuzzleGenerationRequest, blueprint: GenerationBlueprint): Puzzle {
    const builders: FallbackBuilder[] = [
      this.buildFallbackProtectiveLie.bind(this),
      this.buildFallbackImpersonation.bind(this),
      this.buildFallbackRecordedSignal.bind(this),
      this.buildFallbackIsolation.bind(this),
      this.buildFallbackStalkerReveal.bind(this),
      this.buildFallbackJobConstraint.bind(this)
    ];

    const candidates = [...builders];

    while (candidates.length > 0) {
      const builderIndex = Math.floor(Math.random() * candidates.length);
      const [builder] = candidates.splice(builderIndex, 1);
      const puzzle = builder?.(request, blueprint);

      if (puzzle && this.auditGeneratedPuzzleLocally(puzzle, request, blueprint).valid) {
        return puzzle;
      }
    }

    return this.buildFallbackProtectiveLie(request, blueprint);
  }

  private buildFallbackProtectiveLie(request: PuzzleGenerationRequest, blueprint: GenerationBlueprint): Puzzle {
    return this.buildFallbackPuzzle(request, blueprint, {
      title: `${blueprint.keyObject}背后的假话`,
      soupSurface: `在${blueprint.setting}里，主角突然当众指责同伴偷拿了自己的${blueprint.keyObject}，逼得对方立刻离开，周围人都觉得他太过分。`,
      truthStory: `主角当时正在${blueprint.setting}里值守，发现同伴手里的${blueprint.keyObject}上多出一处不该出现的细节，又从${blueprint.revealAnchor}里确认附近有人一直在盯着同伴。那个人只等同伴回到原来的位置就会下手。由于${blueprint.pressure}，主角不能当众说破，只能故意诬陷同伴偷东西，把人先骂到别处。几分钟后，原本站着的位置果然出了事，这句恶毒的话其实是在救人。`,
      facts: [
        '主角已经确认同伴继续留在原地会出事。',
        `危险线索先出现在${blueprint.keyObject}的细节上。`,
        `真正让主角确定风险升级的是${blueprint.revealAnchor}。`,
        '主角故意说谎，是为了把同伴强行支开。',
        '如果主角当场把真相讲破，盯梢的人会立刻改计划。',
        `旁人之所以误会，是因为整件事表面上${blueprint.redHerring}。`
      ],
      misleadingPoints: ['看起来像主角在故意伤害或羞辱对方', '看起来像单纯的人际矛盾'],
      keyTriggers: [`那件${blueprint.keyObject}上是否还有别的信息？`, '主角是不是在保护某个人？'],
      tags: [blueprint.setting, '保护', '误导']
    });
  }

  private buildFallbackImpersonation(request: PuzzleGenerationRequest, blueprint: GenerationBlueprint): Puzzle {
    return this.buildFallbackPuzzle(request, blueprint, {
      title: '迟到的身份',
      soupSurface: `在${blueprint.setting}里，主角听到一句再普通不过的自我介绍后，立刻取消原计划，转身就报了警。`,
      truthStory: `一名自称来接人的陌生人在${blueprint.setting}里说了一句外人很难注意的错误套话。主角又看见对方递出的${blueprint.keyObject}和${blueprint.revealAnchor}完全对不上，立刻确定来的人不是原本约好的那个人，而是在冒充身份接近目标。由于${blueprint.pressure}，主角不能继续陪着演下去，只能当场改口取消安排并报警。`,
      facts: [
        '现场出现了被冒用或伪装的身份。',
        `主角之所以识破，是因为一句话和${blueprint.keyObject}上的细节对不上。`,
        `真正决定性的第二个破绽来自${blueprint.revealAnchor}。`,
        `外人会误以为只是${blueprint.redHerring}。`,
        '主角改变计划不是因为害怕迟到或犯错，而是因为确认了冒充者。',
        '如果主角继续按原计划走，后果会更严重。'
      ],
      misleadingPoints: ['看起来像主角疑神疑鬼', '看起来像普通的流程问题'],
      keyTriggers: ['那句普通的话本身有问题吗？', `关键是否在${blueprint.keyObject}而不是说话内容本身？`],
      tags: [blueprint.setting, '身份伪装', '报警']
    });
  }

  private buildFallbackRecordedSignal(request: PuzzleGenerationRequest, blueprint: GenerationBlueprint): Puzzle {
    return this.buildFallbackPuzzle(request, blueprint, {
      title: '没出现的提醒',
      soupSurface: '主角醒来后发现某个平时必然出现的提醒没有出现，却因此判断事情已经发生了。',
      truthStory: `前一天晚上，主角和同伴约好，只要对方安全到家，就会用${blueprint.keyObject}发来固定提醒。第二天那条提醒没有出现，主角却在门口发现和${blueprint.revealAnchor}有关的异常，意识到不是同伴忘了发，而是对方在回家前就被人拦住了。有人还故意动过主角周围的信息，让他差点错过报警时机。`,
      facts: [
        '主角和同伴之间原本有固定的报平安约定。',
        `那件${blueprint.keyObject}原本就是约定里必须出现的信号。`,
        '提醒没有出现，本身就是异常线索。',
        `门口的${blueprint.revealAnchor}说明有人在主角醒来前动过手脚。`,
        '主角是通过反向推理意识到同伴已经出事了。',
        '如果再晚一步，报警时机会被错过。'
      ],
      misleadingPoints: ['看起来像主角只是睡过头', '看起来像设备故障'],
      keyTriggers: ['主角是不是提前知道某种规则？', '关键在于“没出现”的东西吗？'],
      tags: [blueprint.setting, '时间差', '反向推理']
    });
  }

  private buildFallbackIsolation(request: PuzzleGenerationRequest, blueprint: GenerationBlueprint): Puzzle {
    return this.buildFallbackPuzzle(request, blueprint, {
      title: '被安排好的安静',
      soupSurface: `主角在${blueprint.setting}里突然发现周围异常安静，随后立刻放弃了自己原本最在意的安排。`,
      truthStory: `主角原本准备带着${blueprint.keyObject}按时离开${blueprint.setting}去见一个重要的人，可那天周围安静得反常，连平时一定会传来的动静都没有。他检查后发现门口和${blueprint.revealAnchor}被人动过，意识到自己被故意困在里面。真正的目标不是他手上的安排，而是有人想趁他无法出去时，在外面对另一个人下手，所以他立刻放弃原计划，改成先求助。`,
      facts: [
        '主角并不是临时变卦，而是发现自己被故意困住了。',
        '安静本身就是不正常的线索。',
        `主角原本准备带着${blueprint.keyObject}按计划离开。`,
        `决定主角行动的是${blueprint.revealAnchor}这一处被动过的细节。`,
        '真正危险发生在主角原本要去参与的场景外部。',
        `表面上容易被误解成${blueprint.redHerring}。`
      ],
      misleadingPoints: ['看起来像主角突然不负责任', '看起来像只是环境太舒服而懈怠'],
      keyTriggers: ['安静这件事本身重要吗？', '有人是在故意拖住主角吗？'],
      tags: [blueprint.setting, '隔离', '阻止风险']
    });
  }

  private buildFallbackStalkerReveal(request: PuzzleGenerationRequest, blueprint: GenerationBlueprint): Puzzle {
    return this.buildFallbackPuzzle(request, blueprint, {
      title: `退回来的${blueprint.keyObject}`,
      soupSurface: `有人把刚处理好的${blueprint.keyObject}全部退回，却反而让主角意识到自己被保护了。`,
      truthStory: `主角把一批带有${blueprint.keyObject}的材料送去处理，对方在检查时发现每一份材料里的${blueprint.revealAnchor}都反复出现同一个陌生人。那个人显然一直在跟着主角，只是主角自己没有发现。为了不让对方意识到已经暴露，处理人没有直接说出跟踪者的事，只借口格式不合格把全部材料退回。主角回去逐一重看后，才明白对方是在提醒自己立刻换路线并报警。`,
      facts: [
        `问题不在${blueprint.keyObject}本身，而在里面暴露出来的隐藏信息。`,
        `关键异常来自${blueprint.revealAnchor}。`,
        '处理人没有直接说破，是为了避免跟踪者立刻收手。',
        '主角一开始误会了对方的动机。',
        `表面上这更像${blueprint.redHerring}，而不是安全提醒。`,
        '主角后来才理解退回行为其实是在保护自己。'
      ],
      misleadingPoints: ['看起来像服务质量问题', '看起来像对方心情不好'],
      keyTriggers: [`关键是不是藏在${blueprint.keyObject}记录下来的背景里？`, '对方是在提醒主角注意危险吗？'],
      tags: [blueprint.setting, '跟踪', '提醒']
    });
  }

  private buildFallbackJobConstraint(request: PuzzleGenerationRequest, blueprint: GenerationBlueprint): Puzzle {
    return this.buildFallbackPuzzle(request, blueprint, {
      title: '职业里的多余动作',
      soupSurface: `在${blueprint.setting}里，主角突然打断了一个看上去完全正常的流程，周围人都以为他在故意找麻烦。`,
      truthStory: `主角当时正在${blueprint.setting}值守，一名神色紧张的人拿着${blueprint.keyObject}要求继续办理。主角注意到对方口中的职业信息和${blueprint.revealAnchor}对不上，判断这人正在借着${blueprint.redHerring}掩饰真正目的。由于${blueprint.pressure}，他不能直接拆穿对方，只能故意做出失礼动作，把流程强行打断，争取时间等同事和安保介入。`,
      facts: [
        '主角当时正在值守，需要对异常细节负责。',
        `来办理的人拿着${blueprint.keyObject}，但说法和现场细节对不上。`,
        `真正让主角确认不对劲的，是${blueprint.revealAnchor}。`,
        '主角故意打断流程，是为了拖住对方而不是羞辱对方。',
        `旁观者最初会把这件事误会成${blueprint.redHerring}。`,
        '如果主角不立刻插手，对方就会带着目的继续推进。'
      ],
      misleadingPoints: ['看起来像主角越权', '看起来像主角脾气古怪'],
      keyTriggers: ['主角的职业是否很关键？', '他的动作是不是在故意中断某个流程？'],
      tags: [blueprint.setting, '职业信息', '流程中断']
    });
  }

  private buildFallbackPuzzle(
    request: PuzzleGenerationRequest,
    blueprint: GenerationBlueprint,
    input: {
      title: string;
      soupSurface: string;
      truthStory: string;
      facts: string[];
      misleadingPoints: string[];
      keyTriggers: string[];
      tags: string[];
    }
  ): Puzzle {
    const promptTags = this.extractPromptFragments(request.prompt);

    return {
      puzzleId: `generated-${nanoid(12)}`,
      title: input.title,
      soupSurface: input.soupSurface,
      truthStory: input.truthStory,
      facts: input.facts.map((statement, index) => ({
        factId: `fact-${index + 1}`,
        statement,
        importance: Math.max(4, 10 - index),
        discoverable: true,
        keywords: this.ensureKeywords(statement, [])
      })),
      misleadingPoints: unique([...input.misleadingPoints, blueprint.redHerring]).slice(0, 4),
      keyTriggers: unique(input.keyTriggers).slice(0, 4),
      difficulty: request.difficulty,
      tags: unique([...input.tags, 'dynamic', blueprint.setting, ...promptTags]).slice(0, 8)
    };
  }

  private extractPromptFragments(prompt: string) {
    return unique(
      prompt
        .split(/[，,、/\s]+/u)
        .map((item) => item.trim())
        .filter((item) => item.length >= 2)
        .slice(0, 3)
    );
  }

  private extractSearchTerms(texts: string[]) {
    const stopWords = new Set([
      '是否',
      '是不是',
      '有没有',
      '为什么',
      '怎么',
      '什么',
      '这个',
      '那个',
      '事情',
      '有关',
      '相关',
      '那件',
      '这件',
      '还有',
      '别的',
      '信息',
      '关键',
      '是不是藏'
    ]);

    return unique(this.extractComparableTokens(texts).filter((item) => item.length >= 2 && !stopWords.has(item))).slice(0, 24);
  }

  private extractComparableTokens(texts: string[]) {
    const stopTerms = new Set([
      '主角',
      '有人',
      '一个',
      '一些',
      '事情',
      '真相',
      '表面',
      '后来',
      '因为',
      '所以',
      '如果',
      '自己',
      '对方',
      '有关',
      '相关',
      '发现',
      '感觉',
      '然后',
      '只是',
      '不是'
    ]);
    const snippets = texts.flatMap((value) => {
      const normalized = normalizeText(value);

      if (!normalized) {
        return [];
      }

      return normalized
        .split(/\s+/)
        .flatMap((token) => {
          const current = token.trim();

          if (!current || stopTerms.has(current)) {
            return [];
          }

          if (/^[\u4e00-\u9fff]+$/u.test(current)) {
            const parts = [current];

            for (let size = 2; size <= Math.min(4, current.length); size += 1) {
              for (let index = 0; index <= current.length - size; index += 1) {
                parts.push(current.slice(index, index + size));
              }
            }

            return parts;
          }

          return current.length >= 2 ? [current] : [];
        })
        .filter((token) => token.length >= 2 && !stopTerms.has(token));
    });

    return unique(snippets).slice(0, 160);
  }

  private countSharedTokens(source: Set<string>, ...comparators: Array<Set<string>>) {
    if (source.size === 0) {
      return 0;
    }

    const comparisonPool = new Set(comparators.flatMap((comparator) => [...comparator]));
    let matches = 0;

    for (const token of source) {
      if (comparisonPool.has(token)) {
        matches += 1;
      }
    }

    return matches;
  }

  private hasStrongTextOverlap(left: string, right: string) {
    const leftTokens = new Set(this.extractComparableTokens([left]));
    const rightTokens = new Set(this.extractComparableTokens([right]));

    return this.countSharedTokens(leftTokens, rightTokens) >= 3;
  }

  private pickRandom<T>(items: T[]) {
    return items[Math.floor(Math.random() * items.length)] as T;
  }
}
