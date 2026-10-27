import { apiRequest, refreshSession, ApiError } from './api';
import { browserOnline, probeConnectivity } from './network';
import { db } from './db';
import { getAccessToken } from './token';
import { useSyncStore } from '@/store/sync-store';
import type { User } from './types';
import { normalizePermissions } from './permissions';
import { uuid } from './utils';

const LWW_TABLES = new Set([
  'business',
  'units',
  'categories',
  'users',
  'devices',
  'products',
  'product_units',
  'customers',
  'suppliers',
  'purchases',
  'sales',
  'payments',
  'expenses'
]);

const NUMERIC_QTY_TABLES = new Set(['sale_items', 'purchase_items']);

interface PullResponse {
  serverTime: string;
  tables: Record<string, Array<Record<string, unknown>>>;
  deletions?: {
    products?: Array<{ id: string; deletedAt: string }>;
  };
}

const PULL_STORES = [
  'business',
  'units',
  'categories',
  'users',
  'devices',
  'products',
  'product_units',
  'customers',
  'suppliers',
  'purchases',
  'purchase_items',
  'sales',
  'sale_items',
  'payments',
  'stock_movements',
  'expenses',
  'audit_log'
] as const;

function normalizeRow(table: string, row: Record<string, unknown>): Record<string, unknown> {
  const copy = { ...row };
  if (table === 'users' && typeof copy.role === 'string') {
    copy.permissions = normalizePermissions(copy.role as User['role'], copy.permissions);
  }
  if (NUMERIC_QTY_TABLES.has(table)) copy.qty = Number(copy.qty);
  return copy;
}

export async function pullAll(): Promise<void> {
  const meta = await db.app_meta.get('lastPulledAt');
  const since = meta?.value ?? new Date(0).toISOString();
  const data = await apiRequest<PullResponse>('/sync/pull', {
    method: 'POST',
    body: { since }
  });

  const tables = [...PULL_STORES.map((name) => db.table(name)), db.app_meta, db.sync_queue];
  await db.transaction('rw', tables, async () => {
    for (const name of PULL_STORES) {
      const rows = data.tables[name] ?? [];
      const table = db.table(name);
      if (LWW_TABLES.has(name)) {
        for (const raw of rows) {
          const row = normalizeRow(name, raw);
          const id = row.id as string | undefined;
          if (!id) continue;
          const existing = (await table.get(id)) as Record<string, unknown> | undefined;
          const incomingUpdated = String(row.updatedAt ?? row.createdAt ?? '');
          const currentUpdated = String(existing?.updatedAt ?? existing?.createdAt ?? '');
          if (existing && incomingUpdated && currentUpdated && incomingUpdated < currentUpdated) {
            continue;
          }
          await table.put(row);
        }
      } else {
        const normalized = rows.map((row) => normalizeRow(name, row));
        if (normalized.length) await table.bulkPut(normalized);
      }
    }
    const deletedProductIds = (data.deletions?.products ?? [])
      .map((row) => row.id)
      .filter(Boolean);

    if (deletedProductIds.length > 0) {
      await db.products.bulkDelete(deletedProductIds);
      await db.product_units.where('productId').anyOf(deletedProductIds).delete();

      const queueRows = await db.sync_queue.toArray();
      const staleQueueIds = queueRows
        .filter((row) => {
          if (row.entity !== 'products' && row.entity !== 'product_units') return false;
          const payloadProductId =
            row.entity === 'products'
              ? row.payload.id
              : row.payload.productId;
          return (
            typeof payloadProductId === 'string' &&
            deletedProductIds.includes(payloadProductId)
          );
        })
        .map((row) => row.id);

      if (staleQueueIds.length > 0) {
        await db.sync_queue.bulkDelete(staleQueueIds);
      }
    }

    await db.app_meta.put({ key: 'lastPulledAt', value: data.serverTime });
  });
}

interface PushResponse {
  results: Array<{ id: string; status: 'ok' | 'error'; reason?: string }>;
  serverTime: string;
}

