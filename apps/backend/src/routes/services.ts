import { Router } from 'express';
import { z } from 'zod';

import { authenticate, requireApproved } from '../middleware/auth';
import { AppError } from '../middleware/errorHandler';
import { validateBody } from '../middleware/validate';
import { prisma } from '../prisma';
import { auditContextFromRequest, logAudit } from '../services/audit';

import type { AuthenticatedRequest } from '../middleware/auth';

const router = Router();

const serviceSchema = z.object({
  name: z.string().min(1),
  centreId: z.string().uuid(),
  durationOverrideMinutes: z.number().int().positive().optional(),
  price: z.number().nonnegative().optional(),
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
    const services = await prisma.service.findMany({ where, include: { centre: true } });
    res.json(services);
  } catch (err) {
    next(err);
  }
});

router.get('/:id', authenticate, async (req: AuthenticatedRequest, res, next) => {
  try {
    const userCompanyId = req.user && req.user.role !== 'superadmin' ? req.user.companyId : undefined;
    const service = await prisma.service.findUnique({
      where: { id: req.params.id },
      include: { centre: true },
    });
    if (!service) throw new AppError(404, 'Service not found');
    if (userCompanyId && service.centre.companyId !== userCompanyId) {
      throw new AppError(403, 'Forbidden');
    }
    res.json(service);
  } catch (err) {
    next(err);
  }
});

router.post('/', authenticate, requireApproved, validateBody(serviceSchema), async (req: AuthenticatedRequest, res, next) => {
  try {
    const userCompanyId = req.user && req.user.role !== 'superadmin' ? req.user.companyId : undefined;
    if (userCompanyId) {
      const centre = await prisma.centre.findUnique({ where: { id: req.body.centreId } });
      if (!centre || centre.companyId !== userCompanyId) {
        throw new AppError(403, 'Cannot add service to a centre of another company');
      }
    }
    const service = await prisma.service.create({ data: req.body });
    await logAudit('CREATE', 'Service', service.id, { name: service.name, centreId: service.centreId }, auditContextFromRequest(req));
    res.status(201).json(service);
  } catch (err) {
    next(err);
  }
});

router.put('/:id', authenticate, requireApproved, validateBody(serviceSchema.partial()), async (req: AuthenticatedRequest, res, next) => {
  try {
    const userCompanyId = req.user && req.user.role !== 'superadmin' ? req.user.companyId : undefined;
    if (userCompanyId) {
      const service = await prisma.service.findUnique({
        where: { id: req.params.id },
        include: { centre: true },
      });
      if (!service) throw new AppError(404, 'Service not found');
      if (service.centre.companyId !== userCompanyId) {
        throw new AppError(403, 'Forbidden');
      }
      if (req.body.centreId) {
        const targetCentre = await prisma.centre.findUnique({ where: { id: req.body.centreId } });
        if (!targetCentre || targetCentre.companyId !== userCompanyId) {
          throw new AppError(403, 'Cannot move service to a centre of another company');
        }
      }
    }
    const service = await prisma.service.update({
      where: { id: req.params.id },
      data: req.body,
    });
    await logAudit('UPDATE', 'Service', service.id, { name: service.name, centreId: service.centreId, changes: req.body }, auditContextFromRequest(req));
    res.json(service);
  } catch (err) {
    next(err);
  }
});

router.delete('/:id', authenticate, requireApproved, async (req: AuthenticatedRequest, res, next) => {
  try {
    const userCompanyId = req.user && req.user.role !== 'superadmin' ? req.user.companyId : undefined;
    if (userCompanyId) {
      const service = await prisma.service.findUnique({
        where: { id: req.params.id },
        include: { centre: true },
      });
      if (!service) throw new AppError(404, 'Service not found');
      if (service.centre.companyId !== userCompanyId) {
        throw new AppError(403, 'Forbidden');
      }
    }
    const serviceId = req.params.id;
    await prisma.booking.deleteMany({ where: { serviceId } });
    await prisma.service.delete({ where: { id: serviceId } });
    await logAudit('DELETE', 'Service', serviceId, {}, auditContextFromRequest(req));
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

export { router as servicesRouter };
