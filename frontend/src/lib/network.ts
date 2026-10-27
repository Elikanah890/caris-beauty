import { API_URL } from './api';

let lastProbe: { at: number; online: boolean } | null = null;
const PROBE_TTL_MS = 4_000;

export function browserOnline(): boolean {
  return typeof navigator === 'undefined' ? true : navigator.onLine;
}

/**
 * Verify that the API is actually reachable. `navigator.onLine` only tells us
 * that a network interface exists — it does not prove the server or internet
 * is reachable, so we probe the health endpoint with a short timeout.
 */
export async function probeConnectivity(force = false): Promise<boolean> {
  if (!browserOnline()) {
    lastProbe = { at: Date.now(), online: false };
    return false;
  }
  const now = Date.now();
  if (!force && lastProbe && now - lastProbe.at < PROBE_TTL_MS) {
    return lastProbe.online;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 4_500);
  try {
    const response = await fetch(`${API_URL}/health`, {
      method: 'GET',
      cache: 'no-store',
      credentials: 'include',
      signal: controller.signal
    });
    const online = response.ok;
    lastProbe = { at: Date.now(), online };
    return online;
  } catch {
    lastProbe = { at: Date.now(), online: false };
    return false;
  } finally {
    clearTimeout(timer);
  }
}
