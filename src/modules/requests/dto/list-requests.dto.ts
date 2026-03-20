import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsDateString, IsEnum, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { RequestStatus } from '@prisma/client';

export class ListRequestsDto {
  @ApiPropertyOptional({
    description: 'Filtrar por status',
    enum: RequestStatus,
    example: 'EM_ANALISE',
  })
  @IsOptional()
  @IsEnum(RequestStatus)
  status?: RequestStatus;

  @ApiPropertyOptional({
    description: 'Filtrar por código do setor atual',
    example: 'RH',
  })
  @IsOptional()
  @IsString()
  sectorCode?: string;

  @ApiPropertyOptional({
    description: 'Filtrar por tipo de solicitação',
    example: 'uuid',
  })
  @IsOptional()
  @IsString()
  requestTypeId?: string;

  @ApiPropertyOptional({
    description: 'Data inicial (ISO 8601)',
    example: '2026-01-01',
  })
  @IsOptional()
  @IsDateString()
  from?: string;

  @ApiPropertyOptional({
    description: 'Data final (ISO 8601)',
    example: '2026-12-31',
  })
  @IsOptional()
  @IsDateString()
  to?: string;

  @ApiPropertyOptional({
    description: 'Apenas protocolos com prazo vencido',
    example: true,
  })
  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => value === 'true' || value === true)
  isOverdue?: boolean;

  @ApiPropertyOptional({
    description: 'Página (padrão: 1)',
    example: 1,
    default: 1,
    minimum: 1,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  page?: number = 1;

  @ApiPropertyOptional({
    description: 'Itens por página (padrão: 20, máx: 100)',
    example: 20,
    default: 20,
    minimum: 1,
    maximum: 100,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  @Type(() => Number)
  limit?: number = 20;
}
