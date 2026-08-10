import { Module } from '@nestjs/common';
import { QAQCController } from './qaqc.controller';
import { QAQCService } from './qaqc.service';

@Module({
  controllers: [QAQCController],
  providers: [QAQCService],
})
export class QAQCModule {}
