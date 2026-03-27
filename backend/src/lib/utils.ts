import { MAX_PROGRESS_SCORE } from './constants.js';

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

export function sortSessionsByUpdatedAt<T extends { updatedAt: string }>(sessions: T[]) {
  return [...sessions].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
}

export function normalizeText(value: string) {
  return value.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}

export function unique<T>(items: T[]) {
  return Array.from(new Set(items));
}
