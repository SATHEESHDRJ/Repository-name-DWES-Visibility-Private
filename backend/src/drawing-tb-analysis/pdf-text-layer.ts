/**
 * Searchable PDF text extraction for TB analysis.
 * Uses pdfjs glyph text (handles character-by-character CAD labels).
 * Never matches raw binary noise inside compressed streams.
 */
import type { Buffer } from 'buffer';
import {
  classifyHeaderView,
  classifyPageView,
  type LiveTbViewClass,
} from './live-tb-view-classification';

export type PdfTextHitKind =
  | 'strip_candidate'
  | 'legend_or_table'
  | 'title_block'
  | 'equipment_label'
  | 'drawing_note'
  | 'unknown';

export type PdfTerminalCell = {
  terminal: string;
  x: number;
  y: number;
  width: number;
  height: number;
  index: number;
};

export type PdfHeaderHit = {
  header: string;
  pageNumber: number;
  kind: PdfTextHitKind;
  viewClassification: LiveTbViewClass;
  geometry: { x: number; y: number; width: number; height: number; rotation: number };
  nearbyCompact: string;
  /** Detected terminal cell boxes near this header (normalized). */
  terminalCells?: PdfTerminalCell[];
  detectedTerminalRange?: string;
};

export type PdfTextLayoutResult = {
  pageCount: number;
  pageTypes: string[];
  pageViews: LiveTbViewClass[];
  compactTextByPage: string[];
  hits: PdfHeaderHit[];
  engine: string;
  notes: string[];
};

type Glyph = { ch: string; x: number; y: number; w: number; h: number };

/** Legacy helper: printable PDF literal strings only (no binary paren spans). */
export function extractPdfLiteralText(buf: Buffer): string {
  const latin = buf.toString('latin1');
  const parts: string[] = [];
  const re = /\((?:\\.|[^\\)]){0,48}\)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(latin))) {
    const raw = m[0].slice(1, -1);
    const decoded = decodePdfLiteral(raw);
    if (isPrintableToken(decoded)) parts.push(decoded);
  }
  return parts.join(' ');
}

function decodePdfLiteral(raw: string): string {
  return raw
    .replace(/\\n/g, '\n')
    .replace(/\\r/g, '\r')
    .replace(/\\t/g, '\t')
    .replace(/\\b/g, '\b')
    .replace(/\\f/g, '\f')
    .replace(/\\\(/g, '(')
    .replace(/\\\)/g, ')')
    .replace(/\\\\/g, '\\')
    .replace(/\\([0-7]{1,3})/g, (_, oct) => String.fromCharCode(parseInt(oct, 8)));
}

function isPrintableToken(s: string): boolean {
  if (!s || s.length > 32) return false;
  return /^[\x20-\x7E]+$/.test(s) && /[A-Za-z0-9]/.test(s);
}

/** Case-insensitive whole-token presence (header boundaries). */
export function textContainsHeader(text: string, header: string): boolean {
  const h = normalizeHeader(header);
  if (!h || !text) return false;
  const compact = String(text).toUpperCase().replace(/\s+/g, '');
  return findHeaderIndexes(compact, h).length > 0;
}

function normalizeHeader(value: string): string {
  return String(value || '')
    .trim()
    .replace(/\s+/g, '')
    .toUpperCase();
}

/**
 * Find header start indexes in compact uppercase text.
 * Digits may not extend the header (X91 ≠ X9) unless a terminal-range follows.
 * Letter glue from CAD cells is allowed (…IGX9TB…); letter continuations that are
 * not legend/type suffixes are rejected (XD2DIODE).
 */
export function findHeaderIndexes(compactUpper: string, header: string): number[] {
  const h = normalizeHeader(header);
  if (!h || !compactUpper) return [];
  const out: number[] = [];
  let from = 0;
  while (from <= compactUpper.length - h.length) {
    const idx = compactUpper.indexOf(h, from);
    if (idx < 0) break;
    if (isValidExpectedHeaderAt(compactUpper, idx, h)) out.push(idx);
    from = idx + h.length;
  }
  return out;
}

