import { DatabaseSync } from 'node:sqlite';
import { access, mkdir, readFile, readdir } from 'node:fs/promises';
import { constants as fsConstants } from 'node:fs';
import { resolve } from 'node:path';
import { DEFAULT_APP_STATE } from '../lib/constants.js';
import type {
  AppState,
  FinalGuessRecord,
  GameSession,
  OllamaModel,
  Puzzle,
  PuzzleFact,
  QuestionRecord
} from '../types/domain.js';

interface MetaRow {
  value: string;
}

interface OllamaConfigRow {
  base_url: string;
  default_model: string;
  timeout_ms: number;
  last_checked_at: string | null;
  last_status: 'idle' | 'connected' | 'error';
  last_error: string | null;
}

interface OllamaModelRow {
  name: string;
  model: string;
  size: number;
  modified_at: string;
  parameter_size: string | null;
  quantization_level: string | null;
}

interface SessionRow {
  session_id: string;
  puzzle_id: string;
  puzzle_title: string;
  soup_surface: string;
  truth_story: string;
  difficulty: GameSession['difficulty'];
  revealed_fact_ids_json: string;
  progress_score: number;
  status: GameSession['status'];
  created_at: string;
  updated_at: string;
}

interface QuestionRow {
  id: string;
  session_id: string;
  sort_order: number;
  question: string;
  answer_code: QuestionRecord['answerCode'];
  answer_label: string;
  matched_fact_ids_json: string;
  revealed_fact_ids_json: string;
  progress_delta: number;
  created_at: string;
  source: QuestionRecord['source'];
}

