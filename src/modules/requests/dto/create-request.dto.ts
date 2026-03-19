import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsUUID } from 'class-validator';

export class CreateRequestDto {
  @ApiProperty()
  @IsUUID()
  requestTypeId!: string;

  @ApiProperty({ description: 'Descrição da solicitação' })
  @IsString()
  description!: string;

  @ApiPropertyOptional({ description: 'Matrícula do solicitante (admin pode criar para outro)' })
  @IsOptional()
  @IsString()
  registrationNumber?: string;
}
