import { Module } from '@nestjs/common';
import { AuditLogsModule } from '../audit-logs/audit-logs.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { ProtocolNumberService } from './protocol-number.service';
import { RequestsController } from './requests.controller';
import { RequestsService } from './requests.service';

@Module({
  imports: [AuditLogsModule, NotificationsModule],
  controllers: [RequestsController],
  providers: [RequestsService, ProtocolNumberService],
  exports: [RequestsService, ProtocolNumberService],
})
export class RequestsModule {}
