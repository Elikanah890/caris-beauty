import jwt, { type SignOptions } from 'jsonwebtoken';
import { env } from '../env';
import type { PermissionFlag, Permissions } from './permissions';

export interface AccessClaims {
  sub: string;
  role: 'owner' | 'employee';
  permissions: Permissions;
  deviceId: string | null;
  typ: 'access';
}

export interface RefreshClaims {
  sub: string;
  deviceId: string | null;
  typ: 'refresh';
}

export interface DeviceClaims {
  sub: string;
  deviceId: string;
  typ: 'device';
}

const accessTtl = env.ACCESS_TOKEN_TTL as SignOptions['expiresIn'];
const refreshTtl = env.REFRESH_TOKEN_TTL as SignOptions['expiresIn'];

export function signAccessToken(user: {
  id: string;
  role: 'owner' | 'employee';
  permissions: Permissions;
  deviceId: string | null;
}): string {
  const claims: AccessClaims = {
    sub: user.id,
    role: user.role,
    permissions: user.permissions,
    deviceId: user.deviceId,
    typ: 'access'
  };
  return jwt.sign(claims, env.JWT_ACCESS_SECRET, { expiresIn: accessTtl });
}

export function signRefreshToken(user: {
  id: string;
  deviceId: string | null;
}): string {
  const claims: RefreshClaims = {
    sub: user.id,
    deviceId: user.deviceId,
    typ: 'refresh'
  };
  return jwt.sign(claims, env.JWT_REFRESH_SECRET, { expiresIn: refreshTtl });
}

export function signDeviceToken(userId: string, deviceId: string): string {
  return jwt.sign({ sub: userId, deviceId, typ: 'device' } satisfies DeviceClaims, env.JWT_ACCESS_SECRET, {
    expiresIn: '30m'
  });
}

export function verifyAccessToken(token: string): AccessClaims {
  const decoded = jwt.verify(token, env.JWT_ACCESS_SECRET);
  if (typeof decoded === 'string' || decoded.typ !== 'access') {
    throw new Error('Invalid access token');
  }
  return decoded as unknown as AccessClaims;
}

export function verifyRefreshToken(token: string): RefreshClaims {
  const decoded = jwt.verify(token, env.JWT_REFRESH_SECRET);
  if (typeof decoded === 'string' || decoded.typ !== 'refresh') {
    throw new Error('Invalid refresh token');
  }
  return decoded as unknown as RefreshClaims;
}

export function verifyDeviceToken(token: string): DeviceClaims {
  const decoded = jwt.verify(token, env.JWT_ACCESS_SECRET);
  if (typeof decoded === 'string' || decoded.typ !== 'device') {
    throw new Error('Invalid device token');
  }
  return decoded as unknown as DeviceClaims;
}

export type { PermissionFlag };
