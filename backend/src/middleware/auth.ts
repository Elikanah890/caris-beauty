import type { NextFunction, Request, Response } from 'express';
import { db } from '../db';
import { AppError, unauthorized, forbidden } from '../lib/errors';
import { verifyAccessToken } from '../lib/jwt';
import { normalizePermissions, type PermissionFlag, type Permissions } from '../lib/permissions';
import type { AuthDevice, AuthUser } from '../lib/types';

interface UserRow {
  id: string;
  email: string;
  name: string;
  phone: string | null;
  role: 'owner' | 'employee';
  permissions: unknown;
  is_active: boolean;
  must_change_password: boolean;
  device_id: string | null;
  last_login_at: Date | null;
  created_at: Date;
  updated_at: Date;
  deleted_at: Date | null;
}

interface DeviceRow {
  id: string;
  receipt_prefix: string;
  name: string;
  user_id: string | null;
  last_receipt_seq: number;
  released_at: Date | null;
}

export function serializeUser(row: UserRow): AuthUser {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    phone: row.phone ?? null,
    role: row.role,
    permissions: normalizePermissions(row.role, row.permissions),
    isActive: row.is_active,
    mustChangePassword: row.must_change_password,
    deviceId: row.device_id,
    lastLoginAt: row.last_login_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

export function serializeDevice(row: DeviceRow): AuthDevice {
  return {
    id: row.id,
    receiptPrefix: row.receipt_prefix,
    name: row.name,
    userId: row.user_id,
    lastReceiptSeq: row.last_receipt_seq
  };
}

export async function loadUser(userId: string): Promise<AuthUser | null> {
  const row = (await db<UserRow>('users').where({ id: userId }).first()) as UserRow | undefined;
  if (!row || row.deleted_at) return null;
  return serializeUser(row);
}

export async function authRequired(
  req: Request,
  _res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) throw unauthorized();
    const token = header.slice(7);

    let claims;
    try {
      claims = verifyAccessToken(token);
    } catch {
      throw unauthorized('Session expired');
    }

    const row = (await db<UserRow>('users').where({ id: claims.sub }).first()) as
      | UserRow
      | undefined;
    if (!row || row.deleted_at) throw unauthorized('Account not found');
    if (!row.is_active) {
      throw new AppError(
        403,
        'ACCOUNT_DISABLED',
        'Your account has been deactivated. Contact the owner.'
      );
    }

    if (claims.deviceId) {
      const currentDevice = (await db<DeviceRow>('devices')
        .where({ id: claims.deviceId })
        .first()) as DeviceRow | undefined;
      if (!currentDevice) {
        throw new AppError(
          401,
          'DEVICE_REVOKED',
          'This device is no longer registered. Please sign in again.'
        );
      }
      if (currentDevice.released_at) {
        throw new AppError(
          401,
          'DEVICE_REVOKED',
          'This device was signed out. Please sign in again.'
        );
      }
      if (currentDevice.user_id !== row.id) {
        throw new AppError(
          401,
          'DEVICE_REVOKED',
          'This device is now used by another account. Please sign in again.'
        );
      }
    }

    const user = serializeUser(row);
    const deviceRow = claims.deviceId
      ? ((await db<DeviceRow>('devices').where({ id: claims.deviceId }).first()) as
          | DeviceRow
          | undefined)
      : user.deviceId
        ? ((await db<DeviceRow>('devices').where({ id: user.deviceId }).first()) as
            | DeviceRow
            | undefined)
        : undefined;

    req.auth = { user, device: deviceRow ? serializeDevice(deviceRow) : null };
    next();
  } catch (err) {
    next(err);
  }
}

export function requireOwner(req: Request, _res: Response, next: NextFunction): void {
  if (!req.auth) return next(unauthorized());
  if (req.auth.user.role !== 'owner') return next(forbidden('Owner access only'));
  next();
}

export function requirePermission(flag: PermissionFlag) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.auth) return next(unauthorized());
    const { user } = req.auth;
    const permissions: Permissions = user.permissions;
    if (user.role === 'owner' || permissions[flag]) return next();
    next(forbidden(`You need the "${flag}" permission for this action`));
  };
}

export function requireAnyPermission(...flags: PermissionFlag[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.auth) return next(unauthorized());
    const { user } = req.auth;
    if (user.role === 'owner') return next();
    const permissions: Permissions = user.permissions;
    if (flags.some((flag) => permissions[flag])) return next();
    next(forbidden(`You need one of these permissions: ${flags.join(', ')}`));
  };
}
