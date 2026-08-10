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
    // Explicit pool bounds: reconnect churn was measurable with pg's 10s idle
    // default; 5s connect timeout turns a dead DB into a fast error, not a hang.
    const pool = new Pool({
      connectionString: url,
      max: Number(process.env.DWES_PG_POOL_MAX) || 10,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 5_000,
    });
    const adapter = new PrismaPg(pool);
    super({ adapter });
  }

  async onModuleInit() {
    await this.$connect();
  }
}
