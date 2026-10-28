import { getAccessToken, setAccessToken, clearAccessToken, hasSessionHint } from './token';

export const API_URL =
  process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1';

export class ApiError extends Error {
  readonly code: string;
  readonly status: number;
  readonly field?: string;

  constructor(status: number, code: string, message: string, field?: string) {
    super(message);
    this.status = status;
    this.code = code;
    this.field = field;
  }
}

interface ApiOptions extends Omit<RequestInit, 'body'> {
  body?: unknown;
  auth?: boolean;
  retry?: boolean;
}

let lastConnectivity: boolean | null = null;

function notifyConnectivity(online: boolean): void {
  if (typeof window === 'undefined') return;
  if (lastConnectivity === online) return;
  lastConnectivity = online;
  window.dispatchEvent(
    new CustomEvent('duka:connectivity', { detail: { online } })
  );
}

async function rawRequest<T>(path: string, options: ApiOptions = {}): Promise<T> {
  const { body, auth = true, retry = true, headers, ...rest } = options;
  const finalHeaders = new Headers(headers);
  if (body !== undefined) finalHeaders.set('Content-Type', 'application/json');
  const token = getAccessToken();
  if (auth && token) finalHeaders.set('Authorization', `Bearer ${token}`);

  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      ...rest,
      headers: finalHeaders,
      credentials: 'include',
      body: body === undefined ? undefined : JSON.stringify(body)
    });
    notifyConnectivity(true);
  } catch {
    notifyConnectivity(false);
    throw new ApiError(0, 'OFFLINE', 'You are offline. This will retry when you reconnect.');
  }

  if (res.status === 401 && auth && retry && !path.startsWith('/auth/')) {
    const refreshed = await refreshSession();
    if (refreshed) {
      return rawRequest<T>(path, { ...options, retry: false });
    }
    if (typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent('duka:session-revoked', {
          detail: { code: 'UNAUTHORIZED', message: 'Please sign in again.' }
        })
      );
    }
    throw new ApiError(401, 'UNAUTHORIZED', 'Please sign in again.');
  }

  const text = await res.text();
  let data: unknown = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
  }

  if (!res.ok) {
    const error = (data as { error?: { code?: string; message?: string; field?: string } } | null)
      ?.error;
    const code = error?.code ?? 'REQUEST_FAILED';
    if (res.status === 401) clearAccessToken();
    if (
      typeof window !== 'undefined' &&
      !path.startsWith('/auth/') &&
      (code === 'ACCOUNT_DISABLED' || (res.status === 401 && code === 'UNAUTHORIZED'))
    ) {
      window.dispatchEvent(
        new CustomEvent('duka:session-revoked', {
          detail: { code, message: error?.message ?? 'Please sign in again.' }
        })
      );
    }
    throw new ApiError(
      res.status,
      code,
      error?.message ?? 'Request failed',
      error?.field
    );
  }

  return data as T;
}

export function apiRequest<T>(path: string, options: ApiOptions = {}): Promise<T> {
  return rawRequest<T>(path, options);
}

let refreshPromise: Promise<{ accessToken: string; user: unknown } | null> | null = null;

export interface RefreshFailure {
  code: string;
  message: string;
}

let lastRefreshFailure: RefreshFailure | null = null;

export function getLastRefreshFailure(): RefreshFailure | null {
  return lastRefreshFailure;
}

export async function refreshSession(force = false): Promise<{ accessToken: string; user: unknown } | null> {
  if (!force && !hasSessionHint()) {
    lastRefreshFailure = null;
    return null;
  }
  if (refreshPromise) return refreshPromise;
  refreshPromise = (async () => {
    try {
      const res = await fetch(`${API_URL}/auth/refresh`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: '{}'
      });
      if (!res.ok) {
        clearAccessToken();
        let code = 'UNAUTHORIZED';
        let message = 'Please sign in again.';
        try {
          const body = (await res.json()) as {
            error?: { code?: string; message?: string };
          };
          code = body?.error?.code ?? code;
          message = body?.error?.message ?? message;
        } catch {
          // Non-JSON error response.
        }
        lastRefreshFailure = { code, message };
        if (
          typeof window !== 'undefined' &&
          (code === 'ACCOUNT_DISABLED' || code === 'DEVICE_REVOKED')
        ) {
          window.dispatchEvent(
            new CustomEvent('duka:session-revoked', {
              detail: { code, message }
            })
          );
        }
        return null;
      }
      notifyConnectivity(true);
      lastRefreshFailure = null;
      const data = (await res.json()) as { accessToken: string; user: unknown };
      setAccessToken(data.accessToken);
      return data;
    } catch {
      lastRefreshFailure = { code: 'OFFLINE', message: 'You are offline.' };
      notifyConnectivity(false);
      return null;
    } finally {
      refreshPromise = null;
    }
  })();
  return refreshPromise;
}

export async function pullRequest<T>(since: string): Promise<T> {
  return apiRequest<T>('/sync/pull', { method: 'POST', body: { since } });
}

export function isOnline(): boolean {
  return typeof navigator === 'undefined' ? true : navigator.onLine;
}
