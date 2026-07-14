import { existsSync, readFileSync } from 'fs';
import * as path from 'path';

export const DEMO_ACCOUNT_ROLES = [
  'system_admin',
  'ops_director',
  'prod_supervisor',
  'qaqc_engineer',
  'wiring_technician',
] as const;

export type DemoAccountRole = (typeof DEMO_ACCOUNT_ROLES)[number];

export interface DemoAccount {
  username: string;
  password: string;
  full_name: string;
  employee_id: string;
  role: DemoAccountRole;
  whatsapp_number?: string;
}

function candidateFiles(): string[] {
  const configured = process.env.DWES_DEMO_ACCOUNTS_FILE?.trim();
  if (configured) return [path.resolve(configured)];

  return [
    path.resolve(process.cwd(), 'backend', 'seeds', 'demo-accounts.local.json'),
    path.resolve(process.cwd(), 'seeds', 'demo-accounts.local.json'),
    path.resolve(__dirname, '..', '..', 'seeds', 'demo-accounts.local.json'),
  ];
}

function requireText(value: unknown, field: string, index: number): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`[DWES] Demo account ${index + 1} has an invalid ${field}`);
  }
  if (/^<.*>$/.test(value.trim())) {
    throw new Error(`[DWES] Demo account ${index + 1} still contains the ${field} example placeholder`);
  }
  return value.trim();
}

export function loadDemoAccounts(): DemoAccount[] {
  const file = candidateFiles().find(candidate => existsSync(candidate));
  if (!file) {
    throw new Error(
      '[DWES] Demo seeding is enabled but no private account file was found. ' +
      'Copy backend/seeds/demo-accounts.example.json to backend/seeds/demo-accounts.local.json, ' +
      'or set DWES_DEMO_ACCOUNTS_FILE to a protected JSON file.',
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(file, 'utf8'));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`[DWES] Could not read the private demo account file: ${message}`);
  }

  if (!Array.isArray(parsed) || parsed.length === 0) {
    throw new Error('[DWES] The private demo account file must contain at least one account');
  }

  const roles = new Set<string>(DEMO_ACCOUNT_ROLES);
  const usernames = new Set<string>();
  return parsed.map((raw, index) => {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      throw new Error(`[DWES] Demo account ${index + 1} must be an object`);
    }
    const item = raw as Record<string, unknown>;
    const username = requireText(item.username, 'username', index);
    if (usernames.has(username)) {
      throw new Error(`[DWES] Duplicate demo username: ${username}`);
    }
    usernames.add(username);

    const role = requireText(item.role, 'role', index);
    if (!roles.has(role)) {
      throw new Error(`[DWES] Demo account ${index + 1} has an unsupported role: ${role}`);
    }

    return {
      username,
      password: requireText(item.password, 'password', index),
      full_name: requireText(item.full_name, 'full_name', index),
      employee_id: requireText(item.employee_id, 'employee_id', index),
      role: role as DemoAccountRole,
      whatsapp_number: typeof item.whatsapp_number === 'string'
        ? item.whatsapp_number.trim()
        : undefined,
    };
  });
}
