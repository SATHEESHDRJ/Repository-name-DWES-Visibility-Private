import * as XLSX from 'xlsx';
import type { Cable } from '../data/mock-store';
import {
  buildHeaderPairs,
  cleanExcelHeader,
  dataStartRow,
  findHeaderRow,
} from './excel-headers';

export { findHeaderRow } from './excel-headers';

/**
 * Pure Excel → cables[] parser for wiring schedules.
 * Extracted from UploadService.uploadMapped so the exact same logic can be
 * reused by maintenance scripts (frame regeneration) without touching the DB.
 *
 * `mapping` = systemField → Excel header (exact header text). Values are
 * resolved by header NAME, never by column position.
 */

function normPath(p: string): string {
  return p.replace(/\s*→\s*/g, '->').replace(/\s*->\s*/g, '->').replace(/\s*\/\s*/g, '/').trim();
}

function normalizeText(value: unknown): string {
  return String(value ?? '').trim().replace(/\s+/g, ' ');
}

function normalizeColor(value: unknown): string {
  return normalizeText(value).replace(/\s*\/\s*/g, '/');
}

function normalizeLength(value: unknown): string {
  const text = normalizeText(value);
  if (!text) return '';
  const normalized = text.replace(/,/g, '.').trim();
  const match = normalized.match(/(-?\d+(?:\.\d+)?)/);
  if (match) return match[1];
  return normalized.replace(/m$/i, '').trim();
}

/** Split a "left/right" pair and return the part that is NOT `thisEnd` (the far end). */
function farEndOfPair(pair: string, thisEnd: string): string | null {
  if (!pair.includes('/')) return null;
  const parts = pair.split('/', 2).map(t => t.trim()).filter(Boolean);
  if (parts.length < 2) return null;
  const other = parts.find(p => p !== thisEnd);
  return other ?? parts[1];
}

export interface ParseValidation {
  total: number;
  ok_count: number;
  error_count: number;
  issues: Record<number, Record<string, string>>;
}

export interface ParsedWiring {
  cables: Cable[];
  excelHeaders: string[];
  headerRowIdx: number;
  /** Excel columns present in the sheet but not assigned to any system field. */
  unmatchedHeaders: string[];
  validation: ParseValidation;
}

export function buildParseValidation(cables: Cable[]): ParseValidation {
  const issues: Record<number, Record<string, string>> = {};
  for (let i = 0; i < cables.length; i++) {
    const c = cables[i];
    if (!c) continue;
    const ci: Record<string, string> = {};
    if (!c.ferrule?.trim()) ci.ferrule = 'Missing ferrule';
    if (!c.source?.trim()) ci.source = 'Source not set';
    if (!c.destination?.trim()) ci.destination = 'Destination not set';
    if (Object.keys(ci).length) issues[i] = ci;
  }
  const badRows = Object.keys(issues).length;
  return {
    total: cables.length,
    ok_count: cables.length - badRows,
    error_count: Object.values(issues).reduce((s, ci) => s + Object.keys(ci).length, 0),
    issues,
  };
}

