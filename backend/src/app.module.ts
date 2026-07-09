import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
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
import { HealthModule } from './common/health.module';

@Module({
  imports: [
    ThrottlerModule.forRoot([{
      name: 'default',
      ttl: 60_000,
      limit: 120,
    }]),
    PrismaModule,
    HealthModule,
    AuthModule,
    UsersModule,
    ProjectsModule,
    FramesModule,
    UploadModule,
    SupervisorModule,
    TechModule,
    QAQCModule,
    DirectorModule,
    AdminModule,
    DevModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: DwesThrottlerGuard },
  ],
})
export class AppModule {}
