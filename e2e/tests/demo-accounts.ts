import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

export interface E2eDemoAccount {
  username: string;
  password: string;
  role: string;
}

let cached: E2eDemoAccount[] | undefined;

export function demoAccounts(): E2eDemoAccount[] {
  if (cached) return cached;
  const configured = process.env.DWES_E2E_ACCOUNTS_FILE?.trim();
  if (!configured) {
    throw new Error('DWES_E2E_ACCOUNTS_FILE is required for role login tests');
  }
  const parsed = JSON.parse(readFileSync(resolve(configured), 'utf8')) as E2eDemoAccount[];
  if (!Array.isArray(parsed) || parsed.length === 0) {
    throw new Error('DWES_E2E_ACCOUNTS_FILE contains no accounts');
  }
  cached = parsed;
  return parsed;
}

export function accountForRole(role: string): E2eDemoAccount {
  const account = demoAccounts().find(candidate => candidate.role === role);
  if (!account?.username || !account.password) {
    throw new Error(`No E2E account is configured for role ${role}`);
  }
  return account;
}
