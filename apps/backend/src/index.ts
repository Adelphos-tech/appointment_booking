import crypto from 'crypto';
import cors from 'cors';
import express from 'express';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import fs from 'fs';
import path from 'path';

import { config } from './config';
import { errorHandler } from './middleware/errorHandler';
import { prisma } from './prisma';
import { logger } from './services/logger';
import { authRouter } from './routes/auth';
import { availabilityRouter } from './routes/availability';
import { bookingsRouter } from './routes/bookings';
import { centresRouter } from './routes/centres';
import { companiesRouter } from './routes/companies';
import { conversationsRouter } from './routes/conversations';
import { servicesRouter } from './routes/services';
import { staffRouter } from './routes/staff';
import { customerRouter } from './routes/customer';
import { usersRouter } from './routes/users';
import { waitlistRouter } from './routes/waitlist';
import { webhooksRouter } from './routes/webhooks';
import { dashboardRouter } from './routes/dashboard';

const app = express();

// Behind nginx reverse proxy — trust the first proxy so X-Forwarded-For
// is handled correctly and express-rate-limit does not crash.
app.set('trust proxy', 1);

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      upgradeInsecureRequests: null,
    },
  },
  hsts: process.env.FORCE_HTTPS === 'true' ? {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true,
  } : false,
}));

if (process.env.NODE_ENV === 'production') {
  if (!config.databaseUrl.includes('sslmode=') && !config.databaseUrl.includes('ssl=')) {
    logger.warn('database.ssl.missing', { message: 'DATABASE_URL does not include SSL parameters. Production database connections should use sslmode=require.' });
  }
  // Only force HTTPS if behind a proxy that sets x-forwarded-proto
  // When serving directly on HTTP (no nginx/SSL), skip the redirect
  if (process.env.FORCE_HTTPS === 'true') {
    app.use((req, res, next) => {
      const isSecure = req.secure || (req.headers['x-forwarded-proto'] as string) === 'https';
      if (isSecure) return next();
      res.redirect(301, `https://${req.headers.host}${req.url}`);
    });
  }
}

// CORS configuration — restrict origins in production
const corsOptions: cors.CorsOptions = config.allowedOrigins.includes('*')
  ? {}
  : { origin: config.allowedOrigins, credentials: true };
app.use(cors(corsOptions));

// Capture raw body for WhatsApp webhook signature verification before JSON parsing
app.use('/api/webhooks/whatsapp', express.raw({ type: 'application/json', limit: '1mb' }));

app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

// Attach request ID to every request for tracing
app.use((req, _res, next) => {
  (req as any).requestId = crypto.randomUUID();
  next();
});

// Simple request logger
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    if (req.path !== '/api/health') {
      logger.info('request', {
        method: req.method,
        path: req.path,
        status: res.statusCode,
        durationMs: duration,
        ip: req.ip,
        requestId: (req as any).requestId,
      });
    }
  });
  next();
});

// Rate limiters
const apiLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later.' },
});

const publicLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later.' },
});

const chatLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many chat messages, please slow down.' },
});

// Health check with DB connectivity test (with timeout)
app.get('/api/health', async (_req, res) => {
  try {
    const healthTimeout = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('DB health check timeout')), 3000),
    );
    await Promise.race([prisma.$queryRaw`SELECT 1`, healthTimeout]);
    res.json({ status: 'ok', db: 'connected', timestamp: new Date().toISOString() });
  } catch {
    res.status(503).json({ status: 'degraded', db: 'disconnected', timestamp: new Date().toISOString() });
  }
});

// Apply rate limiters to API routes
app.use('/api', apiLimiter);
app.use('/api/auth', authRouter);
app.use('/api/centres', centresRouter);
app.use('/api/companies', companiesRouter);
app.use('/api/staff', staffRouter);
app.use('/api/services', servicesRouter);
app.use('/api/bookings', bookingsRouter);
app.use('/api/availability', availabilityRouter);
app.use('/api/users', usersRouter);
app.use('/api/waitlist', waitlistRouter);
app.use('/api/conversations', conversationsRouter);
app.use('/api/webhooks', webhooksRouter);
app.use('/api/dashboard', dashboardRouter);

// Public customer routes with stricter rate limits
app.use('/public', publicLimiter);
app.use('/public/chat', chatLimiter);
app.use('/public', customerRouter);

// Serve frontend static files in production
function resolveStaticPath(): string {
  if (process.env.WEB_DIST_PATH) return path.resolve(process.env.WEB_DIST_PATH);
  const bundled = path.resolve(__dirname, '../frontend');
  if (fs.existsSync(bundled)) return bundled;
  return path.resolve(__dirname, '../../web/dist');
}
const staticPath = resolveStaticPath();
app.use(express.static(staticPath));
app.get('/api/*', (_req, res) => {
  res.status(404).json({ error: 'API endpoint not found' });
});
app.get('*', (_req, res) => {
  res.sendFile(path.join(staticPath, 'index.html'));
});

app.use(errorHandler);

let server: any;
if (process.env.NODE_ENV !== 'test') {
  server = app.listen(config.port, () => {
    logger.info('server.start', { port: config.port });
  });
  server.setTimeout(30000);
  server.keepAliveTimeout = 65000;
  server.headersTimeout = 66000;
}

// Graceful shutdown with Prisma disconnect
async function gracefulShutdown() {
  logger.info('shutdown.start');
  if (server) {
    server.close(async () => {
      await prisma.$disconnect();
      logger.info('shutdown.complete');
      process.exit(0);
    });
  } else {
    await prisma.$disconnect();
    logger.info('shutdown.complete');
    process.exit(0);
  }
  // Force shutdown after 10 seconds if server.close hasn't completed
  const forceExitTimer = setTimeout(() => {
    logger.error('shutdown.force_exit', { reason: 'server.close did not complete in 10s' });
    process.exit(1);
  }, 10000);
  forceExitTimer.unref();
}

process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);

// Safety net: log unexpected errors instead of letting the process die.
process.on('unhandledRejection', (reason) => {
  logger.error('unhandledRejection', { reason: String(reason) });
});
process.on('uncaughtException', (err) => {
  logger.error('uncaughtException', { message: err.message, stack: err.stack });
});

export { app };