export function isValidExpectedHeaderAt(
  compactUpper: string,
  idx: number,
  header: string,
): boolean {
  const h = normalizeHeader(header);
  const prev = compactUpper[idx - 1] || '';
  if (/[0-9]/.test(prev)) return false;
  const rest = compactUpper.slice(idx + h.length);
  if (!rest) return true;
  if (/^[0-9]/.test(rest)) {
    return /^:\d{1,3}([-–—TO]{1,3}\d{1,3})?/.test(rest);
  }
  if (/^[A-Z]/.test(rest)) {
    return /^(TB|TYPE|FEEDTHROUGH|KNIFE|DISCONNECT)/.test(rest);
  }
  return true;
}

/**
 * Classify text around a TB header hit.
 * Legend/title/equipment/notes never become final LIVE TB geometry.
 */
export function classifyHeaderNeighborhood(nearbyAfterHeader: string): PdfTextHitKind {
  const win = String(nearbyAfterHeader || '')
    .toUpperCase()
    .replace(/\s+/g, '');
  if (
    /^(TB-?(FEEDTHROUGH|KNIFE|DISCONNECT|TYPE)|FEEDTHROUGH|KNIFETYPE|DISCONNECTINGTYPE|TYPE-)/.test(
      win,
    )
    || /TB-?(FEEDTHROUGH|KNIFE|DISCONNECT)/.test(win.slice(0, 48))
    || /(FEEDTHROUGH|DISCONNECTING|KNIFETYPE|SPARECIRCUIT)/.test(win.slice(0, 64))
    || /(BILLOFMATERIALS|DEVICEREF|COMPONENTLIST|PARTSLIST)/.test(win.slice(0, 80))
  ) {
    return 'legend_or_table';
  }
  if (/(DRAWINGNO|SHEET|SCALE|TITLEBLOCK|REVISION|REV-?\d|DRG\.?NO)/.test(win.slice(0, 80))) {
    return 'title_block';
  }
  if (/(NOTE:|REMARK|SEEDRAWING|REFERTO|TYPICAL)/.test(win.slice(0, 64))) {
    return 'drawing_note';
  }
  if (/(RELAY|CONTACTOR|MCB|FUSE|TRANSFORMER|METER|PLC|IOMODULE)/.test(win.slice(0, 64))) {
    return 'equipment_label';
  }
  if (/(\d{1,3})[-–—TO]{1,3}(\d{1,3})/.test(win.slice(0, 80))) {
    return 'strip_candidate';
  }
  if (/(?:^|[^0-9])(?:\d{1,2}[^0-9]+){4,}\d{1,2}/.test(win.slice(0, 120))) {
    return 'strip_candidate';
  }
  return 'unknown';
}

/** True when the hit kind may become a physical LIVE TB location. */
export function isPhysicalStripKind(kind: PdfTextHitKind): boolean {
  return kind === 'strip_candidate';
}

