const AUTH_TOKEN_KEY = 'turtle-soup-admin-token';
const AUTH_USERNAME_KEY = 'turtle-soup-admin-username';
const AUTH_EXPIRES_AT_KEY = 'turtle-soup-admin-expires-at';

export function getAuthToken() {
  return localStorage.getItem(AUTH_TOKEN_KEY) ?? '';
}

export function getAuthUsername() {
  return localStorage.getItem(AUTH_USERNAME_KEY) ?? '';
}

export function getAuthExpiresAt() {
  return localStorage.getItem(AUTH_EXPIRES_AT_KEY) ?? '';
}

export function hasAuthToken() {
  return Boolean(getAuthToken());
}

export function saveAuthSession(session: { token: string; username: string; expiresAt: string }) {
  localStorage.setItem(AUTH_TOKEN_KEY, session.token);
  localStorage.setItem(AUTH_USERNAME_KEY, session.username);
  localStorage.setItem(AUTH_EXPIRES_AT_KEY, session.expiresAt);
}

export function clearAuthSession() {
  localStorage.removeItem(AUTH_TOKEN_KEY);
  localStorage.removeItem(AUTH_USERNAME_KEY);
  localStorage.removeItem(AUTH_EXPIRES_AT_KEY);
}
