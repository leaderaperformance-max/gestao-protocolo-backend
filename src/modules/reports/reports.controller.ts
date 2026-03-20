import { Controller, Get, Header, Query, Req, Res } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { ReportQueryDto } from './dto/report-query.dto';
import { ReportsService } from './reports.service';
import { AuditService } from '../audit-logs/audit.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('reports')
@ApiBearerAuth()
@Controller('reports')
export class ReportsController {
  constructor(
    private readonly reportsService: ReportsService,
    private readonly auditService: AuditService,
  ) {}

  @Get('requests')
  @Header('Content-Type', 'application/pdf')
  @Header('Content-Disposition', 'attachment; filename="protocolos.pdf"')
  @ApiOperation({ summary: 'Gerar relatório PDF de protocolos com filtros' })
  async generatePdf(
    @CurrentUser() user: { id: string },
    @Req() req: Request,
    @Query() query: ReportQueryDto,
    @Res() res: Response,
  ) {
    this.auditService.log({
      actorUserId: user.id,
      action: 'EXPORT_PDF',
      entityType: 'reports',
      entityId: 'requests',
      payloadAfter: { ...query } as Record<string, unknown>,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'] as string | undefined,
    });
    const buffer = await this.reportsService.generateRequestsReport(query);
    res.send(buffer);
  }
}
