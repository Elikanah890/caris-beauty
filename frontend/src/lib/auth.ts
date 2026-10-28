import { db, clearLocalAuth, getMeta, setMeta } from './db';
import { apiRequest, refreshSession, getLastRefreshFailure, ApiError } from './api';
import { setAccessToken, clearAccessToken } from './token';
import { uuid } from './utils';
import type {
  AuthSession,
  Business,
  Device,
  OfflineCredential,
  Permissions,
  User
} from './types';
import { normalizePermissions } from './permissions';

const DEVICE_ID_KEY = 'duka_device_id';

const OFFLINE_SESSION_MS = 8 * 60 * 60 * 1000;
const OFFLINE_CACHE_MS = 30 * 24 * 60 * 60 * 1000;
const PBKDF2_ITERATIONS = 120_000;

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

async function derivePasswordHash(password: string, salt: Uint8Array): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveBits']
  );
  const bits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: salt as unknown as BufferSource,
      iterations: PBKDF2_ITERATIONS,
      hash: 'SHA-256'
    },
    key,
    256
  );
  return toBase64(new Uint8Array(bits));
}

function timingSafeEqual(a: string, b: string): boolean {
  const aBytes = new TextEncoder().encode(a);
  const bBytes = new TextEncoder().encode(b);
  if (aBytes.length !== bBytes.length) return false;
  let diff = 0;
  for (let i = 0; i < aBytes.length; i += 1) {
    diff |= (aBytes[i] as number) ^ (bBytes[i] as number);
  }
  return diff === 0;
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
}

/**
 * Cache a PBKDF2 verifier for offline password login. The plaintext password
 * is never stored; only a salted hash and an 8-hour offline session marker.
 */
export async function cacheOfflineCredential(
  user: User,
  password: string,
  deviceId: string | null
): Promise<void> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const passwordHash = await derivePasswordHash(password, salt);
  const now = new Date();
  const record: OfflineCredential = {
    email: user.email.toLowerCase(),
    passwordHash,
    passwordSalt: toBase64(salt),
    deviceId,
    cachedPermissions: normalizePermissions(user.role, user.permissions),
    cachedProfile: {
      ...user,
      permissions: normalizePermissions(user.role, user.permissions)
    },
    lastVerifiedAt: now.toISOString(),
    offlineExpiresAt: new Date(now.getTime() + OFFLINE_SESSION_MS).toISOString(),
    updatedAt: now.toISOString()
  };
  await db.offline_credentials.put(record);
  await setMeta('activeEmail', record.email);
}

export async function getOfflineCredential(
  email?: string | null
): Promise<OfflineCredential | null> {
  if (email) {
    const key = email.trim().toLowerCase();
    const direct = await db.offline_credentials.get(key);
    if (direct) return direct;
    return (
      (await db.offline_credentials
        .filter((row) => row.email.toLowerCase() === key)
        .first()) ?? null
    );
  }
  const active = await getMeta('activeEmail');
  if (active) {
    const row = await db.offline_credentials.get(active.toLowerCase());
    if (row) return row;
  }
  return (await db.offline_credentials.toCollection().first()) ?? null;
}

function isCacheFresh(credential: OfflineCredential): boolean {
  const last = new Date(credential.lastVerifiedAt).getTime();
  return Number.isFinite(last) && Date.now() - last <= OFFLINE_CACHE_MS;
}

function isOfflineSessionValid(credential: OfflineCredential): boolean {
  if (!credential.offlineExpiresAt || !isCacheFresh(credential)) return false;
  return new Date(credential.offlineExpiresAt).getTime() > Date.now();
}

async function offlineSessionFromCredential(credential: OfflineCredential): Promise<{
  user: User;
  device: Device | null;
  business: Business | null;
}> {
  const user: User = {
    ...credential.cachedProfile,
    email: credential.email,
    permissions: credential.cachedPermissions
  };
  const device = credential.deviceId
    ? ((await db.devices.get(credential.deviceId)) ?? null)
    : null;
  const businessRows = await db.business.toArray();
  return {
    user,
    device,
    business: businessRows[0] ?? null
  };
}

