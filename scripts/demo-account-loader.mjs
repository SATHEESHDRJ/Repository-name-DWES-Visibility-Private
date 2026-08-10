import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let cachedAccounts;

function accountFile() {
  const configured = process.env.DWES_DEMO_ACCOUNTS_FILE?.trim();
  return configured
    ? path.resolve(configured)
    : path.join(root, 'backend', 'seeds', 'demo-accounts.local.json');
}

export function loadDemoAccounts() {
  if (cachedAccounts) return cachedAccounts;
  const file = accountFile();
  if (!fs.existsSync(file)) {
    throw new Error(
      'Private demo accounts are not configured. See docs/DEMO_ACCOUNTS.md or set ' +
      'DWES_DEMO_ACCOUNTS_FILE.',
    );
  }
  const accounts = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (!Array.isArray(accounts) || accounts.length === 0) {
    throw new Error('The private demo account file contains no accounts');
  }
  cachedAccounts = accounts;
  return cachedAccounts;
}

export function accountForUsername(username) {
  const account = loadDemoAccounts().find(candidate => candidate.username === username);
  if (!account?.password) throw new Error(`No private demo credential is configured for ${username}`);
  return account;
}

export function accountForRole(role, index = 0) {
  const account = loadDemoAccounts().filter(candidate => candidate.role === role)[index];
  if (!account?.password) throw new Error(`No private demo credential is configured for role ${role}`);
  return account;
}
