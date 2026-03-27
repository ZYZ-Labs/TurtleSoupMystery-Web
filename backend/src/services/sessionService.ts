import { nanoid } from 'nanoid';
import { ANSWER_LABELS } from '../lib/constants.js';
import { clampProgress, nowIso, sortSessionsByUpdatedAt, unique } from '../lib/utils.js';
import { StateStore } from '../storage/stateStore.js';
import type {
  GameSession,
  OllamaConfig,
  PublicGameSession,
  PublicPuzzle,
  Puzzle,
  QuestionRecord,
  RevealedFact
} from '../types/domain.js';
import { OllamaService } from './ollamaService.js';

export class SessionService {
  constructor(
    private readonly store: StateStore,
    private readonly ollamaService: OllamaService
  ) {}

  async getOverview() {
    const [state, puzzles] = await Promise.all([this.store.readState(), this.store.loadPuzzles()]);
    const sessions = sortSessionsByUpdatedAt(state.sessions);

    return {
      summary: {
        puzzleCount: puzzles.length,
        sessionCount: sessions.length,
        activeSessionCount: sessions.filter((session) => session.status === 'playing').length,
        solvedSessionCount: sessions.filter((session) => session.status === 'solved').length,
        failedSessionCount: sessions.filter((session) => session.status === 'failed').length
      },
      ollama: {
        configured: Boolean(state.ollama.baseUrl),
        defaultModel: state.ollama.defaultModel,
        modelCount: state.ollama.availableModels.length,
        lastStatus: state.ollama.lastStatus,
        lastError: state.ollama.lastError,
        lastCheckedAt: state.ollama.lastCheckedAt
      },
      latestSessions: sessions.slice(0, 6).map((session) => this.toPublicSession(session, puzzles))
    };
  }

  async listPuzzles() {
    const puzzles = await this.store.loadPuzzles();
    return puzzles.map((puzzle) => this.toPublicPuzzle(puzzle));
  }

  async listSessions() {
    const [state, puzzles] = await Promise.all([this.store.readState(), this.store.loadPuzzles()]);
    return sortSessionsByUpdatedAt(state.sessions).map((session) => this.toPublicSession(session, puzzles));
  }

  async getSession(sessionId: string) {
    const [state, puzzles] = await Promise.all([this.store.readState(), this.store.loadPuzzles()]);
    const session = state.sessions.find((item) => item.sessionId === sessionId);
    return session ? this.toPublicSession(session, puzzles) : null;
  }

  async createSession(puzzleId?: string) {
    const puzzles = await this.store.loadPuzzles();
    const puzzle = puzzleId ? puzzles.find((item) => item.puzzleId === puzzleId) : puzzles[0];

    if (!puzzle) {
      throw new Error('没有可用的谜题数据。');
    }

    const timestamp = nowIso();
    const session: GameSession = {
      sessionId: nanoid(),
      puzzleId: puzzle.puzzleId,
      puzzleTitle: puzzle.title,
      soupSurface: puzzle.soupSurface,
      truthStory: puzzle.truthStory,
      difficulty: puzzle.difficulty,
      questions: [],
      revealedFactIds: [],
      progressScore: 0,
      status: 'playing',
      createdAt: timestamp,
      updatedAt: timestamp
    };

    await this.store.updateState((state) => ({
      ...state,
      sessions: [session, ...state.sessions]
    }));

    return this.toPublicSession(session, puzzles);
  }

  async askQuestion(sessionId: string, question: string) {
    const [puzzle, state] = await Promise.all([
      this.findPuzzleBySession(sessionId),
      this.store.readState()
    ]);
    const session = state.sessions.find((item) => item.sessionId === sessionId);

    if (!session) {
      throw new Error('找不到对应对局。');
    }

    if (session.status !== 'playing') {
      throw new Error('该对局已结束，不能继续提问。');
    }

    const evaluation = await this.ollamaService.evaluateQuestion(state.ollama, puzzle, session, question);
    const revealedFactIds = unique([...session.revealedFactIds, ...evaluation.revealedFactIds]);
    const updatedAt = nowIso();

    const questionRecord: QuestionRecord = {
      id: nanoid(),
      question,
      answerCode: evaluation.answerCode,
      answerLabel: ANSWER_LABELS[evaluation.answerCode],
      matchedFactIds: evaluation.matchedFactIds,
      revealedFactIds: evaluation.revealedFactIds,
      progressDelta: evaluation.progressDelta,
      createdAt: updatedAt,
      source: evaluation.source
    };

    const nextSession: GameSession = {
      ...session,
      questions: [...session.questions, questionRecord],
      revealedFactIds,
      progressScore: clampProgress(session.progressScore + evaluation.progressDelta),
      updatedAt
    };

    await this.store.updateState((current) => ({
      ...current,
      sessions: current.sessions.map((item) => (item.sessionId === sessionId ? nextSession : item))
    }));

    return this.toPublicSession(nextSession, [puzzle]);
  }

