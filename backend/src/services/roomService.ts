import { nanoid } from 'nanoid';
import { AI_HOST_NAME, ANSWER_LABELS, HARD_DIFFICULTY_MAX_QUESTION_COUNT } from '../lib/constants.js';
import { clampProgress, createRoomCode, nowIso, sortByUpdatedAt, unique } from '../lib/utils.js';
import { StateStore } from '../storage/stateStore.js';
import type {
  Difficulty,
  EndingBadge,
  FinalGuessRecord,
  GameRoom,
  HintVote,
  OllamaConfig,
  OllamaSupplier,
  PendingRoomSubmission,
  PublicGameRoom,
  PublicPuzzle,
  Puzzle,
  QuestionEvaluation,
  QuestionRecord,
  RoomClue,
  RoomRealtimeEvent,
  RoomContext,
  RoomJoinResult,
  RoomMessage,
  RoomParticipant,
  SubmissionKind
} from '../types/domain.js';
import { OllamaService } from './ollamaService.js';

export class ServiceError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string
  ) {
    super(message);
    this.name = 'ServiceError';
  }
}

interface CreateRoomInput {
  clientId?: string;
  displayName: string;
  difficulty: Difficulty;
  includesDeath: boolean;
  generationPrompt: string;
}

interface JoinRoomInput {
  clientId?: string;
  roomCode: string;
  displayName: string;
}

interface RestartRoomInput {
  difficulty: Difficulty;
  includesDeath: boolean;
  generationPrompt: string;
}

export class RoomService {
  private readonly realtimeListeners = new Set<(event: RoomRealtimeEvent) => void>();

  constructor(
    private readonly store: StateStore,
    private readonly ollamaService: OllamaService
  ) {}

  onRealtimeEvent(listener: (event: RoomRealtimeEvent) => void) {
    this.realtimeListeners.add(listener);
    return () => {
      this.realtimeListeners.delete(listener);
    };
  }

  async getOverview() {
    const [state, puzzles] = await Promise.all([this.store.readState(), this.store.loadPuzzles()]);
    const rooms = sortByUpdatedAt(state.rooms);
    const now = Date.now();
    const participants = rooms.flatMap((room) => room.participants);
    const onlineParticipantCount = participants.filter((participant) => this.isParticipantOnline(participant.lastSeenAt, now))
      .length;

    return {
      summary: {
        puzzleSeedCount: puzzles.length,
        roomCount: rooms.length,
        activeRoomCount: rooms.filter((room) => room.status === 'playing').length,
        solvedRoomCount: rooms.filter((room) => room.status === 'solved').length,
        failedRoomCount: rooms.filter((room) => room.status === 'failed').length,
        participantCount: participants.length,
        onlineParticipantCount
      },
      ollama: {
        configured: Boolean(
          this.findSupplier(state.ollama.suppliers, state.ollama.generationSupplierId) &&
            state.ollama.generationModel &&
            this.findSupplier(state.ollama.suppliers, state.ollama.validationSupplierId) &&
            state.ollama.validationModel
        ),
        supplierCount: state.ollama.suppliers.length,
        generationTimeoutMs: state.ollama.generationTimeoutMs,
        generationSupplierLabel: this.findSupplier(state.ollama.suppliers, state.ollama.generationSupplierId)?.label ?? '',
        generationModel: state.ollama.generationModel,
        validationSupplierLabel: this.findSupplier(state.ollama.suppliers, state.ollama.validationSupplierId)?.label ?? '',
        validationModel: state.ollama.validationModel,
        modelCount: state.ollama.suppliers.reduce((total, supplier) => total + supplier.availableModels.length, 0),
        lastStatus: this.resolveOverviewStatus(state.ollama),
        lastError: this.resolveOverviewError(state.ollama),
        lastCheckedAt: this.resolveOverviewLastCheckedAt(state.ollama)
      },
      latestRooms: rooms.slice(0, 6).map((room) => this.toPublicRoom(room))
    };
  }

  async listPuzzles() {
    const puzzles = await this.store.loadPuzzles();
    return puzzles.map((puzzle) => this.toPublicPuzzle(puzzle));
  }

  async listRooms() {
    const state = await this.store.readState();
    return sortByUpdatedAt(state.rooms).map((room) => this.toPublicRoom(room));
  }

  async deleteRoom(roomId: string) {
    let deletedRoomId = '';
    let deletedRoomCode = '';
    let hasDeletedRoom = false;

    await this.store.updateState((current) => {
      const room = this.findRoomOrThrow(current.rooms, roomId);
      deletedRoomId = room.roomId;
      deletedRoomCode = room.roomCode;
      hasDeletedRoom = true;

      return {
        ...current,
        rooms: current.rooms.filter((item) => item.roomId !== room.roomId)
      };
    });

    if (!hasDeletedRoom) {
      return;
    }

    this.emitRoomDeleted(deletedRoomId, deletedRoomCode);
  }

  async getRoomByCode(roomCode: string) {
    const state = await this.store.readState();
    const normalizedRoomCode = this.normalizeRoomCode(roomCode);
    const room = state.rooms.find((item) => item.roomCode === normalizedRoomCode);
    return room ? this.toPublicRoom(room) : null;
  }

  async createRoom(input: CreateRoomInput): Promise<RoomJoinResult> {
    const state = await this.store.readState();
    const generationModeLabel = this.resolveGenerationPromptLabel();
    const generationSupplier = this.findSupplier(state.ollama.suppliers, state.ollama.generationSupplierId);
    const generationStartedAtMs = Date.now();
    const clientId = this.normalizeClientId(input.clientId);
    const timestamp = nowIso();
    const host: RoomParticipant = {
      participantId: nanoid(),
      clientId,
      displayName: this.normalizeDisplayName(input.displayName),
      role: 'host',
      joinedAt: timestamp,
      lastSeenAt: timestamp
    };
    let puzzle;

    try {
      console.info(
        JSON.stringify({
          scope: 'room',
          stage: 'create_room_generation_start',
          timestamp,
          difficulty: input.difficulty,
          promptMode: generationModeLabel,
          generationSupplier: generationSupplier?.label ?? null,
          generationProvider: generationSupplier?.provider ?? null,
          generationModel: state.ollama.generationModel,
          validationSupplier: null,
          validationProvider: null,
          validationModel: null
        })
      );
      puzzle = await this.ollamaService.generatePuzzle(
        generationSupplier,
        state.ollama.generationModel,
        {
          difficulty: input.difficulty,
          prompt: '',
          includesDeath: input.includesDeath
        },
        {
          timeoutMs: this.resolveGenerationTimeoutMs(state.ollama.generationTimeoutMs, generationSupplier)
        }
      );
      console.info(
        JSON.stringify({
          scope: 'room',
          stage: 'create_room_generation_success',
          timestamp: nowIso(),
          puzzleTitle: puzzle.title,
          difficulty: puzzle.difficulty,
          generationSource: puzzle.generationSource ?? 'unknown',
          generationFailureReason: puzzle.generationFailureReason ?? null
        })
      );
    } catch (error) {
      console.error(
        JSON.stringify({
          scope: 'room',
          stage: 'create_room_generation_error',
          timestamp: nowIso(),
          message: error instanceof Error ? error.message : String(error)
        })
      );
      throw new ServiceError(503, error instanceof Error ? error.message : '当前无法生成可游玩的海龟汤，请稍后再试。');
    }
    const generationDurationMs = Math.max(0, Date.now() - generationStartedAtMs);
    const roomCode = this.createUniqueRoomCode(state.rooms);
    const room: GameRoom = {
      roomId: nanoid(),
      roomCode,
      title: puzzle.title,
      generationPrompt: generationModeLabel,
      generationDurationMs,
      generationSource: puzzle.generationSource ?? 'unknown',
      generationFailureReason: puzzle.generationFailureReason ?? null,
      puzzleId: puzzle.puzzleId,
      puzzleTitle: puzzle.title,
      soupSurface: puzzle.soupSurface,
      truthStory: puzzle.truthStory,
      facts: puzzle.facts,
      includesDeath: puzzle.includesDeath,
      misleadingPoints: puzzle.misleadingPoints,
      keyTriggers: puzzle.keyTriggers,
      difficulty: puzzle.difficulty,
      tags: unique([...puzzle.tags, 'multiplayer']),
      participants: [host],
      messages: [
        {
          id: nanoid(),
          type: 'system',
          authorName: '系统',
          content:
            puzzle.generationSource === 'fallback'
              ? `${host.displayName} 创建了房间，本局已回落到稳定本地题兜底。`
              : `${host.displayName} 创建了房间，本局题目由 AI 生成。`,
          createdAt: timestamp
        },
        {
          id: nanoid(),
          type: 'status',
          authorName: AI_HOST_NAME,
          content: `汤面：${puzzle.soupSurface}`,
          createdAt: timestamp
        }
      ],
      questions: [],
      maxQuestionCount: this.resolveMaxQuestionCount(puzzle.difficulty),
      revealedFactIds: [],
      clues: [],
      hintUsageCount: 0,
      maxHintCount: 2,
      hintVote: null,
      pendingSubmission: null,
      progressScore: 0,
      status: 'playing',
      endingBadge: null,
      createdAt: timestamp,
      updatedAt: timestamp
    };

    await this.store.updateState((current) => ({
      ...current,
      rooms: [room, ...current.rooms]
    }));

    const publicRoom = this.toPublicRoom(room);
    this.emitRoomUpdated(publicRoom);

    return {
      room: publicRoom,
      participant: this.toPublicParticipant(host)
    };
  }

