import * as fs from 'fs';
import * as path from 'path';
import * as ExcelJS from 'exceljs';

/** Technician Digital Wiring Schedule field corrections — file store only (no Prisma schema change). */

export const CORRECTABLE_FIELDS = [
  'color',
  'size',
  'length',
  'source',
  'destination',
  'source_device',
  'source_terminal',
  'dest_device',
  'dest_terminal',
  'ferrule',
  'dest_ferrule',
  'ref',
  'sign',
  'remarks',
  'path',
  'rack',
  'panel',
] as const;

export type CorrectableField = (typeof CORRECTABLE_FIELDS)[number];

export const CORRECTABLE_FIELD_LABELS: Record<CorrectableField, string> = {
  color: 'Cable colour',
  size: 'Cable size',
  length: 'Cable length',
  source: 'Source (equipment:terminal)',
  destination: 'Destination (equipment:terminal)',
  source_device: 'Source equipment',
  source_terminal: 'Source terminal',
  dest_device: 'Destination equipment',
  dest_terminal: 'Destination terminal',
  ferrule: 'Source ferrule',
  dest_ferrule: 'Destination ferrule',
  ref: 'Reference',
  sign: 'Sign mark',
  remarks: 'Remarks',
  path: 'Path',
  rack: 'Rack',
  panel: 'Panel',
};

export interface WireCorrectionRecord {
  id: string;
  project_code: string;
  project_name?: string;
  panel_name: string;
  frame_id: string;
  cable_index: number;
  wire_number: string | number;
  field: CorrectableField;
  field_label: string;
  original_value: string;
  corrected_value: string;
  reason: string;
  technician_id: number;
  technician_name: string;
  technician_username?: string;
  corrected_at: string;
  corrected_excel_filename?: string;
  corrected_excel_relative_path?: string;
}

interface FrameCorrectionsFile {
  project_code: string;
  frame_id: string;
  panel_name: string;
  updated_at: string;
  records: WireCorrectionRecord[];
  latest_corrected_filename?: string;
  latest_corrected_relative_path?: string;
}

const UAE_TZ = 'Asia/Dubai';
const AUDIT_COLUMN_HEADER = 'CORRECTION AUDIT';
const TECH_CORRECTIONS_SHEET = 'Technician Corrections';

const ROW_YELLOW_FILL: ExcelJS.Fill = {
  type: 'pattern',
  pattern: 'solid',
  fgColor: { argb: 'FFFFF3CD' },
};

const CELL_AMBER_FILL: ExcelJS.Fill = {
  type: 'pattern',
  pattern: 'solid',
  fgColor: { argb: 'FFFFC107' },
};

const AMBER_BORDER: Partial<ExcelJS.Borders> = {
  top: { style: 'medium', color: { argb: 'FFB45309' } },
  left: { style: 'medium', color: { argb: 'FFB45309' } },
  bottom: { style: 'medium', color: { argb: 'FFB45309' } },
  right: { style: 'medium', color: { argb: 'FFB45309' } },
};

const REGISTER_HEADERS = [
  'Project',
  'Panel',
  'Wire number',
  'Field corrected',
  'Original value',
  'Corrected value',
  'Technician comment',
  'Technician full name',
  'Technician username',
  'Correction date/time UTC',
  'Correction date/time UAE',
  'Corrected file name',
  'Corrected file relative path',
] as const;

function uploadDir() {
  return process.env.UPLOAD_DIR
    ? path.isAbsolute(process.env.UPLOAD_DIR)
      ? process.env.UPLOAD_DIR
      : path.join(process.cwd(), process.env.UPLOAD_DIR)
    : path.join(process.cwd(), 'uploads');
}

/** Filesystem-safe panel folder/filename segment (=H001 → H001). */
export function safePanelName(panelName: string): string {
  const stripped = String(panelName || '').trim().replace(/^=+/, '');
  const safe = stripped.replace(/[^a-zA-Z0-9._-]+/g, '_').replace(/^_+|_+$/g, '');
  return safe || 'PANEL';
}

/** Sanitize for filename segments; keep digits like 002 intact. */
export function sanitizeFilenamePart(value: string): string {
  return String(value || '')
    .trim()
    .replace(/[–—]/g, '-')
    .replace(/\s+/g, '-')
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '') || 'X';
}

/**
 * Panel segment for download/display filenames.
 * Uses Panel-<safeName> so leading DWS '=' is not left in the physical filename
 * (folder paths still use safePanelName alone). Display/DB panel names are unchanged.
 */
export function filenamePanelPart(panelName: string): string {
  const text = String(panelName || '').trim();
  return `Panel-${safePanelName(text)}`;
}

function projectFilenameSegment(projectCode: string, projectName?: string): string {
  const code = String(projectCode);
  const namePart = sanitizeFilenamePart(projectName || code);
  const codePart = sanitizeFilenamePart(code);
  return namePart.toUpperCase().includes(codePart.toUpperCase())
    ? namePart
    : `${namePart}-${codePart}`;
}

function correctionsDir(projectCode: string) {
  return path.join(uploadDir(), String(projectCode), 'Corrections');
}

function panelCorrectionsDir(projectCode: string, panelName: string) {
  return path.join(correctionsDir(projectCode), safePanelName(panelName));
}

function frameCorrectionsPath(projectCode: string, frameId: string) {
  const safe = String(frameId).replace(/[^a-zA-Z0-9_-]/g, '_');
  return path.join(correctionsDir(projectCode), `${safe}-corrections.json`);
}

