export type Difficulty = 'easy' | 'medium' | 'hard';
export type RoomStatus = 'playing' | 'solved' | 'failed';
export type AnswerCode = 'yes' | 'no' | 'irrelevant' | 'partial' | 'unknown';
export type ParticipantRole = 'host' | 'player';
export type MessageType = 'system' | 'question' | 'answer' | 'guess' | 'status';
export type SubmissionKind = 'question' | 'final_guess' | 'restart' | 'hint';
export type AIProvider = 'ollama' | 'deepseek';
export type ModelCategory = 'all' | 'balanced' | 'reasoning' | 'lightweight' | 'multimodal' | 'other';
export type ConnectionStatus = 'idle' | 'connected' | 'error';
export type EndingBadgeCode = 'perfect' | 'guided_once' | 'guided_twice' | 'open_truth' | 'missed';
export type EndingBadgeTier = 'perfect' | 'gold' | 'silver' | 'bronze';

export interface Puzzle {
  puzzleId: string;
  title: string;
  soupSurface: string;
  difficulty: Difficulty;
  tags: string[];
}

export interface RevealedFact {
  factId: string;
  statement: string;
}

export interface FinalGuessRecord {
  participantId: string;
  participantName: string;
  guess: string;
  accepted: boolean;
  score: number;
  missingPoints: string[];
  createdAt: string;
  source: 'ollama' | 'heuristic';
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
  source?: 'ollama' | 'heuristic';
}

export interface PublicGameRoom {
  roomId: string;
  roomCode: string;
  title: string;
  generationPrompt: string;
  generationDurationMs: number;
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

export interface OverviewPayload {
  summary: {
    puzzleSeedCount: number;
    roomCount: number;
    activeRoomCount: number;
    solvedRoomCount: number;
    failedRoomCount: number;
    participantCount: number;
    onlineParticipantCount: number;
  };
  ollama: {
    configured: boolean;
    supplierCount: number;
    generationTimeoutMs: number;
    generationSupplierLabel: string;
    generationModel: string;
    validationSupplierLabel: string;
    validationModel: string;
    modelCount: number;
    lastStatus: ConnectionStatus;
    lastError: string | null;
    lastCheckedAt: string | null;
  };
  latestRooms: PublicGameRoom[];
}

export interface OllamaCheckResult {
  reachable: boolean;
  normalizedBaseUrl: string;
  models: OllamaModel[];
  message: string;
}

export interface AdminSession {
  token: string;
  username: string;
  expiresAt: string;
}

export interface AdminSessionStatus {
  authenticated: boolean;
  session: Omit<AdminSession, 'token'> | null;
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
