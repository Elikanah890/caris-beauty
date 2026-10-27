import { apiRequest, refreshSession } from './api';
import { clearOfflineUnlocked, logoutOnline } from './auth';
import { db } from './db';
import { clearAccessToken, getAccessToken } from './token';
import { useAuthStore } from '@/store/auth-store';
import { useSyncStore } from '@/store/sync-store';

async function clearBrowserCaches(): Promise<void> {
  if (typeof caches !== 'undefined') {
    try {
      const keys = await caches.keys();
      await Promise.all(keys.map((key) => caches.delete(key)));
    } catch {
      // Cache clearing is best-effort; the fresh app shell will still load.
    }
  }

  if ('serviceWorker' in navigator) {
    try {
      const registrations = await navigator.serviceWorker.getRegistrations();
      await Promise.all(registrations.map((registration) => registration.unregister()));
    } catch {
      // The service worker will re-register on the next production load.
    }
  }
}

async function wipeIndexedDb(): Promise<void> {
  try {
    await db.delete();
  } catch {
    // Some browsers can block database deletion while another tab is open.
    // Clearing every table still removes the stale local cache.
    await Promise.all(db.tables.map((table) => table.clear()));
  }
}

export async function forceFullSync(): Promise<void> {
  if (!getAccessToken()) {
    const refreshed = await refreshSession(true);
    if (!refreshed) {
      throw new Error('Sign in online with the owner account, then try again.');
    }
  }

  // The server must authorize the wipe before we touch local data.
  await apiRequest('/sync/reset', { method: 'POST', body: {} });

  await wipeIndexedDb();
  await clearBrowserCaches();

  try {
    await logoutOnline();
  } catch {
    // The local reset must still work if the network drops after authorization.
  }
  clearAccessToken();
  clearOfflineUnlocked();

  useAuthStore.getState().reset();
  useSyncStore.setState({
    online: typeof navigator === 'undefined' ? true : navigator.onLine,
    syncing: false,
    pending: 0,
    errorRows: 0,
    lastSyncedAt: null,
    error: null
  });

  window.location.replace('/auth/login?refreshed=1');
}
