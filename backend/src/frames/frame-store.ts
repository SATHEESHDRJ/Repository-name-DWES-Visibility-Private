import * as fs from 'fs';
import * as path from 'path';
import { MockStore, FrameData } from '../data/mock-store';

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

function directorReportsDir(projectCode: string) {
  return path.join(uploadDir(), projectCode, 'director-reports');
}

export const FrameStore = {
  /** Load all persisted frames into MockStore.frames on startup */
  loadAll() {
    const root = uploadDir();
    if (!fs.existsSync(root)) return;
    for (const dir of fs.readdirSync(root)) {
      const fd = path.join(root, dir, 'frames');
      if (!fs.existsSync(fd)) continue;
      for (const file of fs.readdirSync(fd)) {
        if (!file.endsWith('.json')) continue;
        try {
          const frame: FrameData = JSON.parse(fs.readFileSync(path.join(fd, file), 'utf-8'));
          if (!MockStore.frames.find(f => f.id === frame.id)) {
            MockStore.frames.push(frame);
          }
        } catch { /* skip malformed */ }
      }
    }
    console.log(`[FrameStore] Loaded ${MockStore.frames.length} frames from disk`);
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

  /** Delete frame files from disk */
  remove(projectCode: string, frameId: string) {
    for (const ext of ['.json', '.xlsx']) {
      const p = path.join(framesDir(projectCode), `${frameId}${ext}`);
      if (fs.existsSync(p)) fs.unlinkSync(p);
    }
  },

  /** Save a drawing file to disk */
  saveDrawing(projectCode: string, drawingId: string, filename: string, buffer: Buffer) {
    const dir = drawingsDir(projectCode);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, `${drawingId}_${filename}`), buffer);
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
      filename: string;
      original_name: string;
      content_type: string;
      uploaded_at: string;
      size: number;
    }> = [];
    for (const file of fs.readdirSync(dir)) {
      if (file.startsWith('.')) continue;
      // IDs are `drw_<timestamp>` — split after the timestamp, not the first underscore.
      const m = file.match(/^(drw_\d+)_(.+)$/);
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
      const ext = original_name.split('.').pop()?.toLowerCase() ?? '';
      const content_type =
        ext === 'pdf' ? 'application/pdf'
          : ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg'].includes(ext) ? `image/${ext === 'jpg' ? 'jpeg' : ext}`
            : 'application/octet-stream';
      out.push({
        id,
        project_code: projectCode,
        filename: file,
        original_name,
        content_type,
        uploaded_at,
        size,
      });
    }
    return out;
  },

  /** Read a single frame JSON directly from disk — fallback when MockStore is cold.
   *  After a restart, FrameStore.loadAll() repopulates MockStore; this covers the gap
   *  if a frame was written between loadAll() and this request. */
  getFrameFromDisk(projectCode: string, frameId: string): FrameData | null {
    const p = path.join(framesDir(projectCode), `${frameId}.json`);
    if (!fs.existsSync(p)) return null;
    try { return JSON.parse(fs.readFileSync(p, 'utf-8')) as FrameData; } catch { return null; }
  },

  /** Delete a drawing from disk (prefix match — original_name may differ from on-disk suffix). */
  removeDrawing(projectCode: string, drawingId: string, filename: string) {
    const exact = path.join(drawingsDir(projectCode), `${drawingId}_${filename}`);
    if (fs.existsSync(exact)) {
      fs.unlinkSync(exact);
      return;
    }
    const found = this.getDrawingFilePath(projectCode, drawingId);
    if (found && fs.existsSync(found)) fs.unlinkSync(found);
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
    const safeName = panelName.trim().replace(/[^a-zA-Z0-9_\-]/g, '_').slice(0, 40);
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
    const safeName = originalName.trim().replace(/[^a-zA-Z0-9_.\-]/g, '_').slice(0, 40);
    const archiveDir = path.join(uploadDir(), 'backups', `DRAWING_REPLACE_${safeName}_${ts}`);
    fs.mkdirSync(archiveDir, { recursive: true });
    fs.copyFileSync(src, path.join(archiveDir, path.basename(src)));
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