  async joinRoom(input: JoinRoomInput): Promise<RoomJoinResult> {
    const requestedName = this.normalizeDisplayName(input.displayName);
    const normalizedRoomCode = this.normalizeRoomCode(input.roomCode);
    const clientId = this.normalizeClientId(input.clientId);
    let participant: RoomParticipant | null = null;
    let updatedRoom: GameRoom | null = null;

    await this.store.updateState((state) => {
      const room = state.rooms.find((item) => item.roomCode === normalizedRoomCode);

      if (!room) {
        throw new ServiceError(404, '房间不存在。');
      }

      const timestamp = nowIso();
      const existingParticipant = clientId ? room.participants.find((item) => item.clientId === clientId) ?? null : null;

      if (existingParticipant) {
        const nextParticipant: RoomParticipant = {
          ...existingParticipant,
          lastSeenAt: timestamp
        };
        participant = nextParticipant;

        const nextRoom: GameRoom = {
          ...room,
          participants: room.participants.map((item) => (item.participantId === existingParticipant.participantId ? nextParticipant : item)),
          updatedAt: timestamp
        };
        updatedRoom = nextRoom;

        return {
          ...state,
          rooms: state.rooms.map((item) => (item.roomId === room.roomId ? nextRoom : item))
        };
      }

      const nextParticipant: RoomParticipant = {
        participantId: nanoid(),
        clientId,
        displayName: this.makeUniqueDisplayName(room.participants, requestedName),
        role: 'player',
        joinedAt: timestamp,
        lastSeenAt: timestamp
      };
      participant = nextParticipant;

      const nextRoom: GameRoom = {
        ...room,
        participants: [...room.participants, nextParticipant],
        messages: [
          ...room.messages,
          {
            id: nanoid(),
            type: 'system',
            authorName: '系统',
            content: `${nextParticipant.displayName} 加入了房间。`,
            createdAt: timestamp
          }
        ],
        updatedAt: timestamp
      };
      updatedRoom = nextRoom;

      return {
        ...state,
        rooms: state.rooms.map((item) => (item.roomId === room.roomId ? nextRoom : item))
      };
    });

    if (!participant || !updatedRoom) {
      throw new ServiceError(500, '加入房间失败。');
    }

    const publicRoom = this.toPublicRoom(updatedRoom);
    this.emitRoomUpdated(publicRoom);

    return {
      room: publicRoom,
      participant: this.toPublicParticipant(participant)
    };
  }

  async askQuestion(roomId: string, participantId: string, question: string) {
    const startedAt = nowIso();
    let lockedRoom: GameRoom | null = null;
    let participant: RoomParticipant | null = null;
    let validationSupplier: OllamaSupplier | null = null;
    let validationModel = '';

    await this.store.updateState((current) => {
      const currentRoom = this.findRoomOrThrow(current.rooms, roomId);

      if (currentRoom.status !== 'playing') {
        throw new ServiceError(409, '\u623f\u95f4\u5df2\u7ecf\u7ed3\u7b97\uff0c\u4e0d\u80fd\u7ee7\u7eed\u63d0\u95ee\u3002');
      }

      this.assertQuestionLimitAvailable(currentRoom);
      this.assertNoPendingSubmission(currentRoom.pendingSubmission);
      const currentParticipant = this.findParticipantOrThrow(currentRoom, participantId);
      participant = currentParticipant;
      validationSupplier = this.findSupplier(current.ollama.suppliers, current.ollama.validationSupplierId);
      validationModel = current.ollama.validationModel;

      const nextRoom: GameRoom = {
        ...currentRoom,
        pendingSubmission: this.createPendingSubmission('question', currentParticipant, startedAt),
        updatedAt: startedAt
      };

      lockedRoom = nextRoom;

      return {
        ...current,
        rooms: current.rooms.map((item) => (item.roomId === roomId ? nextRoom : item))
      };
    });

    if (!lockedRoom || !participant) {
      throw new ServiceError(500, '\u63d0\u4ea4\u95ee\u9898\u65f6\u53d1\u751f\u4e86\u610f\u5916\u9519\u8bef\u3002');
    }

    const submissionRoom: GameRoom = lockedRoom as GameRoom;
    const submissionParticipant: RoomParticipant = participant as RoomParticipant;

    this.emitRoomUpdated(this.toPublicRoom(submissionRoom));

    try {
      const evaluation = await this.ollamaService.evaluateQuestion(
        validationSupplier,
        validationModel,
        this.toPuzzle(submissionRoom),
        this.toRoomContext(submissionRoom),
        question
      );
      const timestamp = nowIso();
      const answerLabel = ANSWER_LABELS[evaluation.answerCode];
      const nextProgressScore = this.resolveQuestionProgressScore(submissionRoom, evaluation);
      const questionRecord: QuestionRecord = {
        id: nanoid(),
        askedByParticipantId: submissionParticipant.participantId,
        askedByName: submissionParticipant.displayName,
        question,
        answerCode: evaluation.answerCode,
        answerLabel,
        matchedFactIds: evaluation.matchedFactIds,
        revealedFactIds: evaluation.revealedFactIds,
        progressDelta: Math.max(0, nextProgressScore - submissionRoom.progressScore),
        createdAt: timestamp,
        source: evaluation.source,
        reasoning: evaluation.reasoning,
        clueStatement: null
      };

      const nextState = await this.store.updateState((current) => {
        const currentRoom = this.findRoomOrThrow(current.rooms, roomId);

        if (currentRoom.status !== 'playing') {
          throw new ServiceError(409, '\u623f\u95f4\u5df2\u7ecf\u7ed3\u7b97\uff0c\u4e0d\u80fd\u7ee7\u7eed\u63d0\u95ee\u3002');
        }

        this.findParticipantOrThrow(currentRoom, participantId);
        this.assertSubmissionOwner(currentRoom.pendingSubmission, participantId, 'question');

        const revealedFactIds = unique([...currentRoom.revealedFactIds, ...evaluation.revealedFactIds]);
        const normalizedClueStatement = this.normalizeClueStatement(evaluation.clueStatement);
        const existingClue = normalizedClueStatement
          ? currentRoom.clues.find((clue) => this.normalizeClueStatement(clue.statement) === normalizedClueStatement) ?? null
          : null;
        const nextClue: RoomClue | null =
          normalizedClueStatement && !existingClue
            ? {
                clueId: nanoid(),
                statement: normalizedClueStatement,
                sourceQuestionId: questionRecord.id,
                createdAt: timestamp
              }
            : null;
        const persistedQuestionRecord: QuestionRecord = {
          ...questionRecord,
          clueStatement: nextClue?.statement ?? existingClue?.statement ?? null
        };
        const messages: RoomMessage[] = [
          ...currentRoom.messages,
          {
            id: `${persistedQuestionRecord.id}-question`,
            type: 'question',
            authorName: submissionParticipant.displayName,
            content: question,
            createdAt: timestamp,
            source: evaluation.source
          },
          {
            id: `${persistedQuestionRecord.id}-answer`,
            type: 'answer',
            authorName: AI_HOST_NAME,
            content: answerLabel,
            createdAt: timestamp,
            answerCode: evaluation.answerCode,
            answerLabel,
            source: evaluation.source
          }
        ];

        if (nextClue) {
          messages.push({
            id: `${persistedQuestionRecord.id}-clue`,
            type: 'status',
            authorName: AI_HOST_NAME,
            content: `新增线索：${nextClue.statement}`,
            createdAt: timestamp,
            source: evaluation.source
          });
        }

        const nextRoom: GameRoom = {
          ...currentRoom,
          participants: currentRoom.participants.map((item) =>
            item.participantId === participantId ? { ...item, lastSeenAt: timestamp } : item
          ),
          messages,
          questions: [...currentRoom.questions, persistedQuestionRecord],
          revealedFactIds,
          clues: nextClue ? [...currentRoom.clues, nextClue] : currentRoom.clues,
          pendingSubmission: null,
          progressScore: nextProgressScore,
          updatedAt: timestamp
        };

        return {
          ...current,
          rooms: current.rooms.map((item) => (item.roomId === roomId ? nextRoom : item))
        };
      });

      const publicRoom = this.toPublicRoom(this.findRoomOrThrow(nextState.rooms, roomId));
      this.emitRoomUpdated(publicRoom);
      return publicRoom;
    } catch (error) {
      const clearedRoom = await this.clearPendingSubmission(roomId, participantId, 'question');

      if (clearedRoom) {
        this.emitRoomUpdated(this.toPublicRoom(clearedRoom));
      }

      throw error;
    }
  }

