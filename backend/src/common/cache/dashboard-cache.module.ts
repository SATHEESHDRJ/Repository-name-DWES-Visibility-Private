import { Global, Module } from '@nestjs/common';
import { DashboardCacheService } from './dashboard-cache.service';
import { PrismaModule } from '../../prisma/prisma.module';

@Global()
@Module({
  imports: [PrismaModule],
  providers: [DashboardCacheService],
  exports: [DashboardCacheService],
})
export class DashboardCacheModule {}
