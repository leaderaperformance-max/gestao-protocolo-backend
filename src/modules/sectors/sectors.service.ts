import { Injectable, ConflictException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateSectorDto } from './dto/create-sector.dto';

@Injectable()
export class SectorsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateSectorDto) {
    const existing = await this.prisma.sector.findUnique({ where: { code: dto.code } });
    if (existing) throw new ConflictException(`Setor com código '${dto.code}' já existe`);
    return this.prisma.sector.create({ data: dto });
  }

  findAll() {
    return this.prisma.sector.findMany({
      where: { isActive: true },
      orderBy: { name: 'asc' },
    });
  }

  async findOne(id: string) {
    const sector = await this.prisma.sector.findUnique({ where: { id } });
    if (!sector) throw new NotFoundException('Setor não encontrado');
    return sector;
  }

  async update(id: string, dto: Partial<CreateSectorDto>) {
    await this.findOne(id);
    return this.prisma.sector.update({ where: { id }, data: dto });
  }

  async remove(id: string) {
    await this.findOne(id);
    await this.prisma.sector.update({ where: { id }, data: { isActive: false } });
    return { message: 'Setor desativado com sucesso' };
  }
}
