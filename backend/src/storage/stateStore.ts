import { DatabaseSync } from 'node:sqlite';
import { constants as fsConstants } from 'node:fs';
import { access, mkdir, readFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { DEFAULT_APP_STATE } from '../lib/constants.js';
import type {
  AIProvider,
  AppState,
  ConnectionStatus,
  GameRoom,
  ModelCategory,
  OllamaConfig,
  OllamaModel,
  OllamaSupplier,
  Puzzle,
  PuzzleFact,
  QuestionRecord,
  RoomMessage,
  RoomParticipant
} from '../types/domain.js';

interface MetaRow {
  value: string;
}

interface PuzzleRow {
  puzzle_id: string;
  title: string;
  soup_surface: string;
  truth_story: string;
  difficulty: Puzzle['difficulty'];
  tags_json: string;
  misleading_points_json: string;
  key_triggers_json: string;
}

interface PuzzleFactRow {
  puzzle_id: string;
  fact_id: string;
  statement: string;
  importance: number;
  discoverable: number;
  keywords_json: string;
}

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS puzzles (
  puzzle_id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  soup_surface TEXT NOT NULL,
  truth_story TEXT NOT NULL,
  difficulty TEXT NOT NULL,
  tags_json TEXT NOT NULL,
  misleading_points_json TEXT NOT NULL,
  key_triggers_json TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS puzzle_facts (
  puzzle_id TEXT NOT NULL,
  fact_id TEXT NOT NULL,
  statement TEXT NOT NULL,
  importance INTEGER NOT NULL,
  discoverable INTEGER NOT NULL,
  keywords_json TEXT NOT NULL,
  PRIMARY KEY (puzzle_id, fact_id),
  FOREIGN KEY (puzzle_id) REFERENCES puzzles(puzzle_id) ON DELETE CASCADE
);
`;

export class StateStore {
  private readonly rootDir = process.cwd();
  private readonly runtimeDir = process.env.APP_RUNTIME_DIR
    ? resolve(process.env.APP_RUNTIME_DIR)
    : resolve(this.rootDir, 'data', 'runtime');
  private readonly puzzlesDir = process.env.APP_PUZZLES_DIR
    ? resolve(process.env.APP_PUZZLES_DIR)
    : resolve(this.rootDir, 'data', 'puzzles');
  private readonly databasePath = process.env.APP_SQLITE_PATH
    ? resolve(process.env.APP_SQLITE_PATH)
    : resolve(this.runtimeDir, 'turtle-soup.db');
  private readonly legacyStatePath = resolve(this.runtimeDir, 'app-state.json');
  private database: DatabaseSync | null = null;
  private initializationPromise: Promise<void> | null = null;
  private writeQueue: Promise<void> = Promise.resolve();

  async ensureInitialized() {
    if (!this.initializationPromise) {
      this.initializationPromise = this.initialize();
    }

    await this.initializationPromise;
  }

  async readState() {
    await this.ensureInitialized();
    return this.readStateSync();
  }

  async writeState(nextState: AppState) {
    await this.ensureInitialized();
    this.writeStateSync(nextState);
  }

  async updateState(updater: (state: AppState) => AppState) {
    await this.ensureInitialized();

    const task = this.writeQueue.then(() =>
      this.runInTransaction(() => {
        const current = this.readStateSync();
        const next = updater(current);
        this.writeStateSync(next);
        return next;
      })
    );

    this.writeQueue = task.then(
      () => undefined,
      () => undefined
    );

    return task;
  }

  async loadPuzzles() {
    await this.ensureInitialized();
    return this.loadPuzzlesSync();
  }

  private async initialize() {
    await mkdir(this.runtimeDir, { recursive: true });
    await mkdir(this.puzzlesDir, { recursive: true });

    const db = this.getDatabase();
    db.exec('PRAGMA foreign_keys = ON;');
    db.exec('PRAGMA journal_mode = WAL;');
    db.exec(SCHEMA_SQL);

    await this.syncPuzzlesFromFiles();
    await this.migrateAppStateIfNeeded();
  }

  private getDatabase() {
    if (!this.database) {
      this.database = new DatabaseSync(this.databasePath);
    }

    return this.database;
  }

  private readStateSync() {
    const db = this.getDatabase();
    const row = db.prepare(`SELECT value FROM meta WHERE key = 'app_state_json'`).get() as MetaRow | undefined;

    if (!row?.value) {
      return structuredClone(DEFAULT_APP_STATE);
    }

    try {
      const parsed = JSON.parse(row.value) as AppState & {
        ollama?: Partial<OllamaConfig> & {
          defaultModel?: string;
          baseUrl?: string;
          timeoutMs?: number;
          generationProvider?: AIProvider;
          validationProvider?: AIProvider;
          availableModels?: Array<Partial<OllamaModel>>;
          lastCheckedAt?: string | null;
          lastStatus?: ConnectionStatus;
          lastError?: string | null;
        };
      };

      return {
        ...DEFAULT_APP_STATE,
        ...parsed,
        ollama: this.normalizeOllamaConfig(parsed.ollama),
        rooms: (parsed.rooms ?? []).map((room) => ({
          ...room,
          generationDurationMs: room.generationDurationMs ?? 0,
          facts: room.facts ?? [],
          misleadingPoints: room.misleadingPoints ?? [],
          keyTriggers: room.keyTriggers ?? [],
          participants: room.participants ?? [],
          messages: room.messages ?? [],
          questions: room.questions ?? [],
          revealedFactIds: room.revealedFactIds ?? [],
          hintUsageCount: room.hintUsageCount ?? 0,
          maxHintCount: room.maxHintCount ?? 2,
          hintVote: room.hintVote ?? null,
          pendingSubmission: room.pendingSubmission ?? null,
          endingBadge: room.endingBadge ?? null
        }))
      } satisfies AppState;
    } catch {
      return structuredClone(DEFAULT_APP_STATE);
    }
  }

  private writeStateSync(nextState: AppState) {
    const db = this.getDatabase();
    db.prepare(
      `
        INSERT INTO meta (key, value)
        VALUES ('app_state_json', ?)
        ON CONFLICT(key) DO UPDATE SET value = excluded.value
      `
    ).run(JSON.stringify(nextState));
  }

  private loadPuzzlesSync() {
    const db = this.getDatabase();
    const puzzleRows = db
      .prepare(
        `
          SELECT puzzle_id, title, soup_surface, truth_story, difficulty, tags_json,
                 misleading_points_json, key_triggers_json
          FROM puzzles
          ORDER BY title COLLATE NOCASE ASC
        `
      )
      .all() as unknown as PuzzleRow[];
    const factRows = db
      .prepare(
        `
          SELECT puzzle_id, fact_id, statement, importance, discoverable, keywords_json
          FROM puzzle_facts
          ORDER BY puzzle_id ASC, importance DESC, fact_id ASC
        `
      )
      .all() as unknown as PuzzleFactRow[];

    const factsByPuzzle = new Map<string, PuzzleFact[]>();

    for (const row of factRows) {
      const current = factsByPuzzle.get(row.puzzle_id) ?? [];
      current.push({
        factId: row.fact_id,
        statement: row.statement,
        importance: row.importance,
        discoverable: Boolean(row.discoverable),
        keywords: this.parseJson<string[]>(row.keywords_json, [])
      });
      factsByPuzzle.set(row.puzzle_id, current);
    }

    return puzzleRows.map((row): Puzzle => ({
      puzzleId: row.puzzle_id,
      title: row.title,
      soupSurface: row.soup_surface,
      truthStory: row.truth_story,
      facts: factsByPuzzle.get(row.puzzle_id) ?? [],
      misleadingPoints: this.parseJson<string[]>(row.misleading_points_json, []),
      keyTriggers: this.parseJson<string[]>(row.key_triggers_json, []),
      difficulty: row.difficulty,
      tags: this.parseJson<string[]>(row.tags_json, [])
    }));
  }

  private async syncPuzzlesFromFiles() {
    const files = await readdir(this.puzzlesDir);
    const puzzleFiles = files.filter((file) => file.endsWith('.json'));
    const puzzles = await Promise.all(
      puzzleFiles.map(async (file) => {
        const raw = await readFile(resolve(this.puzzlesDir, file), 'utf8');
        return JSON.parse(raw) as Puzzle;
      })
    );

    const db = this.getDatabase();
    this.runInTransaction(() => {
      db.exec('DELETE FROM puzzle_facts;');
      db.exec('DELETE FROM puzzles;');

      const insertPuzzle = db.prepare(
        `
          INSERT INTO puzzles
            (puzzle_id, title, soup_surface, truth_story, difficulty, tags_json, misleading_points_json, key_triggers_json)
          VALUES
            (?, ?, ?, ?, ?, ?, ?, ?)
        `
      );
      const insertFact = db.prepare(
        `
          INSERT INTO puzzle_facts
            (puzzle_id, fact_id, statement, importance, discoverable, keywords_json)
          VALUES
            (?, ?, ?, ?, ?, ?)
        `
      );

      for (const puzzle of puzzles) {
        insertPuzzle.run(
          puzzle.puzzleId,
          puzzle.title,
          puzzle.soupSurface,
          puzzle.truthStory,
          puzzle.difficulty,
          JSON.stringify(puzzle.tags),
          JSON.stringify(puzzle.misleadingPoints),
          JSON.stringify(puzzle.keyTriggers)
        );

        for (const fact of puzzle.facts) {
          insertFact.run(
            puzzle.puzzleId,
            fact.factId,
            fact.statement,
            fact.importance,
            fact.discoverable ? 1 : 0,
            JSON.stringify(fact.keywords)
          );
        }
      }
    });
  }

  private async migrateAppStateIfNeeded() {
    const db = this.getDatabase();
    const stateRow = db.prepare(`SELECT value FROM meta WHERE key = 'app_state_json'`).get() as MetaRow | undefined;

    if (stateRow?.value) {
      return;
    }

    let nextState = structuredClone(DEFAULT_APP_STATE);

    try {
      await access(this.legacyStatePath, fsConstants.F_OK);
      const raw = await readFile(this.legacyStatePath, 'utf8');
      const parsed = JSON.parse(raw) as {
        ollama?: AppState['ollama'];
        sessions?: Array<{
          sessionId: string;
          puzzleId: string;
          puzzleTitle: string;
          soupSurface: string;
          truthStory: string;
          difficulty: Puzzle['difficulty'];
          questions?: Array<{
            id: string;
            question: string;
            answerCode: QuestionRecord['answerCode'];
            answerLabel: string;
            matchedFactIds: string[];
            revealedFactIds: string[];
            progressDelta: number;
            createdAt: string;
            source: QuestionRecord['source'];
          }>;
          revealedFactIds?: string[];
          progressScore: number;
          status: GameRoom['status'];
          finalGuess?: {
            guess: string;
            accepted: boolean;
            score: number;
            missingPoints: string[];
            createdAt: string;
            source: 'ollama' | 'heuristic';
          };
          createdAt: string;
          updatedAt: string;
        }>;
      };

      nextState = {
        ...nextState,
        ollama: this.normalizeOllamaConfig(parsed.ollama),
        rooms: (parsed.sessions ?? []).map((session) =>
          this.convertLegacySessionToRoom({
            ...session,
            questions: session.questions ?? [],
            revealedFactIds: session.revealedFactIds ?? []
          })
        )
      };
    } catch {
      nextState = structuredClone(DEFAULT_APP_STATE);
    }

    this.writeStateSync(nextState);
  }

  private normalizeOllamaConfig(raw: Partial<OllamaConfig> | undefined) {
    const source = raw ?? {};
    const legacySource = source as Partial<OllamaConfig> & {
      defaultModel?: string;
      baseUrl?: string;
      timeoutMs?: number;
      generationProvider?: AIProvider;
      validationProvider?: AIProvider;
      availableModels?: Array<Partial<OllamaModel>>;
      lastCheckedAt?: string | null;
      lastStatus?: ConnectionStatus;
      lastError?: string | null;
    };
    const legacyDefaultModel = legacySource.defaultModel?.trim() ?? '';
    const legacyBaseUrl = legacySource.baseUrl?.trim() ?? '';
    const legacyTimeoutMs = Number(legacySource.timeoutMs ?? 30000);
    const normalizedLegacyModels = (legacySource.availableModels ?? []).map((model) => this.normalizeModel(model));
    const normalizedSuppliers = (source.suppliers ?? []).map((supplier) => this.normalizeSupplier(supplier));

    if (!normalizedSuppliers.length && legacyBaseUrl) {
      normalizedSuppliers.push({
        supplierId: 'supplier-legacy',
        label: '默认 Ollama',
        provider: 'ollama',
        baseUrl: legacyBaseUrl,
        timeoutMs: Number.isFinite(legacyTimeoutMs) && legacyTimeoutMs > 0 ? legacyTimeoutMs : 30000,
        availableModels: normalizedLegacyModels,
        lastCheckedAt: legacySource.lastCheckedAt ?? null,
        lastStatus: this.normalizeConnectionStatus(legacySource.lastStatus),
        lastError: legacySource.lastError ?? null
      });
    }

    const generationSupplierId =
      (typeof source.generationSupplierId === 'string' && source.generationSupplierId) || normalizedSuppliers[0]?.supplierId || '';
    const validationSupplierId =
      (typeof source.validationSupplierId === 'string' && source.validationSupplierId) ||
      generationSupplierId ||
      normalizedSuppliers[0]?.supplierId ||
      '';

    return {
      ...DEFAULT_APP_STATE.ollama,
      suppliers: normalizedSuppliers,
      generationTimeoutMs:
        Number.isFinite(source.generationTimeoutMs) && Number(source.generationTimeoutMs) >= 30_000
          ? Number(source.generationTimeoutMs)
          : DEFAULT_APP_STATE.ollama.generationTimeoutMs,
      generationSupplierId,
      generationModelCategory: this.normalizeSelectedCategory(source.generationModelCategory),
      generationModel: typeof source.generationModel === 'string' && source.generationModel.trim() ? source.generationModel.trim() : legacyDefaultModel,
      validationSupplierId,
      validationModelCategory: this.normalizeSelectedCategory(source.validationModelCategory),
      validationModel: typeof source.validationModel === 'string' && source.validationModel.trim() ? source.validationModel.trim() : legacyDefaultModel
    } satisfies OllamaConfig;
  }

  private normalizeSupplier(raw: Partial<OllamaSupplier>) {
    const models = (raw.availableModels ?? []).map((model) => this.normalizeModel(model));

    return {
      supplierId: typeof raw.supplierId === 'string' && raw.supplierId.trim() ? raw.supplierId : 'supplier-legacy',
      label: typeof raw.label === 'string' && raw.label.trim() ? raw.label.trim() : '未命名供应商',
      provider: raw.provider === 'ollama' ? 'ollama' : 'ollama',
      baseUrl: typeof raw.baseUrl === 'string' ? raw.baseUrl.trim() : '',
      timeoutMs: Number.isFinite(raw.timeoutMs) && Number(raw.timeoutMs) > 0 ? Number(raw.timeoutMs) : 30000,
      availableModels: models,
      lastCheckedAt: typeof raw.lastCheckedAt === 'string' ? raw.lastCheckedAt : null,
      lastStatus: this.normalizeConnectionStatus(raw.lastStatus),
      lastError: typeof raw.lastError === 'string' ? raw.lastError : null
    } satisfies OllamaSupplier;
  }

  private normalizeModel(raw: Partial<OllamaModel>) {
    const name = typeof raw.name === 'string' ? raw.name : String(raw.model ?? '');
    const modelName = typeof raw.model === 'string' ? raw.model : name;

    return {
      name,
      model: modelName,
      family: typeof raw.family === 'string' && raw.family.trim() ? raw.family : this.deriveModelFamily(name, modelName),
      category: this.normalizeModelCategory(raw.category, name, modelName),
      size: Number(raw.size ?? 0),
      modifiedAt: typeof raw.modifiedAt === 'string' ? raw.modifiedAt : '',
      parameterSize: typeof raw.parameterSize === 'string' ? raw.parameterSize : undefined,
      quantizationLevel: typeof raw.quantizationLevel === 'string' ? raw.quantizationLevel : undefined
    } satisfies OllamaModel;
  }

  private normalizeConnectionStatus(value: unknown): ConnectionStatus {
    return value === 'connected' || value === 'error' || value === 'idle' ? value : 'idle';
  }

  private convertLegacySessionToRoom(session: {
    sessionId: string;
    puzzleId: string;
    puzzleTitle: string;
    soupSurface: string;
    truthStory: string;
    difficulty: Puzzle['difficulty'];
    questions: Array<{
      id: string;
      question: string;
      answerCode: QuestionRecord['answerCode'];
      answerLabel: string;
      matchedFactIds: string[];
      revealedFactIds: string[];
      progressDelta: number;
      createdAt: string;
      source: QuestionRecord['source'];
    }>;
    revealedFactIds: string[];
    progressScore: number;
    status: GameRoom['status'];
    finalGuess?: {
      guess: string;
      accepted: boolean;
      score: number;
      missingPoints: string[];
      createdAt: string;
      source: 'ollama' | 'heuristic';
    };
    createdAt: string;
    updatedAt: string;
  }): GameRoom {
    const participant: RoomParticipant = {
      participantId: 'legacy-player',
      displayName: 'Legacy Player',
      role: 'host',
      joinedAt: session.createdAt,
      lastSeenAt: session.updatedAt
    };

    const messages: RoomMessage[] = [
      {
        id: `${session.sessionId}-system`,
        type: 'system',
        authorName: 'System',
        content: 'This room was migrated from the previous single-player session format.',
        createdAt: session.createdAt
      }
    ];

    const questions: QuestionRecord[] = session.questions.map((item) => {
      messages.push(
        {
          id: `${item.id}-question`,
          type: 'question',
          authorName: participant.displayName,
          content: item.question,
          createdAt: item.createdAt,
          source: item.source
        },
        {
          id: `${item.id}-answer`,
          type: 'answer',
          authorName: 'AI Host',
          content: item.answerLabel,
          createdAt: item.createdAt,
          answerCode: item.answerCode,
          answerLabel: item.answerLabel,
          source: item.source
        }
      );

      return {
        ...item,
        askedByParticipantId: participant.participantId,
        askedByName: participant.displayName
      };
    });

    if (session.finalGuess) {
      messages.push({
        id: `${session.sessionId}-guess`,
        type: 'guess',
        authorName: participant.displayName,
        content: session.finalGuess.guess,
        createdAt: session.finalGuess.createdAt,
        source: session.finalGuess.source
      });
    }

    return {
      roomId: session.sessionId,
      roomCode: session.sessionId.slice(0, 6).toUpperCase(),
      title: session.puzzleTitle,
      generationPrompt: 'Migrated legacy session',
      generationDurationMs: 0,
      puzzleId: session.puzzleId,
      puzzleTitle: session.puzzleTitle,
      soupSurface: session.soupSurface,
      truthStory: session.truthStory,
      facts: [],
      misleadingPoints: [],
      keyTriggers: [],
      difficulty: session.difficulty,
      tags: ['legacy'],
      participants: [participant],
      messages,
      questions,
      revealedFactIds: session.revealedFactIds,
      hintUsageCount: 0,
      maxHintCount: 2,
      hintVote: null,
      pendingSubmission: null,
      progressScore: session.progressScore,
      status: session.status,
      endingBadge: null,
      finalGuess: session.finalGuess
        ? {
            participantId: participant.participantId,
            participantName: participant.displayName,
            guess: session.finalGuess.guess,
            accepted: session.finalGuess.accepted,
            score: session.finalGuess.score,
            missingPoints: session.finalGuess.missingPoints,
            createdAt: session.finalGuess.createdAt,
            source: session.finalGuess.source
          }
        : undefined,
      createdAt: session.createdAt,
      updatedAt: session.updatedAt
    };
  }

  private parseJson<T>(raw: string | null | undefined, fallback: T): T {
    if (!raw) {
      return fallback;
    }

    try {
      return JSON.parse(raw) as T;
    } catch {
      return fallback;
    }
  }

  private normalizeSelectedCategory(value: unknown): ModelCategory {
    return value === 'all' ||
      value === 'balanced' ||
      value === 'reasoning' ||
      value === 'lightweight' ||
      value === 'multimodal' ||
      value === 'other'
      ? value
      : 'all';
  }

  private normalizeModelCategory(value: unknown, name: string, modelName: string): OllamaModel['category'] {
    if (value === 'balanced' || value === 'reasoning' || value === 'lightweight' || value === 'multimodal' || value === 'other') {
      return value;
    }

    const normalized = `${name} ${modelName}`.toLowerCase();

    if (/embed|embedding|rerank/u.test(normalized)) {
      return 'other';
    }

    if (/vision|llava|vl\b|moondream|minicpm-v|bakllava/u.test(normalized)) {
      return 'multimodal';
    }

    if (/r1\b|qwq|reason|thinking|think/u.test(normalized)) {
      return 'reasoning';
    }

    if (/\b0\.5b\b|\b1\.5b\b|\b1b\b|\b2b\b|\b3b\b|\b4b\b|\b7b\b|mini|small|tiny/u.test(normalized)) {
      return 'lightweight';
    }

    return 'balanced';
  }

  private deriveModelFamily(name: string, modelName: string) {
    const primary = (name || modelName).split(':')[0]?.trim();
    return primary || name || modelName || 'unknown';
  }

  private runInTransaction<T>(action: () => T) {
    const db = this.getDatabase();
    db.exec('BEGIN IMMEDIATE;');

    try {
      const result = action();
      db.exec('COMMIT;');
      return result;
    } catch (error) {
      db.exec('ROLLBACK;');
      throw error;
    }
  }
}
