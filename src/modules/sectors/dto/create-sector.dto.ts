import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength } from 'class-validator';

export class CreateSectorDto {
  @ApiProperty({ example: 'Recursos Humanos' })
  @IsString()
  name!: string;

  @ApiProperty({ example: 'RH', description: 'Código do setor (máx 10 chars)' })
  @IsString()
  @MaxLength(10)
  code!: string;
}