export async function extractPdfTextLayout(
  buf: Buffer,
  expectedHeaders: string[],
): Promise<PdfTextLayoutResult> {
  const notes: string[] = [];
  const expected = expectedHeaders.map(normalizeHeader).filter(Boolean);

  let pdfjs: any;
  try {
    pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  } catch (err: any) {
    notes.push(`pdfjs_unavailable:${err?.message || err}`);
    return fallbackLayoutFromLiterals(buf, expected, notes);
  }

  const data = new Uint8Array(buf);
  const doc = await pdfjs
    .getDocument({
      data,
      disableWorker: true,
      isEvalSupported: false,
      useSystemFonts: true,
    })
    .promise;

  const pageCount = doc.numPages || 1;
  const pageTypes: string[] = [];
  const pageViews: LiveTbViewClass[] = [];
  const compactTextByPage: string[] = [];
  const hits: PdfHeaderHit[] = [];

  for (let pageNumber = 1; pageNumber <= pageCount; pageNumber++) {
    const page = await doc.getPage(pageNumber);
    const viewport = page.getViewport({ scale: 1 });
    const tc = await page.getTextContent();
    const glyphs = glyphsFromTextContent(tc.items || []);
    const { compact, map } = compactFromGlyphs(glyphs);
    compactTextByPage.push(compact);
    pageTypes.push(compact.trim() ? 'SEARCHABLE_PDF' : 'VECTOR_PDF_WITHOUT_TEXT');
    const pageView = classifyPageView(compact);
    pageViews.push(pageView);

    for (const header of expected) {
      const indexes = findHeaderIndexes(compact, header);
      for (const idx of indexes) {
        const start = map[idx];
        const end = map[idx + header.length - 1];
        if (start == null || end == null) continue;
        const slice = glyphs.slice(start, end + 1);
        if (!slice.length) continue;
        const geometry = normalizeGlyphBox(slice, viewport.width, viewport.height);
        const nearby = compact.slice(idx, idx + header.length + 64);
        const kind = classifyHeaderNeighborhood(
          compact.slice(idx + header.length, idx + header.length + 64),
        );
        const viewClassification = classifyHeaderView({
          pageView,
          neighborhoodKind: kind,
          nearbyCompact: nearby,
        });
        const terminalCells = extractTerminalCellsNearHeader(
          glyphs,
          map,
          idx,
          header.length,
          viewport.width,
          viewport.height,
        );
        const termRange = findTerminalRangeNearHeader(compact, header);
        hits.push({
          header,
          pageNumber,
          kind,
          viewClassification,
          geometry,
          nearbyCompact: nearby,
          terminalCells,
          detectedTerminalRange: termRange.found ? termRange.range : undefined,
        });
      }
    }
  }

  notes.push('pdfjs_text_layout');
  if (!compactTextByPage.some((t) => t.trim())) {
    notes.push('no_pdf_text_glyphs');
    notes.push('ocr_worker_required_for_scanned_or_outlined_labels');
  }

  // #region agent log
  try {
    const { agentDebugLog } = require('./live-tb-debug');
    const focus = ['X9', 'X321'];
    const focusHits = hits
      .filter((h) => focus.includes(String(h.header).toUpperCase()))
      .map((h) => ({
        header: h.header,
        page: h.pageNumber,
        kind: h.kind,
        view: h.viewClassification,
        cells: (h.terminalCells || []).length,
        cellTerms: (h.terminalCells || []).slice(0, 12).map((c) => c.terminal),
        range: h.detectedTerminalRange || null,
        nearby: String(h.nearbyCompact || '').slice(0, 80),
        box: {
          w: Number(h.geometry?.width || 0),
          h: Number(h.geometry?.height || 0),
        },
      }));
    agentDebugLog(
      'pdf-text-layer.ts:extractPdfTextLayout',
      'PDF layout pageViews + X9/X321 hits',
      {
        pageCount,
        pageViews,
        pageTypes,
        hitCount: hits.length,
        focusHits,
        x321Absent: !hits.some((h) => String(h.header).toUpperCase() === 'X321'),
        x9HitCount: hits.filter((h) => String(h.header).toUpperCase() === 'X9').length,
        rearTokenSample: compactTextByPage.map((t) => ({
          hasRear: /REAR|INTERNAL|WIRING|TERMINAL/.test(t),
          hasFront: /FRONTVIEW|FRONTELEVATION|RACK/.test(t),
          hasLegend: /BILLOFMATERIALS|FEEDTHROUGH|PARTSLIST/.test(t),
          len: t.length,
        })),
      },
      'A,B,C,D',
    );
  } catch {
    /* ignore */
  }
  // #endregion

  return {
    pageCount,
    pageTypes,
    pageViews,
    compactTextByPage,
    hits,
    engine: 'pdfjs-text-layout',
    notes,
  };
}