/** Validate email + password locally against the cached PBKDF2 verifier. */
export async function offlineLogin(
  email: string,
  password: string
): Promise<{ user: User; device: Device | null; business: Business | null }> {
  const credential = await getOfflineCredential(email);
  if (!credential) {
    throw new ApiError(
      0,
      'OFFLINE',
      'Please connect to the internet for your first login.'
    );
  }
  if (!isCacheFresh(credential)) {
    throw new ApiError(
      0,
      'OFFLINE',
      'Your offline login has expired. Connect to the internet and sign in again.'
    );
  }

  const hash = await derivePasswordHash(
    password.trim(),
    fromBase64(credential.passwordSalt)
  );
  if (!timingSafeEqual(hash, credential.passwordHash)) {
    throw new ApiError(401, 'INVALID_CREDENTIALS', 'Invalid email or password.');
  }

  const now = new Date();
  const updated: OfflineCredential = {
    ...credential,
    offlineExpiresAt: new Date(now.getTime() + OFFLINE_SESSION_MS).toISOString(),
    updatedAt: now.toISOString()
  };
  await db.offline_credentials.put(updated);
  await setMeta('activeEmail', updated.email);
  return offlineSessionFromCredential(updated);
}

export async function hasOfflineCredential(email?: string | null): Promise<boolean> {
  return Boolean(await getOfflineCredential(email));
}

/** After an online session restore, extend the offline session/cache metadata. */
async function touchOfflineSession(user: User, deviceId: string | null): Promise<void> {
  const credential = await db.offline_credentials.get(user.email.toLowerCase());
  if (!credential) return;
  const now = new Date();
  await db.offline_credentials.put({
    ...credential,
    deviceId: deviceId ?? credential.deviceId,
    cachedPermissions: normalizePermissions(user.role, user.permissions),
    cachedProfile: {
      ...user,
      permissions: normalizePermissions(user.role, user.permissions)
    },
    lastVerifiedAt: now.toISOString(),
    offlineExpiresAt: new Date(now.getTime() + OFFLINE_SESSION_MS).toISOString(),
    updatedAt: now.toISOString()
  });
  await setMeta('activeEmail', user.email.toLowerCase());
}

export interface LoginResult extends AuthSession {
  mustChangePassword: boolean;
}

export async function loginOnline(email: string, password: string): Promise<LoginResult> {
  const cleanPassword = password.trim();
  const session = await apiRequest<LoginResult>('/auth/login', {
    method: 'POST',
    auth: false,
    body: {
      email: email.trim(),
      // Generated temp passwords never contain spaces; trimming avoids copy/paste
      // failures when a leading/trailing space is picked up.
      password: cleanPassword,
      deviceId: getDeviceId(),
      deviceName: guessDeviceName()
    }
  });
  setAccessToken(session.accessToken);
  await persistSession(session);
  try {
    await cacheOfflineCredential(
      session.user,
      cleanPassword,
      session.device?.id ?? getDeviceId()
    );
  } catch {
    // Offline login is best-effort; the online session still works.
  }
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
  try {
    await cacheOfflineCredential(
      session.user,
      input.password,
      session.device?.id ?? getDeviceId()
    );
  } catch {
    // Offline login is best-effort; setup still succeeds online.
  }
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
          await touchOfflineSession(user, me.device?.id ?? null);
          return {
            session: {
              accessToken: refreshed.accessToken,
              user,
              device: me.device,
              business: me.business
            },
            hasLocalAuth: (await db.offline_credentials.count()) > 0
          };
        }
      }
      const failure = getLastRefreshFailure();
      if (failure?.code === 'ACCOUNT_DISABLED' || failure?.code === 'DEVICE_REVOKED') {
        await clearLocalAuth();
        return { session: null, hasLocalAuth: false };
      }
      if (failure?.code !== 'OFFLINE') {
        // Server is reachable but the refresh token is invalid/expired.
        // Show login; keep the offline credential for offline password login.
        return {
          session: null,
          hasLocalAuth: (await db.offline_credentials.count()) > 0
        };
      }
    } catch {
      // Network/server unreachable; fall back to a cached offline session.
    }
  }

  const credential = await getOfflineCredential();
  if (credential && isOfflineSessionValid(credential)) {
    const offline = await offlineSessionFromCredential(credential);
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

  return {
    session: null,
    hasLocalAuth: (await db.offline_credentials.count()) > 0
  };
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

export function permissionsOf(user: User): Permissions {
  return normalizePermissions(user.role, user.permissions);
}

export async function refreshLocalProfile(userId: string): Promise<User | null> {
  const user = await db.users.get(userId);
  if (!user) return null;
  return { ...user, permissions: normalizePermissions(user.role, user.permissions) };
}
