import withPWAInit from 'next-pwa';

const withPWA = withPWAInit({
  dest: 'public',
  disable: process.env.NODE_ENV === 'development',
  // The app registers the service worker itself (PwaRegister) so it can also
  // warm the offline page cache and clean up stale workers in development.
  register: false,
  skipWaiting: true,
  clientsClaim: true,
  cacheOnFrontEndNav: true,
  reloadOnOnline: false,
  fallbacks: {
    document: '/offline'
  },
  buildExcludes: [/middleware-manifest\.json$/, /app-build-manifest\.json$/, /react-loadable-manifest\.json$/, /_buildManifest\.js$/, /_ssgManifest\.js$/],
  runtimeCaching: [
    {
      urlPattern: ({ request }) => request.mode === 'navigate',
      handler: 'NetworkFirst',
      options: {
        cacheName: 'duka-pages',
        networkTimeoutSeconds: 5,
        expiration: { maxEntries: 60, maxAgeSeconds: 7 * 24 * 60 * 60 }
      }
    },
    {
      urlPattern: ({ request }) =>
        ['style', 'script', 'worker'].includes(request.destination),
      handler: 'StaleWhileRevalidate',
      options: {
        cacheName: 'duka-assets',
        expiration: { maxEntries: 100, maxAgeSeconds: 30 * 24 * 60 * 60 }
      }
    },
    {
      urlPattern: /[?&]_rsc=/,
      handler: 'NetworkFirst',
      options: {
        cacheName: 'duka-rsc',
        networkTimeoutSeconds: 3,
        expiration: { maxEntries: 120, maxAgeSeconds: 7 * 24 * 60 * 60 }
      }
    },
    {
      urlPattern: ({ request }) => request.destination === 'image',
      handler: 'CacheFirst',
      options: {
        cacheName: 'duka-images',
        expiration: { maxEntries: 80, maxAgeSeconds: 30 * 24 * 60 * 60 }
      }
    },
    {
      urlPattern: ({ request }) => request.destination === 'font',
      handler: 'CacheFirst',
      options: {
        cacheName: 'duka-fonts',
        expiration: { maxEntries: 20, maxAgeSeconds: 365 * 24 * 60 * 60 }
      }
    }
  ]
});

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: []
};

export default withPWA(nextConfig);
