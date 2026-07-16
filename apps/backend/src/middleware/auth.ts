import { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';

import { config } from '../config';
import { AppError } from './errorHandler';
import { prisma } from '../prisma';

export interface AuthenticatedRequest extends Request {
  user?: { id: string; email: string; role: string; status: string; centreIds: string[]; companyId?: string };
}

export async function authenticate(
  req: AuthenticatedRequest,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  const authHeader = req.headers.authorization;
  const token = authHeader?.split(' ')[1];

  if (!token) {
    return next(new AppError(401, 'Unauthorized'));
  }

  try {
    const payload = jwt.verify(token, config.jwtSecret) as { id: string };
    const user = await prisma.user.findUnique({ where: { id: payload.id } });
    if (!user) return next(new AppError(401, 'User not found'));
    req.user = {
      id: user.id,
      email: user.email,
      role: user.role,
      status: user.status,
      centreIds: user.centreIds || [],
      companyId: user.companyId || undefined,
    };
    next();
  } catch {
    next(new AppError(401, 'Invalid token'));
  }
}

export function requireRole(...roles: string[]) {
  return (req: AuthenticatedRequest, _res: Response, next: NextFunction): void => {
    if (!req.user || !roles.includes(req.user.role)) {
      return next(new AppError(403, 'Forbidden'));
    }
    next();
  };
}

export function isSuperAdmin(req: AuthenticatedRequest): boolean {
  return req.user?.role === 'superadmin';
}

export function requireApproved(req: AuthenticatedRequest, _res: Response, next: NextFunction): void {
  if (!req.user || req.user.status !== 'Approved') {
    return next(new AppError(403, 'Your account is pending approval'));
  }
  next();
}

export function isCompanyOwner(req: AuthenticatedRequest): boolean {
  return req.user?.role === 'company_owner' && !!req.user?.companyId;
}

export function getAccessibleCentreIds(req: AuthenticatedRequest): string[] | null {
  if (!req.user) return null;
  if (req.user.role === 'superadmin') return null; // null = all
  if (req.user.companyId) return null; // null = all for their company (filtered downstream by companyId)
  return req.user.centreIds;
}
