import { Router } from 'express';
import { z } from 'zod';

import { authenticate, AuthenticatedRequest, requireApproved } from '../middleware/auth';
import { AppError } from '../middleware/errorHandler';
import { validateBody } from '../middleware/validate';
import { prisma } from '../prisma';
import { sendNotification } from '../services/notifications';
import { auditContextFromRequest, logAudit } from '../services/audit';
import { stripHtmlTags } from '../services/sanitize';
import { logger } from '../services/logger';

function generateBookingRef(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let ref = 'SLC-';
  for (let i = 0; i < 6; i++) ref += chars[Math.floor(Math.random() * chars.length)];
  return ref;
}

const router = Router();

const bookingSchema = z.object({
  customerName: z.string().min(1).transform((s) => stripHtmlTags(s.trim())),
  customerContact: z.string().min(1).transform((s) => stripHtmlTags(s.trim())),
  customerEmail: z.string().email().optional().transform((s) => (s ? stripHtmlTags(s.trim()) : s)),
  centreId: z.string().uuid(),
  staffId: z.string().uuid(),
  serviceId: z.string().uuid(),
  slotStart: z.string().datetime(),
  slotEnd: z.string().datetime(),
  preferredGender: z.string().optional().transform((s) => (s ? stripHtmlTags(s.trim()) : s)),
  status: z.enum(['Available', 'Booked', 'ManuallyBooked', 'Cancelled', 'NoShow', 'Completed', 'Blocked']).optional(),
  paymentStatus: z.enum(['Pending', 'Paid', 'Refunded', 'Failed']).optional(),
});

const statusUpdateSchema = z.object({
  status: z.enum(['Available', 'Booked', 'ManuallyBooked', 'Cancelled', 'NoShow', 'Completed', 'Blocked']).optional(),
  paymentStatus: z.enum(['Pending', 'Paid', 'Refunded', 'Failed']).optional(),
});

