'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useLiveQuery } from 'dexie-react-hooks';
import { ArrowLeft, Eye, EyeOff, Loader2 } from 'lucide-react';
import { BrandLockup } from '@/components/brand-mark';
import { Button } from '@/components/ui/button';
import { Input, Label } from '@/components/ui/input';
import { InstallPwaButton } from '@/components/install-pwa-button';
import { Splash } from '@/components/splash';
import { useBootstrap } from '@/lib/use-bootstrap';
import { useAuthStore } from '@/store/auth-store';
import { loginOnline, offlineLogin } from '@/lib/auth';
import { pullAll } from '@/lib/sync';
import { ApiError } from '@/lib/api';
import { db } from '@/lib/db';
import { t } from '@/lib/strings';
import { toast } from '@/components/ui/toast';

const schema = z.object({
  email: z.string().email('Enter a valid email address'),
  password: z.string().min(1, 'Enter your password')
});

type FormValues = z.infer<typeof schema>;

export default function LoginPage() {
  useBootstrap();
  const router = useRouter();
  const initialized = useAuthStore((state) => state.initialized);
  const user = useAuthStore((state) => state.user);
  const setSession = useAuthStore((state) => state.setSession);
  const [showPassword, setShowPassword] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [pendingRedirect, setPendingRedirect] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const businessRows = useLiveQuery(() => db.business.toArray(), []);
  const businessName = businessRows?.[0]?.name ?? 'your duka';

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting }
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { email: '', password: '' }
  });

  useEffect(() => {
    if (initialized && user && !isSubmitting && !pendingRedirect) {
      router.replace(user.role === 'owner' ? '/dashboard' : '/pos');
    }
  }, [initialized, user, router, isSubmitting, pendingRedirect]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    let changed = false;

    if (params.get('refreshed') === '1') {
      setNotice('Data refreshed. Please sign in.');
      params.delete('refreshed');
      changed = true;
    }

    if (params.get('deviceReleased') === '1') {
      setNotice('Device signed out. Sign in again with your password.');
      params.delete('deviceReleased');
      changed = true;
    }

    let authNotice: string | null = null;
    try {
      authNotice = window.sessionStorage.getItem('duka_auth_notice');
      if (authNotice) window.sessionStorage.removeItem('duka_auth_notice');
    } catch {
      authNotice = null;
    }

    if (authNotice === 'disabled' || params.get('disabled') === '1') {
      setServerError(
        'Your account has been deactivated by the owner. You can no longer use this account.'
      );
      changed = true;
    } else if (authNotice === 'expired' || params.get('session') === 'expired') {
      setNotice('Your session ended. Please sign in again.');
      changed = true;
    }

    if (params.has('disabled') || params.has('session')) {
      params.delete('disabled');
      params.delete('session');
      changed = true;
    }

    if (changed) {
      const query = params.toString();
      window.history.replaceState(
        {},
        '',
        `${window.location.pathname}${query ? `?${query}` : ''}`
      );
    }
  }, []);

  const finish = (role: 'owner' | 'employee') => {
    setPendingRedirect(true);
    router.replace(role === 'owner' ? '/dashboard' : '/pos');
  };

  const completeOffline = async (values: FormValues) => {
    const session = await offlineLogin(values.email, values.password);
    setSession({
      user: session.user,
      device: session.device,
      business: session.business,
      offline: true
    });
    if (session.user.mustChangePassword) {
      setPendingRedirect(true);
      router.replace('/auth/change-password');
      return;
    }
    toast.success(
      'Signed in offline',
      'Your changes will sync when the connection returns.'
    );
    finish(session.user.role);
  };

  const onSubmit = async (values: FormValues) => {
    setServerError(null);
    const browserOffline =
      typeof navigator !== 'undefined' && !navigator.onLine;

    try {
      if (browserOffline) {
        await completeOffline(values);
        return;
      }

      let session;
      try {
        session = await loginOnline(values.email, values.password);
      } catch (err) {
        if (err instanceof ApiError && err.code === 'OFFLINE') {
          // navigator.onLine can be true while the server is unreachable.
          await completeOffline(values);
          return;
        }
        throw err;
      }

      setSession({
        user: session.user,
        device: session.device,
        business: session.business,
        offline: false
      });
      if (session.user.mustChangePassword) {
        setPendingRedirect(true);
        router.replace('/auth/change-password');
        return;
      }
      void pullAll().catch(() => undefined);
      toast.success(`Welcome back, ${session.user.name.split(' ')[0]}`);
      finish(session.user.role);
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.code === 'OFFLINE') {
          setServerError(err.message || t.auth.firstLoginOnline);
        } else if (err.code === 'ACCOUNT_DISABLED' || err.code === 'DEVICE_REVOKED') {
          setServerError(err.message);
        } else {
          setServerError(err.message);
        }
      } else {
        setServerError(t.common.somethingWrong);
      }
    }
  };

  if (!initialized) return <Splash label="Checking this device…" />;

  return (
    <div className="min-h-screen bg-cream p-4 sm:p-6">
      <div className="mx-auto max-w-md">
        <Link
          href="/"
          className="mb-3 inline-flex items-center gap-1.5 text-sm font-medium text-muted transition hover:text-ink"
        >
          <ArrowLeft size={16} aria-hidden="true" />
          Back to home
        </Link>

        <div className="rounded-xl bg-white p-6 shadow-md">
          <div className="mb-6 flex justify-center">
            <BrandLockup name={businessName} />
          </div>

          <h1 className="font-display text-3xl font-semibold text-ink">Sign in</h1>
          <p className="mt-1 mb-6 text-sm text-muted">Sign in to {businessName}</p>

          {notice && (
            <div className="mb-4 rounded-xl border border-[#d9e6d4] bg-[#eef4ec] p-3 text-sm font-medium text-moss">
              {notice}
            </div>
          )}

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div>
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                placeholder="you@example.com"
                {...register('email')}
              />
              {errors.email && (
                <p className="mt-1 text-xs font-medium text-red-600">{errors.email.message}</p>
              )}
            </div>

            <div>
              <Label htmlFor="password">Password</Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  placeholder="••••••••"
                  {...register('password')}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((value) => !value)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted transition hover:text-ink"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
              {errors.password && (
                <p className="mt-1 text-xs font-medium text-red-600">{errors.password.message}</p>
              )}
            </div>

            {serverError && (
              <div className="rounded-xl border border-red-500 bg-red-50 p-3 text-sm font-medium text-red-600">
                {serverError}
              </div>
            )}

            <Button
              type="submit"
              disabled={isSubmitting}
              className="w-full rounded-lg bg-brand-500 px-4 py-2.5 font-semibold text-white hover:bg-brand-600"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="animate-spin" size={16} />
                  {t.auth.signingIn}
                </>
              ) : (
                t.auth.signIn
              )}
            </Button>
          </form>

          <InstallPwaButton variant="outline" className="mt-4 w-full" />
        </div>
      </div>
    </div>
  );
}
