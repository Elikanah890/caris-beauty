'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Loader2,
  LockKeyhole,
  Sparkles,
  Store
} from 'lucide-react';
import { BrandLockup } from '@/components/brand-mark';
import { Button } from '@/components/ui/button';
import { Input, Label } from '@/components/ui/input';
import { useBootstrap } from '@/lib/use-bootstrap';
import { useAuthStore } from '@/store/auth-store';
import { setupOnline } from '@/lib/auth';
import { ApiError } from '@/lib/api';
import { Splash } from '@/components/splash';
import { cn } from '@/lib/utils';

const schema = z
  .object({
    businessName: z.string().min(2, 'Enter your business name'),
    name: z.string().min(2, 'Enter your full name'),
    email: z.string().email('Enter a valid email address'),
    password: z.string().min(8, 'Use at least 8 characters'),
    confirmPassword: z.string(),
    receiptPrefix: z
      .string()
      .regex(/^[A-Za-z0-9]{2,8}$/, 'Use 2-8 letters or numbers')
  })
  .refine((values) => values.password === values.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword']
  });

type FormValues = z.infer<typeof schema>;

const STEPS = [
  { title: 'Your shop', hint: 'The name your customers know' },
  { title: 'Owner account', hint: 'Your email and password' },
  { title: 'Receipts & security', hint: 'How sales are numbered' }
];

