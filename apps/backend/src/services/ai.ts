import Groq from 'groq-sdk';

import { config } from '../config';
import { logger } from './logger';

const groqClient = config.groqApiKey
  ? new Groq({ apiKey: config.groqApiKey })
  : null;

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  hidden?: boolean;
  name?: string;
  tool_call_id?: string;
}

export interface ToolCall {
  id: string;
  name: string;
  arguments: string;
}

export interface ChatCompletionResult {
  content: string;
  toolCalls?: ToolCall[];
}

const MAX_MESSAGES = 40;

export function sanitizeMessages(
  messages: { role: string; content: string; hidden?: boolean; name?: string; tool_call_id?: string }[],
): ChatMessage[] {
  return messages
    .filter((m) => typeof m.content === 'string')
    .map((m) => {
      if (m.role === 'tool' || m.role === 'function') {
        return { role: 'tool', content: m.content, hidden: true, name: m.name || 'unknown', tool_call_id: m.tool_call_id || '' };
      }
      if (m.role !== 'user' && m.role !== 'assistant' && m.role !== 'system') {
        return { role: 'user', content: m.content, hidden: m.hidden };
      }
      return { role: m.role as ChatMessage['role'], content: m.content, hidden: m.hidden, name: m.name, tool_call_id: m.tool_call_id };
    });
}

export function truncateMessages(messages: ChatMessage[]): ChatMessage[] {
  if (messages.length <= MAX_MESSAGES) return messages;
  const systemMessages = messages.filter((m) => m.role === 'system');
  const otherMessages = messages.filter((m) => m.role !== 'system');
  const keepCount = MAX_MESSAGES - systemMessages.length;
  const trimmed = otherMessages.slice(-keepCount);
  return [...systemMessages, ...trimmed];
}

async function groqCompletion(
  messages: ChatMessage[],
  systemPrompt?: string,
  tools?: any[],
): Promise<ChatCompletionResult> {
  if (!groqClient) {
    const lastMessage = messages[messages.length - 1]?.content;
    return {
      content: lastMessage ? `Echo: ${lastMessage}` : 'No input provided.',
    };
  }

  const msgs = truncateMessages(messages);

  const completion = await groqClient.chat.completions.create({
    model: 'llama-3.3-70b-versatile',
    max_tokens: 1024,
    messages: [
      ...(systemPrompt ? [{ role: 'system' as const, content: systemPrompt }] : []),
      ...msgs.map((m) => {
        if (m.role === 'tool') {
          return { role: 'tool' as const, content: m.content, tool_call_id: m.tool_call_id || '' };
        }
        return { role: m.role as 'user' | 'assistant' | 'system', content: m.content };
      }),
    ],
    ...(tools && tools.length > 0 ? { tools, tool_choice: 'auto' } : {}),
  });

  const message = completion.choices[0]?.message;
  const content = message?.content?.trim() || '';

  if (message?.tool_calls && message.tool_calls.length > 0) {
    return {
      content,
      toolCalls: message.tool_calls.map((tc: any) => ({
        id: tc.id,
        name: tc.function?.name || '',
        arguments: tc.function?.arguments || '{}',
      })),
    };
  }

  return { content };
}

async function ollamaCompletion(
  messages: ChatMessage[],
  systemPrompt?: string,
  tools?: any[],
): Promise<ChatCompletionResult> {
  const msgs = truncateMessages(messages);
  const body = {
    model: config.ollamaModel,
    stream: false,
    messages: [
      ...(systemPrompt ? [{ role: 'system' as const, content: systemPrompt }] : []),
      ...msgs.map((m) => {
        if (m.role === 'tool') {
          return { role: 'tool' as const, content: m.content };
        }
        return { role: m.role as 'user' | 'assistant' | 'system', content: m.content };
      }),
    ],
    ...(tools && tools.length > 0 ? { tools } : {}),
  };

  const res = await fetch(`${config.ollamaUrl}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Ollama error ${res.status}: ${text}`);
  }

  const data = (await res.json()) as {
    message?: {
      role?: string;
      content?: string;
      tool_calls?: { id?: string; function?: { name?: string; arguments?: string | Record<string, unknown> } }[];
    };
  };
  const message = data.message;
  const content = (message?.content || '').trim();

  if (message?.tool_calls && message.tool_calls.length > 0) {
    return {
      content,
      toolCalls: message.tool_calls.map((tc: any, idx: number) => ({
        id: tc.id || `tool-${idx}`,
        name: tc.function?.name || '',
        arguments: typeof tc.function?.arguments === 'string'
          ? tc.function.arguments
          : JSON.stringify(tc.function?.arguments || {}),
      })),
    };
  }

  return { content };
}

