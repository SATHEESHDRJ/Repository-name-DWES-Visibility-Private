import type PDFDocument from 'pdfkit';
import { REPORT_COMPANY, REPORT_LOGO_PDF_HEIGHT, REPORT_SYSTEM, resolveReportLogoPath } from './report-branding';

type PdfDoc = InstanceType<typeof PDFDocument>;

/* ── Layout foundation ────────────────────────────────────────────────────────
 * Spacing tokens, typography hierarchy, and stateless draw primitives shared by
 * the enterprise report renderer. All primitives are pure: they emit pdfkit
 * operations for the caller and never read or mutate shared positional state, so
 * they compose deterministically and are safe to unit-test in isolation.
 */

/** Vertical/horizontal rhythm. Report blocks step in multiples of these. */
export const SPACING = { SM: 8, MD: 12, LG: 16 } as const;

/** Canonical report font faces (Helvetica family — PDF standard-14, no embed). */
export const REPORT_FONTS = {
  reg: 'Helvetica',
  bold: 'Helvetica-Bold',
  obl: 'Helvetica-Oblique',
} as const;

/** Typography hierarchy. `title` scales down responsively at the call site. */
export const TYPE = {
  title: { font: REPORT_FONTS.bold, size: 26 },
  section: { font: REPORT_FONTS.bold, size: 14 },
  subheader: { font: REPORT_FONTS.bold, size: 8 },
  body: { font: REPORT_FONTS.reg, size: 9 },
  meta: { font: REPORT_FONTS.reg, size: 7.5 },
} as const;

export interface BoxStyle {
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
  radius?: number;
}

/**
 * Filled and/or stroked rectangle (optionally rounded), wrapped in save/restore
 * so it leaves no residual graphics state. Op order mirrors the hand-written
 * pdfkit calls it replaces, keeping rendered output byte-identical.
 */
export function drawBox(doc: PdfDoc, x: number, y: number, w: number, h: number, o: BoxStyle = {}): void {
  doc.save();
  const path = () => ((o.radius && o.radius > 0) ? doc.roundedRect(x, y, w, h, o.radius) : doc.rect(x, y, w, h));
  if (o.fill != null && o.stroke != null) {
    if (o.strokeWidth != null) doc.lineWidth(o.strokeWidth);
    path().fillAndStroke(o.fill, o.stroke);
  } else if (o.fill != null) {
    path().fill(o.fill);
  } else if (o.stroke != null) {
    if (o.strokeWidth != null) doc.lineWidth(o.strokeWidth);
    doc.strokeColor(o.stroke);
    path().stroke();
  }
  doc.restore();
}

export interface TextStyle {
  font: string;
  size: number;
  color: string;
}

/** Set face/size/colour then place text. Mirrors the inline set-then-text idiom. */
export function drawText(
  doc: PdfDoc,
  text: string,
  x: number,
  y: number,
  style: TextStyle,
  options: PDFKit.Mixins.TextOptions = {},
): void {
  doc.font(style.font).fontSize(style.size).fillColor(style.color);
  doc.text(text, x, y, options);
}

export interface DividerStyle {
  color?: string;
  width?: number;
}

/** Horizontal rule between [x1, x2] at y. Restores graphics state afterwards. */
export function drawDivider(doc: PdfDoc, x1: number, x2: number, y: number, o: DividerStyle = {}): void {
  doc.save().lineWidth(o.width ?? 0.75).strokeColor(o.color ?? '#E2E8F0')
    .moveTo(x1, y).lineTo(x2, y).stroke().restore();
}

export interface PdfPageBox {
  left: number;
  right: number;
  top: number;
  bottom: number;
  width: number;
  height: number;
}

export interface PdfPageStyle {
  marginLeft?: number;
  marginRight?: number;
  marginTop?: number;
  marginBottom?: number;
}

export function pageBox(doc: PdfDoc, style: PdfPageStyle = {}): PdfPageBox {
  const left = style.marginLeft ?? 40;
  const right = doc.page.width - (style.marginRight ?? 40);
  const top = style.marginTop ?? 30;
  const bottom = doc.page.height - (style.marginBottom ?? 30);
  return {
    left,
    right,
    top,
    bottom,
    width: right - left,
    height: bottom - top,
  };
}

