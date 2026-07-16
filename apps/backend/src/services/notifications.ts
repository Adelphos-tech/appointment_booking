import { config } from '../config';

export interface NotificationPayload {
  to: string;
  body: string;
  channel: 'sms' | 'whatsapp' | 'email';
  subject?: string;
}

export async function sendNotification(payload: NotificationPayload): Promise<void> {
  if (payload.channel === 'email') {
    await sendEmail(payload);
    return;
  }

  if (payload.channel === 'whatsapp') {
    await sendWhatsApp(payload.to, payload.body);
    return;
  }

  // SMS via Twilio
  if (config.notificationProvider === 'twilio') {
    const twilio = (await import('twilio')).default;
    const client = twilio(config.twilio.accountSid, config.twilio.authToken);
    const messagingServiceSid = config.twilio.phoneNumber.startsWith('MG')
      ? config.twilio.phoneNumber
      : undefined;
    await client.messages.create({
      body: payload.body,
      from: messagingServiceSid ? undefined : config.twilio.phoneNumber,
      messagingServiceSid,
      to: payload.to,
    });
    return;
  }

  console.log(`[${payload.channel.toUpperCase()} MOCK] to=${payload.to}: ${payload.body}`);
}

async function sendWhatsApp(to: string, body: string): Promise<void> {
  const { phoneNumberId, accessToken } = config.whatsapp;

  if (!phoneNumberId || !accessToken) {
    console.log(`[WHATSAPP MOCK] to=${to}: ${body}`);
    return;
  }

  // Normalize number: strip leading + for Meta API
  const recipient = to.replace(/^\+/, '');

  const url = `https://graph.facebook.com/v19.0/${phoneNumberId}/messages`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: recipient,
      type: 'text',
      text: { preview_url: false, body },
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Meta WhatsApp API error ${res.status}: ${err}`);
  }

  const data = await res.json() as any;
  console.log(`[WHATSAPP] Sent to ${to}, message_id=${data?.messages?.[0]?.id}`);
}

async function sendEmail(payload: NotificationPayload): Promise<void> {
  if (!config.smtp.host || !config.smtp.user || !config.smtp.pass) {
    console.log(`[EMAIL MOCK] to=${payload.to}: ${payload.subject || ''} - ${payload.body}`);
    return;
  }
  const nodemailer = await import('nodemailer');
  const transporter = nodemailer.createTransport({
    host: config.smtp.host,
    port: config.smtp.port,
    secure: config.smtp.port === 465,
    auth: { user: config.smtp.user, pass: config.smtp.pass },
  });
  await transporter.sendMail({
    from: config.smtp.from || config.smtp.user,
    to: payload.to,
    subject: payload.subject || 'Slotcare Notification',
    text: payload.body,
  });
}
