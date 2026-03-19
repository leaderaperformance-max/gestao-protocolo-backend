import { Injectable, ConflictException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateRoleDto } from './dto/create-role.dto';

@Injectable()
export class RolesService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateRoleDto) {
    const existing = await this.prisma.role.findUnique({ where: { slug: dto.slug } });
    if (existing) throw new ConflictException(`Role com slug '${dto.slug}' já existe`);
    return this.prisma.role.create({ data: { ...dto, permissions: dto.permissions as object } });
  }

  findAll() {
    return this.prisma.role.findMany({ orderBy: { name: 'asc' } });
  }

  async findOne(id: string) {
    const role = await this.prisma.role.findUnique({ where: { id } });
    if (!role) throw new NotFoundException('Role não encontrado');
    return role;
  }

  async update(id: string, dto: Partial<CreateRoleDto>) {
    await this.findOne(id);
    return this.prisma.role.update({
      where: { id },
      data: { ...dto, permissions: dto.permissions as object | undefined },
    });
  }
}
