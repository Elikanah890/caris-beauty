import { Router } from 'express';
import { db } from '../db';
import type { Request, Response } from 'express';
import { asyncHandler, notFound } from '../lib/errors';
import { camelize } from '../lib/case';
import { writeAudit } from '../lib/audit';
import { authRequired } from '../middleware/auth';

export const devicesRouter = Router();

devicesRouter.get(
  '/',
  authRequired,
  asyncHandler(async (req: Request, res: Response) => {
    const rows = (await db('devices')
      .where({ user_id: req.auth!.user.id })
      .whereNull('released_at')
      .orderBy('created_at', 'asc')) as Record<string, unknown>[];
    res.json({ devices: rows.map((row) => camelize(row)) });
  })
);

devicesRouter.post(
  '/:id/revoke',
  authRequired,
  asyncHandler(async (req: Request, res: Response) => {
    const userId = req.auth!.user.id;
    const device = (await db('devices')
      .where({ id: req.params.id, user_id: userId })
      .first()) as Record<string, unknown> | undefined;
    if (!device) throw notFound('Device not found');

    await db.transaction(async (trx) => {
      await trx('devices')
        .where({ id: device.id as string })
        .update({
          user_id: null,
          released_at: trx.fn.now(),
          updated_at: trx.fn.now()
        });
      await trx('users')
        .where({ id: userId, device_id: device.id as string })
        .update({ device_id: null, updated_at: trx.fn.now() });
      await writeAudit(trx, {
        userId,
        action: 'device.revoked',
        entity: 'devices',
        entityId: device.id as string,
        details: {
          name: device.name ?? null,
          receiptPrefix: device.receipt_prefix ?? null
        }
      });
    });

    res.status(204).end();
  })
);
