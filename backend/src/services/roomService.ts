import { nanoid } from 'nanoid';
import { AI_HOST_NAME, ANSWER_LABELS } from '../lib/constants.js';
import { clampProgress, createRoomCode, nowIso, slugifyPrompt, sortByUpdatedAt, unique } from '../lib/utils.js';
import { StateStore } from '../storage/stateStore.js';
import type {
  Difficulty,
  FinalGuessRecord,
  GameRoom,
  OllamaConfig,
  OllamaSupplier,
  PublicGameRoom,
  PublicPuzzle,
  Puzzle,
  QuestionRecord,
  RevealedFact,
  RoomRealtimeEvent,
  RoomContext,
  RoomJoinResult,
  RoomMessage,
  RoomParticipant
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
  generationPrompt: string;
}

interface JoinRoomInput {
  clientId?: string;
  roomCode: string;
  displayName: string;
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
    const resolvedPrompt = this.resolveGenerationPrompt(input.difficulty, input.generationPrompt);
    const generationSupplier = this.findSupplier(state.ollama.suppliers, state.ollama.generationSupplierId);
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
    const puzzle = await this.ollamaService.generatePuzzle(generationSupplier, state.ollama.generationModel, {
      difficulty: input.difficulty,
      prompt: resolvedPrompt
    });
    const roomCode = this.createUniqueRoomCode(state.rooms);
    const roomTitle = slugifyPrompt(resolvedPrompt) || puzzle.title;
    const room: GameRoom = {
      roomId: nanoid(),
      roomCode,
      title: roomTitle,
      generationPrompt: resolvedPrompt,
      puzzleId: puzzle.puzzleId,
      puzzleTitle: puzzle.title,
      soupSurface: puzzle.soupSurface,
      truthStory: puzzle.truthStory,
      facts: puzzle.facts,
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
          content: `${host.displayName} 创建了房间，AI 主持已经准备好汤面。`,
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
      revealedFactIds: [],
      progressScore: 0,
      status: 'playing',
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
    const state = await this.store.readState();
    const room = this.findRoomOrThrow(state.rooms, roomId);

    if (room.status !== 'playing') {
      throw new ServiceError(409, '房间已经结算，不能继续提问。');
    }

    const participant = this.findParticipantOrThrow(room, participantId);
    const validationSupplier = this.findSupplier(state.ollama.suppliers, state.ollama.validationSupplierId);
    const evaluation = await this.ollamaService.evaluateQuestion(
      validationSupplier,
      state.ollama.validationModel,
      this.toPuzzle(room),
      this.toRoomContext(room),
      question
    );
    const timestamp = nowIso();
    const answerLabel = ANSWER_LABELS[evaluation.answerCode];
    const questionRecord: QuestionRecord = {
      id: nanoid(),
      askedByParticipantId: participant.participantId,
      askedByName: participant.displayName,
      question,
      answerCode: evaluation.answerCode,
      answerLabel,
      matchedFactIds: evaluation.matchedFactIds,
      revealedFactIds: evaluation.revealedFactIds,
      progressDelta: evaluation.progressDelta,
      createdAt: timestamp,
      source: evaluation.source,
      reasoning: evaluation.reasoning
    };

    const nextState = await this.store.updateState((current) => {
      const currentRoom = this.findRoomOrThrow(current.rooms, roomId);

      if (currentRoom.status !== 'playing') {
        throw new ServiceError(409, '房间已经结算，不能继续提问。');
      }

      this.findParticipantOrThrow(currentRoom, participantId);
      const revealedFactIds = unique([...currentRoom.revealedFactIds, ...evaluation.revealedFactIds]);
      const newlyRevealedFacts = evaluation.revealedFactIds
        .map((factId) => currentRoom.facts.find((fact) => fact.factId === factId)?.statement)
        .filter((statement): statement is string => Boolean(statement));
      const messages: RoomMessage[] = [
        ...currentRoom.messages,
        {
          id: `${questionRecord.id}-question`,
          type: 'question',
          authorName: participant.displayName,
          content: question,
          createdAt: timestamp,
          source: evaluation.source
        },
        {
          id: `${questionRecord.id}-answer`,
          type: 'answer',
          authorName: AI_HOST_NAME,
          content: answerLabel,
          createdAt: timestamp,
          answerCode: evaluation.answerCode,
          answerLabel,
          source: evaluation.source
        }
      ];

      if (newlyRevealedFacts.length) {
        messages.push({
          id: `${questionRecord.id}-facts`,
          type: 'status',
          authorName: AI_HOST_NAME,
          content: `新揭示事实：${newlyRevealedFacts.join('；')}`,
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
        questions: [...currentRoom.questions, questionRecord],
        revealedFactIds,
        progressScore: clampProgress(currentRoom.progressScore + evaluation.progressDelta),
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

  async submitFinalGuess(roomId: string, participantId: string, guess: string) {
    const state = await this.store.readState();
    const room = this.findRoomOrThrow(state.rooms, roomId);

    if (room.status !== 'playing') {
      throw new ServiceError(409, '房间已经结算，不能再次提交最终猜测。');
    }

    const participant = this.findParticipantOrThrow(room, participantId);
    const validationSupplier = this.findSupplier(state.ollama.suppliers, state.ollama.validationSupplierId);
    const evaluation = await this.ollamaService.evaluateFinalGuess(
      validationSupplier,
      state.ollama.validationModel,
      this.toPuzzle(room),
      this.toRoomContext(room),
      guess
    );
    const timestamp = nowIso();
    const nextStatus = evaluation.accepted ? 'solved' : 'failed';
    const finalGuess: FinalGuessRecord = {
      participantId: participant.participantId,
      participantName: participant.displayName,
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
        throw new ServiceError(409, '房间已经结算，不能再次提交最终猜测。');
      }

      this.findParticipantOrThrow(currentRoom, participantId);

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
            authorName: participant.displayName,
            content: guess,
            createdAt: timestamp,
            source: evaluation.source
          },
          {
            id: `${finalGuess.participantId}-status-${timestamp}`,
            type: 'status',
            authorName: AI_HOST_NAME,
            content: evaluation.accepted
              ? `最终猜测通过，房间已破解。得分 ${evaluation.score}%。`
              : `最终猜测未通过，房间已结算。得分 ${evaluation.score}%。`,
            createdAt: timestamp,
            source: evaluation.source
          }
        ],
        status: nextStatus,
        progressScore: clampProgress(Math.max(currentRoom.progressScore, evaluation.score)),
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
  }

  async revealRoom(roomId: string, participantId: string) {
    const nextState = await this.store.updateState((current) => {
      const room = this.findRoomOrThrow(current.rooms, roomId);
      const participant = this.findParticipantOrThrow(room, participantId);

      if (participant.role !== 'host') {
        throw new ServiceError(403, '只有房主可以公开汤底。');
      }

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
        status: room.status === 'playing' ? 'failed' : room.status,
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

  async createOllamaSupplier(input: { label: string; provider: OllamaSupplier['provider']; baseUrl: string; timeoutMs: number }) {
    const checkResult = await this.ollamaService.checkConnection(input.baseUrl, input.timeoutMs);
    const supplier: OllamaSupplier = {
      supplierId: nanoid(),
      label: this.normalizeSupplierLabel(input.label),
      provider: input.provider,
      baseUrl: checkResult.normalizedBaseUrl,
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
    input: { label: string; provider: OllamaSupplier['provider']; baseUrl: string; timeoutMs: number }
  ) {
    const checkResult = await this.ollamaService.checkConnection(input.baseUrl, input.timeoutMs);

    const nextState = await this.store.updateState((state) => {
      const supplier = this.findSupplierOrThrow(state.ollama.suppliers, supplierId);
      const nextSupplier: OllamaSupplier = {
        ...supplier,
        label: this.normalizeSupplierLabel(input.label),
        provider: input.provider,
        baseUrl: checkResult.normalizedBaseUrl,
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
    const checkResult = await this.ollamaService.checkConnection(supplier.baseUrl, supplier.timeoutMs);

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

  async checkOllamaConnection(baseUrl: string, timeoutMs: number) {
    return this.ollamaService.checkConnection(baseUrl, timeoutMs);
  }

  async saveOllamaRuntimeConfig(
    nextConfig: Pick<
      OllamaConfig,
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

  private resolveGenerationPrompt(difficulty: Difficulty, prompt: string) {
    const normalized = prompt.trim();

    if (normalized) {
      return normalized;
    }

    const promptPool: Record<Difficulty, string[]> = {
      easy: [
        '校园日常、线索直接、现实向',
        '办公室误会、人物关系清晰、反转温和',
        '家庭场景、动机明确、容易联想到关键线索',
        '公共场所小事件、因果链简单、误导较少'
      ],
      medium: [
        '现代都市、误导性适中、围绕一件不起眼的物品',
        '现实悬疑、人物动机隐藏、需要多步提问',
        '社交关系、信息差驱动、结局合理但不直白',
        '职场或校园、表面行为反常、背后另有原因'
      ],
      hard: [
        '强误导现实悬疑、信息缺口大、需要逆向提问',
        '多重身份误导、因果链较长、结局克制',
        '心理动机主导、表象与真相反差大',
        '冷门职业或场景、关键线索隐蔽、适合多人协作拆解'
      ]
    };

    const pool = promptPool[difficulty];
    return pool[Math.floor(Math.random() * pool.length)] ?? promptPool.medium[0];
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

  private toRoomContext(room: GameRoom): RoomContext {
    return {
      revealedFactIds: room.revealedFactIds,
      progressScore: room.progressScore,
      questionHistory: room.questions.map((item) => ({
        question: item.question,
        answerCode: item.answerCode
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
    const mapFact = (factId: string): RevealedFact => ({
      factId,
      statement: room.facts.find((fact) => fact.factId === factId)?.statement ?? factId
    });

    return {
      roomId: room.roomId,
      roomCode: room.roomCode,
      title: room.title,
      generationPrompt: room.generationPrompt,
      puzzleTitle: room.puzzleTitle,
      soupSurface: room.soupSurface,
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
      revealedFacts: room.revealedFactIds.map(mapFact),
      progressScore: room.progressScore,
      status: room.status,
      finalGuess: room.finalGuess,
      truthStory: room.status === 'playing' ? null : room.truthStory,
      createdAt: room.createdAt,
      updatedAt: room.updatedAt
    };
  }
}
