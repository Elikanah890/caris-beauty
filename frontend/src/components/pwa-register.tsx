'use client';

import { useEffect } from 'react';

const WARM_ROUTES = [
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

type NavigatorWithConnection = Navigator & {
  connection?: { saveData?: boolean };
};

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


    // Next's client router fetches RSC payloads for <Link> clicks. Offline
    // those requests are not guaranteed to be cached, so force a normal page
    // load instead. The service worker then serves the cached document.
    const handleOfflineLink = (event: MouseEvent) => {
      if (navigator.onLine) return;
      if (event.defaultPrevented || event.button !== 0) return;
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const target = event.target;
      if (!(target instanceof Element)) return;
      const anchor = target.closest('a');
      if (!anchor || anchor.target === '_blank' || anchor.hasAttribute('download')) return;
      const href = anchor.getAttribute('href');
      if (!href || href.startsWith('#') || href.startsWith('mailto:') || href.startsWith('tel:')) {
        return;
      }
      const url = new URL(anchor.href, window.location.href);
      if (url.origin !== window.location.origin) return;
      if (url.pathname === window.location.pathname && url.search === window.location.search) {
        return;
      }
      event.preventDefault();
      window.location.assign(url.href);
    };
    document.addEventListener('click', handleOfflineLink, true);

    const hadController = Boolean(navigator.serviceWorker.controller);
    let reloading = false;

    const handleControllerChange = () => {
      // A new build has taken control. Drop page/RSC responses from the old
      // build before reloading so offline navigation cannot load stale HTML
      // that points at chunks which no longer exist.
      if (hadController && 'caches' in window) {
        void Promise.all([
          caches.delete('duka-pages'),
          caches.delete('duka-rsc')
        ]).catch(() => {});
      }
      // Only reload on an actual update, not on the first install.
      if (!hadController || reloading) return;
      reloading = true;
      window.location.reload();
    };
    navigator.serviceWorker.addEventListener('controllerchange', handleControllerChange);

    const warmMissingRoutes = async () => {
      if (typeof navigator !== 'undefined' && !navigator.onLine) return;
      const connection = (navigator as NavigatorWithConnection).connection;
      if (connection?.saveData) return;
      if (!('caches' in window)) return;

      try {
        const cache = await caches.open('duka-pages');
        for (const route of WARM_ROUTES) {
          if (!navigator.onLine) break;
          if (await cache.match(route)) continue;
          try {
            const response = await fetch(route, {
              credentials: 'same-origin',
              redirect: 'follow'
            });
            if (response.ok && !response.redirected) {
              await cache.put(route, response.clone());
            }
          } catch {
            // One failed route must not stop the remaining warm-up.
          }
        }
      } catch {
        // Offline support is best-effort; the app still works online.
      }
    };

    let warmTimer: ReturnType<typeof setTimeout> | null = null;
    const startWarm = () => {
      warmTimer = setTimeout(() => {
        void warmMissingRoutes();
      }, 1200);
    };

    const register = () => {
      navigator.serviceWorker
        .register('/sw.js', { scope: '/', updateViaCache: 'none' })
        .then(async () => {
          try {
            await navigator.serviceWorker.ready;
            if ('storage' in navigator && 'persist' in navigator.storage) {
              await navigator.storage.persist().catch(() => false);
            }
            startWarm();
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
      document.removeEventListener('click', handleOfflineLink, true);
      if (warmTimer) clearTimeout(warmTimer);
      navigator.serviceWorker.removeEventListener('controllerchange', handleControllerChange);
    };
  }, []);

  return null;
}
