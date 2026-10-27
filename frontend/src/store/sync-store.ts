'use client';

import { create } from 'zustand';

interface SyncState {
  online: boolean;
  syncing: boolean;
  pending: number;
  errorRows: number;
  lastSyncedAt: string | null;
  error: string | null;
  setOnline: (online: boolean) => void;
  setSyncing: (syncing: boolean) => void;
  setPending: (pending: number) => void;
  setErrorRows: (rows: number) => void;
  setLastSyncedAt: (value: string | null) => void;
  setError: (error: string | null) => void;
}

export const useSyncStore = create<SyncState>((set) => ({
  online: typeof navigator === 'undefined' ? true : navigator.onLine,
  syncing: false,
  pending: 0,
  errorRows: 0,
  lastSyncedAt: null,
  error: null,
  setOnline: (online) => set({ online }),
  setSyncing: (syncing) => set({ syncing }),
  setPending: (pending) => set({ pending }),
  setErrorRows: (errorRows) => set({ errorRows }),
  setLastSyncedAt: (lastSyncedAt) => set({ lastSyncedAt }),
  setError: (error) => set({ error })
}));
