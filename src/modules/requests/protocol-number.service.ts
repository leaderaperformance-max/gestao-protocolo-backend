import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class ProtocolNumberService {
  constructor(private readonly prisma: PrismaService) {}

  async generate(sectorCode: string): Promise<string> {
    const year = new Date().getFullYear();

    const record = await this.prisma.$transaction(async (tx) => {
      return tx.protocolSequence.upsert({
        where: { year_sectorCode: { year, sectorCode } },
        update: { lastSequence: { increment: 1 } },
        create: { year, sectorCode, lastSequence: 1 },
      });
    });

    return `${year}-${sectorCode}-${String(record.lastSequence).padStart(6, '0')}`;
  }
}
