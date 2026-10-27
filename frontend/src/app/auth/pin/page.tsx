'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Fingerprint, ShieldCheck } from 'lucide-react';
import { BrandMark } from '@/components/brand-mark';
import { PinPad } from '@/components/pin-pad';
import { useBootstrap } from '@/lib/use-bootstrap';
import { useAuthStore } from '@/store/auth-store';
import { getLocalAuth, offlineSession, setOfflineUnlocked, unlockWithPin } from '@/lib/auth';
import { t } from '@/lib/strings';
import { Splash } from '@/components/splash';
import type { LocalAuth } from '@/lib/types';
import { cn } from '@/lib/utils';

export default function PinPage() {
  useBootstrap();
  const router = useRouter();
  const initialized = useAuthStore((state) => state.initialized);
  const user = useAuthStore((state) => state.user);
  const setSession = useAuthStore((state) => state.setSession);
  const offline = useAuthStore((state) => state.offline);
  const [local, setLocal] = useState<LocalAuth | null>(null);
  const [checked, setChecked] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [resetKey, setResetKey] = useState(0);

  useEffect(() => {
    (async () => {
      const row = await getLocalAuth();
      setLocal(row);
      setChecked(true);
      if (!row) router.replace('/auth/login');
    })();
  }, [router]);

  useEffect(() => {
    if (initialized && user) {
      router.replace(user.role === 'owner' ? '/dashboard' : '/pos');
    }
  }, [initialized, user, router]);

  const handlePin = async (pin: string) => {
    setError(null);
    setBusy(true);
    try {
      const unlocked = await unlockWithPin(pin);
      if (!unlocked) {
        setError(t.auth.wrongPin);
        setResetKey((key) => key + 1);
        return;
      }
      const session = await offlineSession(unlocked);
      setOfflineUnlocked(unlocked.email);
      setSession({
        user: session.user,
        device: session.device,
        business: session.business,
        offline: !navigator.onLine
      });
      router.replace(session.user.role === 'owner' ? '/dashboard' : '/pos');
    } finally {
      setBusy(false);
    }
  };

  if (!checked || !initialized) return <Splash label="Checking your PIN…" />;

  if (!local) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Link href="/auth/login" className="text-sm font-semibold text-brand-600">
          Go to sign in
        </Link>
      </div>
    );
  }

  return (
    <div className="relative flex min-h-screen flex-col overflow-hidden">
      <div className="absolute inset-0 warm-grid opacity-30" />
      <div className="absolute left-1/2 top-[-12rem] h-[28rem] w-[28rem] -translate-x-1/2 rounded-full bg-brand-200/40 blur-3xl" />

      <div className="relative z-10 flex flex-1 flex-col items-center justify-center px-5 py-10">
        <div className="w-full max-w-sm animate-fade-up">
          <div className="mb-8 flex flex-col items-center text-center">
            <div className="mb-4 animate-float">
              <BrandMark size="lg" />
            </div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-brand-600">
              Offline mode
            </p>
            <h1 className="mt-1 font-display text-3xl font-semibold tracking-tight text-ink">
              {t.auth.pinTitle}
            </h1>
            <p className="mt-1.5 max-w-xs text-sm text-muted">{t.auth.pinSubtitle}</p>
          </div>

          <div className="surface p-5 sm:p-6">
            <div className="mb-5 flex items-center gap-3 rounded-2xl bg-cream px-3 py-2.5">
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-white text-sm font-bold text-brand-600">
                {local.cachedProfile.name
                  .split(' ')
                  .slice(0, 2)
                  .map((part) => part[0])
                  .join('')
                  .toUpperCase()}
              </span>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-ink">
                  {local.cachedProfile.name}
                </p>
                <p className="truncate text-[11px] text-muted">{local.email}</p>
              </div>
              <Fingerprint size={18} className="ml-auto text-brand-500" />
            </div>

            <PinPad
              keyReset={resetKey}
              busy={busy}
              onComplete={(pin) => {
                void handlePin(pin);
              }}
            />

            {error && (
              <p
                className={cn(
                  'mt-4 text-center text-sm font-medium text-berry animate-fade-in'
                )}
              >
                {error}
              </p>
            )}
          </div>

          <div className="mt-5 flex flex-col items-center gap-3">
            <p className="flex items-center gap-1.5 text-[11px] text-muted">
              <ShieldCheck size={13} /> PIN is verified on this device only
            </p>
            {offline ? (
              <p className="text-center text-xs text-muted">
                Connect to the internet to use email &amp; password instead.
              </p>
            ) : (
              <Link
                href="/auth/login"
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-muted transition hover:text-ink"
              >
                <ArrowLeft size={13} />
                {t.auth.forgotPin}
              </Link>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
