import { Module } from '@nestjs/common';
import { TechService } from './tech.service';
import { TechController } from './tech.controller';
import { GaFoundationModule } from '../ga-foundation/ga-foundation.module';

@Module({
  imports: [GaFoundationModule],
  providers: [TechService],
  controllers: [TechController],
  exports: [TechService],
})
export class TechModule {}
