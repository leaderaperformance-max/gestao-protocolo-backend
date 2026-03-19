import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable, tap } from 'rxjs';
import { PrismaService } from '../../prisma/prisma.service';

const WRITE_METHODS = ['POST', 'PATCH', 'PUT', 'DELETE'];

@Injectable()
export class AuditInterceptor implements NestInterceptor {
  constructor(private readonly prisma: PrismaService) {}

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
    const startPayload = { ...body };

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
                payloadBefore: null,
                payloadAfter: startPayload,
                ipAddress: ip,
              },
            })
            .catch(() => {});
        },
      }),
    );
  }

  private extractEntityType(url: string): string {
    const segments = url.split('/').filter(Boolean);
    return segments[0] ?? 'unknown';
  }
}
