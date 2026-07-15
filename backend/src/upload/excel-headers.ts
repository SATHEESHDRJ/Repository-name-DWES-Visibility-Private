/** Shared Excel header detection + cleaning for read-headers and parse-wiring. */

export const HEADER_KEYWORDS = [
  'ferrule', 'cable', 'wire', 'source', 'dest', 'terminal', 'conductor',
  's.no', 'sno', 'color', 'size', 'length', 'iec', 'tblk',
];

export const SCORE_KEYWORDS = [
  'ferrule', 'cable', 'wire', 'source', 'dest', 'terminal', 'conductor',
  'size', 'color', 'length', 'sno', 's.no',
];

const LABEL_KEYWORDS = [
  ...HEADER_KEYWORDS,
  'device', 'dev', 'term', 'pin', 'conn', 'destination', 'src', 'dst',
  'type', 'name', 'desc', 'qty', 'no', 'number', 'routing', 'path', 'spec',
  'cross', 'section', 'remark', 'ref', 'rack', 'sign', 'panel', 'pnl',
  'client', 'project', 'drawing', 'dwg', 'sheet', 'page', 'rev', 'revision',
  'date', 'status', 'operator', 'by', 'check', 'appr', 'approve',
  'model', 'make', 'mfg', 'manuf', 'supplier', 'vendor', 'class', 'code'
];

/** Normalize cell text: collapse whitespace, strip control chars. */
export function cleanExcelHeader(raw: unknown): string {
  return String(raw ?? '')
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** True when text looks like a wire-size sub-header (e.g. "2.5sq mm White"). */
function looksLikeWireSpec(text: string): boolean {
  return /\d+(?:\.\d+)?\s*sq\s*mm/i.test(text) || /^\d+(?:\.\d+)?\s*(mm²|mm2|awg)/i.test(text);
}

/** True when text looks like a column title, not sample data. */
function looksLikeHeaderLabel(text: string): boolean {
  const l = text.toLowerCase();
  if (!l || l.length > 60) return false;
  if (/\d/.test(text)) return false;
  if (LABEL_KEYWORDS.some(kw => l.includes(kw))) return true;
  if (/^(s\.?\s*no|ref|remark|rack|sign|panel|pnl)/i.test(text)) return true;
  return text.length <= 24 && !looksLikeWireSpec(text);
}

/**
 * Strong header evidence only — keyword/regex-matched labels or wire specs.
 * Used by isSubHeaderRow, where the generic "any short digit-free text" fallback
 * of looksLikeHeaderLabel is too eager: a first DATA row of device names or
 * colours ("CT", "RELAY", "GREEN") must never be mistaken for a sub-header.
 */
function looksLikeStrongHeaderLabel(text: string): boolean {
  const l = text.toLowerCase();
  if (!l || l.length > 60) return false;
  if (/\d/.test(text)) return false;
  if (LABEL_KEYWORDS.some(kw => l.includes(kw))) return true;
  return /^(s\.?\s*no|ref|remark|rack|sign|panel|pnl)/i.test(text);
}

/**
 * When Excel merges multi-row headers, xlsx can concatenate sub-headers into one
 * string ("2.5sq mm White1.5sq mm White"). Prefer the primary row label; if only
 * the sub-row has content, use it as-is.
 */
export function resolveHeaderLabel(primary: unknown, sub: unknown): string {
  const p = cleanExcelHeader(primary);
  const s = cleanExcelHeader(sub);
  if (!p && !s) return '';
  if (!p) return s;
  if (!s) return p;
  if (p === s) return p;

  // Concatenated wire specs without a separator — keep the first spec for display/mapping.
  if (looksLikeWireSpec(p) && looksLikeWireSpec(s)) {
    const split = p.match(/^(.*?\d+(?:\.\d+)?\s*sq\s*mm\s+\w+)/i);
    if (split?.[1]) return split[1].trim();
  }
  if (looksLikeHeaderLabel(p) && looksLikeWireSpec(s)) return p;
  if (looksLikeWireSpec(p) && looksLikeHeaderLabel(s)) return s;
  if (looksLikeHeaderLabel(p) && looksLikeHeaderLabel(s)) return `${p} ${s}`.trim();
  return p.length <= s.length ? p : s;
}

export function findHeaderRow(rows: unknown[][]): number {
  for (let i = 0; i < Math.min(20, rows.length); i++) {
    const rowText = (rows[i] as unknown[]).map(c => String(c || '').toLowerCase()).join(' ');
    if (HEADER_KEYWORDS.some(kw => rowText.includes(kw))) return i;
  }
  const idx = rows.findIndex(r => (r as unknown[]).filter(c => String(c || '').trim()).length >= 3);
  return idx === -1 ? 0 : idx;
}

export interface HeaderPair {
  idx: number;
  name: string;
}

/**
 * True when the row immediately below the header row is a wire-spec / label
 * sub-header row (not the first data row). Data rows typically contain ferrule
 * pairs with "/" — sub-header rows do not.
 */
export function isSubHeaderRow(rows: unknown[][], headerRowIdx: number): boolean {
  const sub = (rows[headerRowIdx + 1] || []) as unknown[];
  // Data signatures win outright: a bare number (serial no / terminal) or a
  // "left/right" pair never appears in a label-only sub-header row. This keeps
  // the FIRST data row even when its text cells are short and digit-free.
  if (sub.some(c => /^\d+(?:\.\d+)?$/.test(cleanExcelHeader(c)))) return false;
  if (sub.some(c => String(c || '').includes('/'))) return false;
  // Only strong header evidence counts — wire specs ("2.5sq mm White") or
  // keyword-matched labels — never the generic short-text fallback.
  const headerLikeCount = sub.filter(c => {
    const t = cleanExcelHeader(c);
    return t && (looksLikeWireSpec(t) || looksLikeStrongHeaderLabel(t));
  }).length;
  return headerLikeCount >= 2;
}

/** Build display headers from the detected header row (+ optional sub-header row). */
export function buildHeaderPairs(rows: unknown[][], headerRowIdx: number): HeaderPair[] {
  const primary = rows[headerRowIdx] || [];
  const sub = rows[headerRowIdx + 1] || [];
  const subLooksLikeHeaders = isSubHeaderRow(rows, headerRowIdx);

  const pairs: HeaderPair[] = [];
  const maxCols = Math.max(primary.length, sub.length);
  for (let i = 0; i < maxCols; i++) {
    const name = subLooksLikeHeaders
      ? resolveHeaderLabel((primary as unknown[])[i], (sub as unknown[])[i])
      : cleanExcelHeader((primary as unknown[])[i]);
    if (name) pairs.push({ idx: i, name });
  }
  return pairs;
}

export function scoreSheetHeaders(headers: string[]): number {
  const lower = headers.map(h => h.toLowerCase());
  return SCORE_KEYWORDS.reduce((s, kw) => s + (lower.some(h => h.includes(kw)) ? 1 : 0), 0);
}

/** First data row index — skips a sub-header row when present. */
export function dataStartRow(rows: unknown[][], headerRowIdx: number): number {
  return isSubHeaderRow(rows, headerRowIdx) ? headerRowIdx + 2 : headerRowIdx + 1;
}
