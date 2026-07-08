import { Module } from '@nestjs/common';
import { SupervisorService } from './supervisor.service';
import { SupervisorController } from './supervisor.controller';
import { TechModule } from '../tech/tech.module';

@Module({
  imports: [TechModule],
  providers: [SupervisorService],
  controllers: [SupervisorController],
  exports: [SupervisorService],
})
export class SupervisorModule {}
