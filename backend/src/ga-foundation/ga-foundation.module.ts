import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { CadProviderRegistry, LocalLibreDwgProvider } from './cad-conversion.provider';
import { GaFoundationController } from './ga-foundation.controller';
import { GaFoundationService } from './ga-foundation.service';
import { JobQueueService } from './job-queue.service';

@Module({
  imports: [PrismaModule],
  controllers: [GaFoundationController],
  providers: [JobQueueService, LocalLibreDwgProvider, CadProviderRegistry, GaFoundationService],
  exports: [JobQueueService, GaFoundationService, CadProviderRegistry],
})
export class GaFoundationModule {}
