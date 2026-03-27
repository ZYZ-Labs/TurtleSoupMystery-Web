import { apiClient } from './client';
import type {
  AdminSession,
  AdminSessionStatus,
  OllamaCheckResult,
  OllamaConfig,
  OllamaSupplier,
  OverviewPayload,
  PublicGameRoom,
  RoomJoinResult
} from '@/types/api';

export async function loginAdmin(username: string, password: string) {
  const { data } = await apiClient.post<AdminSession>('/auth/login', { username, password });
  return data;
}

export async function fetchAdminSession() {
  const { data } = await apiClient.get<AdminSessionStatus>('/auth/session');
  return data;
}

export async function logoutAdmin() {
  await apiClient.post('/auth/logout');
}

export async function fetchOverview() {
  const { data } = await apiClient.get<OverviewPayload>('/overview');
  return data;
}

export async function fetchRooms() {
  const { data } = await apiClient.get<PublicGameRoom[]>('/rooms');
  return data;
}

export async function deleteRoom(roomId: string) {
  await apiClient.delete(`/rooms/${roomId}`);
}

export async function fetchRoomByCode(roomCode: string) {
  const { data } = await apiClient.get<PublicGameRoom>(`/rooms/code/${roomCode}`);
  return data;
}

export async function createRoom(payload: {
  clientId: string;
  displayName: string;
  difficulty: 'easy' | 'medium' | 'hard';
  generationPrompt: string;
}) {
  const { data } = await apiClient.post<RoomJoinResult>('/rooms', payload);
  return data;
}

export async function joinRoom(payload: { roomCode: string; displayName: string; clientId: string }) {
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

export async function createOllamaSupplier(payload: Pick<OllamaSupplier, 'label' | 'provider' | 'baseUrl' | 'timeoutMs'>) {
  const { data } = await apiClient.post<OllamaConfig>('/settings/ollama/suppliers', payload);
  return data;
}

export async function updateOllamaSupplier(
  supplierId: string,
  payload: Pick<OllamaSupplier, 'label' | 'provider' | 'baseUrl' | 'timeoutMs'>
) {
  const { data } = await apiClient.put<OllamaConfig>(`/settings/ollama/suppliers/${supplierId}`, payload);
  return data;
}

export async function refreshOllamaSupplierModels(supplierId: string) {
  const { data } = await apiClient.post<OllamaConfig>(`/settings/ollama/suppliers/${supplierId}/check`);
  return data;
}

export async function deleteOllamaSupplier(supplierId: string) {
  const { data } = await apiClient.delete<OllamaConfig>(`/settings/ollama/suppliers/${supplierId}`);
  return data;
}

export async function saveOllamaRuntimeConfig(
  payload: Pick<
    OllamaConfig,
    | 'generationSupplierId'
    | 'generationModelCategory'
    | 'generationModel'
    | 'validationSupplierId'
    | 'validationModelCategory'
    | 'validationModel'
  >
) {
  const { data } = await apiClient.put<OllamaConfig>('/settings/ollama/runtime', payload);
  return data;
}
