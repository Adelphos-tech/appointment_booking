import bcrypt from 'bcryptjs';
import { Router } from 'express';
import { z } from 'zod';

import { AppError } from '../middleware/errorHandler';
import { authenticate, requireRole } from '../middleware/auth';
import { validateBody } from '../middleware/validate';
import { prisma } from '../prisma';
import { auditContextFromRequest, logAudit } from '../services/audit';
import type { AuthenticatedRequest } from '../middleware/auth';

const router = Router();

const createUserSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
  name: z.string().optional(),
  role: z.enum(['admin', 'company_owner']).default('admin'),
  status: z.enum(['Pending', 'Approved', 'Rejected']).default('Pending'),
  centreIds: z.array(z.string()).default([]),
  companyId: z.string().optional().nullable(),
});

const updateUserSchema = z.object({
  email: z.string().email().optional(),
  password: z.string().min(6).optional(),
  name: z.string().optional(),
  role: z.enum(['admin', 'company_owner']).optional(),
  status: z.enum(['Pending', 'Approved', 'Rejected']).optional(),
  centreIds: z.array(z.string()).optional(),
  companyId: z.string().optional().nullable(),
});

router.get('/', authenticate, requireRole('superadmin'), async (_req, res, next) => {
  try {
    const users = await prisma.user.findMany({
      orderBy: { createdAt: 'desc' },
    });
    res.json(users.map((u: any) => ({
      id: u.id, email: u.email, name: u.name, role: u.role, status: u.status, centreIds: u.centreIds || [], companyId: u.companyId, createdAt: u.createdAt,
    })));
  } catch (err) {
    next(err);
  }
});

router.post('/', authenticate, requireRole('superadmin'), validateBody(createUserSchema), async (req, res, next) => {
  try {
    const { email, password, name, role, status, centreIds, companyId } = req.body;
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) throw new AppError(409, 'User already exists');

    if (role === 'superadmin') throw new AppError(403, 'Superadmin role cannot be created via API');
    const hash = await bcrypt.hash(password, 10);
    const user = await prisma.user.create({
      data: { email, password: hash, name, role, status: status || 'Pending', centreIds, companyId: companyId || null },
    });
    await logAudit('CREATE', 'User', user.id, { email: user.email, role: user.role, status: user.status }, auditContextFromRequest(req));
    res.status(201).json({ id: user.id, email: user.email, name: user.name, role: user.role, status: user.status, centreIds: user.centreIds || [], companyId: user.companyId, createdAt: user.createdAt });
  } catch (err) {
    next(err);
  }
});

router.put('/:id', authenticate, requireRole('superadmin'), validateBody(updateUserSchema), async (req: AuthenticatedRequest, res, next) => {
  try {
    const data: any = { ...req.body };
    if (data.password) {
      data.password = await bcrypt.hash(data.password, 10);
    }
    if (data.role === 'superadmin') throw new AppError(403, 'Superadmin role cannot be assigned via API');
    const user = await prisma.user.update({
      where: { id: req.params.id },
      data,
    });
    await logAudit('UPDATE', 'User', user.id, { email: user.email, role: user.role, status: user.status, changes: Object.keys(data) }, auditContextFromRequest(req));
    res.json({ id: user.id, email: user.email, name: user.name, role: user.role, status: user.status, centreIds: user.centreIds || [], companyId: user.companyId, createdAt: user.createdAt });
  } catch (err) {
    next(err);
  }
});

router.patch('/:id/approve', authenticate, requireRole('superadmin'), async (req: AuthenticatedRequest, res, next) => {
  try {
    const user = await prisma.user.update({
      where: { id: req.params.id },
      data: { status: 'Approved' },
    });
    await logAudit('APPROVE', 'User', user.id, { email: user.email, role: user.role }, auditContextFromRequest(req));
    res.json({ id: user.id, email: user.email, name: user.name, role: user.role, status: user.status, centreIds: user.centreIds || [], companyId: user.companyId, createdAt: user.createdAt });
  } catch (err) {
    next(err);
  }
});

router.patch('/:id/reject', authenticate, requireRole('superadmin'), async (req: AuthenticatedRequest, res, next) => {
  try {
    const user = await prisma.user.update({
      where: { id: req.params.id },
      data: { status: 'Rejected' },
    });
    await logAudit('REJECT', 'User', user.id, { email: user.email, role: user.role }, auditContextFromRequest(req));
    res.json({ id: user.id, email: user.email, name: user.name, role: user.role, status: user.status, centreIds: user.centreIds || [], companyId: user.companyId, createdAt: user.createdAt });
  } catch (err) {
    next(err);
  }
});

router.delete('/:id', authenticate, requireRole('superadmin'), async (req: AuthenticatedRequest, res, next) => {
  try {
    if (req.params.id === req.user!.id) throw new AppError(400, 'Cannot delete yourself');
    await prisma.user.delete({ where: { id: req.params.id } });
    await logAudit('DELETE', 'User', req.params.id, {}, auditContextFromRequest(req));
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

export { router as usersRouter };
