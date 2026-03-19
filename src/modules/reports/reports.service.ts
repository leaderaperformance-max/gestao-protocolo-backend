import { Injectable } from '@nestjs/common';
import { RequestStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

// pdfmake dynamic imports to avoid type complexity
// eslint-disable-next-line @typescript-eslint/no-require-imports
const PdfPrinter = require('pdfmake') as new (fonts: object) => {
  createPdfKitDocument: (docDefinition: object) => NodeJS.EventEmitter & { end(): void };
};
// eslint-disable-next-line @typescript-eslint/no-require-imports
const pdfFonts = require('pdfmake/build/vfs_fonts') as Record<string, string>;

@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService) {}

  async generateRequestsReport(filters: {
    from?: string;
    to?: string;
    sectorCode?: string;
    requestTypeId?: string;
    status?: RequestStatus;
  }): Promise<Buffer> {
    type Where = {
      status?: RequestStatus;
      requestTypeId?: string;
      currentSector?: { code: string };
      createdAt?: { gte?: Date; lte?: Date };
    };
    const where: Where = {};
    if (filters.status) where.status = filters.status;
    if (filters.requestTypeId) where.requestTypeId = filters.requestTypeId;
    if (filters.sectorCode) where.currentSector = { code: filters.sectorCode };
    if (filters.from ?? filters.to) {
      where.createdAt = {};
      if (filters.from) where.createdAt.gte = new Date(filters.from);
      if (filters.to) where.createdAt.lte = new Date(filters.to);
    }

    const requests = await this.prisma.request.findMany({
      where,
      include: {
        requester: { select: { name: true, registrationNumber: true } },
        requestType: { select: { name: true } },
        currentSector: { select: { name: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    const fonts = {
      Roboto: {
        normal: Buffer.from(pdfFonts['Roboto-Regular.ttf'] ?? '', 'base64'),
        bold: Buffer.from(pdfFonts['Roboto-Medium.ttf'] ?? '', 'base64'),
        italics: Buffer.from(pdfFonts['Roboto-Italic.ttf'] ?? '', 'base64'),
        bolditalics: Buffer.from(pdfFonts['Roboto-MediumItalic.ttf'] ?? '', 'base64'),
      },
    };

    const printer = new PdfPrinter(fonts);
    const now = new Date();

    const tableBody = [
      [
        { text: 'Protocolo', bold: true },
        { text: 'Solicitante', bold: true },
        { text: 'Tipo', bold: true },
        { text: 'Status', bold: true },
        { text: 'Setor Atual', bold: true },
        { text: 'Data', bold: true },
      ],
      ...requests.map((r) => [
        r.protocolNumber,
        `${r.requester.name} (${r.requester.registrationNumber})`,
        r.requestType.name,
        r.status.replace(/_/g, ' '),
        r.currentSector.name,
        r.createdAt.toLocaleDateString('pt-BR'),
      ]),
    ];

    const docDefinition = {
      pageSize: 'A4',
      pageOrientation: 'landscape',
      content: [
        { text: 'Secretaria Municipal de Educação de Prainha - PA', style: 'header' },
        { text: 'Relatório de Protocolos', style: 'subheader' },
        { text: `Gerado em: ${now.toLocaleString('pt-BR')}`, style: 'meta' },
        { text: `Total de registros: ${requests.length}`, style: 'meta', margin: [0, 0, 0, 16] },
        {
          table: {
            headerRows: 1,
            widths: ['auto', '*', 'auto', 'auto', 'auto', 'auto'],
            body: tableBody,
          },
        },
      ],
      styles: {
        header: { fontSize: 14, bold: true, alignment: 'center' },
        subheader: { fontSize: 12, alignment: 'center', margin: [0, 4, 0, 4] },
        meta: { fontSize: 9, color: '#666', alignment: 'center' },
      },
    };

    return new Promise<Buffer>((resolve, reject) => {
      const pdfDoc = printer.createPdfKitDocument(docDefinition);
      const chunks: Buffer[] = [];
      pdfDoc.on('data', (chunk: Buffer) => chunks.push(chunk));
      pdfDoc.on('end', () => resolve(Buffer.concat(chunks)));
      pdfDoc.on('error', reject);
      pdfDoc.end();
    });
  }
}
