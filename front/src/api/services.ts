import { apiClient } from './client';
import type {
  GameSession,
  OllamaCheckResult,
  OllamaConfig,
  OverviewPayload,
  Puzzle
} from '@/types/api';

export async function fetchOverview() {
  const { data } = await apiClient.get<OverviewPayload>('/overview');
  return data;
}

export async function fetchPuzzles() {
  const { data } = await apiClient.get<Puzzle[]>('/puzzles');
  return data;
}

export async function fetchSessions() {
  const { data } = await apiClient.get<GameSession[]>('/sessions');
  return data;
}

export async function fetchSession(sessionId: string) {
  const { data } = await apiClient.get<GameSession>(`/sessions/${sessionId}`);
  return data;
}

export async function createSession(puzzleId?: string) {
  const { data } = await apiClient.post<GameSession>('/sessions', { puzzleId });
  return data;
}

export async function askQuestion(sessionId: string, question: string) {
  const { data } = await apiClient.post<GameSession>(`/sessions/${sessionId}/questions`, { question });
  return data;
}

export async function submitFinalGuess(sessionId: string, guess: string) {
  const { data } = await apiClient.post<GameSession>(`/sessions/${sessionId}/final-guess`, { guess });
  return data;
}

export async function revealSession(sessionId: string) {
  const { data } = await apiClient.post<GameSession>(`/sessions/${sessionId}/reveal`);
  return data;
}

export async function fetchOllamaConfig() {
  const { data } = await apiClient.get<OllamaConfig>('/settings/ollama');
  return data;
}

export async function checkOllamaConnection(baseUrl: string, timeoutMs: number) {
  const { data } = await apiClient.post<OllamaCheckResult>('/settings/ollama/check', {
    baseUrl,
    timeoutMs
  });
  return data;
}

export async function saveOllamaConfig(payload: Pick<OllamaConfig, 'baseUrl' | 'defaultModel' | 'timeoutMs'>) {
  const { data } = await apiClient.put<OllamaConfig>('/settings/ollama', payload);
  return data;
}
