import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsInt, IsOptional, IsString, Min } from 'class-validator';

export class CreateRequestTypeDto {
  @ApiProperty({ example: 'Licença Prêmio' })
  @IsString()
  name!: string;

  @ApiProperty({ example: 30, description: 'SLA em dias úteis' })
  @IsInt()
  @Min(1)
  slaDays!: number;

  @ApiProperty({ example: ['PROT', 'RH', 'JUR', 'GAB'], description: 'Sequência de setores no fluxo' })
  @IsArray()
  @IsString({ each: true })
  flow!: string[];

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  isActive?: boolean;
}
