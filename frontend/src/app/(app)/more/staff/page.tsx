'use client';

import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  CheckCircle2,
  ClipboardList,
  Copy,
  KeyRound,
  Loader2,
  Lock,
  MessageCircle,
  MonitorSmartphone,
  Phone,
  Plus,
  ShieldAlert,
  ShieldCheck,
  Smartphone,
  Trash2,
  UserRoundCheck,
  WifiOff
} from 'lucide-react';
import { PageHeader } from '@/components/ui/misc';
import { Button } from '@/components/ui/button';
import { Input, Label } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog } from '@/components/ui/dialog';
import { PermissionGate } from '@/components/permission-gate';
import { toast } from '@/components/ui/toast';
import { db } from '@/lib/db';
import { apiRequest } from '@/lib/api';
import { useAuthStore } from '@/store/auth-store';
import { normalizePermissions, PERMISSION_LABELS, defaultEmployeePermissions } from '@/lib/permissions';
import { PERMISSION_FLAGS, type Permissions, type User } from '@/lib/types';
import { formatDateTime, relativeTime } from '@/lib/format';
import { t } from '@/lib/strings';
import { normalizeWhatsAppPhone, isValidTanzanianPhone } from '@/lib/phone';
import { cn } from '@/lib/utils';

const createSchema = z.object({
  name: z.string().min(2, 'Enter the employee name'),
  email: z.string().email('Enter a valid email address'),
  phone: z
    .string()
    .optional()
    .refine(
      (value) => !value || isValidTanzanianPhone(value),
      'Use 07xx xxx xxx or +2557xx xxx xxx'
    )
});

type CreateForm = z.infer<typeof createSchema>;

interface AuditRow {
  id: string;
  action: string;
  createdAt: string;
  entity: string;
  details: Record<string, unknown>;
}

interface CredentialModal {
  title: string;
  name: string;
  email: string;
  phone: string | null;
  password: string;
  loginUrl: string;
}

function initials(name: string): string {
  return name
    .split(' ')
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
}

