import * as fs from 'fs';
import * as path from 'path';
import { MockStore } from '../data/mock-store';
import { FrameStore } from '../frames/frame-store';
import { PanelModelStore } from '../panel-model/panel-model-store';
import { PrismaService } from '../prisma/prisma.service';
import { panelDeletionRecord, PANEL_DELETION_FILE_TYPE } from './deleted-resource.util';
import { loadWiringDbTables, wiringTableReady } from './wiring-db-tables';

export const PROJECT_SCOPED_TABLES = [
  'ga_finalization_decisions', 'ga_correlation_results', 'ga_faces', 'ga_asset_sets',
  'background_jobs', 'mapping_issues', 'cable_route_mappings', 'terminal_geometries',
  'duct_segments', 'duct_nodes', 'device_geometries', 'panel_models', 'drawing_assets',
  'panel_inspections', 'tech_assignments', 'file_hashes', 'tech_audit_log', 'session_log', 'projects',
] as const;

export type ProjectDataDeleteCounts = {
  ga_finalization_decisions: number; ga_correlation_results: number; ga_faces: number;
  ga_asset_sets: number; background_jobs: number; mapping_issues: number;
  cable_route_mappings: number; terminal_geometries: number; duct_segments: number;
  duct_nodes: number; device_geometries: number; panel_models: number; drawing_assets: number;
  panel_inspections: number; tech_assignments: number; file_hashes: number;
  tech_audit_log: number; session_log: number; projects: number;
};

export type PanelDataDeleteCounts = Omit<ProjectDataDeleteCounts, 'session_log' | 'projects' | 'file_hashes'> & {
  panel_tombstone: number;
};

export type ProjectDataInventory = ProjectDataDeleteCounts & {
  users: number; upload_project_folders: number; ts: string;
};

export type PermanentDeleteActor = {
  id: number;
  full_name?: string | null;
  username?: string | null;
};

type PurgeScope = { projectCode?: string; includeProjectRow: boolean };

function emptyDeleteCounts(): ProjectDataDeleteCounts {
  return {
    ga_finalization_decisions: 0, ga_correlation_results: 0, ga_faces: 0, ga_asset_sets: 0,
    background_jobs: 0, mapping_issues: 0, cable_route_mappings: 0, terminal_geometries: 0,
    duct_segments: 0, duct_nodes: 0, device_geometries: 0, panel_models: 0, drawing_assets: 0,
    panel_inspections: 0, tech_assignments: 0, file_hashes: 0, tech_audit_log: 0, session_log: 0, projects: 0,
  };
}

function emptyPanelDeleteCounts(): PanelDataDeleteCounts {
  const base = emptyDeleteCounts();
  const { session_log: _s, projects: _p, file_hashes: _f, ...rest } = base;
  return { ...rest, panel_tombstone: 0 };
}

async function resolveTerminalIdsForPanelModels(
  client: PrismaService,
  panelModelIds: number[],
  tables: Set<string>,
): Promise<{ deviceIds: number[]; terminalIds: number[] }> {
  if (!panelModelIds.length) return { deviceIds: [], terminalIds: [] };
  if (!wiringTableReady(tables, 'device_geometries') || !wiringTableReady(tables, 'terminal_geometries')) {
    return { deviceIds: [], terminalIds: [] };
  }
  const deviceIds = (await client.device_geometries.findMany({
    where: { panel_model_id: { in: panelModelIds } },
    select: { id: true },
  })).map(r => r.id);
  if (!deviceIds.length) return { deviceIds, terminalIds: [] };
  const terminalIds = (await client.terminal_geometries.findMany({
    where: { device_geometry_id: { in: deviceIds } },
    select: { id: true },
  })).map(r => r.id);
  return { deviceIds, terminalIds };
}

