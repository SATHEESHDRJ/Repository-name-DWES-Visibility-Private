import fs from 'node:fs/promises';
import path from 'node:path';
import { accountForRole } from './demo-account-loader.mjs';

const API_BASE = process.env.DWES_API_BASE || 'http://127.0.0.1:3001/api';
const configuredAdminUser = process.env.DWES_ADMIN_USER?.trim();
const configuredAdminPass = process.env.DWES_ADMIN_PASS?.trim();
if (Boolean(configuredAdminUser) !== Boolean(configuredAdminPass)) {
  throw new Error('DWES_ADMIN_USER and DWES_ADMIN_PASS must be provided together');
}
const privateAdmin = configuredAdminUser
  ? { username: configuredAdminUser, password: configuredAdminPass }
  : accountForRole('system_admin');
const ADMIN_USER = privateAdmin.username;
const ADMIN_PASS = privateAdmin.password;
const TRACK_FILE = path.resolve(process.cwd(), '.demo-project.json');

const forcedCode = process.env.DWES_DEMO_CODE?.trim();

function makeDemoCode() {
  if (forcedCode) return forcedCode;
  const stamp = new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14);
  return `DEMO_PROJECT_${stamp}`;
}

function mustBeDemoCode(code) {
  return code.startsWith('DEMO_PROJECT_');
}

async function readTrack() {
  try {
    const raw = await fs.readFile(TRACK_FILE, 'utf8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

async function writeTrack(payload) {
  await fs.writeFile(TRACK_FILE, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
}

async function removeTrack() {
  try {
    await fs.unlink(TRACK_FILE);
  } catch {
    // ignore
  }
}

async function api(pathname, opts = {}, token) {
  const headers = {
    'Content-Type': 'application/json',
    ...(opts.headers || {}),
  };
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`${API_BASE}${pathname}`, {
    ...opts,
    headers,
  });

  const text = await res.text();
  const body = text ? JSON.parse(text) : null;

  if (!res.ok) {
    const message = body?.message || `${res.status} ${res.statusText}`;
    throw new Error(typeof message === 'string' ? message : JSON.stringify(message));
  }

  return body;
}

async function login() {
  const body = await api('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ username: ADMIN_USER, password: ADMIN_PASS }),
  });

  if (!body?.access_token) {
    throw new Error('Failed to obtain admin token');
  }
  return body.access_token;
}

async function setup() {
  const token = await login();
  const existingTrack = await readTrack();
  const projects = await api('/projects', { method: 'GET' }, token);

  if (existingTrack?.code) {
    const current = projects.find(project => project.code === existingTrack.code);
    if (current?.is_active) {
      console.log(`Demo Project already active: ${current.code}`);
      console.log(`Name: ${current.name}`);
      return;
    }
  }

  const code = makeDemoCode();
  if (!mustBeDemoCode(code)) {
    throw new Error(`Unsafe demo code '${code}'. It must start with DEMO_PROJECT_.`);
  }

  const collision = projects.find(project => project.code === code);
  if (collision) {
    throw new Error(`Project code already exists: ${code}. Set DWES_DEMO_CODE to a new value.`);
  }

  const dto = {
    code,
    client: 'DEMO',
    name: 'Demo Project (Isolated Test)',
    description: 'DEMO-ONLY: isolated end-to-end testing project. Safe to remove after QA.',
    sequence: 999,
  };

  const created = await api('/projects', {
    method: 'POST',
    body: JSON.stringify(dto),
  }, token);

  await writeTrack({
    code: created.code,
    name: created.name,
    created_at: new Date().toISOString(),
    api_base: API_BASE,
  });

  console.log('Demo Project created successfully.');
  console.log(`Code: ${created.code}`);
  console.log(`Name: ${created.name}`);
  console.log(`Track file: ${TRACK_FILE}`);
}

async function status() {
  const track = await readTrack();
  if (!track?.code) {
    console.log('No tracked Demo Project found. Run: npm run demo:setup');
    return;
  }

  const token = await login();
  const projects = await api('/projects', { method: 'GET' }, token);
  const project = projects.find(item => item.code === track.code);

  if (!project) {
    console.log(`Tracked Demo Project not found in active projects: ${track.code}`);
    return;
  }

  console.log(`Tracked Demo Project is active: ${project.code}`);
  console.log(`Name: ${project.name}`);
  console.log(`State: ${project.project_state}`);
}

async function teardown() {
  const track = await readTrack();
  const code = forcedCode || track?.code;

  if (!code) {
    console.log('No Demo Project code provided/tracked. Set DWES_DEMO_CODE or run setup first.');
    return;
  }
  if (!mustBeDemoCode(code)) {
    throw new Error(`Refusing to delete non-demo project code: ${code}`);
  }

  const token = await login();
  await api(`/projects/${encodeURIComponent(code)}`, { method: 'DELETE' }, token);

  if (!forcedCode || track?.code === forcedCode) {
    await removeTrack();
  }

  console.log(`Demo Project removed: ${code}`);
}

async function main() {
  const command = (process.argv[2] || 'status').toLowerCase();

  if (command === 'setup') return setup();
  if (command === 'status') return status();
  if (command === 'teardown') return teardown();

  throw new Error(`Unknown command: ${command}. Use setup | status | teardown`);
}

main().catch(err => {
  console.error(`demo-project failed: ${err.message}`);
  process.exit(1);
});
