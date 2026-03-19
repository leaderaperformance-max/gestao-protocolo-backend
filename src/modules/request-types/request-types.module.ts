import { Module } from '@nestjs/common';
import { RequestTypesController } from './request-types.controller';
import { RequestTypesService } from './request-types.service';

@Module({
  controllers: [RequestTypesController],
  providers: [RequestTypesService],
  exports: [RequestTypesService],
})
export class RequestTypesModule {}
