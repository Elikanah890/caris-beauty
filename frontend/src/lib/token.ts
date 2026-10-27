let accessToken: string | null = null;

const SESSION_HINT_KEY = 'duka_session_hint';

function readHint(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return window.localStorage.getItem(SESSION_HINT_KEY) === '1';
  } catch {
    return false;
  }
}

function writeHint(value: boolean): void {
  if (typeof window === 'undefined') return;
  try {
    if (value) window.localStorage.setItem(SESSION_HINT_KEY, '1');
    else window.localStorage.removeItem(SESSION_HINT_KEY);
  } catch {
    // storage can be unavailable (private mode); session restore still works in-memory
  }
}

export function getAccessToken(): string | null {
  return accessToken;
}

export function setAccessToken(token: string | null): void {
  accessToken = token;
  writeHint(Boolean(token));
}

export function clearAccessToken(): void {
  accessToken = null;
  writeHint(false);
}

export function hasSessionHint(): boolean {
  return readHint();
}
