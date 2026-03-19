import { Injectable, ConflictException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateUserDto } from './dto/create-user.dto';
import * as bcrypt from 'bcrypt';
import type { Prisma } from '@prisma/client';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateUserDto) {
    const existing = await this.prisma.user.findFirst({
      where: { OR: [{ email: dto.email }, { registrationNumber: dto.registrationNumber }] },
    });
    if (existing) throw new ConflictException('Email ou matrícula já cadastrados');

    const passwordHash = await bcrypt.hash(dto.password, 12);
    const { password: _p, ...rest } = dto;
    const user = await this.prisma.user.create({
      data: { ...rest, passwordHash },
      include: { role: true, sector: true },
    });
    const { passwordHash: _ph, ...userWithoutPassword } = user;
    return userWithoutPassword;
  }

  findAll() {
    return this.prisma.user.findMany({
      where: { isActive: true },
      select: {
        id: true,
        name: true,
        email: true,
        registrationNumber: true,
        isActive: true,
        createdAt: true,
        sector: { select: { id: true, name: true, code: true } },
        role: { select: { id: true, name: true, slug: true } },
      },
      orderBy: { name: 'asc' },
    });
  }

  async findOne(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      include: { role: true, sector: true },
    });
    if (!user) throw new NotFoundException('Usuário não encontrado');
    const { passwordHash: _ph, ...rest } = user;
    return rest;
  }

  async update(id: string, dto: Partial<CreateUserDto>) {
    await this.findOne(id);

    const updateData: Prisma.UserUpdateInput = {};

    if (dto.name !== undefined) updateData.name = dto.name;
    if (dto.email !== undefined) updateData.email = dto.email;
    if (dto.registrationNumber !== undefined) updateData.registrationNumber = dto.registrationNumber;
    if (dto.sectorId !== undefined) updateData.sector = { connect: { id: dto.sectorId } };
    if (dto.roleId !== undefined) updateData.role = { connect: { id: dto.roleId } };
    if (dto.password !== undefined) {
      updateData.passwordHash = await bcrypt.hash(dto.password, 12);
    }

    const updated = await this.prisma.user.update({
      where: { id },
      data: updateData,
      include: { role: true, sector: true },
    });
    const { passwordHash: _ph, ...rest } = updated;
    return rest;
  }

  async remove(id: string) {
    await this.findOne(id);
    await this.prisma.user.update({ where: { id }, data: { isActive: false } });
    return { message: 'Usuário desativado com sucesso' };
  }
}