  async submitFinalGuess(roomId: string, participantId: string, guess: string) {
    const startedAt = nowIso();
    let lockedRoom: GameRoom | null = null;
    let participant: RoomParticipant | null = null;
    let validationSupplier: OllamaSupplier | null = null;
    let validationModel = '';

    await this.store.updateState((current) => {
      const currentRoom = this.findRoomOrThrow(current.rooms, roomId);

      if (currentRoom.status !== 'playing') {
        throw new ServiceError(409, '\u623f\u95f4\u5df2\u7ecf\u7ed3\u7b97\uff0c\u4e0d\u80fd\u518d\u6b21\u63d0\u4ea4\u6700\u7ec8\u731c\u6d4b\u3002');
      }

      this.assertNoPendingSubmission(currentRoom.pendingSubmission);
      const currentParticipant = this.findParticipantOrThrow(currentRoom, participantId);
      participant = currentParticipant;
      validationSupplier = this.findSupplier(current.ollama.suppliers, current.ollama.validationSupplierId);
      validationModel = current.ollama.validationModel;

      const nextRoom: GameRoom = {
        ...currentRoom,
        pendingSubmission: this.createPendingSubmission('final_guess', currentParticipant, startedAt),
        updatedAt: startedAt
      };

      lockedRoom = nextRoom;

      return {
        ...current,
        rooms: current.rooms.map((item) => (item.roomId === roomId ? nextRoom : item))
      };
    });

    if (!lockedRoom || !participant) {
      throw new ServiceError(500, '\u63d0\u4ea4\u6700\u7ec8\u731c\u6d4b\u65f6\u53d1\u751f\u4e86\u610f\u5916\u9519\u8bef\u3002');
    }

    const submissionRoom: GameRoom = lockedRoom as GameRoom;
    const submissionParticipant: RoomParticipant = participant as RoomParticipant;

    this.emitRoomUpdated(this.toPublicRoom(submissionRoom));

    try {
      const evaluation = await this.ollamaService.evaluateFinalGuess(
        validationSupplier,
        validationModel,
        this.toPuzzle(submissionRoom),
        this.toRoomContext(submissionRoom),
        guess
      );
      const timestamp = nowIso();
      const nextStatus = evaluation.accepted ? 'solved' : 'failed';
      const finalGuess: FinalGuessRecord = {
        participantId: submissionParticipant.participantId,
        participantName: submissionParticipant.displayName,
        guess,
        accepted: evaluation.accepted,
        score: evaluation.score,
        missingPoints: evaluation.missingPoints,
        createdAt: timestamp,
        source: evaluation.source,
        reasoning: evaluation.reasoning
      };

      const nextState = await this.store.updateState((current) => {
        const currentRoom = this.findRoomOrThrow(current.rooms, roomId);

        if (currentRoom.status !== 'playing') {
          throw new ServiceError(409, '\u623f\u95f4\u5df2\u7ecf\u7ed3\u7b97\uff0c\u4e0d\u80fd\u518d\u6b21\u63d0\u4ea4\u6700\u7ec8\u731c\u6d4b\u3002');
        }

        this.findParticipantOrThrow(currentRoom, participantId);
        this.assertSubmissionOwner(currentRoom.pendingSubmission, participantId, 'final_guess');

        const nextRoom: GameRoom = {
          ...currentRoom,
          participants: currentRoom.participants.map((item) =>
            item.participantId === participantId ? { ...item, lastSeenAt: timestamp } : item
          ),
          messages: [
            ...currentRoom.messages,
            {
              id: `${finalGuess.participantId}-guess-${timestamp}`,
              type: 'guess',
              authorName: submissionParticipant.displayName,
              content: guess,
              createdAt: timestamp,
              source: evaluation.source
            },
            {
              id: `${finalGuess.participantId}-status-${timestamp}`,
              type: 'status',
              authorName: AI_HOST_NAME,
              content: evaluation.accepted
                ? `\u6700\u7ec8\u731c\u6d4b\u901a\u8fc7\uff0c\u623f\u95f4\u5df2\u7834\u6848\u3002\u5f97\u5206 ${evaluation.score}%\u3002`
                : `\u6700\u7ec8\u731c\u6d4b\u672a\u901a\u8fc7\uff0c\u623f\u95f4\u5df2\u7ed3\u7b97\u3002\u5f97\u5206 ${evaluation.score}%\u3002`,
              createdAt: timestamp,
              source: evaluation.source
            }
          ],
          hintVote: null,
          pendingSubmission: null,
          status: nextStatus,
          progressScore: clampProgress(Math.max(currentRoom.progressScore, evaluation.score)),
          endingBadge: this.resolveEndingBadge(nextStatus, currentRoom.hintUsageCount, false),
          finalGuess,
          updatedAt: timestamp
        };

        return {
          ...current,
          rooms: current.rooms.map((item) => (item.roomId === roomId ? nextRoom : item))
        };
      });

      const publicRoom = this.toPublicRoom(this.findRoomOrThrow(nextState.rooms, roomId));
      this.emitRoomUpdated(publicRoom);
      return publicRoom;
    } catch (error) {
      const clearedRoom = await this.clearPendingSubmission(roomId, participantId, 'final_guess');

      if (clearedRoom) {
        this.emitRoomUpdated(this.toPublicRoom(clearedRoom));
      }

      throw error;
    }
  }

