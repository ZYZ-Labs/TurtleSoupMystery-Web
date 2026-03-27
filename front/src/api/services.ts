import { apiClient } from './client';
import type {
  OllamaCheckResult,
  OllamaConfig,
  OverviewPayload,
  PublicGameRoom,
  RoomJoinResult
} from '@/types/api';

export async function fetchOverview() {
  const { data } = await apiClient.get<OverviewPayload>('/overview');
  return data;
}

export async function fetchRooms() {
  const { data } = await apiClient.get<PublicGameRoom[]>('/rooms');
  return data;
}

export async function fetchRoomByCode(roomCode: string) {
  const { data } = await apiClient.get<PublicGameRoom>(`/rooms/code/${roomCode}`);
  return data;
}

export async function createRoom(payload: {
  displayName: string;
  difficulty: 'easy' | 'medium' | 'hard';
  generationPrompt: string;
}) {
  const { data } = await apiClient.post<RoomJoinResult>('/rooms', payload);
  return data;
}

export async function joinRoom(payload: { roomCode: string; displayName: string }) {
  const { data } = await apiClient.post<RoomJoinResult>('/rooms/join', payload);
  return data;
}

export async function askRoomQuestion(roomId: string, participantId: string, question: string) {
  const { data } = await apiClient.post<PublicGameRoom>(`/rooms/${roomId}/questions`, {
    participantId,
    question
  });
  return data;
}

export async function submitRoomFinalGuess(roomId: string, participantId: string, guess: string) {
  const { data } = await apiClient.post<PublicGameRoom>(`/rooms/${roomId}/final-guess`, {
    participantId,
    guess
  });
  return data;
}

export async function revealRoom(roomId: string, participantId: string) {
  const { data } = await apiClient.post<PublicGameRoom>(`/rooms/${roomId}/reveal`, {
    participantId
  });
  return data;
}

export async function heartbeatRoom(roomId: string, participantId: string) {
  const { data } = await apiClient.post<PublicGameRoom>(`/rooms/${roomId}/heartbeat`, {
    participantId
  });
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
