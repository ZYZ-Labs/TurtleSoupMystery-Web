import { customAlphabet } from 'nanoid';
import { MAX_PROGRESS_SCORE, ROOM_CODE_ALPHABET } from './constants.js';

const generateCode = customAlphabet(ROOM_CODE_ALPHABET, 6);

export function nowIso() {
  return new Date().toISOString();
}

export function clampProgress(value: number) {
  return Math.max(0, Math.min(MAX_PROGRESS_SCORE, Math.round(value)));
}

export function normalizeOllamaBaseUrl(input: string) {
  const trimmed = input.trim().replace(/\/+$/, '');
  if (!trimmed) {
    return '';
  }

  if (trimmed.endsWith('/api')) {
    return trimmed.slice(0, -4);
  }

  return trimmed;
}

export function buildOllamaApiUrl(baseUrl: string, path: string) {
  const normalized = normalizeOllamaBaseUrl(baseUrl);
  const cleanPath = path.startsWith('/') ? path.slice(1) : path;
  return `${normalized}/api/${cleanPath}`;
}

export function sortByUpdatedAt<T extends { updatedAt: string }>(items: T[]) {
  return [...items].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
}

export function normalizeText(value: string) {
  return value.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}

export function unique<T>(items: T[]) {
  return Array.from(new Set(items));
}

export function createRoomCode() {
  return generateCode();
}

export function slugifyPrompt(value: string) {
  const cleaned = value.replace(/\s+/g, ' ').trim();
  return cleaned.length > 120 ? `${cleaned.slice(0, 117)}...` : cleaned;
}
