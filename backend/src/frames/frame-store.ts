import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import {
  MockStore,
  FrameData,
  type PanelDrawingAsset,
  type PanelDrawingAssetKind,
  type PanelDrawingPackage,
} from '../data/mock-store';
import { PanelModelStore } from '../panel-model/panel-model-store';
import { DirFreshnessCache } from '../common/metadata-cache';

/** Skips the per-request package-manifest re-scan while the drawings dir is unchanged. */
const packageScanCache = new DirFreshnessCache();

function uploadDir() {
  return process.env.UPLOAD_DIR
    ? path.isAbsolute(process.env.UPLOAD_DIR)
      ? process.env.UPLOAD_DIR
      : path.join(process.cwd(), process.env.UPLOAD_DIR)
    : path.join(process.cwd(), 'uploads');
}

function framesDir(projectCode: string) {
  return path.join(uploadDir(), projectCode, 'frames');
}

function drawingsDir(projectCode: string) {
  return path.join(uploadDir(), projectCode, 'drawings');
}

function drawingPackagePath(projectCode: string, packageId: string) {
  return path.join(drawingsDir(projectCode), `${packageId}.package.json`);
}

function drawingPreviewPath(projectCode: string, drawingId: string, format: 'pdf' | 'svg') {
  return path.join(drawingsDir(projectCode), `${drawingId}.preview.${format}`);
}

function gaFacesDir(projectCode: string, frameId: string) {
  return path.join(uploadDir(), projectCode, 'ga-faces', frameId.replace(/[^a-zA-Z0-9_-]/g, '_'));
}

function gaFacePath(projectCode: string, frameId: string, assetSetId: string, face: string) {
  const safeSet = assetSetId.replace(/[^a-zA-Z0-9-]/g, '');
  const safeFace = face.replace(/[^a-zA-Z0-9_-]/g, '_');
  return path.join(gaFacesDir(projectCode, frameId), `${safeSet}_${safeFace}.png`);
}

function cadDerivativePath(projectCode: string, drawingId: string, extension: 'dxf' | 'pdf' | 'svg') {
  return path.join(drawingsDir(projectCode), `${drawingId}.derived.${extension}`);
}

function stableDrawingPackageId(projectCode: string, frameId: string) {
  return `pdr_${crypto.createHash('sha256').update(`${projectCode}\0${frameId}`).digest('hex').slice(0, 24)}`;
}

function sourceFormat(name: string) {
  return (name.split('.').pop() || '').trim().toLowerCase();
}

function inferDrawingKind(name: string): PanelDrawingAssetKind {
  return /\.(glb|gltf|step|stp|ifc|obj|fbx|stl)$/i.test(name) ? '3d' : '2d';
}

function drawingContentType(name: string): string {
  const ext = sourceFormat(name);
  const map: Record<string, string> = {
    pdf: 'application/pdf',
    dwg: 'application/acad',
    dxf: 'image/vnd.dxf',
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    gif: 'image/gif',
    webp: 'image/webp',
    bmp: 'image/bmp',
    svg: 'image/svg+xml',
    tif: 'image/tiff',
    tiff: 'image/tiff',
    glb: 'model/gltf-binary',
    gltf: 'model/gltf+json',
    obj: 'model/obj',
    stl: 'model/stl',
    fbx: 'application/octet-stream',
    step: 'application/step',
    stp: 'application/step',
    ifc: 'application/x-step',
  };
  return map[ext] || 'application/octet-stream';
}

function drawingPreview(name: string, filename: string, contentType: string): PanelDrawingAsset['preview'] {
  const ext = sourceFormat(name);
  if (['dwg', 'dxf', 'step', 'stp', 'ifc'].includes(ext)) {
    return {
      filename: '',
      content_type: '',
      format: ['dwg', 'dxf'].includes(ext) ? 'pdf' : 'glb',
      status: 'failed',
      error: 'A secure browser preview has not been generated. The original engineering source file is preserved unchanged.',
    };
  }
  return { filename, content_type: contentType, format: ext, status: 'source' };
}

