import { Module } from '@nestjs/common';
import { AuditLogsController } from './audit-logs.controller';
import { AuditLogsService } from './audit-logs.service';
import { AuditService } from './audit.service';

@Module({
  controllers: [AuditLogsController],
  providers: [AuditLogsService, AuditService],
  exports: [AuditService],
})
export class AuditLogsModule {}
