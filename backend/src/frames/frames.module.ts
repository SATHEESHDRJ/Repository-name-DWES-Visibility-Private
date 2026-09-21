import { Module } from '@nestjs/common';
import { FramesService } from './frames.service';
import { FramesController } from './frames.controller';
import { ProjectsModule } from '../projects/projects.module';
import { PanelModelService } from '../panel-model/panel-model.service';
import { Flat3dConversionModule } from '../flat3d-conversion/flat3d-conversion.module';

@Module({
  imports: [ProjectsModule, Flat3dConversionModule],
  providers: [FramesService, PanelModelService],
  controllers: [FramesController],
  exports: [FramesService],
})
export class FramesModule {}
