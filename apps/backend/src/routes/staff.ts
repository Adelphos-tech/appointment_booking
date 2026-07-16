import { Router } from 'express';
import { z } from 'zod';

import { authenticate, requireApproved } from '../middleware/auth';
import { AppError } from '../middleware/errorHandler';
import { validateBody } from '../middleware/validate';
import { prisma } from '../prisma';
import { auditContextFromRequest, logAudit } from '../services/audit';

import type { AuthenticatedRequest } from '../middleware/auth';

const router = Router();

const staffSchema = z.object({
  name: z.string().min(1),
  gender: z.string().min(1),
  role: z.string().min(1),
  centreId: z.string().uuid(),
  employmentType: z.enum(['Permanent', 'Temporary']).default('Permanent'),
  dutyStartDate: z.string().min(1),
  dutyEndDate: z.string().optional(),
  dutyStartTime: z.string().min(1),
  dutyEndTime: z.string().min(1),
  workingDays: z.array(z.string()).optional(),
  servicesAllowed: z.array(z.string()).optional(),
});

router.get('/', authenticate, async (req: AuthenticatedRequest, res, next) => {
  try {
    const isSuper = req.user?.role === 'superadmin';
    const userCompanyId = !isSuper ? req.user?.companyId : undefined;
    if (!isSuper && !userCompanyId && !req.user?.centreIds.length) {
      return res.json([]);
    }
    const where: any = {};
    if (req.query.centreId) {
      where.centreId = String(req.query.centreId);
    }
    if (userCompanyId) {
      where.centre = { companyId: userCompanyId };
    } else if (!isSuper && req.user?.centreIds.length) {
      where.centreId = { in: req.user.centreIds };
    }
    const staff = await prisma.staff.findMany({ where, include: { centre: true } });
    res.json(staff);
  } catch (err) {
    next(err);
  }
});

router.get('/:id', authenticate, async (req: AuthenticatedRequest, res, next) => {
  try {
    const userCompanyId = req.user && req.user.role !== 'superadmin' ? req.user.companyId : undefined;
    const member = await prisma.staff.findUnique({
      where: { id: req.params.id },
      include: { centre: true },
    });
    if (!member) throw new AppError(404, 'Staff not found');
    if (userCompanyId && member.centre.companyId !== userCompanyId) {
      throw new AppError(403, 'Forbidden');
    }
    res.json(member);
  } catch (err) {
    next(err);
  }
});

router.post('/', authenticate, requireApproved, validateBody(staffSchema), async (req: AuthenticatedRequest, res, next) => {
  try {
    const userCompanyId = req.user && req.user.role !== 'superadmin' ? req.user.companyId : undefined;
    if (userCompanyId) {
      const centre = await prisma.centre.findUnique({ where: { id: req.body.centreId } });
      if (!centre || centre.companyId !== userCompanyId) {
        throw new AppError(403, 'Cannot add staff to a centre of another company');
      }
    }
    const member = await prisma.staff.create({ data: req.body });
    await logAudit('CREATE', 'Staff', member.id, { name: member.name, centreId: member.centreId }, auditContextFromRequest(req));
    res.status(201).json(member);
  } catch (err) {
    next(err);
  }
});

router.put('/:id', authenticate, requireApproved, validateBody(staffSchema.partial()), async (req: AuthenticatedRequest, res, next) => {
  try {
    const userCompanyId = req.user && req.user.role !== 'superadmin' ? req.user.companyId : undefined;
    if (userCompanyId) {
      const member = await prisma.staff.findUnique({
        where: { id: req.params.id },
        include: { centre: true },
      });
      if (!member) throw new AppError(404, 'Staff not found');
      if (member.centre.companyId !== userCompanyId) {
        throw new AppError(403, 'Forbidden');
      }
      if (req.body.centreId) {
        const targetCentre = await prisma.centre.findUnique({ where: { id: req.body.centreId } });
        if (!targetCentre || targetCentre.companyId !== userCompanyId) {
          throw new AppError(403, 'Cannot move staff to a centre of another company');
        }
      }
    }
    const member = await prisma.staff.update({
      where: { id: req.params.id },
      data: req.body,
    });
    await logAudit('UPDATE', 'Staff', member.id, { name: member.name, centreId: member.centreId, changes: req.body }, auditContextFromRequest(req));
    res.json(member);
  } catch (err) {
    next(err);
  }
});

router.delete('/:id', authenticate, requireApproved, async (req: AuthenticatedRequest, res, next) => {
  try {
    const userCompanyId = req.user && req.user.role !== 'superadmin' ? req.user.companyId : undefined;
    if (userCompanyId) {
      const member = await prisma.staff.findUnique({
        where: { id: req.params.id },
        include: { centre: true },
      });
      if (!member) throw new AppError(404, 'Staff not found');
      if (member.centre.companyId !== userCompanyId) {
        throw new AppError(403, 'Forbidden');
      }
    }
    const staffId = req.params.id;
    await prisma.booking.deleteMany({ where: { staffId } });
    await prisma.staff.delete({ where: { id: staffId } });
    await logAudit('DELETE', 'Staff', staffId, {}, auditContextFromRequest(req));
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

export { router as staffRouter };