  async requestHint(roomId: string, participantId: string) {
    let pendingRoom: GameRoom | null = null;
    let pendingParticipantId = '';
    let validationSupplier: OllamaSupplier | null = null;
    let validationModel = '';

    const nextState = await this.store.updateState((current) => {
      const currentRoom = this.findRoomOrThrow(current.rooms, roomId);

      if (currentRoom.status !== 'playing') {
        throw new ServiceError(409, '房间已经结算，不能再请求提示。');
      }

      this.assertNoPendingSubmission(currentRoom.pendingSubmission);
      this.assertHintAvailable(currentRoom);

      if (currentRoom.hintVote) {
        throw new ServiceError(409, '当前已有提示投票，请先等待其他成员表态。');
      }

      const currentParticipant = this.findParticipantOrThrow(currentRoom, participantId);
      const timestamp = nowIso();
      const hintVote = this.createHintVote(currentParticipant, timestamp);
      const everyoneApproved = this.isHintVoteApproved(currentRoom.participants, hintVote);
      const nextRoom: GameRoom = {
        ...currentRoom,
        participants: currentRoom.participants.map((item) =>
          item.participantId === participantId ? { ...item, lastSeenAt: timestamp } : item
        ),
        messages: [
          ...currentRoom.messages,
          {
            id: `${currentRoom.roomId}-hint-request-${timestamp}`,
            type: 'status',
            authorName: AI_HOST_NAME,
            content: everyoneApproved
              ? '所有成员都已同意使用提示，AI 主持正在整理一个不剧透的方向。'
              : `${currentParticipant.displayName} 发起了提示投票，所有成员同意后才能获得提示。`,
            createdAt: timestamp
          }
        ],
        hintVote: everyoneApproved ? null : hintVote,
        pendingSubmission: everyoneApproved ? this.createPendingSubmission('hint', currentParticipant, timestamp) : null,
        updatedAt: timestamp
      };

      if (everyoneApproved) {
        pendingRoom = nextRoom;
        pendingParticipantId = currentParticipant.participantId;
        validationSupplier = this.findSupplier(current.ollama.suppliers, current.ollama.validationSupplierId);
        validationModel = current.ollama.validationModel;
      }

      return {
        ...current,
        rooms: current.rooms.map((item) => (item.roomId === roomId ? nextRoom : item))
      };
    });

    if (pendingRoom) {
      return this.finalizeHint(roomId, pendingParticipantId, pendingRoom, validationSupplier, validationModel);
    }

    const publicRoom = this.toPublicRoom(this.findRoomOrThrow(nextState.rooms, roomId));
    this.emitRoomUpdated(publicRoom);
    return publicRoom;
  }

  async approveHint(roomId: string, participantId: string) {
    let pendingRoom: GameRoom | null = null;
    let pendingParticipantId = '';
    let validationSupplier: OllamaSupplier | null = null;
    let validationModel = '';

    const nextState = await this.store.updateState((current) => {
      const currentRoom = this.findRoomOrThrow(current.rooms, roomId);

      if (currentRoom.status !== 'playing') {
        throw new ServiceError(409, '房间已经结算，不能再请求提示。');
      }

      this.assertNoPendingSubmission(currentRoom.pendingSubmission);
      this.assertHintAvailable(currentRoom);

      if (!currentRoom.hintVote) {
        throw new ServiceError(409, '当前还没有进行中的提示投票。');
      }

      const currentParticipant = this.findParticipantOrThrow(currentRoom, participantId);

      if (currentRoom.hintVote.approvals.includes(participantId)) {
        throw new ServiceError(409, '你已经同意过本轮提示投票了。');
      }

      const timestamp = nowIso();
      const nextHintVote: HintVote = {
        ...currentRoom.hintVote,
        approvals: unique([...currentRoom.hintVote.approvals, participantId])
      };
      const everyoneApproved = this.isHintVoteApproved(currentRoom.participants, nextHintVote);
      const hintOwner = this.findParticipantOrThrow(currentRoom, currentRoom.hintVote.proposedByParticipantId);
      const nextRoom: GameRoom = {
        ...currentRoom,
        participants: currentRoom.participants.map((item) =>
          item.participantId === participantId ? { ...item, lastSeenAt: timestamp } : item
        ),
        messages: everyoneApproved
          ? [
              ...currentRoom.messages,
              {
                id: `${currentRoom.roomId}-hint-approved-${timestamp}`,
                type: 'status',
                authorName: AI_HOST_NAME,
                content: '所有成员都已同意使用提示，AI 主持正在整理一个不剧透的方向。',
                createdAt: timestamp
              }
            ]
          : currentRoom.messages,
        hintVote: everyoneApproved ? null : nextHintVote,
        pendingSubmission: everyoneApproved ? this.createPendingSubmission('hint', hintOwner, timestamp) : null,
        updatedAt: timestamp
      };

      if (everyoneApproved) {
        pendingRoom = nextRoom;
        pendingParticipantId = hintOwner.participantId;
        validationSupplier = this.findSupplier(current.ollama.suppliers, current.ollama.validationSupplierId);
        validationModel = current.ollama.validationModel;
      }

      return {
        ...current,
        rooms: current.rooms.map((item) => (item.roomId === roomId ? nextRoom : item))
      };
    });

    if (pendingRoom) {
      return this.finalizeHint(roomId, pendingParticipantId, pendingRoom, validationSupplier, validationModel);
    }

    const publicRoom = this.toPublicRoom(this.findRoomOrThrow(nextState.rooms, roomId));
    this.emitRoomUpdated(publicRoom);
    return publicRoom;
  }

  async revealRoom(roomId: string, participantId: string) {
    const nextState = await this.store.updateState((current) => {
      const room = this.findRoomOrThrow(current.rooms, roomId);
      const participant = this.findParticipantOrThrow(room, participantId);

      if (participant.role !== 'host') {
        throw new ServiceError(403, '只有房主可以公开汤底。');
      }

      this.assertNoPendingSubmission(room.pendingSubmission);
      const timestamp = nowIso();
      const nextRoom: GameRoom = {
        ...room,
        participants: room.participants.map((item) =>
          item.participantId === participantId ? { ...item, lastSeenAt: timestamp } : item
        ),
        messages: [
          ...room.messages,
          {
            id: `${room.roomId}-reveal-${timestamp}`,
            type: 'status',
            authorName: AI_HOST_NAME,
            content: '房主已公开汤底，本局结束。',
            createdAt: timestamp
          }
        ],
        hintVote: null,
        status: room.status === 'playing' ? 'failed' : room.status,
        endingBadge: room.status === 'playing' ? this.resolveEndingBadge('failed', room.hintUsageCount, true) : room.endingBadge,
        updatedAt: timestamp
      };

      return {
        ...current,
        rooms: current.rooms.map((item) => (item.roomId === roomId ? nextRoom : item))
      };
    });

    const publicRoom = this.toPublicRoom(this.findRoomOrThrow(nextState.rooms, roomId));
    this.emitRoomUpdated(publicRoom);
    return publicRoom;
  }

