import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import { DbConfigStore } from '../admin/db-config';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit {
  private static readonly log = new Logger('PrismaService');

  constructor() {
    const url = DbConfigStore.getActiveUrl();
    const cfg = DbConfigStore.load();
    PrismaService.log.log(`DB mode: ${cfg.mode} — ${DbConfigStore.maskUrl(url)}`);
    const pool = new Pool({ connectionString: url });
    const adapter = new PrismaPg(pool);
    super({ adapter });
  }

  async onModuleInit() {
    await this.$connect();
  }
}