interface FinalGuessRow {
  session_id: string;
  guess: string;
  accepted: number;
  score: number;
  missing_points_json: string;
  created_at: string;
  source: FinalGuessRecord['source'];
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

CREATE TABLE IF NOT EXISTS ollama_config (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  base_url TEXT NOT NULL DEFAULT '',
  default_model TEXT NOT NULL DEFAULT '',
  timeout_ms INTEGER NOT NULL DEFAULT 30000,
  last_checked_at TEXT NULL,
  last_status TEXT NOT NULL DEFAULT 'idle',
  last_error TEXT NULL
);

CREATE TABLE IF NOT EXISTS ollama_models (
  name TEXT PRIMARY KEY,
  model TEXT NOT NULL,
  size INTEGER NOT NULL DEFAULT 0,
  modified_at TEXT NOT NULL DEFAULT '',
  parameter_size TEXT NULL,
  quantization_level TEXT NULL
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

CREATE TABLE IF NOT EXISTS sessions (
  session_id TEXT PRIMARY KEY,
  puzzle_id TEXT NOT NULL,
  puzzle_title TEXT NOT NULL,
  soup_surface TEXT NOT NULL,
  truth_story TEXT NOT NULL,
  difficulty TEXT NOT NULL,
  revealed_fact_ids_json TEXT NOT NULL,
  progress_score INTEGER NOT NULL,
  status TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS question_records (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  sort_order INTEGER NOT NULL,
  question TEXT NOT NULL,
  answer_code TEXT NOT NULL,
  answer_label TEXT NOT NULL,
  matched_fact_ids_json TEXT NOT NULL,
  revealed_fact_ids_json TEXT NOT NULL,
  progress_delta INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  source TEXT NOT NULL,
  FOREIGN KEY (session_id) REFERENCES sessions(session_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS final_guesses (
  session_id TEXT PRIMARY KEY,
  guess TEXT NOT NULL,
  accepted INTEGER NOT NULL,
  score INTEGER NOT NULL,
  missing_points_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  source TEXT NOT NULL,
  FOREIGN KEY (session_id) REFERENCES sessions(session_id) ON DELETE CASCADE
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

  async ensureInitialized() {
    if (!this.initializationPromise) {
      this.initializationPromise = this.initialize();
    }

    await this.initializationPromise;
  }

  async readState() {
    await this.ensureInitialized();
    const db = this.getDatabase();

    const ollamaRow = db
      .prepare(
        `
          SELECT base_url, default_model, timeout_ms, last_checked_at, last_status, last_error
          FROM ollama_config
          WHERE id = 1
        `
      )
      .get() as OllamaConfigRow | undefined;

    const modelRows = db
      .prepare(
        `
          SELECT name, model, size, modified_at, parameter_size, quantization_level
          FROM ollama_models
          ORDER BY name ASC
        `
      )
      .all() as unknown as OllamaModelRow[];

    const sessionRows = db
      .prepare(
        `
          SELECT session_id, puzzle_id, puzzle_title, soup_surface, truth_story, difficulty,
                 revealed_fact_ids_json, progress_score, status, created_at, updated_at
          FROM sessions
          ORDER BY updated_at DESC
        `
      )
      .all() as unknown as SessionRow[];

    const questionRows = db
      .prepare(
        `
          SELECT id, session_id, sort_order, question, answer_code, answer_label,
                 matched_fact_ids_json, revealed_fact_ids_json, progress_delta, created_at, source
          FROM question_records
          ORDER BY session_id ASC, sort_order ASC
        `
      )
      .all() as unknown as QuestionRow[];

    const finalGuessRows = db
      .prepare(
        `
          SELECT session_id, guess, accepted, score, missing_points_json, created_at, source
          FROM final_guesses
        `
      )
      .all() as unknown as FinalGuessRow[];

    const questionsBySession = new Map<string, QuestionRecord[]>();
    const finalGuessBySession = new Map<string, FinalGuessRecord>();

    for (const row of questionRows) {
      const current = questionsBySession.get(row.session_id) ?? [];
      current.push({
        id: row.id,
        question: row.question,
        answerCode: row.answer_code,
        answerLabel: row.answer_label,
        matchedFactIds: this.parseJson<string[]>(row.matched_fact_ids_json, []),
        revealedFactIds: this.parseJson<string[]>(row.revealed_fact_ids_json, []),
        progressDelta: row.progress_delta,
        createdAt: row.created_at,
        source: row.source
      });
      questionsBySession.set(row.session_id, current);
    }

    for (const row of finalGuessRows) {
      finalGuessBySession.set(row.session_id, {
        guess: row.guess,
        accepted: Boolean(row.accepted),
        score: row.score,
        missingPoints: this.parseJson<string[]>(row.missing_points_json, []),
        createdAt: row.created_at,
        source: row.source
      });
    }

    return {
      version: 1,
      ollama: {
        ...DEFAULT_APP_STATE.ollama,
        baseUrl: ollamaRow?.base_url ?? '',
        defaultModel: ollamaRow?.default_model ?? '',
        timeoutMs: ollamaRow?.timeout_ms ?? 30000,
        availableModels: modelRows.map((row): OllamaModel => ({
          name: row.name,
          model: row.model,
          size: row.size,
          modifiedAt: row.modified_at,
          parameterSize: row.parameter_size ?? undefined,
          quantizationLevel: row.quantization_level ?? undefined
        })),
        lastCheckedAt: ollamaRow?.last_checked_at ?? null,
        lastStatus: ollamaRow?.last_status ?? 'idle',
        lastError: ollamaRow?.last_error ?? null
      },
      sessions: sessionRows.map((row): GameSession => ({
        sessionId: row.session_id,
        puzzleId: row.puzzle_id,
        puzzleTitle: row.puzzle_title,
        soupSurface: row.soup_surface,
        truthStory: row.truth_story,
        difficulty: row.difficulty,
        questions: questionsBySession.get(row.session_id) ?? [],
        revealedFactIds: this.parseJson<string[]>(row.revealed_fact_ids_json, []),
        progressScore: row.progress_score,
        status: row.status,
        finalGuess: finalGuessBySession.get(row.session_id),
        createdAt: row.created_at,
        updatedAt: row.updated_at
      }))
    } satisfies AppState;
  }

  async writeState(nextState: AppState) {
    await this.ensureInitialized();
    this.persistStateToDatabase(nextState);
  }

  async updateState(updater: (state: AppState) => AppState | Promise<AppState>) {
    const current = await this.readState();
    const next = await updater(current);
    await this.writeState(next);
    return next;
  }

  async loadPuzzles() {
    await this.ensureInitialized();
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

  private async initialize() {
    await mkdir(this.runtimeDir, { recursive: true });
    await mkdir(this.puzzlesDir, { recursive: true });

    const db = this.getDatabase();
    db.exec('PRAGMA foreign_keys = ON;');
    db.exec('PRAGMA journal_mode = WAL;');
    db.exec(SCHEMA_SQL);

    db.prepare(
      `
        INSERT OR IGNORE INTO ollama_config
          (id, base_url, default_model, timeout_ms, last_checked_at, last_status, last_error)
        VALUES
          (1, '', '', 30000, NULL, 'idle', NULL)
      `
    ).run();

    await this.syncPuzzlesFromFiles();
    await this.migrateLegacyJsonIfNeeded();
  }

  private getDatabase() {
    if (!this.database) {
      this.database = new DatabaseSync(this.databasePath);
    }

    return this.database;
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

  private async migrateLegacyJsonIfNeeded() {
    const db = this.getDatabase();
    const migrated = db
      .prepare(`SELECT value FROM meta WHERE key = 'legacy_json_imported'`)
      .get() as MetaRow | undefined;

    if (migrated?.value === '1') {
      return;
    }

    let nextState = DEFAULT_APP_STATE;

    try {
      await access(this.legacyStatePath, fsConstants.F_OK);
      const raw = await readFile(this.legacyStatePath, 'utf8');
      const parsed = JSON.parse(raw) as Partial<AppState>;
      nextState = {
        version: 1,
        ollama: {
          ...DEFAULT_APP_STATE.ollama,
          ...parsed.ollama
        },
        sessions: parsed.sessions ?? []
      };
    } catch {
      nextState = DEFAULT_APP_STATE;
    }

    this.persistStateToDatabase(nextState);
    db.prepare(`INSERT OR REPLACE INTO meta (key, value) VALUES ('legacy_json_imported', '1')`).run();
  }

  private persistStateToDatabase(nextState: AppState) {
    const db = this.getDatabase();
    this.runInTransaction(() => {
      db.exec('DELETE FROM ollama_models;');
      db.exec('DELETE FROM final_guesses;');
      db.exec('DELETE FROM question_records;');
      db.exec('DELETE FROM sessions;');

      db.prepare(
        `
          INSERT INTO ollama_config
            (id, base_url, default_model, timeout_ms, last_checked_at, last_status, last_error)
          VALUES
            (1, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET
            base_url = excluded.base_url,
            default_model = excluded.default_model,
            timeout_ms = excluded.timeout_ms,
            last_checked_at = excluded.last_checked_at,
            last_status = excluded.last_status,
            last_error = excluded.last_error
        `
      ).run(
        nextState.ollama.baseUrl,
        nextState.ollama.defaultModel,
        nextState.ollama.timeoutMs,
        nextState.ollama.lastCheckedAt,
        nextState.ollama.lastStatus,
        nextState.ollama.lastError
      );

      const insertModel = db.prepare(
        `
          INSERT INTO ollama_models
            (name, model, size, modified_at, parameter_size, quantization_level)
          VALUES
            (?, ?, ?, ?, ?, ?)
        `
      );

      for (const model of nextState.ollama.availableModels) {
        insertModel.run(
          model.name,
          model.model,
          model.size,
          model.modifiedAt,
          model.parameterSize ?? null,
          model.quantizationLevel ?? null
        );
      }

      const insertSession = db.prepare(
        `
          INSERT INTO sessions
            (session_id, puzzle_id, puzzle_title, soup_surface, truth_story, difficulty,
             revealed_fact_ids_json, progress_score, status, created_at, updated_at)
          VALUES
            (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `
      );
      const insertQuestion = db.prepare(
        `
          INSERT INTO question_records
            (id, session_id, sort_order, question, answer_code, answer_label,
             matched_fact_ids_json, revealed_fact_ids_json, progress_delta, created_at, source)
          VALUES
            (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `
      );
      const insertFinalGuess = db.prepare(
        `
          INSERT INTO final_guesses
            (session_id, guess, accepted, score, missing_points_json, created_at, source)
          VALUES
            (?, ?, ?, ?, ?, ?, ?)
        `
      );

      for (const session of nextState.sessions) {
        insertSession.run(
          session.sessionId,
          session.puzzleId,
          session.puzzleTitle,
          session.soupSurface,
          session.truthStory,
          session.difficulty,
          JSON.stringify(session.revealedFactIds),
          session.progressScore,
          session.status,
          session.createdAt,
          session.updatedAt
        );

        session.questions.forEach((question, index) => {
          insertQuestion.run(
            question.id,
            session.sessionId,
            index,
            question.question,
            question.answerCode,
            question.answerLabel,
            JSON.stringify(question.matchedFactIds),
            JSON.stringify(question.revealedFactIds),
            question.progressDelta,
            question.createdAt,
            question.source
          );
        });

        if (session.finalGuess) {
          insertFinalGuess.run(
            session.sessionId,
            session.finalGuess.guess,
            session.finalGuess.accepted ? 1 : 0,
            session.finalGuess.score,
            JSON.stringify(session.finalGuess.missingPoints),
            session.finalGuess.createdAt,
            session.finalGuess.source
          );
        }
      }
    });
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
