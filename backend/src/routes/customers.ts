import { Router } from 'express';
import { z } from 'zod';
import { db } from '../db';
import type { Request, Response } from 'express';
import { asyncHandler, badRequest, notFound } from '../lib/errors';
import { camelize } from '../lib/case';
import { normalizedPhone } from '../lib/ids';
import { authRequired, requireOwner } from '../middleware/auth';
import { validateBody } from '../middleware/validate';

export const customersRouter = Router();

const customerSchema = z.object({
  name: z.string().min(1).max(120),
  phone: z.string().max(20).nullable().optional(),
  email: z.string().email().max(160).nullable().optional(),
  creditLimit: z.coerce.number().int().min(0).optional(),
  notes: z.string().max(300).nullable().optional(),
  isActive: z.boolean().optional()
});

function normalizeOptionalPhone(phone: string | null | undefined) {
  if (!phone) return null;
  const normalized = normalizedPhone(phone);
  if (!normalized) throw badRequest('Phone must look like +255712345678 or 0712345678', 'phone');
  return normalized;
}

customersRouter.get(
  '/',
  authRequired,
  asyncHandler(async (_req: Request, res: Response) => {
    const rows = (await db('customers')
      .whereNull('deleted_at')
      .orderBy('name')) as Record<string, unknown>[];
    const ids = rows.map((r) => r.id as string);
    const credits = ids.length
      ? ((await db('payments as pay')
          .join('sales as s', 's.id', 'pay.sale_id')
          .whereIn('s.customer_id', ids)
          .where('pay.tender', 'credit')
          .where('s.status', 'completed')
          .where('pay.is_reversed', false)
          .groupBy('s.customer_id')
          .select('s.customer_id')
          .sum({ credit: 'pay.amount' })) as Record<string, unknown>[])
      : [];
    const creditByCustomer = new Map(credits.map((c) => [c.customer_id as string, Number(c.credit)]));

    res.json({
      customers: rows.map((r) => ({
        ...(camelize(r) as Record<string, unknown>),
        creditOwed: creditByCustomer.get(r.id as string) ?? 0
      }))
    });
  })
);

customersRouter.post(
  '/',
  authRequired,
  requireOwner,
  validateBody(customerSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const body = req.body as z.infer<typeof customerSchema>;
    const rows = (await db('customers')
      .insert({
        name: body.name,
        phone: normalizeOptionalPhone(body.phone),
        email: body.email ?? null,
        credit_limit: body.creditLimit ?? 0,
        notes: body.notes ?? null,
        is_active: body.isActive ?? true
      })
      .returning('*')) as Record<string, unknown>[];
    res.status(201).json({ customer: camelize(rows[0]) });
  })
);

customersRouter.patch(
  '/:id',
  authRequired,
  requireOwner,
  validateBody(customerSchema.partial()),
  asyncHandler(async (req: Request, res: Response) => {
    const body = req.body as Partial<z.infer<typeof customerSchema>>;
    const patch: Record<string, unknown> = { updated_at: db.fn.now() };
    if (body.name !== undefined) patch.name = body.name;
    if (body.phone !== undefined) patch.phone = normalizeOptionalPhone(body.phone);
    if (body.email !== undefined) patch.email = body.email;
    if (body.creditLimit !== undefined) patch.credit_limit = body.creditLimit;
    if (body.notes !== undefined) patch.notes = body.notes;
    if (body.isActive !== undefined) patch.is_active = body.isActive;
    const rows = (await db('customers')
      .where({ id: req.params.id })
      .whereNull('deleted_at')
      .update(patch)
      .returning('*')) as Record<string, unknown>[];
    if (!rows[0]) throw notFound('Customer not found');
    res.json({ customer: camelize(rows[0]) });
  })
);

customersRouter.delete(
  '/:id',
  authRequired,
  requireOwner,
  asyncHandler(async (req: Request, res: Response) => {
    const rows = (await db('customers')
      .where({ id: req.params.id })
      .whereNull('deleted_at')
      .update({ deleted_at: db.fn.now(), is_active: false, updated_at: db.fn.now() })
      .returning('id')) as Record<string, unknown>[];
    if (!rows[0]) throw notFound('Customer not found');
    res.status(204).end();
  })
);

export const suppliersRouter = Router();

const supplierSchema = z.object({
  name: z.string().min(2).max(120),
  phone: z.string().max(20).nullable().optional(),
  email: z.string().email().max(160).nullable().optional(),
  address: z.string().max(200).nullable().optional()
});

suppliersRouter.get(
  '/',
  authRequired,
  asyncHandler(async (_req: Request, res: Response) => {
    const rows = (await db('suppliers').whereNull('deleted_at').orderBy('name')) as Record<
      string,
      unknown
    >[];
    res.json({ suppliers: rows.map((r) => camelize(r)) });
  })
);

suppliersRouter.post(
  '/',
  authRequired,
  requireOwner,
  validateBody(supplierSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const body = req.body as z.infer<typeof supplierSchema>;
    const rows = (await db('suppliers')
      .insert({
        name: body.name,
        phone: normalizeOptionalPhone(body.phone),
        email: body.email ?? null,
        address: body.address ?? null
      })
      .returning('*')) as Record<string, unknown>[];
    res.status(201).json({ supplier: camelize(rows[0]) });
  })
);
