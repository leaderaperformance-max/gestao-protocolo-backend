import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsInt, IsOptional, IsString, Min } from 'class-validator';

export class CreateRequestTypeDto {
  @ApiProperty({
    description: 'Nome do tipo de solicitação',
    example: 'Licença Prêmio',
  })
  @IsString()
  name!: string;

  @ApiProperty({
    description: 'Prazo em dias úteis para atendimento (SLA)',
    example: 30,
  })
  @IsInt()
  @Min(1)
  slaDays!: number;

  @ApiProperty({
    description: 'Sequência de códigos de setores no fluxo de tramitação',
    example: ['PROT', 'RH', 'GAB'],
  })
  @IsArray()
  @IsString({ each: true })
  flow!: string[];

  @ApiPropertyOptional({
    description: 'Se o tipo está ativo',
    example: true,
    default: true,
  })
  @IsOptional()
  isActive?: boolean;
}