function atomicWrite(filePath: string, data: Buffer | string) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tmp = `${filePath}.tmp-${process.pid}-${crypto.randomBytes(5).toString('hex')}`;
  fs.writeFileSync(tmp, data);
  try {
    fs.renameSync(tmp, filePath);
  } catch (error) {
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    fs.renameSync(tmp, filePath);
    if (!fs.existsSync(filePath)) throw error;
  }
}

function directorReportsDir(projectCode: string) {
  return path.join(uploadDir(), projectCode, 'director-reports');
}

export interface FrameStoreLoadOptions {
  activeProjectCodes?: ReadonlySet<string>;
  deletedPanelIdsByProject?: ReadonlyMap<string, ReadonlySet<string>>;
}

const blockedProjects = new Set<string>();
const blockedPanels = new Set<string>();
const panelKey = (projectCode: string, frameId: string) => `${projectCode}\0${frameId}`;

export const FrameStore = {
  blockProject(projectCode: string) {
    blockedProjects.add(projectCode);
  },

  blockPanel(projectCode: string, frameId: string) {
    blockedPanels.add(panelKey(projectCode, frameId));
  },

  isBlocked(projectCode: string, frameId?: string) {
    return blockedProjects.has(projectCode)
      || (!!frameId && blockedPanels.has(panelKey(projectCode, frameId)));
  },

  /** Load only database-authorized projects and panels into memory on startup. */
  loadAll(options: FrameStoreLoadOptions = {}) {
    const root = uploadDir();
    if (!fs.existsSync(root)) return;

    if (options.activeProjectCodes) {
      for (const projectCode of blockedProjects) blockedProjects.delete(projectCode);
      MockStore.frames = MockStore.frames.filter(frame => options.activeProjectCodes!.has(frame.project_code));
      MockStore.drawings = MockStore.drawings.filter(drawing => options.activeProjectCodes!.has(drawing.project_code));
      MockStore.drawingPackages = MockStore.drawingPackages.filter(record => options.activeProjectCodes!.has(record.project_code));
      MockStore.directorReports = MockStore.directorReports.filter(report => options.activeProjectCodes!.has(report.project_code));
      MockStore.panelModels = MockStore.panelModels.filter(model => options.activeProjectCodes!.has(model.project_code));
    }
    for (const [projectCode, frameIds] of options.deletedPanelIdsByProject ?? []) {
      for (const frameId of frameIds) this.blockPanel(projectCode, frameId);
    }

    for (const dir of fs.readdirSync(root)) {
      if (options.activeProjectCodes && !options.activeProjectCodes.has(dir)) {
        this.blockProject(dir);
        continue;
      }
      const deletedFrameIds = options.deletedPanelIdsByProject?.get(dir) ?? new Set<string>();
      const fd = path.join(root, dir, 'frames');
      if (fs.existsSync(fd)) {
        for (const file of fs.readdirSync(fd)) {
          if (!file.endsWith('.json')) continue;
          try {
            const frame: FrameData = JSON.parse(fs.readFileSync(path.join(fd, file), 'utf-8'));
            if (frame.project_code !== dir || deletedFrameIds.has(frame.id) || this.isBlocked(dir, frame.id)) continue;
            if (!MockStore.frames.find(f => f.id === frame.id)) {
              MockStore.frames.push(frame);
            }
          } catch { /* skip malformed */ }
        }
      }
      this.loadDrawingPackages(dir);
      PanelModelStore.loadProject(dir);
      PanelModelStore.evictFrames(dir, deletedFrameIds);
      MockStore.drawingPackages = MockStore.drawingPackages.filter(
        record => record.project_code !== dir || !deletedFrameIds.has(record.frame_id),
      );
      MockStore.drawings = MockStore.drawings.filter(
        drawing => drawing.project_code !== dir || !drawing.frame_id || !deletedFrameIds.has(drawing.frame_id),
      );
    }
    console.log(`[FrameStore] Loaded ${MockStore.frames.length} frames, ${MockStore.drawingPackages.length} drawing packages and ${MockStore.panelModels.length} generated panel models from disk`);
  },

  /** Save a new frame to disk (metadata JSON + Excel file) */
  save(frame: FrameData, excelBuffer?: Buffer) {
    const dir = framesDir(frame.project_code);
    fs.mkdirSync(dir, { recursive: true });
    const { file_buffer: _file_buffer, ...meta } = frame as any;
    fs.writeFileSync(path.join(dir, `${frame.id}.json`), JSON.stringify(meta, null, 2));
    if (excelBuffer) {
      fs.writeFileSync(path.join(dir, `${frame.id}.xlsx`), excelBuffer);
    }
  },

  /** Re-persist an existing frame (e.g. after compare_status change) */
  persist(frame: FrameData) {
    const dir = framesDir(frame.project_code);
    const p = path.join(dir, `${frame.id}.json`);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const { file_buffer: _file_buffer, ...meta } = frame as any;
    fs.writeFileSync(p, JSON.stringify(meta, null, 2));
  },

  /** Read the original Excel buffer from disk */
  getBuffer(projectCode: string, frameId: string): Buffer | null {
    const p = path.join(framesDir(projectCode), `${frameId}.xlsx`);
    return fs.existsSync(p) ? fs.readFileSync(p) : null;
  },

  /** Absolute path of the original uploaded wiring-schedule Excel, if present. */
  resolveExcelAbsolutePath(projectCode: string, frameId: string): string | null {
    const p = path.resolve(framesDir(projectCode), `${frameId}.xlsx`);
    const root = path.resolve(uploadDir(), projectCode, 'frames');
    if (!p.startsWith(root + path.sep) && p !== root) return null;
    return fs.existsSync(p) ? p : null;
  },

  /** Display path under uploads/ for the original frame Excel. */
  excelDisplayPath(projectCode: string, frameId: string): string {
    return `uploads/${String(projectCode)}/frames/${frameId}.xlsx`.replace(/\\/g, '/');
  },

  /** Delete frame files from disk */
  remove(projectCode: string, frameId: string) {
    for (const ext of ['.json', '.xlsx']) {
      const p = path.join(framesDir(projectCode), `${frameId}${ext}`);
      if (fs.existsSync(p)) fs.unlinkSync(p);
    }
  },

  /** Remove GA face image directory for one panel (Digital Twin mapping artifacts). */
  removeGaFaces(projectCode: string, frameId: string) {
    const dir = gaFacesDir(projectCode, frameId);
    if (!fs.existsSync(dir)) return;
    fs.rmSync(dir, { recursive: true, force: true });
  },

  /** Save a drawing file to disk */
  saveDrawing(
    projectCode: string,
    drawingId: string,
    filename: string,
    buffer: Buffer,
    frameId?: string,
    metadata?: {
      package_id?: string;
      kind?: PanelDrawingAssetKind;
      content_type?: string;
      sha256?: string;
      uploaded_at?: string;
      uploaded_by?: number;
    },
  ) {
    const dir = drawingsDir(projectCode);
    fs.mkdirSync(dir, { recursive: true });
    atomicWrite(path.join(dir, `${drawingId}_${filename}`), buffer);
    atomicWrite(
      path.join(dir, `${drawingId}.meta.json`),
      JSON.stringify({ frame_id: frameId || null, ...metadata }, null, 2),
    );
    packageScanCache.invalidate(projectCode);
  },

  saveDrawingPreview(projectCode: string, drawingId: string, format: 'pdf' | 'svg', buffer: Buffer) {
    const target = drawingPreviewPath(projectCode, drawingId, format);
    atomicWrite(target, buffer);
    packageScanCache.invalidate(projectCode);
    return path.basename(target);
  },

  /** Store one bounded, supervisor-selected GA face image as a derived artifact. */
  saveGaFaceImage(projectCode: string, frameId: string, assetSetId: string, face: string, buffer: Buffer) {
    const target = gaFacePath(projectCode, frameId, assetSetId, face);
    atomicWrite(target, buffer);
    return target;
  },

  getGaFaceImage(projectCode: string, frameId: string, assetSetId: string, face: string) {
    const target = gaFacePath(projectCode, frameId, assetSetId, face);
    if (!fs.existsSync(target)) return null;
    const stat = fs.lstatSync(target);
    if (!stat.isFile() || stat.isSymbolicLink()) return null;
    return { buffer: fs.readFileSync(target), filename: path.basename(target), contentType: 'image/png' };
  },

  saveCadDerivative(
    projectCode: string,
    drawingId: string,
    extension: 'dxf' | 'pdf' | 'svg',
    buffer: Buffer,
  ) {
    const target = cadDerivativePath(projectCode, drawingId, extension);
    atomicWrite(target, buffer);
    return target;
  },

  getCadDerivative(projectCode: string, drawingId: string, extension: 'dxf' | 'pdf' | 'svg') {
    const target = cadDerivativePath(projectCode, drawingId, extension);
    if (!fs.existsSync(target)) return null;
    const stat = fs.lstatSync(target);
    if (!stat.isFile() || stat.isSymbolicLink()) return null;
    return {
      buffer: fs.readFileSync(target),
      filename: path.basename(target),
      contentType: extension === 'dxf' ? 'image/vnd.dxf' : extension === 'pdf' ? 'application/pdf' : 'image/svg+xml',
    };
  },

  getDrawingPreviewFile(
    projectCode: string,
    drawingId: string,
    format: string,
  ): { buffer: Buffer; filename: string; contentType: string } | null {
    if (format !== 'pdf' && format !== 'svg') return null;
    const target = drawingPreviewPath(projectCode, drawingId, format);
    if (!fs.existsSync(target)) return null;
    return {
      buffer: fs.readFileSync(target),
      filename: path.basename(target),
      contentType: format === 'pdf' ? 'application/pdf' : 'image/svg+xml',
    };
  },

  getDrawingPreviewFilePaths(projectCode: string, drawingId: string): string[] {
    return (['pdf', 'svg'] as const)
      .map(format => drawingPreviewPath(projectCode, drawingId, format))
      .filter(file => fs.existsSync(file));
  },

  /** Read a drawing file from disk by id (filename on disk is `<drawingId>_<original>`).
   *  Recovers the file even after a restart when MockStore is empty. */
  getDrawingFile(projectCode: string, drawingId: string): { buffer: Buffer; filename: string } | null {
    const dir = drawingsDir(projectCode);
    if (!fs.existsSync(dir)) return null;
    const prefix = `${drawingId}_`;
    const match = fs.readdirSync(dir).find(f => f.startsWith(prefix));
    if (!match) return null;
    return { buffer: fs.readFileSync(path.join(dir, match)), filename: match.slice(prefix.length) };
  },

  /**
   * List drawing metadata from disk (`uploads/<code>/drawings/<id>_<original>`).
   * Used to rehydrate MockStore after restart so GET /drawings is not empty
   * while files still exist on disk (false "No Drawing Uploaded" in UI).
   */
  listDrawingsFromDisk(projectCode: string): Array<{
    id: string;
    project_code: string;
    frame_id?: string;
    package_id?: string;
    kind?: PanelDrawingAssetKind;
    sha256?: string;
    uploaded_by?: number;
    filename: string;
    original_name: string;
    content_type: string;
    uploaded_at: string;
    size: number;
  }> {
    const dir = drawingsDir(projectCode);
    if (!fs.existsSync(dir)) return [];
    const out: Array<{
      id: string;
      project_code: string;
      frame_id?: string;
      package_id?: string;
      kind?: PanelDrawingAssetKind;
      sha256?: string;
      uploaded_by?: number;
      filename: string;
      original_name: string;
      content_type: string;
      uploaded_at: string;
      size: number;
    }> = [];
    for (const file of fs.readdirSync(dir)) {
      if (file.startsWith('.') || file.endsWith('.meta.json') || file.endsWith('.package.json')) continue;
      // Supports both legacy timestamp IDs and collision-safe UUID IDs.
      const m = file.match(/^(drw_(?:\d+|[0-9a-fA-F-]{36}))_(.+)$/);
      if (!m) continue;
      const id = m[1];
      const original_name = m[2];
      if (!id || !original_name) continue;
      const full = path.join(dir, file);
      let size = 0;
      let uploaded_at = new Date().toISOString();
      try {
        const st = fs.statSync(full);
        if (!st.isFile()) continue;
        size = st.size;
        uploaded_at = st.mtime.toISOString();
      } catch {
        continue;
      }
      let content_type = drawingContentType(original_name);
      let frame_id: string | undefined;
      let package_id: string | undefined;
      let kind: PanelDrawingAssetKind | undefined;
      let sha256: string | undefined;
      let uploaded_by: number | undefined;
      try {
        const meta = JSON.parse(fs.readFileSync(path.join(dir, `${id}.meta.json`), 'utf8')) as Record<string, unknown>;
        if (typeof meta.frame_id === 'string' && meta.frame_id.trim()) frame_id = meta.frame_id.trim();
        if (typeof meta.package_id === 'string' && meta.package_id.trim()) package_id = meta.package_id.trim();
        if (meta.kind === '2d' || meta.kind === '3d') kind = meta.kind;
        if (typeof meta.sha256 === 'string' && meta.sha256.trim()) sha256 = meta.sha256.trim();
        if (typeof meta.uploaded_by === 'number') uploaded_by = meta.uploaded_by;
        if (typeof meta.uploaded_at === 'string' && meta.uploaded_at.trim()) uploaded_at = meta.uploaded_at;
        if (typeof meta.content_type === 'string' && meta.content_type.trim()) content_type = meta.content_type;
      } catch { /* legacy drawing without panel metadata */ }
      out.push({
        id,
        project_code: projectCode,
        frame_id,
        package_id,
        kind,
        sha256,
        uploaded_by,
        filename: file,
        original_name,
        content_type,
        uploaded_at,
        size,
      });
    }
    return out;
  },

  drawingPackageId(projectCode: string, frameId: string) {
    return stableDrawingPackageId(projectCode, frameId);
  },

  /** Load persisted package manifests for one project into the in-memory cache. */
  loadDrawingPackages(projectCode: string) {
    const dir = drawingsDir(projectCode);
    if (!fs.existsSync(dir)) return;
    if (packageScanCache.isFresh(projectCode, dir)) return;
    const scannedMtimeMs = fs.statSync(dir).mtimeMs;
    for (const file of fs.readdirSync(dir)) {
      if (!file.endsWith('.package.json')) continue;
      try {
        const parsed = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8')) as PanelDrawingPackage;
        if (!parsed?.id || parsed.project_code !== projectCode || !parsed.frame_id) continue;
        const idx = MockStore.drawingPackages.findIndex(p => p.project_code === projectCode && p.frame_id === parsed.frame_id);
        if (idx === -1) MockStore.drawingPackages.push(parsed);
        else if (MockStore.drawingPackages[idx].revision < parsed.revision) MockStore.drawingPackages[idx] = parsed;
      } catch { /* ignore malformed or partially-written manifests */ }
    }
    packageScanCache.markFresh(projectCode, scannedMtimeMs);
  },

  /**
   * Return the stable package for a panel. Existing flat assets are exposed through a
   * deterministic virtual package until the first slot write materializes its manifest.
   */
  getDrawingPackage(projectCode: string, frameId: string): PanelDrawingPackage | null {
    if (this.isBlocked(projectCode, frameId)) return null;
    this.loadDrawingPackages(projectCode);
    const persisted = MockStore.drawingPackages.find(p => p.project_code === projectCode && p.frame_id === frameId);
    if (persisted) return persisted;

    const frame = MockStore.findFrameByProjectAndId(projectCode, frameId) ?? this.getFrameFromDisk(projectCode, frameId);
    if (!frame) return null;

    const diskRows = this.listDrawingsFromDisk(projectCode);
    for (const disk of diskRows) {
      if (!MockStore.drawings.some(d => d.id === disk.id && d.project_code === projectCode)) MockStore.drawings.push(disk);
    }
    const frames = MockStore.findFramesByProject(projectCode);
    const allowLegacy = frames.length === 1 && frames[0]?.id === frameId;
    const rows = MockStore.findDrawingsByProject(projectCode)
      .filter(d => d.frame_id === frameId || (allowLegacy && !d.frame_id))
      .sort((a, b) => new Date(b.uploaded_at || 0).getTime() - new Date(a.uploaded_at || 0).getTime());

    const toAsset = (row: (typeof rows)[number], kind: PanelDrawingAssetKind): PanelDrawingAsset => {
      const disk = this.getDrawingFile(projectCode, row.id);
      const sha256 = row.sha256 || (disk ? crypto.createHash('sha256').update(disk.buffer).digest('hex') : '');
      const contentType = row.content_type || drawingContentType(row.original_name);
      return {
        id: row.id,
        kind,
        filename: row.filename,
        original_name: row.original_name,
        content_type: contentType,
        source_format: sourceFormat(row.original_name),
        size: row.size,
        sha256,
        uploaded_at: row.uploaded_at,
        ...(row.uploaded_by !== undefined ? { uploaded_by: row.uploaded_by } : {}),
        preview: drawingPreview(row.original_name, row.filename, contentType),
      };
    };

    const drawing2d = rows.find(row => (row.kind || inferDrawingKind(row.original_name)) === '2d');
    const model3d = rows.find(row => (row.kind || inferDrawingKind(row.original_name)) === '3d');
    const createdAt = [drawing2d?.uploaded_at, model3d?.uploaded_at, frame.uploaded_at].filter(Boolean).sort()[0] || frame.uploaded_at;
    const updatedAt = [drawing2d?.uploaded_at, model3d?.uploaded_at, frame.uploaded_at].filter(Boolean).sort().at(-1) || frame.uploaded_at;
    return {
      id: stableDrawingPackageId(projectCode, frameId),
      project_code: projectCode,
      frame_id: frameId,
      revision: 0,
      created_at: createdAt,
      updated_at: updatedAt,
      drawing_2d: drawing2d ? toAsset(drawing2d, '2d') : null,
      model_3d: model3d ? toAsset(model3d, '3d') : null,
    };
  },

  /** Persist one package manifest with an atomic temporary-file rename. */
  persistDrawingPackage(record: PanelDrawingPackage) {
    atomicWrite(drawingPackagePath(record.project_code, record.id), JSON.stringify(record, null, 2));
    packageScanCache.invalidate(record.project_code);
    const idx = MockStore.drawingPackages.findIndex(p => p.project_code === record.project_code && p.frame_id === record.frame_id);
    if (idx === -1) MockStore.drawingPackages.push(record);
    else MockStore.drawingPackages[idx] = record;
  },

  removeDrawingPackage(projectCode: string, frameId: string) {
    const record = this.getDrawingPackage(projectCode, frameId);
    if (!record) return;
    for (const asset of [record.drawing_2d, record.model_3d]) {
      if (!asset) continue;
      this.removeDrawing(projectCode, asset.id, asset.original_name);
      const idx = MockStore.drawings.findIndex(d => d.project_code === projectCode && d.id === asset.id);
      if (idx !== -1) MockStore.drawings.splice(idx, 1);
    }
    const manifest = drawingPackagePath(projectCode, record.id);
    if (fs.existsSync(manifest)) fs.unlinkSync(manifest);
    MockStore.drawingPackages = MockStore.drawingPackages.filter(p => !(p.project_code === projectCode && p.frame_id === frameId));
    packageScanCache.invalidate(projectCode);
  },

  /** Read a single frame JSON directly from disk — fallback when MockStore is cold.
   *  After a restart, FrameStore.loadAll() repopulates MockStore; this covers the gap
   *  if a frame was written between loadAll() and this request. */
  getFrameFromDisk(projectCode: string, frameId: string): FrameData | null {
    if (this.isBlocked(projectCode, frameId)) return null;
    const p = path.join(framesDir(projectCode), `${frameId}.json`);
    if (!fs.existsSync(p)) return null;
    try { return JSON.parse(fs.readFileSync(p, 'utf-8')) as FrameData; } catch { return null; }
  },

  /** Delete a drawing from disk (prefix match — original_name may differ from on-disk suffix). */
  removeDrawing(projectCode: string, drawingId: string, filename: string) {
    const exact = path.join(drawingsDir(projectCode), `${drawingId}_${filename}`);
    if (fs.existsSync(exact)) {
      fs.unlinkSync(exact);
    } else {
      const found = this.getDrawingFilePath(projectCode, drawingId);
      if (found && fs.existsSync(found)) fs.unlinkSync(found);
    }
    const meta = path.join(drawingsDir(projectCode), `${drawingId}.meta.json`);
    if (fs.existsSync(meta)) fs.unlinkSync(meta);
    for (const preview of this.getDrawingPreviewFilePaths(projectCode, drawingId)) fs.unlinkSync(preview);
    for (const extension of ['dxf', 'pdf', 'svg'] as const) {
      const derived = cadDerivativePath(projectCode, drawingId, extension);
      if (fs.existsSync(derived)) fs.unlinkSync(derived);
    }
    packageScanCache.invalidate(projectCode);
  },

  /** Return absolute paths of existing frame files (.json and .xlsx) */
  getFrameFilePaths(projectCode: string, frameId: string): string[] {
    const dir = framesDir(projectCode);
    return ['.json', '.xlsx']
      .map(ext => path.join(dir, `${frameId}${ext}`))
      .filter(p => fs.existsSync(p));
  },

  /** Archive frame JSON + Excel to uploads/backups/ before replace. Returns archive dir or null. */
  archiveFrameFiles(projectCode: string, frameId: string, panelName: string): string | null {
    const srcPaths = this.getFrameFilePaths(projectCode, frameId);
    if (!srcPaths.length) return null;
    const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const safeName = panelName.trim().replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 40);
    const archiveDir = path.join(uploadDir(), 'backups', `FRAME_REPLACE_${safeName}_${ts}`);
    fs.mkdirSync(archiveDir, { recursive: true });
    for (const src of srcPaths) {
      fs.copyFileSync(src, path.join(archiveDir, path.basename(src)));
    }
    return archiveDir;
  },

  /** Archive a drawing file to uploads/backups/ before replace. Returns archive dir or null. */
  archiveDrawingFile(projectCode: string, drawingId: string, originalName: string): string | null {
    const src = this.getDrawingFilePath(projectCode, drawingId);
    if (!src) return null;
    const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const safeName = originalName.trim().replace(/[^a-zA-Z0-9_.-]/g, '_').slice(0, 40);
    const archiveDir = path.join(uploadDir(), 'backups', `DRAWING_REPLACE_${safeName}_${ts}`);
    fs.mkdirSync(archiveDir, { recursive: true });
    fs.copyFileSync(src, path.join(archiveDir, path.basename(src)));
    const meta = path.join(drawingsDir(projectCode), `${drawingId}.meta.json`);
    if (fs.existsSync(meta)) fs.copyFileSync(meta, path.join(archiveDir, path.basename(meta)));
    for (const preview of this.getDrawingPreviewFilePaths(projectCode, drawingId)) {
      fs.copyFileSync(preview, path.join(archiveDir, path.basename(preview)));
    }
    return archiveDir;
  },

  /** Return the absolute path of the drawing file on disk (prefix-search), or null */
  getDrawingFilePath(projectCode: string, drawingId: string): string | null {
    const dir = drawingsDir(projectCode);
    if (!fs.existsSync(dir)) return null;
    const prefix = `${drawingId}_`;
    const match = fs.readdirSync(dir).find(f => f.startsWith(prefix));
    return match ? path.join(dir, match) : null;
  },

  saveDirectorReport(projectCode: string, reportId: string, filename: string, buffer: Buffer) {
    const dir = directorReportsDir(projectCode);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, `${reportId}_${filename}`), buffer);
  },

  getDirectorReportFile(projectCode: string, reportId: string): { buffer: Buffer; filename: string } | null {
    const dir = directorReportsDir(projectCode);
    if (!fs.existsSync(dir)) return null;
    const prefix = `${reportId}_`;
    const match = fs.readdirSync(dir).find(f => f.startsWith(prefix));
    if (!match) return null;
    return { buffer: fs.readFileSync(path.join(dir, match)), filename: match.slice(prefix.length) };
  },

  removeDirectorReport(projectCode: string, reportId: string, filename: string) {
    const p = path.join(directorReportsDir(projectCode), `${reportId}_${filename}`);
    if (fs.existsSync(p)) fs.unlinkSync(p);
  },
};
