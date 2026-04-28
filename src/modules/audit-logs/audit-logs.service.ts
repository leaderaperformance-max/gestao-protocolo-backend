import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditLogQueryDto } from './dto/audit-log-query.dto';

@Injectable()
export class AuditLogsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(filters: AuditLogQueryDto) {
    const { entityType, entityId, actorUserId, from, to, page = 1, limit = 50 } = filters;

    type Where = {
      entityType?: string;
      entityId?: string;
      actorUserId?: string;
      createdAt?: { gte?: Date; lte?: Date };
    };

    const where: Where = {};
    if (entityType) where.entityType = entityType;
    if (entityId) where.entityId = entityId;
    if (actorUserId) where.actorUserId = actorUserId;
    if (from ?? to) {
      where.createdAt = {};
      if (from) where.createdAt.gte = new Date(from);
      if (to) where.createdAt.lte = new Date(to);
    }

    const [data, total] = await Promise.all([
      this.prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.auditLog.count({ where }),
    ]);

    // Enrich with actor user names
    const actorIds = [...new Set(data.map((l) => l.actorUserId))];
    const users = actorIds.length
      ? await this.prisma.user.findMany({
          where: { id: { in: actorIds } },
          select: { id: true, name: true },
        })
      : [];
    const userMap = new Map(users.map((u) => [u.id, u.name]));

    return {
      data: data.map((log) => ({
        ...log,
        actorName: userMap.get(log.actorUserId) ?? 'Usuário removido',
      })),
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  async findByEntity(entityType: string, entityId: string) {
    return this.prisma.auditLog.findMany({
      where: { entityType, entityId },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
  }

  /**
   * Get all activity for a protocol: direct logs on the Request entity
   * + logs on related Attachments.
   */
  async findByProtocol(requestId: string) {
    // Get attachment IDs for this protocol
    const attachments = await this.prisma.attachment.findMany({
      where: { requestId },
      select: { id: true },
    });
    const attachmentIds = attachments.map((a) => a.id);

    const logs = await this.prisma.auditLog.findMany({
      where: {
        OR: [
          { entityType: 'Request', entityId: requestId },
          ...(attachmentIds.length > 0
            ? [{ entityType: 'Attachment', entityId: { in: attachmentIds } }]
            : []),
        ],
      },
      orderBy: { createdAt: 'asc' },
      take: 500,
    });

    // Enrich with actor user names
    const actorIds = [...new Set(logs.map((l) => l.actorUserId))];
    const users = await this.prisma.user.findMany({
      where: { id: { in: actorIds } },
      select: { id: true, name: true },
    });
    const userMap = new Map(users.map((u) => [u.id, u.name]));

    return logs.map((log) => ({
      ...log,
      actorName: userMap.get(log.actorUserId) ?? 'Usuário removido',
    }));
  }
}
