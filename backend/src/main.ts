import 'dotenv/config';
import 'reflect-metadata';
import { writeFileSync } from 'fs';
import { networkInterfaces } from 'os';
import * as path from 'path';
import { randomUUID } from 'crypto';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import fastifyHelmet from '@fastify/helmet';
import fastifyMultipart from '@fastify/multipart';
import { AppModule } from './app.module';
import { UPLOAD_LIMIT_BYTES } from './upload/upload-limits';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import { FrameStore } from './frames/frame-store';
import { allowStartupSeed } from './common/demo-mode.util';
import { loadDemoAccounts } from './common/demo-accounts';
import { PANEL_DELETION_FILE_TYPE } from './common/deleted-resource.util';
import * as bcrypt from 'bcryptjs';

function lanIpv4Addresses(): string[] {
  const addrs: string[] = [];
  for (const ifaces of Object.values(networkInterfaces())) {
    for (const iface of ifaces ?? []) {
      if (iface.family !== 'IPv4' || iface.internal) continue;
      const ip = iface.address;
      // Skip APIPA / link-local — not useful for tablet LAN demos
      if (ip.startsWith('169.254.')) continue;
      addrs.push(ip);
    }
  }
  return addrs;
}

function buildCorsOrigins(): (string | RegExp)[] {
  const ports = [5173, 5174, 5175, 4173];
  const schemes = ['http', 'https'] as const;
  const origins: (string | RegExp)[] = [];

  for (const scheme of schemes) {
    origins.push(`${scheme}://localhost:5173`);
    origins.push(`${scheme}://localhost:5174`);
    origins.push(`${scheme}://localhost:5175`);
    origins.push(`${scheme}://127.0.0.1:5173`);
    origins.push(`${scheme}://127.0.0.1:5174`);
    origins.push(`${scheme}://127.0.0.1:5175`);
    origins.push(`${scheme}://localhost:4173`);
    origins.push(`${scheme}://127.0.0.1:4173`);
    for (const ip of lanIpv4Addresses()) {
      for (const port of ports) origins.push(`${scheme}://${ip}:${port}`);
    }
  }

  // Any private-LAN origin on dev ports (handles DHCP changes without restart)
  for (const scheme of schemes) {
    origins.push(new RegExp(`^${scheme}:\\/\\/192\\.168\\.\\d{1,3}\\.\\d{1,3}:(5173|5174|5175|4173)$`));
    origins.push(new RegExp(`^${scheme}:\\/\\/10\\.\\d{1,3}\\.\\d{1,3}\\.\\d{1,3}:(5173|5174|5175|4173)$`));
    origins.push(new RegExp(`^${scheme}:\\/\\/172\\.(1[6-9]|2\\d|3[01])\\.\\d{1,3}\\.\\d{1,3}:(5173|5174|5175|4173)$`));
  }

  const lanHostname = process.env.DWES_HOSTNAME?.trim() || 'dwes.local';
  for (const scheme of schemes) {
    for (const port of ports) origins.push(`${scheme}://${lanHostname}:${port}`);
  }

  return origins;
}

function resolveCorsOrigins(): (string | RegExp)[] {
  const fromEnv = process.env.CORS_ORIGINS?.trim();
  if (fromEnv) {
    return fromEnv.split(',').map(s => s.trim()).filter(Boolean);
  }
  return buildCorsOrigins();
}

function assertProductionSecrets() {
  if (process.env.NODE_ENV === 'production' && !process.env.JWT_SECRET?.trim()) {
    throw new Error('[DWES] JWT_SECRET is required when NODE_ENV=production');
  }
}

function getRuntimePortFilePath() {
  return path.resolve(__dirname, '..', '.dwes-port');
}

function writeRuntimePort(port: number) {
  try {
    writeFileSync(getRuntimePortFilePath(), String(port), 'utf8');
  } catch (err) {
    console.warn('[DWES] Could not persist runtime port file:', err);
  }
}

async function listenWithFallback(app: Awaited<ReturnType<typeof NestFactory.create>>, host: string, requestedPort: number) {
  let port = requestedPort;
  // Launcher sets DWES_MODE=dev — keep Nest on :3001 so Vite proxy stays aligned.
  const strictPort = process.env.DWES_MODE === 'dev';
  const maxAttempts = strictPort ? 1 : 10;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    try {
      await app.listen(port, host);
      writeRuntimePort(port);
      return port;
    } catch (err: any) {
      if (err?.code !== 'EADDRINUSE' || attempt === maxAttempts - 1) {
        throw err;
      }
      console.warn(`[DWES] Port ${port} is busy; trying ${port + 1}...`);
      port += 1;
    }
  }

  throw new Error(`Unable to listen on a free port near ${requestedPort}`);
}

