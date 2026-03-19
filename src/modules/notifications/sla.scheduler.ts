import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { RequestStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationsService } from './notifications.service';

const TERMINAL_STATUSES = [RequestStatus.DEFERIDO, RequestStatus.INDEFERIDO, RequestStatus.CONCLUIDO];

@Injectable()
export class SlaScheduler {
  private readonly logger = new Logger(SlaScheduler.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_8AM)
  async checkOverdueRequests() {
    this.logger.log('Verificando protocolos atrasados...');
    const now = new Date();

    const overdueRequests = await this.prisma.request.findMany({
      where: {
        deadlineAt: { lt: now },
        status: { notIn: TERMINAL_STATUSES },
      },
      include: {
        requester: { select: { id: true, name: true } },
        currentSector: { include: { users: { where: { isActive: true }, select: { id: true } } } },
      },
    });

    this.logger.log(`Encontrados ${overdueRequests.length} protocolos atrasados`);

    for (const request of overdueRequests) {
      const usersToNotify = [
        { id: request.requester.id },
        ...request.currentSector.users,
      ];

      // Deduplicate in case requester is in current sector
      const uniqueUserIds = [...new Set(usersToNotify.map((u) => u.id))];

      await Promise.all(
        uniqueUserIds.map((userId) =>
          this.notifications.create({
            userId,
            title: '⚠️ Protocolo com prazo vencido',
            body: `O protocolo ${request.protocolNumber} está atrasado. Prazo era: ${request.deadlineAt.toLocaleDateString('pt-BR')}`,
            type: 'OVERDUE',
            relatedRequestId: request.id,
          }),
        ),
      );
    }
  }
}
