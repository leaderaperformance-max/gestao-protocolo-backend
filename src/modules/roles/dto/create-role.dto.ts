import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsObject, IsOptional, IsString } from 'class-validator';

export class PermissionsDto {
  @ApiProperty({ description: 'Permissão para visualizar', example: true })
  @IsBoolean() view!: boolean;

  @ApiProperty({ description: 'Permissão para editar', example: false })
  @IsBoolean() edit!: boolean;

  @ApiProperty({ description: 'Permissão para protocolar e encaminhar', example: true })
  @IsBoolean() send!: boolean;

  @ApiProperty({ description: 'Permissão para receber protocolos', example: true })
  @IsBoolean() receive!: boolean;

  @ApiProperty({ description: 'Permissão para deferir', example: false })
  @IsBoolean() approve!: boolean;

  @ApiProperty({ description: 'Permissão para indeferir', example: false })
  @IsBoolean() reject!: boolean;
}

export class CreateRoleDto {
  @ApiProperty({
    description: 'Nome do perfil',
    example: 'Protocolo',
  })
  @IsString()
  name!: string;

  @ApiProperty({
    description: 'Identificador único (slug)',
    example: 'protocolo',
  })
  @IsString()
  slug!: string;

  @ApiProperty({
    description: 'Objeto com as permissões do perfil',
  })
  @IsObject()
  permissions!: PermissionsDto;

  @ApiPropertyOptional({
    description: 'Define se o perfil é superadministrador',
    example: false,
  })
  @IsBoolean()
  @IsOptional()
  isSuperadmin?: boolean;
}