export async function drainQueue(): Promise<{ pushed: number; errors: number }> {
  const rows = await db.sync_queue
    .orderBy('createdAt')
    .filter((row) => row.status !== 'error')
    .limit(50)
    .toArray();

  if (rows.length === 0) return { pushed: 0, errors: 0 };

  const res = await apiRequest<PushResponse>('/sync/push', {
    method: 'POST',
    body: {
      batch: rows.map((row) => ({
        id: row.id,
        entity: row.entity,
        op: row.op,
        payload: row.payload,
        createdAt: row.createdAt
      }))
    }
  });

  let errors = 0;
  await db.transaction('rw', db.sync_queue, async () => {
    for (const result of res.results) {
      if (result.status === 'ok') {
        await db.sync_queue.delete(result.id);
      } else {
        errors += 1;
        await db.sync_queue.update(result.id, {
          status: 'error',
          error: result.reason ?? 'Sync rejected'
        });
      }
    }
  });
  return { pushed: rows.length - errors, errors };
}

let running = false;
let debounce: ReturnType<typeof setTimeout> | null = null;
let retryTimer: ReturnType<typeof setTimeout> | null = null;
const BASE_RETRY_MS = 5_000;
const MAX_RETRY_MS = 5 * 60_000;
let retryDelay = BASE_RETRY_MS;

function scheduleRetry(): void {
  if (retryTimer) return;
  retryTimer = setTimeout(() => {
    retryTimer = null;
    void syncNow();
  }, retryDelay);
  retryDelay = Math.min(retryDelay * 2, MAX_RETRY_MS);
}

function resetRetry(): void {
  retryDelay = BASE_RETRY_MS;
  if (retryTimer) {
    clearTimeout(retryTimer);
    retryTimer = null;
  }
}

export async function syncNow(): Promise<void> {
  const store = useSyncStore.getState();
  if (running) return;

  if (!browserOnline()) {
    store.setOnline(false);
    store.setError(null);
    scheduleRetry();
    return;
  }

  running = true;
  store.setSyncing(true);
  store.setError(null);

  try {
    // navigator.onLine can be true while the API is unreachable (captive
    // portal, server restart, Wi-Fi without internet). Probe before syncing.
    const reachable = await probeConnectivity(true);
    if (!reachable) {
      store.setOnline(false);
      store.setError(null);
      scheduleRetry();
      return;
    }
    store.setOnline(true);

    if (!getAccessToken()) {
      const refreshed = await refreshSession();
      if (!refreshed) {
        store.setError('Sign in online to sync');
        return;
      }
    }

    // Push in small batches and keep going while there is work. Stop early if
    // the server rejects rows so we don't hammer it with known-bad changes.
    for (let index = 0; index < 5; index += 1) {
      const result = await drainQueue();
      if (result.pushed === 0 || result.errors > 0) break;
    }

    await pullAll();

    const syncedAt = new Date().toISOString();
    store.setLastSyncedAt(syncedAt);
    await db.app_meta.put({ key: 'lastSyncedAt', value: syncedAt });
    resetRetry();
  } catch (err) {
    const apiError = err instanceof ApiError ? err : null;
    const transient =
      !apiError || apiError.status === 0 || apiError.status >= 500 || apiError.code === 'OFFLINE';
    if (transient) {
      // A dropped connection is not a permanent sync error. Keep the queue
      // intact and retry with exponential backoff.
      store.setOnline(false);
      store.setError(null);
      scheduleRetry();
    } else {
      store.setError(apiError.message);
    }
  } finally {
    running = false;
    store.setSyncing(false);
    store.setPending(await db.sync_queue.filter((row) => row.status !== 'error').count());
    store.setErrorRows(await db.sync_queue.where('status').equals('error').count());
  }
}

export function requestSync(delay = 700): void {
  if (debounce) clearTimeout(debounce);
  debounce = setTimeout(() => {
    debounce = null;
    void syncNow();
  }, delay);
}

export async function retryFailedRows(): Promise<void> {
  const failed = await db.sync_queue.where('status').equals('error').toArray();
  await db.sync_queue.bulkPut(
    failed.map((row) => ({ ...row, status: 'pending' as const, error: null }))
  );
  await syncNow();
}

export function newQueueId(): string {
  return uuid();
}
