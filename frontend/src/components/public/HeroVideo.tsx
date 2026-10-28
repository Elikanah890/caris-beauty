'use client';

import { useEffect, useState } from 'react';

type NavigatorWithConnection = Navigator & {
  connection?: { saveData?: boolean; effectiveType?: string };
};

export function HeroVideo() {
  const [reducedMotion, setReducedMotion] = useState<boolean | null>(null);
  const [showVideo, setShowVideo] = useState(false);

  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    const apply = () => setReducedMotion(query.matches);
    apply();
    query.addEventListener?.('change', apply);
    return () => query.removeEventListener?.('change', apply);
  }, []);

  useEffect(() => {
    if (reducedMotion !== false) return;
    const connection = (navigator as NavigatorWithConnection).connection;
    if (connection?.saveData || connection?.effectiveType?.includes('2g')) return;

    // Keep the poster as the first paint. The 3MB loop starts only after the
    // page is idle so it does not compete with the app shell or PWA install.
    const start = () => setShowVideo(true);
    if ('requestIdleCallback' in window) {
      const id = window.requestIdleCallback(start, { timeout: 2500 });
      return () => window.cancelIdleCallback(id);
    }
    const id = setTimeout(start, 1800);
    return () => clearTimeout(id);
  }, [reducedMotion]);

  return (
    <div className="absolute inset-0 bg-blush-100">
      {reducedMotion === false && showVideo ? (
        <video
          autoPlay
          loop
          muted
          playsInline
          preload="none"
          poster="/images/home/hero-loop-poster.jpg?v=3"
          aria-hidden="true"
          tabIndex={-1}
          className="absolute inset-0 h-full w-full object-cover"
        >
          <source src="/videos/hero-loop.mp4?v=3" type="video/mp4" />
        </video>
      ) : (
        <div
          className="absolute inset-0 bg-[url('/images/home/hero-loop-poster.jpg?v=3')] bg-cover bg-center"
          aria-hidden="true"
        />
      )}
    </div>
  );
}