function registerPath(projectCode: string) {
  return path.join(correctionsDir(projectCode), 'correction-register.xlsx');
}

function legacyCorrectedWorkbookPath(projectCode: string, frameId: string) {
  const safe = String(frameId).replace(/[^a-zA-Z0-9_-]/g, '_');
  return path.join(correctionsDir(projectCode), `${safe}_corrected.xlsx`);
}

function ensureProjectCorrectionsDir(projectCode: string) {
  const dir = correctionsDir(projectCode);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function ensurePanelCorrectionsDir(projectCode: string, panelName: string) {
  const dir = panelCorrectionsDir(projectCode, panelName);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function formatUaeDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: UAE_TZ,
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(d);
  const get = (type: string) => parts.find(p => p.type === type)?.value || '';
  return `${get('day')}-${get('month')}-${get('year')} ${get('hour')}:${get('minute')}:${get('second')} UAE`;
}

function formatFilenameTimestamp(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 'unknown';
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: UAE_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(d);
  const get = (type: string) => parts.find(p => p.type === type)?.value || '';
  return `${get('year')}-${get('month')}-${get('day')}_${get('hour')}${get('minute')}${get('second')}`;
}

/** Professional corrected workbook basename (project + DWS panel name). */
export function buildCorrectedFilename(opts: {
  projectCode: string;
  projectName?: string;
  panelName: string;
  wireNumber: string | number;
  correctedAt: string;
}): string {
  const projectSeg = projectFilenameSegment(opts.projectCode, opts.projectName);
  const panelSeg = filenamePanelPart(opts.panelName);
  const wireSeg = sanitizeFilenamePart(String(opts.wireNumber));
  const ts = formatFilenameTimestamp(opts.correctedAt);
  return `${projectSeg}__${panelSeg}__Wire-${wireSeg}__Corrected__${ts}.xlsx`;
}

/** Professional download name for the original (uncorrected) project-panel schedule. */
export function buildOriginalScheduleFilename(opts: {
  projectCode: string;
  projectName?: string;
  panelName: string;
}): string {
  const projectSeg = projectFilenameSegment(opts.projectCode, opts.projectName);
  const panelSeg = filenamePanelPart(opts.panelName);
  return `${projectSeg}__${panelSeg}__Wiring-Schedule.xlsx`;
}

/**
 * Download alias for the latest corrected project-panel workbook.
 * Uses full project name + Digital Wiring Schedule panel name (e.g. =H001).
 */
export function buildCorrectedScheduleDownloadFilename(opts: {
  projectCode: string;
  projectName?: string;
  panelName: string;
}): string {
  const projectSeg = projectFilenameSegment(opts.projectCode, opts.projectName);
  const panelSeg = filenamePanelPart(opts.panelName);
  return `${projectSeg}__${panelSeg}__Corrected-Wiring-Schedule.xlsx`;
}

/**
 * Download name from the Supervisor-uploaded Digital Wiring Schedule Excel filename.
 * Preserves ENOWA-style names (e.g. =D00+Q01); appends __Corrected when needed.
 */
export function buildDownloadFilenameFromUploadedSchedule(opts: {
  originalFilename?: string | null;
  corrected: boolean;
  fallbackProjectCode: string;
  fallbackProjectName?: string;
  fallbackPanelName?: string;
}): string {
  const raw = String(opts.originalFilename || '').trim();
  const baseName = raw ? path.basename(raw) : '';
  const stem = baseName.replace(/\.xlsx?$/i, '').trim();
  const safeStem = stem
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '-')
    .replace(/\s+/g, ' ')
    .trim();
  if (safeStem && !/^\(created with project\)$/i.test(safeStem)) {
    return opts.corrected ? `${safeStem}__Corrected.xlsx` : `${safeStem}.xlsx`;
  }
  return opts.corrected
    ? buildCorrectedScheduleDownloadFilename({
      projectCode: opts.fallbackProjectCode,
      projectName: opts.fallbackProjectName,
      panelName: opts.fallbackPanelName || 'PANEL',
    })
    : buildOriginalScheduleFilename({
      projectCode: opts.fallbackProjectCode,
      projectName: opts.fallbackProjectName,
      panelName: opts.fallbackPanelName || 'PANEL',
    });
}

function panelRelativePath(projectCode: string, panelName: string, filename: string) {
  return path.join(String(projectCode), 'Corrections', safePanelName(panelName), filename).replace(/\\/g, '/');
}

function panelDisplayPath(projectCode: string, panelName: string, filename?: string) {
  const base = `uploads/${String(projectCode)}/Corrections/${safePanelName(panelName)}/`;
  return filename ? `${base}${filename}` : base;
}

function readFrameFile(projectCode: string, frameId: string): FrameCorrectionsFile {
  const p = frameCorrectionsPath(projectCode, frameId);
  if (!fs.existsSync(p)) {
    return {
      project_code: projectCode,
      frame_id: frameId,
      panel_name: '',
      updated_at: new Date().toISOString(),
      records: [],
    };
  }
  try {
    const parsed = JSON.parse(fs.readFileSync(p, 'utf8')) as FrameCorrectionsFile;
    if (!parsed || !Array.isArray(parsed.records)) {
      return {
        project_code: projectCode,
        frame_id: frameId,
        panel_name: '',
        updated_at: new Date().toISOString(),
        records: [],
      };
    }
    return parsed;
  } catch {
    return {
      project_code: projectCode,
      frame_id: frameId,
      panel_name: '',
      updated_at: new Date().toISOString(),
      records: [],
    };
  }
}

