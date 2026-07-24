import { Module } from '@nestjs/common';
import { FramesService } from './frames.service';
import { FramesController } from './frames.controller';
import { ProjectsModule } from '../projects/projects.module';

@Module({
  imports: [ProjectsModule],
  providers: [FramesService],
  controllers: [FramesController],
  exports: [FramesService],
})
export class FramesModule {}
