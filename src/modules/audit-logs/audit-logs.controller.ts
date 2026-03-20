import { Controller, Get, Param, Query, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { AuditLogsService } from './audit-logs.service';
import { AuditService } from './audit.service';
import { AuditLogQueryDto } from './dto/audit-log-query.dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('Logs de Auditoria')
@ApiBearerAuth()
@Controller('audit-logs')
export class AuditLogsController {
  constructor(
    private readonly auditLogsService: AuditLogsService,
    private readonly auditService: AuditService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Consultar log de auditoria com filtros (somente leitura)' })
  @ApiResponse({ status: 200, description: 'Logs de auditoria retornados com sucesso' })
  @ApiResponse({ status: 401, description: 'Token JWT ausente ou inválido' })
  @ApiResponse({ status: 403, description: 'Sem permissão para esta ação' })
  findAll(
    @CurrentUser() user: { id: string },
    @Req() req: Request,
    @Query() query: AuditLogQueryDto,
  ) {
    this.auditService.log({
      actorUserId: user.id,
      action: 'VIEW_AUDIT_LOGS',
      entityType: 'audit-logs',
      entityId: 'search',
      payloadAfter: { ...query } as Record<string, unknown>,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'] as string | undefined,
    });
    return this.auditLogsService.findAll(query);
  }

  @Get(':entityType/:entityId')
  @ApiOperation({ summary: 'Histórico completo de uma entidade específica' })
  @ApiResponse({ status: 200, description: 'Histórico da entidade retornado com sucesso' })
  @ApiResponse({ status: 401, description: 'Token JWT ausente ou inválido' })
  @ApiResponse({ status: 404, description: 'Entidade não encontrada' })
  findByEntity(
    @CurrentUser() user: { id: string },
    @Req() req: Request,
    @Param('entityType') entityType: string,
    @Param('entityId') entityId: string,
  ) {
    this.auditService.log({
      actorUserId: user.id,
      action: 'VIEW_AUDIT_LOGS',
      entityType: 'audit-logs',
      entityId: `${entityType}/${entityId}`,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'] as string | undefined,
    });
    return this.auditLogsService.findByEntity(entityType, entityId);
  }
}
