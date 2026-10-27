import { Router } from 'express';
import { z } from 'zod';
import { db } from '../db';
import type { Request, Response } from 'express';
import { asyncHandler } from '../lib/errors';
import { authRequired, requirePermission } from '../middleware/auth';
import { validateBody, validateQuery } from '../middleware/validate';
import { createPurchase, getPurchaseDetail } from '../services/purchases';
import { camelize } from '../lib/case';

export const purchasesRouter = Router();

const purchaseItemSchema = z.object({
  id: z.string().uuid().optional(),
  productId: z.string().uuid(),
  unitId: z.string().uuid(),
  qty: z.coerce.number().positive(),
  qtyBase: z.coerce.number().int().optional(),
  costPerBase: z.coerce.number().int().min(0).optional(),
  costPerUnit: z.coerce.number().int().min(0).optional(),
  movementId: z.string().uuid().optional()
});

const createSchema = z.object({
  id: z.string().uuid().optional(),
  supplierId: z.string().uuid().nullable().optional(),
  reference: z.string().max(80).nullable().optional(),
  notes: z.string().max(500).nullable().optional(),
  purchasedAt: z.string().optional(),
  items: z.array(purchaseItemSchema).min(1)
});

const listQuery = z.object({
  from: z.string().optional(),
  to: z.string().optional(),
  supplier: z.string().uuid().optional()
});

purchasesRouter.get(
  '/',
  authRequired,
  requirePermission('stock.receive'),
  validateQuery(listQuery),
  asyncHandler(async (req: Request, res: Response) => {
    const q = req.query as unknown as z.infer<typeof listQuery>;
    const query = db('purchases as p')
      .leftJoin('suppliers as s', 's.id', 'p.supplier_id')
      .select('p.*', 's.name as supplier_name')
      .orderBy('p.purchased_at', 'desc')
      .limit(300);
    if (q.from) query.where('p.purchased_at', '>=', new Date(q.from));
    if (q.to) query.where('p.purchased_at', '<=', new Date(q.to));
    if (q.supplier) query.where('p.supplier_id', q.supplier);
    const purchases = (await query) as Record<string, unknown>[];
    const ids = purchases.map((p) => p.id as string);
    const items = ids.length
      ? ((await db('purchase_items').whereIn('purchase_id', ids)) as Record<string, unknown>[])
      : [];
    const byPurchase = new Map<string, Record<string, unknown>[]>();
    for (const item of items) {
      const list = byPurchase.get(item.purchase_id as string) ?? [];
      list.push(item);
      byPurchase.set(item.purchase_id as string, list);
    }
    res.json({
      purchases: purchases.map((p) => ({
        ...(camelize(p) as Record<string, unknown>),
        items: (byPurchase.get(p.id as string) ?? []).map((item) => {
          const mapped = camelize<Record<string, unknown>>(item);
          mapped.qty = Number(mapped.qty);
          return mapped;
        })
      }))
    });
  })
);

purchasesRouter.get(
  '/:id',
  authRequired,
  requirePermission('stock.receive'),
  asyncHandler(async (req: Request, res: Response) => {
    res.json({ purchase: await getPurchaseDetail(db, req.params.id as string) });
  })
);

purchasesRouter.post(
  '/',
  authRequired,
  requirePermission('stock.receive'),
  validateBody(createSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const body = req.body as z.infer<typeof createSchema>;
    const purchase = await db.transaction((trx) =>
      createPurchase(trx, req.auth!.user, {
        ...body,
        deviceId: req.auth!.device?.id ?? null
      })
    );
    res.status(201).json({ purchase });
  })
);