function glyphsFromTextContent(items: any[]): Glyph[] {
  const glyphs: Glyph[] = [];
  for (const it of items) {
    const str = String(it?.str || '');
    if (!str) continue;
    const tx = it.transform || [1, 0, 0, 1, 0, 0];
    const x = Number(tx[4]) || 0;
    const y = Number(tx[5]) || 0;
    const w = typeof it.width === 'number' ? it.width : 0;
    const h = Math.abs(Number(tx[3]) || Number(tx[0]) || 8);
    for (let i = 0; i < str.length; i++) {
      glyphs.push({
        ch: str[i],
        x: x + (str.length ? (w * i) / str.length : 0),
        y,
        w: str.length ? w / str.length : w,
        h,
      });
    }
  }
  return glyphs;
}

function compactFromGlyphs(glyphs: Glyph[]): { compact: string; map: number[] } {
  const map: number[] = [];
  let compact = '';
  for (let i = 0; i < glyphs.length; i++) {
    const ch = glyphs[i].ch;
    if (/\s/.test(ch)) continue;
    compact += ch.toUpperCase();
    map.push(i);
  }
  return { compact, map };
}

function normalizeGlyphBox(
  slice: Glyph[],
  pageWidth: number,
  pageHeight: number,
): { x: number; y: number; width: number; height: number; rotation: number } {
  const minX = Math.min(...slice.map((g) => g.x));
  const maxX = Math.max(...slice.map((g) => g.x + Math.max(g.w, 0.1)));
  const minY = Math.min(...slice.map((g) => g.y));
  const maxY = Math.max(...slice.map((g) => g.y + Math.max(g.h, 0.1)));
  const pw = pageWidth || 1;
  const ph = pageHeight || 1;
  const nx = minX / pw;
  const ny = 1 - maxY / ph;
  const nw = (maxX - minX) / pw;
  const nh = (maxY - minY) / ph;
  const padX = 0.012;
  const padY = 0.01;
  return {
    x: clamp01(nx - padX),
    y: clamp01(ny - padY),
    width: clamp01(nw + padX * 2),
    height: clamp01(nh + padY * 2),
    rotation: 0,
  };
}

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

function fallbackLayoutFromLiterals(
  buf: Buffer,
  expected: string[],
  notes: string[],
): PdfTextLayoutResult {
  const text = extractPdfLiteralText(buf);
  const compact = text.toUpperCase().replace(/\s+/g, '');
  const pageView = classifyPageView(compact);
  const hits: PdfHeaderHit[] = [];
  for (const header of expected) {
    for (const idx of findHeaderIndexes(compact, header)) {
      const kind = classifyHeaderNeighborhood(
        compact.slice(idx + header.length, idx + header.length + 64),
      );
      const nearby = compact.slice(idx, idx + header.length + 64);
      hits.push({
        header,
        pageNumber: 1,
        kind,
        viewClassification: classifyHeaderView({
          pageView,
          neighborhoodKind: kind,
          nearbyCompact: nearby,
        }),
        geometry: { x: 0, y: 0, width: 0, height: 0, rotation: 0 },
        nearbyCompact: nearby,
        terminalCells: [],
      });
    }
  }
  notes.push('literal_printable_fallback');
  return {
    pageCount: 1,
    pageTypes: [compact ? 'SEARCHABLE_PDF' : 'VECTOR_PDF_WITHOUT_TEXT'],
    pageViews: [pageView],
    compactTextByPage: [compact],
    hits,
    engine: 'literal-printable-fallback',
    notes,
  };
}

/**
 * Collect numeric terminal labels near a header and build normalized cell boxes.
 * Uses glyph clusters of 1–3 digits within a spatial window of the header.
 */
