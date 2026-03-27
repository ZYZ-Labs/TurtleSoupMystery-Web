export type Difficulty = 'easy' | 'medium' | 'hard';
export type RoomStatus = 'playing' | 'solved' | 'failed';
export type AnswerCode = 'yes' | 'no' | 'irrelevant' | 'partial' | 'unknown';
export type AnswerSource = 'ollama' | 'heuristic';
export type ParticipantRole = 'host' | 'player';
export type MessageType = 'system' | 'question' | 'answer' | 'guess' | 'status';

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

export interface RoomParticipant {
  participantId: string;
  displayName: string;
  role: ParticipantRole;
  joinedAt: string;
  lastSeenAt: string;
}

export interface RoomMessage {
  id: string;
  type: MessageType;
  authorName: string;
  content: string;
  createdAt: string;
  answerCode?: AnswerCode;
  answerLabel?: string;
  source?: AnswerSource;
}

export interface QuestionRecord {
  id: string;
  askedByParticipantId: string;
  askedByName: string;
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
  participantId: string;
  participantName: string;
  guess: string;
  accepted: boolean;
  score: number;
  missingPoints: string[];
  createdAt: string;
  source: AnswerSource;
}

export interface GameRoom {
  roomId: string;
  roomCode: string;
  title: string;
  generationPrompt: string;
  puzzleId: string;
  puzzleTitle: string;
  soupSurface: string;
  truthStory: string;
  facts: PuzzleFact[];
  misleadingPoints: string[];
  keyTriggers: string[];
  difficulty: Difficulty;
  tags: string[];
  participants: RoomParticipant[];
  messages: RoomMessage[];
  questions: QuestionRecord[];
  revealedFactIds: string[];
  progressScore: number;
  status: RoomStatus;
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
  rooms: GameRoom[];
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

export interface PuzzleGenerationRequest {
  difficulty: Difficulty;
  prompt: string;
}

export interface RoomContext {
  revealedFactIds: string[];
  progressScore: number;
  questionHistory: Array<{
    question: string;
    answerCode: AnswerCode;
  }>;
}

export interface RevealedFact {
  factId: string;
  statement: string;
}

export interface PublicRoomParticipant {
  participantId: string;
  displayName: string;
  role: ParticipantRole;
  joinedAt: string;
  lastSeenAt: string;
}

export interface PublicRoomMessage {
  id: string;
  type: MessageType;
  authorName: string;
  content: string;
  createdAt: string;
  answerCode?: AnswerCode;
  answerLabel?: string;
  source?: AnswerSource;
}

export interface PublicPuzzle {
  puzzleId: string;
  title: string;
  soupSurface: string;
  difficulty: Difficulty;
  tags: string[];
}

export interface PublicGameRoom {
  roomId: string;
  roomCode: string;
  title: string;
  generationPrompt: string;
  puzzleTitle: string;
  soupSurface: string;
  difficulty: Difficulty;
  tags: string[];
  participants: PublicRoomParticipant[];
  messages: PublicRoomMessage[];
  questionCount: number;
  messageCount: number;
  revealedFacts: RevealedFact[];
  progressScore: number;
  status: RoomStatus;
  finalGuess?: FinalGuessRecord;
  truthStory: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface RoomJoinResult {
  room: PublicGameRoom;
  participant: PublicRoomParticipant;
}
