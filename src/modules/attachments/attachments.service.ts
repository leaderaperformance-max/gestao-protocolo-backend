import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { SupabaseService } from '../../supabase/supabase.service';

const ALLOWED_MIME_TYPES = new Set(['application/pdf', 'image/jpeg']);
const MAX_SIZE_BYTES = 5 * 1024 * 1024; // 5MB

@Injectable()
export class AttachmentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly supabase: SupabaseService,
  ) {}

  async upload(requestId: string, file: Express.Multer.File, userId: string) {
    if (!ALLOWED_MIME_TYPES.has(file.mimetype)) {
      throw new BadRequestException('Apenas PDF e JPEG são permitidos');
    }
    if (file.size > MAX_SIZE_BYTES) {
      throw new BadRequestException('Arquivo excede o limite de 5MB');
    }

    const request = await this.prisma.request.findUnique({ where: { id: requestId } });
    if (!request) throw new NotFoundException('Protocolo não encontrado');

    const ext = file.mimetype === 'application/pdf' ? 'pdf' : 'jpg';
    const storagePath = `${requestId}/${Date.now()}-${file.originalname}.${ext}`;

    const { error } = await this.supabase.storage
      .from(this.supabase.bucket)
      .upload(storagePath, file.buffer, { contentType: file.mimetype });

    if (error) throw new BadRequestException(`Erro no upload: ${error.message}`);

    return this.prisma.attachment.create({
      data: {
        requestId,
        uploadedByUserId: userId,
        filename: file.originalname,
        storagePath,
        mimeType: file.mimetype,
        sizeBytes: file.size,
      },
    });
  }

  async getSignedUrl(attachmentId: string) {
    const attachment = await this.prisma.attachment.findUnique({ where: { id: attachmentId } });
    if (!attachment) throw new NotFoundException('Anexo não encontrado');

    const { data, error } = await this.supabase.storage
      .from(this.supabase.bucket)
      .createSignedUrl(attachment.storagePath, 3600); // 1 hour

    if (error) throw new BadRequestException(`Erro ao gerar URL: ${error.message}`);
    return { url: data.signedUrl, filename: attachment.filename };
  }

  async findByRequest(requestId: string) {
    return this.prisma.attachment.findMany({
      where: { requestId },
      include: { uploadedBy: { select: { id: true, name: true } } },
      orderBy: { uploadedAt: 'desc' },
    });
  }
}
