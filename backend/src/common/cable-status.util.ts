/** Backward-compatible cable_status reader (String index keys → {src,dst,note?}). */
export interface CableStatusEntry {
  src?: boolean;
  dst?: boolean;
  note?: string;
  /** Technician who last marked src/dst on this cable (additive JSON — no DB column). */
  technicianId?: number;
  /**
   * Intentionally open end(s); may be set before or after completion (src+dst).
   * Additive JSON — no DB column / no schema migration.
   */
  openEnd?: 'source' | 'destination' | 'both' | null;
  /** Additive preparation / crimping JSON — no DB column. */
  crimping?: Record<string, unknown> | null;
}

export function parseCableStatus(raw: string | Record<string, CableStatusEntry> | null | undefined): Record<string, CableStatusEntry> {
  if (!raw) return {};
  if (typeof raw === 'object') return raw as Record<string, CableStatusEntry>;
  try { return JSON.parse(raw); } catch { return {}; }
}

export function cableStatusCounts(
  cableStatus: Record<string, CableStatusEntry>,
  cablesTotal: number,
): { srcDone: number; dstDone: number; bothDone: number; pending: number } {
  let srcDone = 0;
  let dstDone = 0;
  let bothDone = 0;
  for (let i = 0; i < cablesTotal; i++) {
    const s = cableStatus[String(i)] || {};
    if (s.src) srcDone++;
    if (s.dst) dstDone++;
    if (s.src && s.dst) bothDone++;
  }
  const pending = Math.max(0, cablesTotal - bothDone);
  return { srcDone, dstDone, bothDone, pending };
}
