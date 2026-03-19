import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { PeriodQueryDto } from './dto/period-query.dto';
import { DashboardService } from './dashboard.service';

@ApiTags('dashboard')
@ApiBearerAuth()
@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get('overview')
  @ApiOperation({ summary: 'Visão geral: totais por status, setores e atrasados' })
  overview() {
    return this.dashboardService.overview();
  }

  @Get('by-period')
  @ApiOperation({ summary: 'Protocolos por período (dia/semana/mês)' })
  byPeriod(@Query() query: PeriodQueryDto) {
    const from = query.from ? new Date(query.from) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const to = query.to ? new Date(query.to) : new Date();
    return this.dashboardService.byPeriod(from, to, query.granularity);
  }

  @Get('response-time')
  @ApiOperation({ summary: 'Tempo médio de resposta por setor (ranking de eficiência)' })
  responseTimeBySector() {
    return this.dashboardService.responseTimeBySector();
  }

  @Get('user-activity')
  @ApiOperation({ summary: 'Usuários mais ativos (últimos 30 dias)' })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  userActivity(@Query('limit') limit?: string) {
    return this.dashboardService.userActivity(limit ? parseInt(limit, 10) : 10);
  }

  @Get('overdue')
  @ApiOperation({ summary: 'Lista de protocolos com prazo vencido' })
  overdue() {
    return this.dashboardService.overdue();
  }
}
