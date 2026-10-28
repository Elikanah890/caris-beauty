import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import pinoHttp from 'pino-http';
import { env } from './env';
import { logger } from './logger';
import { db } from './db';
import { errorHandler, notFoundHandler } from './lib/errors';
import { authRouter } from './routes/auth';
import { usersRouter, auditRouter } from './routes/users';
import { devicesRouter } from './routes/devices';
import { productsRouter, categoriesRouter, unitsRouter } from './routes/products';
import { salesRouter } from './routes/sales';
import { purchasesRouter } from './routes/purchases';
import { stockRouter } from './routes/stock';
import { expensesRouter } from './routes/expenses';
import { reportsRouter } from './routes/reports';
import { syncRouter } from './routes/sync';
import { customersRouter, suppliersRouter } from './routes/customers';
import { businessRouter } from './routes/business';
import { publicRouter } from './routes/public';

export function createApp() {
  const app = express();

  app.use(
    helmet({
      crossOriginResourcePolicy: { policy: 'cross-origin' },
      contentSecurityPolicy: false
    })
  );
  app.use(
    cors({
      origin: env.CORS_ORIGIN.split(',').map((origin) => origin.trim()),
      credentials: true
    })
  );
  app.use(express.json({ limit: '5mb' }));
  app.use(cookieParser());

  app.use(
    pinoHttp({
      logger,
      serializers: {
        req(req) {
          return {
            id: req.id,
            method: req.method,
            url: req.url
          };
        },
        res(res) {
          return { statusCode: res.statusCode };
        }
      },
      customLogLevel(_req, res, err) {
        if (err || res.statusCode >= 500) return 'error';
        if (res.statusCode >= 400) return 'warn';
        return 'info';
      }
    })
  );

  app.get('/health', (_req, res) => {
    res.json({ ok: true, service: 'duka-api', time: new Date().toISOString() });
  });

  const api = express.Router();
  api.get('/health', async (_req, res) => {
    try {
      await db.raw('SELECT 1');
      res.json({ ok: true, db: 'ok', service: 'duka-api', time: new Date().toISOString() });
    } catch (err) {
      logger.error({ err }, 'Health check database failure');
      res.status(503).json({ ok: false, db: 'error', service: 'duka-api' });
    }
  });
  api.use('/auth', authRouter);
  api.use('/users', usersRouter);
  api.use('/devices', devicesRouter);
  api.use('/audit', auditRouter);
  api.use('/products', productsRouter);
  api.use('/categories', categoriesRouter);
  api.use('/units', unitsRouter);
  api.use('/sales', salesRouter);
  api.use('/purchases', purchasesRouter);
  api.use('/stock', stockRouter);
  api.use('/expenses', expensesRouter);
  api.use('/reports', reportsRouter);
  api.use('/sync', syncRouter);
  api.use('/customers', customersRouter);
  api.use('/suppliers', suppliersRouter);
  api.use('/business', businessRouter);
  api.use('/public', publicRouter);

  app.use('/api/v1', api);
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}

export const app = createApp();
