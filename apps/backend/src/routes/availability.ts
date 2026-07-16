import { Router } from 'express';
import { z } from 'zod';

import { authenticate, requireApproved } from '../middleware/auth';
import { AppError } from '../middleware/errorHandler';
import { validateQuery } from '../middleware/validate';
import { prisma } from '../prisma';

const router = Router();

const querySchema = z.object({
  centreId: z.string().uuid(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  staffId: z.string().uuid().optional(),
  serviceId: z.string().uuid().optional(),
  preferredGender: z.string().optional(),
});

const dayMap = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function parseTime(timeStr: string): { hours: number; minutes: number } {
  const [h, m] = timeStr.split(':').map(Number);
  return { hours: h || 0, minutes: m || 0 };
}

function addMinutes(date: Date, minutes: number): Date {
  return new Date(date.getTime() + minutes * 60000);
}

router.get('/', authenticate, requireApproved, validateQuery(querySchema), async (req, res, next) => {
  try {
    const { centreId, date, staffId, serviceId, preferredGender } = req.query as {
      centreId: string;
      date: string;
      staffId?: string;
      serviceId?: string;
      preferredGender?: string;
    };

    const centre = await prisma.centre.findUnique({ where: { id: centreId } });
    if (!centre) throw new AppError(404, 'Centre not found');

    const requestedDate = new Date(`${date}T00:00:00.000Z`);
    const dayName = dayMap[requestedDate.getUTCDay()];
    if (!centre.workingDays.includes(dayName) || centre.holidays.includes(date)) {
      return res.json({ date, centreId, slots: [] });
    }

    const duration = serviceId
      ? (await prisma.service.findUnique({ where: { id: serviceId } }))?.durationOverrideMinutes || centre.slotDurationMinutes
      : centre.slotDurationMinutes;

    let staffQuery = await prisma.staff.findMany({
      where: {
        centreId,
        dutyStartDate: { lte: date },
        OR: [
          { dutyEndDate: null },
          { dutyEndDate: { gte: date } },
        ],
        ...(staffId ? { id: staffId } : {}),
        ...(preferredGender && preferredGender !== 'Any' ? { gender: { equals: preferredGender, mode: 'insensitive' } } : {}),
      },
    });

    // Filter staff query by working days (or single day scheduling)
    staffQuery = staffQuery.filter((s) => {
      const isSingleDayDuty = s.dutyStartDate === s.dutyEndDate;
      return isSingleDayDuty || s.workingDays.includes(dayName);
    });

    const { openTime, closeTime } = centre;
    const { hours: openH, minutes: openM } = parseTime(openTime);
    const { hours: closeH, minutes: closeM } = parseTime(closeTime);

    const dayStart = new Date(`${date}T${String(openH).padStart(2, '0')}:${String(openM).padStart(2, '0')}:00.000Z`);
    const dayEnd = new Date(`${date}T${String(closeH).padStart(2, '0')}:${String(closeM).padStart(2, '0')}:00.000Z`);

    const bookings = await prisma.booking.findMany({
      where: {
        centreId,
        status: { in: ['Booked', 'ManuallyBooked', 'Blocked'] },
        slotStart: { gte: dayStart, lt: dayEnd },
      },
    });

    const bookedRanges = new Map<string, { start: Date; end: Date }[]>();
    for (const b of bookings) {
      const list = bookedRanges.get(b.staffId) || [];
      const blockedStart = new Date(b.slotStart.getTime() - centre.prepTimeBeforeMinutes * 60000);
      const blockedEnd = new Date(b.slotEnd.getTime() + centre.prepTimeAfterMinutes * 60000);
      list.push({ start: blockedStart, end: blockedEnd });
      bookedRanges.set(b.staffId, list);
    }

    const slots: { start: Date; end: Date; staffId: string; staffName: string; staffGender: string }[] = [];

    for (const staff of staffQuery) {
      const { hours: dutyStartH, minutes: dutyStartM } = parseTime(staff.dutyStartTime);
      const { hours: dutyEndH, minutes: dutyEndM } = parseTime(staff.dutyEndTime);
      const staffStart = new Date(`${date}T${String(dutyStartH).padStart(2, '0')}:${String(dutyStartM).padStart(2, '0')}:00.000Z`);
      const staffEnd = new Date(`${date}T${String(dutyEndH).padStart(2, '0')}:${String(dutyEndM).padStart(2, '0')}:00.000Z`);

      const start = staffStart < dayStart ? dayStart : staffStart;
      const end = staffEnd > dayEnd ? dayEnd : staffEnd;
      const ranges = bookedRanges.get(staff.id) || [];

      let cursor = start;
      while (cursor.getTime() + duration * 60000 <= end.getTime()) {
        if (cursor.getTime() < Date.now()) {
          cursor = addMinutes(cursor, centre.slotDurationMinutes);
          continue;
        }
        const slotEnd = addMinutes(cursor, duration);
        const overlaps = ranges.some(
          (r) => cursor < r.end && slotEnd > r.start,
        );
        if (!overlaps) {
          slots.push({ start: cursor, end: slotEnd, staffId: staff.id, staffName: staff.name, staffGender: staff.gender });
        }
        cursor = addMinutes(cursor, centre.slotDurationMinutes);
      }
    }

    res.json({
      date,
      centreId,
      serviceId: serviceId || null,
      slots: slots
        .sort((a, b) => a.start.getTime() - b.start.getTime())
        .map((s) => ({ ...s, start: s.start.toISOString(), end: s.end.toISOString() })),
    });
  } catch (err) {
    next(err);
  }
});

export { router as availabilityRouter };