function writeFrameFile(data: FrameCorrectionsFile) {
  ensureProjectCorrectionsDir(data.project_code);
  fs.writeFileSync(frameCorrectionsPath(data.project_code, data.frame_id), JSON.stringify(data, null, 2), 'utf8');
}

async function appendRegisterRow(record: WireCorrectionRecord) {
  ensureProjectCorrectionsDir(record.project_code);
  const p = registerPath(record.project_code);
  const wb = new ExcelJS.Workbook();
  let sheet: ExcelJS.Worksheet;
  if (fs.existsSync(p)) {
    await wb.xlsx.readFile(p);
    sheet = wb.worksheets[0] || wb.addWorksheet('Corrections');
    if (sheet.rowCount === 0) {
      sheet.addRow([...REGISTER_HEADERS]);
      sheet.getRow(1).font = { bold: true };
    }
  } else {
    sheet = wb.addWorksheet('Corrections');
    sheet.addRow([...REGISTER_HEADERS]);
    sheet.getRow(1).font = { bold: true };
  }
  sheet.addRow([
    String(record.project_code),
    record.panel_name,
    record.wire_number,
    record.field_label,
    record.original_value,
    record.corrected_value,
    record.reason,
    record.technician_name,
    record.technician_username || '',
    record.corrected_at,
    formatUaeDateTime(record.corrected_at),
    record.corrected_excel_filename || '',
    record.corrected_excel_relative_path || '',
  ]);
  await wb.xlsx.writeFile(p);
}

