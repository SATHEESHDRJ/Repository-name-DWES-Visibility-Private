import {
  Body, Controller, Get, Post, Param, Query, UseGuards, NotFoundException,
} from '@nestjs/common';
import { JobsService } from './jobs.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { User } from '../data/mock-store';

@Controller('api/jobs')
@UseGuards(JwtAuthGuard, RolesGuard)
export class JobsController {
  constructor(private readonly jobsService: JobsService) {}

  @Get()
  @Roles('system_admin', 'prod_supervisor', 'ops_director', 'qaqc_engineer')
  async listJobs(
    @Query('project_code') projectCode?: string,
    @Query('frame_id') frameId?: string,
    @Query('limit') limit?: string,
  ) {
    const l = limit ? parseInt(limit, 10) : 50;
    return this.jobsService.listJobs({ projectCode, frameId, limit: l });
  }

  @Post('backup-export')
  @Roles('prod_supervisor', 'system_admin')
  async enqueueBackupExport(
    @CurrentUser() user: User,
    @Body() body?: { dry_run?: boolean; pre_operation?: boolean },
  ) {
    return this.jobsService.createJob({
      jobType: 'backup_export',
      projectCode: '',
      frameId: '',
      requestedBy: user.id,
      payload: {
        dryRun: body?.dry_run === true,
        preOperation: body?.pre_operation === true,
      },
      maxAttempts: 1,
    });
  }

  @Get(':id')
  @Roles('system_admin', 'prod_supervisor', 'ops_director', 'qaqc_engineer', 'wiring_technician')
  async getJob(@Param('id') id: string) {
    const job = await this.jobsService.getJob(id);
    if (!job) throw new NotFoundException(`Job ${id} not found`);
    return job;
  }

  @Post(':id/retry')
  @Roles('prod_supervisor', 'system_admin')
  async retryJob(@Param('id') id: string) {
    const retried = await this.jobsService.retryJob(id);
    if (!retried) throw new NotFoundException(`Job ${id} not found or cannot be retried`);
    return retried;
  }

  @Post(':id/cancel')
  @Roles('prod_supervisor', 'system_admin')
  async cancelJob(@Param('id') id: string) {
    const cancelled = await this.jobsService.cancelJob(id);
    if (!cancelled) throw new NotFoundException(`Job ${id} not found or cannot be cancelled`);
    return { id, cancelled: true };
  }
}
