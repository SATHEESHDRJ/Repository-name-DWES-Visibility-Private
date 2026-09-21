import { Module } from '@nestjs/common';
import { TechModule } from '../tech/tech.module';
import { PanelWorkflowController } from './panel-workflow.controller';
import { PanelWorkflowService } from './panel-workflow.service';

@Module({
  imports: [TechModule],
  controllers: [PanelWorkflowController],
  providers: [PanelWorkflowService],
  exports: [PanelWorkflowService],
})
export class PanelWorkflowModule {}
