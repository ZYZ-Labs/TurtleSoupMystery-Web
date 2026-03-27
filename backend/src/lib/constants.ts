import type { AnswerCode, AppState, OllamaConfig } from '../types/domain.js';

export const ANSWER_LABELS: Record<AnswerCode, string> = {
  yes: '是',
  no: '否',
  irrelevant: '无关',
  partial: '部分相关',
  unknown: '无法判断'
};

export const DEFAULT_OLLAMA_CONFIG: OllamaConfig = {
  suppliers: [],
  generationSupplierId: '',
  generationModelCategory: 'all',
  generationModel: '',
  validationSupplierId: '',
  validationModelCategory: 'all',
  validationModel: ''
};

export const DEFAULT_APP_STATE: AppState = {
  version: 4,
  ollama: DEFAULT_OLLAMA_CONFIG,
  rooms: []
};

export const MAX_PROGRESS_SCORE = 100;
export const AI_HOST_NAME = 'AI 主持';
export const ROOM_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
