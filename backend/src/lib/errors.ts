import type { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';
import { logger } from '../logger';

export class AppError extends Error {
  readonly status: number;
  readonly code: string;
  readonly field?: string;

  constructor(status: number, code: string, message: string, field?: string) {
    super(message);
    this.status = status;
    this.code = code;
    this.field = field;
  }
}

export const badRequest = (message: string, field?: string) =>
  new AppError(400, 'BAD_REQUEST', message, field);
export const unauthorized = (message = 'Authentication required') =>
  new AppError(401, 'UNAUTHORIZED', message);
export const forbidden = (message = 'You do not have permission to do that') =>
  new AppError(403, 'FORBIDDEN', message);
export const notFound = (message = 'Not found') =>
  new AppError(404, 'NOT_FOUND', message);
export const conflict = (code: string, message: string) =>
  new AppError(409, code, message);

type AsyncHandler = (req: Request, res: Response, next: NextFunction) => Promise<unknown>;

export const asyncHandler =
  (fn: AsyncHandler) => (req: Request, res: Response, next: NextFunction) => {
    fn(req, res, next).catch(next);
  };

export function notFoundHandler(req: Request, _res: Response, next: NextFunction): void {
  next(notFound(`Route ${req.method} ${req.path} not found`));
}

export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  if (err instanceof AppError) {
    res.status(err.status).json({
      error: { code: err.code, message: err.message, ...(err.field ? { field: err.field } : {}) }
    });
    return;
  }

  if (err instanceof ZodError) {
    const first = err.errors[0];
    res.status(400).json({
      error: {
        code: 'VALIDATION_ERROR',
        message: first?.message ?? 'Invalid request',
        ...(first?.path.length ? { field: first.path.join('.') } : {})
      }
    });
    return;
  }

  const dbErr = err as { code?: string; constraint?: string };
  if (dbErr?.code === '23505') {
    res.status(409).json({
      error: { code: 'DUPLICATE', message: 'That record already exists' }
    });
    return;
  }
  if (dbErr?.code === '23503') {
    res.status(400).json({
      error: { code: 'INVALID_REFERENCE', message: 'A related record does not exist' }
    });
    return;
  }

  logger.error({ err }, 'Unhandled request error');
  res.status(500).json({
    error: { code: 'INTERNAL_ERROR', message: 'Something went wrong. Please try again.' }
  });
}
