import { Module } from '@nestjs/common';
import { FramesService } from './frames.service';
import { FramesController } from './frames.controller';
import { ProjectsModule } from '../projects/projects.module';
import { PanelModelService } from '../panel-model/panel-model.service';

@Module({
  imports: [ProjectsModule],
  providers: [FramesService, PanelModelService],
  controllers: [FramesController],
  exports: [FramesService],
})
export class FramesModule {}
