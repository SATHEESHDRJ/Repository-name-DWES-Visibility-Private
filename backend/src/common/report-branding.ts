import * as fs from 'fs';
import * as path from 'path';
import type PDFDocument from 'pdfkit';
import type ExcelJS from 'exceljs';

type PdfDoc = InstanceType<typeof PDFDocument>;

export const REPORT_COMPANY = 'Ingenious Network FZC';
export const REPORT_SYSTEM = 'Digital Wiring Execution System';
export const REPORT_SYSTEM_SHORT = 'DWES';
export const REPORT_LOGO_PDF_HEIGHT = 42;

const CANONICAL_LOGO_REL = path.join('public', 'logo-full.png');
const LEGACY_MIRROR_LOGO_REL = path.join('backend', 'assets', 'report-logo.png');

function resolveFromRoots(relPath: string): string | null {
  const roots = [
    process.cwd(),
    path.join(process.cwd(), '..'),
    path.join(__dirname, '..', '..'),
    path.join(__dirname, '..', '..', '..'),
  ];
  const seen = new Set<string>();
  for (const root of roots) {
    const p = path.normalize(path.join(root, relPath));
    if (seen.has(p)) continue;
    seen.add(p);
    if (fs.existsSync(p)) return p;
  }
  return null;
}

/** Resolve company logo PNG for PDF/Excel embedding (works from backend/ or repo root). */
export function resolveReportLogoPath(): string | null {
  // Brand integrity rule: always prefer the original full company mark.
  const canonical = resolveFromRoots(CANONICAL_LOGO_REL);
  if (canonical) return canonical;

  // Backward-compatible mirror for older runtime paths (same source artwork).
  return resolveFromRoots(LEGACY_MIRROR_LOGO_REL);
}

export function getReportLogoBuffer(): Buffer | null {
  const p = resolveReportLogoPath();
  if (!p) return null;
  try {
    return fs.readFileSync(p);
  } catch {
    return null;
  }
}

export interface PdfHeaderOptions {
  title: string;
  subtitle?: string;
  marginLeft?: number;
  marginTop?: number;
  contentWidth?: number;
  logoHeight?: number;
}

/** Draw logo + title band; returns Y where body content should start. */
export function drawPdfReportHeader(doc: PdfDoc, opts: PdfHeaderOptions): number {
  const left = opts.marginLeft ?? 40;
  const top = opts.marginTop ?? 40;
  const logoH = opts.logoHeight ?? REPORT_LOGO_PDF_HEIGHT;
  const pageW = doc.page.width;
  const right = pageW - left;
  const contentW = opts.contentWidth ?? right - left;

  const logoPath = resolveReportLogoPath();
  let textX = left;
  if (logoPath) {
    try {
      doc.image(logoPath, left, top, { height: logoH });
      textX = left + logoH * 2.6;
    } catch {
      /* fall through to text-only header */
    }
  }

  doc.fontSize(16).font('Helvetica-Bold').fillColor('#1a3a5c')
    .text(opts.title, textX, top + 2, { width: right - textX - 8 });
  doc.fontSize(9).font('Helvetica').fillColor('#64748b')
    .text(opts.subtitle ?? `${REPORT_SYSTEM} · ${REPORT_COMPANY}`, textX, top + 22, { width: right - textX - 8 });

  const ruleY = top + logoH + 10;
  doc.moveTo(left, ruleY).lineTo(left + contentW, ruleY).strokeColor('#e2e8f0').stroke();
  return ruleY + 14;
}

export interface ExcelHeaderOptions {
  title: string;
  subtitle?: string;
  /** Number of columns to merge for the header band (default 14). */
  colCount?: number;
  /** Rows consumed by the branded header block (for shifting data rows). */
  headerRowCount?: number;
}

const NAVY = '0F2557';
const INFO_BG = 'EFF6FF';
const INFO_FG = '1E3A5F';

/**
 * Insert branded header rows at top of worksheet; returns first data row number (1-based).
 * Shifts existing rows down if sheet already has content.
 */
export async function prependExcelReportHeader(
  wb: ExcelJS.Workbook,
  ws: ExcelJS.Worksheet,
  opts: ExcelHeaderOptions,
): Promise<number> {
  const colCount = opts.colCount ?? 14;
  const lastCol = String.fromCharCode(64 + Math.min(colCount, 26));
  const headerRows = opts.headerRowCount ?? 5;
  const shift = ws.rowCount > 0 ? headerRows : 0;

  if (shift > 0) {
    ws.spliceRows(1, 0, ...Array.from({ length: headerRows }, () => []));
  }

  const merge = (rowNum: number) => {
    try { ws.mergeCells(`A${rowNum}:${lastCol}${rowNum}`); } catch { /* already merged */ }
  };

  // Row 1 — logo + company banner
  merge(1);
  ws.getRow(1).height = 52;
  const logoBuf = getReportLogoBuffer();
  if (logoBuf) {
    const imageId = wb.addImage({ buffer: logoBuf as any, extension: 'png' });
    ws.addImage(imageId, {
      tl: { col: 0.15, row: 0.1 },
      ext: { width: 140, height: 40 },
    });
  }
  const r1 = ws.getCell('A1');
  r1.value = logoBuf
    ? `  ${REPORT_SYSTEM_SHORT} — ${REPORT_SYSTEM}`
    : `${REPORT_SYSTEM} — ${REPORT_COMPANY}`;
  r1.font = { bold: true, size: 13, color: { argb: 'FFFFFFFF' } };
  r1.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: NAVY } };
  r1.alignment = { horizontal: 'left', vertical: 'middle', indent: logoBuf ? 12 : 1 };

  // Row 2 — report title
  merge(2);
  ws.getRow(2).height = 26;
  const r2 = ws.getCell('A2');
  r2.value = opts.title;
  r2.font = { bold: true, size: 11, color: { argb: 'FFFFFFFF' } };
  r2.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: '2563EB' } };
  r2.alignment = { horizontal: 'left', vertical: 'middle', indent: 1 };

  // Row 3 — subtitle / company
  merge(3);
  ws.getRow(3).height = 18;
  const r3 = ws.getCell('A3');
  r3.value = opts.subtitle ?? REPORT_COMPANY;
  r3.font = { size: 10, color: { argb: INFO_FG } };
  r3.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: INFO_BG } };
  r3.alignment = { horizontal: 'left', vertical: 'middle', indent: 1 };

  // Row 4 — generated timestamp
  merge(4);
  ws.getRow(4).height = 16;
  const r4 = ws.getCell('A4');
  r4.value = `Generated: ${new Date().toISOString().replace('T', ' ').slice(0, 19)} UTC`;
  r4.font = { size: 9, italic: true, color: { argb: '64748B' } };
  r4.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: INFO_BG } };
  r4.alignment = { horizontal: 'left', vertical: 'middle', indent: 1 };

  // Row 5 — separator
  merge(5);
  ws.getRow(5).height = 6;
  ws.getCell('A5').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'E2E8F0' } };

  return headerRows + 1;
}

/** Branding rows for a fresh SheetJS-style workbook converted to ExcelJS summary sheet. */
export function excelBrandingRowCount(): number {
  return 5;
}