  async restartRoom(roomId: string, participantId: string, input: RestartRoomInput) {
    const state = await this.store.readState();
    const room = this.findRoomOrThrow(state.rooms, roomId);

    if (room.status === 'playing') {
      throw new ServiceError(409, '房间仍在进行中，暂时不能重新开局。');
    }

    const participant = this.findParticipantOrThrow(room, participantId);

    if (participant.role !== 'host') {
      throw new ServiceError(403, '只有房主可以重新开局。');
    }

    const generationModeLabel = this.resolveGenerationPromptLabel();
    const generationSupplier = this.findSupplier(state.ollama.suppliers, state.ollama.generationSupplierId);
    const generationStartedAtMs = Date.now();
    let puzzle;

    try {
      console.info(
        JSON.stringify({
          scope: 'room',
          stage: 'restart_room_generation_start',
          timestamp: nowIso(),
          roomId,
          difficulty: input.difficulty,
          promptMode: generationModeLabel,
          generationSupplier: generationSupplier?.label ?? null,
          generationProvider: generationSupplier?.provider ?? null,
          generationModel: state.ollama.generationModel,
          validationSupplier: null,
          validationProvider: null,
          validationModel: null
        })
      );
      puzzle = await this.ollamaService.generatePuzzle(
        generationSupplier,
        state.ollama.generationModel,
        {
          difficulty: input.difficulty,
          prompt: '',
          includesDeath: input.includesDeath
        },
        {
          timeoutMs: this.resolveGenerationTimeoutMs(state.ollama.generationTimeoutMs, generationSupplier)
        }
      );
      console.info(
        JSON.stringify({
          scope: 'room',
          stage: 'restart_room_generation_success',
          timestamp: nowIso(),
          roomId,
          puzzleTitle: puzzle.title,
          difficulty: puzzle.difficulty,
          generationSource: puzzle.generationSource ?? 'unknown',
          generationFailureReason: puzzle.generationFailureReason ?? null
        })
      );
    } catch (error) {
      console.error(
        JSON.stringify({
          scope: 'room',
          stage: 'restart_room_generation_error',
          timestamp: nowIso(),
          roomId,
          message: error instanceof Error ? error.message : String(error)
        })
      );
      throw new ServiceError(503, error instanceof Error ? error.message : '当前无法生成可游玩的海龟汤，请稍后再试。');
    }
    const generationDurationMs = Math.max(0, Date.now() - generationStartedAtMs);
    const timestamp = nowIso();

    const nextState = await this.store.updateState((current) => {
      const currentRoom = this.findRoomOrThrow(current.rooms, roomId);
      const currentParticipant = this.findParticipantOrThrow(currentRoom, participantId);

      if (currentParticipant.role !== 'host') {
        throw new ServiceError(403, '只有房主可以重新开局。');
      }

      const nextRoom: GameRoom = {
        ...currentRoom,
        title: puzzle.title,
        generationPrompt: generationModeLabel,
        generationDurationMs,
        generationSource: puzzle.generationSource ?? 'unknown',
        generationFailureReason: puzzle.generationFailureReason ?? null,
        puzzleId: puzzle.puzzleId,
        puzzleTitle: puzzle.title,
        soupSurface: puzzle.soupSurface,
        truthStory: puzzle.truthStory,
        facts: puzzle.facts,
        includesDeath: puzzle.includesDeath,
        misleadingPoints: puzzle.misleadingPoints,
        keyTriggers: puzzle.keyTriggers,
        difficulty: puzzle.difficulty,
        tags: unique([...puzzle.tags, 'multiplayer']),
        participants: currentRoom.participants.map((item) =>
          item.participantId === participantId ? { ...item, lastSeenAt: timestamp } : item
        ),
        messages: [
          {
            id: nanoid(),
            type: 'system',
            authorName: '系统',
            content:
              puzzle.generationSource === 'fallback'
                ? `${currentParticipant.displayName} 开启了新一轮，之前的问答记录已清空，本局暂时使用稳定本地题兜底。`
                : `${currentParticipant.displayName} 开启了新一轮，之前的问答记录已清空，本局题目由 AI 生成。`,
            createdAt: timestamp
          },
          {
            id: nanoid(),
            type: 'status',
            authorName: AI_HOST_NAME,
            content: `汤面：${puzzle.soupSurface}`,
            createdAt: timestamp
          }
        ],
        questions: [],
        maxQuestionCount: this.resolveMaxQuestionCount(puzzle.difficulty),
        revealedFactIds: [],
        clues: [],
        hintUsageCount: 0,
        maxHintCount: currentRoom.maxHintCount,
        hintVote: null,
        pendingSubmission: null,
        progressScore: 0,
        status: 'playing',
        endingBadge: null,
        finalGuess: undefined,
        updatedAt: timestamp
      };

      return {
        ...current,
        rooms: current.rooms.map((item) => (item.roomId === roomId ? nextRoom : item))
      };
    });

    const publicRoom = this.toPublicRoom(this.findRoomOrThrow(nextState.rooms, roomId));
    this.emitRoomUpdated(publicRoom);
    return publicRoom;
  }

  async heartbeatRoom(roomId: string, participantId: string) {
    const nextState = await this.store.updateState((current) => {
      const room = this.findRoomOrThrow(current.rooms, roomId);
      this.findParticipantOrThrow(room, participantId);
      const timestamp = nowIso();
      const nextRoom: GameRoom = {
        ...room,
        participants: room.participants.map((item) =>
          item.participantId === participantId ? { ...item, lastSeenAt: timestamp } : item
        ),
        updatedAt: room.updatedAt
      };

      return {
        ...current,
        rooms: current.rooms.map((item) => (item.roomId === roomId ? nextRoom : item))
      };
    });

    return this.toPublicRoom(this.findRoomOrThrow(nextState.rooms, roomId));
  }

  async getOllamaConfig() {
    const state = await this.store.readState();
    return state.ollama;
  }

  async createOllamaSupplier(input: {
    label: string;
    provider: OllamaSupplier['provider'];
    baseUrl: string;
    apiKey: string;
    timeoutMs: number;
  }) {
    const checkResult = await this.ollamaService.checkConnection(input.provider, input.baseUrl, input.apiKey, input.timeoutMs);
    const supplier: OllamaSupplier = {
      supplierId: nanoid(),
      label: this.normalizeSupplierLabel(input.label),
      provider: input.provider,
      baseUrl: checkResult.normalizedBaseUrl,
      apiKey: input.apiKey.trim(),
      timeoutMs: input.timeoutMs,
      availableModels: checkResult.models,
      lastCheckedAt: nowIso(),
      lastStatus: checkResult.reachable ? 'connected' : 'error',
      lastError: checkResult.reachable ? null : checkResult.message
    };

    const nextState = await this.store.updateState((state) => ({
      ...state,
      ollama: {
        ...state.ollama,
        suppliers: [...state.ollama.suppliers, supplier],
        generationSupplierId: state.ollama.generationSupplierId || supplier.supplierId,
        validationSupplierId: state.ollama.validationSupplierId || supplier.supplierId
      }
    }));

    return nextState.ollama;
  }

