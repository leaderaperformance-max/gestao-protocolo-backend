import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsOptional, IsString, IsUUID } from 'class-validator';

export class CreateRequestDto {
  @ApiProperty({
    description: 'ID do tipo de solicitação (UUID)',
    example: '442ddf3f-2439-49d3-b3b6-8f6159a4e185',
  })
  @IsUUID()
  requestTypeId!: string;

  @ApiProperty({
    description: 'Descrição detalhada da solicitação',
    example: 'Solicito licença prêmio referente ao quinquênio 2021-2026',
  })
  @IsString()
  description!: string;

  @ApiPropertyOptional({
    description: 'Matrícula do solicitante (admin pode criar para outro)',
  })
  @IsOptional()
  @IsString()
  registrationNumber?: string;

  @ApiPropertyOptional({ description: 'Nome completo do solicitante (pessoa física)' })
  @IsOptional()
  @IsString()
  requesterName?: string;

  @ApiPropertyOptional({ description: 'CPF do solicitante', example: '123.456.789-00' })
  @IsOptional()
  @IsString()
  requesterCpf?: string;

  @ApiPropertyOptional({ description: 'RG do solicitante' })
  @IsOptional()
  @IsString()
  requesterRg?: string;

  @ApiPropertyOptional({ description: 'Data de nascimento do solicitante (ISO 8601)', example: '1990-05-15' })
  @IsOptional()
  @IsDateString()
  requesterBirthDate?: string;
}
