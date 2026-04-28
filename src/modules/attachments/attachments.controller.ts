import { Body, Controller, Get, Param, Patch, Post, Req, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import * as express from 'express';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { AuditService } from '../audit-logs/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../../prisma/prisma.service';
import { AttachmentsService } from './attachments.service';

interface AuthUser { id: string }

@ApiTags('Anexos')
@ApiBearerAuth()
@Controller()
export class AttachmentsController {
  constructor(
    private readonly attachmentsService: AttachmentsService,
    private readonly auditService: AuditService,
    private readonly notifications: NotificationsService,
    private readonly prisma: PrismaService,
  ) {}

  @Post('requests/:id/attachments')
  @RequirePermission('send')
  @UseInterceptors(FileInterceptor('file'))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Fazer upload de anexo (PDF/JPEG, max 5MB)' })
  @ApiResponse({ status: 201, description: 'Anexo enviado com sucesso' })
  @ApiResponse({ status: 400, description: 'Arquivo inválido ou tamanho excedido' })
  @ApiResponse({ status: 401, description: 'Token JWT ausente ou inválido' })
  @ApiResponse({ status: 403, description: 'Sem permissão para esta ação' })
  @ApiResponse({ status: 404, description: 'Protocolo não encontrado' })
  async upload(
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() user: AuthUser,
    @Req() req: express.Request,
  ) {
    const result = await this.attachmentsService.upload(id, file, user.id);

    this.auditService.log({
      actorUserId: user.id,
      action: 'UPLOAD_ATTACHMENT',
      entityType: 'Attachment',
      entityId: result.id,
      payloadAfter: { filename: result.filename, mimeType: result.mimeType, sizeBytes: result.sizeBytes, requestId: id },
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });

    // Notify users in the protocol's current sector about the new attachment (fire-and-forget)
    void (async () => {
      const request = await this.prisma.request.findUnique({
        where: { id },
        select: { protocolNumber: true, currentSectorId: true, requesterId: true },
      });
      if (!request) return;
      const sectorUsers = await this.prisma.user.findMany({
        where: { sectorId: request.currentSectorId, isActive: true },
      });
      const usersToNotify = new Set(
        [...sectorUsers.map((u) => u.id), request.requesterId].filter((uid) => uid !== user.id),
      );
      await Promise.all(
        [...usersToNotify].map((uid) =>
          this.notifications.create({
            userId: uid,
            title: 'Novo anexo adicionado',
            body: `Arquivo "${result.filename}" foi anexado ao protocolo ${request.protocolNumber}`,
            type: 'ATTACHMENT_ADDED',
            relatedRequestId: id,
          }),
        ),
      );
    })().catch(() => {});

    return result;
  }

  @Get('requests/:id/attachments')
  @ApiOperation({ summary: 'Listar anexos de um protocolo' })
  @ApiResponse({ status: 200, description: 'Lista de anexos retornada com sucesso' })
  @ApiResponse({ status: 401, description: 'Token JWT ausente ou inválido' })
  @ApiResponse({ status: 404, description: 'Protocolo não encontrado' })
  findByRequest(@Param('id') id: string) {
    return this.attachmentsService.findByRequest(id);
  }

  @Patch('attachments/:attachmentId/rename')
  @RequirePermission('send')
  @ApiOperation({ summary: 'Renomear um anexo' })
  @ApiResponse({ status: 200, description: 'Anexo renomeado com sucesso' })
  @ApiResponse({ status: 400, description: 'Nome inválido' })
  @ApiResponse({ status: 401, description: 'Token JWT ausente ou inválido' })
  @ApiResponse({ status: 404, description: 'Anexo não encontrado' })
  async rename(
    @Param('attachmentId') attachmentId: string,
    @Body('filename') filename: string,
    @CurrentUser() user: AuthUser,
    @Req() req: express.Request,
  ) {
    const before = await this.attachmentsService.findById(attachmentId);
    const result = await this.attachmentsService.rename(attachmentId, filename);

    this.auditService.log({
      actorUserId: user.id,
      action: 'RENAME_ATTACHMENT',
      entityType: 'Attachment',
      entityId: attachmentId,
      payloadBefore: before ? { filename: before.filename } : null,
      payloadAfter: { filename: result.filename },
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });

    return result;
  }

  @Get('attachments/:attachmentId/url')
  @ApiOperation({ summary: 'Obter URL assinada para download (válida 1h)' })
  @ApiResponse({ status: 200, description: 'URL assinada retornada com sucesso' })
  @ApiResponse({ status: 401, description: 'Token JWT ausente ou inválido' })
  @ApiResponse({ status: 404, description: 'Anexo não encontrado' })
  async getSignedUrl(
    @Param('attachmentId') attachmentId: string,
    @CurrentUser() user: AuthUser,
    @Req() req: express.Request,
  ) {
    const result = await this.attachmentsService.getSignedUrl(attachmentId);

    this.auditService.log({
      actorUserId: user.id,
      action: 'VIEW_ATTACHMENT',
      entityType: 'Attachment',
      entityId: attachmentId,
      payloadAfter: { filename: result.filename },
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });

    return result;
  }
}
