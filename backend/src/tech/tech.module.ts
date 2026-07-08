import { Module } from '@nestjs/common';
import { TechService } from './tech.service';
import { TechController } from './tech.controller';

@Module({
  providers: [TechService],
  controllers: [TechController],
  exports: [TechService],
})
export class TechModule {}
