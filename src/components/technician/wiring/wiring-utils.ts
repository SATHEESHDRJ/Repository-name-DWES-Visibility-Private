import type { Cable } from '../../../types';

export interface ExtendedCableStatus {
  src: boolean;
  dst: boolean;
  note: string;
  issue?: boolean;
}

export type WireFilter = 'all' | 'pending' | 'partial' | 'done' | 'issues';
export type WireSort = 'serial' | 'ref' | 'status';

/** Shared fallback for untouched cables — stable identity so memoized rows can skip re-render. */
export const DEFAULT_CABLE_STATUS: ExtendedCableStatus = Object.freeze({
  src: false, dst: false, note: '', issue: false,
});

export function displayValue(value?: string | null): string {
  return (value ?? '').trim() ? String(value).trim() : '—';
}

function normalizeTextValue(value?: string | null): string {
  return String(value ?? '').trim().replace(/\s+/g, ' ');
}

function normalizeWireColorValue(value?: string | null): string {
  return normalizeTextValue(value).replace(/\s*\/\s*/g, '/');
}

function normalizeLengthValue(value?: string | null): string {
  const text = normalizeTextValue(value);
  if (!text) return '';
  const normalized = text.replace(/,/g, '.').trim();
  const match = normalized.match(/(-?\d+(?:\.\d+)?)/);
  if (match) return match[1];
  return normalized.replace(/m$/i, '').trim();
}

function normalizeCableFieldValue(key: string, value: unknown): string | number {
  if (key === 'sno') {
    if (typeof value === 'number') return value;
    if (typeof value === 'string') {
      const trimmed = value.trim();
      return trimmed ? Number(trimmed) || 0 : 0;
    }
    return 0;
  }
  if (key === 'color') return normalizeWireColorValue(String(value ?? ''));
  if (key === 'length') return normalizeLengthValue(String(value ?? ''));
  return normalizeTextValue(String(value ?? ''));
}

export const FIELD_ORDER = [
  'sno', 'panel', 'ref', 'ferrule', 'path',
  'source_device', 'source_terminal', 'dest_device', 'dest_terminal',
  'source', 'destination',
  'color', 'size', 'length', 'sign', 'rack', 'remarks',
] as const;

export function wireTone(st: ExtendedCableStatus): 'done' | 'partial' | 'pending' {
  if (st.src && st.dst) return 'done';
  if (st.src || st.dst) return 'partial';
  return 'pending';
}

export function deriveExcelHeaders(
  mapping: Record<string, string>,
  excelHeaders?: string[],
  sampleRaw?: Record<string, string>,
): string[] {
  if (excelHeaders?.length) return excelHeaders;
  const headers: string[] = [];
  const seen = new Set<string>();
  for (const key of FIELD_ORDER) {
    const h = mapping[key];
    if (h && !seen.has(h)) {
      headers.push(h);
      seen.add(h);
    }
  }
  for (const h of Object.values(mapping)) {
    if (h && !seen.has(h)) {
      headers.push(h);
      seen.add(h);
    }
  }
  if (!headers.length && sampleRaw) {
    for (const k of Object.keys(sampleRaw)) {
      if (k && !seen.has(k)) {
        headers.push(k);
        seen.add(k);
      }
    }
  }
  return headers;
}

/** Match _raw keys with normalized header comparison. */
function rawCellValue(raw: Record<string, string>, excelHeader: string): string {
  if (excelHeader in raw) return raw[excelHeader] ?? '';
  const target = excelHeader.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  for (const [k, v] of Object.entries(raw)) {
    if (k.trim().toUpperCase().replace(/[^A-Z0-9]/g, '') === target) return v ?? '';
  }
  return '';
}

