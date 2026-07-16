import { Router } from 'express';
import { startOfDay, endOfDay } from 'date-fns';

import { authenticate, AuthenticatedRequest, requireApproved } from '../middleware/auth';
import { prisma } from '../prisma';

const router = Router();

router.get('/stats', authenticate, requireApproved, async (req: AuthenticatedRequest, res, next) => {
  try {
    const isSuper = req.user?.role === 'superadmin';
    const userCompanyId = !isSuper && req.user ? req.user.companyId : undefined;

    if (!isSuper && !userCompanyId && !req.user?.centreIds.length) {
      return res.json({ counts: { companies: 0, centres: 0, staff: 0, services: 0, bookings: 0, waitlist: 0 }, todayBookings: [] });
    }

    // Fetch company centreIds if user is company-restricted
    let centreIds: string[] = [];
    if (userCompanyId) {
      const companyCentres = await prisma.centre.findMany({
        where: { companyId: userCompanyId },
        select: { id: true },
      });
      centreIds = companyCentres.map((c) => c.id);
    }

    // Construct where clauses
    const companyWhere = userCompanyId ? { id: userCompanyId } : {};
    const centreWhere = userCompanyId ? { companyId: userCompanyId } : {};
    const staffWhere = userCompanyId ? { centreId: { in: centreIds } } : {};
    const serviceWhere = userCompanyId ? { centreId: { in: centreIds } } : {};
    const bookingWhere = userCompanyId ? { centreId: { in: centreIds } } : {};
    const waitlistWhere = userCompanyId ? { centreId: { in: centreIds } } : {};

    const [
      companiesCount,
      centresCount,
      staffCount,
      servicesCount,
      bookingsCount,
      waitlistCount
    ] = await Promise.all([
      prisma.company.count({ where: companyWhere }),
      prisma.centre.count({ where: centreWhere }),
      prisma.staff.count({ where: staffWhere }),
      prisma.service.count({ where: serviceWhere }),
      prisma.booking.count({ where: bookingWhere }),
      prisma.waitlist.count({ where: waitlistWhere }),
    ]);

    // Fetch today's bookings (slotStart is within today)
    const queryDate = req.query.date as string;
    let start: Date;
    let end: Date;

    if (queryDate && /^\d{4}-\d{2}-\d{2}$/.test(queryDate)) {
      start = new Date(`${queryDate}T00:00:00.000Z`);
      end = new Date(`${queryDate}T23:59:59.999Z`);
    } else {
      const now = new Date();
      start = startOfDay(now);
      end = endOfDay(now);
    }

    const todayBookings = await prisma.booking.findMany({
      where: {
        ...bookingWhere,
        slotStart: {
          gte: start,
          lte: end,
        },
        status: { in: ['Booked', 'ManuallyBooked'] },
      },
      include: {
        centre: {
          select: { name: true }
        },
        staff: {
          select: { name: true }
        },
        service: {
          select: { name: true }
        }
      },
      orderBy: {
        slotStart: 'asc'
      }
    });

    res.json({
      counts: {
        companies: companiesCount,
        centres: centresCount,
        staff: staffCount,
        services: servicesCount,
        bookings: bookingsCount,
        waitlist: waitlistCount,
      },
      todayBookings,
    });
  } catch (err) {
    next(err);
  }
});

export { router as dashboardRouter };
