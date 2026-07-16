import { Router } from 'express';
import { z } from 'zod';

import { AppError } from '../middleware/errorHandler';
import { validateBody, validateQuery } from '../middleware/validate';
import { prisma } from '../prisma';
import { agentTools, bookingAssistantSystemPrompt, chatCompletion, sanitizeMessages } from '../services/ai';
import { executeTool, type ToolContext } from '../services/agent';
import { sendNotification } from '../services/notifications';
import { stripHtmlTags } from '../services/sanitize';

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
  website: z.string().optional(), // Honeypot field
});

const availabilityQuerySchema = z.object({
  centreId: z.string().uuid(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  serviceId: z.string().uuid().optional(),
  preferredGender: z.string().optional(),
});

router.get('/companies', async (_req, res, next) => {
  try {
    const companies = await prisma.company.findMany({
      select: { id: true, name: true, slug: true, description: true, logo: true },
      orderBy: { createdAt: 'desc' },
    });
    res.json(companies);
  } catch (err) {
    next(err);
  }
});

router.get('/company-by-slug/:slug', async (req, res, next) => {
  try {
    const company = await prisma.company.findUnique({
      where: { slug: req.params.slug },
      select: { id: true, name: true, slug: true, description: true, logo: true },
    });
    if (!company) throw new AppError(404, 'Company not found');
    res.json(company);
  } catch (err) {
    next(err);
  }
});

router.get('/centres', async (req, res, next) => {
  try {
    const companyId = req.query.companyId as string | undefined;
    const centres = await prisma.centre.findMany({
      where: companyId ? { companyId } : undefined,
      select: {
        id: true,
        name: true,
        location: true,
        serviceType: true,
        openTime: true,
        closeTime: true,
        slotDurationMinutes: true,
        workingDays: true,
        holidays: true,
        companyId: true,
      },
    });
    res.json(centres);
  } catch (err) {
    next(err);
  }
});

router.get('/services/:centreId', async (req, res, next) => {
  try {
    const services = await prisma.service.findMany({
      where: { centreId: req.params.centreId },
      select: { id: true, name: true, durationOverrideMinutes: true, price: true },
    });
    res.json(services);
  } catch (err) {
    next(err);
  }
});

router.get('/staff/:centreId', async (req, res, next) => {
  try {
    const staff = await prisma.staff.findMany({
      where: { centreId: req.params.centreId },
      select: { id: true, name: true, gender: true, role: true, servicesAllowed: true },
    });
    res.json(staff);
  } catch (err) {
    next(err);
  }
});

router.get('/availability', validateQuery(availabilityQuerySchema), async (req, res, next) => {
  try {
    const { centreId, date, serviceId, preferredGender } = req.query as { centreId: string; date: string; serviceId?: string; preferredGender?: string };

    const centre = await prisma.centre.findUnique({ where: { id: centreId } });
    if (!centre) throw new AppError(404, 'Centre not found');

    const requestedDate = new Date(`${date}T00:00:00.000Z`);
    const dayMap = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const dayName = dayMap[requestedDate.getUTCDay()];

    const duration = serviceId
      ? (await prisma.service.findUnique({ where: { id: serviceId } }))?.durationOverrideMinutes || centre.slotDurationMinutes
      : centre.slotDurationMinutes;

    const normalizedGender = preferredGender?.toLowerCase().trim();
    const staffQuery = await prisma.staff.findMany({
      where: {
        centreId,
        dutyStartDate: { lte: date },
        OR: [
          { dutyEndDate: null },
          { dutyEndDate: { gte: date } },
        ],
        ...(normalizedGender && normalizedGender !== 'any'
          ? {
              gender: {
                in: normalizedGender === 'female' ? ['Female', 'Feemale'] : [preferredGender || 'Male'],
                mode: 'insensitive',
              },
            }
          : {}),
      },
    });

    // Filter staff query by working days (or single day scheduling)
    const activeStaff = staffQuery.filter((s) => {
      const isSingleDayDuty = s.dutyStartDate === s.dutyEndDate;
      return isSingleDayDuty || s.workingDays.includes(dayName);
    });

    const dayStart = new Date(`${date}T${centre.openTime}:00.000Z`);
    const dayEnd = new Date(`${date}T${centre.closeTime}:00.000Z`);

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

    const slots: { start: Date; end: Date; staffId: string; staffName: string; staffGender: string; status: 'open' | 'booked' }[] = [];
    for (const staff of activeStaff) {
      const staffStart = new Date(`${date}T${staff.dutyStartTime}:00.000Z`);
      const staffEnd = new Date(`${date}T${staff.dutyEndTime}:00.000Z`);
      const start = staffStart < dayStart ? dayStart : staffStart;
      const end = staffEnd > dayEnd ? dayEnd : staffEnd;
      const ranges = bookedRanges.get(staff.id) || [];

      let cursor = start;
      while (cursor.getTime() + duration * 60000 <= end.getTime()) {
        if (cursor.getTime() < Date.now()) {
          cursor = new Date(cursor.getTime() + centre.slotDurationMinutes * 60000);
          continue;
        }
        const slotEnd = new Date(cursor.getTime() + duration * 60000);
        const overlaps = ranges.some((r) => cursor < r.end && slotEnd > r.start);
        slots.push({ start: cursor, end: slotEnd, staffId: staff.id, staffName: staff.name, staffGender: staff.gender, status: overlaps ? 'booked' : 'open' });
        cursor = new Date(cursor.getTime() + centre.slotDurationMinutes * 60000);
      }
    }

    res.json({
      date,
      centreId,
      serviceId: serviceId || null,
      slots: slots.sort((a, b) => a.start.getTime() - b.start.getTime()),
    });
  } catch (err) {
    next(err);
  }
});

router.post('/bookings', validateBody(bookingSchema), async (req, res, next) => {
  try {
    const slotStart = new Date(req.body.slotStart);
    const slotEnd = new Date(req.body.slotEnd);

    // Block booking in the past
    if (slotStart.getTime() < Date.now()) {
      throw new AppError(400, 'Cannot book a time slot in the past.');
    }

    // Honeypot bot protection
    if (req.body.website) {
      throw new AppError(400, 'Bot detected.');
    }

    // Validate service belongs to the selected centre
    const service = await prisma.service.findUnique({ where: { id: req.body.serviceId } });
    if (!service) throw new AppError(404, 'Service not found');
    if (service.centreId !== req.body.centreId) {
      throw new AppError(400, 'The selected service does not belong to this centre.');
    }

    // Validate staff belongs to the selected centre
    const staff = await prisma.staff.findUnique({ where: { id: req.body.staffId } });
    if (!staff) throw new AppError(404, 'Staff not found');
    if (staff.centreId !== req.body.centreId) {
      throw new AppError(400, 'The selected staff does not belong to this centre.');
    }

    // Generate a short human-readable booking reference
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let bookingRef = 'SLC-';
    for (let i = 0; i < 6; i++) bookingRef += chars[Math.floor(Math.random() * chars.length)];

    // Use a transaction with row-level locking to prevent double-booking race conditions
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
        throw new AppError(409, 'This time slot is already booked. Please choose a different time.');
      }

      return tx.booking.create({
        data: {
          bookingRef,
          customerName: req.body.customerName.trim(),
          customerContact: req.body.customerContact.trim(),
          customerEmail: req.body.customerEmail?.trim() || undefined,
          centreId: req.body.centreId,
          staffId: req.body.staffId,
          serviceId: req.body.serviceId,
          slotStart,
          slotEnd,
          preferredGender: req.body.preferredGender || undefined,
          status: 'Booked',
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
    }).catch((err) => console.error('Failed to send notification', err));

    if (booking.customerEmail) {
      await sendNotification({
        to: booking.customerEmail,
        channel: 'email',
        subject: 'Appointment Confirmation',
        body: `Hi ${booking.customerName},\n\nYour appointment at ${booking.centre.name} is confirmed for ${booking.slotStart.toLocaleString()}.\n\nService: ${booking.service.name}\nStaff: ${booking.staff.name}\nBooking Ref: ${booking.bookingRef}\n\nThank you,\nSlotcare AI`,
      }).catch((err) => console.error('Failed to send email', err));
    }

    res.status(201).json(booking);
  } catch (err) {
    next(err);
  }
});

const chatBodySchema = z.object({
  customerContact: z.string().min(1).transform((s) => stripHtmlTags(s.trim())),
  message: z.string().min(1).transform((s) => stripHtmlTags(s.trim())),
  customerName: z.string().optional().transform((s) => (s ? stripHtmlTags(s.trim()) : s)),
});

router.get('/bookings', async (req, res, next) => {
  try {
    const customerContact = req.query.customerContact as string | undefined;
    if (!customerContact || typeof customerContact !== 'string' || customerContact.trim().length < 3) {
      return res.status(400).json({ error: 'customerContact is required' });
    }
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 50));
    const bookings = await prisma.booking.findMany({
      where: { customerContact: customerContact.trim() },
      include: { centre: true, staff: true, service: true },
      orderBy: { slotStart: 'desc' },
      take: limit,
    });
    res.json({ bookings });
  } catch (err) {
    next(err);
  }
});

