import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength } from 'class-validator';

export class CreateSectorDto {
  @ApiProperty({
    description: 'Nome do setor',
    example: 'Recursos Humanos',
  })
  @IsString()
  name!: string;

  @ApiProperty({
    description: 'Código do setor (máx 10 caracteres)',
    example: 'RH',
  })
  @IsString()
  @MaxLength(10)
  code!: string;
}
