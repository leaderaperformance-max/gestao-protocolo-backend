import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { RequestStatus } from '@prisma/client';
import { addDays } from 'date-fns';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateRequestDto } from './dto/create-request.dto';
import { ListRequestsDto } from './dto/list-requests.dto';
import { ProtocolNumberService } from './protocol-number.service';

interface AuthUser {
  id: string;
  sectorId: string;
}

@Injectable()
export class RequestsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly protocolNumber: ProtocolNumberService,
  ) {}

  async create(dto: CreateRequestDto, currentUser: AuthUser) {
    const requestType = await this.prisma.requestType.findUnique({
      where: { id: dto.requestTypeId, isActive: true },
    });
    if (!requestType) throw new NotFoundException('Tipo de solicitação não encontrado');

    const flow = requestType.flow as string[];
    if (flow.length === 0) throw new BadRequestException('Tipo de solicitação sem fluxo configurado');

    const firstSectorCode = flow[0];
    const firstSector = await this.prisma.sector.findUnique({ where: { code: firstSectorCode } });
    if (!firstSector) throw new BadRequestException(`Setor inicial '${firstSectorCode}' não encontrado`);

    const protocolNumber = await this.protocolNumber.generate(firstSectorCode);
    const deadlineAt = addDays(new Date(), requestType.slaDays);

    return this.prisma.request.create({
      data: {
        protocolNumber,
        requesterId: currentUser.id,
        sectorOriginId: currentUser.sectorId,
        requestTypeId: dto.requestTypeId,
        description: dto.description,
        currentSectorId: firstSector.id,
        deadlineAt,
        statusHistory: {
          create: {
            newStatus: RequestStatus.PROTOCOLADO,
            changedByUserId: currentUser.id,
          },
        },
      },
      include: {
        requester: { select: { id: true, name: true, registrationNumber: true } },
        requestType: { select: { id: true, name: true, slaDays: true } },
        sectorOrigin: { select: { id: true, name: true, code: true } },
        currentSector: { select: { id: true, name: true, code: true } },
      },
    });
  }

  async findAll(query: ListRequestsDto) {
    const { status, sectorCode, requestTypeId, from, to, isOverdue, page = 1, limit = 20 } = query;
    const now = new Date();

    type WhereClause = {
      status?: RequestStatus | { notIn: RequestStatus[] };
      requestTypeId?: string;
      currentSector?: { code: string };
      createdAt?: { gte?: Date; lte?: Date };
      deadlineAt?: { lt: Date };
    };

    const where: WhereClause = {};
    if (status) where.status = status;
    if (requestTypeId) where.requestTypeId = requestTypeId;
    if (sectorCode) where.currentSector = { code: sectorCode };
    if (from ?? to) {
      where.createdAt = {};
      if (from) where.createdAt.gte = new Date(from);
      if (to) where.createdAt.lte = new Date(to);
    }
    if (isOverdue) {
      where.deadlineAt = { lt: now };
      where.status = {
        notIn: [RequestStatus.DEFERIDO, RequestStatus.INDEFERIDO, RequestStatus.CONCLUIDO],
      };
    }

    const [data, total] = await Promise.all([
      this.prisma.request.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          requester: { select: { id: true, name: true, registrationNumber: true } },
          requestType: { select: { id: true, name: true } },
          currentSector: { select: { id: true, name: true, code: true } },
        },
      }),
      this.prisma.request.count({ where }),
    ]);

    return {
      data: data.map((r) => ({ ...r, isOverdue: r.deadlineAt < now })),
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  async findOne(id: string) {
    const request = await this.prisma.request.findUnique({
      where: { id },
      include: {
        requester: { select: { id: true, name: true, registrationNumber: true } },
        requestType: true,
        sectorOrigin: true,
        currentSector: true,
        tramitations: {
          include: {
            fromSector: true,
            toSector: true,
            sentBy: { select: { id: true, name: true } },
            receivedBy: { select: { id: true, name: true } },
          },
          orderBy: { sentAt: 'asc' },
        },
        statusHistory: {
          include: { changedBy: { select: { id: true, name: true } } },
          orderBy: { changedAt: 'asc' },
        },
        attachments: {
          include: { uploadedBy: { select: { id: true, name: true } } },
        },
      },
    });
    if (!request) throw new NotFoundException('Protocolo não encontrado');
    return { ...request, isOverdue: request.deadlineAt < new Date() };
  }

  async getTimeline(id: string) {
    const request = await this.prisma.request.findUnique({
      where: { id },
      select: {
        protocolNumber: true,
        status: true,
        createdAt: true,
        deadlineAt: true,
        statusHistory: {
          include: { changedBy: { select: { name: true } } },
          orderBy: { changedAt: 'asc' },
        },
        tramitations: {
          include: {
            fromSector: { select: { name: true } },
            toSector: { select: { name: true } },
            sentBy: { select: { name: true } },
            receivedBy: { select: { name: true } },
          },
          orderBy: { sentAt: 'asc' },
        },
      },
    });
    if (!request) throw new NotFoundException('Protocolo não encontrado');
    return request;
  }
}
