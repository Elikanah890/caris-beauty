import { Router } from 'express';
import { z } from 'zod';
import { db } from '../db';
import type { Request, Response } from 'express';
import { asyncHandler, badRequest, forbidden, notFound } from '../lib/errors';
import { camelize } from '../lib/case';
import { writeAudit } from '../lib/audit';
import { generateTempPassword, hashPassword } from '../lib/password';
import { normalizePermissions, PERMISSION_FLAGS } from '../lib/permissions';
import { normalizedPhone } from '../lib/ids';
import { releaseDevice } from '../services/devices';
import { authRequired, requireOwner, serializeUser } from '../middleware/auth';
import { validateBody } from '../middleware/validate';
import { env } from '../env';
import { expandOrigins } from '../lib/origins';

export const usersRouter = Router();

function loginUrl(): string {
  const origins = expandOrigins(env.CORS_ORIGIN).filter(Boolean);
  const origin =
    origins.find((entry) => entry.includes('localhost')) ?? origins[0] ?? 'http://localhost:3000';
  return `${origin.replace(/\/$/, '')}/login`;
}

const permissionsSchema = z
  .object(
    Object.fromEntries(PERMISSION_FLAGS.map((flag) => [flag, z.boolean().optional()])) as Record<
      string,
      z.ZodOptional<z.ZodBoolean>
    >
  )
  .strict();

const createSchema = z.object({
  name: z.string().min(2).max(120),
  email: z.string().email().max(200),
  phone: z.string().max(20).nullable().optional(),
  permissions: permissionsSchema.optional()
});

const updateSchema = z.object({
  name: z.string().min(2).max(120).optional(),
  phone: z.string().max(20).nullable().optional(),
  permissions: permissionsSchema.optional(),
  isActive: z.boolean().optional()
});

function normalizeOptionalPhone(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const normalized = normalizedPhone(phone);
  if (!normalized) {
    throw badRequest('Phone must look like +255712345678 or 0712345678', 'phone');
  }
  return normalized;
}

async function userWithDevice(id: string) {
  const row = (await db('users as u')
    .leftJoin('devices as d', 'd.id', 'u.device_id')
    .where('u.id', id)
    .select(
      'u.*',
      'd.receipt_prefix',
      'd.name as device_name',
      db.raw('d.id as bound_device_id')
    )
    .first()) as Record<string, unknown> | undefined;
  if (!row) return null;
  const user = serializeUser(row as never) as unknown as Record<string, unknown>;
  user.device = row.bound_device_id
    ? {
        id: row.bound_device_id,
        receiptPrefix: row.receipt_prefix,
        name: row.device_name
      }
    : null;
  return user;
}

usersRouter.get(
  '/',
  authRequired,
  requireOwner,
  asyncHandler(async (_req: Request, res: Response) => {
    const rows = (await db('users as u')
      .leftJoin('devices as d', 'd.id', 'u.device_id')
      .whereNull('u.deleted_at')
      .select('u.*', 'd.receipt_prefix', 'd.name as device_name')
      .orderByRaw("CASE WHEN u.role = 'owner' THEN 0 ELSE 1 END")
      .orderBy('u.name')) as Record<string, unknown>[];

    const users = rows.map((row) => {
      const user = serializeUser(row as never) as unknown as Record<string, unknown>;
      user.device = row.device_id
        ? {
            id: row.device_id,
            receiptPrefix: row.receipt_prefix,
            name: row.device_name
          }
        : null;
      return user;
    });
    res.json({ users });
  })
);

usersRouter.post(
  '/',
  authRequired,
  requireOwner,
  validateBody(createSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const body = req.body as z.infer<typeof createSchema>;
    const tempPassword = generateTempPassword();
    const hash = await hashPassword(tempPassword);
    const phone = normalizeOptionalPhone(body.phone);
    const permissions = normalizePermissions('employee', {
      ...Object.fromEntries(PERMISSION_FLAGS.map((f) => [f, false])),
      'sales.make': true,
      'stock.view': true,
      ...(body.permissions ?? {})
    });

    const created = await db.transaction(async (trx) => {
      const rows = (await trx('users')
        .insert({
          name: body.name,
          email: body.email.toLowerCase(),
          phone,
          password_hash: hash,
          role: 'employee',
          permissions: JSON.stringify(permissions),
          is_active: true,
          must_change_password: true
        })
        .returning('*')) as Record<string, unknown>[];

      await writeAudit(trx, {
        userId: req.auth!.user.id,
        action: 'employee_created',
        entity: 'users',
        entityId: rows[0]!.id as string,
        details: { email: body.email.toLowerCase(), permissions }
      });
      return rows[0]!;
    });

    const createdUser = await userWithDevice(created.id as string);
    res.status(201).json({
      user: createdUser,
      tempPassword,
      credentials: {
        email: body.email.toLowerCase(),
        phone,
        tempPassword,
        loginUrl: loginUrl()
      },
      notice: 'Share this temporary password once. It will not be shown again.'
    });
  })
);

