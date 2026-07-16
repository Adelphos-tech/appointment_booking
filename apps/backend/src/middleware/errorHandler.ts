import crypto from 'crypto';
import { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';

export class AppError extends Error {
  constructor(
    public statusCode: number,
    message: string,
    public code?: string,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export function errorHandler(
  err: Error,
  req: Request,
  res: Response,
  _next: NextFunction,
): void {
  const requestId = (req as any).requestId || crypto.randomUUID();

  if (err instanceof AppError) {
    res.status(err.statusCode).json({ error: err.message, code: err.code, requestId });
    return;
  }

  if (err instanceof ZodError) {
    res.status(400).json({
      error: 'Validation failed',
      details: err.errors.map((e) => ({ path: e.path, message: e.message })),
      requestId,
    });
    return;
  }

  console.error(`[${requestId}] Unhandled error on ${req.method} ${req.path}:`, err);
  res.status(500).json({ error: 'Internal server error', requestId });
}