async function deleteProjectScopedRowsOnClient(
  client: PrismaService,
  scope: PurgeScope,
  tables: Set<string>,
): Promise<ProjectDataDeleteCounts> {
  const counts = emptyDeleteCounts();
  const projectCode = scope.projectCode?.trim();
  if (projectCode) {
    const assignmentIds = wiringTableReady(tables, 'tech_assignments')
      ? (await client.tech_assignments.findMany({ where: { project_code: projectCode }, select: { id: true } })).map(r => r.id)
      : [];

    let gaAssetSetIds: string[] = [];
    let panelModelIds: number[] = [];
    let deviceIds: number[] = [];
    let terminalIds: number[] = [];

    if (wiringTableReady(tables, 'ga_asset_sets')) {
      gaAssetSetIds = (await client.ga_asset_sets.findMany({ where: { project_code: projectCode }, select: { id: true } })).map(r => r.id);
    }
    if (wiringTableReady(tables, 'panel_models')) {
      panelModelIds = (await client.panel_models.findMany({ where: { project_code: projectCode }, select: { id: true } })).map(r => r.id);
      ({ deviceIds, terminalIds } = await resolveTerminalIdsForPanelModels(client, panelModelIds, tables));
    }

    if (wiringTableReady(tables, 'ga_finalization_decisions')) {
      counts.ga_finalization_decisions = (await client.ga_finalization_decisions.deleteMany({ where: { project_code: projectCode } })).count;
    }
    if (wiringTableReady(tables, 'ga_correlation_results')) {
      counts.ga_correlation_results = (await client.ga_correlation_results.deleteMany({ where: { project_code: projectCode } })).count;
    }
    if (wiringTableReady(tables, 'ga_faces') && gaAssetSetIds.length) {
      counts.ga_faces = (await client.ga_faces.deleteMany({ where: { ga_asset_set_id: { in: gaAssetSetIds } } })).count;
    }
    if (wiringTableReady(tables, 'ga_asset_sets')) {
      counts.ga_asset_sets = (await client.ga_asset_sets.deleteMany({ where: { project_code: projectCode } })).count;
    }
    if (wiringTableReady(tables, 'background_jobs')) {
      counts.background_jobs = (await client.background_jobs.deleteMany({ where: { project_code: projectCode } })).count;
    }
    if (wiringTableReady(tables, 'mapping_issues')) {
      counts.mapping_issues = (await client.mapping_issues.deleteMany({ where: { project_code: projectCode } })).count;
    }
    if (wiringTableReady(tables, 'cable_route_mappings') && terminalIds.length) {
      counts.cable_route_mappings = (await client.cable_route_mappings.deleteMany({
        where: { OR: [{ source_terminal_geometry_id: { in: terminalIds } }, { destination_terminal_geometry_id: { in: terminalIds } }] },
      })).count;
    }
    if (wiringTableReady(tables, 'terminal_geometries') && deviceIds.length) {
      counts.terminal_geometries = (await client.terminal_geometries.deleteMany({ where: { device_geometry_id: { in: deviceIds } } })).count;
    }
    if (wiringTableReady(tables, 'duct_segments') && panelModelIds.length) {
      counts.duct_segments = (await client.duct_segments.deleteMany({ where: { panel_model_id: { in: panelModelIds } } })).count;
    }
    if (wiringTableReady(tables, 'duct_nodes') && panelModelIds.length) {
      counts.duct_nodes = (await client.duct_nodes.deleteMany({ where: { panel_model_id: { in: panelModelIds } } })).count;
    }
    if (wiringTableReady(tables, 'device_geometries') && panelModelIds.length) {
      counts.device_geometries = (await client.device_geometries.deleteMany({ where: { panel_model_id: { in: panelModelIds } } })).count;
    }
    if (wiringTableReady(tables, 'panel_models')) {
      counts.panel_models = (await client.panel_models.deleteMany({ where: { project_code: projectCode } })).count;
    }
    if (wiringTableReady(tables, 'drawing_assets')) {
      counts.drawing_assets = (await client.drawing_assets.deleteMany({ where: { project_code: projectCode } })).count;
    }
    if (wiringTableReady(tables, 'panel_inspections') && assignmentIds.length) {
      counts.panel_inspections = (await client.panel_inspections.deleteMany({ where: { assignment_id: { in: assignmentIds } } })).count;
    }
    if (wiringTableReady(tables, 'tech_assignments')) {
      counts.tech_assignments = (await client.tech_assignments.deleteMany({ where: { project_code: projectCode } })).count;
    }
    if (wiringTableReady(tables, 'file_hashes')) {
      counts.file_hashes = (await client.file_hashes.deleteMany({ where: { project_code: projectCode } })).count;
    }
    if (wiringTableReady(tables, 'tech_audit_log')) {
      counts.tech_audit_log = (await client.tech_audit_log.deleteMany({ where: { project_code: projectCode } })).count;
    }
    if (wiringTableReady(tables, 'session_log')) {
      counts.session_log = (await client.session_log.deleteMany({ where: { project_code: projectCode } })).count;
    }
    if (scope.includeProjectRow && wiringTableReady(tables, 'projects')) {
      counts.projects = (await client.projects.deleteMany({ where: { code: projectCode } })).count;
    }
    return counts;
  }

  if (wiringTableReady(tables, 'ga_finalization_decisions')) counts.ga_finalization_decisions = (await client.ga_finalization_decisions.deleteMany({})).count;
  if (wiringTableReady(tables, 'ga_correlation_results')) counts.ga_correlation_results = (await client.ga_correlation_results.deleteMany({})).count;
  if (wiringTableReady(tables, 'ga_faces')) counts.ga_faces = (await client.ga_faces.deleteMany({})).count;
  if (wiringTableReady(tables, 'ga_asset_sets')) counts.ga_asset_sets = (await client.ga_asset_sets.deleteMany({})).count;
  if (wiringTableReady(tables, 'background_jobs')) counts.background_jobs = (await client.background_jobs.deleteMany({})).count;
  if (wiringTableReady(tables, 'mapping_issues')) counts.mapping_issues = (await client.mapping_issues.deleteMany({})).count;
  if (wiringTableReady(tables, 'cable_route_mappings')) counts.cable_route_mappings = (await client.cable_route_mappings.deleteMany({})).count;
  if (wiringTableReady(tables, 'terminal_geometries')) counts.terminal_geometries = (await client.terminal_geometries.deleteMany({})).count;
  if (wiringTableReady(tables, 'duct_segments')) counts.duct_segments = (await client.duct_segments.deleteMany({})).count;
  if (wiringTableReady(tables, 'duct_nodes')) counts.duct_nodes = (await client.duct_nodes.deleteMany({})).count;
  if (wiringTableReady(tables, 'device_geometries')) counts.device_geometries = (await client.device_geometries.deleteMany({})).count;
  if (wiringTableReady(tables, 'panel_models')) counts.panel_models = (await client.panel_models.deleteMany({})).count;
  if (wiringTableReady(tables, 'drawing_assets')) counts.drawing_assets = (await client.drawing_assets.deleteMany({})).count;
  if (wiringTableReady(tables, 'panel_inspections')) counts.panel_inspections = (await client.panel_inspections.deleteMany({})).count;
  if (wiringTableReady(tables, 'tech_assignments')) counts.tech_assignments = (await client.tech_assignments.deleteMany({})).count;
  if (wiringTableReady(tables, 'file_hashes')) counts.file_hashes = (await client.file_hashes.deleteMany({})).count;
  if (wiringTableReady(tables, 'tech_audit_log')) counts.tech_audit_log = (await client.tech_audit_log.deleteMany({})).count;
  if (wiringTableReady(tables, 'session_log')) counts.session_log = (await client.session_log.deleteMany({})).count;
  if (scope.includeProjectRow && wiringTableReady(tables, 'projects')) counts.projects = (await client.projects.deleteMany({})).count;
  return counts;
}