  async updateOllamaSupplier(
    supplierId: string,
    input: {
      label: string;
      provider: OllamaSupplier['provider'];
      baseUrl: string;
      apiKey: string;
      timeoutMs: number;
    }
  ) {
    const checkResult = await this.ollamaService.checkConnection(input.provider, input.baseUrl, input.apiKey, input.timeoutMs);

    const nextState = await this.store.updateState((state) => {
      const supplier = this.findSupplierOrThrow(state.ollama.suppliers, supplierId);
      const nextSupplier: OllamaSupplier = {
        ...supplier,
        label: this.normalizeSupplierLabel(input.label),
        provider: input.provider,
        baseUrl: checkResult.normalizedBaseUrl,
        apiKey: input.apiKey.trim(),
        timeoutMs: input.timeoutMs,
        availableModels: checkResult.models,
        lastCheckedAt: nowIso(),
        lastStatus: checkResult.reachable ? 'connected' : 'error',
        lastError: checkResult.reachable ? null : checkResult.message
      };

      return {
        ...state,
        ollama: {
          ...state.ollama,
          suppliers: state.ollama.suppliers.map((item) => (item.supplierId === supplierId ? nextSupplier : item)),
          generationModel: state.ollama.generationSupplierId === supplierId
            ? this.resolveModelSelection(checkResult.models, state.ollama.generationModelCategory, state.ollama.generationModel)
            : state.ollama.generationModel,
          validationModel: state.ollama.validationSupplierId === supplierId
            ? this.resolveModelSelection(checkResult.models, state.ollama.validationModelCategory, state.ollama.validationModel)
            : state.ollama.validationModel
        }
      };
    });

    return nextState.ollama;
  }

  async deleteOllamaSupplier(supplierId: string) {
    const nextState = await this.store.updateState((state) => {
      this.findSupplierOrThrow(state.ollama.suppliers, supplierId);
      const nextSuppliers = state.ollama.suppliers.filter((item) => item.supplierId !== supplierId);
      const fallbackSupplierId = nextSuppliers[0]?.supplierId ?? '';
      const generationSupplierId =
        state.ollama.generationSupplierId === supplierId ? fallbackSupplierId : state.ollama.generationSupplierId;
      const validationSupplierId =
        state.ollama.validationSupplierId === supplierId ? fallbackSupplierId : state.ollama.validationSupplierId;

      return {
        ...state,
        ollama: {
          ...state.ollama,
          suppliers: nextSuppliers,
          generationSupplierId,
          generationModel: generationSupplierId
            ? this.resolveModelSelection(
                this.findSupplier(nextSuppliers, generationSupplierId)?.availableModels ?? [],
                state.ollama.generationModelCategory,
                state.ollama.generationModel
              )
            : '',
          validationSupplierId,
          validationModel: validationSupplierId
            ? this.resolveModelSelection(
                this.findSupplier(nextSuppliers, validationSupplierId)?.availableModels ?? [],
                state.ollama.validationModelCategory,
                state.ollama.validationModel
              )
            : ''
        }
      };
    });

    return nextState.ollama;
  }

  async refreshOllamaSupplierModels(supplierId: string) {
    const state = await this.store.readState();
    const supplier = this.findSupplierOrThrow(state.ollama.suppliers, supplierId);
    const checkResult = await this.ollamaService.checkConnection(
      supplier.provider,
      supplier.baseUrl,
      supplier.apiKey,
      supplier.timeoutMs
    );

    const nextState = await this.store.updateState((current) => {
      const currentSupplier = this.findSupplierOrThrow(current.ollama.suppliers, supplierId);
      const nextSupplier: OllamaSupplier = {
        ...currentSupplier,
        baseUrl: checkResult.normalizedBaseUrl,
        availableModels: checkResult.models,
        lastCheckedAt: nowIso(),
        lastStatus: checkResult.reachable ? 'connected' : 'error',
        lastError: checkResult.reachable ? null : checkResult.message
      };

      return {
        ...current,
        ollama: {
          ...current.ollama,
          suppliers: current.ollama.suppliers.map((item) => (item.supplierId === supplierId ? nextSupplier : item)),
          generationModel:
            current.ollama.generationSupplierId === supplierId
              ? this.resolveModelSelection(checkResult.models, current.ollama.generationModelCategory, current.ollama.generationModel)
              : current.ollama.generationModel,
          validationModel:
            current.ollama.validationSupplierId === supplierId
              ? this.resolveModelSelection(checkResult.models, current.ollama.validationModelCategory, current.ollama.validationModel)
              : current.ollama.validationModel
        }
      };
    });

    return nextState.ollama;
  }

  async checkOllamaConnection(provider: OllamaSupplier['provider'], baseUrl: string, apiKey: string, timeoutMs: number) {
    return this.ollamaService.checkConnection(provider, baseUrl, apiKey, timeoutMs);
  }

  async saveOllamaRuntimeConfig(
    nextConfig: Pick<
      OllamaConfig,
      | 'generationTimeoutMs'
      | 'generationSupplierId'
      | 'generationModelCategory'
      | 'generationModel'
      | 'validationSupplierId'
      | 'validationModelCategory'
      | 'validationModel'
    >
  ) {
    const nextState = await this.store.updateState((state) => ({
      ...state,
      ollama: {
        ...state.ollama,
        generationSupplierId: nextConfig.generationSupplierId,
        generationTimeoutMs: nextConfig.generationTimeoutMs,
        generationModelCategory: nextConfig.generationModelCategory,
        generationModel: this.resolveModelSelection(
          this.findSupplier(state.ollama.suppliers, nextConfig.generationSupplierId)?.availableModels ?? [],
          nextConfig.generationModelCategory,
          nextConfig.generationModel
        ),
        validationSupplierId: nextConfig.validationSupplierId,
        validationModelCategory: nextConfig.validationModelCategory,
        validationModel: this.resolveModelSelection(
          this.findSupplier(state.ollama.suppliers, nextConfig.validationSupplierId)?.availableModels ?? [],
          nextConfig.validationModelCategory,
          nextConfig.validationModel
        )
      }
    }));

    return nextState.ollama;
  }

  private async finalizeHint(
    roomId: string,
    participantId: string,
    lockedRoom: GameRoom,
    validationSupplier: OllamaSupplier | null,
    validationModel: string
  ) {
    this.emitRoomUpdated(this.toPublicRoom(lockedRoom));

    try {
      const generatedHint = await this.ollamaService.generateHint(
        validationSupplier,
        validationModel,
        this.toPuzzle(lockedRoom),
        this.toRoomContext(lockedRoom)
      );
      const timestamp = nowIso();
      const nextState = await this.store.updateState((current) => {
        const currentRoom = this.findRoomOrThrow(current.rooms, roomId);

        if (currentRoom.status !== 'playing') {
          throw new ServiceError(409, '房间已经结算，不能再请求提示。');
        }

        this.assertSubmissionOwner(currentRoom.pendingSubmission, participantId, 'hint');
        this.assertHintAvailable(currentRoom);

        const nextRoom: GameRoom = {
          ...currentRoom,
          messages: [
            ...currentRoom.messages,
            {
              id: `${currentRoom.roomId}-hint-result-${timestamp}`,
              type: 'status',
              authorName: AI_HOST_NAME,
              content: generatedHint.hint.startsWith('提示：') ? generatedHint.hint : `提示：${generatedHint.hint}`,
              createdAt: timestamp,
              source: generatedHint.source
            }
          ],
          hintUsageCount: currentRoom.hintUsageCount + 1,
          hintVote: null,
          pendingSubmission: null,
          progressScore: clampProgress(currentRoom.progressScore + 6),
          updatedAt: timestamp
        };

        return {
          ...current,
          rooms: current.rooms.map((item) => (item.roomId === roomId ? nextRoom : item))
        };
      });
      const publicRoom = this.toPublicRoom(this.findRoomOrThrow(nextState.rooms, roomId));
      this.emitRoomUpdated(publicRoom);
      return publicRoom;
    } catch (error) {
      const clearedRoom = await this.clearPendingSubmission(roomId, participantId, 'hint');

      if (clearedRoom) {
        this.emitRoomUpdated(this.toPublicRoom(clearedRoom));
      }

      throw error;
    }
  }

