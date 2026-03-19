import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString } from 'class-validator';
import { RequestStatus } from '@prisma/client';

export class ChangeStatusDto {
  @ApiProperty({ enum: RequestStatus })
  @IsEnum(RequestStatus)
  status!: RequestStatus;

  @ApiPropertyOptional({ description: 'Obrigatória para INDEFERIDO e PENDENTE_DOCUMENTO' })
  @IsOptional()
  @IsString()
  justification?: string;
}
