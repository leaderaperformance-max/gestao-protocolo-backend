import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { TramitationsController } from './tramitations.controller';
import { TramitationsService } from './tramitations.service';

@Module({
  imports: [NotificationsModule],
  controllers: [TramitationsController],
  providers: [TramitationsService],
})
export class TramitationsModule {}
