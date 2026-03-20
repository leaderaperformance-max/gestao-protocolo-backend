import { Controller, Get, Param, Post, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { AttachmentsService } from './attachments.service';

interface AuthUser { id: string }

@ApiTags('Anexos')
@ApiBearerAuth()
@Controller()
export class AttachmentsController {
  constructor(private readonly attachmentsService: AttachmentsService) {}

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
  upload(
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() user: AuthUser,
  ) {
    return this.attachmentsService.upload(id, file, user.id);
  }

  @Get('requests/:id/attachments')
  @ApiOperation({ summary: 'Listar anexos de um protocolo' })
  @ApiResponse({ status: 200, description: 'Lista de anexos retornada com sucesso' })
  @ApiResponse({ status: 401, description: 'Token JWT ausente ou inválido' })
  @ApiResponse({ status: 404, description: 'Protocolo não encontrado' })
  findByRequest(@Param('id') id: string) {
    return this.attachmentsService.findByRequest(id);
  }

  @Get('attachments/:attachmentId/url')
  @ApiOperation({ summary: 'Obter URL assinada para download (válida 1h)' })
  @ApiResponse({ status: 200, description: 'URL assinada retornada com sucesso' })
  @ApiResponse({ status: 401, description: 'Token JWT ausente ou inválido' })
  @ApiResponse({ status: 404, description: 'Anexo não encontrado' })
  getSignedUrl(@Param('attachmentId') attachmentId: string) {
    return this.attachmentsService.getSignedUrl(attachmentId);
  }
}