async function deletePanelScopedRowsOnClient(
  client: PrismaService,
  projectCode: string,
  frameId: string,
  tables: Set<string>,
): Promise<{ counts: PanelDataDeleteCounts; assetPaths: string[] }> {
  const counts = emptyPanelDeleteCounts();
  const panelWhere = { project_code: projectCode, frame_id: frameId };

  let gaAssetSetIds: string[] = [];
  let panelModelIds: number[] = [];
  if (wiringTableReady(tables, 'ga_asset_sets')) {
    gaAssetSetIds = (await client.ga_asset_sets.findMany({ where: panelWhere, select: { id: true } })).map(r => r.id);
  }
  if (wiringTableReady(tables, 'panel_models')) {
    panelModelIds = (await client.panel_models.findMany({ where: panelWhere, select: { id: true } })).map(r => r.id);
  }
  const { deviceIds, terminalIds } = await resolveTerminalIdsForPanelModels(client, panelModelIds, tables);
  const assignmentIds = wiringTableReady(tables, 'tech_assignments')
    ? (await client.tech_assignments.findMany({ where: panelWhere, select: { id: true } })).map(r => r.id)
    : [];

  let assetPaths: string[] = [];
  if (wiringTableReady(tables, 'drawing_assets')) {
    const drawingAssets = await client.drawing_assets.findMany({
      where: panelWhere,
      select: { storage_path: true, derivative_path: true },
    });
    assetPaths = drawingAssets.flatMap(a => [a.storage_path, a.derivative_path].filter(Boolean) as string[]);
  }

  if (wiringTableReady(tables, 'ga_finalization_decisions')) {
    counts.ga_finalization_decisions = (await client.ga_finalization_decisions.deleteMany({ where: panelWhere })).count;
  }
  if (wiringTableReady(tables, 'ga_correlation_results')) {
    counts.ga_correlation_results = (await client.ga_correlation_results.deleteMany({ where: panelWhere })).count;
  }
  if (wiringTableReady(tables, 'ga_faces') && gaAssetSetIds.length) {
    counts.ga_faces = (await client.ga_faces.deleteMany({ where: { ga_asset_set_id: { in: gaAssetSetIds } } })).count;
  }
  if (wiringTableReady(tables, 'ga_asset_sets')) {
    counts.ga_asset_sets = (await client.ga_asset_sets.deleteMany({ where: panelWhere })).count;
  }
  if (wiringTableReady(tables, 'background_jobs')) {
    counts.background_jobs = (await client.background_jobs.deleteMany({ where: panelWhere })).count;
  }
  if (wiringTableReady(tables, 'mapping_issues')) {
    counts.mapping_issues = (await client.mapping_issues.deleteMany({ where: panelWhere })).count;
  }
  if (wiringTableReady(tables, 'cable_route_mappings') && terminalIds.length) {
    counts.cable_route_mappings = (await client.cable_route_mappings.deleteMany({
      where: {
        OR: [
          { source_terminal_geometry_id: { in: terminalIds } },
          { destination_terminal_geometry_id: { in: terminalIds } },
        ],
      },
    })).count;
  }
  if (wiringTableReady(tables, 'terminal_geometries') && deviceIds.length) {
    counts.terminal_geometries = (await client.terminal_geometries.deleteMany({ where: { device_geometry_id: { in: deviceIds } } })).count;
  }
  if (wiringTableReady(tables, 'duct_segments') && panelModelIds.length) {
    counts.duct_segments = (await client.duct_segments.deleteMany({ where: { panel_model_id: { in: panelModelIds } } })).count;
  }
  if (wiringTableReady(tables, 'duct_nodes') && panelModelIds.length) {
    counts.duct_nodes = (await client.duct_nodes.deleteMany({ where: { panel_model_id: { in: panelModelIds } } })).count;
  }
  if (wiringTableReady(tables, 'device_geometries') && panelModelIds.length) {
    counts.device_geometries = (await client.device_geometries.deleteMany({ where: { panel_model_id: { in: panelModelIds } } })).count;
  }
  if (wiringTableReady(tables, 'panel_models')) {
    counts.panel_models = (await client.panel_models.deleteMany({ where: panelWhere })).count;
  }
  if (wiringTableReady(tables, 'drawing_assets')) {
    counts.drawing_assets = (await client.drawing_assets.deleteMany({ where: panelWhere })).count;
  }
  if (wiringTableReady(tables, 'panel_inspections') && assignmentIds.length) {
    counts.panel_inspections = (await client.panel_inspections.deleteMany({ where: { assignment_id: { in: assignmentIds } } })).count;
  }
  if (wiringTableReady(tables, 'tech_assignments')) {
    counts.tech_assignments = (await client.tech_assignments.deleteMany({ where: panelWhere })).count;
  }
  if (wiringTableReady(tables, 'tech_audit_log')) {
    counts.tech_audit_log = (await client.tech_audit_log.deleteMany({ where: panelWhere })).count;
  }

  if (wiringTableReady(tables, 'file_hashes')) {
    await client.file_hashes.deleteMany({
      where: {
        project_code: projectCode,
        file_name: frameId,
        file_type: PANEL_DELETION_FILE_TYPE,
      },
    });
    await client.file_hashes.create({ data: panelDeletionRecord(projectCode, frameId) });
    counts.panel_tombstone = 1;
  }

  return { counts, assetPaths };
}