export function getCellValue(
  cable: Cable & { _raw?: Record<string, string> },
  excelHeader: string,
  mapping: Record<string, string>,
): string {
  const sysKey = Object.entries(mapping).find(([, h]) => h === excelHeader)?.[0];
  if (sysKey) {
    const v = (cable as unknown as Record<string, unknown>)[sysKey];
    if (v !== undefined && v !== null && String(v).trim() !== '') return String(v);
  }
  if (cable._raw) {
    const fromRaw = rawCellValue(cable._raw, excelHeader);
    if (fromRaw) return fromRaw;
  }
  return '';
}

const EMPTY_CABLE = (): Cable => ({
  sno: 0, panel: '', ferrule: '', source_device: '', source_terminal: '',
  source: '', destination: '', dest_device: '', dest_terminal: '',
  ref: '', color: '', size: '', length: '', sign: '', remarks: '', path: '', rack: '',
});

/** Back-fill mapped system fields from `_raw` when the parsed cable object is sparse. */
export function normalizeCable(
  cable: Cable | null | undefined,
  index: number,
  mapping: Record<string, string>,
): Cable & { _raw?: Record<string, string> } {
  const base = cable && typeof cable === 'object'
    ? { ...cable, sno: cable.sno ?? index + 1 }
    : { ...EMPTY_CABLE(), sno: index + 1 };

  const out = { ...base } as Cable & { _raw?: Record<string, string> };
  for (const key of FIELD_ORDER) {
    const header = mapping[key];
    if (!header) continue;
    const cur = (out as unknown as Record<string, unknown>)[key];
    if (cur !== undefined && cur !== null && String(cur).trim() !== '') continue;
    const fromRaw = getCellValue(out, header, mapping);
    if (fromRaw) (out as unknown as Record<string, unknown>)[key] = fromRaw;
  }

  for (const key of ['panel', 'ferrule', 'source_device', 'source_terminal', 'source', 'destination', 'dest_device', 'dest_terminal', 'ref', 'color', 'size', 'length', 'sign', 'remarks', 'path', 'rack']) {
    const current = (out as unknown as Record<string, unknown>)[key];
    if (current !== undefined && current !== null) {
      (out as unknown as Record<string, unknown>)[key] = normalizeCableFieldValue(key, current);
    }
  }

  // PNLNO can arrive as a formula-style string ("=H00+R") — strip the leading
  // "=" for display (spec: WRING_FRAME sheet quirk).
  if (out.panel?.startsWith('=')) out.panel = out.panel.slice(1);

  if (!out.source?.trim() && out.path?.includes('->')) {
    const [s, d] = out.path.split('->');
    if (s?.trim()) out.source = s.trim();
    if (d?.trim()) out.destination = d.trim();
  }
  if (!out.source_device?.trim() && out.source?.includes(':')) {
    const p = out.source.split(':');
    out.source_device = p.slice(0, -1).join(':');
    out.source_terminal = p[p.length - 1];
  }
  if (!out.dest_device?.trim() && out.destination?.includes(':')) {
    const p = out.destination.split(':');
    out.dest_device = p.slice(0, -1).join(':');
    out.dest_terminal = p[p.length - 1];
  }
  return out;
}

/** Alias used by schedule import paths — normalize one cable row for display. */
export const cableToEntry = normalizeCable;

/** Pad / normalize the cable list so index N always resolves to a displayable row. */
export function ensureCableList(
  cables: Cable[] | null | undefined,
  expectedTotal: number,
  mapping: Record<string, string>,
): Cable[] {
  const list = Array.isArray(cables) ? cables : [];
  const total = Math.max(list.length, expectedTotal, 0);
  const result: Cable[] = [];
  for (let i = 0; i < total; i++) {
    result.push(normalizeCable(list[i], i, mapping));
  }
  return result;
}

export function scheduleRowCells(
  cable: Cable & { _raw?: Record<string, string> },
  mapping: Record<string, string>,
  excelHeaders: string[],
): Array<{ header: string; value: string }> {
  return excelHeaders.map(header => ({ header, value: getCellValue(cable, header, mapping) }));
}

