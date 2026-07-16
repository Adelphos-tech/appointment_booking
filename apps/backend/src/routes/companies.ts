import { Router } from 'express';
import { z } from 'zod';

import { authenticate, requireApproved } from '../middleware/auth';
import { AppError } from '../middleware/errorHandler';
import { validateBody } from '../middleware/validate';
import { prisma } from '../prisma';
import { auditContextFromRequest, logAudit } from '../services/audit';
import type { AuthenticatedRequest } from '../middleware/auth';

const router = Router();

function generateSlug(name: string): string {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  if (!base) return `company-${Date.now()}`;
  let slug = base;
  // Simple collision avoidance by appending a short random suffix if needed
  return slug;
}

const companySchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
});

router.get('/', authenticate, async (req: AuthenticatedRequest, res, next) => {
  try {
    const isSuper = req.user?.role === 'superadmin';
    if (!isSuper && !req.user?.companyId) {
      return res.json([]);
    }
    const where = isSuper ? {} : { id: req.user?.companyId };
    const companies = await prisma.company.findMany({
      where,
      include: { centres: true },
      orderBy: { createdAt: 'desc' },
    });
    res.json(companies);
  } catch (err) {
    next(err);
  }
});

router.get('/public', async (_req, res, next) => {
  try {
    const companies = await prisma.company.findMany({
      select: { id: true, name: true, slug: true, description: true },
      orderBy: { createdAt: 'desc' },
    });
    res.json(companies);
  } catch (err) {
    next(err);
  }
});

router.get('/by-slug/:slug', async (req, res, next) => {
  try {
    const company = await prisma.company.findUnique({
      where: { slug: req.params.slug },
      select: { id: true, name: true, slug: true, description: true },
    });
    if (!company) throw new AppError(404, 'Company not found');
    res.json(company);
  } catch (err) {
    next(err);
  }
});

router.get('/:id', authenticate, async (req: AuthenticatedRequest, res, next) => {
  try {
    const isSuper = req.user?.role === 'superadmin';
    const company = await prisma.company.findUnique({
      where: { id: req.params.id },
      include: { centres: true },
    });
    if (!company) throw new AppError(404, 'Company not found');
    if (!isSuper && company.id !== req.user?.companyId) {
      throw new AppError(403, 'Forbidden');
    }
    res.json(company);
  } catch (err) {
    next(err);
  }
});

router.post('/', authenticate, requireApproved, validateBody(companySchema), async (req: AuthenticatedRequest, res, next) => {
  try {
    if (req.user?.role === 'superadmin') {
      throw new AppError(403, 'Superadmin cannot create companies. Only approved company owners can.');
    }
    if (req.user?.companyId) {
      throw new AppError(400, 'You already have a company. Only one company per owner is allowed.');
    }

    const slug = generateSlug(req.body.name);
    // Handle collision by appending a random suffix if needed
    const existing = await prisma.company.findUnique({ where: { slug } });
    const finalSlug = existing ? `${slug}-${Math.random().toString(36).slice(2, 6)}` : slug;

    const company = await prisma.company.create({
      data: { ...req.body, slug: finalSlug },
    });

    await prisma.user.update({
      where: { id: req.user!.id },
      data: { companyId: company.id, role: 'company_owner' },
    });

    await logAudit(
      'CREATE',
      'Company',
      company.id,
      { name: company.name, slug: company.slug, ownerId: req.user!.id },
      auditContextFromRequest(req),
    );

    res.status(201).json(company);
  } catch (err) {
    next(err);
  }
});

router.put('/:id', authenticate, requireApproved, validateBody(companySchema.partial()), async (req: AuthenticatedRequest, res, next) => {
  try {
    const isSuper = req.user?.role === 'superadmin';
    const target = await prisma.company.findUnique({ where: { id: req.params.id } });
    if (!target) throw new AppError(404, 'Company not found');
    if (!isSuper && target.id !== req.user?.companyId) {
      throw new AppError(403, 'Forbidden');
    }

    const data: any = { ...req.body };
    if (req.body.name) {
      const slug = generateSlug(req.body.name);
      const existing = await prisma.company.findFirst({
        where: { slug, id: { not: req.params.id } },
      });
      data.slug = existing ? `${slug}-${Math.random().toString(36).slice(2, 6)}` : slug;
    }

    const company = await prisma.company.update({
      where: { id: req.params.id },
      data,
    });

    await logAudit(
      'UPDATE',
      'Company',
      company.id,
      { name: company.name, changes: data },
      auditContextFromRequest(req),
    );

    res.json(company);
  } catch (err) {
    next(err);
  }
});

router.delete('/:id', authenticate, async (req: AuthenticatedRequest, res, next) => {
  try {
    const isSuper = req.user?.role === 'superadmin';
    const target = await prisma.company.findUnique({ where: { id: req.params.id } });
    if (!target) throw new AppError(404, 'Company not found');
    if (!isSuper && target.id !== req.user?.companyId) {
      throw new AppError(403, 'Forbidden');
    }

    const centres = await prisma.centre.findMany({
      where: { companyId: req.params.id },
      select: { id: true },
    });
    const centreIds = centres.map((c) => c.id);

    if (centreIds.length > 0) {
      await prisma.booking.deleteMany({ where: { centreId: { in: centreIds } } });
      await prisma.staff.deleteMany({ where: { centreId: { in: centreIds } } });
      await prisma.service.deleteMany({ where: { centreId: { in: centreIds } } });
      await prisma.centre.deleteMany({ where: { id: { in: centreIds } } });
    }

    await prisma.company.delete({ where: { id: req.params.id } });

    await logAudit(
      'DELETE',
      'Company',
      req.params.id,
      { deletedCentres: centreIds },
      auditContextFromRequest(req),
    );

    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

export { router as companiesRouter };
