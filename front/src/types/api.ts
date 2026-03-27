export type Difficulty = 'easy' | 'medium' | 'hard';
export type RoomStatus = 'playing' | 'solved' | 'failed';
export type AnswerCode = 'yes' | 'no' | 'irrelevant' | 'partial' | 'unknown';
export type ParticipantRole = 'host' | 'player';
export type MessageType = 'system' | 'question' | 'answer' | 'guess' | 'status';

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
    defaultModel: string;
    modelCount: number;
    lastStatus: 'idle' | 'connected' | 'error';
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
