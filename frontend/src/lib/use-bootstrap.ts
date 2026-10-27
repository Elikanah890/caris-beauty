'use client';

import { useEffect } from 'react';
import { bootstrapAuth } from './auth';
import { useAuthStore } from '@/store/auth-store';

export function useBootstrap() {
  const initialized = useAuthStore((state) => state.initialized);
  const setSession = useAuthStore((state) => state.setSession);
  const setInitialized = useAuthStore((state) => state.setInitialized);
  const setHasLocalAuth = useAuthStore((state) => state.setHasLocalAuth);
  const setOffline = useAuthStore((state) => state.setOffline);

  useEffect(() => {
    if (initialized) return;
    let cancelled = false;
    (async () => {
      const { session, hasLocalAuth } = await bootstrapAuth();
      if (cancelled) return;
      setHasLocalAuth(hasLocalAuth);
      setOffline(typeof navigator !== 'undefined' ? !navigator.onLine : false);
      if (session) {
        setSession(session);
      } else {
        setInitialized(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [initialized, setHasLocalAuth, setInitialized, setOffline, setSession]);
}
