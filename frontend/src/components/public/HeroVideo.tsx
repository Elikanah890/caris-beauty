'use client';

import { useEffect, useState } from 'react';

export function HeroVideo() {
  const [reducedMotion, setReducedMotion] = useState<boolean | null>(null);

  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    const apply = () => setReducedMotion(query.matches);
    apply();
    query.addEventListener?.('change', apply);
    return () => query.removeEventListener?.('change', apply);
  }, []);

  return (
    <div className="absolute inset-0 bg-blush-100">
      {reducedMotion === false ? (
        <video
          autoPlay
          loop
          muted
          playsInline
          preload="metadata"
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
