import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsEnum, IsOptional } from 'class-validator';

export class PeriodQueryDto {
  @ApiPropertyOptional({
    description: 'Data inicial',
    example: '2026-01-01',
  })
  @IsOptional()
  @IsDateString()
  from?: string;

  @ApiPropertyOptional({
    description: 'Data final',
    example: '2026-03-19',
  })
  @IsOptional()
  @IsDateString()
  to?: string;

  @ApiPropertyOptional({
    description: 'Granularidade: day, week ou month',
    enum: ['day', 'week', 'month'],
    example: 'month',
    default: 'day',
  })
  @IsOptional()
  @IsEnum(['day', 'week', 'month'])
  granularity?: 'day' | 'week' | 'month' = 'day';
}
