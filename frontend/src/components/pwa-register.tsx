'use client';

import { useEffect } from 'react';

export function PwaRegister() {
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!('serviceWorker' in navigator)) return;

    if (process.env.NODE_ENV !== 'production') {
      // A service worker left over from a production build can serve stale
      // hashed chunks to `next dev`. Drop it and its caches in development.
      navigator.serviceWorker
        .getRegistrations()
        .then((registrations) =>
          Promise.all(registrations.map((registration) => registration.unregister()))
        )
        .catch(() => {});
      if ('caches' in window) {
        caches
          .keys()
          .then((keys) => Promise.all(keys.map((key) => caches.delete(key))))
          .catch(() => {});
      }
      return;
    }

    const warmRoutes = [
      '/',
      '/offline',
      '/auth/login',
      '/pos',
      '/stock',
      '/dashboard',
      '/reports',
      '/more/expenses',
      '/more/purchases',
      '/more/customers',
      '/more/profile',
      '/more/settings',
      '/more/audit',
      '/more/staff'
    ];

    const hadController = Boolean(navigator.serviceWorker.controller);
    let reloading = false;
    const handleControllerChange = () => {
      // Only reload on an actual update, not on the first install.
      if (!hadController || reloading) return;
      reloading = true;
      window.location.reload();
    };
    navigator.serviceWorker.addEventListener('controllerchange', handleControllerChange);

    const register = () => {
      navigator.serviceWorker
        .register('/sw.js')
        .then(async () => {
          try {
            await navigator.serviceWorker.ready;
            // Warm the navigation cache so the offline PIN screen and the
            // main tabs load even before the user has visited them online.
            const cache = await caches.open('duka-pages');
            await Promise.allSettled(
              warmRoutes.map(async (route) => {
                const response = await fetch(route, { credentials: 'include' });
                if (response.ok) await cache.put(route, response.clone());
              })
            );
          } catch {
            // Offline support is best-effort; the app still works online.
          }
        })
        .catch(() => {
          // Offline support is best-effort; the app still works online.
        });
    };

    if (document.readyState === 'complete') register();
    else window.addEventListener('load', register, { once: true });

    return () => {
      window.removeEventListener('load', register);
      navigator.serviceWorker.removeEventListener('controllerchange', handleControllerChange);
    };
  }, []);

  return null;
}
