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
import * as bcrypt from 'bcryptjs';

const SEED_USERS = [
  { username: 'sysadmin',      password: 'admin123',        full_name: 'System Administrator', employee_id: 'EMP-001',     role: 'system_admin',      whatsapp_number: '+966500000001' },
  { username: 'director1',     password: 'dir123',          full_name: 'Operations Director',   employee_id: 'EMP-005',     role: 'ops_director',      whatsapp_number: '+966500000002' },
  { username: 'ops_director1', password: 'ops_director123', full_name: 'Operations Director',   employee_id: 'EMP-DIR-001', role: 'ops_director',      whatsapp_number: '+966500000003' },
  { username: 'supervisor1',   password: 'super123',        full_name: 'Production Supervisor', employee_id: 'EMP-020',     role: 'prod_supervisor',   whatsapp_number: '+966500000004' },
  { username: 'qa1',           password: 'qa1',             full_name: 'QA Engineer One',       employee_id: 'EMP-010',     role: 'qaqc_engineer',     whatsapp_number: '+966500000005' },
  { username: 'qa2',           password: 'qa2',             full_name: 'QA Engineer Two',       employee_id: 'EMP-011',     role: 'qaqc_engineer',     whatsapp_number: '+966500000006' },
];

const SEED_PROJECTS = [
  { code: 'DEWA_Project_001',    client: 'DEWA',    name: 'DEWA Protection Panel 001',  description: 'DEWA substation protection panel', sequence: 1, project_state: 'not_started' },
  { code: 'DEWA_Project_002',    client: 'DEWA',    name: 'DEWA Control Panel 002',      description: 'DEWA control panel installation',  sequence: 2, project_state: 'not_started' },
  { code: 'SEWA_Project_001',    client: 'SEWA',    name: 'SEWA Distribution Panel 001', description: 'SEWA distribution board project',  sequence: 1, project_state: 'not_started' },
  { code: 'HITACHI_Project_001', client: 'HITACHI', name: 'Hitachi Control System 001',  description: 'Hitachi control system wiring',    sequence: 1, project_state: 'not_started' },
  { code: 'FEWA_Project_001',    client: 'FEWA',    name: 'FEWA Substation Panel 001',   description: 'FEWA substation panel wiring',     sequence: 1, project_state: 'not_started' },
];

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
  const maxAttempts = 10;

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
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const adapter = new PrismaPg(pool);
  const prisma = new PrismaClient({ adapter });
  await prisma.$connect();

  // Seed users only if table is empty
  const userCount = await prisma.users.count();
  if (userCount === 0) {
    console.log('[DWES] Users table empty — seeding canonical leadership users...');
    for (const u of SEED_USERS) {
      const hashed = await bcrypt.hash(u.password, 10);
      await prisma.users.create({
        data: { username: u.username, hashed_password: hashed, full_name: u.full_name,
                employee_id: u.employee_id, role: u.role, whatsapp_number: u.whatsapp_number, is_active: true },
      });
    }
    console.log(`[DWES] Seeded ${SEED_USERS.length} users`);
  } else {
    console.log(`[DWES] Found ${userCount} existing users — skipping seed`);
  }

  // Import historical projects if their codes don't exist
  for (const p of SEED_PROJECTS) {
    const exists = await prisma.projects.findUnique({ where: { code: p.code } });
    if (!exists) {
      await prisma.projects.create({ data: { ...p, is_active: true } });
      console.log(`[DWES] Imported project: ${p.code}`);
    }
  }

  await prisma.$disconnect();

  // Load frames from disk (file-based persistence)
  FrameStore.loadAll();

  const app = await NestFactory.create(AppModule, { logger: ['error', 'warn', 'log'] });

  app.enableCors({
    origin: buildCorsOrigins(),
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
