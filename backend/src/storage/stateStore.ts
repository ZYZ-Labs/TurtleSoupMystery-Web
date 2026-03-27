import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { DEFAULT_APP_STATE } from '../lib/constants.js';
import type { AppState, Puzzle } from '../types/domain.js';

export class StateStore {
  private readonly rootDir = process.cwd();
  private readonly runtimeDir = resolve(this.rootDir, 'data', 'runtime');
  private readonly puzzlesDir = resolve(this.rootDir, 'data', 'puzzles');
  private readonly statePath = resolve(this.runtimeDir, 'app-state.json');
  private writeQueue: Promise<void> = Promise.resolve();

  async ensureInitialized() {
    await mkdir(this.runtimeDir, { recursive: true });
    await mkdir(this.puzzlesDir, { recursive: true });

    try {
      await readFile(this.statePath, 'utf8');
    } catch {
      await writeFile(this.statePath, JSON.stringify(DEFAULT_APP_STATE, null, 2), 'utf8');
    }
  }

  async readState() {
    await this.ensureInitialized();
    const raw = await readFile(this.statePath, 'utf8');
    const parsed = JSON.parse(raw) as AppState;

    return {
      ...DEFAULT_APP_STATE,
      ...parsed,
      ollama: {
        ...DEFAULT_APP_STATE.ollama,
        ...parsed.ollama
      }
    } satisfies AppState;
  }

  async writeState(nextState: AppState) {
    await this.ensureInitialized();
    this.writeQueue = this.writeQueue.then(() =>
      writeFile(this.statePath, JSON.stringify(nextState, null, 2), 'utf8')
    );
    await this.writeQueue;
  }

  async updateState(updater: (state: AppState) => AppState | Promise<AppState>) {
    const current = await this.readState();
    const next = await updater(current);
    await this.writeState(next);
    return next;
  }

  async loadPuzzles() {
    await this.ensureInitialized();
    const files = await readdir(this.puzzlesDir);
    const puzzleFiles = files.filter((file) => file.endsWith('.json'));
    const puzzles = await Promise.all(
      puzzleFiles.map(async (file) => {
        const raw = await readFile(resolve(this.puzzlesDir, file), 'utf8');
        return JSON.parse(raw) as Puzzle;
      })
    );

    return puzzles.sort((left, right) => left.title.localeCompare(right.title, 'zh-CN'));
  }
}
