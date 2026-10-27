import { db, getMeta, setMeta } from './db';
import { apiRequest, refreshSession } from './api';
import { setAccessToken, clearAccessToken } from './token';
import { uuid } from './utils';
import type {
  AuthSession,
  Business,
  Device,
  LocalAuth,
  Permissions,
  User
} from './types';
import { normalizePermissions } from './permissions';

const DEVICE_ID_KEY = 'duka_device_id';

export function getDeviceId(): string {
  if (typeof window === 'undefined') return uuid();
  let id = window.localStorage.getItem(DEVICE_ID_KEY);
  if (!id) {
    id = uuid();
    window.localStorage.setItem(DEVICE_ID_KEY, id);
  }
  return id;
}

export function guessDeviceName(): string {
  if (typeof navigator === 'undefined') return 'Duka Device';
  const ua = navigator.userAgent;
  if (/android/i.test(ua)) return 'Android device';
  if (/iphone|ipad/i.test(ua)) return 'iPhone / iPad';
  if (/mac/i.test(ua)) return 'Mac';
  if (/windows/i.test(ua)) return 'Windows PC';
  return 'Duka Device';
}

const UNLOCK_KEY = 'duka_unlocked_email';

export function setOfflineUnlocked(email: string): void {
  if (typeof window === 'undefined') return;
  window.sessionStorage.setItem(UNLOCK_KEY, email);
}

export function getOfflineUnlocked(): string | null {
  if (typeof window === 'undefined') return null;
  return window.sessionStorage.getItem(UNLOCK_KEY);
}

export function clearOfflineUnlocked(): void {
  if (typeof window === 'undefined') return;
  window.sessionStorage.removeItem(UNLOCK_KEY);
}

export async function persistSession(session: {
  user: User;
  device: Device | null;
  business: Business | null;
}): Promise<void> {
  const user: User = {
    ...session.user,
    permissions: normalizePermissions(session.user.role, session.user.permissions)
  };
  await db.transaction('rw', db.users, db.devices, db.business, db.app_meta, async () => {
    await db.users.put(user);
    if (session.device) await db.devices.put(session.device);
    if (session.business) await db.business.put(session.business);
    await db.app_meta.put({ key: 'activeEmail', value: user.email });
    if (session.device) await db.app_meta.put({ key: 'deviceId', value: session.device.id });
  });
  setOfflineUnlocked(user.email);
}

export interface LoginResult extends AuthSession {
  mustChangePassword: boolean;
}

export async function loginOnline(email: string, password: string): Promise<LoginResult> {
  const session = await apiRequest<LoginResult>('/auth/login', {
    method: 'POST',
    auth: false,
    body: {
      email: email.trim(),
      // Generated temp passwords never contain spaces; trimming avoids copy/paste
      // failures when a leading/trailing space is picked up.
      password: password.trim(),
      deviceId: getDeviceId(),
      deviceName: guessDeviceName()
    }
  });
  setAccessToken(session.accessToken);
  await persistSession(session);
  return session;
}

export async function setupOnline(input: {
  businessName: string;
  name: string;
  email: string;
  password: string;
  receiptPrefix: string;
}): Promise<LoginResult> {
  const session = await apiRequest<LoginResult>('/auth/setup', {
    method: 'POST',
    auth: false,
    body: {
      ...input,
      email: input.email.trim(),
      deviceId: getDeviceId(),
      deviceName: guessDeviceName()
    }
  });
  setAccessToken(session.accessToken);
  await persistSession(session);
  return session;
}

export async function fetchMe(): Promise<{
  user: User;
  device: Device | null;
  business: Business | null;
}> {
  return apiRequest('/auth/me');
}