router.post('/chat', validateBody(chatBodySchema), async (req, res, next) => {
  try {
    const { customerContact, message, customerName } = req.body;

    let conversation = await prisma.conversation.findUnique({
      where: { customerContact },
    });

    const rawMessages = Array.isArray(conversation?.messages)
      ? (conversation?.messages as { role: string; content: string; hidden?: boolean; name?: string; tool_call_id?: string }[])
      : [];
    const messages = sanitizeMessages(rawMessages);

    const userContext = customerName ? `The customer's name is ${customerName}.` : '';
    const systemPrompt = `${bookingAssistantSystemPrompt}\n${userContext}\nThe customer's contact is ${customerContact}.`;

    messages.push({ role: 'user', content: message });

    const toolContext: ToolContext = { customerContact };
    let result = await chatCompletion(messages, systemPrompt, agentTools);

    for (let i = 0; i < 5 && result.toolCalls && result.toolCalls.length > 0; i++) {
      messages.push({ role: 'assistant', content: result.content, hidden: true });
      for (const tc of result.toolCalls) {
        const toolResult = await executeTool(tc.name, tc.arguments, toolContext);
        messages.push({
          role: 'tool',
          content: toolResult,
          hidden: true,
          name: tc.name,
          tool_call_id: tc.id,
        });
      }
      result = await chatCompletion(messages, systemPrompt, agentTools);
    }

    const finalReply = result.content || 'I could not process that.';
    messages.push({ role: 'assistant', content: finalReply });

    const visibleMessages = messages.filter((m) => !m.hidden);

    await prisma.conversation.upsert({
      where: { customerContact },
      create: { customerContact, messages: messages as unknown as any[] },
      update: { messages: messages as unknown as any[] },
    });

    res.json({ reply: finalReply, messages: visibleMessages });
  } catch (err) {
    next(err);
  }
});

