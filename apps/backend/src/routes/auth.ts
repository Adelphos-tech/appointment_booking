import bcrypt from 'bcryptjs';
import { Router } from 'express';
import jwt from 'jsonwebtoken';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';

import { config } from '../config';
import { prisma } from '../prisma';
import { AppError } from '../middleware/errorHandler';
import { authenticate } from '../middleware/auth';
import { validateBody } from '../middleware/validate';
import type { AuthenticatedRequest } from '../middleware/auth';

const router = Router();

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // 10 attempts per window
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many attempts. Please try again in 15 minutes.' },
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string(),
});

function makeToken(user: { id: string; email: string; role: string; status: string; centreIds: string[]; companyId?: string | null }) {
  return jwt.sign(
    { id: user.id, email: user.email, role: user.role, status: user.status, centreIds: user.centreIds, companyId: user.companyId || undefined },
    config.jwtSecret,
    { expiresIn: '7d' },
  );
}

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).regex(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z\d]).+$/, {
    message: 'Password must be at least 8 characters and include uppercase, lowercase, number, and special character',
  }),
  name: z.string().optional(),
});

router.post('/register', authLimiter, validateBody(registerSchema), async (req, res, next) => {
  try {
    const { email, password, name } = req.body;
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      // Return the same generic message to prevent user enumeration
      return res.status(201).json({
        message: 'If this email is not already registered, your registration has been submitted for approval.',
      });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const user = await prisma.user.create({
      data: {
        email,
        password: hashedPassword,
        name,
        role: 'admin',
        status: 'Pending',
      },
    });

    res.status(201).json({
      message: 'Registration submitted. Please wait for superadmin approval before logging in.',
      user: { id: user.id, email: user.email, name: user.name, role: user.role, status: user.status, centreIds: user.centreIds || [], companyId: user.companyId },
    });
  } catch (err) {
    next(err);
  }
});

router.post('/login', authLimiter, validateBody(loginSchema), async (req, res, next) => {
  try {
    const { email, password } = req.body;
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) throw new AppError(401, 'Invalid credentials');

    const valid = await bcrypt.compare(password, user.password);
    if (!valid) throw new AppError(401, 'Invalid credentials');
    if (user.status !== 'Approved') {
      throw new AppError(403, 'Your account is pending approval. Please contact the superadmin.');
    }

    const token = makeToken({ id: user.id, email: user.email, role: user.role, status: user.status, centreIds: user.centreIds || [], companyId: user.companyId });
    res.json({
      user: { id: user.id, email: user.email, name: user.name, role: user.role, status: user.status, centreIds: user.centreIds || [], companyId: user.companyId },
      token,
    });
  } catch (err) {
    next(err);
  }
});

router.get('/me', authenticate, async (req: AuthenticatedRequest, res, next) => {
  try {
    const user = await prisma.user.findUnique({ where: { id: req.user!.id } });
    if (!user) throw new AppError(404, 'User not found');
    const u = user as any;
    res.json({ id: u.id, email: u.email, name: u.name, role: u.role, status: u.status, centreIds: u.centreIds || [], companyId: u.companyId, createdAt: u.createdAt });
  } catch (err) {
    next(err);
  }
});

export { router as authRouter, makeToken };
