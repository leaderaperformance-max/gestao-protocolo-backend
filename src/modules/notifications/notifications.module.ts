import { Module } from '@nestjs/common';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';
import { SlaScheduler } from './sla.scheduler';

@Module({
  controllers: [NotificationsController],
  providers: [NotificationsService, SlaScheduler],
  exports: [NotificationsService],
})
export class NotificationsModule {}
