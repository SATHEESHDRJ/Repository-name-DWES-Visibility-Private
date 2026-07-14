import * as fs from 'fs';

/**
 * Directory-freshness gate for metadata folders that hot request paths would
 * otherwise re-scan (readdir + JSON.parse) on every call — e.g. the per-project
 * drawing-package manifests consulted by technician my-panels polling.
 *
 * A scan may be skipped only while the directory's mtime is unchanged since the
 * last completed scan. Every in-process write path must also call invalidate()
 * so same-millisecond writes can never be masked by mtime granularity.
 *
 * In-process memory only — correct under DWES's documented single-backend-
 * instance limit (see LIVE-UPDATES.md). A second instance writing the same
 * uploads tree would still be caught by the mtime check on the next call.
 */
export class DirFreshnessCache {
  private mtimes = new Map<string, number>();

  /** True when `dir` is unchanged since the last markFresh for this key. */
  isFresh(key: string, dir: string): boolean {
    const cached = this.mtimes.get(key);
    if (cached === undefined) return false;
    try {
      return fs.statSync(dir).mtimeMs === cached;
    } catch {
      return false;
    }
  }

  /** Record the mtime observed *before* the scan, so a write that lands mid-scan forces a re-scan. */
  markFresh(key: string, mtimeMs: number) {
    this.mtimes.set(key, mtimeMs);
  }

  /** Call from every code path that writes into the keyed directory. */
  invalidate(key: string) {
    this.mtimes.delete(key);
  }
}
