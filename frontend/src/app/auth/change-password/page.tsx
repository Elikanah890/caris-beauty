'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { KeyRound, Loader2, LockKeyhole, WifiOff } from 'lucide-react';
import { BrandLockup } from '@/components/brand-mark';
import { Button } from '@/components/ui/button';
import { Input, Label } from '@/components/ui/input';
import { Splash } from '@/components/splash';
import { useBootstrap } from '@/lib/use-bootstrap';
import { useAuthStore } from '@/store/auth-store';
import { changePasswordOnline, hasPinForUser, logoutOnline } from '@/lib/auth';
import { ApiError } from '@/lib/api';
import { clearLocalAuth } from '@/lib/db';
import { clearAccessToken } from '@/lib/token';
import { toast } from '@/components/ui/toast';

const schema = z
  .object({
    currentPassword: z.string().min(1, 'Enter your current password'),
    newPassword: z.string().min(8, 'Use at least 8 characters'),
    confirmPassword: z.string()
  })
  .refine((values) => values.newPassword === values.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword']
  });

type FormValues = z.infer<typeof schema>;

export default function ChangePasswordPage() {
  useBootstrap();
  const router = useRouter();
  const initialized = useAuthStore((state) => state.initialized);
  const user = useAuthStore((state) => state.user);
  const setUser = useAuthStore((state) => state.setUser);
  const setHasLocalAuth = useAuthStore((state) => state.setHasLocalAuth);
  const reset = useAuthStore((state) => state.reset);
    const [serverError, setServerError] = useState<string | null>(null);
  const [offline, setOffline] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting }
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { currentPassword: '', newPassword: '', confirmPassword: '' }
  });

  useEffect(() => {
    setOffline(!navigator.onLine);
    const on = () => setOffline(false);
    const off = () => setOffline(true);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);

  useEffect(() => {
    if (initialized && !user) router.replace('/auth/login');
  }, [initialized, user, router]);

  const onSubmit = async (values: FormValues) => {
    if (!user || offline) return;
    setServerError(null);
    try {
      await changePasswordOnline(values.currentPassword, values.newPassword);
      setUser({ ...user, mustChangePassword: false });
      toast.success('Password updated');
      const pinExists = await hasPinForUser(user.email);
      setHasLocalAuth(false);
      router.replace(user.role === 'owner' ? '/dashboard' : '/pos');
    } catch (err) {
      setServerError(err instanceof ApiError ? err.message : 'Could not change password');
    }
  };

  const signOut = async () => {
    await logoutOnline();
    await clearLocalAuth();
    clearAccessToken();
    reset();
    router.replace('/auth/login');
  };

  if (!initialized || !user) return <Splash label="Checking your account…" />;

  return (
    <div className="relative flex min-h-screen flex-col overflow-hidden">
      <div className="absolute inset-0 warm-grid opacity-30" />
      <div className="relative z-10 mx-auto flex w-full max-w-lg flex-1 flex-col justify-center px-5 py-10">
        <div className="mb-7 flex items-center justify-between">
          <BrandLockup />
          <button
            type="button"
            onClick={signOut}
            className="text-xs font-semibold text-muted hover:text-ink"
          >
            Sign out
          </button>
        </div>

        <div className="surface animate-fade-up p-5 sm:p-7">
          <span className="inline-flex items-center gap-2 rounded-full bg-brand-50 px-3 py-1.5 text-[11px] font-semibold text-brand-700">
            <KeyRound size={13} /> First sign-in
          </span>
          <h1 className="mt-4 font-display text-2xl font-semibold tracking-tight text-ink">
            Choose a new password
          </h1>
          <p className="mt-1.5 text-sm text-muted">
            Hi {user.name.split(' ')[0]}, replace the temporary password before you start.
          </p>

          {offline && (
            <div className="mt-4 flex items-start gap-2.5 rounded-xl border border-[#f2dfb5] bg-[#fdf3dd] px-3 py-2.5 text-xs text-[#8b681f]">
              <WifiOff size={15} className="mt-0.5 shrink-0" />
              Password changes need internet. Connect to continue.
            </div>
          )}

          <form onSubmit={handleSubmit(onSubmit)} className="mt-5 space-y-4">
            <div>
              <Label htmlFor="currentPassword">Temporary / current password</Label>
              <Input
                id="currentPassword"
                type="password"
                autoComplete="current-password"
                {...register('currentPassword')}
              />
              {errors.currentPassword && (
                <p className="mt-1 text-xs font-medium text-berry">{errors.currentPassword.message}</p>
              )}
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label htmlFor="newPassword">New password</Label>
                <Input
                  id="newPassword"
                  type="password"
                  autoComplete="new-password"
                  {...register('newPassword')}
                />
                {errors.newPassword && (
                  <p className="mt-1 text-xs font-medium text-berry">{errors.newPassword.message}</p>
                )}
              </div>
              <div>
                <Label htmlFor="confirmPassword">Confirm</Label>
                <Input
                  id="confirmPassword"
                  type="password"
                  autoComplete="new-password"
                  {...register('confirmPassword')}
                />
                {errors.confirmPassword && (
                  <p className="mt-1 text-xs font-medium text-berry">
                    {errors.confirmPassword.message}
                  </p>
                )}
              </div>
            </div>

            {serverError && (
              <div className="rounded-xl border border-[#f0cdd5] bg-[#fbecef] px-3 py-2.5 text-xs font-medium text-berry">
                {serverError}
              </div>
            )}

            <Button type="submit" size="lg" className="w-full" disabled={isSubmitting || offline}>
              {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <LockKeyhole size={16} />}
              Update password
            </Button>
          </form>
        </div>
      </div>

    </div>
  );
}
