'use client';

import { useEffect, useState } from 'react';
import { Download, Loader2, Share2, Smartphone } from 'lucide-react';
import { Dialog } from './ui/dialog';
import { Button } from './ui/button';
import { cn } from '@/lib/utils';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

type Variant = 'brand' | 'home' | 'outline';

const VARIANTS: Record<Variant, string> = {
  brand:
    'bg-brand-500 text-white hover:bg-brand-600 shadow-[0_10px_20px_-12px_rgba(249,115,22,.9)]',
  home: 'bg-blush-700 text-white hover:bg-blush-800',
  outline: 'border border-line bg-white text-ink hover:border-brand-300 hover:text-brand-700'
};

export function InstallPwaButton({
  variant = 'outline',
  compact = false,
  label = 'Install app',
  className
}: {
  variant?: Variant;
  compact?: boolean;
  label?: string;
  className?: string;
}) {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);
  const [ios, setIos] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const standalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as { standalone?: boolean }).standalone === true;
    setInstalled(standalone);
    setIos(
      /iphone|ipad|ipod/i.test(navigator.userAgent) ||
        (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
    );

    const onPrompt = (event: Event) => {
      event.preventDefault();
      setDeferred(event as BeforeInstallPromptEvent);
    };
    const onInstalled = () => {
      setInstalled(true);
      setDeferred(null);
    };

    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  if (installed) return null;

  const install = async () => {
    if (!deferred) {
      setHelpOpen(true);
      return;
    }
    setBusy(true);
    try {
      await deferred.prompt();
      const choice = await deferred.userChoice;
      if (choice.outcome === 'accepted') setInstalled(true);
      setDeferred(null);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => void install()}
        className={cn(
          'inline-flex items-center justify-center gap-2 rounded-xl px-3 py-2 text-xs font-semibold transition',
          VARIANTS[variant],
          className
        )}
      >
        {busy ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
        {compact ? 'Install' : label}
      </button>

      <Dialog
        open={helpOpen}
        onOpenChange={setHelpOpen}
        title="Install the Caris app"
        description="Add the app to your phone or computer for one-tap access and offline use."
        size="sm"
        footer={<Button onClick={() => setHelpOpen(false)}>Got it</Button>}
      >
        <div className="space-y-3 text-sm text-muted">
          {ios ? (
            <>
              <p className="flex items-start gap-2">
                <Share2 size={16} className="mt-0.5 shrink-0 text-brand-600" />
                Tap the <strong className="text-ink">Share</strong> button in Safari.
              </p>
              <p className="rounded-xl bg-cream px-3 py-2 text-xs">
                Scroll down and tap <strong className="text-ink">Add to Home Screen</strong>,
                then tap <strong className="text-ink">Add</strong>.
              </p>
            </>
          ) : (
            <>
              <p className="flex items-start gap-2">
                <Smartphone size={16} className="mt-0.5 shrink-0 text-brand-600" />
                Open your browser menu (<strong className="text-ink">⋮</strong> or{' '}
                <strong className="text-ink">⋯</strong>) and choose{' '}
                <strong className="text-ink">Install app</strong> or{' '}
                <strong className="text-ink">Add to Home screen</strong>.
              </p>
              <p className="rounded-xl bg-cream px-3 py-2 text-xs">
                On desktop Chrome or Edge, use the install icon in the address bar.
              </p>
            </>
          )}
          <p className="text-xs">
            The install option appears after the site has been opened online once over
            HTTPS. After installing, it opens full-screen and keeps working offline.
          </p>
        </div>
      </Dialog>
    </>
  );
}
