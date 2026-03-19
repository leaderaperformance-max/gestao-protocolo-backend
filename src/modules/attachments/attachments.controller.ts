import { Controller, Get, Param, Post, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { AttachmentsService } from './attachments.service';

interface AuthUser { id: string }

@ApiTags('attachments')
@ApiBearerAuth()
@Controller()
export class AttachmentsController {
  constructor(private readonly attachmentsService: AttachmentsService) {}

  @Post('requests/:id/attachments')
  @RequirePermission('send')
  @UseInterceptors(FileInterceptor('file'))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Fazer upload de anexo (PDF/JPEG, max 5MB)' })
  upload(
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() user: AuthUser,
  ) {
    return this.attachmentsService.upload(id, file, user.id);
  }

  @Get('requests/:id/attachments')
  @ApiOperation({ summary: 'Listar anexos de um protocolo' })
  findByRequest(@Param('id') id: string) {
    return this.attachmentsService.findByRequest(id);
  }

  @Get('attachments/:attachmentId/url')
  @ApiOperation({ summary: 'Obter URL assinada para download (válida 1h)' })
  getSignedUrl(@Param('attachmentId') attachmentId: string) {
    return this.attachmentsService.getSignedUrl(attachmentId);
  }
}
