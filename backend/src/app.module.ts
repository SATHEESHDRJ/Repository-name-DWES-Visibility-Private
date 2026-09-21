import { Module } from '@nestjs/common';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ThrottlerModule } from '@nestjs/throttler';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { ProjectsModule } from './projects/projects.module';
import { FramesModule } from './frames/frames.module';
import { UploadModule } from './upload/upload.module';
import { SupervisorModule } from './supervisor/supervisor.module';
import { TechModule } from './tech/tech.module';
import { QAQCModule } from './qaqc/qaqc.module';
import { DirectorModule } from './director/director.module';
import { AdminModule } from './admin/admin.module';
import { DevModule } from './dev/dev.module';
import { DwesThrottlerGuard } from './common/guards/dwes-throttler.guard';
import { IdempotencyInterceptor } from './common/guards/idempotency.interceptor';
import { HealthModule } from './common/health.module';
import { DashboardCacheModule } from './common/cache/dashboard-cache.module';
import { JobsModule } from './jobs/jobs.module';
import { EventsModule } from './events/events.module';
import { EngineeringModule } from './engineering/engineering.module';
import { GaFoundationModule } from './ga-foundation/ga-foundation.module';
import { Flat3dConversionModule } from './flat3d-conversion/flat3d-conversion.module';
import { PanelWorkflowModule } from './panel-workflow/panel-workflow.module';
import { TbMarkersModule } from './tb-markers/tb-markers.module';
import { DrawingTbAnalysisModule } from './drawing-tb-analysis/drawing-tb-analysis.module';

@Module({
  imports: [
    ThrottlerModule.forRoot([{
      name: 'default',
      ttl: 60_000,
      // Env override exists for load/benchmark harnesses only; production keeps 120.
      limit: Number(process.env.DWES_THROTTLE_LIMIT) || 120,
    }]),
    PrismaModule,
    DashboardCacheModule,
    JobsModule,
    HealthModule,
    EventsModule,
    AuthModule,
    UsersModule,
    ProjectsModule,
    FramesModule,
    GaFoundationModule,
    Flat3dConversionModule,
    UploadModule,
    SupervisorModule,
    TechModule,
    QAQCModule,
    DirectorModule,
    AdminModule,
    DevModule,
    EngineeringModule,
    PanelWorkflowModule,
    TbMarkersModule,
    DrawingTbAnalysisModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: DwesThrottlerGuard },
    { provide: APP_INTERCEPTOR, useClass: IdempotencyInterceptor },
  ],
})
export class AppModule {}
