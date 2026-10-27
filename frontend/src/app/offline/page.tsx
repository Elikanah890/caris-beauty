'use client';

import Link from 'next/link';
import { RefreshCw, WifiOff } from 'lucide-react';
import { BrandLockup } from '@/components/brand-mark';

export default function OfflinePage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-blush-50 p-6">
      <div className="w-full max-w-md rounded-3xl border border-line bg-white p-8 text-center shadow-lift">
        <div className="flex justify-center">
          <BrandLockup name="Caris Beauty and Cosmetics" />
        </div>
        <span className="mx-auto mt-6 flex h-14 w-14 items-center justify-center rounded-2xl bg-[#fdf3dd] text-[#8b681f]">
          <WifiOff size={26} />
        </span>
        <h1 className="mt-4 font-display text-2xl font-semibold text-ink">You are offline</h1>
        <p className="mt-2 text-sm leading-relaxed text-muted">
          This page is not cached yet. Your saved data is still on this device and will sync
          automatically when the connection returns.
        </p>
        <div className="mt-6 grid gap-2">
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-brand-500 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-600"
          >
            <RefreshCw size={15} /> Try again
          </button>
          <Link
            href="/pos"
            className="inline-flex items-center justify-center rounded-xl border border-line bg-white px-4 py-2.5 text-sm font-semibold text-ink transition hover:border-brand-300 hover:text-brand-700"
          >
            Open POS
          </Link>
          <Link
            href="/"
            className="inline-flex items-center justify-center rounded-xl px-4 py-2 text-xs font-medium text-muted transition hover:text-ink"
          >
            Go to home
          </Link>
        </div>
      </div>
    </div>
  );
}
