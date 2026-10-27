import { Router } from 'express';
import { z } from 'zod';
import { db } from '../db';
import type { Request, Response } from 'express';
import { asyncHandler, forbidden } from '../lib/errors';
import { hasPermission } from '../lib/permissions';
import { authRequired, requirePermission } from '../middleware/auth';
import { validateBody, validateQuery } from '../middleware/validate';
import { createSale, getSaleDetail, listSales, voidSale, TENDERS } from '../services/sales';

export const salesRouter = Router();

const saleItemSchema = z.object({
  id: z.string().uuid().optional(),
  productId: z.string().uuid(),
  unitId: z.string().uuid(),
  qty: z.coerce.number().positive(),
  qtyBase: z.coerce.number().int().optional(),
  movementId: z.string().uuid().optional()
});

const paymentSchema = z.object({
  id: z.string().uuid().optional(),
  tender: z.enum(TENDERS),
  amount: z.coerce.number().int().min(0),
  reference: z.string().max(120).nullable().optional()
});

const createSaleSchema = z.object({
  id: z.string().uuid().optional(),
  customerId: z.string().uuid().nullable().optional(),
  items: z.array(saleItemSchema).min(1),
  discount: z.coerce.number().int().min(0).optional(),
  payments: z.array(paymentSchema).min(1),
  notes: z.string().max(500).nullable().optional(),
  soldAt: z.string().optional()
});

const listQuery = z.object({
  from: z.string().optional(),
  to: z.string().optional(),
  user: z.string().uuid().optional(),
  customer: z.string().uuid().optional(),
  limit: z.coerce.number().int().positive().max(500).optional()
});

salesRouter.post(
  '/',
  authRequired,
  requirePermission('sales.make'),
  validateBody(createSaleSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const body = req.body as z.infer<typeof createSaleSchema>;
    const user = req.auth!.user;
    const deviceId = req.auth!.device?.id;
    if (!deviceId) {
      res.status(400).json({
        error: { code: 'DEVICE_REQUIRED', message: 'Register this device before selling' }
      });
      return;
    }

    const sale = await db.transaction((trx) =>
      createSale(trx, user, { ...body, deviceId })
    );
    res.status(201).json({ sale });
  })
);

salesRouter.get(
  '/',
  authRequired,
  requirePermission('sales.make'),
  validateQuery(listQuery),
  asyncHandler(async (req: Request, res: Response) => {
    const q = req.query as unknown as z.infer<typeof listQuery>;
    const user = req.auth!.user;
    const canViewAll =
      user.role === 'owner' || hasPermission(user.role, user.permissions, 'reports.view');
    const sales = await listSales(db, {
      from: q.from,
      to: q.to,
      userId: canViewAll ? q.user : user.id,
      customerId: q.customer,
      limit: q.limit
    });
    res.json({ sales });
  })
);

salesRouter.get(
  '/:id',
  authRequired,
  requirePermission('sales.make'),
  asyncHandler(async (req: Request, res: Response) => {
    const user = req.auth!.user;
    const sale = await getSaleDetail(db, req.params.id as string);
    const canViewAll =
      user.role === 'owner' || hasPermission(user.role, user.permissions, 'reports.view');
    if (!canViewAll && (sale as Record<string, unknown>).userId !== user.id) {
      throw forbidden('You can only view your own sales');
    }
    res.json({ sale });
  })
);

salesRouter.post(
  '/:id/void',
  authRequired,
  requirePermission('sales.void'),
  asyncHandler(async (req: Request, res: Response) => {
    const sale = await db.transaction((trx) => voidSale(trx, req.auth!.user, req.params.id as string));
    res.json({ sale });
  })
);