export async function deleteProjectScopedDatabaseRows(prisma: PrismaService, scope: PurgeScope): Promise<ProjectDataDeleteCounts> {
  const tables = await loadWiringDbTables(prisma);
  return prisma.$transaction(tx => deleteProjectScopedRowsOnClient(tx as unknown as PrismaService, scope, tables));
}

export async function deletePanelScopedDatabaseRows(
  prisma: PrismaService,
  projectCode: string,
  frameId: string,
): Promise<{ counts: PanelDataDeleteCounts; assetPaths: string[] }> {
  const tables = await loadWiringDbTables(prisma);
  return prisma.$transaction(tx =>
    deletePanelScopedRowsOnClient(tx as unknown as PrismaService, projectCode, frameId, tables),
  );
}

function unlinkIfExists(target: string | null | undefined): void {
  if (!target) return;
  try {
    if (fs.existsSync(target) && fs.lstatSync(target).isFile()) fs.unlinkSync(target);
  } catch {
    // Best-effort filesystem cleanup after a successful DB transaction.
  }
}

function resolveUploadPath(uploadBase: string, stored: string | null | undefined): string | null {
  if (!stored?.trim()) return null;
  return path.isAbsolute(stored) ? stored : path.resolve(uploadBase, stored);
}

async function writePermanentDeleteAudit(
  prisma: PrismaService,
  actor: PermanentDeleteActor | undefined,
  projectCode: string,
  frameId: string,
  panelName: string,
  details: string,
): Promise<void> {
  if (!actor?.id) return;
  const name = String(actor.full_name || actor.username || '').trim().slice(0, 100);
  await prisma.tech_audit_log.create({
    data: {
      technician_id: actor.id,
      technician_name: name,
      project_code: projectCode.slice(0, 150),
      frame_id: frameId.slice(0, 100),
      panel_name: panelName.slice(0, 200),
      action: 'permanent_delete',
      details: details.slice(0, 500),
    },
  });
}