export function extractTerminalCellsNearHeader(
  glyphs: Glyph[],
  map: number[],
  headerCompactIdx: number,
  headerLen: number,
  pageWidth: number,
  pageHeight: number,
): PdfTerminalCell[] {
  const startG = map[headerCompactIdx];
  const endG = map[headerCompactIdx + Math.max(headerLen, 1) - 1];
  if (startG == null || endG == null) return [];
  const headerSlice = glyphs.slice(startG, endG + 1);
  if (!headerSlice.length) return [];
  const hx = headerSlice.reduce((s, g) => s + g.x, 0) / headerSlice.length;
  const hy = headerSlice.reduce((s, g) => s + g.y, 0) / headerSlice.length;
  const pw = pageWidth || 1;
  const ph = pageHeight || 1;

  // Spatial window: below/ beside header — ~35% page height, ~18% width
  const maxDx = pw * 0.18;
  const maxDy = ph * 0.4;

  type NumHit = { terminal: string; glyphs: Glyph[]; y: number; x: number };
  const nums: NumHit[] = [];
  let i = 0;
  while (i < glyphs.length) {
    if (!/[0-9]/.test(glyphs[i].ch)) {
      i += 1;
      continue;
    }
    const run: Glyph[] = [];
    let j = i;
    while (j < glyphs.length && /[0-9]/.test(glyphs[j].ch) && run.length < 3) {
      run.push(glyphs[j]);
      j += 1;
    }
    // skip if glued to letters (part of X321 etc.)
    const prev = glyphs[i - 1]?.ch || '';
    const next = glyphs[j]?.ch || '';
    if (/[A-Za-z]/.test(prev) || /[A-Za-z]/.test(next)) {
      i = j;
      continue;
    }
    const term = run.map((g) => g.ch).join('');
    const n = Number(term);
    if (!Number.isFinite(n) || n < 1 || n > 199) {
      i = j;
      continue;
    }
    const cx = run.reduce((s, g) => s + g.x, 0) / run.length;
    const cy = run.reduce((s, g) => s + g.y, 0) / run.length;
    if (Math.abs(cx - hx) > maxDx || Math.abs(cy - hy) > maxDy) {
      i = j;
      continue;
    }
    // Prefer numbers below or beside header (not far above title)
    nums.push({ terminal: String(n), glyphs: run, y: cy, x: cx });
    i = j;
  }

  // Dedupe by terminal keeping closest to header
  const best = new Map<string, NumHit>();
  for (const hit of nums) {
    const dist = Math.hypot(hit.x - hx, hit.y - hy);
    const prev = best.get(hit.terminal);
    if (!prev) {
      best.set(hit.terminal, hit);
      continue;
    }
    const prevDist = Math.hypot(prev.x - hx, prev.y - hy);
    if (dist < prevDist) best.set(hit.terminal, hit);
  }

  const ordered = [...best.values()].sort((a, b) => b.y - a.y || a.x - b.x);
  const cells: PdfTerminalCell[] = [];
  for (let idx = 0; idx < ordered.length; idx++) {
    const hit = ordered[idx];
    const box = normalizeGlyphBox(hit.glyphs, pw, ph);
    // Slightly enlarge to cover terminal cell
    const padX = 0.008;
    const padY = 0.006;
    cells.push({
      terminal: hit.terminal,
      x: clamp01(box.x - padX),
      y: clamp01(box.y - padY),
      width: clamp01(box.width + padX * 2),
      height: clamp01(box.height + padY * 2),
      index: idx,
    });
  }
  return cells;
}

/** Find a real terminal range near a header; never pretends 1-12 was detected. */
export function findTerminalRangeNearHeader(
  compactUpper: string,
  header: string,
): { range: string; found: boolean } {
  const indexes = findHeaderIndexes(compactUpper, header);
  for (const idx of indexes) {
    const win = compactUpper.slice(idx, idx + 120);
    const m = win.match(/(\d{1,3})[-–—TO]{1,3}(\d{1,3})/);
    if (!m) continue;
    const a = Number(m[1]);
    const b = Number(m[2]);
    if (Number.isFinite(a) && Number.isFinite(b) && b >= a && b - a < 200) {
      return { range: `${a}-${b}`, found: true };
    }
  }
  return { range: '', found: false };
}
