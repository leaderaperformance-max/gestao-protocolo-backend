import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString, IsUUID, MinLength } from 'class-validator';

export class CreateUserDto {
  @ApiProperty() @IsString() name!: string;
  @ApiProperty() @IsEmail() email!: string;
  @ApiProperty({ minLength: 8 }) @IsString() @MinLength(8) password!: string;
  @ApiProperty({ description: 'Matrícula do servidor' }) @IsString() registrationNumber!: string;
  @ApiProperty() @IsUUID() sectorId!: string;
  @ApiProperty() @IsUUID() roleId!: string;
}