function normalizeHeaderKey(header: string): string {
  return String(header ?? '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
}

function isDestFerruleHeader(header: string): boolean {
  const key = normalizeHeaderKey(header);
  return key === 'IECFERRB' || key === 'FERRB' || key.endsWith('FERRB');
}

function isSourceFerruleHeader(header: string): boolean {
  const key = normalizeHeaderKey(header);
  return key === 'IECFERRA' || key === 'FERRA' || key.endsWith('FERRA') || key === 'FERRULE';
}

/** Resolve current display value for a correctable field from a cable (+ optional mapping). */
export function readCableFieldValue(
  cable: Record<string, unknown>,
  field: CorrectableField,
  mapping: Record<string, string> = {},
): string {
  if (field === 'dest_ferrule') {
    const raw = (cable._raw && typeof cable._raw === 'object')
      ? (cable._raw as Record<string, string>)
      : {};
    for (const [header, value] of Object.entries(raw)) {
      if (isDestFerruleHeader(header) && String(value ?? '').trim()) return String(value).trim();
    }
    if (typeof cable.dest_ferrule === 'string' && cable.dest_ferrule.trim()) {
      return cable.dest_ferrule.trim();
    }
    return '';
  }
  if (field === 'ferrule') {
    const mapped = mapping.ferrule;
    const raw = (cable._raw && typeof cable._raw === 'object')
      ? (cable._raw as Record<string, string>)
      : {};
    if (mapped && raw[mapped] != null && String(raw[mapped]).trim()) return String(raw[mapped]).trim();
    for (const [header, value] of Object.entries(raw)) {
      if (isSourceFerruleHeader(header) && String(value ?? '').trim()) return String(value).trim();
    }
  }
  const direct = cable[field];
  if (direct != null && String(direct).trim()) return String(direct).trim();
  const mappedHeader = mapping[field];
  if (mappedHeader && cable._raw && typeof cable._raw === 'object') {
    const raw = cable._raw as Record<string, string>;
    if (raw[mappedHeader] != null) return String(raw[mappedHeader]).trim();
  }
  return '';
}

/** Apply an ordered list of corrections onto a shallow-copied cable (technician overlay only). */
export function applyCorrectionsToCable(
  cable: Record<string, unknown>,
  records: WireCorrectionRecord[],
  mapping: Record<string, string> = {},
): Record<string, unknown> {
  if (!records.length) return cable;
  const next: Record<string, unknown> = {
    ...cable,
    _raw: cable._raw && typeof cable._raw === 'object'
      ? { ...(cable._raw as Record<string, string>) }
      : {},
  };
  const correctedFields = new Set<string>();
  for (const rec of records) {
    const field = rec.field;
    const value = rec.corrected_value;
    correctedFields.add(field);
    if (field === 'dest_ferrule') {
      next.dest_ferrule = value;
      const raw = next._raw as Record<string, string>;
      let written = false;
      for (const header of Object.keys(raw)) {
        if (isDestFerruleHeader(header)) {
          raw[header] = value;
          written = true;
        }
      }
      if (!written) raw.IEC_FERR_B = value;
      continue;
    }
    next[field] = value;
    const mappedHeader = mapping[field];
    if (mappedHeader) {
      (next._raw as Record<string, string>)[mappedHeader] = value;
    }
    if (field === 'source' && value.includes(':')) {
      const parts = value.split(':');
      next.source_terminal = parts[parts.length - 1];
      next.source_device = parts.slice(0, -1).join(':');
    }
    if (field === 'destination' && value.includes(':')) {
      const parts = value.split(':');
      next.dest_terminal = parts[parts.length - 1];
      next.dest_device = parts.slice(0, -1).join(':');
    }
  }
  next._corrected_fields = [...correctedFields];
  return next;
}

function cellText(value: unknown): string {
  if (value == null) return '';
  if (typeof value === 'object' && value !== null && 'text' in (value as any)) {
    return String((value as any).text ?? '').trim();
  }
  if (typeof value === 'object' && value !== null && 'result' in (value as any)) {
    return String((value as any).result ?? '').trim();
  }
  return String(value).trim();
}

function auditNoteText(rec: WireCorrectionRecord): string {
  const user = rec.technician_username ? ` (@${rec.technician_username})` : '';
  return [
    `Project: ${rec.project_name || rec.project_code}`,
    `Project code: ${rec.project_code}`,
    `Panel: ${rec.panel_name}`,
    `Wire: ${rec.wire_number}`,
    `Parameter: ${rec.field_label}`,
    `Original: ${rec.original_value}`,
    `Corrected: ${rec.corrected_value}`,
    `Technician: ${rec.technician_name}${user}`,
    `Comment: ${rec.reason || '—'}`,
    `Corrected at (UTC): ${rec.corrected_at}`,
    `Corrected at: ${formatUaeDateTime(rec.corrected_at)}`,
  ].join('\n');
}

function auditColumnLine(rec: WireCorrectionRecord): string {
  const user = rec.technician_username ? ` (@${rec.technician_username})` : '';
  return `CORRECTED: ${rec.field_label} | ${rec.original_value} → ${rec.corrected_value} | By ${rec.technician_name}${user} | Comment: ${rec.reason || '—'} | ${formatUaeDateTime(rec.corrected_at)}`;
}

function findHeaderRow(sheet: ExcelJS.Worksheet): { rowNumber: number; headers: string[] } {
  const maxScan = Math.min(sheet.rowCount || 1, 30);
  for (let r = 1; r <= maxScan; r++) {
    const row = sheet.getRow(r);
    const headers: string[] = [];
    let nonEmpty = 0;
    row.eachCell({ includeEmpty: false }, (cell, col) => {
      const text = cellText(cell.value);
      if (text) nonEmpty += 1;
      headers[col - 1] = text;
    });
    if (nonEmpty >= 3) return { rowNumber: r, headers };
  }
  return { rowNumber: 1, headers: [] };
}

function sheetLooksLikeWiringSchedule(sheet: ExcelJS.Worksheet): boolean {
  const { headers } = findHeaderRow(sheet);
  const keys = headers.map(normalizeHeaderKey);
  const hasSno = keys.some(k => k === 'SNO' || k === 'WIRENO' || k === 'CABLENO' || k === 'WIRE');
  const hasLength = keys.some(k => k.includes('LENGTH') || k === 'LEN');
  return hasSno || hasLength;
}

function findWiringScheduleSheet(wb: ExcelJS.Workbook): ExcelJS.Worksheet | null {
  const byName = wb.worksheets.find(ws => /wiring\s*schedule/i.test(ws.name || ''));
  if (byName) return byName;
  for (const ws of wb.worksheets) {
    if (sheetLooksLikeWiringSchedule(ws)) return ws;
  }
  return wb.worksheets[0] || null;
}

function columnIndexForField(
  headers: string[],
  field: CorrectableField,
  mapping: Record<string, string>,
): number | null {
  const mapped = mapping[field];
  if (mapped) {
    const idx = headers.findIndex(h => String(h).trim() === mapped || normalizeHeaderKey(h) === normalizeHeaderKey(mapped));
    if (idx >= 0) return idx + 1;
  }
  const aliases: Record<string, string[]> = {
    color: ['COLOR', 'COLOUR', 'WIRECOLOR', 'CABLECOLOR', 'WIRECOLORCABLECOLOR'],
    size: ['SIZE', 'WIRESIZE', 'CABLESIZE', 'WIRESIZECABLESIZE'],
    length: ['LENGTH', 'LENGTHM', 'LEN', 'CABLELENGTH'],
    source: ['SOURCE', 'FROM'],
    destination: ['DESTINATION', 'DEST', 'TO'],
    source_device: ['DEVTBLKA', 'DEVA', 'SRCDEV', 'SOURCEDEVICE'],
    source_terminal: ['TERMA', 'SRCTERM', 'TERMINALA'],
    dest_device: ['DEVTBLKB', 'DEVB', 'DSTDEV', 'DESTDEVICE'],
    dest_terminal: ['TERMB', 'DSTTERM', 'TERMINALB'],
    ferrule: ['IECFERRA', 'FERRA', 'FERRULE'],
    dest_ferrule: ['IECFERRB', 'FERRB'],
    ref: ['REF', 'REFRNCE', 'REFRNCEA', 'REFERENCE'],
    sign: ['SIGN', 'SIGNMARK'],
    remarks: ['REMARKS', 'REMARK'],
    panel: ['PNLNOA', 'PNLNO', 'PANEL'],
    path: ['PATH'],
    rack: ['RACK'],
  };
  const wanted = aliases[field] || [normalizeHeaderKey(field)];
  for (let i = 0; i < headers.length; i++) {
    const key = normalizeHeaderKey(headers[i] || '');
    if (wanted.includes(key)) return i + 1;
  }
  return null;
}

function snoColumnIndex(headers: string[]): number | null {
  for (let i = 0; i < headers.length; i++) {
    const key = normalizeHeaderKey(headers[i] || '');
    if (key === 'SNO' || key === 'WIRENO' || key === 'CABLENO' || key === 'NO') return i + 1;
  }
  return null;
}

function findScheduleRowByWire(
  sheet: ExcelJS.Worksheet,
  headerRow: number,
  headers: string[],
  wireNumber: string | number,
  cable: Record<string, unknown>,
  cableIndex: number,
): number {
  const snoCol = snoColumnIndex(headers);
  const target = String(wireNumber).trim();
  if (snoCol) {
    const max = Math.max(sheet.rowCount || headerRow + 1, headerRow + 1);
    for (let r = headerRow + 1; r <= max; r++) {
      const val = cellText(sheet.getRow(r).getCell(snoCol).value);
      if (val && val === target) return r;
    }
  }
  const excelRow = Number((cable as any).excel_row);
  if (Number.isFinite(excelRow) && excelRow > 0) return excelRow;
  return headerRow + 1 + cableIndex;
}

function usedColumnCount(headers: string[], sheet: ExcelJS.Worksheet, headerRow: number): number {
  let max = headers.length;
  const sample = sheet.getRow(headerRow);
  sample.eachCell({ includeEmpty: false }, (_c, col) => {
    if (col > max) max = col;
  });
  return Math.max(max, 1);
}

function ensureAuditColumn(
  sheet: ExcelJS.Worksheet,
  headerRow: number,
  headers: string[],
): { auditCol: number; headers: string[] } {
  const existing = headers.findIndex(h => normalizeHeaderKey(h) === normalizeHeaderKey(AUDIT_COLUMN_HEADER));
  if (existing >= 0) {
    return { auditCol: existing + 1, headers };
  }
  const auditCol = usedColumnCount(headers, sheet, headerRow) + 1;
  const headerCell = sheet.getRow(headerRow).getCell(auditCol);
  headerCell.value = AUDIT_COLUMN_HEADER;
  headerCell.font = { ...(headerCell.font || {}), bold: true };
  const nextHeaders = [...headers];
  while (nextHeaders.length < auditCol - 1) nextHeaders.push('');
  nextHeaders[auditCol - 1] = AUDIT_COLUMN_HEADER;
  sheet.getColumn(auditCol).width = 56;
  return { auditCol, headers: nextHeaders };
}

function highlightFullRow(sheet: ExcelJS.Worksheet, rowNumber: number, lastCol: number) {
  const row = sheet.getRow(rowNumber);
  for (let c = 1; c <= lastCol; c++) {
    const cell = row.getCell(c);
    const fillArgb = String((cell.fill as any)?.fgColor?.argb || '').toUpperCase();
    if (fillArgb === 'FFFFC107') continue;
    cell.fill = ROW_YELLOW_FILL;
  }
}

function applyCorrectionToScheduleCell(
  sheet: ExcelJS.Worksheet,
  headers: string[],
  headerRow: number,
  cable: Record<string, unknown>,
  cableIndex: number,
  rec: WireCorrectionRecord,
  mapping: Record<string, string>,
  lastCol: number,
): { rowNumber: number; col: number } | null {
  const col = columnIndexForField(headers, rec.field, mapping);
  if (!col) return null;
  const rowNumber = findScheduleRowByWire(sheet, headerRow, headers, rec.wire_number, cable, cableIndex);
  highlightFullRow(sheet, rowNumber, lastCol);
  const cell = sheet.getRow(rowNumber).getCell(col);
  cell.value = rec.corrected_value;
  cell.fill = CELL_AMBER_FILL;
  cell.border = AMBER_BORDER as ExcelJS.Borders;
  cell.note = auditNoteText(rec);
  return { rowNumber, col };
}

function rebuildTechnicianCorrectionsSheet(wb: ExcelJS.Workbook, records: WireCorrectionRecord[]) {
  let summary = wb.getWorksheet(TECH_CORRECTIONS_SHEET);
  if (summary) wb.removeWorksheet(summary.id);
  summary = wb.addWorksheet(TECH_CORRECTIONS_SHEET);
  summary.addRow([...REGISTER_HEADERS]);
  const header = summary.getRow(1);
  header.font = { bold: true };
  header.fill = ROW_YELLOW_FILL;
  summary.views = [{ state: 'frozen', ySplit: 1 }];
  summary.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: 1, column: REGISTER_HEADERS.length },
  };
  const widths = [14, 14, 12, 18, 16, 16, 22, 20, 16, 24, 26, 48, 40];
  widths.forEach((w, i) => { summary!.getColumn(i + 1).width = w; });
  for (const rec of records) {
    const row = summary.addRow([
      String(rec.project_code),
      rec.panel_name,
      rec.wire_number,
      rec.field_label,
      rec.original_value,
      rec.corrected_value,
      rec.reason,
      rec.technician_name,
      rec.technician_username || '',
      rec.corrected_at,
      formatUaeDateTime(rec.corrected_at),
      rec.corrected_excel_filename || '',
      rec.corrected_excel_relative_path || '',
    ]);
    row.eachCell(cell => { cell.fill = ROW_YELLOW_FILL; });
  }
}

