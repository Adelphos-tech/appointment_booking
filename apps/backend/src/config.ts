import path from 'path';

import dotenv from 'dotenv';

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const isProduction = process.env.NODE_ENV === 'production';

// In production, fail fast if critical secrets are not explicitly set.
if (isProduction && (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32)) {
  throw new Error('JWT_SECRET must be set to a strong secret of at least 32 characters in production.');
}
if (isProduction && (!process.env.ALLOWED_ORIGINS || process.env.ALLOWED_ORIGINS.includes('*'))) {
  throw new Error('ALLOWED_ORIGINS must be set to explicit domains in production (wildcard "*" is not allowed).');
}

export const config = {
  port: Number(process.env.PORT) || 4000,
  databaseUrl: process.env.DATABASE_URL || '',
  jwtSecret: process.env.JWT_SECRET || 'change-me',
  groqApiKey: process.env.GROQ_API_KEY || '',
  ollamaUrl: process.env.OLLAMA_URL || 'http://127.0.0.1:11434',
  ollamaModel: process.env.OLLAMA_MODEL || 'llama3.1:8b',
  aiProvider: (process.env.AI_PROVIDER || 'groq') as 'groq' | 'ollama',
  notificationProvider: process.env.NOTIFICATION_PROVIDER || 'mock',
  allowedOrigins: process.env.ALLOWED_ORIGINS
    ? process.env.ALLOWED_ORIGINS.split(',').map((s) => s.trim())
    : ['*'],
  twilio: {
    accountSid: process.env.TWILIO_ACCOUNT_SID || '',
    authToken: process.env.TWILIO_AUTH_TOKEN || '',
    phoneNumber: process.env.TWILIO_PHONE_NUMBER || '',
  },
  whatsappVerifyToken: process.env.WHATSAPP_VERIFY_TOKEN || 'slotcare-webhook-verify',
  metaAppSecret: process.env.META_APP_SECRET || '',
  whatsapp: {
    phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID || '',
    accessToken: process.env.WHATSAPP_ACCESS_TOKEN || '',
    businessPhone: process.env.WHATSAPP_BUSINESS_PHONE || '+6590191311',
  },
  smtp: {
    host: process.env.SMTP_HOST || '',
    port: Number(process.env.SMTP_PORT) || 587,
    user: process.env.SMTP_USER || '',
    pass: process.env.SMTP_PASS || '',
    from: process.env.SMTP_FROM || '',
  },
};