export function parseWiringSheet(
  buffer: Buffer,
  sheetName: string,
  mapping: Record<string, string>,
  headerRowOverride?: number,
): ParsedWiring {
  const wb = XLSX.read(buffer, { type: 'buffer' });
  const ws = wb.Sheets[sheetName] || wb.Sheets[wb.SheetNames[0]];
  const rows: unknown[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' }) as unknown[][];

  const headerRowIdx = headerRowOverride ?? findHeaderRow(rows);
  const headerPairs = buildHeaderPairs(rows, headerRowIdx);
  const rawHeaders = (rows[headerRowIdx] || []).map(h => cleanExcelHeader(h));
  const colIndex: Record<string, number> = {};
  headerPairs.forEach(p => { colIndex[p.name] = p.idx; });
  rawHeaders.forEach((h, i) => { if (h && colIndex[h] === undefined) colIndex[h] = i; });

  const getVal = (row: unknown[], sysField: string): string => {
    const excelCol = mapping[sysField];
    if (!excelCol) return '';
    const idx = colIndex[excelCol];
    if (idx === undefined) return '';
    const v = (row as unknown[])[idx];
    const s = normalizeText(v);
    return ['none', 'null', 'n/a', '-'].includes(s.toLowerCase()) ? '' : s;
  };

  const dataRows = rows.slice(dataStartRow(rows, headerRowIdx)).filter(r =>
    (r as unknown[]).some(c => String(c ?? '').trim())
  );

  const excelHeaders = headerPairs.map(p => p.name);
  const mappedHeaders = new Set(Object.values(mapping).filter(Boolean));
  const unmatchedHeaders = excelHeaders.filter(h => !mappedHeaders.has(h));

  const cables: Cable[] = dataRows.map((row, idx) => {
    const rawRow: Record<string, string> = {};
    rawHeaders.forEach((h, colIdx) => {
      if (h) rawRow[h] = String((row as unknown[])[colIdx] ?? '').trim();
    });
    const ferruleRaw = getVal(row, 'ferrule');
    const snoRaw = getVal(row, 'sno');

    const rawSrc = getVal(row, 'source');
    const rawDst = getVal(row, 'destination');
    const rawPath = getVal(row, 'path');
    const rawSrcDev = getVal(row, 'source_device');
    const rawDstDev = getVal(row, 'dest_device');
    if (!ferruleRaw && !rawSrc && !rawDst && !rawPath && !rawSrcDev && !rawDstDev) return null;

    let source = rawSrc;
    let destination = rawDst;
    let path = rawPath;
    let srcDev = rawSrcDev;
    let srcTerm = getVal(row, 'source_terminal');
    let dstDev = rawDstDev;
    let dstTerm = getVal(row, 'dest_terminal');

    // ── EXPLICIT-FIRST: device:terminal columns define THIS row's terminating
    //    end (source). The far end comes from the ferrule/path pair, choosing
    //    the part that isn't the source — pairs like "QDC3:11/74R1:4" list the
    //    local end in either position depending on the row. ──
    if (!source && srcDev && srcTerm) {
      source = `${srcDev}:${srcTerm}`;
      if (!destination) {
        destination = farEndOfPair(ferruleRaw, source)
          ?? farEndOfPair(normPath(rawPath), source)
          ?? '';
      }
    }

    // ── PRIMARY: ferrule contains "/" → split into source + destination ──
    if (ferruleRaw.includes('/') && !source && !destination) {
      const parts = ferruleRaw.split('/', 2);
      source = parts[0].trim();
      destination = parts[1].trim();
      if (!path) path = `${source}->${destination}`;
    }

    // ── PATH-SPLIT: path field contains "/" or "→" → split into src+dst ──
    if (path && (!source || !destination)) {
      const normP = normPath(path);
      if (normP.includes('->')) {
        const parts = normP.split('->', 2);
        if (!source) source = parts[0].trim();
        if (!destination) destination = parts[1].trim();
        path = normP;
      } else if (normP.includes('/')) {
        const parts = normP.split('/', 2);
        if (!source) source = parts[0].trim();
        if (!destination) destination = (parts[1] ?? '').trim() === source ? parts[0].trim() : (parts[1] ?? '').trim();
        path = `${source}->${destination}`;
      }
    }

    // ── FALLBACK: build source/destination from device:terminal columns ──
    if (!source && (srcDev || srcTerm)) {
      source = srcDev && srcTerm ? `${srcDev}:${srcTerm}` : (srcDev || srcTerm);
    }
    if (!destination && (dstDev || dstTerm)) {
      destination = dstDev && dstTerm ? `${dstDev}:${dstTerm}` : (dstDev || dstTerm);
    }

    // ── Normalise path arrows; rebuild from resolved endpoints ──
    if (path) path = normPath(path);
    if (source && destination) path = `${source}->${destination}`;
    else if (!path && source) path = source;
    else if (!path && destination) path = `->${destination}`;

    // ── Extract device/terminal from source/destination if not explicitly mapped ──
    if (source && !srcDev) {
      if (source.includes(':')) {
        const p = source.split(':');
        srcDev = p.slice(0, -1).join(':');
        srcTerm = p[p.length - 1];
      } else {
        srcDev = source;
      }
    }
    if (destination && !dstDev) {
      if (destination.includes(':')) {
        const p = destination.split(':');
        dstDev = p.slice(0, -1).join(':');
        dstTerm = p[p.length - 1];
      } else {
        dstDev = destination;
      }
    }

    const normalizedSource = normalizeText(source || srcDev || '');
    const normalizedDestination = normalizeText(destination || dstDev || '');
    const normalizedPath = normalizeText(path || '');

    return {
      sno: Number.parseInt(snoRaw, 10) || idx + 1,
      panel: normalizeText(getVal(row, 'panel')),
      ferrule: normalizeText(ferruleRaw),
      source_device: normalizeText(srcDev),
      source_terminal: normalizeText(srcTerm),
      source: normalizedSource,
      destination: normalizedDestination,
      dest_device: normalizeText(dstDev),
      dest_terminal: normalizeText(dstTerm),
      ref: normalizeText(getVal(row, 'ref')),
      color: normalizeColor(getVal(row, 'color')),
      size: normalizeText(getVal(row, 'size')),
      length: normalizeLength(getVal(row, 'length')),
      sign: normalizeText(getVal(row, 'sign')),
      remarks: normalizeText(getVal(row, 'remarks')),
      path: normalizedPath,
      rack: normalizeText(getVal(row, 'rack')),
      _raw: rawRow,
    } as Cable;
  }).filter(Boolean) as Cable[];

  // ── Mapping sanity guard: a real ferrule column carries per-wire markers.
  //    If the mapped column repeats one constant value (e.g. a panel
  //    designation like "=H00+R"), the mapping is scrambled — fail loudly
  //    instead of writing a broken frame. ──
  if (cables.length >= 20) {
    const distinct = new Set(cables.map(c => (c.ferrule || '').trim()).filter(Boolean));
    if (distinct.size <= 1) {
      const candidates = excelHeaders.filter(h => /ferr|wire\s*no|cable\s*no/i.test(h) && h !== mapping.ferrule);
      throw new Error(
        `Column "${mapping.ferrule}" mapped as Ferrule holds one constant value ("${[...distinct][0] ?? ''}") across ${cables.length} rows — that looks like a panel/designation column, not wire ferrules.` +
        (candidates.length ? ` Did you mean: ${candidates.join(', ')}?` : ''),
      );
    }
  }

  return {
    cables,
    excelHeaders,
    headerRowIdx,
    unmatchedHeaders,
    validation: buildParseValidation(cables),
  };
}