export function findNextPending(
  fromIdx: number,
  total: number,
  status: Record<string, ExtendedCableStatus>,
): number | null {
  if (total <= 0) return null;
  const incomplete = (i: number) => {
    const s = status[String(i)];
    return !s || !s.src || !s.dst;
  };
  for (let i = fromIdx + 1; i < total; i++) {
    if (incomplete(i)) return i;
  }
  for (let i = 0; i < fromIdx; i++) {
    if (incomplete(i)) return i;
  }
  return null;
}

export function findGaDrawing(drawings: Array<{ original_name: string }>) {
  return drawings.find(d => /ga|general.?arrangement/i.test(d.original_name)) ?? null;
}

export function findWiringDrawing(drawings: Array<{ original_name: string }>) {
  const nonGa = drawings.filter(d => !/ga|general.?arrangement/i.test(d.original_name));
  return nonGa.find(d => /\.pdf$/i.test(d.original_name))
    ?? nonGa.find(d => /\.(png|jpe?g|svg)$/i.test(d.original_name))
    ?? nonGa[0]
    ?? null;
}

export function cableSearchText(cable: Cable): string {
  return [
    cable.sno, cable.ref, cable.ferrule, cable.source, cable.destination,
    cable.source_device, cable.source_terminal, cable.dest_device, cable.dest_terminal,
    cable.color, cable.size, cable.path,
  ].map(v => String(v ?? '')).join(' ').toLowerCase();
}

export function formatDuration(secs: number) {
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

/* ── Digital Wiring Frame (classic full-table execution view) helpers ── */

const WIRE_HEX: Record<string, string> = {
  RED: '#e74c3c', BLUE: '#3498db', GREEN: '#27ae60', YELLOW: '#f1c40f',
  BLACK: '#2c3e50', WHITE: '#95a5a6', GREY: '#95a5a6', GRAY: '#95a5a6',
  ORANGE: '#e67e22', BROWN: '#8b4513', VIOLET: '#9b59b6', PURPLE: '#9b59b6',
  PINK: '#e91e8f',
};

/** Wire colour → hex; dual-colour wires like GREEN/YELLOW return hex2 for the second band. */
export function wireColorHex(color?: string): { hex: string; hex2?: string } {
  if (!color) return { hex: '#95a5a6' };
  const n = color.trim().toUpperCase();
  if (WIRE_HEX[n]) return { hex: WIRE_HEX[n] };
  if (n.includes('/')) {
    const [a, b] = n.split('/').map(s => s.trim());
    if (WIRE_HEX[a] && WIRE_HEX[b]) return { hex: WIRE_HEX[a], hex2: WIRE_HEX[b] };
  }
  return { hex: '#95a5a6' };
}

/** "2.5m" / "5 m" → metres, or null when unparseable. */
export function parseLengthMeters(raw?: string): number | null {
  if (!raw) return null;
  const m = String(raw).replace(/,/g, '.').match(/(\d+\.?\d*)/);
  return m ? parseFloat(m[1]) : null;
}

/** Required-field validation as in the classic frame: ferrule + both ends locatable. */
export function cableMissingFields(cable: Cable): string[] {
  const missing: string[] = [];
  if (!String(cable.ferrule ?? '').trim()) missing.push('ferrule');
  if (!String(cable.source ?? cable.source_device ?? '').trim()) missing.push('source');
  if (!String(cable.destination ?? cable.dest_device ?? '').trim()) missing.push('destination');
  return missing;
}

/** Status column: Not Started → In Progress → Completed (issue overrides). */
export function cableStatusChip(st: ExtendedCableStatus): { label: string; tone: 'pending' | 'progress' | 'done' | 'issue' } {
  if (st.issue) return { label: 'Issue', tone: 'issue' };
  if (st.src && st.dst) return { label: 'Completed', tone: 'done' };
  if (st.src || st.dst) return { label: 'In Progress', tone: 'progress' };
  return { label: 'Not Started', tone: 'pending' };
}
