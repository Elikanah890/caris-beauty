import { Router } from 'express';
import { z } from 'zod';
import { db } from '../db';
import type { Request, Response } from 'express';
import { asyncHandler, badRequest } from '../lib/errors';
import { camelize } from '../lib/case';
import { writeAudit } from '../lib/audit';
import { authRequired, requireOwner } from '../middleware/auth';
import { validateBody } from '../middleware/validate';

export const businessRouter = Router();

const updateSchema = z.object({
  name: z.string().min(2).max(120).optional(),
  tin: z.string().max(30).nullable().optional(),
  vrn: z.string().max(30).nullable().optional(),
  efdDeviceId: z.string().max(60).nullable().optional(),
  phone: z.string().max(20).nullable().optional(),
  address: z.string().max(200).nullable().optional(),
  receiptFooter: z.string().max(160).nullable().optional()
});

businessRouter.get(
  '/',
  authRequired,
  asyncHandler(async (_req: Request, res: Response) => {
    const row = (await db('business').orderBy('created_at').first()) as
      | Record<string, unknown>
      | undefined;
    res.json({ business: row ? camelize(row) : null });
  })
);

businessRouter.patch(
  '/',
  authRequired,
  requireOwner,
  validateBody(updateSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const body = req.body as z.infer<typeof updateSchema>;
    const existing = (await db('business').orderBy('created_at').first()) as
      | Record<string, unknown>
      | undefined;
    if (!existing) throw badRequest('Business has not been set up');

    const patch: Record<string, unknown> = { updated_at: db.fn.now() };
    const map: Record<string, string> = {
      name: 'name',
      tin: 'tin',
      vrn: 'vrn',
      efdDeviceId: 'efd_device_id',
      phone: 'phone',
      address: 'address',
      receiptFooter: 'receipt_footer'
    };
    for (const [key, column] of Object.entries(map)) {
      if (body[key as keyof typeof body] !== undefined) {
        patch[column] = body[key as keyof typeof body];
      }
    }

    const rows = (await db('business')
      .where({ id: existing.id })
      .update(patch)
      .returning('*')) as Record<string, unknown>[];

    await db.transaction(async (trx) => {
      await writeAudit(trx, {
        userId: req.auth!.user.id,
        action: 'business.updated',
        entity: 'business',
        entityId: existing.id as string,
        details: { fields: Object.keys(body) }
      });
    });

    res.json({ business: camelize(rows[0]) });
  })
);