export function listProjectUploadCodes(uploadBase: string): string[] {
  if (!fs.existsSync(uploadBase)) return [];
  return fs.readdirSync(uploadBase, { withFileTypes: true })
    .filter(entry => entry.isDirectory() && entry.name !== 'backups')
    .map(entry => entry.name);
}

export function purgeProjectMemoryStores(projectCode?: string): void {
  if (projectCode) {
    FrameStore.blockProject(projectCode);
    MockStore.frames = MockStore.frames.filter(r => r.project_code !== projectCode);
    MockStore.drawings = MockStore.drawings.filter(r => r.project_code !== projectCode);
    MockStore.drawingPackages = MockStore.drawingPackages.filter(r => r.project_code !== projectCode);
    MockStore.directorReports = MockStore.directorReports.filter(r => r.project_code !== projectCode);
    MockStore.panelModels = MockStore.panelModels.filter(r => r.project_code !== projectCode);
    return;
  }
  MockStore.frames = []; MockStore.drawings = []; MockStore.drawingPackages = [];
  MockStore.directorReports = []; MockStore.panelModels = [];
}

export function purgePanelMemoryAndFiles(projectCode: string, frameId: string): void {
  FrameStore.removeDrawingPackage(projectCode, frameId);
  FrameStore.remove(projectCode, frameId);
  FrameStore.removeGaFaces(projectCode, frameId);
  PanelModelStore.removeFrame(projectCode, frameId);
  const idx = MockStore.frames.findIndex(f => f.project_code === projectCode && f.id === frameId);
  if (idx !== -1) MockStore.frames.splice(idx, 1);
  MockStore.drawingPackages = MockStore.drawingPackages.filter(
    p => !(p.project_code === projectCode && p.frame_id === frameId),
  );
  FrameStore.blockPanel(projectCode, frameId);
}

export function removeProjectUploadFolders(uploadBase: string, codes: string[]): number {
  let removed = 0;
  for (const code of codes) {
    const dir = path.join(uploadBase, code);
    if (!fs.existsSync(dir)) continue;
    fs.rmSync(dir, { recursive: true, force: true });
    removed++;
  }
  return removed;
}

export async function countProjectDataInventory(prisma: PrismaService, uploadBase: string): Promise<ProjectDataInventory> {
  const counts = emptyDeleteCounts();
  const tables = await loadWiringDbTables(prisma);
  const users = await prisma.users.count();

  async function countTable(name: keyof ProjectDataDeleteCounts): Promise<number> {
    if (!wiringTableReady(tables, name as Parameters<typeof wiringTableReady>[1])) return 0;
    return (prisma[name] as { count: () => Promise<number> }).count();
  }

  const keys = Object.keys(counts) as (keyof ProjectDataDeleteCounts)[];
  for (const key of keys) {
    counts[key] = await countTable(key);
  }
  return { ...counts, users, upload_project_folders: listProjectUploadCodes(uploadBase).length, ts: new Date().toISOString() };
}

