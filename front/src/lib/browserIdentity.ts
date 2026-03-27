const BROWSER_CLIENT_ID_KEY = 'turtle-soup-browser-client-id';
const BROWSER_DISPLAY_NAME_KEY = 'turtle-soup-browser-display-name';

function createClientId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }

  return `browser-${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
}

export function getBrowserClientId() {
  try {
    const existing = localStorage.getItem(BROWSER_CLIENT_ID_KEY)?.trim();

    if (existing) {
      return existing;
    }

    const next = createClientId();
    localStorage.setItem(BROWSER_CLIENT_ID_KEY, next);
    return next;
  } catch {
    return createClientId();
  }
}

export function getStoredDisplayName() {
  try {
    return localStorage.getItem(BROWSER_DISPLAY_NAME_KEY)?.trim() ?? '';
  } catch {
    return '';
  }
}

export function saveStoredDisplayName(displayName: string) {
  const normalized = displayName.trim().slice(0, 24);

  try {
    if (!normalized) {
      localStorage.removeItem(BROWSER_DISPLAY_NAME_KEY);
      return;
    }

    localStorage.setItem(BROWSER_DISPLAY_NAME_KEY, normalized);
  } catch {
    return;
  }
}
