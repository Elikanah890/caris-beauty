'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  Fingerprint,
  KeyRound,
  LogOut,
  MonitorSmartphone,
  ShieldCheck,
  Smartphone,
  UserRound
} from 'lucide-react';
import { PageHeader } from '@/components/ui/misc';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PinSetupDialog } from '@/components/pin-setup-dialog';
import { useAuthStore } from '@/store/auth-store';
import { useSyncStore } from '@/store/sync-store';
import { db, clearLocalAuth } from '@/lib/db';
import { logoutOnline } from '@/lib/auth';
import { clearAccessToken } from '@/lib/token';
import { can, PERMISSION_LABELS } from '@/lib/permissions';
import { PERMISSION_FLAGS } from '@/lib/types';
import { formatDateTime, relativeTime } from '@/lib/format';
import { t } from '@/lib/strings';
import { toast } from '@/components/ui/toast';
import { cn } from '@/lib/utils';

export default function ProfilePage() {
  const router = useRouter();
  const user = useAuthStore((state) => state.user);
  const device = useAuthStore((state) => state.device);
  const business = useAuthStore((state) => state.business);
  const reset = useAuthStore((state) => state.reset);
  const { pending, online, lastSyncedAt } = useSyncStore();
  const [pinOpen, setPinOpen] = useState(false);
  const localAuth = useLiveQuery(
    () => (user ? db.localAuth.get(user.email) : Promise.resolve(undefined)),
    [user?.email]
  );

  if (!user) return null;

  const logout = async () => {
    await logoutOnline();
    await clearLocalAuth();
    clearAccessToken();
    reset();
    toast.info('Signed out', 'Your sales queue is safe on this device.');
    router.replace('/auth/login');
  };

  const granted = PERMISSION_FLAGS.filter((flag) => can(user, flag));

  return (
    <div>
      <PageHeader eyebrow="Account" title={t.profile.title} subtitle={t.profile.subtitle} />

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardContent className="p-5">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
              <span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-400 to-brand-600 font-display text-xl font-semibold text-white">
                {user.name
                  .split(' ')
                  .slice(0, 2)
                  .map((part) => part[0])
                  .join('')
                  .toUpperCase()}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="font-display text-2xl font-semibold text-ink">{user.name}</h2>
                  <Badge variant={user.role === 'owner' ? 'ink' : 'brand'} className="capitalize">
                    {user.role}
                  </Badge>
                </div>
                <p className="text-xs text-muted">{user.email}</p>
                <p className="mt-1 text-[11px] text-muted">
                  {business?.name ?? 'Duka'} · Member since {relativeTime(user.createdAt)}
                </p>
              </div>
              <Button variant="outline" size="sm" onClick={() => setPinOpen(true)}>
                <Fingerprint size={14} /> {localAuth ? 'Change PIN' : 'Set PIN'}
              </Button>
            </div>

            <div className="mt-5 grid gap-2 sm:grid-cols-3">
              <div className="rounded-2xl bg-cream px-3 py-2.5">
                <p className="text-[9px] uppercase tracking-wide text-muted">Role</p>
                <p className="mt-0.5 text-xs font-semibold capitalize text-ink">{user.role}</p>
              </div>
              <div className="rounded-2xl bg-cream px-3 py-2.5">
                <p className="text-[9px] uppercase tracking-wide text-muted">Receipt prefix</p>
                <p className="mt-0.5 font-mono text-xs font-semibold text-ink">
                  {device?.receiptPrefix ?? '—'}
                </p>
              </div>
              <div className="rounded-2xl bg-cream px-3 py-2.5">
                <p className="text-[9px] uppercase tracking-wide text-muted">Last login</p>
                <p className="mt-0.5 text-xs font-semibold text-ink">
                  {formatDateTime(user.lastLoginAt)}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Device</CardTitle>
            <Badge variant={online ? 'success' : 'warning'}>{online ? 'Online' : 'Offline'}</Badge>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-3">
              <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-brand-50 text-brand-600">
                <Smartphone size={19} />
              </span>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-ink">
                  {device?.name ?? 'No registered device'}
                </p>
                <p className="truncate font-mono text-[10px] text-muted">
                  {device?.id ?? '—'}
                </p>
              </div>
            </div>
            <div className="mt-4 space-y-2 text-[11px]">
              <div className="flex justify-between">
                <span className="text-muted">PIN on this device</span>
                <span className="font-semibold text-ink">{localAuth ? 'Set' : 'Not set'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted">Pending sync</span>
                <span className="font-semibold text-ink">{pending}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted">Last sync</span>
                <span className="font-semibold text-ink">{relativeTime(lastSyncedAt)}</span>
              </div>
            </div>
            <p className="mt-3 rounded-xl bg-cream px-3 py-2 text-[10px] leading-relaxed text-muted">
              One account is locked to one device. Ask the owner to release it from Staff if you
              change phones.
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Permissions</CardTitle>
            <Badge variant="default">
              {user.role === 'owner' ? 'Full access' : `${granted.length}/8`}
            </Badge>
          </CardHeader>
          <CardContent>
            {user.role === 'owner' ? (
              <div className="flex items-start gap-3 rounded-2xl bg-[#eef4ec] p-3 text-moss">
                <ShieldCheck size={18} className="mt-0.5" />
                <div>
                  <p className="text-xs font-semibold">Owner account</p>
                  <p className="text-[10px] leading-relaxed">
                    Owners can do everything. These permissions cannot be toggled off.
                  </p>
                </div>
              </div>
            ) : (
              <div className="grid gap-1.5 sm:grid-cols-2">
                {PERMISSION_FLAGS.map((flag) => {
                  const enabled = can(user, flag);
                  return (
                    <div
                      key={flag}
                      className={cn(
                        'flex items-center gap-2 rounded-xl border px-2.5 py-2',
                        enabled ? 'border-[#d9e6d4] bg-[#eef4ec]' : 'border-line bg-cream/50 opacity-60'
                      )}
                    >
                      <span
                        className={cn(
                          'h-1.5 w-1.5 rounded-full',
                          enabled ? 'bg-moss' : 'bg-muted/40'
                        )}
                      />
                      <span className="text-[10px] font-medium text-ink">
                        {PERMISSION_LABELS[flag].label}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Security</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <button
              type="button"
              onClick={() => router.push('/auth/change-password')}
              className="flex w-full items-center gap-3 rounded-xl border border-line px-3 py-2.5 text-left transition hover:border-brand-200 hover:bg-brand-50/30"
            >
              <span className="rounded-lg bg-cream p-1.5 text-muted">
                <KeyRound size={15} />
              </span>
              <span className="flex-1">
                <span className="block text-xs font-semibold text-ink">{t.profile.changePassword}</span>
                <span className="block text-[10px] text-muted">{t.profile.passwordHint}</span>
              </span>
              <Badge variant="default">Online</Badge>
            </button>
            <button
              type="button"
              onClick={() => setPinOpen(true)}
              className="flex w-full items-center gap-3 rounded-xl border border-line px-3 py-2.5 text-left transition hover:border-brand-200 hover:bg-brand-50/30"
            >
              <span className="rounded-lg bg-cream p-1.5 text-muted">
                <Fingerprint size={15} />
              </span>
              <span className="flex-1">
                <span className="block text-xs font-semibold text-ink">
                  {localAuth ? t.profile.resetPin : 'Set offline PIN'}
                </span>
                <span className="block text-[10px] text-muted">Works with airplane mode on</span>
              </span>
              <Badge variant="success">Offline</Badge>
            </button>
            <Button variant="ghost" className="w-full justify-start text-berry" onClick={() => void logout()}>
              <LogOut size={15} /> {t.auth.logout}
            </Button>
          </CardContent>
        </Card>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3 rounded-2xl border border-dashed border-line px-4 py-3 text-[10px] text-muted">
        <span className="inline-flex items-center gap-1.5">
          <UserRound size={12} /> Account {user.id.slice(0, 8)}…
        </span>
        <span className="inline-flex items-center gap-1.5">
          <MonitorSmartphone size={12} /> Device {device?.receiptPrefix ?? '—'}
        </span>
      </div>

      <PinSetupDialog open={pinOpen} onDone={() => setPinOpen(false)} />
    </div>
  );
}
