import { PrismaService } from '../prisma/prisma.service';

/** Tables present in legacy WiringSchemeDB (production me-dubai-1 as of 2026-07). */
export const CORE_WIRING_TABLES = [
  'users',
  'projects',
  'tech_assignments',
  'panel_inspections',
  'file_hashes',
  'tech_audit_log',
  'session_log',
] as const;

/** Optional engineering / twin tables — may be absent on older production DBs. */
export const OPTIONAL_WIRING_TABLES = [
  'ga_finalization_decisions',
  'ga_correlation_results',
  'ga_faces',
  'ga_asset_sets',
  'background_jobs',
  'mapping_issues',
  'cable_route_mappings',
  'terminal_geometries',
  'duct_segments',
  'duct_nodes',
  'device_geometries',
  'panel_models',
  'drawing_assets',
] as const;

export type WiringDbTable = (typeof CORE_WIRING_TABLES)[number] | (typeof OPTIONAL_WIRING_TABLES)[number];

let cachedTables: Set<string> | null = null;
let cachePromise: Promise<Set<string>> | null = null;

export async function loadWiringDbTables(prisma: PrismaService): Promise<Set<string>> {
  if (cachedTables) return cachedTables;
  if (!cachePromise) {
    if (typeof prisma?.$queryRaw !== 'function') {
      cachedTables = new Set(CORE_WIRING_TABLES);
      return cachedTables;
    }
    cachePromise = prisma.$queryRaw<{ tablename: string }[]>`
      SELECT tablename FROM pg_tables WHERE schemaname = 'public'
    `.then(rows => {
      cachedTables = new Set(rows.map(r => r.tablename));
      return cachedTables;
    }).catch(() => {
      cachedTables = new Set(CORE_WIRING_TABLES);
      return cachedTables;
    });
  }
  return cachePromise;
}

export function wiringTableReady(tables: Set<string>, name: WiringDbTable): boolean {
  return tables.has(name);
}

/** Test-only reset. */
export function _resetWiringDbTableCacheForTests(): void {
  cachedTables = null;
  cachePromise = null;
}