async function writeCorrectedWorkbook(opts: {
  projectCode: string;
  frameId: string;
  panelName: string;
  sourceBuffer: Buffer | null;
  records: WireCorrectionRecord[];
  cables: Array<Record<string, unknown>>;
  mapping: Record<string, string>;
  filename: string;
}): Promise<{ absolutePath: string; relativePath: string; displayPath: string }> {
  const panelDir = ensurePanelCorrectionsDir(opts.projectCode, opts.panelName);
  const absolutePath = path.join(panelDir, opts.filename);
  const relativePath = panelRelativePath(opts.projectCode, opts.panelName, opts.filename);
  const displayPath = panelDisplayPath(opts.projectCode, opts.panelName, opts.filename);

  const wb = new ExcelJS.Workbook();
  const byIndex = new Map<number, WireCorrectionRecord[]>();
  for (const rec of opts.records) {
    const list = byIndex.get(rec.cable_index) || [];
    list.push(rec);
    byIndex.set(rec.cable_index, list);
  }

  if (opts.sourceBuffer && opts.sourceBuffer.length > 0) {
    await wb.xlsx.load(opts.sourceBuffer as any);
    const sheet = findWiringScheduleSheet(wb);
    if (sheet) {
      let { rowNumber: headerRow, headers } = findHeaderRow(sheet);
      const audit = ensureAuditColumn(sheet, headerRow, headers);
      headers = audit.headers;
      const lastCol = Math.max(usedColumnCount(headers, sheet, headerRow), audit.auditCol);
      const auditByRow = new Map<number, WireCorrectionRecord[]>();

      for (const [cableIndex, recs] of byIndex.entries()) {
        const cable = opts.cables[cableIndex] || {};
        for (const rec of recs) {
          const applied = applyCorrectionToScheduleCell(
            sheet, headers, headerRow, cable, cableIndex, rec, opts.mapping, lastCol,
          );
          if (!applied) continue;
          const list = auditByRow.get(applied.rowNumber) || [];
          list.push(rec);
          auditByRow.set(applied.rowNumber, list);
        }
      }

      for (const [rowNumber, recs] of auditByRow.entries()) {
        const sorted = [...recs].sort((a, b) => String(a.corrected_at).localeCompare(String(b.corrected_at)));
        const cell = sheet.getRow(rowNumber).getCell(audit.auditCol);
        cell.value = sorted.map(auditColumnLine).join('\n');
        cell.alignment = { ...(cell.alignment || {}), wrapText: true, vertical: 'top' };
        cell.fill = ROW_YELLOW_FILL;
      }
    }
    rebuildTechnicianCorrectionsSheet(wb, opts.records);
  } else {
    const sheet = wb.addWorksheet('WIRING SCHEDULE');
    const headers = [
      'S.NO', 'Source', 'Destination', 'Source ferrule', 'Dest ferrule',
      'Colour', 'Size', 'Length', 'Ref', 'Sign', 'Remarks', AUDIT_COLUMN_HEADER,
    ];
    sheet.addRow(headers);
    sheet.getRow(1).font = { bold: true };
    opts.cables.forEach((cable, index) => {
      const cableRecs = byIndex.get(index) || [];
      const overlaid = applyCorrectionsToCable(cable, cableRecs, opts.mapping);
      const fieldToCol: Record<string, number> = {
        source: 2, destination: 3, ferrule: 4, dest_ferrule: 5,
        color: 6, size: 7, length: 8, ref: 9, sign: 10, remarks: 11,
      };
      const row = sheet.addRow([
        overlaid.sno ?? index + 1,
        overlaid.source ?? '',
        overlaid.destination ?? '',
        overlaid.ferrule ?? '',
        overlaid.dest_ferrule ?? readCableFieldValue(overlaid, 'dest_ferrule', opts.mapping),
        overlaid.color ?? '',
        overlaid.size ?? '',
        overlaid.length ?? '',
        overlaid.ref ?? '',
        overlaid.sign ?? '',
        overlaid.remarks ?? '',
        cableRecs.length
          ? [...cableRecs].sort((a, b) => String(a.corrected_at).localeCompare(String(b.corrected_at))).map(auditColumnLine).join('\n')
          : '',
      ]);
      if (cableRecs.length) {
        for (let c = 1; c <= 12; c++) row.getCell(c).fill = ROW_YELLOW_FILL;
      }
      for (const rec of cableRecs) {
        const col = fieldToCol[rec.field];
        if (!col) continue;
        const cell = row.getCell(col);
        cell.fill = CELL_AMBER_FILL;
        cell.border = AMBER_BORDER as ExcelJS.Borders;
        cell.note = auditNoteText(rec);
      }
    });
    rebuildTechnicianCorrectionsSheet(wb, opts.records);
  }

  await wb.xlsx.writeFile(absolutePath);
  return { absolutePath, relativePath, displayPath };
}

