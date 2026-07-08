import { Module } from '@nestjs/common';
import { ProjectsService } from './projects.service';
import { ProjectsController } from './projects.controller';
import { WiringDocumentService } from './wiring-document.service';

@Module({
  providers: [ProjectsService, WiringDocumentService],
  controllers: [ProjectsController],
  exports: [ProjectsService, WiringDocumentService],
})
export class ProjectsModule {}
