import { Router } from 'express';
import { z } from 'zod';
import { db } from '../db';
import type { Request, Response } from 'express';
import { asyncHandler, badRequest } from '../lib/errors';
import { camelize } from '../lib/case';
import { writeAudit } from '../lib/audit';
import { authRequired, requirePermission } from '../middleware/auth';
import { validateBody, validateQuery } from '../middleware/validate';
import { getProduct, getStock } from '../services/stock';
import { uuid } from '../lib/ids';

export const stockRouter = Router();

const adjustSchema = z.object({
  id: z.string().uuid().optional(),
  productId: z.string().uuid(),
  qtyBase: z.coerce.number().int().refine((v) => v !== 0, 'Quantity cannot be zero'),
  reason: z.enum(['damaged', 'expired', 'count_correction', 'other']),
  note: z.string().max(300).nullable().optional(),
  createdAt: z.string().optional()
});

const movementsQuery = z.object({
  productId: z.string().uuid().optional(),
  from: z.string().optional(),
  to: z.string().optional(),
  type: z
    .enum(['purchase', 'sale', 'adjustment', 'return', 'sale_void', 'opening'])
    .optional()
});

stockRouter.post(
  '/adjust',
  authRequired,
  requirePermission('stock.adjust'),
  validateBody(adjustSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const body = req.body as z.infer<typeof adjustSchema>;
    const user = req.auth!.user;
    if (body.qtyBase > 0) {
      throw badRequest(
        "To add new stock, use 'Record Stock Purchase' on the Purchases page.",
        'qtyBase'
      );
    }
    const product = await getProduct(db, body.productId);

    const movement = await db.transaction(async (trx) => {
      const rows = (await trx('stock_movements')
        .insert({
          id: body.id ?? uuid(),
          product_id: product.id,
          movement_type: 'adjustment',
          qty_base: body.qtyBase,
          unit_cost: product.cost_per_base,
          reason: body.reason,
          note: body.note ?? null,
          user_id: user.id,
          device_id: req.auth!.device?.id ?? null,
          ...(body.createdAt ? { created_at: new Date(body.createdAt) } : {})
        })
        .returning('*')) as Record<string, unknown>[];

      await writeAudit(trx, {
        userId: user.id,
        action: 'stock.adjust',
        entity: 'stock_movements',
        entityId: rows[0]!.id as string,
        details: {
          productId: product.id,
          productName: product.name,
          qtyBase: body.qtyBase,
          reason: body.reason,
          note: body.note ?? null
        }
      });
      return rows[0]!;
    });

    res.status(201).json({
      movement: camelize(movement),
      stockBase: await getStock(db, product.id)
    });
  })
);

stockRouter.get(
  '/movements',
  authRequired,
  requirePermission('stock.view'),
  validateQuery(movementsQuery),
  asyncHandler(async (req: Request, res: Response) => {
    const q = req.query as unknown as z.infer<typeof movementsQuery>;
    if (q.productId) await getProduct(db, q.productId);

    const query = db('stock_movements as sm')
      .leftJoin('products as p', 'p.id', 'sm.product_id')
      .leftJoin('users as u', 'u.id', 'sm.user_id')
      .select(
        'sm.*',
        'p.name as product_name',
        'p.base_unit_id',
        'u.name as user_name'
      )
      .orderBy('sm.created_at', 'desc')
      .limit(500);
    if (q.productId) query.where('sm.product_id', q.productId);
    if (q.from) query.where('sm.created_at', '>=', new Date(q.from));
    if (q.to) query.where('sm.created_at', '<=', new Date(q.to));
    if (q.type) query.where('sm.movement_type', q.type);

    const rows = (await query) as Record<string, unknown>[];
    res.json({ movements: rows.map((r) => camelize(r)) });
  })
);
