import * as fs from 'fs';
import * as path from 'path';

export interface DbConfig {
  mode: 'local' | 'cloud';
  cloudUrl: string;
  lastSwitched: string | null;
  notes: string;
}

const CONFIG_PATH = path.resolve(process.cwd(), 'db-config.json');
const DEFAULTS: DbConfig = { mode: 'local', cloudUrl: '', lastSwitched: null, notes: '' };

export const DbConfigStore = {
  load(): DbConfig {
    try {
      if (!fs.existsSync(CONFIG_PATH)) {
        this.save(DEFAULTS);
        return { ...DEFAULTS };
      }
      return { ...DEFAULTS, ...JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8')) };
    } catch { return { ...DEFAULTS }; }
  },

  save(patch: Partial<DbConfig>): void {
    const current = this.load();
    fs.writeFileSync(CONFIG_PATH, JSON.stringify({ ...current, ...patch }, null, 2), 'utf-8');
  },

  getActiveUrl(): string {
    const cfg = this.load();
    return cfg.mode === 'cloud' && cfg.cloudUrl
      ? cfg.cloudUrl
      : (process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/WiringSchemeDB');
  },

  maskUrl(url: string): string {
    return url.replace(/:([^@:\/?#]+)@/, ':****@');
  },
};