function isPathInside(root: string, candidate: string): boolean {
  const resolvedRoot = path.resolve(root);
  const resolved = path.resolve(candidate);
  return resolved === resolvedRoot || resolved.startsWith(resolvedRoot + path.sep);
}

export const WireCorrectionsStore = {
  correctionsDir,
  panelCorrectionsDir,
  safePanelName,
  filenamePanelPart,
  buildCorrectedFilename,
  buildOriginalScheduleFilename,
  buildCorrectedScheduleDownloadFilename,
  buildDownloadFilenameFromUploadedSchedule,
  panelDisplayPath,

  correctedWorkbookPath(projectCode: string, frameId: string, panelName?: string, filename?: string) {
    if (panelName && filename) {
      return path.join(panelCorrectionsDir(projectCode, panelName), filename);
    }
    return legacyCorrectedWorkbookPath(projectCode, frameId);
  },

  correctedWorkbookDisplayPath(projectCode: string, frameId: string, panelName?: string, filename?: string) {
    const file = readFrameFile(projectCode, frameId);
    const panel = panelName || file.panel_name || 'PANEL';
    const name = filename || file.latest_corrected_filename;
    return panelDisplayPath(projectCode, panel, name);
  },

  correctedWorkbookRelativePath(projectCode: string, frameId: string, panelName?: string, filename?: string) {
    const file = readFrameFile(projectCode, frameId);
    const panel = panelName || file.panel_name || 'PANEL';
    const name = filename || file.latest_corrected_filename;
    if (!name) {
      return `${path.join(String(projectCode), 'Corrections', safePanelName(panel)).replace(/\\/g, '/')}/`;
    }
    return panelRelativePath(projectCode, panel, name);
  },

  listForFrame(projectCode: string, frameId: string): WireCorrectionRecord[] {
    return readFrameFile(projectCode, frameId).records;
  },

  getFrameMeta(projectCode: string, frameId: string): FrameCorrectionsFile {
    return readFrameFile(projectCode, frameId);
  },

  listForCable(projectCode: string, frameId: string, cableIndex: number): WireCorrectionRecord[] {
    return this.listForFrame(projectCode, frameId).filter(r => r.cable_index === cableIndex);
  },

  latestOverrides(
    projectCode: string,
    frameId: string,
    cableIndex: number,
  ): Record<string, string> {
    const overrides: Record<string, string> = {};
    for (const rec of this.listForCable(projectCode, frameId, cableIndex)) {
      overrides[rec.field] = rec.corrected_value;
    }
    return overrides;
  },

  readLatestCorrectedBuffer(projectCode: string, frameId: string): Buffer | null {
    const abs = this.resolveCorrectedExcelAbsolutePath(projectCode, frameId);
    if (!abs) return null;
    try {
      return fs.readFileSync(abs);
    } catch {
      return null;
    }
  },

  async append(record: WireCorrectionRecord, opts: {
    sourceBuffer: Buffer | null;
    cables: Array<Record<string, unknown>>;
    mapping: Record<string, string>;
  }): Promise<{
    records: WireCorrectionRecord[];
    corrected_excel_relative_path: string;
    corrected_excel_display_path: string;
    corrected_excel_filename: string;
  }> {
    const file = readFrameFile(record.project_code, record.frame_id);
    file.panel_name = record.panel_name;
    file.updated_at = record.corrected_at;

    const filename = buildCorrectedFilename({
      projectCode: record.project_code,
      projectName: record.project_name,
      panelName: record.panel_name,
      wireNumber: record.wire_number,
      correctedAt: record.corrected_at,
    });
    const relativePath = panelRelativePath(record.project_code, record.panel_name, filename);

    record.corrected_excel_filename = filename;
    record.corrected_excel_relative_path = relativePath;
    file.records.push(record);

    // Always prefer original schedule buffer when provided so all corrections
    // re-apply cleanly onto a full workbook clone (avoids stacked AUDIT columns).
    const sourceBuffer = opts.sourceBuffer && opts.sourceBuffer.length > 0
      ? opts.sourceBuffer
      : this.readLatestCorrectedBuffer(record.project_code, record.frame_id);

    const written = await writeCorrectedWorkbook({
      projectCode: record.project_code,
      frameId: record.frame_id,
      panelName: record.panel_name,
      sourceBuffer,
      records: file.records,
      cables: opts.cables,
      mapping: opts.mapping,
      filename,
    });

    file.latest_corrected_filename = filename;
    file.latest_corrected_relative_path = written.relativePath;
    writeFrameFile(file);
    await appendRegisterRow(record);

    return {
      records: file.records,
      corrected_excel_relative_path: written.relativePath,
      corrected_excel_display_path: written.displayPath,
      corrected_excel_filename: filename,
    };
  },

  resolveCorrectedExcelAbsolutePath(projectCode: string, frameId: string): string | null {
    const root = path.resolve(correctionsDir(projectCode));
    const file = readFrameFile(projectCode, frameId);
    if (file.latest_corrected_filename && file.panel_name) {
      const abs = path.join(
        panelCorrectionsDir(projectCode, file.panel_name),
        file.latest_corrected_filename,
      );
      const resolved = path.resolve(abs);
      if (isPathInside(root, resolved) && fs.existsSync(resolved)) return resolved;
    }
    if (file.latest_corrected_relative_path) {
      const abs = path.join(uploadDir(), file.latest_corrected_relative_path);
      const resolved = path.resolve(abs);
      if (isPathInside(path.resolve(uploadDir()), resolved) && fs.existsSync(resolved)) return resolved;
    }
    const legacy = path.resolve(legacyCorrectedWorkbookPath(projectCode, frameId));
    if (isPathInside(root, legacy) && fs.existsSync(legacy)) return legacy;
    return null;
  },

  overlayCables(
    cables: Array<Record<string, unknown>>,
    projectCode: string,
    frameId: string,
    mapping: Record<string, string> = {},
  ): Array<Record<string, unknown>> {
    const all = this.listForFrame(projectCode, frameId);
    if (!all.length) return cables;
    const byIndex = new Map<number, WireCorrectionRecord[]>();
    for (const rec of all) {
      const list = byIndex.get(rec.cable_index) || [];
      list.push(rec);
      byIndex.set(rec.cable_index, list);
    }
    return cables.map((cable, index) => {
      const recs = byIndex.get(index);
      if (!recs?.length) return cable;
      return applyCorrectionsToCable(cable, recs, mapping);
    });
  },

  async buildExcelPreview(opts: {
    projectCode: string;
    frameId: string;
    panelName?: string;
    projectName?: string;
    wireNumber?: string | number;
    focusField?: string;
    /** Optional original schedule buffer when no corrected workbook exists. */
    originalBuffer?: Buffer | null;
    originalDisplayPath?: string;
  }): Promise<{
    filename: string;
    relativePath: string;
    displayPath: string;
    workbookSource: 'corrected' | 'original';
    defaultSheet: string;
    sheets: Array<{
      name: string;
      rows: string[][];
      highlightedRows: number[];
      highlightedCells: Array<{ row: number; col: number }>;
    }>;
    focus: {
      sheet: string;
      row: number | null;
      col: number | null;
      wireNumber: string | number | null;
    };
    corrections: WireCorrectionRecord[];
  } | null> {
    const abs = this.resolveCorrectedExcelAbsolutePath(opts.projectCode, opts.frameId);
    const meta = readFrameFile(opts.projectCode, opts.frameId);
    const wb = new ExcelJS.Workbook();
    let filename: string;
    let relativePath: string;
    let displayPath: string;
    let workbookSource: 'corrected' | 'original';

    if (abs) {
      workbookSource = 'corrected';
      filename = meta.latest_corrected_filename || path.basename(abs);
      relativePath = meta.latest_corrected_relative_path
        || panelRelativePath(opts.projectCode, meta.panel_name || opts.panelName || 'PANEL', filename);
      displayPath = `uploads/${relativePath}`.replace(/\\/g, '/');
      await wb.xlsx.readFile(abs);
    } else if (opts.originalBuffer && opts.originalBuffer.length > 0) {
      workbookSource = 'original';
      const panel = opts.panelName || meta.panel_name || 'PANEL';
      filename = buildOriginalScheduleFilename({
        projectCode: opts.projectCode,
        projectName: opts.projectName,
        panelName: panel,
      });
      relativePath = `${String(opts.projectCode)}/frames/${opts.frameId}.xlsx`.replace(/\\/g, '/');
      displayPath = opts.originalDisplayPath || `uploads/${relativePath}`;
      await wb.xlsx.load(opts.originalBuffer as any);
    } else {
      return null;
    }

    const sheets = wb.worksheets.map(ws => {
      const { rowNumber: headerRow, headers } = findHeaderRow(ws);
      const maxCols = Math.max(headers.length, usedColumnCount(headers, ws, headerRow));
      const maxRows = Math.min(ws.rowCount || headerRow, headerRow + 2500);
      const rows: string[][] = [];
      const highlightedRows: number[] = [];
      const highlightedCells: Array<{ row: number; col: number }> = [];
      for (let r = 1; r <= maxRows; r++) {
        const rowVals: string[] = [];
        let rowYellow = false;
        for (let c = 1; c <= maxCols; c++) {
          const cell = ws.getRow(r).getCell(c);
          rowVals.push(cellText(cell.value));
          const argb = String((cell.fill as any)?.fgColor?.argb || '').toUpperCase();
          if (argb === 'FFFFC107') {
            highlightedCells.push({ row: r - 1, col: c - 1 });
            rowYellow = true;
          } else if (argb === 'FFFFF3CD') {
            rowYellow = true;
          }
        }
        rows.push(rowVals);
        if (rowYellow && r > headerRow) highlightedRows.push(r - 1);
      }
      return { name: ws.name, rows, highlightedRows, highlightedCells };
    });

    const schedule = findWiringScheduleSheet(wb);
    const defaultSheet = schedule?.name || sheets[0]?.name || 'WIRING SCHEDULE';
    let focusRow: number | null = null;
    let focusCol: number | null = null;
    if (schedule && opts.wireNumber != null && String(opts.wireNumber).trim()) {
      const { rowNumber: headerRow, headers } = findHeaderRow(schedule);
      const snoCol = snoColumnIndex(headers);
      const target = String(opts.wireNumber).trim();
      if (snoCol) {
        for (let r = headerRow + 1; r <= (schedule.rowCount || headerRow); r++) {
          if (cellText(schedule.getRow(r).getCell(snoCol).value) === target) {
            focusRow = r - 1;
            const fieldCol = opts.focusField
              && (CORRECTABLE_FIELDS as readonly string[]).includes(String(opts.focusField))
              ? columnIndexForField(headers, opts.focusField as CorrectableField, {})
              : null;
            const lengthCol = columnIndexForField(headers, 'length', {});
            focusCol = fieldCol
              ? fieldCol - 1
              : (lengthCol ? lengthCol - 1 : (snoCol - 1));
            // Prefer an amber highlighted cell on this row when present.
            const sheetPreview = sheets.find(s => s.name === schedule.name);
            if (sheetPreview) {
              const amberOnRow = sheetPreview.highlightedCells.find(h => h.row === focusRow);
              if (amberOnRow) focusCol = amberOnRow.col;
            }
            break;
          }
        }
      }
    }

    return {
      filename,
      relativePath,
      displayPath,
      workbookSource,
      defaultSheet,
      sheets,
      focus: {
        sheet: defaultSheet,
        row: focusRow,
        col: focusCol,
        wireNumber: opts.wireNumber ?? null,
      },
      corrections: meta.records,
    };
  },
};