  async submitFinalGuess(sessionId: string, guess: string) {
    const [puzzle, state] = await Promise.all([
      this.findPuzzleBySession(sessionId),
      this.store.readState()
    ]);
    const session = state.sessions.find((item) => item.sessionId === sessionId);

    if (!session) {
      throw new Error('找不到对应对局。');
    }

    const evaluation = await this.ollamaService.evaluateFinalGuess(state.ollama, puzzle, session, guess);
    const updatedAt = nowIso();
    const nextSession: GameSession = {
      ...session,
      status: evaluation.accepted ? 'solved' : 'failed',
      progressScore: clampProgress(Math.max(session.progressScore, evaluation.score)),
      finalGuess: {
        guess,
        accepted: evaluation.accepted,
        score: evaluation.score,
        missingPoints: evaluation.missingPoints,
        createdAt: updatedAt,
        source: evaluation.source
      },
      updatedAt
    };

    await this.store.updateState((current) => ({
      ...current,
      sessions: current.sessions.map((item) => (item.sessionId === sessionId ? nextSession : item))
    }));

    return this.toPublicSession(nextSession, [puzzle]);
  }

  async revealSession(sessionId: string) {
    const [state, puzzles] = await Promise.all([this.store.readState(), this.store.loadPuzzles()]);
    const session = state.sessions.find((item) => item.sessionId === sessionId);

    if (!session) {
      throw new Error('找不到对应对局。');
    }

    const updatedSession: GameSession = {
      ...session,
      status: session.status === 'playing' ? 'failed' : session.status,
      updatedAt: nowIso()
    };

    await this.store.updateState((current) => ({
      ...current,
      sessions: current.sessions.map((item) => (item.sessionId === sessionId ? updatedSession : item))
    }));

    return this.toPublicSession(updatedSession, puzzles);
  }

  async getOllamaConfig() {
    const state = await this.store.readState();
    return state.ollama;
  }

  async checkOllamaConnection(baseUrl: string, timeoutMs: number) {
    return this.ollamaService.checkConnection(baseUrl, timeoutMs);
  }

  async saveOllamaConfig(nextConfig: Pick<OllamaConfig, 'baseUrl' | 'defaultModel' | 'timeoutMs'>) {
    const checkResult = await this.ollamaService.checkConnection(nextConfig.baseUrl, nextConfig.timeoutMs);

    const nextState = await this.store.updateState((state) => ({
      ...state,
      ollama: {
        ...state.ollama,
        baseUrl: checkResult.normalizedBaseUrl,
        defaultModel: nextConfig.defaultModel,
        timeoutMs: nextConfig.timeoutMs,
        availableModels: checkResult.models,
        lastCheckedAt: nowIso(),
        lastStatus: checkResult.reachable ? 'connected' : 'error',
        lastError: checkResult.reachable ? null : checkResult.message
      }
    }));

    return nextState.ollama;
  }

  private async findPuzzleBySession(sessionId: string) {
    const [puzzles, state] = await Promise.all([this.store.loadPuzzles(), this.store.readState()]);
    const session = state.sessions.find((item) => item.sessionId === sessionId);

    if (!session) {
      throw new Error('找不到对应对局。');
    }

    const puzzle = puzzles.find((item) => item.puzzleId === session.puzzleId);

    if (!puzzle) {
      throw new Error('关联谜题不存在。');
    }

    return puzzle;
  }

  private toPublicPuzzle(puzzle: Puzzle): PublicPuzzle {
    return {
      puzzleId: puzzle.puzzleId,
      title: puzzle.title,
      soupSurface: puzzle.soupSurface,
      difficulty: puzzle.difficulty,
      tags: puzzle.tags
    };
  }

  private toPublicSession(session: GameSession, puzzles: Puzzle[]): PublicGameSession {
    const puzzle = puzzles.find((item) => item.puzzleId === session.puzzleId);
    const mapFact = (factId: string): RevealedFact => ({
      factId,
      statement: puzzle?.facts.find((fact) => fact.factId === factId)?.statement ?? factId
    });

    return {
      sessionId: session.sessionId,
      puzzleId: session.puzzleId,
      puzzleTitle: session.puzzleTitle,
      soupSurface: session.soupSurface,
      difficulty: session.difficulty,
      questions: session.questions.map((item) => ({
        id: item.id,
        question: item.question,
        answerCode: item.answerCode,
        answerLabel: item.answerLabel,
        matchedFactCount: item.matchedFactIds.length,
        revealedFacts: item.revealedFactIds.map(mapFact),
        progressDelta: item.progressDelta,
        createdAt: item.createdAt,
        source: item.source
      })),
      revealedFacts: session.revealedFactIds.map(mapFact),
      progressScore: session.progressScore,
      status: session.status,
      finalGuess: session.finalGuess,
      truthStory: session.status === 'playing' ? null : session.truthStory,
      createdAt: session.createdAt,
      updatedAt: session.updatedAt
    };
  }
}
