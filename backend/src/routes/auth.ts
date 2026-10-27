import { Router } from 'express';
import { z } from 'zod';
import { db } from '../db';
import type { Request, Response } from 'express';
import { AppError, conflict, unauthorized } from '../lib/errors';
import { signAccessToken, signDeviceToken, signRefreshToken, verifyDeviceToken, verifyRefreshToken } from '../lib/jwt';
import { hashPassword, verifyPassword } from '../lib/password';
import { normalizePermissions } from '../lib/permissions';
import { asyncHandler as wrap } from '../lib/errors';
import { authRequired, loadUser, serializeDevice, serializeUser } from '../middleware/auth';
import { validateBody } from '../middleware/validate';
import { writeAudit } from '../lib/audit';
import { bindDevice, ensureDeviceForUser } from '../services/devices';
import { uuid } from '../lib/ids';
import { env } from '../env';
import { camelize } from '../lib/case';

export const authRouter = Router();

const REFRESH_COOKIE = 'duka_refresh';

const passwordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .max(128);

const setupSchema = z.object({
  businessName: z.string().min(2).max(120),
  name: z.string().min(2).max(120),
  email: z.string().email().max(200),
  password: passwordSchema,
  deviceId: z.string().uuid().optional(),
  deviceName: z.string().max(80).optional(),
  receiptPrefix: z
    .string()
    .regex(/^[A-Za-z0-9]{2,8}$/, 'Prefix must be 2-8 letters or numbers')
    .optional(),
  phone: z.string().max(20).optional(),
  tin: z.string().max(30).optional(),
  address: z.string().max(200).optional()
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
  deviceId: z.string().uuid().optional(),
  deviceName: z.string().max(80).optional()
});

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: passwordSchema
});

const registerDeviceSchema = z.object({
  deviceToken: z.string().min(10),
  deviceId: z.string().uuid(),
  deviceName: z.string().max(80).optional()
});

function setRefreshCookie(res: Response, token: string): void {
  res.cookie(REFRESH_COOKIE, token, {
    httpOnly: true,
    secure: env.COOKIE_SECURE,
    // Vercel frontend and Render API are different sites, so production needs
    // SameSite=None (which requires HTTPS). Localhost keeps Lax.
    sameSite: env.COOKIE_SECURE ? 'none' : 'lax',
    path: '/',
    maxAge: 30 * 24 * 60 * 60 * 1000
  });
}

function clearRefreshCookie(res: Response): void {
  res.clearCookie(REFRESH_COOKIE, {
    httpOnly: true,
    secure: env.COOKIE_SECURE,
    sameSite: env.COOKIE_SECURE ? 'none' : 'lax',
    path: '/'
  });
}

interface UserRow {
  id: string;
  email: string;
  name: string;
  role: 'owner' | 'employee';
  permissions: unknown;
  is_active: boolean;
  must_change_password: boolean;
  device_id: string | null;
  last_login_at: Date | null;
  created_at: Date;
  updated_at: Date;
  deleted_at: Date | null;
  password_hash: string;
}

async function getBusiness() {
  return db('business').orderBy('created_at', 'asc').first();
}

authRouter.post(
  '/setup',
  validateBody(setupSchema),
  wrap(async (req: Request, res: Response) => {
    const body = req.body as z.infer<typeof setupSchema>;
    const tempPasswordHash = await hashPassword(body.password);
    const deviceId = body.deviceId ?? uuid();

    const result = await db.transaction(async (trx) => {
      await trx.raw('SELECT pg_advisory_xact_lock(?)', [824914]);
      const countRow = (await trx('users').count<{ count: string }[]>('* as count'))[0];
      if (Number(countRow?.count ?? 0) > 0) {
        throw conflict('SETUP_COMPLETE', 'Duka has already been set up. Please sign in.');
      }

      const businessRows = (await trx('business')
        .insert({
          name: body.businessName,
          phone: body.phone ?? null,
          tin: body.tin ?? null,
          address: body.address ?? null
        })
        .returning('*')) as Record<string, unknown>[];

      const userRows = (await trx('users')
        .insert({
          email: body.email.toLowerCase(),
          password_hash: tempPasswordHash,
          name: body.name,
          role: 'owner',
          permissions: JSON.stringify(normalizePermissions('owner', {})),
          is_active: true,
          must_change_password: false
        })
        .returning('*')) as UserRow[];

      const owner = userRows[0] as UserRow;
      const device = await bindDevice(trx, {
        userId: owner.id,
        deviceId,
        deviceName: body.deviceName,
        desiredPrefix: body.receiptPrefix
      });

      await writeAudit(trx, {
        userId: owner.id,
        action: 'setup.owner_created',
        entity: 'users',
        entityId: owner.id,
        details: { email: owner.email, businessName: body.businessName }
      });

      return { business: businessRows[0], owner, device };
    });

    const user = await loadUser(result.owner.id);
    if (!user) throw new AppError(500, 'INTERNAL_ERROR', 'Could not create owner');
    const device = serializeDevice(result.device);
    const accessToken = signAccessToken({
      id: user.id,
      role: user.role,
      permissions: user.permissions,
      deviceId: device.id
    });
    const refreshToken = signRefreshToken({ id: user.id, deviceId: device.id });
    setRefreshCookie(res, refreshToken);

    res.status(201).json({
      accessToken,
      user,
      device,
      business: camelize(result.business),
      mustChangePassword: false
    });
  })
);

