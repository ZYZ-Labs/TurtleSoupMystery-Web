import axios, { AxiosError } from 'axios';
import { z } from 'zod';
import { buildOllamaApiUrl, normalizeOllamaBaseUrl, normalizeText, unique } from '../lib/utils.js';
import type {
  GameSession,
  GuessEvaluation,
  OllamaConfig,
  OllamaModel,
  Puzzle,
  QuestionEvaluation
} from '../types/domain.js';

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

export class OllamaService {
  async checkConnection(baseUrl: string, timeoutMs: number): Promise<CheckResult> {
    const normalizedBaseUrl = normalizeOllamaBaseUrl(baseUrl);

    if (!normalizedBaseUrl) {
      return {
        reachable: false,
        normalizedBaseUrl,
        models: [],
        message: '请先填写 Ollama 地址。'
      };
    }

    try {
      const response = await axios.get<{ models?: Array<Record<string, unknown>> }>(
        buildOllamaApiUrl(normalizedBaseUrl, 'tags'),
        {
          timeout: timeoutMs
        }
      );

      const models = (response.data.models ?? []).map((item) => ({
        name: String(item.name ?? item.model ?? ''),
        model: String(item.model ?? item.name ?? ''),
        size: Number(item.size ?? 0),
        modifiedAt: String(item.modified_at ?? ''),
        parameterSize:
          item.details && typeof item.details === 'object'
            ? String((item.details as Record<string, unknown>).parameter_size ?? '')
            : undefined,
        quantizationLevel:
          item.details && typeof item.details === 'object'
            ? String((item.details as Record<string, unknown>).quantization_level ?? '')
            : undefined
      }));

      return {
        reachable: true,
        normalizedBaseUrl,
        models,
        message: models.length > 0 ? '连接成功，已获取模型列表。' : '连接成功，但当前没有可用模型。'
      };
    } catch (error) {
      const message =
        error instanceof AxiosError
          ? error.message
          : error instanceof Error
            ? error.message
            : '连接失败';

      return {
        reachable: false,
        normalizedBaseUrl,
        models: [],
        message
      };
    }
  }

  async evaluateQuestion(config: OllamaConfig, puzzle: Puzzle, session: GameSession, question: string) {
    if (!config.baseUrl || !config.defaultModel) {
      return this.evaluateQuestionHeuristically(puzzle, session, question);
    }

    try {
      const response = await axios.post(
        buildOllamaApiUrl(config.baseUrl, 'chat'),
        {
          model: config.defaultModel,
          stream: false,
          format: 'json',
          messages: [
            {
              role: 'system',
              content: [
                '你是海龟汤游戏的事实裁判，只能根据既有真相判断，不能创造新设定。',
                '请把玩家问题归类为 yes、no、irrelevant、partial、unknown 之一。',
                '只返回 JSON，不要输出多余文本。'
              ].join('\n')
            },
            {
              role: 'user',
              content: JSON.stringify(
                {
                  task: 'judge-question',
                  question,
                  puzzle,
                  revealedFactIds: session.revealedFactIds,
                  questionHistory: session.questions.map((item) => ({
                    question: item.question,
                    answerCode: item.answerCode
                  })),
                  rules: [
                    'relevant and supported => yes',
                    'relevant but contradicted by truth => no',
                    'partially touches truth => partial',
                    'not related to truth => irrelevant',
                    'use unknown only if wording is impossible to resolve'
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
        },
        {
          timeout: config.timeoutMs
        }
      );

      const content = response.data?.message?.content ?? '{}';
      const parsed = questionSchema.parse(JSON.parse(content));

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
      return this.evaluateQuestionHeuristically(puzzle, session, question);
    }
  }

  async evaluateFinalGuess(config: OllamaConfig, puzzle: Puzzle, session: GameSession, guess: string) {
    if (!config.baseUrl || !config.defaultModel) {
      return this.evaluateGuessHeuristically(puzzle, guess);
    }

    try {
      const response = await axios.post(
        buildOllamaApiUrl(config.baseUrl, 'chat'),
        {
          model: config.defaultModel,
          stream: false,
          format: 'json',
          messages: [
            {
              role: 'system',
              content: [
                '你是海龟汤的结算裁判。',
                '只根据谜题真相判断玩家最终猜测是否足够接近。',
                '只返回 JSON。'
              ].join('\n')
            },
            {
              role: 'user',
              content: JSON.stringify(
                {
                  task: 'judge-final-guess',
                  finalGuess: guess,
                  puzzle,
                  sessionSummary: {
                    progressScore: session.progressScore,
                    revealedFactIds: session.revealedFactIds
                  },
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
        },
        {
          timeout: config.timeoutMs
        }
      );

      const content = response.data?.message?.content ?? '{}';
      const parsed = guessSchema.parse(JSON.parse(content));

      return {
        ...parsed,
        source: 'ollama'
      } satisfies GuessEvaluation;
    } catch {
      return this.evaluateGuessHeuristically(puzzle, guess);
    }
  }

  private evaluateQuestionHeuristically(puzzle: Puzzle, session: GameSession, question: string): QuestionEvaluation {
    const normalizedQuestion = normalizeText(question);
    const matchedFacts = puzzle.facts.filter((fact) =>
      fact.keywords.some((keyword) => normalizedQuestion.includes(normalizeText(keyword)))
    );

    const revealedFactIds = matchedFacts
      .filter((fact) => fact.discoverable && !session.revealedFactIds.includes(fact.factId))
      .map((fact) => fact.factId);

    if (matchedFacts.length === 0) {
      return {
        answerCode: 'irrelevant',
        matchedFactIds: [],
        revealedFactIds: [],
        progressDelta: 0,
        reasoning: 'No clear fact match found.',
        source: 'heuristic'
      };
    }

    const importance = matchedFacts.reduce((total, fact) => total + fact.importance, 0);
    const strongestFact = matchedFacts.sort((left, right) => right.importance - left.importance)[0];
    const answerCode =
      /不是|并非|没有|没|无/.test(normalizedQuestion) && strongestFact ? 'partial' : 'yes';

    return {
      answerCode,
      matchedFactIds: matchedFacts.map((fact) => fact.factId),
      revealedFactIds,
      progressDelta: Math.min(24, Math.max(4, Math.round(importance / matchedFacts.length))),
      reasoning: 'Matched fact keywords heuristically.',
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
    const accepted = score >= 70;
    const missingPoints = puzzle.facts
      .filter((fact) => !matchedFacts.some((matched) => matched.factId === fact.factId))
      .map((fact) => fact.statement);

    return {
      accepted,
      score,
      missingPoints: missingPoints.slice(0, 3),
      reasoning: 'Calculated from keyword coverage.',
      source: 'heuristic'
    };
  }
}
