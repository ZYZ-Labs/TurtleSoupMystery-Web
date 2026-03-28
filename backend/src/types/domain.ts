export type Difficulty = 'easy' | 'medium' | 'hard';
export type RoomStatus = 'playing' | 'solved' | 'failed';
export type AnswerCode = 'yes' | 'no' | 'irrelevant' | 'partial' | 'unknown';
export type AnswerSource = 'ollama' | 'heuristic';
export type ParticipantRole = 'host' | 'player';
export type MessageType = 'system' | 'question' | 'answer' | 'guess' | 'status';
export type SubmissionKind = 'question' | 'final_guess' | 'restart' | 'hint';
export type AIProvider = 'ollama' | 'deepseek';
export type ModelCategory = 'all' | 'balanced' | 'reasoning' | 'lightweight' | 'multimodal' | 'other';
export type ConnectionStatus = 'idle' | 'connected' | 'error';
export type EndingBadgeCode = 'perfect' | 'guided_once' | 'guided_twice' | 'open_truth' | 'missed';
export type EndingBadgeTier = 'perfect' | 'gold' | 'silver' | 'bronze';
export type RoomGenerationSource = 'ai' | 'fallback' | 'unknown';

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
  generationSource?: Exclude<RoomGenerationSource, 'unknown'>;
  generationFailureReason?: string | null;
}

export interface RoomParticipant {
  participantId: string;
  clientId?: string;
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
  reasoning?: string;
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
  reasoning?: string;
}

export interface PendingRoomSubmission {
  kind: SubmissionKind;
  participantId: string;
  participantName: string;
  startedAt: string;
}

export interface HintVote {
  proposedByParticipantId: string;
  proposedByName: string;
  approvals: string[];
  createdAt: string;
}

export interface EndingBadge {
  code: EndingBadgeCode;
  title: string;
  description: string;
  tier: EndingBadgeTier;
}

export interface GameRoom {
  roomId: string;
  roomCode: string;
  title: string;
  generationPrompt: string;
  generationDurationMs: number;
  generationSource: RoomGenerationSource;
  generationFailureReason: string | null;
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
  hintUsageCount: number;
  maxHintCount: number;
  hintVote: HintVote | null;
  pendingSubmission: PendingRoomSubmission | null;
  progressScore: number;
  status: RoomStatus;
  endingBadge: EndingBadge | null;
  finalGuess?: FinalGuessRecord;
  createdAt: string;
  updatedAt: string;
}

export interface OllamaModel {
  name: string;
  model: string;
  family: string;
  category: Exclude<ModelCategory, 'all'>;
  size: number;
  modifiedAt: string;
  parameterSize?: string;
  quantizationLevel?: string;
}

export interface OllamaSupplier {
  supplierId: string;
  label: string;
  provider: AIProvider;
  baseUrl: string;
  apiKey: string;
  timeoutMs: number;
  availableModels: OllamaModel[];
  lastCheckedAt: string | null;
  lastStatus: ConnectionStatus;
  lastError: string | null;
}

export interface OllamaConfig {
  suppliers: OllamaSupplier[];
  generationTimeoutMs: number;
  generationSupplierId: string;
  generationModelCategory: ModelCategory;
  generationModel: string;
  validationSupplierId: string;
  validationModelCategory: ModelCategory;
  validationModel: string;
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
  hintUsageCount: number;
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
  generationDurationMs: number;
  generationSource: RoomGenerationSource;
  generationFailureReason: string | null;
  puzzleTitle: string;
  soupSurface: string;
  difficulty: Difficulty;
  tags: string[];
  participants: PublicRoomParticipant[];
  messages: PublicRoomMessage[];
  questionCount: number;
  messageCount: number;
  revealedFacts: RevealedFact[];
  hintUsageCount: number;
  maxHintCount: number;
  hintVote: HintVote | null;
  pendingSubmission: PendingRoomSubmission | null;
  progressScore: number;
  status: RoomStatus;
  endingBadge: EndingBadge | null;
  finalGuess?: FinalGuessRecord;
  truthStory: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface RoomJoinResult {
  room: PublicGameRoom;
  participant: PublicRoomParticipant;
}

export interface RoomConnectionReadyEvent {
  type: 'connection.ready';
  roomCode: string;
  connectedAt: string;
}

export interface RoomUpdatedEvent {
  type: 'room.updated';
  roomCode: string;
  room: PublicGameRoom;
}

export interface RoomDeletedEvent {
  type: 'room.deleted';
  roomCode: string;
  roomId: string;
}

export type RoomRealtimeEvent = RoomConnectionReadyEvent | RoomUpdatedEvent | RoomDeletedEvent;
