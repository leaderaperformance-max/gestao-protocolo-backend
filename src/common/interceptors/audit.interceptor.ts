import {
  CallHandler,
  ExecutionContext,
  Injectable,
  Logger,
  NestInterceptor,
} from '@nestjs/common';
import { Observable, tap } from 'rxjs';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

const WRITE_METHODS = ['POST', 'PATCH', 'PUT', 'DELETE'];

const SENSITIVE_KEYS = new Set(['password', 'currentPassword', 'newPassword', 'passwordHash', 'token', 'refreshToken']);

function sanitizePayload(obj: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(obj).map(([k, v]) => [k, SENSITIVE_KEYS.has(k) ? '[REDACTED]' : v]),
  );
}

@Injectable()
export class AuditInterceptor implements NestInterceptor {
  constructor(private readonly prisma: PrismaService) {}

  private readonly logger = new Logger(AuditInterceptor.name);

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<{
      method: string;
      url: string;
      user?: { id: string };
      ip: string;
      body: Record<string, unknown>;
    }>();
    const { method, url, user, ip, body } = request;

    if (!WRITE_METHODS.includes(method) || !user) {
      return next.handle();
    }

    const action = `${method}:${url}`;
    const startPayload = sanitizePayload({ ...body });

    return next.handle().pipe(
      tap({
        next: (responseData: { id?: string } | null) => {
          // Fire-and-forget audit log — never fail the request
          this.prisma.auditLog
            .create({
              data: {
                actorUserId: user.id,
                action,
                entityType: this.extractEntityType(url),
                entityId: responseData?.id ?? 'unknown',
                payloadBefore: Prisma.JsonNull,
                payloadAfter: startPayload as Prisma.InputJsonValue,
                ipAddress: ip,
              },
            })
            .catch((err: unknown) => {
              this.logger.error('Audit log write failed', err instanceof Error ? err.stack : String(err));
            });
        },
      }),
    );
  }

  private extractEntityType(url: string): string {
    const segments = url.split('/').filter(Boolean);
    return segments[0] ?? 'unknown';
  }
}
