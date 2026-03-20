import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString, IsUUID, MinLength } from 'class-validator';

export class CreateUserDto {
  @ApiProperty({
    description: 'Nome completo do servidor',
    example: 'Maria da Silva',
  })
  @IsString()
  name!: string;

  @ApiProperty({
    description: 'E-mail institucional',
    example: 'maria.silva@semed.prainha.pa.gov.br',
  })
  @IsEmail()
  email!: string;

  @ApiProperty({
    description: 'Senha (mínimo 8 caracteres)',
    example: 'Senha@2026!',
    minLength: 8,
  })
  @IsString()
  @MinLength(8)
  password!: string;

  @ApiProperty({
    description: 'Número de matrícula do servidor',
    example: '000123',
  })
  @IsString()
  registrationNumber!: string;

  @ApiProperty({
    description: 'ID do setor (UUID)',
    example: 'a8e0025c-6346-4486-8c71-94474d8b78b4',
  })
  @IsUUID()
  sectorId!: string;

  @ApiProperty({
    description: 'ID do perfil de acesso (UUID)',
    example: '682211fd-b320-45fa-a0e1-94b9ded2a941',
  })
  @IsUUID()
  roleId!: string;
}