usersRouter.patch(
  '/:id',
  authRequired,
  requireOwner,
  validateBody(updateSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const body = req.body as z.infer<typeof updateSchema>;
    const target = (await db('users').where({ id: req.params.id }).whereNull('deleted_at').first()) as
      | Record<string, unknown>
      | undefined;
    if (!target) throw notFound('User not found');

    if (target.role === 'owner' && body.isActive === false) {
      throw forbidden('The owner account cannot be disabled');
    }

    const patch: Record<string, unknown> = { updated_at: db.fn.now() };
    if (body.name !== undefined) patch.name = body.name;
    if (body.phone !== undefined) patch.phone = normalizeOptionalPhone(body.phone);
    if (body.isActive !== undefined) patch.is_active = body.isActive;
    if (body.permissions !== undefined) {
      if (target.role === 'owner') throw forbidden('Owner permissions cannot be changed');
      patch.permissions = JSON.stringify(normalizePermissions('employee', body.permissions));
    }

    await db.transaction(async (trx) => {
      await trx('users').where({ id: req.params.id }).update(patch);
      if (body.permissions !== undefined) {
        await writeAudit(trx, {
          userId: req.auth!.user.id,
          action: 'user.permissions_changed',
          entity: 'users',
          entityId: req.params.id,
          details: {
            from: normalizePermissions('employee', target.permissions),
            to: normalizePermissions('employee', body.permissions)
          }
        });
      }
      if (body.isActive !== undefined) {
        await writeAudit(trx, {
          userId: req.auth!.user.id,
          action: body.isActive ? 'user.activated' : 'user.deactivated',
          entity: 'users',
          entityId: req.params.id
        });
      }
      if (body.phone !== undefined) {
        await writeAudit(trx, {
          userId: req.auth!.user.id,
          action: 'user.phone_changed',
          entity: 'users',
          entityId: req.params.id,
          details: { from: target.phone ?? null, to: patch.phone ?? null }
        });
      }
    });

    res.json({ user: await userWithDevice(req.params.id as string) });
  })
);

usersRouter.post(
  '/:id/reset-password',
  authRequired,
  requireOwner,
  asyncHandler(async (req: Request, res: Response) => {
    const target = (await db('users').where({ id: req.params.id }).whereNull('deleted_at').first()) as
      | Record<string, unknown>
      | undefined;
    if (!target) throw notFound('User not found');

    const tempPassword = generateTempPassword();
    const hash = await hashPassword(tempPassword);

    await db.transaction(async (trx) => {
      await trx('users')
        .where({ id: req.params.id })
        .update({
          password_hash: hash,
          must_change_password: true,
          updated_at: trx.fn.now()
        });
      await writeAudit(trx, {
        userId: req.auth!.user.id,
        action: 'user.password_reset',
        entity: 'users',
        entityId: req.params.id
      });
    });

    res.json({
      tempPassword,
      credentials: {
        email: String(target.email),
        phone: (target.phone as string | null | undefined) ?? null,
        tempPassword,
        loginUrl: loginUrl()
      },
      notice: 'Share this temporary password once. It will not be shown again.'
    });
  })
);

usersRouter.post(
  '/:id/release-device',
  authRequired,
  requireOwner,
  asyncHandler(async (req: Request, res: Response) => {
    const target = (await db('users').where({ id: req.params.id }).whereNull('deleted_at').first()) as
      | Record<string, unknown>
      | undefined;
    if (!target) throw notFound('User not found');

    await db.transaction(async (trx) => {
      await releaseDevice(trx, req.params.id as string);
      await writeAudit(trx, {
        userId: req.auth!.user.id,
        action: 'user.device_released',
        entity: 'users',
        entityId: req.params.id,
        details: { releasedDeviceId: target.device_id }
      });
    });

    res.json({ user: await userWithDevice(req.params.id as string) });
  })
);

usersRouter.delete(
  '/:id',
  authRequired,
  requireOwner,
  asyncHandler(async (req: Request, res: Response) => {
    const target = (await db('users')
      .where({ id: req.params.id })
      .whereNull('deleted_at')
      .first()) as Record<string, unknown> | undefined;
    if (!target) throw notFound('User not found');
    if (target.role === 'owner') throw forbidden('The owner account cannot be deleted');
    if (target.id === req.auth!.user.id) {
      throw forbidden('You cannot delete your own account');
    }

    await db.transaction(async (trx) => {
      await releaseDevice(trx, req.params.id as string);
      await trx('users')
        .where({ id: req.params.id })
        .update({
          // Free the original email so the person can be re-hired later while
          // keeping the row (and its name) for historical sales/report joins.
          email: `deleted+${req.params.id}@deleted.local`,
          deleted_at: trx.fn.now(),
          is_active: false,
          updated_at: trx.fn.now()
        });
      await writeAudit(trx, {
        userId: req.auth!.user.id,
        action: 'employee_deleted',
        entity: 'users',
        entityId: req.params.id,
        details: { email: target.email ?? null, name: target.name ?? null }
      });
    });

    res.status(204).end();
  })
);

usersRouter.get(
  '/:id/audit',
  authRequired,
  requireOwner,
  asyncHandler(async (req: Request, res: Response) => {
    const rows = (await db('audit_log as a')
      .leftJoin('users as u', 'u.id', 'a.user_id')
      .where('a.user_id', req.params.id)
      .select('a.*', 'u.name as user_name')
      .orderBy('a.created_at', 'desc')
      .limit(200)) as Record<string, unknown>[];
    res.json({ audit: rows.map((r) => camelize(r)) });
  })
);

export const auditRouter = Router();

auditRouter.get(
  '/',
  authRequired,
  requireOwner,
  asyncHandler(async (req: Request, res: Response) => {
    const action = typeof req.query.action === 'string' ? req.query.action : undefined;
    const query = db('audit_log as a')
      .leftJoin('users as u', 'u.id', 'a.user_id')
      .select('a.*', 'u.name as user_name')
      .orderBy('a.created_at', 'desc')
      .limit(300);
    if (action) query.where('a.action', action);
    const rows = (await query) as Record<string, unknown>[];
    res.json({ audit: rows.map((r) => camelize(r)) });
  })
);

export { userWithDevice };
