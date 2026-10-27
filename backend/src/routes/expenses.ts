import { Router } from 'express';
import { z } from 'zod';
import { db } from '../db';
import type { Request, Response } from 'express';
import { asyncHandler, notFound } from '../lib/errors';
import { camelize } from '../lib/case';
import { writeAudit } from '../lib/audit';
import { authRequired, requirePermission } from '../middleware/auth';
import { validateBody, validateQuery } from '../middleware/validate';
import { TENDERS } from '../services/sales';

export const expensesRouter = Router();

const createSchema = z.object({
  id: z.string().uuid().optional(),
  category: z.string().min(1).max(80),
  description: z.string().min(1).max(300),
  amount: z.coerce.number().int().positive(),
  paidVia: z.enum(TENDERS).default('cash'),
  spentAt: z.string().optional()
});

const listQuery = z.object({
  from: z.string().optional(),
  to: z.string().optional()
});

expensesRouter.get(
  '/',
  authRequired,
  requirePermission('expenses.record'),
  validateQuery(listQuery),
  asyncHandler(async (req: Request, res: Response) => {
    const q = req.query as unknown as z.infer<typeof listQuery>;
    const query = db('expenses as e')
      .leftJoin('users as u', 'u.id', 'e.user_id')
      .whereNull('e.deleted_at')
      .select('e.*', 'u.name as user_name')
      .orderBy('e.spent_at', 'desc')
      .limit(500);
    if (q.from) query.where('e.spent_at', '>=', new Date(q.from));
    if (q.to) query.where('e.spent_at', '<=', new Date(q.to));
    const rows = (await query) as Record<string, unknown>[];
    res.json({ expenses: rows.map((r) => camelize(r)) });
  })
);

expensesRouter.post(
  '/',
  authRequired,
  requirePermission('expenses.record'),
  validateBody(createSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const body = req.body as z.infer<typeof createSchema>;
    const user = req.auth!.user;
    const spentAt = body.spentAt ? new Date(body.spentAt) : new Date();

    const expense = await db.transaction(async (trx) => {
      const rows = (await trx('expenses')
        .insert({
          id: body.id ?? undefined,
          category: body.category,
          description: body.description,
          amount: body.amount,
          paid_via: body.paidVia,
          user_id: user.id,
          spent_at: spentAt
        })
        .returning('*')) as Record<string, unknown>[];
      await writeAudit(trx, {
        userId: user.id,
        action: 'expense.recorded',
        entity: 'expenses',
        entityId: rows[0]!.id as string,
        details: {
          category: body.category,
          amount: body.amount,
          description: body.description
        }
      });
      return rows[0]!;
    });

    res.status(201).json({ expense: camelize(expense) });
  })
);

expensesRouter.delete(
  '/:id',
  authRequired,
  requirePermission('expenses.record'),
  asyncHandler(async (req: Request, res: Response) => {
    const user = req.auth!.user;
    const row = (await db('expenses').where({ id: req.params.id }).whereNull('deleted_at').first()) as
      | Record<string, unknown>
      | undefined;
    if (!row) throw notFound('Expense not found');

    await db.transaction(async (trx) => {
      await trx('expenses')
        .where({ id: req.params.id })
        .update({ deleted_at: trx.fn.now(), updated_at: trx.fn.now() });
      await writeAudit(trx, {
        userId: user.id,
        action: 'expense.deleted',
        entity: 'expenses',
        entityId: req.params.id,
        details: { amount: row.amount, category: row.category }
      });
    });
    res.status(204).end();
  })
);
