import { Module } from '@nestjs/common';
import { UploadService } from './upload.service';
import { UploadController } from './upload.controller';

// Multipart handling is registered app-wide in main.ts (@fastify/multipart,
// limits in ./upload-limits). Controllers use DwesFileInterceptor.
@Module({
  providers: [UploadService],
  controllers: [UploadController],
  exports: [UploadService],
})
export class UploadModule {}