export async function purgeAllProjectData(prisma: PrismaService, uploadBase: string) {
  const projectCodes = (await prisma.projects.findMany({ select: { code: true } })).map(r => r.code);
  const codes = [...new Set([...projectCodes, ...listProjectUploadCodes(uploadBase)])];
  const deleted = await deleteProjectScopedDatabaseRows(prisma, { includeProjectRow: true });
  purgeProjectMemoryStores();
  const folders_removed = removeProjectUploadFolders(uploadBase, codes);
  return { deleted, folders_removed, project_codes: codes };
}

export interface PermanentProjectDeleteResult {
  success: true;
  project_code: string;
  deleted: ProjectDataDeleteCounts & {
    uploads_removed: boolean;
    folder_removed: boolean;
  };
  message: string;
  ts: string;
}

export interface PermanentPanelDeleteResult {
  success: true;
  project_code: string;
  frame_id: string;
  panel_name: string;
  deleted: PanelDataDeleteCounts & {
    frame_files_removed: boolean;
    model_dir_removed: boolean;
  };
  message: string;
  ts: string;
}

/**
 * Single orchestration path for permanent project deletion.
 * Order: DB transaction → memory/cache purge → filesystem folder removal → audit.
 * If filesystem cleanup fails after DB commit, the project row is already gone;
 * callers should treat remaining files as orphans to remove manually (no silent DB restore).
 */
export async function permanentlyDeleteProject(
  prisma: PrismaService,
  code: string,
  uploadBase: string,
  actor?: PermanentDeleteActor,
): Promise<PermanentProjectDeleteResult> {
  const projectUploadsDir = path.join(uploadBase, code);

  const deleted = await deleteProjectScopedDatabaseRows(prisma, {
    projectCode: code,
    includeProjectRow: true,
  });

  purgeProjectMemoryStores(code);

  let folderRemoved = false;
  if (fs.existsSync(projectUploadsDir)) {
    fs.rmSync(projectUploadsDir, { recursive: true, force: true });
    folderRemoved = true;
  }

  await writePermanentDeleteAudit(
    prisma,
    actor,
    code,
    '',
    '',
    `Permanently deleted project ${code} (assignments=${deleted.tech_assignments}, inspections=${deleted.panel_inspections}, models=${deleted.panel_models}, folder=${folderRemoved})`,
  );

  return {
    success: true,
    project_code: code,
    deleted: {
      ...deleted,
      uploads_removed: folderRemoved,
      folder_removed: folderRemoved,
    },
    message: `Project "${code}" permanently deleted from database and storage.`,
    ts: new Date().toISOString(),
  };
}

/**
 * Single orchestration path for permanent panel deletion.
 * Removes only this panel's DB rows, twin/GA data, assignments, and panel files.
 * Parent project and sibling panels are retained.
 */
export async function permanentlyDeletePanel(
  prisma: PrismaService,
  projectCode: string,
  frameId: string,
  uploadBase: string,
  options?: { panelName?: string; actor?: PermanentDeleteActor },
): Promise<PermanentPanelDeleteResult> {
  const panelName = (options?.panelName || '').trim() || frameId;

  const { counts, assetPaths } = await deletePanelScopedDatabaseRows(prisma, projectCode, frameId);

  purgePanelMemoryAndFiles(projectCode, frameId);

  for (const stored of assetPaths) {
    unlinkIfExists(resolveUploadPath(uploadBase, stored));
  }

  const modelDir = path.join(uploadBase, projectCode, 'models', frameId);
  const modelDirRemoved = !fs.existsSync(modelDir);
  const frameFilesRemoved = FrameStore.getFrameFilePaths(projectCode, frameId).length === 0;

  await writePermanentDeleteAudit(
    prisma,
    options?.actor,
    projectCode,
    frameId,
    panelName,
    `Permanently deleted panel ${panelName} (${frameId}): assignments=${counts.tech_assignments}, inspections=${counts.panel_inspections}, models=${counts.panel_models}, twin/GA purged`,
  );

  return {
    success: true,
    project_code: projectCode,
    frame_id: frameId,
    panel_name: panelName,
    deleted: {
      ...counts,
      frame_files_removed: frameFilesRemoved,
      model_dir_removed: modelDirRemoved,
    },
    message: `Panel "${panelName}" permanently deleted from database and storage.`,
    ts: new Date().toISOString(),
  };
}
