import { Router } from 'express';
import { z } from 'zod';
import type { Request, Response } from 'express';
import { asyncHandler, badRequest } from '../lib/errors';
import { authRequired, requireOwner } from '../middleware/auth';
import { validateBody } from '../middleware/validate';
import { pullChanges, pushBatch, type SyncRow } from '../services/sync';

export const syncRouter = Router();

const pushSchema = z.object({
  batch: z
    .array(
      z.object({
        id: z.string().uuid(),
        entity: z.string().min(1).max(60),
        op: z.enum(['create', 'update', 'delete', 'void']),
        payload: z.record(z.unknown()),
        createdAt: z.string().optional()
      })
    )
    .max(50, 'Send at most 50 rows per batch')
});

const pullSchema = z.object({
  since: z.string().datetime().optional()
});

syncRouter.post(
  '/reset',
  authRequired,
  requireOwner,
  asyncHandler(async (_req: Request, res: Response) => {
    res.json({
      ok: true,
      serverTime: new Date().toISOString()
    });
  })
);

syncRouter.get(
  '/health',
  authRequired,
  asyncHandler(async (_req: Request, res: Response) => {
    res.json({ ok: true, time: new Date().toISOString() });
  })
);

syncRouter.post(
  '/push',
  authRequired,
  validateBody(pushSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const body = req.body as z.infer<typeof pushSchema>;
    const results = await pushBatch(req.auth!.user, body.batch as SyncRow[]);
    res.json({ results, serverTime: new Date().toISOString() });
  })
);

syncRouter.post(
  '/pull',
  authRequired,
  validateBody(pullSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const body = req.body as z.infer<typeof pullSchema>;
    let since = new Date(0);
    if (body.since) {
      const parsed = new Date(body.since);
      if (Number.isNaN(parsed.getTime())) throw badRequest('Invalid "since" timestamp');
      since = parsed;
    }
    res.json(await pullChanges(since));
  })
);