function PermissionToggles({
  value,
  onChange,
  disabled
}: {
  value: Permissions;
  onChange: (value: Permissions) => void;
  disabled?: boolean;
}) {
  return (
    <div className="grid gap-1.5 sm:grid-cols-2">
      {PERMISSION_FLAGS.map((flag) => {
        const meta = PERMISSION_LABELS[flag];
        const enabled = value[flag];
        return (
          <button
            key={flag}
            type="button"
            disabled={disabled}
            onClick={() => onChange({ ...value, [flag]: !enabled })}
            className={cn(
              'flex items-start gap-2.5 rounded-xl border p-2.5 text-left transition',
              enabled
                ? 'border-brand-300 bg-brand-50/70'
                : 'border-line bg-white hover:border-brand-200',
              disabled && 'opacity-60'
            )}
          >
            <span
              className={cn(
                'mt-0.5 flex h-5 w-9 shrink-0 items-center rounded-full p-0.5 transition',
                enabled ? 'bg-brand-500' : 'bg-line'
              )}
            >
              <span
                className={cn(
                  'h-4 w-4 rounded-full bg-white shadow-sm transition',
                  enabled && 'translate-x-4'
                )}
              />
            </span>
            <span>
              <span className="block text-[11px] font-semibold text-ink">{meta.label}</span>
              <span className="block text-[10px] leading-tight text-muted">{meta.hint}</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}

function StaffContent() {
  const currentUser = useAuthStore((state) => state.user);
  const business = useAuthStore((state) => state.business);
  const users = useLiveQuery(() => db.users.toArray(), []);
  const [addOpen, setAddOpen] = useState(false);
  const [permissionsUser, setPermissionsUser] = useState<User | null>(null);
  const [permissions, setPermissions] = useState<Permissions>(defaultEmployeePermissions());
  const [auditUser, setAuditUser] = useState<User | null>(null);
  const [auditRows, setAuditRows] = useState<AuditRow[] | null>(null);
  const [auditLoading, setAuditLoading] = useState(false);
  const [credentials, setCredentials] = useState<CredentialModal | null>(null);
  const [phoneUser, setPhoneUser] = useState<User | null>(null);
  const [phoneValue, setPhoneValue] = useState('');
  const [phoneError, setPhoneError] = useState<string | null>(null);
  const [savingPhone, setSavingPhone] = useState(false);
  const [deleteUser, setDeleteUser] = useState<User | null>(null);
  const [deletingUser, setDeletingUser] = useState(false);
  const [releaseUser, setReleaseUser] = useState<User | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [createPermissions, setCreatePermissions] = useState<Permissions>(defaultEmployeePermissions());
  const online = typeof navigator === 'undefined' ? true : navigator.onLine;

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting }
  } = useForm<CreateForm>({ resolver: zodResolver(createSchema) });

  useEffect(() => {
    if (!online) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await apiRequest<{ users: User[] }>('/users');
        if (cancelled) return;
        const serverUsers = res.users.map((user) => ({
          ...user,
          permissions: normalizePermissions(user.role, user.permissions)
        }));
        await db.transaction('rw', db.users, async () => {
          const serverIds = new Set(serverUsers.map((user) => user.id));
          const localUsers = await db.users.toArray();
          const staleIds = localUsers
            .filter((user) => !serverIds.has(user.id))
            .map((user) => user.id);
          if (staleIds.length) await db.users.bulkDelete(staleIds);
          if (serverUsers.length) await db.users.bulkPut(serverUsers);
        });
      } catch {
        // Offline-first: keep the local list when the server cannot be reached.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [online]);

  const createEmployee = async (values: CreateForm) => {
    if (!online) {
      toast.error('Staff changes need internet');
      return;
    }
    try {
      const res = await apiRequest<{
        user: User;
        tempPassword: string;
        credentials?: { email: string; phone?: string | null; tempPassword: string; loginUrl: string };
      }>('/users', {
        method: 'POST',
        body: {
          name: values.name,
          email: values.email.trim(),
          phone: values.phone?.trim() || null,
          permissions: createPermissions
        }
      });
      const user = {
        ...res.user,
        permissions: normalizePermissions('employee', res.user.permissions)
      };
      await db.users.put(user);
      setCredentials({
        title: 'Employee created',
        name: user.name,
        email: res.credentials?.email ?? user.email,
        phone: res.credentials?.phone ?? user.phone ?? null,
        password: res.credentials?.tempPassword ?? res.tempPassword,
        loginUrl: res.credentials?.loginUrl ?? `${window.location.origin}/login`
      });
      toast.success(t.staff.created, `${user.name} can now sign in online.`);
      reset();
      setCreatePermissions(defaultEmployeePermissions());
      setAddOpen(false);
    } catch (err) {
      toast.error('Could not create employee', err instanceof Error ? err.message : undefined);
    }
  };

  const savePermissions = async () => {
    if (!permissionsUser) return;
    if (!online) {
      toast.error('Permission changes need internet');
      return;
    }
    setBusy('permissions');
    try {
      const res = await apiRequest<{ user: User }>(`/users/${permissionsUser.id}`, {
        method: 'PATCH',
        body: { permissions }
      });
      const user = {
        ...res.user,
        permissions: normalizePermissions('employee', res.user.permissions)
      };
      await db.users.put(user);
      toast.success(t.staff.permissionSaved, permissionsUser.name);
      setPermissionsUser(null);
    } catch (err) {
      toast.error('Could not update permissions', err instanceof Error ? err.message : undefined);
    } finally {
      setBusy(null);
    }
  };

  const toggleActive = async (user: User) => {
    if (!online) {
      toast.error('Staff changes need internet');
      return;
    }
    setBusy(user.id);
    try {
      const res = await apiRequest<{ user: User }>(`/users/${user.id}`, {
        method: 'PATCH',
        body: { isActive: !user.isActive }
      });
      await db.users.put({
        ...res.user,
        permissions: normalizePermissions('employee', res.user.permissions)
      });
      toast.success(res.user.isActive ? t.staff.reactivated : t.staff.deactivated);
    } catch (err) {
      toast.error('Could not update employee', err instanceof Error ? err.message : undefined);
    } finally {
      setBusy(null);
    }
  };

  const resetPassword = async (user: User) => {
    if (!online) {
      toast.error('Password resets need internet');
      return;
    }
    setBusy(`reset-${user.id}`);
    try {
      const res = await apiRequest<{
        tempPassword: string;
        credentials?: { email: string; phone?: string | null; tempPassword: string; loginUrl: string };
      }>(`/users/${user.id}/reset-password`, {
        method: 'POST'
      });
      setCredentials({
        title: 'Password reset',
        name: user.name,
        email: res.credentials?.email ?? user.email,
        phone: res.credentials?.phone ?? user.phone ?? null,
        password: res.credentials?.tempPassword ?? res.tempPassword,
        loginUrl: res.credentials?.loginUrl ?? `${window.location.origin}/login`
      });
    } catch (err) {
      toast.error('Could not reset password', err instanceof Error ? err.message : undefined);
    } finally {
      setBusy(null);
    }
  };

  const releaseDevice = async () => {
    if (!releaseUser) return;
    if (!online) {
      toast.error('Device release needs internet');
      return;
    }
    setBusy(`release-${releaseUser.id}`);
    try {
      const res = await apiRequest<{ user: User }>(`/users/${releaseUser.id}/release-device`, {
        method: 'POST'
      });
      await db.users.put({
        ...res.user,
        permissions: normalizePermissions('employee', res.user.permissions)
      });
      if (res.user.deviceId) {
        const device = await db.devices.get(res.user.deviceId);
        if (device) await db.devices.put({ ...device, userId: null });
      }
      toast.success('Device released', `${releaseUser.name} can sign in on a new device.`);
      setReleaseUser(null);
    } catch (err) {
      toast.error('Could not release device', err instanceof Error ? err.message : undefined);
    } finally {
      setBusy(null);
    }
  };

  const loadAudit = async (user: User) => {
    setAuditUser(user);
    setAuditRows(null);
    setAuditLoading(true);
    if (!online) {
      setAuditLoading(false);
      toast.error('Audit needs internet');
      return;
    }
    try {
      const res = await apiRequest<{ audit: AuditRow[] }>(`/users/${user.id}/audit`);
      setAuditRows(res.audit);
    } catch (err) {
      toast.error('Could not load audit', err instanceof Error ? err.message : undefined);
    } finally {
      setAuditLoading(false);
    }
  };

  const credentialsText = (credential: CredentialModal) =>
    `Login to ${business?.name ?? 'Caris Beauty POS'}\n\nURL:      ${credential.loginUrl}\nEmail:    ${credential.email}\nPassword: ${credential.password}\n\nYou must change your password on first login.`;

  const copyText = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(label);
    } catch {
      toast.error('Could not copy');
    }
  };

  const copyCredentials = () => {
    if (credentials) void copyText(credentialsText(credentials), 'Credentials copied');
  };

  const shareWhatsApp = () => {
    if (!credentials) return;
    const phone = normalizeWhatsAppPhone(credentials.phone);
    const text = encodeURIComponent(credentialsText(credentials));
    const url = phone
      ? `https://wa.me/${phone}?text=${text}`
      : `https://wa.me/?text=${text}`;
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  const openPhoneDialog = (user: User) => {
    setPhoneUser(user);
    setPhoneValue(user.phone ?? '');
    setPhoneError(null);
  };

  const savePhone = async () => {
    if (!phoneUser) return;
    const value = phoneValue.trim();
    if (value && !isValidTanzanianPhone(value)) {
      setPhoneError('Use 07xx xxx xxx or +2557xx xxx xxx');
      return;
    }
    if (!online) {
      setPhoneError('Saving a WhatsApp number needs internet');
      return;
    }
    setSavingPhone(true);
    setPhoneError(null);
    try {
      const res = await apiRequest<{ user: User }>(`/users/${phoneUser.id}`, {
        method: 'PATCH',
        body: { phone: value || null }
      });
      await db.users.put({
        ...res.user,
        permissions: normalizePermissions('employee', res.user.permissions)
      });
      toast.success('WhatsApp number saved', value || 'Removed');
      setPhoneUser(null);
    } catch (err) {
      setPhoneError(err instanceof Error ? err.message : 'Could not save the number');
    } finally {
      setSavingPhone(false);
    }
  };

  const deleteEmployee = async () => {
    if (!deleteUser) return;
    if (!online) {
      toast.error('Deleting employees needs internet');
      return;
    }
    setDeletingUser(true);
    try {
      await apiRequest(`/users/${deleteUser.id}`, { method: 'DELETE' });
      await db.users.delete(deleteUser.id);
      toast.success(
        'Employee deleted',
        `${deleteUser.name} can no longer sign in. Sales history is kept.`
      );
      setDeleteUser(null);
    } catch (err) {
      toast.error('Could not delete employee', err instanceof Error ? err.message : undefined);
    } finally {
      setDeletingUser(false);
    }
  };

  const sorted = [...(users ?? [])]
    .filter((user) => !user.deletedAt)
    .sort((a, b) =>
      a.role === 'owner' ? -1 : b.role === 'owner' ? 1 : a.name.localeCompare(b.name)
    );

  return (
    <div>
      <PageHeader
        eyebrow={t.staff.title}
        title={t.staff.title}
        subtitle={t.staff.subtitle}
        actions={
          <Button
            onClick={() => {
              if (!online) {
                toast.error('Staff changes need internet');
                return;
              }
              setAddOpen(true);
            }}
          >
            <Plus size={15} /> {t.staff.add}
          </Button>
        }
      />

      {!online && (
        <div className="mb-4 flex items-center gap-2 rounded-xl border border-[#f2dfb5] bg-[#fdf3dd] px-3 py-2.5 text-xs text-[#8b681f]">
          <WifiOff size={15} />
          Staff, permissions, password resets and device release require internet.
        </div>
      )}

      <div className="space-y-3">
        {!users ? (
          [0, 1, 2].map((index) => <div key={index} className="h-24 animate-pulse rounded-2xl bg-white/60" />)
        ) : (
          sorted.map((user) => {
            const isOwner = user.role === 'owner';
            const isSelf = user.id === currentUser?.id;
            return (
              <Card key={user.id} className="animate-fade-up">
                <CardContent className="p-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                    <div className="flex min-w-0 flex-1 items-center gap-3">
                      <span
                        className={cn(
                          'flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl text-xs font-bold',
                          isOwner ? 'bg-ink text-white' : 'bg-brand-50 text-brand-700'
                        )}
                      >
                        {initials(user.name)}
                      </span>
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="truncate text-sm font-semibold text-ink">{user.name}</p>
                          {isOwner ? (
                            <Badge variant="ink">
                              <ShieldCheck size={10} /> {t.staff.owner}
                            </Badge>
                          ) : (
                            <Badge variant="brand">{t.staff.employee}</Badge>
                          )}
                          {!user.isActive && <Badge variant="danger">Inactive</Badge>}
                          {isSelf && <Badge variant="default">You</Badge>}
                        </div>
                        <p className="truncate text-[11px] text-muted">{user.email}</p>
                        {user.phone && (
                          <p className="truncate text-[11px] text-muted">{user.phone}</p>
                        )}
                        <div className="mt-1 flex flex-wrap items-center gap-2 text-[10px] text-muted">
                          <span className="inline-flex items-center gap-1">
                            {user.deviceId ? <Smartphone size={11} /> : <MonitorSmartphone size={11} />}
                            {user.deviceId
                              ? user.device?.name ?? 'Registered device'
                              : t.staff.noDevice}
                          </span>
                          {user.device?.receiptPrefix && (
                            <span className="rounded bg-cream px-1.5 py-0.5 font-mono">
                              {user.device.receiptPrefix}
                            </span>
                          )}
                          <span>Last login {relativeTime(user.lastLoginAt)}</span>
                        </div>
                      </div>
                    </div>

                    {!isOwner && (
                      <div className="flex flex-wrap items-center gap-1.5">
                        <Button variant="ghost" size="sm" onClick={() => openPhoneDialog(user)}>
                          <Phone size={13} /> {user.phone ? 'WhatsApp' : 'Add WhatsApp'}
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setPermissionsUser(user);
                            setPermissions(normalizePermissions('employee', user.permissions));
                          }}
                        >
                          <ShieldCheck size={13} /> Permissions
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={busy === `reset-${user.id}`}
                          onClick={() => void resetPassword(user)}
                        >
                          <KeyRound size={13} /> Reset
                        </Button>
                        {user.deviceId && (
                          <Button variant="ghost" size="sm" onClick={() => setReleaseUser(user)}>
                            <MonitorSmartphone size={13} /> Release
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={busy === user.id}
                          onClick={() => void toggleActive(user)}
                        >
                          {user.isActive ? <Lock size={13} /> : <UserRoundCheck size={13} />}
                          {user.isActive ? 'Disable' : 'Enable'}
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-berry hover:bg-[#fbecef] hover:text-berry"
                          onClick={() => setDeleteUser(user)}
                        >
                          <Trash2 size={13} /> Delete
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => void loadAudit(user)}>
                          <ClipboardList size={14} />
                        </Button>
                      </div>
                    )}
                    {isOwner && (
                      <Button variant="ghost" size="sm" onClick={() => void loadAudit(user)}>
                        <ClipboardList size={14} /> Audit
                      </Button>
                    )}
                  </div>

                  {!isOwner && (
                    <div className="mt-3 flex flex-wrap gap-1">
                      {PERMISSION_FLAGS.filter((flag) => user.permissions?.[flag]).map((flag) => (
                        <span
                          key={flag}
                          className="rounded-full bg-cream px-2 py-0.5 text-[9px] font-medium text-muted"
                        >
                          {PERMISSION_LABELS[flag].label}
                        </span>
                      ))}
                      {PERMISSION_FLAGS.every((flag) => !user.permissions?.[flag]) && (
                        <span className="text-[9px] text-muted">No permissions granted</span>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })
        )}
      </div>

      <Dialog
        open={addOpen}
        onOpenChange={setAddOpen}
        title={t.staff.add}
        description="The employee signs in online once, changes their password, then sets a device PIN."
        size="lg"
      >
        <form onSubmit={handleSubmit(createEmployee)} className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="employee-name">{t.staff.name}</Label>
              <Input id="employee-name" autoFocus {...register('name')} />
              {errors.name && <p className="mt-1 text-xs text-berry">{errors.name.message}</p>}
            </div>
            <div>
              <Label htmlFor="employee-email">{t.staff.email}</Label>
              <Input id="employee-email" type="email" {...register('email')} />
              {errors.email && <p className="mt-1 text-xs text-berry">{errors.email.message}</p>}
            </div>
          </div>
          <div>
            <Label htmlFor="employee-phone">WhatsApp number (optional)</Label>
            <Input
              id="employee-phone"
              type="tel"
              inputMode="tel"
              placeholder="+2557xx xxx xxx"
              {...register('phone')}
            />
            {errors.phone && <p className="mt-1 text-xs text-berry">{errors.phone.message}</p>}
            <p className="mt-1 text-[10px] text-muted">
              Used to open WhatsApp directly to this employee when sharing login details.
            </p>
          </div>
          <div>
            <Label>{t.staff.permissions}</Label>
            <PermissionToggles value={createPermissions} onChange={setCreatePermissions} />
          </div>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button type="button" variant="outline" onClick={() => setAddOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus size={15} />}
              Create employee
            </Button>
          </div>
        </form>
      </Dialog>

      <Dialog
        open={Boolean(permissionsUser)}
        onOpenChange={(open) => !open && setPermissionsUser(null)}
        title={`Permissions · ${permissionsUser?.name ?? ''}`}
        description="The backend enforces every permission. Hiding a tab is not security."
        size="lg"
        footer={
          <>
            <Button variant="outline" onClick={() => setPermissionsUser(null)}>
              Cancel
            </Button>
            <Button onClick={() => void savePermissions()} disabled={busy === 'permissions'}>
              {busy === 'permissions' ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Save permissions
            </Button>
          </>
        }
      >
        <PermissionToggles value={permissions} onChange={setPermissions} />
      </Dialog>

      <Dialog
        open={Boolean(deleteUser)}
        onOpenChange={(open) => {
          if (!open && !deletingUser) setDeleteUser(null);
        }}
        title="Delete employee?"
        description={
          deleteUser
            ? `Permanently remove ${deleteUser.name} (${deleteUser.email}) from this shop?`
            : undefined
        }
        size="sm"
        footer={
          <>
            <Button
              variant="outline"
              onClick={() => setDeleteUser(null)}
              disabled={deletingUser}
            >
              Cancel
            </Button>
            <Button
              variant="danger"
              onClick={() => void deleteEmployee()}
              disabled={deletingUser}
            >
              {deletingUser ? <Loader2 size={15} className="animate-spin" /> : <Trash2 size={15} />}
              Delete employee
            </Button>
          </>
        }
      >
        <div className="flex items-start gap-3 rounded-2xl border border-[#f0cdd5] bg-[#fbecef] p-3 text-berry">
          <ShieldAlert size={18} className="mt-0.5 shrink-0" />
          <p className="text-xs leading-relaxed">
            This account will be removed permanently. They will be signed out and can no
            longer use their login. Sales history and audit records are kept.
          </p>
        </div>
      </Dialog>

      <Dialog
        open={Boolean(phoneUser)}
        onOpenChange={(open) => {
          if (!open && !savingPhone) setPhoneUser(null);
        }}
        title={`WhatsApp · ${phoneUser?.name ?? ''}`}
        description="Used for sharing login details directly with this employee."
        size="sm"
        footer={
          <>
            <Button variant="outline" onClick={() => setPhoneUser(null)} disabled={savingPhone}>
              Cancel
            </Button>
            <Button onClick={() => void savePhone()} disabled={savingPhone}>
              {savingPhone ? <Loader2 size={15} className="animate-spin" /> : null}
              Save
            </Button>
          </>
        }
      >
        <div>
          <Label htmlFor="employee-whatsapp">WhatsApp number</Label>
          <Input
            id="employee-whatsapp"
            type="tel"
            inputMode="tel"
            placeholder="+2557xx xxx xxx"
            value={phoneValue}
            onChange={(event) => {
              setPhoneValue(event.target.value);
              setPhoneError(null);
            }}
          />
          {phoneError && <p className="mt-1 text-xs text-berry">{phoneError}</p>}
          <p className="mt-1 text-[10px] text-muted">Leave empty to remove the number.</p>
        </div>
      </Dialog>

      <Dialog
        open={Boolean(credentials)}
        onOpenChange={(open) => !open && setCredentials(null)}
        title={credentials?.title ?? 'Credentials'}
        description="Share these once. The password is never stored in plain text."
        size="md"
      >
        <div className="rounded-2xl border border-dashed border-brand-300 bg-brand-50 p-4">
          <div className="flex items-center gap-2 text-brand-700">
            <CheckCircle2 size={17} />
            <p className="text-sm font-semibold">{credentials?.title}</p>
          </div>
          <div className="mt-3 space-y-2">
            {[
              { label: 'Name', value: credentials?.name ?? '' },
              { label: 'Email', value: credentials?.email ?? '' },
              ...(credentials?.phone
                ? [{ label: 'WhatsApp', value: credentials.phone }]
                : []),
              { label: 'Password', value: credentials?.password ?? '', mono: true },
              { label: 'Login URL', value: credentials?.loginUrl ?? '' }
            ].map((row) => (
              <div
                key={row.label}
                className="flex items-center gap-2 rounded-xl bg-white/80 px-3 py-2"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-[9px] font-semibold uppercase tracking-wide text-muted">
                    {row.label}
                  </p>
                  <p
                    className={cn(
                      'truncate text-xs font-semibold text-ink',
                      row.mono && 'select-all font-mono text-sm'
                    )}
                  >
                    {row.value}
                  </p>
                </div>
                {row.label !== 'Name' && (
                  <button
                    type="button"
                    onClick={() => void copyText(row.value, `${row.label} copied`)}
                    className="rounded-md p-1.5 text-muted transition hover:bg-cream hover:text-ink"
                    aria-label={`Copy ${row.label}`}
                  >
                    <Copy size={13} />
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
        <div className="mt-3 rounded-xl border border-[#f2dfb5] bg-[#fdf3dd] px-3 py-2 text-[11px] leading-relaxed text-[#8b681f]">
          This password is shown only once. Share it now. The employee must change it on
          first login.
        </div>
        <div className="mt-4 grid gap-2 sm:grid-cols-3">
          <Button variant="outline" onClick={copyCredentials}>
            <Copy size={14} /> Copy all
          </Button>
          <Button variant="outline" onClick={shareWhatsApp}>
            <MessageCircle size={14} /> WhatsApp
          </Button>
          <Button onClick={() => setCredentials(null)}>Done</Button>
        </div>
      </Dialog>

      <Dialog
        open={Boolean(releaseUser)}
        onOpenChange={(open) => !open && setReleaseUser(null)}
        title={t.staff.release}
        description={t.staff.releaseConfirm}
        size="sm"
        footer={
          <>
            <Button variant="outline" onClick={() => setReleaseUser(null)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              disabled={busy === `release-${releaseUser?.id}`}
              onClick={() => void releaseDevice()}
            >
              <Trash2 size={14} /> Release device
            </Button>
          </>
        }
      >
        <div className="rounded-xl bg-cream px-3 py-2 text-xs text-muted">
          <p className="font-semibold text-ink">{releaseUser?.name}</p>
          <p>{releaseUser?.email}</p>
          <p className="mt-1">They will need internet once to register the new device.</p>
        </div>
      </Dialog>

      <Dialog
        open={Boolean(auditUser)}
        onOpenChange={(open) => {
          if (!open) {
            setAuditUser(null);
            setAuditRows(null);
          }
        }}
        title={`Audit · ${auditUser?.name ?? ''}`}
        description="Recent sensitive actions for this account."
        size="lg"
      >
        {auditLoading ? (
          <div className="space-y-2">
            {[0, 1, 2, 3].map((index) => (
              <div key={index} className="h-12 animate-pulse rounded-xl bg-cream" />
            ))}
          </div>
        ) : !auditRows || auditRows.length === 0 ? (
          <p className="rounded-xl bg-cream px-3 py-6 text-center text-xs text-muted">
            No audit entries yet.
          </p>
        ) : (
          <div className="max-h-[55vh] space-y-1 overflow-y-auto">
            {auditRows.map((row) => (
              <div key={row.id} className="rounded-xl border border-line px-3 py-2">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[11px] font-semibold text-ink">{row.action}</p>
                  <span className="text-[9px] text-muted">{formatDateTime(row.createdAt)}</span>
                </div>
                <p className="text-[10px] text-muted">
                  {row.entity} · {JSON.stringify(row.details)}
                </p>
              </div>
            ))}
          </div>
        )}
      </Dialog>
    </div>
  );
}

export default function StaffPage() {
  return (
    <PermissionGate ownerOnly>
      <StaffContent />
    </PermissionGate>
  );
}
