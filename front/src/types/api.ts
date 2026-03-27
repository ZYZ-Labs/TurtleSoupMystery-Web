export type SessionStatus = 'playing' | 'solved' | 'failed';
export type AnswerCode = 'yes' | 'no' | 'irrelevant' | 'partial' | 'unknown';

export interface Puzzle {
  puzzleId: string;
  title: string;
  soupSurface: string;
  difficulty: 'easy' | 'medium' | 'hard';
  tags: string[];
}

export interface RevealedFact {
  factId: string;
  statement: string;
}

export interface QuestionRecord {
  id: string;
  question: string;
  answerCode: AnswerCode;
  answerLabel: string;
  matchedFactCount: number;
  revealedFacts: RevealedFact[];
  progressDelta: number;
  createdAt: string;
  source: 'ollama' | 'heuristic';
}

export interface FinalGuessRecord {
  guess: string;
  accepted: boolean;
  score: number;
  missingPoints: string[];
  createdAt: string;
  source: 'ollama' | 'heuristic';
}

export interface GameSession {
  sessionId: string;
  puzzleId: string;
  puzzleTitle: string;
  soupSurface: string;
  difficulty: 'easy' | 'medium' | 'hard';
  questions: QuestionRecord[];
  revealedFacts: RevealedFact[];
  progressScore: number;
  status: SessionStatus;
  finalGuess?: FinalGuessRecord;
  truthStory: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface OllamaModel {
  name: string;
  model: string;
  size: number;
  modifiedAt: string;
  parameterSize?: string;
  quantizationLevel?: string;
}

export interface OllamaConfig {
  baseUrl: string;
  defaultModel: string;
  timeoutMs: number;
  availableModels: OllamaModel[];
  lastCheckedAt: string | null;
  lastStatus: 'idle' | 'connected' | 'error';
  lastError: string | null;
}

export interface OverviewPayload {
  summary: {
    puzzleCount: number;
    sessionCount: number;
    activeSessionCount: number;
    solvedSessionCount: number;
    failedSessionCount: number;
  };
  ollama: {
    configured: boolean;
    defaultModel: string;
    modelCount: number;
    lastStatus: 'idle' | 'connected' | 'error';
    lastError: string | null;
    lastCheckedAt: string | null;
  };
  latestSessions: GameSession[];
}

export interface OllamaCheckResult {
  reachable: boolean;
  normalizedBaseUrl: string;
  models: OllamaModel[];
  message: string;
}