  private createPendingSubmission(kind: SubmissionKind, participant: RoomParticipant, startedAt: string): PendingRoomSubmission {
    return {
      kind,
      participantId: participant.participantId,
      participantName: participant.displayName,
      startedAt
    };
  }

  private createHintVote(participant: RoomParticipant, createdAt: string): HintVote {
    return {
      proposedByParticipantId: participant.participantId,
      proposedByName: participant.displayName,
      approvals: [participant.participantId],
      createdAt
    };
  }

  private assertNoPendingSubmission(pendingSubmission: PendingRoomSubmission | null) {
    if (!pendingSubmission) {
      return;
    }

    throw new ServiceError(409, `${pendingSubmission.participantName} \u6b63\u5728\u63d0\u4ea4\u5185\u5bb9\uff0c\u8bf7\u7a0d\u5019\u518d\u8bd5\u3002`);
  }

  private assertSubmissionOwner(pendingSubmission: PendingRoomSubmission | null, participantId: string, kind: SubmissionKind) {
    if (!pendingSubmission || pendingSubmission.participantId !== participantId || pendingSubmission.kind !== kind) {
      throw new ServiceError(409, '\u5f53\u524d\u63d0\u4ea4\u72b6\u6001\u5df2\u53d8\u5316\uff0c\u8bf7\u7a0d\u5019\u518d\u8bd5\u3002');
    }
  }

  private assertHintAvailable(room: GameRoom) {
    if (room.hintUsageCount >= room.maxHintCount) {
      throw new ServiceError(409, '本局提示次数已经用完了。');
    }
  }

  private assertQuestionLimitAvailable(room: GameRoom) {
    if (room.maxQuestionCount !== null && room.questions.length >= room.maxQuestionCount) {
      throw new ServiceError(409, `本局提问次数已用完，最高难度最多只能提问 ${room.maxQuestionCount} 次。`);
    }
  }

  private isHintVoteApproved(participants: RoomParticipant[], hintVote: HintVote) {
    return participants.every((participant) => hintVote.approvals.includes(participant.participantId));
  }

  private async clearPendingSubmission(roomId: string, participantId: string, kind: SubmissionKind) {
    let clearedRoom: GameRoom | null = null;

    await this.store.updateState((current) => {
      const room = current.rooms.find((item) => item.roomId === roomId);

      if (!room) {
        return current;
      }

      if (!room.pendingSubmission || room.pendingSubmission.participantId !== participantId || room.pendingSubmission.kind !== kind) {
        return current;
      }

      const nextRoom: GameRoom = {
        ...room,
        pendingSubmission: null,
        updatedAt: nowIso()
      };
      clearedRoom = nextRoom;

      return {
        ...current,
        rooms: current.rooms.map((item) => (item.roomId === roomId ? nextRoom : item))
      };
    });

    return clearedRoom;
  }
  private normalizeDisplayName(value: string) {
    return value.trim().slice(0, 24);
  }

  private normalizeClientId(value?: string) {
    return value?.trim().slice(0, 64) ?? '';
  }

  private emitRealtimeEvent(event: RoomRealtimeEvent) {
    for (const listener of this.realtimeListeners) {
      listener(event);
    }
  }

  private emitRoomUpdated(room: PublicGameRoom) {
    this.emitRealtimeEvent({
      type: 'room.updated',
      roomCode: room.roomCode,
      room
    });
  }

  private emitRoomDeleted(roomId: string, roomCode: string) {
    this.emitRealtimeEvent({
      type: 'room.deleted',
      roomCode,
      roomId
    });
  }

  private resolveGenerationPromptLabel() {
    return '随机生成';
  }

  private normalizeRoomCode(value: string) {
    return value.trim().toUpperCase();
  }

  private normalizeSupplierLabel(value: string) {
    return value.trim().slice(0, 32) || '未命名供应商';
  }

  private resolveModelSelection(models: OllamaSupplier['availableModels'], category: OllamaConfig['generationModelCategory'], selected: string) {
    const normalizedSelected = selected.trim();
    const scopedModels = category === 'all' ? models : models.filter((model) => model.category === category);

    if (normalizedSelected && scopedModels.some((model) => model.name === normalizedSelected || model.model === normalizedSelected)) {
      return normalizedSelected;
    }

    if (scopedModels.length > 0) {
      return scopedModels[0]?.name || scopedModels[0]?.model || '';
    }

    if (normalizedSelected && models.some((model) => model.name === normalizedSelected || model.model === normalizedSelected)) {
      return normalizedSelected;
    }

    return models[0]?.name || models[0]?.model || '';
  }

  private findSupplier(suppliers: OllamaSupplier[], supplierId: string) {
    return suppliers.find((item) => item.supplierId === supplierId) ?? null;
  }

  private findSupplierOrThrow(suppliers: OllamaSupplier[], supplierId: string) {
    const supplier = this.findSupplier(suppliers, supplierId);

    if (!supplier) {
      throw new ServiceError(404, 'AI 供应商不存在。');
    }

    return supplier;
  }

  private resolveOverviewStatus(config: OllamaConfig) {
    const selectedSuppliers = [
      this.findSupplier(config.suppliers, config.generationSupplierId),
      this.findSupplier(config.suppliers, config.validationSupplierId)
    ].filter((item): item is OllamaSupplier => Boolean(item));

    if (selectedSuppliers.some((supplier) => supplier.lastStatus === 'error')) {
      return 'error';
    }

    if (selectedSuppliers.some((supplier) => supplier.lastStatus === 'connected')) {
      return 'connected';
    }

    return 'idle';
  }

  private resolveOverviewError(config: OllamaConfig) {
    const selectedSuppliers = [
      this.findSupplier(config.suppliers, config.generationSupplierId),
      this.findSupplier(config.suppliers, config.validationSupplierId)
    ].filter((item): item is OllamaSupplier => Boolean(item));

    return selectedSuppliers.find((supplier) => supplier.lastError)?.lastError ?? null;
  }

  private resolveOverviewLastCheckedAt(config: OllamaConfig) {
    const selectedSuppliers = [
      this.findSupplier(config.suppliers, config.generationSupplierId),
      this.findSupplier(config.suppliers, config.validationSupplierId)
    ].filter((item): item is OllamaSupplier => Boolean(item));

    return selectedSuppliers
      .map((supplier) => supplier.lastCheckedAt)
      .filter((value): value is string => Boolean(value))
      .sort()
      .at(-1) ?? null;
  }

  private makeUniqueDisplayName(participants: RoomParticipant[], requestedName: string) {
    const existingNames = new Set(participants.map((participant) => participant.displayName));

    if (!existingNames.has(requestedName)) {
      return requestedName;
    }

    for (let index = 2; index <= 99; index += 1) {
      const candidate = `${requestedName}${index}`;

      if (!existingNames.has(candidate)) {
        return candidate;
      }
    }

    return `${requestedName}-${nanoid(4)}`;
  }

  private createUniqueRoomCode(rooms: GameRoom[]) {
    let attempt = 0;

    while (attempt < 20) {
      const roomCode = createRoomCode();

      if (!rooms.some((room) => room.roomCode === roomCode)) {
        return roomCode;
      }

      attempt += 1;
    }

    throw new ServiceError(500, '生成房间码失败，请重试。');
  }

