import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateRequestTypeDto } from './dto/create-request-type.dto';

@Injectable()
export class RequestTypesService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateRequestTypeDto, userId: string) {
    // Validate all sector codes in flow exist
    for (const code of dto.flow) {
      const sector = await this.prisma.sector.findUnique({ where: { code } });
      if (!sector) throw new BadRequestException(`Setor '${code}' não encontrado no fluxo`);
    }

    return this.prisma.requestType.create({
      data: {
        name: dto.name,
        slaDays: dto.slaDays,
        flow: dto.flow,
        isActive: dto.isActive ?? true,
        createdByUserId: userId,
      },
    });
  }

  findAll() {
    return this.prisma.requestType.findMany({
      where: { isActive: true },
      orderBy: { name: 'asc' },
    });
  }

  async findOne(id: string) {
    const rt = await this.prisma.requestType.findUnique({ where: { id } });
    if (!rt) throw new NotFoundException('Tipo de solicitação não encontrado');
    return rt;
  }

  async update(id: string, dto: Partial<CreateRequestTypeDto>, userId: string) {
    await this.findOne(id);
    if (dto.flow) {
      for (const code of dto.flow) {
        const sector = await this.prisma.sector.findUnique({ where: { code } });
        if (!sector) throw new BadRequestException(`Setor '${code}' não encontrado no fluxo`);
      }
    }
    return this.prisma.requestType.update({
      where: { id },
      data: {
        ...dto,
        flow: dto.flow ?? undefined,
      },
    });
  }

  async deactivate(id: string) {
    await this.findOne(id);
    await this.prisma.requestType.update({ where: { id }, data: { isActive: false } });
    return { message: 'Tipo de solicitação desativado' };
  }
}
