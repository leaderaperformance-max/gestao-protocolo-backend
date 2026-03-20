import {
  CallHandler,
  ExecutionContext,
  Injectable,
  Logger,
  NestInterceptor,
} from '@nestjs/common';
import { Observable, tap } from 'rxjs';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../modules/audit-logs/audit.service';

const WRITE_METHODS = ['POST', 'PATCH', 'PUT', 'DELETE'];

const ENTITY_MODEL_MAP: Record<string, string> = {
  requests: 'request',
  users: 'user',
  roles: 'role',
  sectors: 'sector',
  'request-types': 'requestType',
};

@Injectable()
export class AuditInterceptor implements NestInterceptor {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  private readonly logger = new Logger(AuditInterceptor.name);

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<{
      method: string;
      url: string;
      user?: { id: string };
      ip: string;
      body: Record<string, unknown>;
      headers: Record<string, string>;
    }>();
    const { method, url, user, ip, body, headers } = request;

    if (!WRITE_METHODS.includes(method) || !user) {
      return next.handle();
    }

    const entityType = this.extractEntityType(url);
    const entityId = this.extractEntityId(url);
    const userAgent = headers['user-agent'] ?? null;

    const beforePromise = this.fetchBefore(entityType, entityId);

    return next.handle().pipe(
      tap({
        next: (responseData: { id?: string } | null) => {
          const resolvedEntityId = entityId || responseData?.id || 'unknown';

          beforePromise
            .then((payloadBefore) => {
              this.auditService.log({
                actorUserId: user.id,
                action: `${method}:${url}`,
                entityType,
                entityId: resolvedEntityId,
                payloadBefore,
                payloadAfter: { ...body },
                ipAddress: ip,
                userAgent: userAgent ?? undefined,
              });
            })
            .catch((err: unknown) => {
              this.logger.error(
                'Failed to fetch before-state for audit',
                err instanceof Error ? err.stack : String(err),
              );
              this.auditService.log({
                actorUserId: user.id,
                action: `${method}:${url}`,
                entityType,
                entityId: resolvedEntityId,
                payloadBefore: null,
                payloadAfter: { ...body },
                ipAddress: ip,
                userAgent: userAgent ?? undefined,
              });
            });
        },
      }),
    );
  }

  private extractEntityType(url: string): string {
    const segments = url.split('/').filter(Boolean);
    return segments[0] ?? 'unknown';
  }

  private extractEntityId(url: string): string {
    const segments = url.split('/').filter(Boolean);
    const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    return segments.find((s) => UUID_REGEX.test(s)) ?? '';
  }

  private async fetchBefore(entityType: string, entityId: string): Promise<Record<string, unknown> | null> {
    if (!entityId) return null;
    const modelName = ENTITY_MODEL_MAP[entityType];
    if (!modelName) return null;

    try {
      const model = (this.prisma as unknown as Record<string, unknown>)[modelName] as
        | { findUnique: (args: { where: { id: string } }) => Promise<Record<string, unknown> | null> }
        | undefined;
      if (!model?.findUnique) return null;
      return await model.findUnique({ where: { id: entityId } });
    } catch {
      return null;
    }
  }
}
