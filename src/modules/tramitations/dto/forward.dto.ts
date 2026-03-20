import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class ForwardDto {
  @ApiProperty({
    description: 'Código do setor destino',
    example: 'RH',
  })
  @IsString()
  toSectorCode!: string;

  @ApiPropertyOptional({
    description: 'Observações sobre o encaminhamento',
    example: 'Encaminhando para análise de tempo de serviço',
  })
  @IsOptional()
  @IsString()
  notes?: string;
}