router.get('/', authenticate, async (req: AuthenticatedRequest, res, next) => {
  try {
    const isSuper = req.user?.role === 'superadmin';
    const userCompanyId = !isSuper ? req.user?.companyId : undefined;
    if (!isSuper && !userCompanyId && !req.user?.centreIds.length) {
      return res.json([]);
    }
    const where: Record<string, any> = {};
    if (req.query.centreId) where.centreId = String(req.query.centreId);
    if (req.query.staffId) where.staffId = String(req.query.staffId);
    if (req.query.status) where.status = String(req.query.status);
    if (req.query.date) {
      const d = new Date(String(req.query.date));
      const nextDay = new Date(d);
      nextDay.setDate(nextDay.getDate() + 1);
      where.slotStart = { gte: d, lt: nextDay };
    }
    if (userCompanyId) {
      where.centre = { companyId: userCompanyId };
    } else if (!isSuper && req.user?.centreIds.length) {
      where.centreId = { in: req.user.centreIds };
    }

    // Pagination
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(200, Math.max(1, Number(req.query.limit) || 50));
    const skip = (page - 1) * limit;

    const [bookings, total] = await Promise.all([
      prisma.booking.findMany({
        where,
        include: { centre: true, staff: true, service: true },
        orderBy: { slotStart: 'asc' },
        skip,
        take: limit,
      }),
      prisma.booking.count({ where }),
    ]);
    res.json({
      data: bookings,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  } catch (err) {
    next(err);
  }
});

router.get('/:id', authenticate, async (req: AuthenticatedRequest, res, next) => {
  try {
    const userCompanyId = req.user && req.user.role !== 'superadmin' ? req.user.companyId : undefined;
    const booking = await prisma.booking.findUnique({
      where: { id: req.params.id },
      include: { centre: true, staff: true, service: true },
    });
    if (!booking) throw new AppError(404, 'Booking not found');
    if (userCompanyId && booking.centre.companyId !== userCompanyId) {
      throw new AppError(403, 'Forbidden');
    }
    res.json(booking);
  } catch (err) {
    next(err);
  }
});

router.post('/', authenticate, requireApproved, validateBody(bookingSchema), async (req: AuthenticatedRequest, res, next) => {
  try {
    const userCompanyId = req.user && req.user.role !== 'superadmin' ? req.user.companyId : undefined;
    if (userCompanyId) {
      const centre = await prisma.centre.findUnique({ where: { id: req.body.centreId } });
      if (!centre || centre.companyId !== userCompanyId) {
        throw new AppError(403, 'Cannot create booking for a centre in another company');
      }
    }

    const slotStart = new Date(req.body.slotStart);
    const slotEnd = new Date(req.body.slotEnd);

    const booking = await prisma.$transaction(async (tx) => {
      const conflict = await tx.booking.findFirst({
        where: {
          staffId: req.body.staffId,
          status: { in: ['Booked', 'ManuallyBooked', 'Blocked'] },
          slotStart: { lt: slotEnd },
          slotEnd: { gt: slotStart },
        },
      });
      if (conflict) {
        throw new AppError(409, 'This time slot is already booked for the selected staff member.');
      }

      let bookingRef = generateBookingRef();
      let existing = await tx.booking.findUnique({ where: { bookingRef } });
      let attempts = 0;
      while (existing && attempts < 5) {
        bookingRef = generateBookingRef();
        existing = await tx.booking.findUnique({ where: { bookingRef } });
        attempts++;
      }

      return tx.booking.create({
        data: {
          bookingRef,
          customerName: req.body.customerName,
          customerContact: req.body.customerContact,
          customerEmail: req.body.customerEmail || undefined,
          centreId: req.body.centreId,
          staffId: req.body.staffId,
          serviceId: req.body.serviceId,
          slotStart,
          slotEnd,
          preferredGender: req.body.preferredGender || undefined,
          status: req.body.status || 'ManuallyBooked',
          paymentStatus: req.body.paymentStatus,
        },
        include: { centre: true, staff: true, service: true },
      });
    }, {
      isolationLevel: 'Serializable',
    });

    await sendNotification({
      to: booking.customerContact,
      channel: 'sms',
      body: `Hi ${booking.customerName}, your appointment at ${booking.centre.name} is confirmed for ${booking.slotStart.toLocaleString()}. Ref: ${booking.bookingRef}`,
    }).catch((err) => logger.error('notification.sms.failed', { error: err.message }));

    if (booking.customerEmail) {
      await sendNotification({
        to: booking.customerEmail,
        channel: 'email',
        subject: 'Appointment Confirmation',
        body: `Hi ${booking.customerName},\n\nYour appointment at ${booking.centre.name} is confirmed for ${booking.slotStart.toLocaleString()}.\n\nService: ${booking.service.name}\nStaff: ${booking.staff.name}\nBooking Ref: ${booking.bookingRef}\n\nThank you,\nSlotcare AI`,
      }).catch((err) => logger.error('notification.email.failed', { error: err.message }));
    }

    await logAudit('CREATE', 'Booking', booking.id, { customerName: booking.customerName, centreId: booking.centreId, staffId: booking.staffId, serviceId: booking.serviceId }, auditContextFromRequest(req));

    res.status(201).json(booking);
  } catch (err) {
    next(err);
  }
});

router.put('/:id', authenticate, requireApproved, validateBody(bookingSchema.partial().merge(statusUpdateSchema)), async (req: AuthenticatedRequest, res, next) => {
  try {
    const userCompanyId = req.user && req.user.role !== 'superadmin' ? req.user.companyId : undefined;
    if (userCompanyId) {
      const existing = await prisma.booking.findUnique({ where: { id: req.params.id }, include: { centre: true } });
      if (!existing) throw new AppError(404, 'Booking not found');
      if (existing.centre.companyId !== userCompanyId) {
        throw new AppError(403, 'Forbidden');
      }
      if (req.body.centreId) {
        const targetCentre = await prisma.centre.findUnique({ where: { id: req.body.centreId } });
        if (!targetCentre || targetCentre.companyId !== userCompanyId) {
          throw new AppError(403, 'Cannot move booking to a centre in another company');
        }
      }
    }

    const update: Record<string, unknown> = { ...req.body };
    if (req.body.slotStart) update.slotStart = new Date(req.body.slotStart);
    if (req.body.slotEnd) update.slotEnd = new Date(req.body.slotEnd);

    // If changing time or staff, check for double booking and update atomically
    let booking;
    if (req.body.slotStart || req.body.slotEnd || req.body.staffId) {
      const existing = await prisma.booking.findUnique({ where: { id: req.params.id } });
      if (existing) {
        const staffId = (req.body.staffId || existing.staffId) as string;
        const slotStart = update.slotStart ? (update.slotStart as Date) : existing.slotStart;
        const slotEnd = update.slotEnd ? (update.slotEnd as Date) : existing.slotEnd;

        booking = await prisma.$transaction(async (tx) => {
          const conflict = await tx.booking.findFirst({
            where: {
              staffId,
              status: { in: ['Booked', 'ManuallyBooked', 'Blocked'] },
              slotStart: { lt: slotEnd },
              slotEnd: { gt: slotStart },
              id: { not: req.params.id },
            },
          });
          if (conflict) {
            throw new AppError(409, 'This time slot is already booked for the selected staff member.');
          }
          return tx.booking.update({
            where: { id: req.params.id },
            data: update,
            include: { centre: true, staff: true, service: true },
          });
        }, { isolationLevel: 'Serializable' });
      } else {
        throw new AppError(404, 'Booking not found');
      }
    } else {
      booking = await prisma.booking.update({
        where: { id: req.params.id },
        data: update,
        include: { centre: true, staff: true, service: true },
      });
    }
    await logAudit('UPDATE', 'Booking', booking.id, { customerName: booking.customerName, changes: update }, auditContextFromRequest(req));
    res.json(booking);
  } catch (err) {
    next(err);
  }
});

router.patch('/:id', authenticate, requireApproved, validateBody(bookingSchema.partial().merge(statusUpdateSchema)), async (req: AuthenticatedRequest, res, next) => {
  try {
    const userCompanyId = req.user && req.user.role !== 'superadmin' ? req.user.companyId : undefined;
    if (userCompanyId) {
      const existing = await prisma.booking.findUnique({ where: { id: req.params.id }, include: { centre: true } });
      if (!existing) throw new AppError(404, 'Booking not found');
      if (existing.centre.companyId !== userCompanyId) {
        throw new AppError(403, 'Forbidden');
      }
      if (req.body.centreId) {
        const targetCentre = await prisma.centre.findUnique({ where: { id: req.body.centreId } });
        if (!targetCentre || targetCentre.companyId !== userCompanyId) {
          throw new AppError(403, 'Cannot move booking to a centre in another company');
        }
      }
    }

    const update: Record<string, unknown> = { ...req.body };
    if (req.body.slotStart) update.slotStart = new Date(req.body.slotStart);
    if (req.body.slotEnd) update.slotEnd = new Date(req.body.slotEnd);

    const booking = await prisma.booking.update({
      where: { id: req.params.id },
      data: update,
      include: { centre: true, staff: true, service: true },
    });
    await logAudit('PATCH', 'Booking', booking.id, { customerName: booking.customerName, changes: update }, auditContextFromRequest(req));
    res.json(booking);
  } catch (err) {
    next(err);
  }
});

router.delete('/:id', authenticate, requireApproved, async (req: AuthenticatedRequest, res, next) => {
  try {
    const userCompanyId = req.user && req.user.role !== 'superadmin' ? req.user.companyId : undefined;
    if (userCompanyId) {
      const existing = await prisma.booking.findUnique({ where: { id: req.params.id }, include: { centre: true } });
      if (!existing) throw new AppError(404, 'Booking not found');
      if (existing.centre.companyId !== userCompanyId) {
        throw new AppError(403, 'Forbidden');
      }
    }

    await prisma.booking.delete({ where: { id: req.params.id } });
    await logAudit('DELETE', 'Booking', req.params.id, {}, auditContextFromRequest(req));
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

export { router as bookingsRouter };
