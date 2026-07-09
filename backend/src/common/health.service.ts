import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class HealthService {
  constructor(private readonly prisma: PrismaService) {}

  async check() {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
    } catch {
      throw new ServiceUnavailableException({
        status: 'degraded',
        db: 'unreachable',
        db_name: 'WiringSchemeDB',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
      });
    }

    return {
      status: 'ok',
      db: 'connected',
      db_name: 'WiringSchemeDB',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
    };
  }
}
