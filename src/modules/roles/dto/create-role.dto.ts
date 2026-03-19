import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsObject, IsOptional, IsString } from 'class-validator';

export class PermissionsDto {
  @IsBoolean() view!: boolean;
  @IsBoolean() edit!: boolean;
  @IsBoolean() send!: boolean;
  @IsBoolean() receive!: boolean;
  @IsBoolean() approve!: boolean;
  @IsBoolean() reject!: boolean;
}

export class CreateRoleDto {
  @ApiProperty({ example: 'Setor RH' })
  @IsString()
  name!: string;

  @ApiProperty({ example: 'rh' })
  @IsString()
  slug!: string;

  @ApiProperty()
  @IsObject()
  permissions!: PermissionsDto;

  @ApiProperty({ required: false, default: false })
  @IsBoolean()
  @IsOptional()
  isSuperadmin?: boolean;
}
