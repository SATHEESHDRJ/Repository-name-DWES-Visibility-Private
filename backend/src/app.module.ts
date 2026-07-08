import { Module } from '@nestjs/common';
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

@Module({
  imports: [
    PrismaModule,
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
})
export class AppModule {}
