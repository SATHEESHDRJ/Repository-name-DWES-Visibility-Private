import { Module } from '@nestjs/common';
import { Flat3dConversionService } from './flat3d-conversion.service';

@Module({
  providers: [Flat3dConversionService],
  exports: [Flat3dConversionService],
})
export class Flat3dConversionModule {}
