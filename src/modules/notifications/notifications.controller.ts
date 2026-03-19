import { Controller, Get, Patch, Param } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { NotificationsService } from './notifications.service';

interface AuthUser { id: string }

@ApiTags('notifications')
@ApiBearerAuth()
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Get()
  @ApiOperation({ summary: 'Listar minhas notificações (últimas 50)' })
  findAll(@CurrentUser() user: AuthUser) {
    return this.notificationsService.findAll(user.id);
  }

  @Get('unread-count')
  @ApiOperation({ summary: 'Contagem de notificações não lidas' })
  unreadCount(@CurrentUser() user: AuthUser) {
    return this.notificationsService.unreadCount(user.id);
  }

  @Patch(':id/read')
  @ApiOperation({ summary: 'Marcar notificação como lida' })
  markAsRead(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.notificationsService.markAsRead(id, user.id);
  }

  @Patch('read-all')
  @ApiOperation({ summary: 'Marcar todas as notificações como lidas' })
  markAllAsRead(@CurrentUser() user: AuthUser) {
    return this.notificationsService.markAllAsRead(user.id);
  }
}