async function bootstrap() {
  assertProductionSecrets();
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    max: Number(process.env.DWES_PG_POOL_MAX) || 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
  });
  const adapter = new PrismaPg(pool);
  const prisma = new PrismaClient({ adapter });
  await prisma.$connect();

  const userCount = await prisma.users.count();
  if (userCount === 0 && allowStartupSeed()) {
    const seedUsers = loadDemoAccounts();
    console.log('[DWES] Users table empty — seeding users from the private demo account file...');
    for (const u of seedUsers) {
      const hashed = await bcrypt.hash(u.password, 10);
      await prisma.users.create({
        data: { username: u.username, hashed_password: hashed, full_name: u.full_name,
                employee_id: u.employee_id, role: u.role, whatsapp_number: u.whatsapp_number, is_active: true },
      });
    }
    console.log(`[DWES] Seeded ${seedUsers.length} users`);
  } else if (userCount === 0) {
    console.log('[DWES] Users table empty — skipping seed (production; restore DB or set DEMO_MODE=true)');
  } else {
    console.log(`[DWES] Found ${userCount} existing users — skipping seed`);
  }

  // Projects are never seeded at startup — every project is created by a
  // supervisor through the app (demo seed logic removed 2026-07-15).

  // The database decides which file-backed records may be loaded. Deleted JSON
  // and backup content must never become application state again.
  const activeProjects = await prisma.projects.findMany({
    where: { is_active: true },
    select: { code: true },
  });
  const panelTombstones = await prisma.file_hashes.findMany({
    where: { file_type: PANEL_DELETION_FILE_TYPE },
    select: { project_code: true, file_name: true },
  });
  const deletedPanelIdsByProject = new Map<string, Set<string>>();
  for (const row of panelTombstones) {
    const ids = deletedPanelIdsByProject.get(row.project_code) ?? new Set<string>();
    ids.add(row.file_name);
    deletedPanelIdsByProject.set(row.project_code, ids);
  }

  await prisma.$disconnect();

  FrameStore.loadAll({
    activeProjectCodes: new Set(activeProjects.map(project => project.code)),
    deletedPanelIdsByProject,
  });

  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter({
      // Same semantics as Express `trust proxy: 1` — only honoured when the
      // deployment explicitly opts in (nginx in front).
      trustProxy: process.env.TRUST_PROXY === 'true' ? 1 : false,
      // Express's JSON body-parser default was 100KB; Fastify's is 1MiB.
      // 5MiB keeps headroom for large cable_status/mapping JSON payloads
      // while remaining bounded. File uploads use multipart, not this limit.
      bodyLimit: 5 * 1024 * 1024,
    }),
    { logger: ['error', 'warn', 'log'] },
  );

  app.useGlobalPipes(new ValidationPipe({
    whitelist: true,
    transform: true,
  }));

  const fastify = app.getHttpAdapter().getInstance();

  // API responses are live production state — never cacheable. File endpoints
  // that implement their own validation-based caching (ETag/Range) opt out
  // here; everything else keeps the historical no-store contract.
  const CACHE_EXEMPT_API_PATHS: RegExp[] = [];
  fastify.addHook('onRequest', (req, reply, done) => {
    const rawReqId = req.headers['x-request-id'];
    const requestId = typeof rawReqId === 'string' && rawReqId.length > 0 ? rawReqId : randomUUID();
    reply.header('x-request-id', requestId);
    (req as any).requestId = requestId;

    if (req.method === 'GET' && req.url.startsWith('/api/')
        && !CACHE_EXEMPT_API_PATHS.some(rx => rx.test(req.url))) {
      reply.header('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
      reply.header('Pragma', 'no-cache');
      reply.header('Expires', '0');
    }
    done();
  });

  try {
    await app.register(fastifyHelmet, {
      contentSecurityPolicy: false,
      crossOriginEmbedderPolicy: false,
    });
  } catch {
    console.warn('[DWES] helmet not installed — security headers rely on reverse proxy');
  }

  // Multipart uploads (wiring schedules, drawings, director reports).
  // Limits mirror the previous Multer memory-storage setup: one file per
  // request, DWES_MAX_UPLOAD_MB cap, 1MiB per text field (Multer's default).
  await app.register(fastifyMultipart, {
    limits: {
      fileSize: UPLOAD_LIMIT_BYTES,
      files: 1,
      fields: 20,
      fieldSize: 1024 * 1024,
    },
  });

  app.enableCors({
    origin: resolveCorsOrigins(),
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Idempotency-Key', 'X-Request-Id'],
  });

  const requestedPort = Number(process.env.PORT) || 3001;
  const HOST = process.env.HOST || '0.0.0.0';
  const PORT = await listenWithFallback(app, HOST, requestedPort);

  console.log(`[DWES] Backend running → http://localhost:${PORT}`);
  for (const ip of lanIpv4Addresses()) {
    console.log(`[DWES] LAN backend      → http://${ip}:${PORT}`);
  }
  console.log(`[DWES] Health check   → http://localhost:${PORT}/api/health`);
  console.log(`[DWES] Database       → WiringSchemeDB (PostgreSQL)`);
}

bootstrap().catch((err) => {
  console.error('[DWES] Fatal startup error:', err);
  process.exit(1);
});
