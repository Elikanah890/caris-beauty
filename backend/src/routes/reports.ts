import { Router } from 'express';
import { z } from 'zod';
import type { Request, Response } from 'express';
import { asyncHandler } from '../lib/errors';
import { authRequired, requirePermission } from '../middleware/auth';
import { validateQuery } from '../middleware/validate';
import {
  efdCsv,
  getCloseDay,
  getInsights,
  getShrinkage,
  getSlowMovers,
  getStaffPerformance,
  getSummary,
  getTopProducts,
  resolveRange
} from '../services/reports';
import type { Period } from '../lib/time';

export const reportsRouter = Router();

const periodQuery = z.object({
  period: z.enum(['today', 'week', 'month', 'year', 'custom']).default('today'),
  from: z.string().optional(),
  to: z.string().optional()
});

const topQuery = periodQuery.extend({
  limit: z.coerce.number().int().positive().max(50).default(5),
  by: z.enum(['qty', 'revenue']).default('qty')
});

const slowQuery = periodQuery.extend({
  threshold: z.coerce.number().int().min(0).default(0)
});

const closeQuery = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional()
});

function rangeFrom(q: z.infer<typeof periodQuery>) {
  return resolveRange(q.period as Period, q.from, q.to);
}

reportsRouter.get(
  '/summary',
  authRequired,
  requirePermission('reports.view'),
  validateQuery(periodQuery),
  asyncHandler(async (req: Request, res: Response) => {
    const q = req.query as unknown as z.infer<typeof periodQuery>;
    res.json({ summary: await getSummary(rangeFrom(q)) });
  })
);

reportsRouter.get(
  '/top-products',
  authRequired,
  requirePermission('reports.view'),
  validateQuery(topQuery),
  asyncHandler(async (req: Request, res: Response) => {
    const q = req.query as unknown as z.infer<typeof topQuery>;
    res.json({ products: await getTopProducts(rangeFrom(q), q.limit, q.by) });
  })
);

reportsRouter.get(
  '/slow-movers',
  authRequired,
  requirePermission('reports.view'),
  validateQuery(slowQuery),
  asyncHandler(async (req: Request, res: Response) => {
    const q = req.query as unknown as z.infer<typeof slowQuery>;
    res.json({ products: await getSlowMovers(rangeFrom(q), q.threshold) });
  })
);

reportsRouter.get(
  '/staff-performance',
  authRequired,
  requirePermission('reports.view'),
  validateQuery(periodQuery),
  asyncHandler(async (req: Request, res: Response) => {
    const q = req.query as unknown as z.infer<typeof periodQuery>;
    res.json({ staff: await getStaffPerformance(rangeFrom(q)) });
  })
);

reportsRouter.get(
  '/shrinkage',
  authRequired,
  requirePermission('reports.view'),
  validateQuery(periodQuery),
  asyncHandler(async (req: Request, res: Response) => {
    const q = req.query as unknown as z.infer<typeof periodQuery>;
    res.json({ shrinkage: await getShrinkage(rangeFrom(q)) });
  })
);

reportsRouter.get(
  '/insights',
  authRequired,
  requirePermission('reports.view'),
  validateQuery(periodQuery),
  asyncHandler(async (req: Request, res: Response) => {
    const q = req.query as unknown as z.infer<typeof periodQuery>;
    res.json({ insights: await getInsights(rangeFrom(q)) });
  })
);

reportsRouter.get(
  '/close-day',
  authRequired,
  requirePermission('reports.view'),
  validateQuery(closeQuery),
  asyncHandler(async (req: Request, res: Response) => {
    const q = req.query as unknown as z.infer<typeof closeQuery>;
    const today = new Date(Date.now() + 3 * 3600_000).toISOString().slice(0, 10);
    res.json({ closeDay: await getCloseDay(q.date ?? today) });
  })
);

reportsRouter.get(
  '/export/efd',
  authRequired,
  requirePermission('reports.view'),
  validateQuery(periodQuery),
  asyncHandler(async (req: Request, res: Response) => {
    const q = req.query as unknown as z.infer<typeof periodQuery>;
    const csv = await efdCsv(rangeFrom(q));
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="duka-efd-${new Date().toISOString().slice(0, 10)}.csv"`
    );
    res.send(csv);
  })
);