authRouter.post(
  '/login',
  validateBody(loginSchema),
  wrap(async (req: Request, res: Response) => {
    const body = req.body as z.infer<typeof loginSchema>;
    const row = (await db<UserRow>('users').where({ email: body.email.toLowerCase() }).first()) as
      | UserRow
      | undefined;

    if (!row || row.deleted_at) throw new AppError(401, 'INVALID_CREDENTIALS', 'Email or password is incorrect');
    if (!row.is_active) {
      throw new AppError(
        403,
        'ACCOUNT_DISABLED',
        'Your account has been deactivated. Contact the owner.'
      );
    }

    const ok = await verifyPassword(body.password, row.password_hash);
    if (!ok) throw new AppError(401, 'INVALID_CREDENTIALS', 'Email or password is incorrect');

    const device = await db.transaction(async (trx) => {
      const bound = body.deviceId
        ? await bindDevice(trx, {
            userId: row.id,
            deviceId: body.deviceId,
            deviceName: body.deviceName
          })
        : await ensureDeviceForUser(trx, row.id, body.deviceName);
      await trx('users').where({ id: row.id }).update({ last_login_at: trx.fn.now() });
      return bound;
    });

    const user = await loadUser(row.id);
    if (!user) throw unauthorized('Account not found');
    await writeAudit(db, {
      userId: user.id,
      action: 'user.login',
      entity: 'users',
      entityId: user.id,
      details: { deviceId: device.id }
    }).catch(() => undefined);
    const deviceDto = serializeDevice(device);
    const accessToken = signAccessToken({
      id: user.id,
      role: user.role,
      permissions: user.permissions,
      deviceId: device.id
    });
    const refreshToken = signRefreshToken({ id: user.id, deviceId: device.id });
    setRefreshCookie(res, refreshToken);

    res.json({
      accessToken,
      user,
      device: deviceDto,
      business: camelize(await getBusiness()),
      mustChangePassword: user.mustChangePassword,
      deviceToken: signDeviceToken(user.id, device.id)
    });
  })
);

authRouter.post(
  '/refresh',
  wrap(async (req: Request, res: Response) => {
    const token = (req.cookies as Record<string, string> | undefined)?.[REFRESH_COOKIE];
    if (!token) throw unauthorized('No refresh token');

    let claims;
    try {
      claims = verifyRefreshToken(token);
    } catch {
      clearRefreshCookie(res);
      throw unauthorized('Refresh token expired. Please sign in again.');
    }

    const user = await loadUser(claims.sub);
    if (!user) throw unauthorized('Account not found');
    if (!user.isActive) throw unauthorized('Account disabled');
    if (claims.deviceId && user.deviceId !== claims.deviceId) {
      clearRefreshCookie(res);
      throw unauthorized('This device has been released. Please sign in online again.');
    }

    const accessToken = signAccessToken({
      id: user.id,
      role: user.role,
      permissions: user.permissions,
      deviceId: user.deviceId
    });
    const refreshToken = signRefreshToken({ id: user.id, deviceId: user.deviceId });
    setRefreshCookie(res, refreshToken);

    res.json({ accessToken, user });
  })
);

authRouter.post(
  '/register-device',
  validateBody(registerDeviceSchema),
  wrap(async (req: Request, res: Response) => {
    const body = req.body as z.infer<typeof registerDeviceSchema>;
    let claims;
    try {
      claims = verifyDeviceToken(body.deviceToken);
    } catch {
      throw unauthorized('Device registration token is invalid or expired');
    }
    const user = await loadUser(claims.sub);
    if (!user) throw unauthorized('Account not found');

    const device = await db.transaction((trx) =>
      bindDevice(trx, {
        userId: claims.sub,
        deviceId: body.deviceId,
        deviceName: body.deviceName
      })
    );
    res.json({ device: serializeDevice(device) });
  })
);

authRouter.get(
  '/me',
  authRequired,
  wrap(async (req: Request, res: Response) => {
    res.json({
      user: req.auth?.user,
      device: req.auth?.device,
      business: camelize(await getBusiness())
    });
  })
);

authRouter.post(
  '/change-password',
  authRequired,
  validateBody(changePasswordSchema),
  wrap(async (req: Request, res: Response) => {
    const body = req.body as z.infer<typeof changePasswordSchema>;
    const user = req.auth?.user;
    if (!user) throw unauthorized();

    const row = (await db<UserRow>('users').where({ id: user.id }).first()) as UserRow;
    const ok = await verifyPassword(body.currentPassword, row.password_hash);
    if (!ok) throw new AppError(400, 'INVALID_PASSWORD', 'Current password is incorrect', 'currentPassword');

    const hash = await hashPassword(body.newPassword);
    await db.transaction(async (trx) => {
      await trx('users')
        .where({ id: user.id })
        .update({ password_hash: hash, must_change_password: false, updated_at: trx.fn.now() });
      await writeAudit(trx, {
        userId: user.id,
        action: 'user.password_changed',
        entity: 'users',
        entityId: user.id
      });
    });

    res.json({ ok: true });
  })
);

authRouter.post(
  '/logout',
  wrap(async (_req: Request, res: Response) => {
    clearRefreshCookie(res);
    res.status(204).end();
  })
);

export { REFRESH_COOKIE };
