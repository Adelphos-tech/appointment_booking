import { Router } from 'express';
import { z } from 'zod';

import { authenticate, requireApproved, type AuthenticatedRequest } from '../middleware/auth';
import { AppError } from '../middleware/errorHandler';
import { validateBody } from '../middleware/validate';
import { prisma } from '../prisma';
import { adminAssistantSystemPrompt, agentTools, chatCompletion, sanitizeMessages } from '../services/ai';
import { executeTool, type ToolContext } from '../services/agent';

const router = Router();

const messageSchema = z.object({
  customerContact: z.string().min(1),
  message: z.string().min(1),
});

router.get('/', authenticate, requireApproved, async (req: AuthenticatedRequest, res, next) => {
  try {
    const isSuper = req.user?.role === 'superadmin';
    const userCompanyId = !isSuper ? req.user?.companyId : undefined;
    const where: any = {};
    if (userCompanyId) {
      where.centre = { companyId: userCompanyId };
    } else if (!isSuper && req.user?.centreIds.length) {
      where.centreId = { in: req.user.centreIds };
    }
    const conversations = await prisma.conversation.findMany({
      where,
      orderBy: { updatedAt: 'desc' },
    });
    res.json(conversations);
  } catch (err) {
    next(err);
  }
});

router.get('/:customerContact', authenticate, requireApproved, async (req: AuthenticatedRequest, res, next) => {
  try {
    const isSuper = req.user?.role === 'superadmin';
    const conversation = await prisma.conversation.findUnique({
      where: { customerContact: req.params.customerContact },
    });
    if (!conversation) throw new AppError(404, 'Conversation not found');
    // Conversations don't store companyId; for now allow superadmin or same-company check via bookings
    if (!isSuper) {
      const hasBooking = await prisma.booking.findFirst({
        where: {
          customerContact: req.params.customerContact,
          ...(req.user?.companyId ? { centre: { companyId: req.user.companyId } } : {}),
        },
      });
      if (!hasBooking) throw new AppError(403, 'Forbidden');
    }
    res.json(conversation);
  } catch (err) {
    next(err);
  }
});

router.post('/message', authenticate, requireApproved, validateBody(messageSchema), async (req: AuthenticatedRequest, res, next) => {
  try {
    const { customerContact, message } = req.body;

    let conversation = await prisma.conversation.findUnique({
      where: { customerContact },
    });

    const rawMessages = Array.isArray(conversation?.messages)
      ? (conversation?.messages as { role: string; content: string; hidden?: boolean; name?: string; tool_call_id?: string }[])
      : [];

    const messages = sanitizeMessages(rawMessages);
    messages.push({ role: 'user', content: message });

    const systemPrompt = `${adminAssistantSystemPrompt}\nThe customer contact for this conversation is ${customerContact}.`;

    const toolContext: ToolContext = {
      isAuthenticated: true,
      userCompanyId: req.user?.role !== 'superadmin' ? req.user?.companyId : undefined,
      userCentreIds: req.user?.role !== 'superadmin' ? req.user?.centreIds : undefined,
    };
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

    const reply = result.content || 'I could not process that.';
    messages.push({ role: 'assistant', content: reply });

    const visibleMessages = messages.filter((m) => !m.hidden);

    conversation = await prisma.conversation.upsert({
      where: { customerContact },
      create: { customerContact, messages: messages as unknown as any[] },
      update: { messages: messages as unknown as any[] },
    });

    res.json({ conversation: { ...conversation, messages: visibleMessages }, reply });
  } catch (err) {
    next(err);
  }
});

export { router as conversationsRouter };
