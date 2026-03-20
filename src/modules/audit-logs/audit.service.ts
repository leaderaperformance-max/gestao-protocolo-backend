import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

export interface AuditEventData {
  actorUserId: string;
  action: string;
  entityType: string;
  entityId: string;
  payloadBefore?: Record<string, unknown> | null;
  payloadAfter?: Record<string, unknown> | null;
  ipAddress?: string;
  userAgent?: string;
}

const SENSITIVE_KEYS = new Set([
  'password', 'currentPassword', 'newPassword',
  'passwordHash', 'token', 'refreshToken',
]);

function sanitize(obj: Record<string, unknown> | null | undefined): Prisma.InputJsonValue | typeof Prisma.JsonNull {
  if (!obj) return Prisma.JsonNull;
  return Object.fromEntries(
    Object.entries(obj).map(([k, v]) => [k, SENSITIVE_KEYS.has(k) ? '[REDACTED]' : v]),
  ) as Prisma.InputJsonValue;
}

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Log an audit event. Fire-and-forget — never throws.
   */
  log(data: AuditEventData): void {
    this.prisma.auditLog
      .create({
        data: {
          actorUserId: data.actorUserId,
          action: data.action,
          entityType: data.entityType,
          entityId: data.entityId,
          payloadBefore: sanitize(data.payloadBefore),
          payloadAfter: sanitize(data.payloadAfter),
          ipAddress: data.ipAddress ?? null,
          userAgent: data.userAgent ?? null,
        },
      })
      .catch((err: unknown) => {
        this.logger.error('Audit log write failed', err instanceof Error ? err.stack : String(err));
      });
  }
}
