import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString } from 'class-validator';
import { RequestStatus } from '@prisma/client';

export class ChangeStatusDto {
  @ApiProperty({
    description: 'Novo status do protocolo',
    enum: RequestStatus,
    example: 'EM_ANALISE',
  })
  @IsEnum(RequestStatus)
  status!: RequestStatus;

  @ApiPropertyOptional({
    description: 'Justificativa (obrigatória para INDEFERIDO e PENDENTE_DOCUMENTO)',
    example: 'Documentação insuficiente para análise',
  })
  @IsOptional()
  @IsString()
  justification?: string;
}
