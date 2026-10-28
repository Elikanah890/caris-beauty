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
  // Do not precache marketing videos or large photos. The service worker's
  // runtime image cache fills them on demand; the app shell stays small.
  publicExcludes: [
    '!videos/**/*',
    '!images/home/**/*',
    '!images/profile-lady.jpg',
    '!logo.jpeg'
  ],
  runtimeCaching: [
    {
      // Next.js hashed build assets never change; CacheFirst makes repeat
      // launches and offline navigation much faster than revalidating them.
      urlPattern: /\/_next\/static\/.*/i,
      handler: 'CacheFirst',
      options: {
        cacheName: 'duka-static',
        expiration: { maxEntries: 300, maxAgeSeconds: 365 * 24 * 60 * 60 }
      }
    },
    {
      urlPattern: ({ request }) => request.mode === 'navigate',
      handler: 'NetworkFirst',
      options: {
        cacheName: 'duka-pages',
        networkTimeoutSeconds: 3,
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
        matchOptions: { ignoreSearch: true },
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
  poweredByHeader: false,
  compress: true,
  productionBrowserSourceMaps: false,
  transpilePackages: [],
  experimental: {
    optimizePackageImports: ['lucide-react', 'date-fns', 'recharts']
  },
  async headers() {
    return [
      {
        source: '/sw.js',
        headers: [
          { key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' },
          { key: 'Service-Worker-Allowed', value: '/' }
        ]
      },
      {
        source: '/manifest.json',
        headers: [{ key: 'Cache-Control', value: 'public, max-age=0, must-revalidate' }]
      },
      {
        source: '/_next/static/:path*',
        headers: [{ key: 'Cache-Control', value: 'public, max-age=31536000, immutable' }]
      },
      {
        source: '/icons/:path*',
        headers: [{ key: 'Cache-Control', value: 'public, max-age=2592000' }]
      },
      {
        source: '/images/:path*',
        headers: [{ key: 'Cache-Control', value: 'public, max-age=2592000' }]
      },
      {
        source: '/videos/:path*',
        headers: [{ key: 'Cache-Control', value: 'public, max-age=2592000' }]
      }
    ];
  }
};

export default withPWA(nextConfig);
