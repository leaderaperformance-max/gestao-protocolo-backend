import { Module } from '@nestjs/common';
import { AuditLogsModule } from '../audit-logs/audit-logs.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { TramitationsController } from './tramitations.controller';
import { TramitationsService } from './tramitations.service';

@Module({
  imports: [NotificationsModule, AuditLogsModule],
  controllers: [TramitationsController],
  providers: [TramitationsService],
})
export class TramitationsModule {}
