import { Module } from '@nestjs/common';
import { UploadService } from './upload.service';
import { UploadController } from './upload.controller';
import { GaFoundationModule } from '../ga-foundation/ga-foundation.module';
import { DrawingTbAnalysisModule } from '../drawing-tb-analysis/drawing-tb-analysis.module';

// Multipart handling is registered app-wide in main.ts (@fastify/multipart,
// limits in ./upload-limits). Controllers use DwesFileInterceptor.
@Module({
  imports: [GaFoundationModule, DrawingTbAnalysisModule],
  providers: [UploadService],
  controllers: [UploadController],
  exports: [UploadService],
})
export class UploadModule {}
