import { Controller, Get, Query, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { PeriodQueryDto } from './dto/period-query.dto';
import { DashboardService } from './dashboard.service';
import { AuditService } from '../audit-logs/audit.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('Dashboard')
@ApiBearerAuth()
@Controller('dashboard')
export class DashboardController {
  constructor(
    private readonly dashboardService: DashboardService,
    private readonly auditService: AuditService,
  ) {}

  @Get('overview')
  @ApiOperation({ summary: 'Visão geral: totais por status, setores e atrasados' })
  @ApiResponse({ status: 200, description: 'Dados do painel retornados com sucesso' })
  @ApiResponse({ status: 401, description: 'Token JWT ausente ou inválido' })
  overview(@CurrentUser() user: { id: string }, @Req() req: Request) {
    this.auditService.log({
      actorUserId: user.id,
      action: 'VIEW_DASHBOARD_OVERVIEW',
      entityType: 'dashboard',
      entityId: 'overview',
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'] as string | undefined,
    });
    return this.dashboardService.overview();
  }

  @Get('by-period')
  @ApiOperation({ summary: 'Protocolos por período (dia/semana/mês)' })
  @ApiResponse({ status: 200, description: 'Dados por período retornados com sucesso' })
  @ApiResponse({ status: 401, description: 'Token JWT ausente ou inválido' })
  byPeriod(@CurrentUser() user: { id: string }, @Req() req: Request, @Query() query: PeriodQueryDto) {
    this.auditService.log({
      actorUserId: user.id,
      action: 'VIEW_DASHBOARD_BY_PERIOD',
      entityType: 'dashboard',
      entityId: 'by-period',
      payloadAfter: { ...query } as Record<string, unknown>,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'] as string | undefined,
    });
    const from = query.from ? new Date(query.from) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const to = query.to ? new Date(query.to) : new Date();
    return this.dashboardService.byPeriod(from, to, query.granularity);
  }

  @Get('response-time')
  @ApiOperation({ summary: 'Tempo médio de resposta por setor (ranking de eficiência)' })
  @ApiResponse({ status: 200, description: 'Ranking de eficiência retornado com sucesso' })
  @ApiResponse({ status: 401, description: 'Token JWT ausente ou inválido' })
  responseTimeBySector(@CurrentUser() user: { id: string }, @Req() req: Request) {
    this.auditService.log({
      actorUserId: user.id,
      action: 'VIEW_DASHBOARD_RESPONSE_TIME',
      entityType: 'dashboard',
      entityId: 'response-time',
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'] as string | undefined,
    });
    return this.dashboardService.responseTimeBySector();
  }

  @Get('user-activity')
  @ApiOperation({ summary: 'Usuários mais ativos (últimos 30 dias)' })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiResponse({ status: 200, description: 'Lista de atividade dos usuários retornada com sucesso' })
  @ApiResponse({ status: 401, description: 'Token JWT ausente ou inválido' })
  userActivity(@CurrentUser() user: { id: string }, @Req() req: Request, @Query('limit') limit?: string) {
    this.auditService.log({
      actorUserId: user.id,
      action: 'VIEW_DASHBOARD_USER_ACTIVITY',
      entityType: 'dashboard',
      entityId: 'user-activity',
      payloadAfter: { limit } as Record<string, unknown>,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'] as string | undefined,
    });
    return this.dashboardService.userActivity(limit ? parseInt(limit, 10) : 10);
  }

  @Get('overdue')
  @ApiOperation({ summary: 'Lista de protocolos com prazo vencido' })
  @ApiResponse({ status: 200, description: 'Lista de protocolos atrasados retornada com sucesso' })
  @ApiResponse({ status: 401, description: 'Token JWT ausente ou inválido' })
  overdue(@CurrentUser() user: { id: string }, @Req() req: Request) {
    this.auditService.log({
      actorUserId: user.id,
      action: 'VIEW_DASHBOARD_OVERDUE',
      entityType: 'dashboard',
      entityId: 'overdue',
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'] as string | undefined,
    });
    return this.dashboardService.overdue();
  }
}
