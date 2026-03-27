export type Difficulty = 'easy' | 'medium' | 'hard';
export type SessionStatus = 'playing' | 'solved' | 'failed';
export type AnswerCode = 'yes' | 'no' | 'irrelevant' | 'partial' | 'unknown';
export type AnswerSource = 'ollama' | 'heuristic';

export interface PuzzleFact {
  factId: string;
  statement: string;
  importance: number;
  discoverable: boolean;
  keywords: string[];
}

export interface Puzzle {
  puzzleId: string;
  title: string;
  soupSurface: string;
  truthStory: string;
  facts: PuzzleFact[];
  misleadingPoints: string[];
  keyTriggers: string[];
  difficulty: Difficulty;
  tags: string[];
}

export interface QuestionRecord {
  id: string;
  question: string;
  answerCode: AnswerCode;
  answerLabel: string;
  matchedFactIds: string[];
  revealedFactIds: string[];
  progressDelta: number;
  createdAt: string;
  source: AnswerSource;
}

export interface FinalGuessRecord {
  guess: string;
  accepted: boolean;
  score: number;
  missingPoints: string[];
  createdAt: string;
  source: AnswerSource;
}

export interface GameSession {
  sessionId: string;
  puzzleId: string;
  puzzleTitle: string;
  soupSurface: string;
  truthStory: string;
  difficulty: Difficulty;
  questions: QuestionRecord[];
  revealedFactIds: string[];
  progressScore: number;
  status: SessionStatus;
  finalGuess?: FinalGuessRecord;
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

export interface AppState {
  version: number;
  ollama: OllamaConfig;
  sessions: GameSession[];
}

export interface QuestionEvaluation {
  answerCode: AnswerCode;
  matchedFactIds: string[];
  revealedFactIds: string[];
  progressDelta: number;
  reasoning: string;
  source: AnswerSource;
}

export interface GuessEvaluation {
  accepted: boolean;
  score: number;
  missingPoints: string[];
  reasoning: string;
  source: AnswerSource;
}

export interface RevealedFact {
  factId: string;
  statement: string;
}

export interface PublicPuzzle {
  puzzleId: string;
  title: string;
  soupSurface: string;
  difficulty: Difficulty;
  tags: string[];
}

export interface PublicQuestionRecord {
  id: string;
  question: string;
  answerCode: AnswerCode;
  answerLabel: string;
  matchedFactCount: number;
  revealedFacts: RevealedFact[];
  progressDelta: number;
  createdAt: string;
  source: AnswerSource;
}

export interface PublicGameSession {
  sessionId: string;
  puzzleId: string;
  puzzleTitle: string;
  soupSurface: string;
  difficulty: Difficulty;
  questions: PublicQuestionRecord[];
  revealedFacts: RevealedFact[];
  progressScore: number;
  status: SessionStatus;
  finalGuess?: FinalGuessRecord;
  truthStory: string | null;
  createdAt: string;
  updatedAt: string;
}
