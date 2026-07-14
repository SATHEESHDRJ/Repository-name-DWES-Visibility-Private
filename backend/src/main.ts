import 'dotenv/config';
import 'reflect-metadata';
import { writeFileSync } from 'fs';
import { networkInterfaces } from 'os';
import * as path from 'path';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import { FrameStore } from './frames/frame-store';
import { CANONICAL_SEED_PROJECTS } from './common/seed-projects';
import { allowStartupSeed } from './common/demo-mode.util';
import { loadDemoAccounts } from './common/demo-accounts';
import { PANEL_DELETION_FILE_TYPE } from './common/deleted-resource.util';
import * as bcrypt from 'bcryptjs';

const SEED_PROJECTS = CANONICAL_SEED_PROJECTS;

function lanIpv4Addresses(): string[] {
  const addrs: string[] = [];
  for (const ifaces of Object.values(networkInterfaces())) {
    for (const iface of ifaces ?? []) {
      if (iface.family === 'IPv4' && !iface.internal) addrs.push(iface.address);
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
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
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

  if (allowStartupSeed()) {
    for (const p of SEED_PROJECTS) {
      const exists = await prisma.projects.findUnique({ where: { code: p.code } });
      if (!exists) {
        await prisma.projects.create({ data: { ...p, is_active: true } });
        console.log(`[DWES] Imported project: ${p.code}`);
      }
    }
  }

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

  const app = await NestFactory.create(AppModule, { logger: ['error', 'warn', 'log'] });

  app.use((req: any, res: any, next: () => void) => {
    if (req.method === 'GET' && req.path?.startsWith('/api/')) {
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
    }
    next();
  });

  if (process.env.TRUST_PROXY === 'true') {
    const http = app.getHttpAdapter().getInstance();
    if (typeof http?.set === 'function') http.set('trust proxy', 1);
  }

  try {
    const helmet = (await import('helmet')).default;
    app.use(helmet({
      contentSecurityPolicy: false,
      crossOriginEmbedderPolicy: false,
    }));
  } catch {
    console.warn('[DWES] helmet not installed — security headers rely on reverse proxy');
  }

  app.enableCors({
    origin: resolveCorsOrigins(),
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
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
