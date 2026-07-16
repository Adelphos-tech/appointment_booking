import { Router } from 'express';
import { z } from 'zod';

import { authenticate, requireApproved } from '../middleware/auth';
import { AppError } from '../middleware/errorHandler';
import { validateBody } from '../middleware/validate';
import { prisma } from '../prisma';
import { auditContextFromRequest, logAudit } from '../services/audit';

import type { AuthenticatedRequest } from '../middleware/auth';

const router = Router();

const waitlistSchema = z.object({
  customerName: z.string().min(1),
  customerContact: z.string().min(1),
  centreId: z.string().uuid(),
  serviceId: z.string().uuid(),
  preferredGender: z.string().optional(),
  preferredDate: z.string().min(1),
  notes: z.string().optional(),
});

router.get('/', authenticate, async (req: AuthenticatedRequest, res, next) => {
  try {
    const userCompanyId = req.user && req.user.role !== 'superadmin' ? req.user.companyId : undefined;
    const where: any = {};
    if (req.query.centreId) {
      where.centreId = String(req.query.centreId);
    }
    if (userCompanyId) {
      const centres = await prisma.centre.findMany({
        where: { companyId: userCompanyId },
        select: { id: true },
      });
      const allowedCentreIds = centres.map((c) => c.id);
      if (req.query.centreId) {
        if (!allowedCentreIds.includes(String(req.query.centreId))) {
          return res.json([]);
        }
      } else {
        where.centreId = { in: allowedCentreIds };
      }
    }
    const entries = await prisma.waitlist.findMany({
      where,
      orderBy: { createdAt: 'asc' },
    });
    res.json(entries);
  } catch (err) {
    next(err);
  }
});

router.get('/:id', authenticate, async (req: AuthenticatedRequest, res, next) => {
  try {
    const userCompanyId = req.user && req.user.role !== 'superadmin' ? req.user.companyId : undefined;
    const entry = await prisma.waitlist.findUnique({ where: { id: req.params.id } });
    if (!entry) throw new AppError(404, 'Waitlist entry not found');
    if (userCompanyId) {
      const centre = await prisma.centre.findUnique({ where: { id: entry.centreId } });
      if (!centre || centre.companyId !== userCompanyId) {
        throw new AppError(403, 'Forbidden');
      }
    }
    res.json(entry);
  } catch (err) {
    next(err);
  }
});

router.post('/', authenticate, requireApproved, validateBody(waitlistSchema), async (req: AuthenticatedRequest, res, next) => {
  try {
    const userCompanyId = req.user && req.user.role !== 'superadmin' ? req.user.companyId : undefined;
    if (userCompanyId) {
      const centre = await prisma.centre.findUnique({ where: { id: req.body.centreId } });
      if (!centre || centre.companyId !== userCompanyId) {
        throw new AppError(403, 'Cannot create waitlist entry for a centre in another company');
      }
    }
    const entry = await prisma.waitlist.create({ data: req.body });
    await logAudit('CREATE', 'Waitlist', entry.id, { customerName: entry.customerName, centreId: entry.centreId }, auditContextFromRequest(req));
    res.status(201).json(entry);
  } catch (err) {
    next(err);
  }
});

router.put('/:id', authenticate, requireApproved, validateBody(waitlistSchema.partial()), async (req: AuthenticatedRequest, res, next) => {
  try {
    const userCompanyId = req.user && req.user.role !== 'superadmin' ? req.user.companyId : undefined;
    if (userCompanyId) {
      const entry = await prisma.waitlist.findUnique({ where: { id: req.params.id } });
      if (!entry) throw new AppError(404, 'Waitlist entry not found');
      const centre = await prisma.centre.findUnique({ where: { id: entry.centreId } });
      if (!centre || centre.companyId !== userCompanyId) {
        throw new AppError(403, 'Forbidden');
      }
      if (req.body.centreId) {
        const targetCentre = await prisma.centre.findUnique({ where: { id: req.body.centreId } });
        if (!targetCentre || targetCentre.companyId !== userCompanyId) {
          throw new AppError(403, 'Cannot move waitlist entry to a centre in another company');
        }
      }
    }
    const entry = await prisma.waitlist.update({
      where: { id: req.params.id },
      data: req.body,
    });
    await logAudit('UPDATE', 'Waitlist', entry.id, { customerName: entry.customerName, centreId: entry.centreId, changes: req.body }, auditContextFromRequest(req));
    res.json(entry);
  } catch (err) {
    next(err);
  }
});

router.delete('/:id', authenticate, requireApproved, async (req: AuthenticatedRequest, res, next) => {
  try {
    const userCompanyId = req.user && req.user.role !== 'superadmin' ? req.user.companyId : undefined;
    if (userCompanyId) {
      const entry = await prisma.waitlist.findUnique({ where: { id: req.params.id } });
      if (!entry) throw new AppError(404, 'Waitlist entry not found');
      const centre = await prisma.centre.findUnique({ where: { id: entry.centreId } });
      if (!centre || centre.companyId !== userCompanyId) {
        throw new AppError(403, 'Forbidden');
      }
    }
    await prisma.waitlist.delete({ where: { id: req.params.id } });
    await logAudit('DELETE', 'Waitlist', req.params.id, {}, auditContextFromRequest(req));
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

export { router as waitlistRouter };
