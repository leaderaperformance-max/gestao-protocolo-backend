import { Module } from '@nestjs/common';
import { ProtocolNumberService } from './protocol-number.service';
import { RequestsController } from './requests.controller';
import { RequestsService } from './requests.service';

@Module({
  controllers: [RequestsController],
  providers: [RequestsService, ProtocolNumberService],
  exports: [RequestsService, ProtocolNumberService],
})
export class RequestsModule {}
