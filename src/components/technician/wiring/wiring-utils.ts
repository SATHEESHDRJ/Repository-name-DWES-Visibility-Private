import type { Cable } from '../../../types';
import type { LiveTbEndpointType } from '../../../types/liveTbView';

export type { LiveTbEndpointType };

export interface ExtendedCableStatus {
  src: boolean;
  dst: boolean;
  note: string;
  issue?: boolean;
  /** Intentionally open end(s); survives FINISHED (additive cable_status JSON). */
  openEnd?: 'source' | 'destination' | 'both' | null;
  /** Technician applied one or more field corrections (overlay). */
  corrected?: boolean;
  /** Latest correction reason/comment for the active wire card. */
  correctionComment?: string;
  /** GA correlation match state when panel is enrolled in GA Foundation. */
  matchState?: 'matched' | 'suggested' | 'unmatched' | 'exception' | 'unknown';
  srcCatalogRef?: string | null;
  dstCatalogRef?: string | null;
  /** Optional — when present enables my_wires layer filter in 3D twin. */
  technicianId?: number;
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

/** Excel column label for the ENOWA empty slot between IEC_FERR_A and IEC_FERR_B. */
export const CABLE_VISUAL_HEADER = 'Cable Visual';

function normalizeHeaderKey(header: string): string {
  return String(header ?? '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
}

export function isCableVisualHeader(header: string): boolean {
  const key = normalizeHeaderKey(header);
  if (key === 'CABLEVISUAL' || key === 'VISUALPATH' || key === 'CABLEVISUALPATH') return true;
  const lower = String(header ?? '').toLowerCase();
  return lower.includes('cable visual') || lower.includes('visual path');
}

function isSourceFerruleHeader(header: string): boolean {
  const key = normalizeHeaderKey(header);
  return key === 'IECFERRA' || key === 'FERRA' || key.endsWith('FERRA');
}

function isDestFerruleHeader(header: string): boolean {
  const key = normalizeHeaderKey(header);
  return key === 'IECFERRB' || key === 'FERRB' || key.endsWith('FERRB');
}

/**
 * Ensure a Cable Visual column sits between source ferrule (IEC_FERR_A) and
 * destination ferrule (IEC_FERR_B). Used for new uploads that retained the
 * empty Excel column and for older frames that dropped it.
 */
export function ensureCableVisualInHeaders(
  headers: string[],
  mapping: Record<string, string> = {},
): string[] {
  if (!headers.length) return headers;
  const mapped = headers.map(h => (isCableVisualHeader(h) ? CABLE_VISUAL_HEADER : h));

  if (mapped.some(isCableVisualHeader)) return mapped;

  const srcIdx = mapped.findIndex(isSourceFerruleHeader);
  const dstIdx = mapped.findIndex(isDestFerruleHeader);
  if (srcIdx >= 0 && dstIdx > srcIdx) {
    const before = mapped.slice(0, srcIdx + 1);
    const mid = mapped.slice(srcIdx + 1, dstIdx).filter(h => h.trim());
    const after = mapped.slice(dstIdx);
    return [...before, CABLE_VISUAL_HEADER, ...mid, ...after];
  }

  const sourceHeaders = ['source', 'source_device', 'source_terminal']
    .map(key => mapping[key])
    .filter(Boolean);
  const destinationHeaders = ['destination', 'dest_device', 'dest_terminal']
    .map(key => mapping[key])
    .filter(Boolean);
  const sourceEnd = Math.max(-1, ...sourceHeaders.map(header => mapped.indexOf(header)));
  const destinationStart = destinationHeaders
    .map(header => mapped.indexOf(header))
    .filter(index => index >= 0)
    .sort((a, b) => a - b)[0] ?? -1;

  if (sourceEnd >= 0 && destinationStart > sourceEnd) {
    return [
      ...mapped.slice(0, sourceEnd + 1),
      CABLE_VISUAL_HEADER,
      ...mapped.slice(sourceEnd + 1),
    ];
  }

  // Legacy schedules can expose only combined endpoint headers.
  const combinedSource = mapped.findIndex(header => /(?:^|\b)(?:source|from)(?:\b|_)/i.test(header));
  const combinedDestination = mapped.findIndex((header, index) =>
    index > combinedSource && /(?:^|\b)(?:destination|dest|to)(?:\b|_)/i.test(header));
  if (combinedSource >= 0 && combinedDestination > combinedSource) {
    return [
      ...mapped.slice(0, combinedSource + 1),
      CABLE_VISUAL_HEADER,
      ...mapped.slice(combinedSource + 1),
    ];
  }

  return mapped;
}

export interface CableVisualHeaderSplit {
  before: string[];
  after: string[];
  /** True when Cable Visual has a mid-row slot (between ferrules). */
  hasSlot: boolean;
  headers: string[];
}

/** Split Excel headers around the Cable Visual column for mid-row layout. */
export function splitHeadersAroundCableVisual(
  headers: string[],
  mapping: Record<string, string> = {},
): CableVisualHeaderSplit {
  const ensured = ensureCableVisualInHeaders(headers, mapping);
  const visualIdx = ensured.findIndex(isCableVisualHeader);
  if (visualIdx >= 0) {
    return {
      before: ensured.slice(0, visualIdx),
      after: ensured.slice(visualIdx + 1),
      hasSlot: true,
      headers: ensured,
    };
  }
  return { before: ensured, after: [], hasSlot: false, headers: ensured };
}

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
function rawCell(
  raw: Record<string, string>,
  excelHeader: string,
): { found: boolean; value: string } {
  if (Object.prototype.hasOwnProperty.call(raw, excelHeader)) {
    return { found: true, value: raw[excelHeader] ?? '' };
  }
  const target = excelHeader.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  for (const [k, v] of Object.entries(raw)) {
    if (k.trim().toUpperCase().replace(/[^A-Z0-9]/g, '') === target) {
      return { found: true, value: v ?? '' };
    }
  }
  return { found: false, value: '' };
}

function rawCellValue(raw: Record<string, string>, excelHeader: string): string {
  return rawCell(raw, excelHeader).value;
}

export interface CableVisualData {
  color: string;
  size: string;
  length: string;
}

function formatCableSizeLabel(value: string): string {
  const text = normalizeTextValue(value);
  if (!text) return '—';
  const match = text.replace(/,/g, '.').match(/^(\d+(?:\.\d+)?)\s*(?:sq\.?\s*mm|mm²|mm2)$/i);
  return match ? `${match[1]} SQ.mm` : text;
}

function formatCableLengthLabel(value: string): string {
  const text = normalizeTextValue(value);
  if (!text) return '—';
  const match = text.replace(/,/g, '.').match(/^(\d+(?:\.\d+)?)\s*m$/i)
    ?? text.replace(/,/g, '.').match(/^(\d+(?:\.\d+)?)$/);
  return match ? `${match[1]} m` : text;
}

/** Compact label sourced only from the current parsed wiring record. */
export function cableVisualLabel(data: CableVisualData): string {
  return [
    normalizeWireColorValue(data.color).toUpperCase() || '—',
    formatCableSizeLabel(data.size),
    formatCableLengthLabel(data.length),
  ].join(' · ');
}

const CABLE_VISUAL_HEADER_ALIASES = {
  color: ['WIRE COLOR', 'WIRE COLOUR', 'CABLE COLOR', 'CABLE COLOUR', 'COLOR', 'COLOUR'],
  size: ['WIRE SIZE', 'CABLE SIZE', 'CONDUCTOR SIZE', 'SIZE'],
  length: ['LENGTH(m)', 'LENGTH (m)', 'WIRE LENGTH', 'CABLE LENGTH', 'LENGTH'],
} as const;

const CABLE_SPEC_COLUMN_KEYS = new Set(
  Object.values(CABLE_VISUAL_HEADER_ALIASES)
    .flat()
    .map(header => normalizeHeaderKey(header)),
);

/**
 * True for Color / Size / Length schedule headers already shown under Cable Visual.
 * Used to omit them from technician single-exec column hide/show options.
 */
export function isCableSpecColumnHeader(header: string): boolean {
  return CABLE_SPEC_COLUMN_KEYS.has(normalizeHeaderKey(header));
}

/**
 * Resolve illustration inputs from the selected Excel row.
 *
 * `_raw` is the upload-time source of truth, so a revised schedule row updates
 * the visual without storing a separate illustration. Explicit supervisor
 * mapping wins; standard wiring-schedule headers cover optional/unmapped fields.
 */
export function resolveCableVisualData(
  cable: Cable & { _raw?: Record<string, string> },
  mapping: Record<string, string> = {},
): CableVisualData {
  const fromExcelRow = (field: keyof CableVisualData): string => {
    if (!cable._raw) return '';
    const mappedHeader = mapping[field];
    if (mappedHeader) {
      const mappedValue = rawCellValue(cable._raw, mappedHeader);
      if (mappedValue.trim()) return normalizeTextValue(mappedValue);
    }
    for (const header of CABLE_VISUAL_HEADER_ALIASES[field]) {
      const value = rawCellValue(cable._raw, header);
      if (value.trim()) return normalizeTextValue(value);
    }
    return '';
  };

  return {
    color: normalizeWireColorValue(fromExcelRow('color') || cable.color),
    size: normalizeTextValue(fromExcelRow('size') || cable.size),
    length: normalizeTextValue(fromExcelRow('length') || cable.length),
  };
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

/** Exact uploaded value for technician Excel-style rows; parsed fields are fallback only. */
export function getExactExcelCellValue(
  cable: Cable & { _raw?: Record<string, string> },
  excelHeader: string,
  mapping: Record<string, string>,
): string {
  if (cable._raw) {
    const fromRaw = rawCell(cable._raw, excelHeader);
    if (fromRaw.found) return fromRaw.value;
  }
  return getCellValue(cable, excelHeader, mapping);
}

/** Technician-only header source: exact ordered `_raw` labels win over legacy composite metadata. */
export function deriveTechnicianExcelHeaders(
  mapping: Record<string, string>,
  excelHeaders?: string[],
  sampleRaw?: Record<string, string>,
): string[] {
  const rawHeaders = Object.keys(sampleRaw || {}).filter(header => header.trim().length > 0);
  return rawHeaders.length ? rawHeaders : deriveExcelHeaders(mapping, excelHeaders, sampleRaw);
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

/** Next incomplete cable among a filtered index list (wraps like findNextPending). */
export function findNextPendingInIndexes(
  fromIdx: number,
  indexes: number[],
  status: Record<string, ExtendedCableStatus>,
): number | null {
  if (indexes.length === 0) return null;
  const incomplete = (i: number) => {
    const s = status[String(i)];
    return !s || !s.src || !s.dst;
  };
  const pos = indexes.indexOf(fromIdx);
  const after = pos >= 0 ? indexes.slice(pos + 1) : indexes.filter(i => i > fromIdx);
  for (const i of after) {
    if (incomplete(i)) return i;
  }
  const before = pos >= 0 ? indexes.slice(0, pos) : indexes.filter(i => i < fromIdx);
  for (const i of before) {
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

/** Technician schedule sidebar filters (tag / skipped). */
export type ScheduleFilterMode = 'none' | 'tag' | 'skipped';

/** Same skipped rule used by DigitalWiringFrame status chips. */
export function isSkippedCableStatus(st: ExtendedCableStatus): boolean {
  return /\[SKIPPED /.test(st.note || '') && !(st.src && st.dst);
}

/** True when the cable status note contains any SKIPPED audit marker. */
export function hasSkipMarker(st: Pick<ExtendedCableStatus, 'note'>): boolean {
  return /\[SKIPPED /.test(st.note || '');
}

/** Pending skipped = skip marker present and wire not finished (src+dst). */
export function isPendingSkipped(st: ExtendedCableStatus): boolean {
  return isSkippedCableStatus(st);
}

/** Finished after a prior SKIP (note still holds the skip marker). */
export function isLaterFinishedAfterSkip(st: ExtendedCableStatus): boolean {
  return hasSkipMarker(st) && !!(st.src && st.dst);
}

export type SkippedWireKind = 'pending' | 'later_finished';

export type SkippedWireRow = {
  index: number;
  wireNumber: string | number;
  sourceEquipment: string;
  sourceTerminal: string;
  destinationEquipment: string;
  destinationTerminal: string;
  skippedAt: string | null;
  skippedBy: string;
  skipReason: string;
  statusLabel: string;
  kind: SkippedWireKind;
};

const SKIP_ENTRY_RE = /\[SKIPPED\s+([^\]]+)\]\s*(.*)/g;

/** Parse the latest `[SKIPPED ISO] reason` entry from a cable status note. */
export function parseLatestSkipEntry(note: string): { skippedAt: string | null; reason: string } {
  const text = String(note || '');
  let last: { skippedAt: string | null; reason: string } | null = null;
  SKIP_ENTRY_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = SKIP_ENTRY_RE.exec(text)) != null) {
    const stamp = String(match[1] ?? '').trim();
    const reason = String(match[2] ?? '').trim();
    last = { skippedAt: stamp || null, reason };
  }
  return last ?? { skippedAt: null, reason: '' };
}

/** Format an ISO skip stamp for display; returns em dash when unparseable. */
export function formatSkipDateTime(iso: string | null | undefined): string {
  const raw = String(iso ?? '').trim();
  if (!raw) return '—';
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return raw;
  try {
    return d.toLocaleString(undefined, {
      year: 'numeric',
      month: 'short',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return raw;
  }
}

/**
 * Build skipped-wire rows for the current panel schedule + live status only.
 * Includes pending skipped and later-finished wires that still carry a skip marker.
 */
export function collectSkippedWireRows(
  cables: Cable[],
  status: Record<string, ExtendedCableStatus>,
): SkippedWireRow[] {
  const rows: SkippedWireRow[] = [];
  for (let index = 0; index < cables.length; index++) {
    const st = status[String(index)] ?? DEFAULT_CABLE_STATUS;
    if (!hasSkipMarker(st)) continue;
    const cable = cables[index];
    const ends = resolveCableEquipmentEnds(cable);
    const destTermRaw = readCableRawByAliases(cable, [
      'TERM_B', 'DST_TERM', 'TERMINAL_B', 'DEST_TERMINAL',
    ]);
    const destinationTerminal = destTermRaw !== '' && destTermRaw !== '—'
      ? destTermRaw
      : (String(cable.dest_terminal ?? '').trim() !== '—'
        ? String(cable.dest_terminal ?? '').trim()
        : '');
    const { skippedAt, reason } = parseLatestSkipEntry(st.note || '');
    const kind: SkippedWireKind = isLaterFinishedAfterSkip(st) ? 'later_finished' : 'pending';
    const chip = cableStatusChip(st);
    const statusLabel = kind === 'pending'
      ? (isSkippedCableStatus(st) ? 'Skipped' : chip.label)
      : chip.label;
    rows.push({
      index,
      wireNumber: cable.sno ?? index + 1,
      sourceEquipment: ends.sourceEquipment || '—',
      sourceTerminal: ends.sourceTerminal || '—',
      destinationEquipment: ends.destinationEquipment || '—',
      destinationTerminal: destinationTerminal || '—',
      skippedAt,
      skippedBy: reason || '—',
      skipReason: reason || '—',
      statusLabel,
      kind,
    });
  }
  return rows;
}

/** Count of currently pending skipped wires (not later finished). */
export function countPendingSkipped(
  cables: Cable[],
  status: Record<string, ExtendedCableStatus>,
): number {
  let n = 0;
  for (let index = 0; index < cables.length; index++) {
    const st = status[String(index)] ?? DEFAULT_CABLE_STATUS;
    if (isPendingSkipped(st)) n += 1;
  }
  return n;
}

/** Unique sorted ferrule tags from a panel Digital Wiring Schedule. */
export function collectScheduleCableTags(cables: Cable[]): string[] {
  const seen = new Set<string>();
  for (const cable of cables) {
    const tag = String(cable.ferrule ?? '').trim();
    if (tag) seen.add(tag);
  }
  return [...seen].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base', numeric: true }));
}

/** Case-insensitive cable-tag match (ferrule, ref, or schedule search text). */
export function cableMatchesTagQuery(cable: Cable, query: string): boolean {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  if (String(cable.ferrule ?? '').toLowerCase().includes(needle)) return true;
  if (String(cable.ref ?? '').toLowerCase().includes(needle)) return true;
  return cableSearchText(cable).includes(needle);
}

/** Blank / placeholder values excluded from Source/Destination equipment lists. */
export function isBlankEquipmentValue(value: unknown): boolean {
  if (value == null) return true;
  const text = String(value).trim();
  return !text || text === '—';
}

function normalizeEquipmentHeaderKey(header: string): string {
  return String(header ?? '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
}

/** Read a schedule cell from `_raw` by header aliases (exact uploaded spelling). */
export function readCableRawByAliases(
  cable: Cable & { _raw?: Record<string, string>; dest_ferrule?: string },
  aliases: string[],
): string {
  const raw = cable._raw;
  if (!raw) return '';
  const aliasKeys = aliases.map(normalizeEquipmentHeaderKey);
  for (const [header, value] of Object.entries(raw)) {
    if (!aliasKeys.includes(normalizeEquipmentHeaderKey(header))) continue;
    return String(value ?? '').trim();
  }
  return '';
}

/**
 * Physical panel terminal-block headers (GA strip tags), not equipment/device tags.
 * ENOWA-style racks use X-series names (X1A-CT, X7, XD1, XTJ, XSH, XTA-1).
 */
const PHYSICAL_TB_NO_DIGIT = new Set(['XTJ', 'XSH']);

export function isPhysicalTbHeader(value: string | null | undefined): boolean {
  const n = String(value ?? '').trim().replace(/\s+/g, '').toUpperCase();
  if (!n || n.length < 2) return false;
  if (PHYSICAL_TB_NO_DIGIT.has(n)) return true;
  return /^X[A-Z0-9-]*\d[A-Z0-9-]*$/.test(n);
}

export type PhysicalTbEndResolve = {
  tb: string;
  terminal: string;
  from: 'header' | 'embedded_header' | 'embedded_terminal' | '';
};

export type LiveTbEndpointClassification = {
  endpointType: LiveTbEndpointType;
  equipmentTag: string | null;
  tbHeader: string | null;
  terminalReference: string;
  physicalLookupKey: string | null;
  from: PhysicalTbEndResolve['from'];
};

/** Display form for schedule terminal refs (X329:18 → X329/18). */
export function formatTerminalReference(terminal: string | null | undefined): string {
  const t = String(terminal ?? '').trim();
  if (!t) return '';
  return t.replace(/:/g, ' / ');
}

/**
 * Classify one schedule end before Match / paint.
 * Never promotes embedded X* from TERM when DEV_TBLK is equipment.
 */
export function classifyLiveTbEndpoint(
  header: string | null | undefined,
  terminal: string | null | undefined,
): LiveTbEndpointClassification {
  const h = String(header ?? '').trim();
  const t = String(terminal ?? '').trim();
  const termRef = formatTerminalReference(t) || t;

  if (h && isPhysicalTbHeader(h)) {
    return {
      endpointType: 'TB_GROUP',
      equipmentTag: null,
      tbHeader: h,
      terminalReference: termRef,
      physicalLookupKey: h,
      from: 'header',
    };
  }

  if (h) {
    return {
      endpointType: t ? 'DEVICE_TERMINAL' : 'DEVICE',
      equipmentTag: h,
      tbHeader: null,
      terminalReference: termRef,
      physicalLookupKey: h,
      from: '',
    };
  }

  const embeddedTerm = t.match(/^(X[A-Z0-9][-A-Z0-9]*):(.+)$/i);
  if (embeddedTerm && isPhysicalTbHeader(embeddedTerm[1])) {
    const tb = embeddedTerm[1];
    const termOnly = embeddedTerm[2].trim();
    return {
      endpointType: 'TB_GROUP',
      equipmentTag: null,
      tbHeader: tb,
      terminalReference: formatTerminalReference(termOnly) || termOnly,
      physicalLookupKey: tb,
      from: 'embedded_terminal',
    };
  }

  if (t && isPhysicalTbHeader(t)) {
    return {
      endpointType: 'TB_GROUP',
      equipmentTag: null,
      tbHeader: t,
      terminalReference: '',
      physicalLookupKey: t,
      from: 'header',
    };
  }

  return {
    endpointType: 'UNKNOWN',
    equipmentTag: null,
    tbHeader: null,
    terminalReference: termRef,
    physicalLookupKey: null,
    from: '',
  };
}

/** Resolve one schedule end to a physical TB header (empty when equipment/device). */
export function resolvePhysicalTbEnd(
  header: string | null | undefined,
  terminal: string | null | undefined,
): PhysicalTbEndResolve {
  const c = classifyLiveTbEndpoint(header, terminal);
  if (c.endpointType === 'TB_GROUP' && c.tbHeader) {
    const h = String(header ?? '').trim();
    const t = String(terminal ?? '').trim();
    if (c.from === 'header' && isPhysicalTbHeader(h)) {
      return { tb: c.tbHeader, terminal: t, from: 'header' };
    }
    if (c.from === 'embedded_terminal') {
      const embeddedTerm = t.match(/^(X[A-Z0-9][-A-Z0-9]*):(.+)$/i);
      return {
        tb: c.tbHeader,
        terminal: embeddedTerm ? embeddedTerm[2].trim() : t,
        from: 'embedded_terminal',
      };
    }
    return { tb: c.tbHeader, terminal: t, from: c.from };
  }
  return { tb: '', terminal: '', from: '' };
}

export type LiveTbWireEnds = {
  /**
   * Physical source TB header for GA match (X-series only).
   * Empty when the schedule source end is equipment (e.g. 87STUB).
   */
  source_tb: string;
  source_terminal: string;
  /** Physical destination TB header; empty when destination is equipment. */
  dest_tb: string;
  dest_terminal: string;
  /** True when at least one end resolves to a physical TB header. */
  tb_fields_present: boolean;
  /** Provenance of the raw schedule header before physical-TB filtering. */
  source_tb_from: 'DEV_TBLK_A' | 'source_device' | '';
  dest_tb_from: 'DEV_TBLK_B' | 'dest_device' | '';
  /** Original schedule endpoints (equipment or TB) for display / diagnostics. */
  source_equipment: string;
  source_equipment_terminal: string;
  dest_equipment: string;
  dest_equipment_terminal: string;
  source_is_physical_tb: boolean;
  dest_is_physical_tb: boolean;
  source_endpoint_type: LiveTbEndpointType;
  dest_endpoint_type: LiveTbEndpointType;
  source_physical_lookup_key: string;
  dest_physical_lookup_key: string;
  source_terminal_reference: string;
  dest_terminal_reference: string;
};

/**
 * Resolve LIVE TB match endpoints from the schedule row.
 * Classifies each end independently as TB_GROUP vs DEVICE before Match.
 * Does not invent TB names and does not treat equipment tags as TB strips.
 */
export function resolveLiveTbWireEnds(
  cable: Cable & { _raw?: Record<string, string> },
  mapping: Record<string, string> = {},
): LiveTbWireEnds {
  const rawSrcTb = readCableRawByAliases(cable, [
    'DEV_TBLK_A', 'DEV_A', 'SRC_DEV', 'SOURCE_DEVICE',
  ]);
  const rawSrcTerm = readCableRawByAliases(cable, [
    'TERM_A', 'SRC_TERM', 'TERMINAL_A', 'SOURCE_TERMINAL',
  ]);
  const rawDstTb = readCableRawByAliases(cable, [
    'DEV_TBLK_B', 'DEV_B', 'DST_DEV', 'DEST_DEVICE',
  ]);
  const rawDstTerm = readCableRawByAliases(cable, [
    'TERM_B', 'DST_TERM', 'TERMINAL_B', 'DEST_TERMINAL',
  ]);

  // Also honour mapping when Excel header differs but maps to source_device.
  const mappedSrcHeader = mapping.source_device
    ? getExactExcelCellValue(cable, mapping.source_device, mapping)
    : '';
  const mappedSrcTerm = mapping.source_terminal
    ? getExactExcelCellValue(cable, mapping.source_terminal, mapping)
    : '';
  const mappedDstHeader = mapping.dest_device
    ? getExactExcelCellValue(cable, mapping.dest_device, mapping)
    : '';
  const mappedDstTerm = mapping.dest_terminal
    ? getExactExcelCellValue(cable, mapping.dest_terminal, mapping)
    : '';

  let source_equipment = '';
  let source_tb_from: LiveTbWireEnds['source_tb_from'] = '';
  if (rawSrcTb) {
    source_equipment = rawSrcTb;
    source_tb_from = 'DEV_TBLK_A';
  } else if (mappedSrcHeader) {
    source_equipment = String(mappedSrcHeader).trim();
    source_tb_from = 'source_device';
  } else if (String(cable.source_device || '').trim()) {
    source_equipment = String(cable.source_device).trim();
    source_tb_from = 'source_device';
  }

  const source_equipment_terminal = rawSrcTerm
    || String(mappedSrcTerm || '').trim()
    || String(cable.source_terminal || '').trim();

  let dest_equipment = '';
  let dest_tb_from: LiveTbWireEnds['dest_tb_from'] = '';
  if (rawDstTb) {
    dest_equipment = rawDstTb;
    dest_tb_from = 'DEV_TBLK_B';
  } else if (mappedDstHeader) {
    dest_equipment = String(mappedDstHeader).trim();
    dest_tb_from = 'dest_device';
  } else if (String(cable.dest_device || '').trim()) {
    // Ferrule-derived far end (this schedule has no DEV_TBLK_B column).
    dest_equipment = String(cable.dest_device).trim();
    dest_tb_from = 'dest_device';
  }

  const dest_equipment_terminal = rawDstTerm
    || String(mappedDstTerm || '').trim()
    || String(cable.dest_terminal || '').trim();

  const srcClass = classifyLiveTbEndpoint(source_equipment, source_equipment_terminal);
  const dstClass = classifyLiveTbEndpoint(dest_equipment, dest_equipment_terminal);
  const srcPhys = resolvePhysicalTbEnd(source_equipment, source_equipment_terminal);
  const dstPhys = resolvePhysicalTbEnd(dest_equipment, dest_equipment_terminal);

  return {
    source_tb: srcPhys.tb,
    source_terminal: srcPhys.tb ? srcPhys.terminal : '',
    dest_tb: dstPhys.tb,
    dest_terminal: dstPhys.tb ? dstPhys.terminal : '',
    tb_fields_present: !!(srcPhys.tb || dstPhys.tb),
    source_tb_from,
    dest_tb_from,
    source_equipment,
    source_equipment_terminal,
    dest_equipment,
    dest_equipment_terminal,
    source_is_physical_tb: !!srcPhys.tb,
    dest_is_physical_tb: !!dstPhys.tb,
    source_endpoint_type: srcClass.endpointType,
    dest_endpoint_type: dstClass.endpointType,
    source_physical_lookup_key: srcClass.physicalLookupKey || '',
    dest_physical_lookup_key: dstClass.physicalLookupKey || '',
    source_terminal_reference: srcClass.terminalReference,
    dest_terminal_reference: dstClass.terminalReference,
  };
}

/**
 * Destination Equipment from ferrule connection text.
 * Requires `<sourceEndpoint>/…:terminal` and keeps `/` inside the equipment name
 * by excluding only the final terminal after the last colon.
 */
export function parseDestinationEquipmentFromFerrule(
  sourceEndpoint: string,
  ferrule: string,
): string | null {
  const endpoint = String(sourceEndpoint ?? '').trim();
  const ferr = String(ferrule ?? '').trim();
  if (!endpoint || isBlankEquipmentValue(ferr)) return null;
  const prefix = `${endpoint}/`;
  if (!ferr.startsWith(prefix)) return null;
  const rest = ferr.slice(prefix.length);
  const colon = rest.lastIndexOf(':');
  if (colon <= 0) return null;
  const destEquipment = rest.slice(0, colon).trim();
  if (isBlankEquipmentValue(destEquipment)) return null;
  return destEquipment;
}

export type CableEquipmentEnds = {
  sourceEquipment: string;
  sourceTerminal: string;
  destinationEquipment: string;
  unparseable: boolean;
};

/**
 * Resolve Source / Destination equipment for one active schedule row.
 * Source = DEV_TBLK_A; Destination from IEC_FERR_B (IEC_FERR_A fallback).
 */
export function resolveCableEquipmentEnds(
  cable: Cable & { _raw?: Record<string, string>; dest_ferrule?: string },
): CableEquipmentEnds {
  const sourceFromRaw = readCableRawByAliases(cable, [
    'DEV_TBLK_A', 'DEV_A', 'SRC_DEV', 'SOURCE_DEVICE',
  ]);
  const terminalFromRaw = readCableRawByAliases(cable, [
    'TERM_A', 'SRC_TERM', 'TERMINAL_A', 'SOURCE_TERMINAL',
  ]);
  const sourceEquipment = !isBlankEquipmentValue(sourceFromRaw)
    ? sourceFromRaw
    : (!isBlankEquipmentValue(cable.source_device) ? String(cable.source_device).trim() : '');
  const sourceTerminal = terminalFromRaw !== '' && terminalFromRaw !== '—'
    ? terminalFromRaw
    : (String(cable.source_terminal ?? '').trim() !== '—'
      ? String(cable.source_terminal ?? '').trim()
      : '');

  const ferrB = readCableRawByAliases(cable, [
    'IEC_FERR_B', 'FERR_B', 'DEST_FERRULE', 'FERRULE_B',
  ]) || String(cable.dest_ferrule ?? '').trim();
  const ferrA = readCableRawByAliases(cable, [
    'IEC_FERR_A', 'FERR_A', 'FERRULE',
  ]) || String(cable.ferrule ?? '').trim();

  let destinationEquipment = '';
  let unparseable = false;
  if (sourceEquipment && sourceTerminal !== '') {
    const endpoint = `${sourceEquipment}:${sourceTerminal}`;
    destinationEquipment =
      parseDestinationEquipmentFromFerrule(endpoint, ferrB)
      ?? parseDestinationEquipmentFromFerrule(endpoint, ferrA)
      ?? '';
    const hadFerrule = !isBlankEquipmentValue(ferrB) || !isBlankEquipmentValue(ferrA);
    if (!destinationEquipment && hadFerrule) unparseable = true;
  }

  return { sourceEquipment, sourceTerminal, destinationEquipment, unparseable };
}

export type ScheduleEquipmentCollection = {
  equipment: string[];
  sourceCount: number;
  destinationCount: number;
  combinedCount: number;
  duplicatesRemoved: number;
  unparseableRows: number;
};

/** Unique sorted equipment from schedule Source + ferrule-derived Destination. */
export function collectScheduleEquipmentDetailed(
  cables: Cable[],
): ScheduleEquipmentCollection {
  const sources = new Set<string>();
  const destinations = new Set<string>();
  let rawNameCount = 0;
  let unparseableRows = 0;

  for (const cable of cables) {
    const ends = resolveCableEquipmentEnds(cable);
    if (ends.sourceEquipment) {
      sources.add(ends.sourceEquipment);
      rawNameCount += 1;
    }
    if (ends.destinationEquipment) {
      destinations.add(ends.destinationEquipment);
      rawNameCount += 1;
    }
    if (ends.unparseable) unparseableRows += 1;
  }

  const combined = new Set<string>([...sources, ...destinations]);
  const equipment = [...combined].sort((a, b) =>
    a.localeCompare(b, undefined, { sensitivity: 'base', numeric: true }),
  );

  return {
    equipment,
    sourceCount: sources.size,
    destinationCount: destinations.size,
    combinedCount: equipment.length,
    duplicatesRemoved: Math.max(0, rawNameCount - equipment.length),
    unparseableRows,
  };
}

/** Unique sorted equipment tags from the active Digital Wiring Schedule. */
export function collectScheduleEquipment(cables: Cable[]): string[] {
  return collectScheduleEquipmentDetailed(cables).equipment;
}

/**
 * Exact (case-insensitive) match when equipment appears on Source or Destination.
 * Uses ferrule-derived destination so names with `/` are not split.
 * A wire is counted once even when the equipment appears on both ends.
 */
export function cableMatchesEquipment(cable: Cable, equipment: string): boolean {
  const needle = equipment.trim().toLowerCase();
  if (!needle) return true;
  const ends = resolveCableEquipmentEnds(cable);
  if (ends.sourceEquipment.toLowerCase() === needle) return true;
  if (ends.destinationEquipment.toLowerCase() === needle) return true;
  return false;
}

/** Original cable indexes matching the active technician schedule filter. */
export function filterCableIndexes(
  cables: Cable[],
  status: Record<string, ExtendedCableStatus>,
  mode: ScheduleFilterMode,
  tagQuery = '',
  equipmentQuery = '',
): number[] {
  const all = cables.map((_, index) => index);
  let indexes = all;
  if (mode === 'tag') {
    indexes = all.filter(index => cableMatchesTagQuery(cables[index], tagQuery));
  } else if (mode === 'skipped') {
    indexes = all.filter(index => isSkippedCableStatus(status[String(index)] ?? DEFAULT_CABLE_STATUS));
  }
  if (equipmentQuery.trim()) {
    indexes = indexes.filter(index => cableMatchesEquipment(cables[index], equipmentQuery));
  }
  return indexes;
}

export type CableStatusSummary = {
  total: number;
  finished: number;
  skipped: number;
  openSource: number;
  openDestination: number;
  corrected: number;
};

/** Overall equipment/panel wiring label derived only from wire status records. */
export type EquipmentWiringOverallStatus =
  | 'NOT STARTED'
  | 'IN PROGRESS'
  | 'COMPLETED'
  | 'COMPLETED WITH OPEN ENDS'
  | 'ATTENTION REQUIRED';

/** Live summary for a subset of cable indexes (same rules as panel KPI cards). */
export function summarizeCableStatusForIndexes(
  cables: Cable[],
  status: Record<string, ExtendedCableStatus>,
  indexes: number[],
): CableStatusSummary {
  let finished = 0;
  let skipped = 0;
  let openSource = 0;
  let openDestination = 0;
  let corrected = 0;
  for (const index of indexes) {
    if (index < 0 || index >= cables.length) continue;
    const st = status[String(index)] ?? DEFAULT_CABLE_STATUS;
    if (isSkippedCableStatus(st)) skipped += 1;
    else if (st.src && st.dst) finished += 1;
    const note = st.note || '';
    if (st.openEnd === 'source' || st.openEnd === 'both' || /\[SOURCE END OPEN /.test(note)) openSource += 1;
    if (st.openEnd === 'destination' || st.openEnd === 'both' || /\[DESTINATION END OPEN /.test(note)) openDestination += 1;
    if (st.corrected || /\[CORRECTED /.test(st.note || '')) corrected += 1;
  }
  return {
    total: indexes.length,
    finished,
    skipped,
    openSource,
    openDestination,
    corrected,
  };
}

/** Live summary cards for the technician progress matrix. */
export function summarizeCableStatus(
  cables: Cable[],
  status: Record<string, ExtendedCableStatus>,
): CableStatusSummary {
  return summarizeCableStatusForIndexes(
    cables,
    status,
    cables.map((_, index) => index),
  );
}

/**
 * Derive equipment wiring overall status from existing wire records only.
 * When completion and attention both apply, prefer the combined open-ends label.
 */
export function deriveEquipmentWiringOverallStatus(
  summary: CableStatusSummary,
): EquipmentWiringOverallStatus {
  const pending = Math.max(0, summary.total - summary.finished - summary.skipped);
  const hasOpen = summary.openSource > 0 || summary.openDestination > 0;
  const hasProcessed = summary.finished > 0 || summary.skipped > 0 || hasOpen;
  if (summary.total === 0 || !hasProcessed) return 'NOT STARTED';
  if (pending === 0 && summary.finished === summary.total) {
    return hasOpen ? 'COMPLETED WITH OPEN ENDS' : 'COMPLETED';
  }
  if (summary.skipped > 0 || hasOpen) return 'ATTENTION REQUIRED';
  if (pending > 0) return 'IN PROGRESS';
  return 'NOT STARTED';
}

/** Equipment Filter–scoped header summary (same match rules as the filter). */
export function buildEquipmentWiringStatusSummary(
  cables: Cable[],
  status: Record<string, ExtendedCableStatus>,
  equipmentQuery: string,
): CableStatusSummary & {
  equipmentLabel: string;
  isAllEquipment: boolean;
  pending: number;
  progressPct: number;
  overallStatus: EquipmentWiringOverallStatus;
} {
  const equipment = equipmentQuery.trim();
  const indexes = equipment
    ? cables
        .map((_, index) => index)
        .filter(index => cableMatchesEquipment(cables[index], equipment))
    : cables.map((_, index) => index);
  const counts = summarizeCableStatusForIndexes(cables, status, indexes);
  const pending = Math.max(0, counts.total - counts.finished - counts.skipped);
  const progressPct = counts.total > 0 ? Math.round((counts.finished / counts.total) * 100) : 0;
  return {
    ...counts,
    equipmentLabel: equipment || 'ALL EQUIPMENT',
    isAllEquipment: !equipment,
    pending,
    progressPct,
    overallStatus: deriveEquipmentWiringOverallStatus(counts),
  };
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

/**
 * Length-aware visual metrics for schedule-driven cable paths.
 * Longer cables: wider stroke, larger path span, stronger curvature — never a generic grey stub.
 */
export function cablePathVisualMetrics(lengthRaw?: string | null): {
  lengthM: number | null;
  strokeWidth: number;
  curvature: number;
  spanPct: number;
  dashPattern: string | undefined;
} {
  const lengthM = parseLengthMeters(lengthRaw ?? undefined);
  if (lengthM == null || !Number.isFinite(lengthM) || lengthM <= 0) {
    return { lengthM: null, strokeWidth: 3, curvature: 0.28, spanPct: 0.72, dashPattern: '6 4' };
  }
  // Clamp visual response so extreme schedule lengths stay readable on tablet.
  const t = Math.min(1, Math.max(0, (lengthM - 0.3) / 8));
  return {
    lengthM,
    strokeWidth: 2.4 + t * 2.6,
    curvature: 0.18 + t * 0.42,
    spanPct: 0.55 + t * 0.35,
    dashPattern: undefined,
  };
}

/** Build an SVG cubic path SRC→DST in a normalized 0–100 viewBox, shaped by cable length. */
export function buildLengthAwareWirePath(
  lengthRaw?: string | null,
  opts?: { x0?: number; y0?: number; x1?: number; y1?: number },
): string {
  const m = cablePathVisualMetrics(lengthRaw);
  const midSpan = m.spanPct;
  const x0 = opts?.x0 ?? (50 - midSpan * 50);
  const x1 = opts?.x1 ?? (50 + midSpan * 50);
  const y0 = opts?.y0 ?? 42;
  const y1 = opts?.y1 ?? 58;
  const dx = x1 - x0;
  const dy = y1 - y0;
  const cx1 = x0 + dx * 0.28;
  const cy1 = y0 - dy * 0.15 - m.curvature * 38;
  const cx2 = x0 + dx * 0.72;
  const cy2 = y1 + dy * 0.15 + m.curvature * 28;
  return `M ${x0.toFixed(1)} ${y0.toFixed(1)} C ${cx1.toFixed(1)} ${cy1.toFixed(1)}, ${cx2.toFixed(1)} ${cy2.toFixed(1)}, ${x1.toFixed(1)} ${y1.toFixed(1)}`;
}

/** Required-field validation as in the classic frame: ferrule + both ends locatable. */
export function cableMissingFields(cable: Cable): string[] {
  const missing: string[] = [];
  if (!String(cable.ferrule ?? '').trim()) missing.push('ferrule');
  if (!String(cable.source ?? cable.source_device ?? '').trim()) missing.push('source');
  if (!String(cable.destination ?? cable.dest_device ?? '').trim()) missing.push('destination');
  return missing;
}

/** Resolve which ends are intentionally open from openEnd + note markers. */
export function resolveOpenEnds(st: Pick<ExtendedCableStatus, 'openEnd' | 'note'>): {
  source: boolean;
  destination: boolean;
} {
  const note = st.note || '';
  const openEnd = st.openEnd ?? null;
  return {
    source: openEnd === 'source' || openEnd === 'both' || /\[SOURCE END OPEN /.test(note),
    destination: openEnd === 'destination' || openEnd === 'both' || /\[DESTINATION END OPEN /.test(note),
  };
}

/** Merge a newly selected open side with any existing open-side state. */
export function mergeOpenEnd(
  current: ExtendedCableStatus['openEnd'],
  adding: 'source' | 'destination',
  note: string,
): 'source' | 'destination' | 'both' {
  const { source, destination } = resolveOpenEnds({ openEnd: current ?? null, note });
  if (adding === 'source') return destination ? 'both' : 'source';
  return source ? 'both' : 'destination';
}

/** Status column: Pending → In Progress → Completed / open-end variants (issue overrides). */
export function cableStatusChip(st: ExtendedCableStatus): {
  label: string;
  tone: 'pending' | 'progress' | 'done' | 'issue' | 'open-src' | 'open-dst';
} {
  if (st.issue) return { label: 'Issue', tone: 'issue' };
  const open = resolveOpenEnds(st);
  if (st.src && st.dst) {
    if (open.source && open.destination) return { label: 'FINISHED — BOTH ENDS OPEN', tone: 'open-src' };
    if (open.source) return { label: 'FINISHED — SOURCE END OPEN', tone: 'open-src' };
    if (open.destination) return { label: 'FINISHED — DESTINATION END OPEN', tone: 'open-dst' };
    return { label: 'Completed', tone: 'done' };
  }
  if (open.source && open.destination) return { label: 'BOTH ENDS OPEN', tone: 'open-src' };
  if (open.source) return { label: 'SOURCE END OPEN', tone: 'open-src' };
  if (open.destination) return { label: 'DESTINATION END OPEN', tone: 'open-dst' };
  if (st.src || st.dst) return { label: 'In Progress', tone: 'progress' };
  return { label: 'Pending', tone: 'pending' };
}

/** Parse conductor cross-section (mm²) from schedule size text for visual stroke weight. */
export function parseWireSizeSqMm(raw?: string | null): number | null {
  if (!raw) return null;
  const m = String(raw).replace(/,/g, '.').match(/(\d+(?:\.\d+)?)\s*(?:sq\.?\s*mm|mm²|mm2)?/i);
  if (!m) return null;
  const n = parseFloat(m[1]);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * Insulation diameter (px at zoom 1) for the active-row 3D cable illustration.
 * Proportional to conductor sq.mm so a 2.5 visibly outweighs a 0.75; clamped so
 * unparseable or extreme sizes stay legible inside the row.
 */
export function wireSizeCableDiameter(sizeRaw?: string | null): number {
  const sq = parseWireSizeSqMm(sizeRaw);
  if (sq == null) return 15;
  return Math.max(12, Math.min(26, 10 + sq * 4));
}

/** Stroke width for modern single-conductor illustration from wire size. */
export function wireSizeStrokeWidth(sizeRaw?: string | null): number {
  const sq = parseWireSizeSqMm(sizeRaw);
  if (sq == null) return 3.2;
  if (sq <= 0.5) return 2.2;
  if (sq <= 0.75) return 2.6;
  if (sq <= 1) return 3.2;
  if (sq <= 1.5) return 4.0;
  if (sq <= 2.5) return 5.0;
  return Math.min(7, 4.2 + sq * 0.4);
}
