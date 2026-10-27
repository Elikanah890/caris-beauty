'use client';

import { useEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/lib/db';
import { syncNow } from '@/lib/sync';
import { useSyncStore } from '@/store/sync-store';

export function SyncEngine() {
  const setPending = useSyncStore((state) => state.setPending);
  const setErrorRows = useSyncStore((state) => state.setErrorRows);
  const setOnline = useSyncStore((state) => state.setOnline);
  const setLastSyncedAt = useSyncStore((state) => state.setLastSyncedAt);

  const pending = useLiveQuery(
    () => db.sync_queue.filter((row) => row.status !== 'error').count(),
    [],
    0
  );
  const errors = useLiveQuery(
    () => db.sync_queue.where('status').equals('error').count(),
    [],
    0
  );

  useEffect(() => setPending(pending ?? 0), [pending, setPending]);
  useEffect(() => setErrorRows(errors ?? 0), [errors, setErrorRows]);

  useEffect(() => {
    void (async () => {
      const meta = await db.app_meta.get('lastSyncedAt');
      if (meta?.value) setLastSyncedAt(meta.value);
    })();
  }, [setLastSyncedAt]);

  useEffect(() => {
    const handleOnline = () => {
      setOnline(true);
      void syncNow();
    };
    const handleOffline = () => setOnline(false);
    const handleVisible = () => {
      if (document.visibilityState === 'visible') void syncNow();
    };
    const handleConnectivity = (event: Event) => {
      const detail = (event as CustomEvent<{ online?: boolean }>).detail;
      if (typeof detail?.online !== 'boolean') return;
      setOnline(detail.online);
      if (detail.online) void syncNow();
    };

    setOnline(navigator.onLine);
    void syncNow();
    const interval = window.setInterval(() => void syncNow(), 60_000);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    window.addEventListener('duka:connectivity', handleConnectivity);
    document.addEventListener('visibilitychange', handleVisible);

    return () => {
      window.clearInterval(interval);
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('duka:connectivity', handleConnectivity);
      document.removeEventListener('visibilitychange', handleVisible);
    };
  }, [setOnline]);

  return null;
}
