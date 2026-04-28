import { Body, Controller, Get, Param, Post, Query, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import * as express from 'express';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { AuditService } from '../audit-logs/audit.service';
import { CreateRequestDto } from './dto/create-request.dto';
import { ListRequestsDto } from './dto/list-requests.dto';
import { RequestsService } from './requests.service';

interface AuthUser { id: string; sectorId: string }

@ApiTags('Protocolos')
@ApiBearerAuth()
@Controller('requests')
export class RequestsController {
  constructor(
    private readonly requestsService: RequestsService,
    private readonly auditService: AuditService,
  ) {}

  @Post()
  @RequirePermission('send')
  @ApiOperation({ summary: 'Protocolar nova solicitação' })
  @ApiResponse({ status: 201, description: 'Protocolo criado com sucesso' })
  @ApiResponse({ status: 400, description: 'Dados inválidos ou regra de negócio violada' })
  @ApiResponse({ status: 401, description: 'Token JWT ausente ou inválido' })
  @ApiResponse({ status: 403, description: 'Sem permissão para esta ação' })
  async create(
    @Body() dto: CreateRequestDto,
    @CurrentUser() user: AuthUser,
    @Req() req: express.Request,
  ) {
    const result = await this.requestsService.create(dto, user);

    this.auditService.log({
      actorUserId: user.id,
      action: 'CREATE_PROTOCOL',
      entityType: 'Request',
      entityId: result.id,
      payloadAfter: {
        protocolNumber: result.protocolNumber,
        requestType: result.requestType?.name,
        description: dto.description,
        sectorOrigin: result.sectorOrigin?.name,
        currentSector: result.currentSector?.name,
        requesterName: dto.requesterName ?? null,
        requesterCpf: dto.requesterCpf ?? null,
      },
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });

    return result;
  }

  @Get()
  @ApiOperation({ summary: 'Listar protocolos com filtros e paginação' })
  @ApiResponse({ status: 200, description: 'Lista de protocolos retornada com sucesso' })
  @ApiResponse({ status: 401, description: 'Token JWT ausente ou inválido' })
  findAll(@Query() query: ListRequestsDto) {
    return this.requestsService.findAll(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Buscar protocolo completo por ID' })
  @ApiResponse({ status: 200, description: 'Protocolo retornado com sucesso' })
  @ApiResponse({ status: 401, description: 'Token JWT ausente ou inválido' })
  @ApiResponse({ status: 404, description: 'Protocolo não encontrado' })
  async findOne(
    @Param('id') id: string,
    @CurrentUser() user: AuthUser,
    @Req() req: express.Request,
  ) {
    const result = await this.requestsService.findOne(id);

    this.auditService.log({
      actorUserId: user.id,
      action: 'VIEW_PROTOCOL',
      entityType: 'Request',
      entityId: id,
      payloadAfter: {
        protocolNumber: result.protocolNumber,
        status: result.status,
        currentSector: result.currentSector?.name,
      },
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });

    return result;
  }

  @Get(':id/timeline')
  @Public()
  @ApiOperation({ summary: 'Timeline pública do protocolo (sem autenticação)' })
  @ApiResponse({ status: 200, description: 'Timeline retornada com sucesso' })
  @ApiResponse({ status: 404, description: 'Protocolo não encontrado' })
  getTimeline(@Param('id') id: string) {
    return this.requestsService.getTimeline(id);
  }
}
