import * as fs from 'fs';
import * as path from 'path';
import { MockStore, type PanelGeneratedModel } from '../data/mock-store';
import { uploadRootDir, atomicWriteFile } from '../common/file-store.util';

/**
 * Disk persistence for generated 3D panel models. Same design as FrameStore:
 * the filesystem is the system of record, MockStore is the warm cache.
 *
 * Layout (strictly inside the owning project + panel):
 *   uploads/<PROJECT_CODE>/models/<FRAME_ID>/<modelId>.model.json   (record + audit)
 *   uploads/<PROJECT_CODE>/models/<FRAME_ID>/<modelId>.glb          (generated geometry)
 *
 * A record is never overwritten by a newer revision — every revision is its own
 * pair of files; superseding only updates the superseded record's status fields.
 */

function modelsDir(projectCode: string, frameId: string) {
  return path.join(uploadRootDir(), projectCode, 'models', frameId);
}

function removeDirIfExists(target: string) {
  if (!fs.existsSync(target)) return;
  fs.rmSync(target, { recursive: true, force: true });
}

function recordPath(record: Pick<PanelGeneratedModel, 'project_code' | 'frame_id' | 'id'>) {
  return path.join(modelsDir(record.project_code, record.frame_id), `${record.id}.model.json`);
}

function glbPath(record: Pick<PanelGeneratedModel, 'project_code' | 'frame_id' | 'id'>) {
  return path.join(modelsDir(record.project_code, record.frame_id), `${record.id}.glb`);
}

function upsertCache(record: PanelGeneratedModel) {
  const idx = MockStore.panelModels.findIndex(
    m => m.project_code === record.project_code && m.frame_id === record.frame_id && m.id === record.id,
  );
  if (idx === -1) MockStore.panelModels.push(record);
  else MockStore.panelModels[idx] = record;
}

export const PanelModelStore = {
  /** Persist one model record (and optionally its GLB) atomically, then refresh the cache. */
  persist(record: PanelGeneratedModel, glb?: Buffer) {
    atomicWriteFile(recordPath(record), JSON.stringify(record, null, 2));
    if (glb) atomicWriteFile(glbPath(record), glb);
    upsertCache(record);
  },

  /** Read the generated GLB for one model of one exact project + panel. */
  getGlb(projectCode: string, frameId: string, modelId: string): Buffer | null {
    const p = glbPath({ project_code: projectCode, frame_id: frameId, id: modelId });
    return fs.existsSync(p) ? fs.readFileSync(p) : null;
  },

  /** Load every persisted model record for one project into MockStore (idempotent). */
  loadProject(projectCode: string) {
    const root = path.join(uploadRootDir(), projectCode, 'models');
    if (!fs.existsSync(root)) return;
    for (const frameId of fs.readdirSync(root)) {
      const dir = path.join(root, frameId);
      let stat: fs.Stats;
      try { stat = fs.statSync(dir); } catch { continue; }
      if (!stat.isDirectory()) continue;
      for (const file of fs.readdirSync(dir)) {
        if (!file.endsWith('.model.json')) continue;
        try {
          const parsed = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8')) as PanelGeneratedModel;
          if (!parsed?.id || parsed.project_code !== projectCode || parsed.frame_id !== frameId) continue;
          if (!MockStore.panelModels.some(m => m.id === parsed.id && m.project_code === projectCode && m.frame_id === frameId)) {
            MockStore.panelModels.push(parsed);
          }
        } catch { /* skip malformed or partially-written records */ }
      }
    }
  },

  /** Drop cached models for panels that are deleted/blocked (mirrors drawings filtering). */
  evictFrames(projectCode: string, deletedFrameIds: ReadonlySet<string>) {
    MockStore.panelModels = MockStore.panelModels.filter(
      m => m.project_code !== projectCode || !deletedFrameIds.has(m.frame_id),
    );
  },

  /** Remove the on-disk model directory for one exact panel, including all revisions. */
  removeFrame(projectCode: string, frameId: string) {
    removeDirIfExists(modelsDir(projectCode, frameId));
    MockStore.panelModels = MockStore.panelModels.filter(
      m => m.project_code !== projectCode || m.frame_id !== frameId,
    );
  },

  /** All revisions for one panel, newest first (cache + disk merge). */
  list(projectCode: string, frameId: string): PanelGeneratedModel[] {
    this.loadProject(projectCode);
    return MockStore.findPanelModels(projectCode, frameId);
  },

  find(projectCode: string, frameId: string, modelId: string): PanelGeneratedModel | null {
    this.loadProject(projectCode);
    return MockStore.findPanelModelById(projectCode, frameId, modelId) ?? null;
  },

  nextRevision(projectCode: string, frameId: string): number {
    const all = this.list(projectCode, frameId);
    return all.length ? Math.max(...all.map(m => m.revision)) + 1 : 1;
  },

  /**
   * Mark every non-superseded model of this exact panel as superseded (read-only history).
   * Called when a new model revision is created AND when a new 2D drawing revision arrives.
   * Approval audit fields on old revisions are intentionally preserved.
   */
  supersedeActive(projectCode: string, frameId: string, supersededBy: string | null, reason: string) {
    const now = new Date().toISOString();
    for (const model of this.list(projectCode, frameId)) {
      if (model.status === 'superseded') continue;
      if (supersededBy && model.id === supersededBy) continue;
      model.superseded_from_status = model.status;
      model.superseded_status_message = model.status_message;
      model.status = 'superseded';
      model.status_message = reason;
      model.superseded_by = supersededBy;
      model.superseded_at = now;
      model.updated_at = now;
      model.stages = [...model.stages, { stage: 'superseded', at: now, detail: reason }];
      this.persist(model);
    }
  },
};
