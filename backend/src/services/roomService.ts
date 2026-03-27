import { nanoid } from 'nanoid';
import { AI_HOST_NAME, ANSWER_LABELS } from '../lib/constants.js';
import { clampProgress, createRoomCode, nowIso, slugifyPrompt, sortByUpdatedAt, unique } from '../lib/utils.js';
import { StateStore } from '../storage/stateStore.js';
import type {
  Difficulty,
  FinalGuessRecord,
  GameRoom,
  OllamaConfig,
  PublicGameRoom,
  PublicPuzzle,
  Puzzle,
  QuestionRecord,
  RevealedFact,
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
  displayName: string;
  difficulty: Difficulty;
  generationPrompt: string;
}

interface JoinRoomInput {
  roomCode: string;
  displayName: string;
}

export class RoomService {
  constructor(
    private readonly store: StateStore,
    private readonly ollamaService: OllamaService
  ) {}

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
        configured: Boolean(state.ollama.baseUrl && state.ollama.generationModel && state.ollama.validationModel),
        generationModel: state.ollama.generationModel,
        validationModel: state.ollama.validationModel,
        modelCount: state.ollama.availableModels.length,
        lastStatus: state.ollama.lastStatus,
        lastError: state.ollama.lastError,
        lastCheckedAt: state.ollama.lastCheckedAt
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
    await this.store.updateState((current) => {
      const room = this.findRoomOrThrow(current.rooms, roomId);

      return {
        ...current,
        rooms: current.rooms.filter((item) => item.roomId !== room.roomId)
      };
    });
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
    const timestamp = nowIso();
    const host: RoomParticipant = {
      participantId: nanoid(),
      displayName: this.normalizeDisplayName(input.displayName),
      role: 'host',
      joinedAt: timestamp,
      lastSeenAt: timestamp
    };
    const puzzle = await this.ollamaService.generatePuzzle(state.ollama, {
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

    return {
      room: this.toPublicRoom(room),
      participant: this.toPublicParticipant(host)
    };
  }

  async joinRoom(input: JoinRoomInput): Promise<RoomJoinResult> {
    const requestedName = this.normalizeDisplayName(input.displayName);
    const normalizedRoomCode = this.normalizeRoomCode(input.roomCode);
    let participant: RoomParticipant | null = null;
    let updatedRoom: GameRoom | null = null;

    await this.store.updateState((state) => {
      const room = state.rooms.find((item) => item.roomCode === normalizedRoomCode);

      if (!room) {
        throw new ServiceError(404, '房间不存在。');
      }

      const timestamp = nowIso();
      const nextParticipant: RoomParticipant = {
        participantId: nanoid(),
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

    return {
      room: this.toPublicRoom(updatedRoom),
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
    const evaluation = await this.ollamaService.evaluateQuestion(
      state.ollama,
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

    return this.toPublicRoom(this.findRoomOrThrow(nextState.rooms, roomId));
  }

  async submitFinalGuess(roomId: string, participantId: string, guess: string) {
    const state = await this.store.readState();
    const room = this.findRoomOrThrow(state.rooms, roomId);

    if (room.status !== 'playing') {
      throw new ServiceError(409, '房间已经结算，不能再次提交最终猜测。');
    }

    const participant = this.findParticipantOrThrow(room, participantId);
    const evaluation = await this.ollamaService.evaluateFinalGuess(
      state.ollama,
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

    return this.toPublicRoom(this.findRoomOrThrow(nextState.rooms, roomId));
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

    return this.toPublicRoom(this.findRoomOrThrow(nextState.rooms, roomId));
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

  async checkOllamaConnection(baseUrl: string, timeoutMs: number) {
    return this.ollamaService.checkConnection(baseUrl, timeoutMs);
  }

  async saveOllamaConfig(
    nextConfig: Pick<
      OllamaConfig,
      | 'baseUrl'
      | 'timeoutMs'
      | 'generationProvider'
      | 'generationModelCategory'
      | 'generationModel'
      | 'validationProvider'
      | 'validationModelCategory'
      | 'validationModel'
    >
  ) {
    const checkResult = await this.ollamaService.checkConnection(nextConfig.baseUrl, nextConfig.timeoutMs);
    const generationModel = this.resolveModelSelection(
      checkResult.models,
      nextConfig.generationModelCategory,
      nextConfig.generationModel
    );
    const validationModel = this.resolveModelSelection(
      checkResult.models,
      nextConfig.validationModelCategory,
      nextConfig.validationModel || generationModel
    );

    const nextState = await this.store.updateState((state) => ({
      ...state,
      ollama: {
        ...state.ollama,
        baseUrl: checkResult.normalizedBaseUrl,
        timeoutMs: nextConfig.timeoutMs,
        generationProvider: nextConfig.generationProvider,
        generationModelCategory: nextConfig.generationModelCategory,
        generationModel,
        validationProvider: nextConfig.validationProvider,
        validationModelCategory: nextConfig.validationModelCategory,
        validationModel,
        availableModels: checkResult.models,
        lastCheckedAt: nowIso(),
        lastStatus: checkResult.reachable ? 'connected' : 'error',
        lastError: checkResult.reachable ? null : checkResult.message
      }
    }));

    return nextState.ollama;
  }

  private normalizeDisplayName(value: string) {
    return value.trim().slice(0, 24);
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

  private resolveModelSelection(models: OllamaConfig['availableModels'], category: OllamaConfig['generationModelCategory'], selected: string) {
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
