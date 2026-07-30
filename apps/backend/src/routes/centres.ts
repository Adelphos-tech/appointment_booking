import { Router } from 'express';
import { z } from 'zod';

import { authenticate, getAccessibleCentreIds, requireApproved, requireRole } from '../middleware/auth';
import type { AuthenticatedRequest } from '../middleware/auth';
import { AppError } from '../middleware/errorHandler';
import { validateBody } from '../middleware/validate';
import { prisma } from '../prisma';
import { auditContextFromRequest, logAudit } from '../services/audit';

const router = Router();

const centreSchema = z.object({
  name: z.string().min(1),
  location: z.string().min(1),
  serviceType: z.string().min(1),
  openTime: z.string().min(1),
  closeTime: z.string().min(1),
  slotDurationMinutes: z.number().int().positive(),
  prepTimeBeforeMinutes: z.number().int().default(0),
  prepTimeAfterMinutes: z.number().int().default(0),
  workingDays: z.array(z.string()).optional(),
  holidays: z.array(z.string()).optional(),
  companyId: z.string().uuid(),
});

router.get('/', authenticate, async (req: AuthenticatedRequest, res, next) => {
  try {
    const companyId = req.query.companyId as string | undefined;
    const accessIds = getAccessibleCentreIds(req);
    const userCompanyId = req.user && req.user.role !== 'superadmin' ? req.user.companyId : undefined;

    const centres = await prisma.centre.findMany({
      where: {
        ...(companyId ? { companyId } : {}),
        ...(userCompanyId ? { companyId: userCompanyId } : {}),
        ...(accessIds !== null ? { id: { in: accessIds } } : {}),
      },
      include: { staff: true, services: true, company: true },
    });
    res.json(centres);
  } catch (err) {
    next(err);
  }
});

router.get('/:id', authenticate, async (req: AuthenticatedRequest, res, next) => {
  try {
    const accessIds = getAccessibleCentreIds(req);
    if (accessIds !== null && !accessIds.includes(req.params.id)) throw new AppError(403, 'Forbidden');
    const userCompanyId = req.user && req.user.role !== 'superadmin' ? req.user.companyId : undefined;

    const centre = await prisma.centre.findUnique({
      where: { id: req.params.id },
      include: { staff: true, services: true },
    });
    if (!centre) throw new AppError(404, 'Centre not found');
    if (userCompanyId && centre.companyId !== userCompanyId) throw new AppError(403, 'Forbidden');

    res.json(centre);
  } catch (err) {
    next(err);
  }
});

router.post('/', authenticate, requireApproved, requireRole('superadmin', 'admin', 'company_owner'), validateBody(centreSchema), async (req: AuthenticatedRequest, res, next) => {
  try {
    const userCompanyId = req.user && req.user.role !== 'superadmin' ? req.user.companyId : undefined;
    if (userCompanyId && req.body.companyId !== userCompanyId) {
      throw new AppError(403, 'Cannot create a centre for another company');
    }

    const centre = await prisma.centre.create({ data: req.body });
    if (req.user && req.user.role !== 'superadmin') {
      const user = await prisma.user.findUnique({ where: { id: req.user.id } });
      if (user) {
        const currentIds = (user as any).centreIds || [];
        await prisma.user.update({
          where: { id: req.user.id },
          data: { centreIds: [...currentIds, centre.id] },
        });
      }
    }
    await logAudit('CREATE', 'Centre', centre.id, { name: centre.name, companyId: centre.companyId }, auditContextFromRequest(req));

    res.status(201).json(centre);
  } catch (err) {
    next(err);
  }
});

router.put('/:id', authenticate, requireApproved, requireRole('superadmin', 'admin', 'company_owner'), validateBody(centreSchema.partial()), async (req: AuthenticatedRequest, res, next) => {
  try {
    const accessIds = getAccessibleCentreIds(req);
    if (accessIds !== null && !accessIds.includes(req.params.id)) throw new AppError(403, 'Forbidden');
    const userCompanyId = req.user && req.user.role !== 'superadmin' ? req.user.companyId : undefined;

    const centre = await prisma.centre.findUnique({ where: { id: req.params.id } });
    if (!centre) throw new AppError(404, 'Centre not found');
    if (userCompanyId && centre.companyId !== userCompanyId) throw new AppError(403, 'Forbidden');
    if (userCompanyId && req.body.companyId && req.body.companyId !== userCompanyId) {
      throw new AppError(403, 'Cannot transfer centre to another company');
    }

    const updated = await prisma.centre.update({
      where: { id: req.params.id },
      data: req.body,
    });

    await logAudit('UPDATE', 'Centre', updated.id, { name: updated.name, companyId: updated.companyId, changes: req.body }, auditContextFromRequest(req));

    res.json(updated);
  } catch (err) {
    next(err);
  }
});

router.delete('/:id', authenticate, requireApproved, requireRole('superadmin', 'admin', 'company_owner'), async (req: AuthenticatedRequest, res, next) => {
  try {
    const accessIds = getAccessibleCentreIds(req);
    if (accessIds !== null && !accessIds.includes(req.params.id)) throw new AppError(403, 'Forbidden');
    const userCompanyId = req.user && req.user.role !== 'superadmin' ? req.user.companyId : undefined;

    const centre = await prisma.centre.findUnique({ where: { id: req.params.id } });
    if (!centre) throw new AppError(404, 'Centre not found');
    if (userCompanyId && centre.companyId !== userCompanyId) throw new AppError(403, 'Forbidden');

    const centreId = req.params.id;
    await prisma.centre.delete({ where: { id: centreId } });

    await logAudit('DELETE', 'Centre', centreId, { companyId: centre.companyId }, auditContextFromRequest(req));

    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

export { router as centresRouter };
