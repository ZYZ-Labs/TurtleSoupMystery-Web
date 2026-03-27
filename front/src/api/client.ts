import axios, { AxiosHeaders } from 'axios';
import { clearAuthSession, getAuthToken } from '@/lib/auth';

export const apiClient = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL ?? '/api',
  timeout: 30000
});

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
