/**
 * Demo login credentials for the login page (DEV/testing ONLY — gated below).
 *
 * Leadership accounts use legacy passwords (not username); QA/tech accounts
 * are sourced from accounts.seed.json (password === username).
 *
 * SECURITY: `DEMO_CREDENTIALS` is the empty array unless this is a DEV build (or
 * VITE_SHOW_DEMO_CREDENTIALS==='true'). Because the seed manifest is only read
 * inside the DEV-gated branch, Rollup tree-shakes the JSON (and every password)
 * out of a production bundle entirely — they are never shipped.
 */
import seedAccounts from '../../backend/seeds/accounts.seed.json';

interface SeedAccount {
  username: string;
  password: string;
  role: string;
  full_name: string;
}

export interface DemoCredential {
  label: string;
  username: string;
  password: string;
}

/** Shape returned by GET /api/auth/demo-users (no secrets). */
export interface DemoUser {
  username: string;
  full_name: string;
  role: string;
}

export const SHOW_DEMO_CREDENTIALS =
  import.meta.env.DEV || import.meta.env.VITE_SHOW_DEMO_CREDENTIALS === 'true';

/** Leadership accounts whose password differs from username (canonical keep-list only). */
const LEGACY_DEMO_PASSWORDS: Record<string, string> = {
  sysadmin: 'admin123',
  director1: 'dir123',
  ops_director1: 'ops_director123',
  supervisor1: 'super123',
};

function buildFromSeed(): DemoCredential[] {
  const seed = seedAccounts as SeedAccount[];
  const fromSeed = (label: string, username: string): DemoCredential | null => {
    const a = seed.find(x => x.username === username);
    return a ? { label, username: a.username, password: a.password } : null;
  };

  return [
    { label: 'Admin', username: 'sysadmin', password: 'admin123' },
    { label: 'Director', username: 'ops_director1', password: 'ops_director123' },
    { label: 'Supervisor', username: 'supervisor1', password: 'super123' },
    fromSeed('QA', 'qa1'),
    fromSeed('Technician', 'tech1'),
  ].filter((c): c is DemoCredential => c !== null);
}

export const DEMO_CREDENTIALS: DemoCredential[] = SHOW_DEMO_CREDENTIALS ? buildFromSeed() : [];

/**
 * Look up the demo password for a given username — seed manifest first,
 * then legacy leadership passwords.
 */
export function seedPasswordFor(username: string): string | undefined {
  const seed = seedAccounts as SeedAccount[];
  return seed.find(a => a.username === username)?.password
    ?? LEGACY_DEMO_PASSWORDS[username];
}

/**
 * Fetch the full demo user list from the backend.
 * Returns null if the endpoint 404s (DEMO_MODE is off) or any network error.
 * Only call this when SHOW_DEMO_CREDENTIALS is true.
 */
export async function fetchDemoUsers(): Promise<DemoUser[] | null> {
  try {
    const res = await fetch('/api/auth/demo-users');
    if (!res.ok) return null;
    return res.json() as Promise<DemoUser[]>;
  } catch {
    return null;
  }
}