export default function SetupPage() {
  useBootstrap();
  const router = useRouter();
  const initialized = useAuthStore((state) => state.initialized);
  const setSession = useAuthStore((state) => state.setSession);
  const [step, setStep] = useState(0);
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    trigger,
    watch,
    formState: { errors, isSubmitting }
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      businessName: '',
      name: '',
      email: '',
      password: '',
      confirmPassword: '',
      receiptPrefix: 'DUK'
    }
  });

  const businessName = watch('businessName');

  const next = async () => {
    const fields =
      step === 0
        ? (['businessName'] as const)
        : step === 1
          ? (['name', 'email'] as const)
          : (['password', 'confirmPassword', 'receiptPrefix'] as const);
    const ok = await trigger(fields);
    if (ok) setStep((value) => Math.min(value + 1, 2));
  };

  const onSubmit = async (values: FormValues) => {
    setServerError(null);
    try {
      const session = await setupOnline({
        businessName: values.businessName,
        name: values.name,
        email: values.email,
        password: values.password,
        receiptPrefix: values.receiptPrefix.toUpperCase()
      });
      setSession({
        user: session.user,
        device: session.device,
        business: session.business,
        offline: false
      });
      router.replace('/dashboard');
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.code === 'SETUP_COMPLETE') {
          setServerError('This shop is already set up. Sign in instead.');
        } else {
          setServerError(err.message);
        }
      } else {
        setServerError('Could not complete setup. Check your connection and try again.');
      }
    }
  };

  if (!initialized) return <Splash label="Preparing setup…" />;

  return (
    <div className="relative flex min-h-screen flex-col overflow-hidden">
      <div className="absolute inset-0 warm-grid opacity-40" />
      <div className="absolute -right-24 top-0 h-72 w-72 rounded-full bg-brand-200/40 blur-3xl" />
      <div className="relative z-10 mx-auto flex w-full max-w-5xl flex-1 flex-col px-5 py-6 sm:px-8">
        <div className="flex items-center justify-between">
          <BrandLockup />
          <Link href="/auth/login" className="text-xs font-semibold text-muted hover:text-ink">
            Already set up? Sign in
          </Link>
        </div>

        <div className="mt-10 grid flex-1 gap-8 lg:grid-cols-[.9fr_1.1fr] lg:items-center">
          <div className="animate-fade-up">
            <span className="inline-flex items-center gap-2 rounded-full bg-brand-50 px-3 py-1.5 text-[11px] font-semibold text-brand-700">
              <Sparkles size={13} /> First-run setup
            </span>
            <h1 className="mt-4 max-w-md font-display text-4xl font-semibold leading-[1.08] tracking-tight text-ink">
              Let's get your duka {businessName ? <span className="text-brand-600">{businessName}</span> : 'ready'}.
            </h1>
            <p className="mt-3 max-w-md text-sm leading-relaxed text-muted">
              Three short steps. Your data stays on this device and syncs when you connect.
              You can change every detail later in Settings.
            </p>

            <div className="mt-7 space-y-2">
              {STEPS.map((item, index) => (
                <div
                  key={item.title}
                  className={cn(
                    'flex items-center gap-3 rounded-2xl border px-3.5 py-3 transition',
                    index === step
                      ? 'border-brand-200 bg-white shadow-soft'
                      : 'border-transparent bg-transparent'
                  )}
                >
                  <span
                    className={cn(
                      'flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold',
                      index < step && 'bg-moss text-white',
                      index === step && 'bg-brand-500 text-white',
                      index > step && 'bg-white text-muted ring-1 ring-line'
                    )}
                  >
                    {index < step ? <Check size={14} /> : index + 1}
                  </span>
                  <div>
                    <p className="text-sm font-semibold text-ink">{item.title}</p>
                    <p className="text-[11px] text-muted">{item.hint}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="surface relative animate-fade-up delay-1 p-5 sm:p-7">
            <div className="mb-5 flex items-center justify-between">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-brand-600">
                  Step {step + 1} of 3
                </p>
                <h2 className="mt-0.5 font-display text-2xl font-semibold text-ink">
                  {STEPS[step]?.title}
                </h2>
              </div>
              <span className="rounded-2xl bg-cream p-2.5 text-brand-600">
                {step === 0 ? <Store size={20} /> : step === 1 ? <Sparkles size={20} /> : <LockKeyhole size={20} />}
              </span>
            </div>

            <div className="mb-5 flex gap-1.5">
              {[0, 1, 2].map((index) => (
                <span
                  key={index}
                  className={cn(
                    'h-1.5 flex-1 rounded-full transition-all duration-300',
                    index <= step ? 'bg-brand-500' : 'bg-line'
                  )}
                />
              ))}
            </div>

            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
              {step === 0 && (
                <div className="animate-fade-in space-y-4">
                  <div>
                    <Label htmlFor="businessName">Business name</Label>
                    <Input
                      id="businessName"
                      autoFocus
                      placeholder="e.g. Karera Grocery & Cosmetics"
                      {...register('businessName')}
                    />
                    {errors.businessName && (
                      <p className="mt-1 text-xs font-medium text-berry">{errors.businessName.message}</p>
                    )}
                  </div>
                  <div className="rounded-2xl bg-cream p-3.5 text-[11px] leading-relaxed text-muted">
                    This name appears on receipts. You will add TIN, VRN and your EFD device
                    later in Settings.
                  </div>
                </div>
              )}

              {step === 1 && (
                <div className="animate-fade-in space-y-4">
                  <div>
                    <Label htmlFor="name">Your full name</Label>
                    <Input id="name" autoFocus placeholder="e.g. Karera Mwita" {...register('name')} />
                    {errors.name && (
                      <p className="mt-1 text-xs font-medium text-berry">{errors.name.message}</p>
                    )}
                  </div>
                  <div>
                    <Label htmlFor="email">Email address</Label>
                    <Input id="email" type="email" placeholder="you@gmail.com" {...register('email')} />
                    {errors.email && (
                      <p className="mt-1 text-xs font-medium text-berry">{errors.email.message}</p>
                    )}
                    <p className="mt-1.5 text-[11px] text-muted">
                      Use a real email — it is the owner login for this shop.
                    </p>
                  </div>
                </div>
              )}

              {step === 2 && (
                <div className="animate-fade-in space-y-4">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div>
                      <Label htmlFor="password">Password</Label>
                      <Input
                        id="password"
                        type="password"
                        autoComplete="new-password"
                        placeholder="At least 8 characters"
                        {...register('password')}
                      />
                      {errors.password && (
                        <p className="mt-1 text-xs font-medium text-berry">{errors.password.message}</p>
                      )}
                    </div>
                    <div>
                      <Label htmlFor="confirmPassword">Confirm password</Label>
                      <Input
                        id="confirmPassword"
                        type="password"
                        autoComplete="new-password"
                        placeholder="Repeat password"
                        {...register('confirmPassword')}
                      />
                      {errors.confirmPassword && (
                        <p className="mt-1 text-xs font-medium text-berry">
                          {errors.confirmPassword.message}
                        </p>
                      )}
                    </div>
                  </div>
                  <div>
                    <Label htmlFor="receiptPrefix">Receipt prefix</Label>
                    <Input
                      id="receiptPrefix"
                      className="uppercase"
                      maxLength={8}
                      placeholder="KAR"
                      {...register('receiptPrefix')}
                    />
                    {errors.receiptPrefix && (
                      <p className="mt-1 text-xs font-medium text-berry">
                        {errors.receiptPrefix.message}
                      </p>
                    )}
                    <p className="mt-1.5 text-[11px] text-muted">
                      Receipts look like{' '}
                      <span className="font-semibold text-ink">
                        {(watch('receiptPrefix') || 'KAR').toUpperCase()}-000123
                      </span>
                      . Each device gets its own prefix.
                    </p>
                  </div>
                </div>
              )}

              {serverError && (
                <div className="rounded-xl border border-[#f0cdd5] bg-[#fbecef] px-3 py-2.5 text-xs font-medium text-berry animate-fade-in">
                  {serverError}{' '}
                  <Link href="/auth/login" className="font-semibold underline">
                    Sign in
                  </Link>
                </div>
              )}

              <div className="flex items-center justify-between gap-3 pt-1">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => (step === 0 ? router.push('/auth/login') : setStep(step - 1))}
                >
                  <ArrowLeft size={15} />
                  {step === 0 ? 'Back to sign in' : 'Back'}
                </Button>
                {step < 2 ? (
                  <Button type="button" onClick={() => void next()}>
                    Continue
                    <ArrowRight size={15} />
                  </Button>
                ) : (
                  <Button type="submit" disabled={isSubmitting}>
                    {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                    Create my duka
                  </Button>
                )}
              </div>
            </form>
          </div>
        </div>

        <p className="mt-8 text-center text-[10px] text-muted">
          Your password is hashed and stored securely.
        </p>
      </div>
    </div>
  );
}
