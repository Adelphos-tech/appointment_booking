import { addMinutes, format } from 'date-fns';

import { AppError } from '../middleware/errorHandler';
import { prisma } from '../prisma';
import { sendNotification } from './notifications';
import { logger } from './logger';

export interface ToolContext {
  isAuthenticated?: boolean;
  userCompanyId?: string;
  userCentreIds?: string[];
  customerContact?: string;
}

function parseTime(timeStr: string): { hours: number; minutes: number } {
  const [h, m] = timeStr.split(':').map(Number);
  return { hours: h || 0, minutes: m || 0 };
}

function assertAuthenticated(ctx: ToolContext): void {
  if (!ctx.isAuthenticated) {
    throw new AppError(403, 'This action requires an authenticated admin session.');
  }
}

function assertCompanyAccess(ctx: ToolContext): void {
  assertAuthenticated(ctx);
  if (!ctx.userCompanyId && (!ctx.userCentreIds || ctx.userCentreIds.length === 0)) {
    throw new AppError(403, 'This action requires a company assignment.');
  }
}

export async function executeTool(name: string, args: string, ctx: ToolContext = {}): Promise<string> {
  const params = args ? JSON.parse(args) : {};

  if (name === 'listCentres') {
    const where = ctx.userCompanyId
      ? { companyId: ctx.userCompanyId }
      : ctx.userCentreIds?.length
        ? { id: { in: ctx.userCentreIds } }
        : {};
    const centres = await prisma.centre.findMany({
      where,
      select: { id: true, name: true, location: true, serviceType: true, openTime: true, closeTime: true },
    });
    return JSON.stringify({ centres });
  }

  if (name === 'getServices') {
    if (ctx.userCompanyId || ctx.userCentreIds?.length) {
      const centre = await prisma.centre.findUnique({ where: { id: params.centreId }, select: { id: true, companyId: true } });
      if (!centre) return JSON.stringify({ error: 'Centre not found' });
      if (ctx.userCompanyId && centre.companyId !== ctx.userCompanyId) {
        return JSON.stringify({ error: 'Centre not accessible' });
      }
      if (ctx.userCentreIds?.length && !ctx.userCentreIds.includes(centre.id)) {
        return JSON.stringify({ error: 'Centre not accessible' });
      }
    }
    const services = await prisma.service.findMany({
      where: { centreId: params.centreId },
      select: { id: true, name: true, durationOverrideMinutes: true },
    });
    return JSON.stringify({ services });
  }

  if (name === 'getAvailability') {
    const centre = await prisma.centre.findUnique({ where: { id: params.centreId } });
    if (!centre) return JSON.stringify({ error: 'Centre not found' });
    if (ctx.userCompanyId && centre.companyId !== ctx.userCompanyId) {
      return JSON.stringify({ error: 'Centre not accessible' });
    }
    if (ctx.userCentreIds?.length && !ctx.userCentreIds.includes(centre.id)) {
      return JSON.stringify({ error: 'Centre not accessible' });
    }

    const date = params.date;
    const duration = params.serviceId
      ? (await prisma.service.findUnique({ where: { id: params.serviceId } }))?.durationOverrideMinutes || centre.slotDurationMinutes
      : centre.slotDurationMinutes;

    const queryDate = new Date(params.date);
    const staffQuery = await prisma.staff.findMany({
      where: {
        centreId: params.centreId,
        dutyStartDate: { lte: params.date },
        OR: [
          { dutyEndDate: null },
          { dutyEndDate: { gte: params.date } },
        ],
      },
    });
    const dayStart = new Date(`${date}T${centre.openTime}:00.000Z`);
    const dayEnd = new Date(`${date}T${centre.closeTime}:00.000Z`);

    const bookings = await prisma.booking.findMany({
      where: {
        centreId: params.centreId,
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

    const slots: { startISO: string; endISO: string; startTime: string; endTime: string; staffId: string; staffName: string }[] = [];
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
        const slotEnd = addMinutes(cursor, duration);
        const overlaps = ranges.some((r) => cursor < r.end && slotEnd > r.start);
        if (!overlaps) {
          slots.push({
            startISO: cursor.toISOString(),
            endISO: slotEnd.toISOString(),
            startTime: format(cursor, 'h:mm a'),
            endTime: format(slotEnd, 'h:mm a'),
            staffId: staff.id,
            staffName: staff.name,
          });
        }
        cursor = addMinutes(cursor, centre.slotDurationMinutes);
      }
    }

    return JSON.stringify({
      date,
      centreId: params.centreId,
      serviceId: params.serviceId || null,
      slots: slots.sort((a, b) => a.startISO.localeCompare(b.startISO)),
    });
  }

  if (name === 'createBooking') {
    const slotStart = new Date(params.slotStart);
    const slotEnd = new Date(params.slotEnd);
    if (slotStart.getTime() < Date.now()) {
      return JSON.stringify({ error: 'Cannot book a time slot in the past.' });
    }

    const centre = await prisma.centre.findUnique({ where: { id: params.centreId }, include: { company: true } });
    if (!centre) return JSON.stringify({ error: 'Centre not found' });
    if (ctx.userCompanyId && centre.companyId !== ctx.userCompanyId) {
      return JSON.stringify({ error: 'Centre not accessible' });
    }
    if (ctx.userCentreIds?.length && !ctx.userCentreIds.includes(centre.id)) {
      return JSON.stringify({ error: 'Centre not accessible' });
    }

    const [service, staff] = await Promise.all([
      prisma.service.findUnique({ where: { id: params.serviceId } }),
      prisma.staff.findUnique({ where: { id: params.staffId } }),
    ]);
    if (!service || service.centreId !== centre.id) return JSON.stringify({ error: 'Service does not belong to the selected centre' });
    if (!staff || staff.centreId !== centre.id) return JSON.stringify({ error: 'Staff does not belong to the selected centre' });

    const data = {
      customerName: params.customerName.trim(),
      customerContact: params.customerContact.trim(),
      customerEmail: params.customerEmail?.trim() || null,
      centreId: params.centreId,
      staffId: params.staffId,
      serviceId: params.serviceId,
      slotStart,
      slotEnd,
      preferredGender: params.preferredGender || null,
      status: 'Booked' as const,
    };

    const booking = await prisma.$transaction(async (tx) => {
      const conflict = await tx.booking.findFirst({
        where: {
          staffId: data.staffId,
          status: { in: ['Booked', 'ManuallyBooked', 'Blocked'] },
          slotStart: { lt: slotEnd },
          slotEnd: { gt: slotStart },
        },
      });
      if (conflict) {
        throw new AppError(409, 'This time slot is already booked. Please choose a different time.');
      }
      return tx.booking.create({ data, include: { centre: true, staff: true, service: true } });
    }, { isolationLevel: 'Serializable' });

    await sendNotification({
      to: booking.customerContact,
      channel: 'sms',
      body: `Hi ${booking.customerName}, your appointment at ${booking.centre.name} is confirmed for ${booking.slotStart.toLocaleString()}.`,
    }).catch((err) => logger.error('notification.sms.failed', { error: err.message }));

    if (booking.customerEmail) {
      await sendNotification({
        to: booking.customerEmail,
        channel: 'email',
        subject: 'Appointment Confirmation',
        body: `Hi ${booking.customerName},\n\nYour appointment at ${booking.centre.name} is confirmed for ${booking.slotStart.toLocaleString()}.\n\nService: ${booking.service.name}\nStaff: ${booking.staff.name}\n\nThank you,\nSlotcare AI`,
      }).catch((err) => logger.error('notification.email.failed', { error: err.message }));
    }

    return JSON.stringify({
      id: booking.id,
      customerName: booking.customerName,
      centre: booking.centre.name,
      staff: booking.staff.name,
      service: booking.service.name,
      slotStart: booking.slotStart.toISOString(),
      slotEnd: booking.slotEnd.toISOString(),
      status: booking.status,
    });
  }

  if (name === 'getCustomerBookings') {
    const customerContact = params.customerContact?.trim();
    if (!customerContact) return JSON.stringify({ error: 'customerContact is required' });
    const where: any = { customerContact };
    if (ctx.userCompanyId) {
      where.centre = { companyId: ctx.userCompanyId };
    } else if (ctx.userCentreIds?.length) {
      where.centreId = { in: ctx.userCentreIds };
    }
    const bookings = await prisma.booking.findMany({
      where,
      include: { centre: true, staff: true, service: true },
      orderBy: { slotStart: 'desc' },
    });
    return JSON.stringify({
      bookings: bookings.map((b: typeof bookings[0]) => ({
        id: b.id,
        customerName: b.customerName,
        centre: b.centre.name,
        staff: b.staff.name,
        service: b.service.name,
        slotStart: b.slotStart.toISOString(),
        slotEnd: b.slotEnd.toISOString(),
        status: b.status,
      })),
    });
  }

  if (name === 'getBookings') {
    try {
      assertCompanyAccess(ctx);
    } catch (err: any) {
      return JSON.stringify({ error: err.message });
    }
    const where: any = {};
    if (params.centreId) where.centreId = params.centreId;
    if (params.customerContact) where.customerContact = params.customerContact;
    if (params.status) where.status = params.status;
    if (ctx.userCompanyId) {
      where.centre = { companyId: ctx.userCompanyId };
    } else if (ctx.userCentreIds?.length) {
      where.centreId = { in: ctx.userCentreIds };
    }
    const bookings = await prisma.booking.findMany({
      where,
      include: { centre: true, staff: true, service: true },
      orderBy: { slotStart: 'desc' },
      take: Math.min(100, params.limit ? Number(params.limit) : 50),
    });
    return JSON.stringify({
      bookings: bookings.map((b: typeof bookings[0]) => ({
        id: b.id,
        customerName: b.customerName,
        customerContact: b.customerContact,
        centre: b.centre.name,
        staff: b.staff.name,
        service: b.service?.name || null,
        slotStart: b.slotStart.toISOString(),
        slotEnd: b.slotEnd.toISOString(),
        status: b.status,
      })),
    });
  }

  if (name === 'getStaff') {
    try {
      assertCompanyAccess(ctx);
    } catch (err: any) {
      return JSON.stringify({ error: err.message });
    }
    const where: any = {};
    if (params.centreId) where.centreId = params.centreId;
    if (ctx.userCompanyId) {
      where.centre = { companyId: ctx.userCompanyId };
    } else if (ctx.userCentreIds?.length) {
      where.centreId = { in: ctx.userCentreIds };
    }
    const staff = await prisma.staff.findMany({
      where,
      include: { centre: true },
    });
    return JSON.stringify({
      staff: staff.map((s: typeof staff[0]) => ({
        id: s.id,
        name: s.name,
        role: s.role,
        gender: s.gender,
        centre: s.centre.name,
        dutyStartTime: s.dutyStartTime,
        dutyEndTime: s.dutyEndTime,
        dutyStartDate: s.dutyStartDate,
        dutyEndDate: s.dutyEndDate,
        workingDays: s.workingDays,
      })),
    });
  }

  if (name === 'getWaitlist') {
    try {
      assertCompanyAccess(ctx);
    } catch (err: any) {
      return JSON.stringify({ error: err.message });
    }
    const where: any = {};
    if (ctx.userCompanyId) {
      where.centre = { companyId: ctx.userCompanyId };
    } else if (ctx.userCentreIds?.length) {
      where.centreId = { in: ctx.userCentreIds };
    }
    const entries = await prisma.waitlist.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });
    const [centres, services] = await Promise.all([
      prisma.centre.findMany(),
      prisma.service.findMany(),
    ]);
    const centreMap = new Map(centres.map((c) => [c.id, c.name]));
    const serviceMap = new Map(services.map((s) => [s.id, s.name]));
    return JSON.stringify({
      waitlist: entries.map((e: typeof entries[0]) => ({
        id: e.id,
        customerName: e.customerName,
        customerContact: e.customerContact,
        centre: centreMap.get(e.centreId) || e.centreId,
        service: serviceMap.get(e.serviceId) || e.serviceId,
        preferredDate: e.preferredDate,
        preferredGender: e.preferredGender,
        notes: e.notes,
      })),
    });
  }

  if (name === 'createCentre') {
    try {
      assertCompanyAccess(ctx);
    } catch (err: any) {
      return JSON.stringify({ error: err.message });
    }
    const companyId = ctx.userCompanyId || params.companyId;
    if (!companyId) return JSON.stringify({ error: 'companyId is required to create a centre.' });
    const centre = await prisma.centre.create({
      data: {
        name: params.name,
        location: params.location,
        serviceType: params.serviceType || 'General',
        openTime: params.openTime || '09:00',
        closeTime: params.closeTime || '18:00',
        slotDurationMinutes: params.slotDurationMinutes || 30,
        companyId,
      },
    });
    return JSON.stringify({ centre });
  }

  if (name === 'createService') {
    try {
      assertCompanyAccess(ctx);
    } catch (err: any) {
      return JSON.stringify({ error: err.message });
    }
    const centre = await prisma.centre.findUnique({ where: { id: params.centreId }, select: { id: true, companyId: true } });
    if (!centre) return JSON.stringify({ error: 'Centre not found' });
    if (ctx.userCompanyId && centre.companyId !== ctx.userCompanyId) {
      return JSON.stringify({ error: 'Centre not accessible' });
    }
    if (ctx.userCentreIds?.length && !ctx.userCentreIds.includes(centre.id)) {
      return JSON.stringify({ error: 'Centre not accessible' });
    }
    const service = await prisma.service.create({
      data: {
        name: params.name,
        centreId: params.centreId,
        durationOverrideMinutes: params.durationOverrideMinutes || null,
      },
    });
    return JSON.stringify({ service });
  }

  if (name === 'createStaff') {
    try {
      assertCompanyAccess(ctx);
    } catch (err: any) {
      return JSON.stringify({ error: err.message });
    }
    const centre = await prisma.centre.findUnique({ where: { id: params.centreId }, select: { id: true, companyId: true } });
    if (!centre) return JSON.stringify({ error: 'Centre not found' });
    if (ctx.userCompanyId && centre.companyId !== ctx.userCompanyId) {
      return JSON.stringify({ error: 'Centre not accessible' });
    }
    if (ctx.userCentreIds?.length && !ctx.userCentreIds.includes(centre.id)) {
      return JSON.stringify({ error: 'Centre not accessible' });
    }
    const staff = await prisma.staff.create({
      data: {
        name: params.name,
        gender: params.gender || 'Any',
        role: params.role || 'Therapist',
        centreId: params.centreId,
        employmentType: params.employmentType || 'Permanent',
        dutyStartDate: params.dutyStartDate || new Date().toISOString().split('T')[0],
        dutyEndDate: params.dutyEndDate || null,
        dutyStartTime: params.dutyStartTime || '09:00',
        dutyEndTime: params.dutyEndTime || '18:00',
        workingDays: params.workingDays || ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
      },
    });
    return JSON.stringify({ staff });
  }

  if (name === 'createWaitlistEntry') {
    const centre = await prisma.centre.findUnique({ where: { id: params.centreId }, select: { id: true, companyId: true } });
    if (!centre) return JSON.stringify({ error: 'Centre not found' });
    if (ctx.userCompanyId && centre.companyId !== ctx.userCompanyId) {
      return JSON.stringify({ error: 'Centre not accessible' });
    }
    if (ctx.userCentreIds?.length && !ctx.userCentreIds.includes(centre.id)) {
      return JSON.stringify({ error: 'Centre not accessible' });
    }
    const service = await prisma.service.findUnique({ where: { id: params.serviceId }, select: { id: true, centreId: true } });
    if (!service || service.centreId !== centre.id) return JSON.stringify({ error: 'Service does not belong to the selected centre' });
    const entry = await prisma.waitlist.create({
      data: {
        customerName: params.customerName.trim(),
        customerContact: params.customerContact.trim(),
        centreId: params.centreId,
        serviceId: params.serviceId,
        preferredDate: params.preferredDate || '',
        preferredGender: params.preferredGender || null,
        notes: params.notes || null,
      },
    });
    return JSON.stringify({ entry });
  }

  if (name === 'updateBookingStatus') {
    try {
      assertCompanyAccess(ctx);
    } catch (err: any) {
      return JSON.stringify({ error: err.message });
    }
    const booking = await prisma.booking.findUnique({
      where: { id: params.bookingId },
      include: { centre: true },
    });
    if (!booking) return JSON.stringify({ error: 'Booking not found' });
    if (ctx.userCompanyId && booking.centre.companyId !== ctx.userCompanyId) {
      return JSON.stringify({ error: 'Booking not accessible' });
    }
    if (ctx.userCentreIds?.length && !ctx.userCentreIds.includes(booking.centreId)) {
      return JSON.stringify({ error: 'Booking not accessible' });
    }
    const updated = await prisma.booking.update({
      where: { id: params.bookingId },
      data: { status: params.status },
      include: { centre: true, staff: true, service: true },
    });
    return JSON.stringify({
      id: updated.id,
      status: updated.status,
      customerName: updated.customerName,
      centre: updated.centre.name,
      staff: updated.staff.name,
      service: updated.service?.name || null,
      slotStart: updated.slotStart.toISOString(),
    });
  }

  return JSON.stringify({ error: `Unknown tool: ${name}` });
}