export async function bootstrapAuth(): Promise<{
  session: AuthSession | null;
  hasLocalAuth: boolean;
}> {
  const localBefore = await getLocalAuth();
  const online = typeof navigator === 'undefined' || navigator.onLine;
  if (online) {
    try {
      const refreshed = await refreshSession();
      if (refreshed) {
        const me = await fetchMe();
        if (me.user) {
          const user = {
            ...me.user,
            permissions: normalizePermissions(me.user.role, me.user.permissions)
          };
          await persistSession({ user, device: me.device, business: me.business });
          return {
            session: {
              accessToken: refreshed.accessToken,
              user,
              device: me.device,
              business: me.business
            },
            hasLocalAuth: (await db.localAuth.count()) > 0
          };
        }
      }
    } catch {
      // fall through to PIN
    }
  }

  const local = localBefore ?? (await getLocalAuth());
  const unlocked = getOfflineUnlocked();
  if (local && unlocked && unlocked.toLowerCase() === local.email.toLowerCase()) {
    const offline = await offlineSession(local);
    return {
      session: {
        accessToken: '',
        user: offline.user,
        device: offline.device,
        business: offline.business
      },
      hasLocalAuth: true
    };
  }

  return { session: null, hasLocalAuth: (await db.localAuth.count()) > 0 };
}

export async function logoutOnline(): Promise<void> {
  try {
    await apiRequest('/auth/logout', { method: 'POST', auth: false, retry: false });
  } catch {
    // offline logout is fine
  }
  clearAccessToken();
}

export async function changePasswordOnline(
  currentPassword: string,
  newPassword: string
): Promise<void> {
  await apiRequest('/auth/change-password', {
    method: 'POST',
    body: { currentPassword, newPassword }
  });
}

function toBase64(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function fromBase64(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function derivePin(pin: string, salt: Uint8Array): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(pin),
    'PBKDF2',
    false,
    ['deriveBits']
  );
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: salt as unknown as BufferSource, iterations: 120_000, hash: 'SHA-256' },
    key,
    256
  );
  return toBase64(new Uint8Array(bits));
}

export async function savePin(
  user: User,
  deviceId: string,
  pin: string
): Promise<void> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const pinHash = await derivePin(pin, salt);
  const record: LocalAuth = {
    email: user.email,
    pinHash,
    pinSalt: toBase64(salt),
    deviceId,
    cachedPermissions: normalizePermissions(user.role, user.permissions),
    cachedProfile: user,
    updatedAt: new Date().toISOString()
  };
  await db.localAuth.put(record);
  await setMeta('activeEmail', user.email);
  setOfflineUnlocked(user.email);
}

export async function getLocalAuth(): Promise<LocalAuth | null> {
  const activeEmail = await getMeta('activeEmail');
  if (activeEmail) {
    const row = await db.localAuth.get(activeEmail);
    if (row) return row;
  }
  return db.localAuth.toCollection().first().then((row) => row ?? null);
}

export async function unlockWithPin(pin: string): Promise<LocalAuth | null> {
  const local = await getLocalAuth();
  if (!local) return null;
  const hash = await derivePin(pin, fromBase64(local.pinSalt));
  if (hash !== local.pinHash) return null;
  return local;
}

export async function hasPinForUser(email: string): Promise<boolean> {
  return Boolean(await db.localAuth.get(email));
}

export function permissionsOf(user: User): Permissions {
  return normalizePermissions(user.role, user.permissions);
}

export async function offlineSession(local: LocalAuth): Promise<{
  user: User;
  device: Device | null;
  business: Business | null;
}> {
  const user: User = {
    ...local.cachedProfile,
    permissions: local.cachedPermissions
  };
  const device = await db.devices.get(local.deviceId);
  const businessRows = await db.business.toArray();
  return {
    user,
    device: device ?? null,
    business: businessRows[0] ?? null
  };
}

export async function refreshLocalProfile(userId: string): Promise<User | null> {
  const user = await db.users.get(userId);
  if (!user) return null;
  return { ...user, permissions: normalizePermissions(user.role, user.permissions) };
}
