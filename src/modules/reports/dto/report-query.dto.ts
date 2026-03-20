import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsEnum, IsOptional, IsString } from 'class-validator';
import { RequestStatus } from '@prisma/client';

export class ReportQueryDto {
  @ApiPropertyOptional({
    description: 'Data inicial (ISO 8601)',
    example: '2026-01-01',
  })
  @IsOptional()
  @IsDateString()
  from?: string;

  @ApiPropertyOptional({
    description: 'Data final (ISO 8601)',
    example: '2026-03-19',
  })
  @IsOptional()
  @IsDateString()
  to?: string;

  @ApiPropertyOptional({
    description: 'Filtrar por código do setor',
    example: 'RH',
  })
  @IsOptional()
  @IsString()
  sectorCode?: string;

  @ApiPropertyOptional({
    description: 'Filtrar por tipo de solicitação (UUID)',
    example: 'uuid',
  })
  @IsOptional()
  @IsString()
  requestTypeId?: string;

  @ApiPropertyOptional({
    description: 'Filtrar por status do protocolo',
    enum: RequestStatus,
    example: 'EM_ANALISE',
  })
  @IsOptional()
  @IsEnum(RequestStatus)
  status?: RequestStatus;
}
