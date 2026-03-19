import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { RequestStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { ChangeStatusDto } from './dto/change-status.dto';
import { ForwardDto } from './dto/forward.dto';

const STATUS_REQUIRES_JUSTIFICATION: RequestStatus[] = [
  RequestStatus.INDEFERIDO,
  RequestStatus.PENDENTE_DOCUMENTO,
];

interface AuthUser {
  id: string;
  sectorId: string;
  role: { isSuperadmin: boolean };
}

@Injectable()
export class TramitationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  async forward(requestId: string, dto: ForwardDto, currentUser: AuthUser) {
    const request = await this.getRequestOrThrow(requestId);

    if (!currentUser.role.isSuperadmin && currentUser.sectorId !== request.currentSectorId) {
      throw new ForbiddenException('Apenas o setor atual pode encaminhar este protocolo');
    }

    const toSector = await this.prisma.sector.findUnique({ where: { code: dto.toSectorCode } });
    if (!toSector) throw new NotFoundException(`Setor '${dto.toSectorCode}' não encontrado`);

    const flow = request.requestType.flow as string[];
    const currentIdx = flow.indexOf(request.currentSector.code);
    const expectedNextCode = flow[currentIdx + 1];

    if (!currentUser.role.isSuperadmin && dto.toSectorCode !== expectedNextCode) {
      throw new BadRequestException(
        `O próximo setor no fluxo é '${expectedNextCode ?? 'nenhum (fim do fluxo)'}', não '${dto.toSectorCode}'`,
      );
    }

    const [tramitation] = await this.prisma.$transaction([
      this.prisma.requestTramitation.create({
        data: {
          requestId,
          fromSectorId: request.currentSectorId,
          toSectorId: toSector.id,
          sentByUserId: currentUser.id,
          notes: dto.notes,
        },
      }),
      this.prisma.request.update({
        where: { id: requestId },
        data: { currentSectorId: toSector.id },
      }),
    ]);

    // Notify users in destination sector (fire-and-forget)
    const destUsers = await this.prisma.user.findMany({
      where: { sectorId: toSector.id, isActive: true },
    });
    void Promise.all(
      destUsers.map((u) =>
        this.notifications.create({
          userId: u.id,
          title: 'Novo protocolo recebido',
          body: `Protocolo ${request.protocolNumber} foi encaminhado para ${toSector.name}`,
          type: 'FORWARDED',
          relatedRequestId: requestId,
        }),
      ),
    ).catch(() => {});

    return tramitation;
  }

  async receive(requestId: string, currentUser: AuthUser) {
    const request = await this.getRequestOrThrow(requestId);

    if (!currentUser.role.isSuperadmin && currentUser.sectorId !== request.currentSectorId) {
      throw new ForbiddenException('Apenas o setor atual pode receber este protocolo');
    }

    const pendingTramitation = await this.prisma.requestTramitation.findFirst({
      where: { requestId, toSectorId: request.currentSectorId, receivedAt: null },
      orderBy: { sentAt: 'desc' },
    });

    if (!pendingTramitation) {
      throw new BadRequestException('Não há tramitação pendente de recebimento para este setor');
    }

    const [updated] = await this.prisma.$transaction([
      this.prisma.requestTramitation.update({
        where: { id: pendingTramitation.id },
        data: { receivedByUserId: currentUser.id, receivedAt: new Date() },
      }),
      this.prisma.request.update({
        where: { id: requestId },
        data: { status: RequestStatus.RECEBIDO_PELO_SETOR },
      }),
      this.prisma.requestStatusHistory.create({
        data: {
          requestId,
          previousStatus: request.status,
          newStatus: RequestStatus.RECEBIDO_PELO_SETOR,
          changedByUserId: currentUser.id,
        },
      }),
    ]);

    return updated;
  }

  async changeStatus(requestId: string, dto: ChangeStatusDto, currentUser: AuthUser) {
    const request = await this.getRequestOrThrow(requestId);

    if (STATUS_REQUIRES_JUSTIFICATION.includes(dto.status) && !dto.justification?.trim()) {
      throw new BadRequestException(`Justificativa obrigatória para status '${dto.status}'`);
    }

    await this.prisma.$transaction([
      this.prisma.request.update({
        where: { id: requestId },
        data: { status: dto.status },
      }),
      this.prisma.requestStatusHistory.create({
        data: {
          requestId,
          previousStatus: request.status,
          newStatus: dto.status,
          changedByUserId: currentUser.id,
          justification: dto.justification,
        },
      }),
    ]);

    // Notify requester (fire-and-forget)
    void this.notifications.create({
      userId: request.requesterId,
      title: 'Status do protocolo atualizado',
      body: `Seu protocolo ${request.protocolNumber} agora está: ${dto.status.replace(/_/g, ' ')}`,
      type: 'STATUS_CHANGED',
      relatedRequestId: requestId,
    }).catch(() => {});

    return { message: 'Status atualizado com sucesso', status: dto.status };
  }

  private async getRequestOrThrow(id: string) {
    const request = await this.prisma.request.findUnique({
      where: { id },
      include: { requestType: true, currentSector: true },
    });
    if (!request) throw new NotFoundException('Protocolo não encontrado');
    return request;
  }
}
