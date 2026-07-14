import { Module } from '@nestjs/common';
import { MulterModule } from '@nestjs/platform-express';
import { UploadService } from './upload.service';
import { UploadController } from './upload.controller';

const configuredUploadMb = Number(process.env.DWES_MAX_UPLOAD_MB || 250);
const uploadLimitMb = Number.isFinite(configuredUploadMb)
  ? Math.min(1024, Math.max(1, Math.floor(configuredUploadMb)))
  : 250;

@Module({
  // Engineering PDF/IFC/STEP/GLB sources frequently exceed 50 MB. Keep the cap
  // explicit and configurable while retaining the current in-memory upload flow.
  imports: [MulterModule.register({ storage: undefined, limits: { fileSize: uploadLimitMb * 1024 * 1024 } })],
  providers: [UploadService],
  controllers: [UploadController],
  exports: [UploadService],
})
export class UploadModule {}