  private findRoomOrThrow(rooms: GameRoom[], roomId: string) {
    const room = rooms.find((item) => item.roomId === roomId);

    if (!room) {
      throw new ServiceError(404, '房间不存在。');
    }

    return room;
  }

  private findParticipantOrThrow(room: GameRoom, participantId: string) {
    const participant = room.participants.find((item) => item.participantId === participantId);

    if (!participant) {
      throw new ServiceError(404, '房间成员不存在，请重新加入房间。');
    }

    return participant;
  }

  private isParticipantOnline(lastSeenAt: string, now: number) {
    const seenAt = new Date(lastSeenAt).getTime();
    return Number.isFinite(seenAt) && now - seenAt <= 60_000;
  }

  private resolveQuestionProgressScore(room: GameRoom, evaluation: QuestionEvaluation) {
    const totalImportance = room.facts.reduce((total, fact) => total + Math.max(1, fact.importance), 0);

    if (totalImportance <= 0) {
      return room.progressScore;
    }

    const revealedSet = new Set([...room.revealedFactIds, ...evaluation.revealedFactIds]);
    const matchedSet = new Set([...room.questions.flatMap((item) => item.matchedFactIds), ...evaluation.matchedFactIds]);
    let revealedImportance = 0;
    let matchedOnlyImportance = 0;

    for (const fact of room.facts) {
      const weight = Math.max(1, fact.importance);

      if (revealedSet.has(fact.factId)) {
        revealedImportance += weight;
        continue;
      }

      if (matchedSet.has(fact.factId)) {
        matchedOnlyImportance += weight;
      }
    }

    const relevantQuestionCount =
      room.questions.filter((item) => item.matchedFactIds.length > 0 || item.answerCode === 'yes' || item.answerCode === 'partial').length +
      (evaluation.matchedFactIds.length > 0 || evaluation.answerCode === 'yes' || evaluation.answerCode === 'partial' ? 1 : 0);
    const existingClueSet = new Set(
      room.clues.map((clue) => this.normalizeClueStatement(clue.statement)).filter((statement): statement is string => Boolean(statement))
    );
    const nextClueCount =
      evaluation.clueStatement && !existingClueSet.has(this.normalizeClueStatement(evaluation.clueStatement))
        ? room.clues.length + 1
        : room.clues.length;
    const clueScore = Math.min(18, nextClueCount * 6);
    const revealedScore = (revealedImportance / totalImportance) * 54;
    const matchedScore = (matchedOnlyImportance / totalImportance) * 22;
    const questionScore = Math.min(10, relevantQuestionCount * 2);
    const nextScore = Math.round(revealedScore + matchedScore + questionScore + clueScore);

    return clampProgress(Math.max(room.progressScore, Math.min(nextScore, 96)));
  }

  private resolveEndingBadge(status: GameRoom['status'], hintUsageCount: number, revealed: boolean): EndingBadge {
    if (revealed) {
      return {
        code: 'open_truth',
        title: '开锅收场',
        description: '房主主动公开了汤底，本局以揭示真相结束。',
        tier: 'bronze'
      };
    }

    if (status === 'solved') {
      if (hintUsageCount <= 0) {
        return {
          code: 'perfect',
          title: '完美收束',
          description: '未使用提示，完整还原了这一锅的核心因果。',
          tier: 'perfect'
        };
      }

      if (hintUsageCount === 1) {
        return {
          code: 'guided_once',
          title: '借光破局',
          description: '使用 1 次提示后成功还原真相，节奏依然很稳。',
          tier: 'gold'
        };
      }

      return {
        code: 'guided_twice',
        title: '循光见底',
        description: '使用 2 次提示后成功收束真相，配合推进也算漂亮。',
        tier: 'silver'
      };
    }

    return {
      code: 'missed',
      title: '差一步',
      description: '最终猜测没有完全命中核心因果，这锅还差最后一层。',
      tier: 'bronze'
    };
  }

  private resolveMaxQuestionCount(difficulty: Difficulty) {
    return difficulty === 'hard' ? HARD_DIFFICULTY_MAX_QUESTION_COUNT : null;
  }

  private resolveGenerationTimeoutMs(globalTimeoutMs: number, supplier: OllamaSupplier | null) {
    if (!supplier?.timeoutMs || !Number.isFinite(supplier.timeoutMs) || supplier.timeoutMs <= 0) {
      return globalTimeoutMs;
    }

    return Math.max(30_000, Math.min(globalTimeoutMs, supplier.timeoutMs));
  }

  private toRoomContext(room: GameRoom): RoomContext {
    return {
      revealedFactIds: room.revealedFactIds,
      revealedFacts: room.revealedFactIds.map((factId) => ({
        factId,
        statement: room.facts.find((fact) => fact.factId === factId)?.statement ?? factId
      })),
      clues: room.clues,
      progressScore: room.progressScore,
      hintUsageCount: room.hintUsageCount,
      questionHistory: room.questions.map((item) => ({
        question: item.question,
        answerCode: item.answerCode,
        reasoning: item.reasoning,
        matchedFactIds: item.matchedFactIds,
        revealedFactIds: item.revealedFactIds,
        clueStatement: item.clueStatement ?? null
      }))
    };
  }

  private toPuzzle(room: GameRoom): Puzzle {
    return {
      puzzleId: room.puzzleId,
      title: room.puzzleTitle,
      soupSurface: room.soupSurface,
      truthStory: room.truthStory,
      facts: room.facts,
      includesDeath: room.includesDeath,
      misleadingPoints: room.misleadingPoints,
      keyTriggers: room.keyTriggers,
      difficulty: room.difficulty,
      tags: room.tags
    };
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

  private toPublicParticipant(participant: RoomParticipant) {
    return {
      participantId: participant.participantId,
      displayName: participant.displayName,
      role: participant.role,
      joinedAt: participant.joinedAt,
      lastSeenAt: participant.lastSeenAt
    };
  }

  private toPublicRoom(room: GameRoom): PublicGameRoom {
    return {
      roomId: room.roomId,
      roomCode: room.roomCode,
      title: room.title,
      generationPrompt: room.generationPrompt,
      generationDurationMs: room.generationDurationMs,
      generationSource: room.generationSource,
      generationFailureReason: room.generationFailureReason,
      puzzleTitle: room.puzzleTitle,
      soupSurface: room.soupSurface,
      includesDeath: room.includesDeath,
      difficulty: room.difficulty,
      tags: room.tags,
      participants: room.participants.map((participant) => this.toPublicParticipant(participant)),
      messages: room.messages.map((message) => ({
        id: message.id,
        type: message.type,
        authorName: message.authorName,
        content: message.content,
        createdAt: message.createdAt,
        answerCode: message.answerCode,
        answerLabel: message.answerLabel,
        source: message.source
      })),
      questionCount: room.questions.length,
      messageCount: room.messages.length,
      maxQuestionCount: room.maxQuestionCount,
      clues: room.clues,
      hintUsageCount: room.hintUsageCount,
      maxHintCount: room.maxHintCount,
      hintVote: room.hintVote,
      pendingSubmission: room.pendingSubmission,
      progressScore: room.progressScore,
      status: room.status,
      endingBadge: room.endingBadge,
      finalGuess: room.finalGuess,
      truthStory: room.status === 'playing' ? null : room.truthStory,
      createdAt: room.createdAt,
      updatedAt: room.updatedAt
    };
  }

  private normalizeClueStatement(value?: string | null) {
    return value?.trim().replace(/[。；;]+$/u, '') ?? '';
  }
}
