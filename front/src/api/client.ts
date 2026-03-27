import axios, { AxiosHeaders } from 'axios';
import { clearAuthSession, getAuthToken } from '@/lib/auth';

export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? '/api';

export const apiClient = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30000
});

export function buildRealtimeRoomUrl(roomCode: string) {
  const url = new URL(API_BASE_URL, window.location.origin);
  const normalizedPath = url.pathname.replace(/\/+$/, '');

  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  url.pathname = normalizedPath.endsWith('/api') ? `${normalizedPath.slice(0, -4) || ''}/ws` : `${normalizedPath}/ws`;
  url.search = '';
  url.hash = '';
  url.searchParams.set('roomCode', roomCode.trim().toUpperCase());

  return url.toString();
}

apiClient.interceptors.request.use((config) => {
  const token = getAuthToken();

  if (token) {
    const headers = AxiosHeaders.from(config.headers);
    headers.set('Authorization', `Bearer ${token}`);
    config.headers = headers;
  }

  return config;
});

apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    const status = error.response?.status;
    const requestUrl = String(error.config?.url ?? '');

    if (status === 401 && !requestUrl.includes('/auth/login')) {
      clearAuthSession();

      const currentPath = `${window.location.pathname}${window.location.search}`;
      const redirect = encodeURIComponent(currentPath);

      if (!window.location.pathname.startsWith('/login')) {
        window.location.assign(`/login?redirect=${redirect}`);
      }
    }

    return Promise.reject(error);
  }
);
