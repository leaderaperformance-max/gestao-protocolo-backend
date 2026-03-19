import { Controller, Get, Header, Query, Res } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { ReportQueryDto } from './dto/report-query.dto';
import { ReportsService } from './reports.service';

@ApiTags('reports')
@ApiBearerAuth()
@Controller('reports')
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @Get('requests')
  @Header('Content-Type', 'application/pdf')
  @Header('Content-Disposition', 'attachment; filename="protocolos.pdf"')
  @ApiOperation({ summary: 'Gerar relatório PDF de protocolos com filtros' })
  async generatePdf(@Query() query: ReportQueryDto, @Res() res: Response) {
    const buffer = await this.reportsService.generateRequestsReport(query);
    res.send(buffer);
  }
}