export async function chatCompletion(
  messages: ChatMessage[],
  systemPrompt?: string,
  tools?: any[],
): Promise<ChatCompletionResult> {
  if (config.aiProvider === 'groq') {
    try {
      return await groqCompletion(messages, systemPrompt, tools);
    } catch (err) {
      logger.warn('groq.fallback', { error: (err as Error).message });
      try {
        return await ollamaCompletion(messages, systemPrompt, tools);
      } catch (ollamaErr) {
        logger.error('ai.all.providers.failed', { groq: (err as Error).message, ollama: (ollamaErr as Error).message });
        return { content: 'I apologize, I am unable to process your request right now. Please try again later.' };
      }
    }
  }
  try {
    return await ollamaCompletion(messages, systemPrompt, tools);
  } catch (ollamaErr) {
    logger.error('ai.ollama.failed', { error: (ollamaErr as Error).message });
    return { content: 'I apologize, I am unable to process your request right now. Please try again later.' };
  }
}

export const agentTools = [
  {
    type: 'function',
    function: {
      name: 'listCentres',
      description: 'List all centres/branches',
      parameters: { type: 'object', properties: {}, required: [] },
    },
  },
  {
    type: 'function',
    function: {
      name: 'getServices',
      description: 'Get services at a centre',
      parameters: {
        type: 'object',
        properties: { centreId: { type: 'string', description: 'Centre UUID' } },
        required: ['centreId'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'getAvailability',
      description: 'Get available slots for a date',
      parameters: {
        type: 'object',
        properties: {
          centreId: { type: 'string', description: 'Centre UUID' },
          date: { type: 'string', description: 'Date in YYYY-MM-DD format' },
          serviceId: { type: 'string', description: 'Optional service UUID' },
        },
        required: ['centreId', 'date'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'createBooking',
      description: 'Create a new booking',
      parameters: {
        type: 'object',
        properties: {
          customerName: { type: 'string' },
          customerContact: { type: 'string' },
          customerEmail: { type: 'string' },
          centreId: { type: 'string' },
          staffId: { type: 'string' },
          serviceId: { type: 'string' },
          slotStart: { type: 'string', description: 'ISO datetime string' },
          slotEnd: { type: 'string', description: 'ISO datetime string' },
          preferredGender: { type: 'string' },
        },
        required: ['customerName', 'customerContact', 'centreId', 'staffId', 'serviceId', 'slotStart', 'slotEnd'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'getCustomerBookings',
      description: 'Get bookings for a customer by contact',
      parameters: {
        type: 'object',
        properties: { customerContact: { type: 'string' } },
        required: ['customerContact'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'getBookings',
      description: 'Get bookings with optional filters',
      parameters: {
        type: 'object',
        properties: {
          centreId: { type: 'string' },
          customerContact: { type: 'string' },
          status: { type: 'string' },
          limit: { type: 'number' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'updateBookingStatus',
      description: 'Update a booking status',
      parameters: {
        type: 'object',
        properties: {
          bookingId: { type: 'string' },
          status: { type: 'string', enum: ['Available', 'Booked', 'ManuallyBooked', 'Cancelled', 'Blocked', 'Completed', 'NoShow'] },
        },
        required: ['bookingId', 'status'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'getStaff',
      description: 'Get staff members',
      parameters: {
        type: 'object',
        properties: { centreId: { type: 'string' } },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'createStaff',
      description: 'Create a staff member',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          centreId: { type: 'string' },
          gender: { type: 'string' },
          role: { type: 'string' },
          dutyDate: { type: 'string' },
          dutyStartTime: { type: 'string' },
          dutyEndTime: { type: 'string' },
        },
        required: ['name', 'centreId'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'createCentre',
      description: 'Create a new centre',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          location: { type: 'string' },
          serviceType: { type: 'string' },
          openTime: { type: 'string' },
          closeTime: { type: 'string' },
          slotDurationMinutes: { type: 'number' },
        },
        required: ['name', 'location'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'createService',
      description: 'Create a new service',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          centreId: { type: 'string' },
          durationOverrideMinutes: { type: 'number' },
        },
        required: ['name', 'centreId'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'getWaitlist',
      description: 'Get waitlist entries',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'createWaitlistEntry',
      description: 'Add a waitlist entry',
      parameters: {
        type: 'object',
        properties: {
          customerName: { type: 'string' },
          customerContact: { type: 'string' },
          centreId: { type: 'string' },
          serviceId: { type: 'string' },
          preferredDate: { type: 'string' },
          preferredGender: { type: 'string' },
          notes: { type: 'string' },
        },
        required: ['customerName', 'customerContact', 'centreId', 'serviceId', 'preferredDate'],
      },
    },
  },
];

export const bookingAssistantSystemPrompt = `
You are Slotcare, a warm and helpful AI appointment booking assistant for customers.
Your goal is to make booking an appointment effortless. You can only use the safe, customer-facing tools listed below. You cannot create or modify centres, staff, services, or waitlist entries, and you cannot view other customers' bookings.

When you need to use a tool, the system will automatically call it for you and return the result.
After receiving tool results, summarize the information in plain English for the customer. Never repeat raw JSON.

Available tools:
- listCentres(): returns centres/branches with id, name, location, openTime, closeTime.
- getServices(params: { centreId }): returns services offered at a centre.
- getAvailability(params: { centreId, date, serviceId? }): returns available slots for a date. Each slot has startISO, endISO, startTime, endTime, staffId, staffName.
- createBooking(params: { customerName, customerContact, customerEmail?, centreId, staffId, serviceId, slotStart, slotEnd, preferredGender? }): creates a booking. Use slot.startISO and slot.endISO for slotStart and slotEnd.
- getCustomerBookings(params: { customerContact }): returns existing bookings for the same customer contact.

How to be helpful:
1. Greet the customer warmly and let them know you can help them find and book appointments.
2. If they mention a centre or branch by name, use listCentres to find the right one.
3. Suggest the next available dates and best-matching services based on what they need.
4. Always check live availability with getAvailability before offering a slot.
5. Present 2–3 suitable slots in a clear, friendly way using 12-hour time format.
6. When the customer picks a slot, confirm the details and then use createBooking to finalize it.
7. Always collect the customer's real name and real contact before creating a booking. Do NOT invent names, emails, or phone numbers.
8. For existing appointments, use getCustomerBookings to look them up.
9. If a tool returns an error, apologize briefly, explain the issue in plain English, and ask for the missing detail.
10. End confirmed bookings with a short, friendly summary: who, where, when, and what.

Tone: friendly, efficient, and reassuring. Make the customer feel like you are actively handling their booking.
`;

export const adminAssistantSystemPrompt = `
You are Slotcare Admin AI, a smart assistant for clinic administrators.
You help run the business by managing centres, staff, services, bookings, and the waitlist using your tools.

When you need to use a tool, the system will automatically call it for you and return the result.
After receiving tool results, summarize the information in plain English for the admin. Never repeat raw JSON.

Available tools:
- listCentres(): returns all centres.
- getServices(params: { centreId }): returns services at a centre.
- getAvailability(params: { centreId, date, serviceId? }): returns available slots for a date.
- createBooking(params: { customerName, customerContact, customerEmail?, centreId, staffId, serviceId, slotStart, slotEnd, preferredGender? }): creates a booking.
- getCustomerBookings(params: { customerContact }): returns bookings for a customer.
- getBookings(params: { centreId?, customerContact?, status?, limit? }): returns bookings.
- updateBookingStatus(params: { bookingId, status }): updates a booking status.
- getStaff(params: { centreId? }): returns staff members.
- createStaff(params: { name, centreId, gender?, role?, dutyDate?, dutyStartTime?, dutyEndTime? }): creates a staff member.
- createCentre(params: { name, location, serviceType?, openTime?, closeTime?, slotDurationMinutes? }): creates a centre.
- createService(params: { name, centreId, durationOverrideMinutes? }): creates a service.
- getWaitlist(): returns waitlist entries.
- createWaitlistEntry(params: { customerName, customerContact, centreId, serviceId, preferredDate, preferredGender?, notes? }): adds a waitlist entry.

How to be helpful:
1. Be proactive: when an admin asks for something, use the right tool right away instead of just describing what you could do.
2. If they mention a centre by name, use listCentres first to get the ID.
3. When showing data, give a clear summary and highlight anything important (e.g., today's bookings, upcoming no-shows, full waitlist).
4. For booking changes, confirm the action before calling updateBookingStatus.
5. Before creating anything, ask for the required details. Do NOT invent IDs, names, emails, or phone numbers.
6. If a tool returns an error, explain the issue briefly, suggest the likely fix, and ask for the missing detail.
7. Offer next steps after completing an action (e.g., "Would you like me to check today's schedule next?").

Tone: concise, professional, and action-oriented. Make the admin feel like you are handling tasks for them, not just answering questions.
`;