export interface EnterpriseHeaderOptions {
  title: string;
  subtitle?: string;
  docRef?: string;
  top?: number;
  left?: number;
  right?: number;
  logoHeight?: number;
}

/** Draws the shared enterprise report header. Returns the first body Y position. */
export function drawEnterpriseHeader(doc: PdfDoc, opts: EnterpriseHeaderOptions): number {
  const left = opts.left ?? 40;
  const right = opts.right ?? (doc.page.width - 40);
  const top = opts.top ?? 28;
  const logoH = opts.logoHeight ?? REPORT_LOGO_PDF_HEIGHT;

  let textLeft = left;
  const logoPath = resolveReportLogoPath();
  if (logoPath) {
    try {
      doc.image(logoPath, left, top, { height: logoH });
      textLeft = left + logoH * 2.45;
    } catch {
      textLeft = left;
    }
  }

  doc.font('Helvetica-Bold').fontSize(12.5).fillColor('#0f2557')
    .text(opts.title, textLeft, top + 2, { width: Math.max(0, right - textLeft - 8), lineBreak: false, ellipsis: true });
  doc.font('Helvetica').fontSize(8).fillColor('#475569')
    .text(opts.subtitle ?? `${REPORT_SYSTEM} · ${REPORT_COMPANY}`, textLeft, top + 18, {
      width: Math.max(0, right - textLeft - 8),
      lineBreak: false,
      ellipsis: true,
    });

  if (opts.docRef) {
    doc.font('Helvetica').fontSize(7.5).fillColor('#64748b')
      .text(opts.docRef, right - 220, top + 4, { width: 220, align: 'right', lineBreak: false, ellipsis: true });
  }

  const ruleY = top + logoH + 8;
  doc.moveTo(left, ruleY).lineTo(right, ruleY).lineWidth(0.8).strokeColor('#e2e8f0').stroke();
  return ruleY + 11;
}

export interface EnterpriseFooterOptions {
  pageNumber: number;
  totalPages?: number;
  projectCode?: string;
  generatedAt?: Date;
  left?: number;
  right?: number;
  y?: number;
  confidentialNote?: string;
}

function formatUtcTimestamp(date: Date): string {
  return `${date.toISOString().slice(0, 16).replace('T', ' ')} UTC`;
}

export function drawEnterpriseFooter(doc: PdfDoc, opts: EnterpriseFooterOptions): void {
  const left = opts.left ?? 40;
  const right = opts.right ?? (doc.page.width - 40);
  const y = opts.y ?? (doc.page.height - 30);
  const note = opts.confidentialNote ?? 'Confidential - Management and Client Review Copy';

  doc.moveTo(left, y - 8).lineTo(right, y - 8).lineWidth(0.75).strokeColor('#e2e8f0').stroke();

  doc.font('Helvetica').fontSize(7.5).fillColor('#64748b')
    .text(opts.projectCode ? `Project: ${opts.projectCode.replace(/_/g, ' ')}` : REPORT_COMPANY, left, y - 2, {
      width: 160,
      lineBreak: false,
      ellipsis: true,
    });
  doc.font('Helvetica').fontSize(7.5).fillColor('#64748b')
    .text(note, left, y - 2, {
      width: Math.max(0, right - left),
      align: 'center',
      lineBreak: false,
      ellipsis: true,
    });

  const pageText = opts.totalPages ? `Page ${opts.pageNumber} of ${opts.totalPages}` : `Page ${opts.pageNumber}`;
  doc.font('Helvetica').fontSize(7.5).fillColor('#64748b')
    .text(pageText, right - 120, y - 2, { width: 120, align: 'right', lineBreak: false });

  if (opts.generatedAt) {
    doc.font('Helvetica').fontSize(7).fillColor('#94a3b8')
      .text(`Generated ${formatUtcTimestamp(opts.generatedAt)}`, left, y + 8, {
        width: Math.max(0, right - left),
        align: 'center',
        lineBreak: false,
      });
  }
}
