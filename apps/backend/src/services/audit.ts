import { prisma } from '../prisma';

export interface AuditContext {
  userId?: string;
  userEmail?: string;
  companyId?: string;
  ipAddress?: string;
  userAgent?: string;
}

export async function logAudit(
  action: string,
  entityType: string,
  entityId?: string,
  metadata?: Record<string, any>,
  ctx?: AuditContext,
): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        action,
        entityType,
        entityId,
        companyId: ctx?.companyId,
        userId: ctx?.userId,
        userEmail: ctx?.userEmail,
        metadata: metadata || {},
        ipAddress: ctx?.ipAddress,
        userAgent: ctx?.userAgent,
      },
    });
  } catch (err) {
    // Audit logging should never break the main request
    console.error('Failed to write audit log:', err);
  }
}

export function auditContextFromRequest(req: any): AuditContext {
  return {
    userId: req.user?.id,
    userEmail: req.user?.email,
    companyId: req.user?.companyId,
    ipAddress: req.ip || req.socket?.remoteAddress || (req.headers ? req.headers['x-forwarded-for'] : undefined),
    userAgent: req.headers ? req.headers['user-agent'] : undefined,
  };
}
