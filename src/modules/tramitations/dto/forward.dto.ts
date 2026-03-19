import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class ForwardDto {
  @ApiProperty({ description: 'Código do setor destino. Ex: RH, JUR, GAB' })
  @IsString()
  toSectorCode!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;
}
