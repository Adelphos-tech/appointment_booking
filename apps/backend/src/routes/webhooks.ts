import crypto from 'crypto';

import { Router } from 'express';

import { config } from '../config';
import { prisma } from '../prisma';
import { agentTools, bookingAssistantSystemPrompt, chatCompletion, sanitizeMessages } from '../services/ai';
import { executeTool } from '../services/agent';
import { sendNotification } from '../services/notifications';

const router = Router();

router.get('/whatsapp', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === config.whatsappVerifyToken) {
    res.status(200).send(challenge);
    return;
  }
  res.sendStatus(403);
});

function verifyMetaSignature(rawBody: string, signature: string): boolean {
  if (!config.metaAppSecret) return false;
  const expected = crypto.createHmac('sha256', config.metaAppSecret).update(rawBody, 'utf8').digest('hex');
  const actual = signature.replace(/^sha256=/, '');
  try {
    return crypto.timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(actual, 'hex'));
  } catch {
    return false;
  }
}

router.post('/whatsapp', async (req, res, next) => {
  try {
    const rawBody = Buffer.isBuffer(req.body) ? req.body.toString('utf8') : JSON.stringify(req.body);
    const signature = req.get('X-Hub-Signature-256') || '';
    if (!verifyMetaSignature(rawBody, signature)) {
      return res.sendStatus(403);
    }

    const body = JSON.parse(rawBody);
    const entry = body?.entry?.[0];
    const change = entry?.changes?.[0];
    const message = change?.value?.messages?.[0];

    if (!message) {
      res.sendStatus(200);
      return;
    }

    const customerContact = message.from;
    const messageBody = message.text?.body || '';

    const optOut = await prisma.optOut.findUnique({ where: { customerContact } });
    if (optOut) {
      res.sendStatus(200);
      return;
    }

    let conversation = await prisma.conversation.findUnique({
      where: { customerContact },
    });

    const rawMessages = Array.isArray(conversation?.messages)
      ? (conversation?.messages as { role: string; content: string; hidden?: boolean; name?: string; tool_call_id?: string }[])
      : [];
    const messages = sanitizeMessages(rawMessages);

    messages.push({ role: 'user', content: messageBody });

    const systemPrompt = `${bookingAssistantSystemPrompt}\nThe customer's contact is ${customerContact}.`;
    let result = await chatCompletion(messages, systemPrompt, agentTools);

    for (let i = 0; i < 5 && result.toolCalls && result.toolCalls.length > 0; i++) {
      messages.push({ role: 'assistant', content: result.content, hidden: true });
      for (const tc of result.toolCalls) {
        const toolResult = await executeTool(tc.name, tc.arguments, { customerContact });
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

    await prisma.conversation.upsert({
      where: { customerContact },
      create: { customerContact, messages: messages as unknown as any[] },
      update: { messages: messages as unknown as any[] },
    });

    await sendNotification({
      to: customerContact,
      channel: 'whatsapp',
      body: reply,
    }).catch((err) => console.error('Failed to send WhatsApp reply', err));

    res.sendStatus(200);
  } catch (err) {
    next(err);
  }
});

router.post('/opt-out', async (req, res, next) => {
  try {
    const customerContact = req.body?.customerContact;
    if (!customerContact) {
      res.status(400).json({ error: 'customerContact is required' });
      return;
    }
    await prisma.optOut.upsert({
      where: { customerContact },
      create: { customerContact },
      update: {},
    });
    res.json({ optedOut: true });
  } catch (err) {
    next(err);
  }
});

export { router as webhooksRouter };