// Customer cancellation by bookingRef + contact number
router.post('/bookings/:bookingRef/cancel', async (req, res, next) => {
  try {
    const { bookingRef } = req.params;
    const { customerContact } = req.body;
    if (!customerContact) throw new AppError(400, 'customerContact is required');

    const booking = await prisma.booking.findUnique({ where: { bookingRef } });
    if (!booking) throw new AppError(404, 'Booking not found');
    if (booking.customerContact !== customerContact.trim()) {
      throw new AppError(403, 'Contact number does not match this booking.');
    }
    if (booking.status === 'Cancelled') {
      throw new AppError(400, 'This booking is already cancelled.');
    }
    if (booking.status === 'Completed') {
      throw new AppError(400, 'Cannot cancel a completed booking.');
    }

    // Only allow cancellation at least 1 hour before slot time
    if (booking.slotStart.getTime() - Date.now() < 60 * 60 * 1000) {
      throw new AppError(400, 'Cancellations must be made at least 1 hour before the appointment.');
    }

    const updated = await prisma.booking.update({
      where: { bookingRef },
      data: { status: 'Cancelled' },
      include: { centre: true, staff: true, service: true },
    });

    await sendNotification({
      to: updated.customerContact,
      channel: 'sms',
      body: `Hi ${updated.customerName}, your booking (Ref: ${updated.bookingRef}) at ${updated.centre.name} has been cancelled.`,
    }).catch((err) => console.error('Failed to send cancellation notification', err));

    res.json({ message: 'Booking cancelled successfully', booking: updated });
  } catch (err) {
    next(err);
  }
});

export { router as customerRouter };
