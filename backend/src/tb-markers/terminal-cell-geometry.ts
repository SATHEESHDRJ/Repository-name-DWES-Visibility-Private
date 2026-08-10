/**
 * Resolve paint geometry for LIVE TB markers.
 * Prefer terminal cell when present; otherwise paint the physical TB header group / strip.
 */
export type NormBox = {
  x: number;
  y: number;
  width: number;
  height: number;
  rotation?: number;
};

export type TerminalCellEvidence = {
  terminal: string;
  x: number;
  y: number;
  width: number;
  height: number;
  index?: number;
};

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

function normTerm(t: string): string {
  return String(t || '')
    .trim()
    .replace(/[^0-9A-Za-z]/g, '')
    .toUpperCase();
}

/** Extract terminal → cell boxes from marker.geometry JSON. */
export function readTerminalCells(geometry: unknown): Record<string, NormBox> {
  const g = geometry && typeof geometry === 'object' ? (geometry as any) : null;
  if (!g) return {};
  const cells = g.terminal_cells || g.terminalCells;
  if (!cells || typeof cells !== 'object') return {};
  const out: Record<string, NormBox> = {};
  for (const [k, v] of Object.entries(cells)) {
    const box = v as any;
    if (!box || typeof box !== 'object') continue;
    const x = Number(box.x);
    const y = Number(box.y);
    const w = Number(box.width);
    const h = Number(box.height);
    if (![x, y, w, h].every(Number.isFinite)) continue;
    out[normTerm(k)] = {
      x: clamp01(x),
      y: clamp01(y),
      width: clamp01(w),
      height: clamp01(h),
      rotation: Number(box.rotation) || 0,
    };
  }
  return out;
}

/**
 * Resolve exact terminal cell if present; else null.
 * LIVE TB paint uses header-group geometry when this returns null.
 */
export function resolveTerminalCellGeometry(
  geometry: unknown,
  terminal: string,
): NormBox | null {
  const key = normTerm(terminal);
  if (!key) return null;
  const cells = readTerminalCells(geometry);
  if (cells[key]) return cells[key];
  if (/^\d+$/.test(key)) {
    const n = String(Number(key));
    if (cells[n]) return cells[n];
  }
  return null;
}

/** Strip / header box — primary LIVE TB highlight target (TB header group). */
export function readStripBBox(geometry: unknown): NormBox | null {
  const g = geometry && typeof geometry === 'object' ? (geometry as any) : null;
  if (!g) return null;
  const strip = g.strip_bbox || g.stripBbox;
  const src = strip && typeof strip === 'object' ? strip : g;
  const x = Number(src.x);
  const y = Number(src.y);
  const w = Number(src.width);
  const h = Number(src.height);
  if (![x, y, w, h].every(Number.isFinite)) return null;
  if (w <= 0 || h <= 0) return null;
  return {
    x: clamp01(x),
    y: clamp01(y),
    width: clamp01(w),
    height: clamp01(h),
    rotation: Number(src.rotation) || 0,
  };
}

/**
 * Geometry for painting the physical TB header group / strip segment.
 * Prefer strip_bbox, then top-level marker geometry.
 */
export function resolveHeaderGroupGeometry(geometry: unknown): NormBox | null {
  const strip = readStripBBox(geometry);
  if (strip && strip.width > 0.001 && strip.height > 0.001) return strip;
  return null;
}

export function readViewClassification(geometry: unknown, viewName?: string | null): string {
  const g = geometry && typeof geometry === 'object' ? (geometry as any) : null;
  return String(
    g?.view_classification || g?.viewClassification || viewName || 'UNKNOWN',
  ).toUpperCase();
}
