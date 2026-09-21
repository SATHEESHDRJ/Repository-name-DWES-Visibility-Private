/**
 * report-pdf.ts — enterprise Project Completion Report (PDF).
 *
 * Pure, DB-free renderer: takes already-collected ReportData and returns a Buffer.
 * projects.service.ts collects the data (project + panels + resolved cables) and
 * calls buildProjectReportPdf(). Keeping this pure makes it unit-testable and lets
 * a sample be rendered from mock data without touching WiringSchemeDB.
 *
 * Design: "Executive Review Dossier" — navy #0F2557 brand spine, single blue accent,
 * hero KPI band, ruled+zebra tables, status/review chips, running header/footer with
 * "Page X of Y", approval/sign-off page. See the synthesized design spec.
 */
import * as PDFDocument from 'pdfkit';
import { assignedCableKpiPercent } from './kpi.constants';
import {
  resolveReportLogoPath,
  REPORT_COMPANY,
  REPORT_SYSTEM,
  REPORT_SYSTEM_SHORT,
  REPORT_LOGO_PDF_HEIGHT,
} from './report-branding';
import {
  drawEnterpriseFooter,
  drawEnterpriseHeader,
  drawBox,
  drawText,
  drawDivider,
  SPACING,
  TYPE,
  REPORT_FONTS,
} from './pdf-report-layout';

/* ── Public data contract ─────────────────────────────────────────────────── */
export type CableStatus = 'done' | 'partial' | 'pending';

export interface ReportCable {
  source: string;
  destination: string;
  status: CableStatus;
  ferrule?: string;
  size?: string;
  color?: string;
}

export interface ReportPanel {
  frameId?: string;
  panelName: string;
  technicianName: string;
  technicianUsername?: string;
  status: string;            // raw enum: completed | in_progress | assigned | paused | not_started …
  reviewStatus: string;      // raw enum: approved | ready_for_qc | pending | rejected …
  reviewNotes?: string;
  cablesTotal: number;
  cablesSrcDone: number;
  cablesDstDone: number;
  kpi: number;               // percent, already rounded to 1 decimal
  wiringSeconds: number;
  assignedAt?: string | Date | null;
  startedAt?: string | Date | null;
  pausedAt?: string | Date | null;
  completedAt?: string | Date | null;
  reviewedAt?: string | Date | null;
  approvedAt?: string | Date | null;
  reportSubmittedAt?: string | Date | null;
  reviewerName?: string;
  approverName?: string;
  inspectionResult?: string;
  inspectorName?: string;
  pauseReason?: string;
  supervisorApproved?: boolean;
  cables: ReportCable[] | null;  // null = frame/schedule unavailable; [] = none recorded
}

export interface ReportProject {
  code: string;
  client?: string | null;
  name?: string | null;
  description?: string | null;
  projectState?: string | null;
  createdAt?: string | Date | null;
}

export interface ReportData {
  project: ReportProject;
  panels: ReportPanel[];
  generatedBy: string;
  generatedAt: Date;
}

/* ── Palette (matches report-branding.ts brand constants) ─────────────────── */
const C = {
  navy: '#0F2557', navy700: '#1A3A5C', accent: '#2563EB', blue50: '#EFF6FF',
  ink: '#0F172A', slate500: '#64748B', slate400: '#94A3B8', slate300: '#CBD5E1',
  zebra: '#F1F5F9', border: '#E2E8F0', white: '#FFFFFF',
  success: '#15803D', successBg: '#DCFCE7',
  amber: '#B45309', amberBg: '#FEF3C7',
  rose: '#B91C1C', roseBg: '#FEE2E2',
  approved: '#1D4ED8', approvedBg: '#E8EEFC',
  neutral: '#475569', neutralBg: '#EEF1F5',
};

const F = REPORT_FONTS;

/* ── Page geometry ────────────────────────────────────────────────────────── */
const PAGE_W = 595.28;
const CL = 40, CR = 555, CW = 515;
const BODY_TOP = 56, PAGE_BOTTOM = 786;

/* ── Small pure helpers ───────────────────────────────────────────────────── */
function titleize(s: string): string {
  return (s || '').replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}
function formatDuration(sec: number): string {
  const s = Math.max(0, Math.floor(sec || 0));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}
function fmtDate(d?: string | Date | null): string {
  if (!d) return '—';
  const dt = typeof d === 'string' ? new Date(d) : d;
  if (isNaN(dt.getTime())) return String(d);
  const mon = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][dt.getUTCMonth()];
  return `${String(dt.getUTCDate()).padStart(2, '0')} ${mon} ${dt.getUTCFullYear()}`;
}
function fmtDateTimeUTC(d: Date): string {
  return `${d.toISOString().slice(0, 16).replace('T', ' ')} UTC`;
}
function fmtKpi(v: number): string {
  const r = Math.round((v || 0) * 10) / 10;
  return `${Number.isInteger(r) ? r : r.toFixed(1)}%`;
}
function kpiColor(v: number): string {
  return v >= 90 ? C.success : v >= 50 ? C.amber : C.rose;
}
function statusChip(raw: string): { label: string; fill: string; text: string } {
  switch ((raw || '').toLowerCase()) {
    case 'completed': return { label: 'COMPLETED', fill: C.successBg, text: C.success };
    case 'in_progress': return { label: 'IN PROGRESS', fill: C.amberBg, text: C.amber };
    case 'assigned':
    case 'not_started': return { label: 'ASSIGNED', fill: C.neutralBg, text: C.neutral };
    case 'paused': return { label: 'PAUSED', fill: C.neutralBg, text: C.neutral };
    default: return { label: titleize(raw) || '—', fill: C.neutralBg, text: C.neutral };
  }
}
function qaChip(raw: string): { label: 'PASS' | 'FAIL' | 'REVIEW'; fill: string; text: string } {
  const v = (raw || '').toLowerCase();
  if (v === 'approved' || v === 'verified' || v === 'pass') {
    return { label: 'PASS', fill: C.successBg, text: C.success };
  }
  if (v === 'rejected' || v === 'fail' || v === 'failed') {
    return { label: 'FAIL', fill: C.roseBg, text: C.rose };
  }
  return { label: 'REVIEW', fill: C.amberBg, text: C.amber };
}
function overallStatus(overallKpi: number, passCount: number, failCount: number, panelCount: number): { label: string; fill: string; text: string } {
  if (panelCount <= 0) return { label: 'NO DATA', fill: C.neutralBg, text: C.neutral };
  if (failCount > 0) return { label: 'ACTION REQUIRED', fill: C.roseBg, text: C.rose };
  if (passCount === panelCount && overallKpi >= 95) return { label: 'ON TRACK', fill: C.successBg, text: C.success };
  return { label: 'UNDER REVIEW', fill: C.amberBg, text: C.amber };
}
function cableChip(s: CableStatus): { label: string; fill: string; text: string } {
  if (s === 'done') return { label: 'DONE', fill: C.successBg, text: C.success };
  if (s === 'partial') return { label: 'PARTIAL', fill: C.amberBg, text: C.amber };
  return { label: 'PENDING', fill: C.roseBg, text: C.rose };
}

// Wire-colour name → swatch hex (for the cable table colour column).
const COLOR_SWATCH: Record<string, string> = {
  grey: '#9CA3AF', gray: '#9CA3AF', blue: '#2563EB', red: '#DC2626',
  green: '#16A34A', yellow: '#EAB308', black: '#1F2937', white: '#F1F5F9',
  brown: '#92400E', orange: '#EA580C', violet: '#7C3AED', purple: '#9333EA',
  pink: '#DB2777', gold: '#CA8A04', silver: '#CBD5E1',
};
function colorHex(name?: string): string | null {
  const n = (name || '').toLowerCase();
  for (const [key, hex] of Object.entries(COLOR_SWATCH)) if (n.includes(key)) return hex;
  return null;
}

interface Col { header: string; pct: number; align: 'left' | 'center' | 'right'; x: number; w: number }
function makeCols(defs: { header: string; pct: number; align: 'left' | 'center' | 'right' }[]): Col[] {
  let x = CL;
  return defs.map((d) => { const w = (d.pct / 100) * CW; const c: Col = { ...d, x, w }; x += w; return c; });
}

/* ── Renderer ─────────────────────────────────────────────────────────────── */
export function buildProjectReportPdf(data: ReportData): Promise<Buffer> {
  const { project, panels, generatedBy, generatedAt } = data;

  // ── Canonical totals (computed ONCE) ──
  let totalCables = 0, sumSrc = 0, sumDst = 0, totalWiring = 0;
  let doneCables = 0, partialCables = 0, pendingCables = 0;
  let completedCount = 0, approvedCount = 0, forQcCount = 0, rejectedCount = 0;
  for (const p of panels) {
    totalCables += p.cablesTotal || 0;
    sumSrc += p.cablesSrcDone || 0;
    sumDst += p.cablesDstDone || 0;
    totalWiring += p.wiringSeconds || 0;
    if ((p.status || '').toLowerCase() === 'completed') completedCount++;
    const rv = (p.reviewStatus || '').toLowerCase();
    if (rv === 'approved' || rv === 'verified') approvedCount++;
    if (rv === 'ready_for_qc') forQcCount++;
    if (rv === 'rejected') rejectedCount++;
    if (Array.isArray(p.cables) && p.cables.length) {
      for (const c of p.cables) {
        if (c.status === 'done') doneCables++;
        else if (c.status === 'partial') partialCables++;
        else pendingCables++;
      }
    } else {
      pendingCables += p.cablesTotal || 0; // unresolved schedule → counted pending
    }
  }
  const overallKpi = assignedCableKpiPercent(doneCables, totalCables);

  const docNo = `DWES-PCR-${project.code.replace(/[^A-Za-z0-9]/g, '').toUpperCase()}-${generatedAt.toISOString().slice(0, 10).replace(/-/g, '')}`;
  const issueDate = fmtDate(generatedAt);
  const genBy = generatedBy || '—';

  const doc = new PDFDocument({
    size: 'A4', margin: 0, bufferPages: true,
    info: { Title: `Project Completion Report — ${project.code}`, Author: `${REPORT_SYSTEM_SHORT} — ${REPORT_COMPANY}` },
  });
  const chunks: Buffer[] = [];
  doc.on('data', (c: Buffer) => chunks.push(c));
  const done = new Promise<Buffer>((resolve, reject) => {
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });

  /* ── Stateful draw helpers (reset font/colour every op — pdfkit is stateful) ── */
  const setText = (font: string, size: number, hex: string) => { doc.font(font).fontSize(size).fillColor(hex); };
  const hr = (x1: number, x2: number, y: number, hex = C.border, w = 0.75) =>
    drawDivider(doc, x1, x2, y, { color: hex, width: w });
  const kicker = (text: string, x: number, y: number) =>
    drawText(doc, text.toUpperCase(), x, y, { ...TYPE.subheader, color: C.accent }, { characterSpacing: 1.2, lineBreak: false });
  const sectionHead = (kick: string, heading: string, x: number, y: number) => {
    kicker(kick, x, y);
    drawText(doc, heading, x, y + SPACING.MD, { ...TYPE.section, color: C.navy }, { lineBreak: false });
    return y + SPACING.MD + 20;
  };
  // Rounded status pill, horizontally centred inside [x, x+colW]; clamped to column.
  const chip = (x: number, y: number, colW: number, label: string, fillHex: string, textHex: string) => {
    setText(F.bold, 7.5, textHex);
    const tw = doc.widthOfString(label);
    const chipW = Math.min(tw + 14, colW - 4);
    const chipX = x + (colW - chipW) / 2;
    drawBox(doc, chipX, y, chipW, 15, { fill: fillHex, radius: 7.5 });
    drawText(doc, label, chipX, y + 3.4, { font: F.bold, size: 7.5, color: textHex }, { width: chipW, align: 'center', lineBreak: false, ellipsis: true });
    return chipW;
  };
  const truncate = (text: string, maxW: number, font: string, size: number) => {
    setText(font, size, C.ink);
    if (doc.widthOfString(text) <= maxW) return text;
    let t = text;
    while (t.length > 1 && doc.widthOfString(t + '…') > maxW) t = t.slice(0, -1);
    return t + '…';
  };

  /* ── Running header + footer (drawn in the buffered pass) ── */
  const drawRunningHeader = () => {
    drawEnterpriseHeader(doc, {
      title: 'Project Completion Report',
      subtitle: `${REPORT_SYSTEM} · ${REPORT_COMPANY}`,
      docRef: docNo,
      left: CL,
      right: CR,
      top: 24,
      logoHeight: 18,
    });
  };
  const drawFooter = (pageNum: number, totalPages: number) => {
    drawEnterpriseFooter(doc, {
      pageNumber: pageNum,
      totalPages,
      projectCode: project.code,
      generatedAt,
      left: CL,
      right: CR,
      y: 814,
    });
  };

  /* ── Generic ruled/zebra table engine ── */
  interface TableSpec {
    startY: number;
    cols: Col[];
    headerH: number;
    count: number;
    measure: (i: number) => number;
    drawRow: (i: number, y: number, h: number) => void;
    zebraOffset?: number;                       // parity offset (default 0)
    continuationCaption?: string;               // oblique caption above repeated header
    totalsRow?: { height: number; draw: (y: number) => void };
  }
  const renderTable = (spec: TableSpec): number => {
    let y = spec.startY;
    let segTop = y;
    const drawOuter = (top: number, bottom: number) =>
      drawBox(doc, CL, top, CW, bottom - top, { stroke: C.border, strokeWidth: 0.75 });
    const drawBand = (withCaption: boolean) => {
      if (withCaption && spec.continuationCaption) {
        drawText(doc, spec.continuationCaption, CL, y, { font: F.obl, size: 7, color: C.slate500 }, { lineBreak: false });
        y += SPACING.MD;
      }
      drawBox(doc, CL, y, CW, spec.headerH, { fill: C.navy });
      setText(F.bold, 8, C.white);
      for (const c of spec.cols) {
        const pad = 5;
        const tx = c.align === 'left' ? c.x + pad : c.x;
        const tw = c.align === 'center' ? c.w : c.w - pad;
        doc.text(c.header, tx, y + (spec.headerH - 8) / 2 - 0.5, { width: tw, align: c.align, lineBreak: false, ellipsis: true });
      }
      segTop = y;
      y += spec.headerH;
    };
    // Never paint the header band below the printable area: if even the band + first
    // row won't fit at startY (e.g. pushed down by a tall preceding block), break first.
    if (spec.count > 0) {
      const firstRowH = spec.measure(0);
      if (y + spec.headerH + firstRowH > PAGE_BOTTOM) { doc.addPage(); y = BODY_TOP; }
    }
    drawBand(false);
    const drawSeparators = (top: number, h: number) => {
      for (let k = 1; k < spec.cols.length; k++) {
        const bx = spec.cols[k].x;
        doc.save().lineWidth(0.5).strokeColor(C.border).moveTo(bx, top).lineTo(bx, top + h).stroke().restore();
      }
    };
    for (let i = 0; i < spec.count; i++) {
      const h = spec.measure(i);
      if (y + h > PAGE_BOTTOM) {
        drawOuter(segTop, y);
        doc.addPage();
        y = BODY_TOP;
        drawBand(true);
      }
      if ((i + (spec.zebraOffset || 0)) % 2 === 1) {
        drawBox(doc, CL, y, CW, h, { fill: C.zebra });
      }
      spec.drawRow(i, y, h);
      hr(CL, CR, y + h, C.border, 0.5);
      drawSeparators(y, h);
      y += h;
    }
    if (spec.totalsRow) {
      const h = spec.totalsRow.height;
      if (y + h > PAGE_BOTTOM) { drawOuter(segTop, y); doc.addPage(); y = BODY_TOP; drawBand(true); }
      drawBox(doc, CL, y, CW, h, { fill: C.zebra });
      spec.totalsRow.draw(y);
      hr(CL, CR, y + h, C.border, 0.5);
      drawSeparators(y, h);
      y += h;
    }
    drawOuter(segTop, y);
    return y;
  };

  // Cell text with vertical alignment inside a row of height rowH.
  const cell = (
    str: string, col: Col, y: number, rowH: number,
    o: { font?: string; size?: number; hex?: string; valign?: 'middle' | 'top' } = {},
  ) => {
    const font = o.font || F.reg, size = o.size ?? 8.5, hex = o.hex || C.ink, valign = o.valign || 'middle';
    const style = { font, size, color: hex };
    const pad = 5;
    const tx = col.align === 'left' ? col.x + pad : col.x;
    const tw = col.align === 'center' ? col.w : col.w - pad;
    if (valign === 'top') {
      drawText(doc, str, tx, y + 4, style, { width: tw, align: col.align, ellipsis: false });
    } else {
      drawText(doc, str, tx, y + (rowH - size) / 2 - 0.5, style, { width: tw, align: col.align, lineBreak: false, ellipsis: true });
    }
  };
  // Right-aligned "done/total" with a faint denominator.
  const fraction = (col: Col, y: number, rowH: number, num: number, den: number) => {
    const s1 = String(num), s2 = `/${den}`;
    setText(F.reg, 8.5, C.ink); const w1 = doc.widthOfString(s1);
    setText(F.reg, 8.5, C.slate300); const w2 = doc.widthOfString(s2);
    const startX = Math.max(col.x + 5, col.x + col.w - 5 - (w1 + w2));
    const ty = y + (rowH - 8.5) / 2 - 0.5;
    drawText(doc, s1, startX, ty, { font: F.reg, size: 8.5, color: C.ink }, { lineBreak: false });
    drawText(doc, s2, startX + w1, ty, { font: F.reg, size: 8.5, color: C.slate300 }, { lineBreak: false });
  };
  // Cable-colour cell: optional swatch square + colour name.
  const colorCell = (name: string | undefined, col: Col, y: number, rowH: number) => {
    const hex = colorHex(name);
    let tx = col.x + 5;
    if (hex) {
      drawBox(doc, col.x + 5, y + (rowH - 8) / 2, 8, 8, { fill: hex, stroke: C.slate300, radius: 1.5 });
      tx = col.x + 5 + 12;
    }
    drawText(doc, name && name.trim() ? name : '—', tx, y + (rowH - 8) / 2 - 0.5, { font: F.reg, size: 8, color: C.ink }, { width: col.x + col.w - tx - 2, lineBreak: false, ellipsis: true });
  };

  /* ══════════════════════════════════ COVER ══════════════════════════════════ */
  // Navy brand band
  const logoPath = resolveReportLogoPath();
  drawBox(doc, 0, 0, PAGE_W, 118, { fill: C.navy });
  const coverLogoH = REPORT_LOGO_PDF_HEIGHT;
  let logoOk = false;
  if (logoPath) {
    try { doc.image(logoPath, 40, 40, { height: coverLogoH }); logoOk = true; } catch { logoOk = false; }
  }
  if (!logoOk) { setText(F.bold, 18, C.white); doc.text(REPORT_SYSTEM_SHORT, 40, 48, { lineBreak: false }); }
  const brandTextX = logoOk ? 40 + coverLogoH * 1.9 + 12 : 40 + 60;
  setText(F.bold, 10, C.white);
  doc.text(REPORT_COMPANY, brandTextX, 52, { lineBreak: false });
  doc.save().fillOpacity(0.8);
  setText(F.reg, 8, C.white); doc.fillOpacity(0.8);
  doc.text(REPORT_SYSTEM, brandTextX, 66, { lineBreak: false });
  doc.restore();
  doc.save().fillOpacity(0.85);
  setText(F.bold, 8.5, C.white); doc.fillOpacity(0.85);
  doc.text(docNo, CR - 240, 48, { width: 240, align: 'right', lineBreak: false });
  doc.restore();

  // Title block
  kicker('Project Completion Report', 40, 148);
  const titleStr = project.name || project.code.replace(/_/g, ' ');
  let titleSize = 26;
  setText(F.bold, titleSize, C.navy);
  if (doc.heightOfString(titleStr, { width: CW }) > titleSize * 1.4) { titleSize = 21; }
  setText(F.bold, titleSize, C.navy);
  if (doc.heightOfString(titleStr, { width: CW }) > titleSize * 2.6) { titleSize = 18; }
  setText(F.bold, titleSize, C.navy);
  const titleH = doc.heightOfString(titleStr, { width: CW });
  doc.text(titleStr, 40, 164, { width: CW });
  const titleBottom = 164 + titleH;
  setText(F.reg, 12, C.slate500);
  doc.text(`${project.code.replace(/_/g, ' ')}  ·  ${project.client || '—'}`, 40, titleBottom + 8, { width: CW, lineBreak: false, ellipsis: true });
  drawDivider(doc, 40, 180, titleBottom + 30, { color: C.accent, width: 3 });

  // Hero KPI band
  const cardsY = Math.max(232, titleBottom + 44);
  const gutter = 12, cardW = (CW - 3 * gutter) / 4, cardH = 76;
  const drawCard = (idx: number, opts: { value: string; label: string; sub?: string; hero?: boolean; valueHex?: string; pct?: number }) => {
    const x = CL + idx * (cardW + gutter);
    if (opts.hero) {
      drawBox(doc, x, cardsY, cardW, cardH, { fill: C.accent, radius: 6 });
    } else {
      drawBox(doc, x, cardsY, cardW, cardH, { fill: C.blue50, radius: 6 });
      drawBox(doc, x, cardsY, cardW, cardH, { stroke: C.slate300, strokeWidth: 0.75, radius: 6 });
    }
    let vs = 22;
    const vhex = opts.hero ? C.white : (opts.valueHex || C.navy);
    setText(F.bold, vs, vhex);
    while (doc.widthOfString(opts.value) > cardW - 16 && vs > 14) { vs -= 1; setText(F.bold, vs, vhex); }
    const vw = doc.widthOfString(opts.value);
    doc.text(opts.value, x + (cardW - vw) / 2, cardsY + 16, { lineBreak: false });
    // label
    if (opts.hero) { doc.save().fillOpacity(0.85); setText(F.reg, 7.5, C.white); doc.fillOpacity(0.85); }
    else setText(F.reg, 7.5, C.slate500);
    doc.text(opts.label, x, cardsY + 46, { width: cardW, align: 'center', characterSpacing: 0.6, lineBreak: false });
    if (opts.hero) doc.restore();
    if (opts.hero && typeof opts.pct === 'number') {
      const tx = x + 8, tw = cardW - 16, ty = cardsY + 62, th = 4;
      doc.save().fillOpacity(0.3).roundedRect(tx, ty, tw, th, 2).fill(C.white).restore();
      const fw = tw * Math.max(0, Math.min(100, opts.pct)) / 100;
      if (fw > 0.5) doc.save().roundedRect(tx, ty, fw, th, 2).fill(C.white).restore();
    } else if (opts.sub) {
      drawText(doc, opts.sub, x, cardsY + 60, { font: F.reg, size: 7, color: C.slate400 }, { width: cardW, align: 'center', lineBreak: false, ellipsis: true });
    }
  };
  const heroVal = panels.length ? `${Math.round(overallKpi)}%` : '—';
  drawCard(0, { value: heroVal, label: 'OVERALL COMPLETION', hero: true, pct: overallKpi });
  drawCard(1, { value: String(panels.length), label: 'PANELS', sub: `${completedCount} of ${panels.length} completed` });
  drawCard(2, { value: String(totalCables), label: 'CABLES', sub: `${doneCables} done` });
  drawCard(3, { value: formatDuration(totalWiring), label: 'WIRING TIME', sub: 'total recorded' });

  // Prominent overall status indicator for management review.
  const o = overallStatus(overallKpi, approvedCount, rejectedCount, panels.length);
  const statusW = 210;
  const statusH = 28;
  const statusX = CR - statusW;
  const statusY = cardsY - 38;
  drawBox(doc, statusX, statusY, statusW, statusH, { fill: o.fill, radius: 6 });
  drawText(doc, `OVERALL STATUS  ${o.label}`, statusX, statusY + 9, { font: F.bold, size: 9, color: o.text }, { width: statusW, align: 'center', lineBreak: false, ellipsis: true });

  // Document-control grid
  const gridY = cardsY + cardH + 24;
  const keyW = 150, valW = CW - keyW, rowH = 20;
  const stateRaw = (project.projectState || '').toString();
  const gridRows: { k: string; v: string; chip?: { label: string; fill: string; text: string } }[] = [
    { k: 'Document No.', v: docNo },
    { k: 'Client', v: project.client || '—' },
    { k: 'Project State', v: titleize(stateRaw) || '—', chip: statusChip(stateRaw) },
    { k: 'Overall Completion', v: panels.length ? fmtKpi(overallKpi) : '—' },
    { k: 'Generated (UTC)', v: fmtDateTimeUTC(generatedAt) },
    { k: 'Prepared By', v: genBy },
  ];
  gridRows.forEach((r, i) => {
    const gy = gridY + i * rowH;
    drawBox(doc, CL, gy, keyW, rowH, { fill: C.blue50 });
    drawText(doc, r.k, CL + 8, gy + (rowH - 8.5) / 2 - 0.5, { font: F.bold, size: 8.5, color: C.neutral }, { width: keyW - 12, lineBreak: false, ellipsis: true });
    const vStyle = (r.k === 'Overall Completion' && panels.length)
      ? { font: F.bold, size: 8.5, color: kpiColor(overallKpi) }
      : { font: F.reg, size: 8.5, color: C.ink };
    drawText(doc, r.v, CL + keyW + 8, gy + (rowH - 8.5) / 2 - 0.5, vStyle, { width: valW - 90, lineBreak: false, ellipsis: true });
    if (r.chip) chip(CR - 78, gy + (rowH - 15) / 2, 74, r.chip.label, r.chip.fill, r.chip.text);
  });
  const gridBottom = gridY + gridRows.length * rowH;
  drawBox(doc, CL, gridY, CW, gridRows.length * rowH, { stroke: C.border, strokeWidth: 0.75 });
  doc.save().lineWidth(0.5).strokeColor(C.border).moveTo(CL + keyW, gridY).lineTo(CL + keyW, gridBottom).stroke().restore();
  for (let i = 1; i < gridRows.length; i++) hr(CL, CR, gridY + i * rowH, C.border, 0.5);

  // Revision line
  setText(F.bold, 8, C.neutral);
  doc.text('Revision 1.0', CL, gridBottom + 12, { continued: true });
  setText(F.reg, 8, C.slate500);
  doc.text(`   ·   Issue Date ${issueDate}   ·   Status: Issued for Review`, { lineBreak: false });

  // Cover confidentiality
  hr(CL, CR, 792, C.navy, 0.75);
  setText(F.reg, 7.5, C.slate500);
  doc.text('Controlled document generated by the Digital Wiring Execution System (DWES). Confidential — unauthorized distribution prohibited.',
    CL, 800, { width: CW, align: 'center', lineBreak: false });

  /* ═══════════════════════════════ 1. EXECUTIVE SUMMARY ═══════════════════════ */
  doc.addPage();
  let y = sectionHead('Summary', '1. Executive Summary', CL, BODY_TOP);

  if (panels.length === 0) {
    drawText(doc, 'No panels have been assigned to this project.', CL, y + 6, { font: F.reg, size: 10, color: C.slate500 }, { width: CW });
  } else {
    // Executive KPI cards requested for management snapshot.
    const kpiGap = 12;
    const kpiW = (CW - 3 * kpiGap) / 4;
    const kpiH = 58;
    const pendingRejected = forQcCount + rejectedCount;
    const kpiCards: Array<{ value: string; label: string; accent: string; bg: string }> = [
      { value: String(panels.length), label: 'TOTAL PANELS', accent: C.navy, bg: C.blue50 },
      { value: fmtKpi(overallKpi), label: 'COMPLETION %', accent: kpiColor(overallKpi), bg: C.blue50 },
      { value: String(approvedCount), label: 'PASS COUNT', accent: C.success, bg: C.successBg },
      { value: String(pendingRejected), label: 'PENDING / REJECTED', accent: pendingRejected > 0 ? C.amber : C.slate500, bg: pendingRejected > 0 ? C.amberBg : C.neutralBg },
    ];
    kpiCards.forEach((card, i) => {
      const x = CL + i * (kpiW + kpiGap);
      drawBox(doc, x, y, kpiW, kpiH, { fill: card.bg, radius: 5 });
      drawBox(doc, x, y, kpiW, kpiH, { stroke: C.border, strokeWidth: 0.6, radius: 5 });
      drawText(doc, card.value, x + 10, y + 10, { font: F.bold, size: 20, color: card.accent }, { width: kpiW - 20, align: 'left', lineBreak: false, ellipsis: true });
      drawText(doc, card.label, x + 10, y + 37, { font: F.bold, size: 7.5, color: C.slate500 }, { width: kpiW - 20, align: 'left', lineBreak: false, ellipsis: true });
    });
    y += kpiH + SPACING.LG;

    // Narrative
    const clauses: string[] = [];
    if (approvedCount) clauses.push(`${approvedCount} approved`);
    if (forQcCount) clauses.push(`${forQcCount} awaiting QC`);
    if (rejectedCount) clauses.push(`${rejectedCount} rejected`);
    const narrative = `Across ${panels.length} panel${panels.length !== 1 ? 's' : ''}, ${totalCables} cable${totalCables !== 1 ? 's' : ''} were scheduled; overall completion is ${fmtKpi(overallKpi)}.` +
      (clauses.length ? ` ${clauses.join(', ')}.` : '');
    drawText(doc, narrative, CL, y, { ...TYPE.body, color: C.ink }, { width: CW });
    y = doc.y + SPACING.MD;

    // Stacked completion bar
    const totC = doneCables + partialCables + pendingCables || 1;
    const barW = CW, barH = 10;
    drawBox(doc, CL, y, barW, barH, { fill: C.border, radius: 2 });
    let bx = CL;
    for (const [n, col] of [[doneCables, C.success], [partialCables, C.amber], [pendingCables, null]] as [number, string | null][]) {
      const sw = barW * n / totC;
      if (col && sw > 0.5) drawBox(doc, bx, y, sw, barH, { fill: col });
      bx += sw;
    }
    y += barH + SPACING.SM;
    // Legend
    const legend: [string, string][] = [[`Done ${doneCables}`, C.success], [`Partial ${partialCables}`, C.amber], [`Pending ${pendingCables}`, C.slate400]];
    let lx = CL;
    for (const [txt, sw] of legend) {
      drawBox(doc, lx, y + 1, 7, 7, { fill: sw, radius: 1.5 });
      drawText(doc, txt, lx + 11, y, { font: F.reg, size: 8, color: C.slate500 }, { lineBreak: false });
      lx += 11 + doc.widthOfString(txt) + 16;
    }
    y += 22;

    // Panel breakdown table
    kicker('Panel Breakdown', CL, y); y += 14;
    const pcols = makeCols([
      { header: '#', pct: 5, align: 'right' },
      { header: 'PANEL', pct: 22, align: 'left' },
      { header: 'TECHNICIAN', pct: 17, align: 'left' },
      { header: 'CABLES', pct: 8, align: 'right' },
      { header: 'SRC', pct: 8, align: 'right' },
      { header: 'DST', pct: 8, align: 'right' },
      { header: 'KPI', pct: 8, align: 'right' },
      { header: 'STATUS', pct: 12, align: 'center' },
      { header: 'REVIEW', pct: 12, align: 'center' },
    ]);
    const [cNo, cPanel, cTech, cCab, cSrc, cDst, cKpi, cStat, cRev] = pcols;
    // Triage sort: rejected first, then lowest KPI
    const sorted = [...panels].sort((a, b) => {
      const ar = (a.reviewStatus || '').toLowerCase() === 'rejected' ? 0 : 1;
      const br = (b.reviewStatus || '').toLowerCase() === 'rejected' ? 0 : 1;
      if (ar !== br) return ar - br;
      return a.kpi - b.kpi;
    });
    y = renderTable({
      startY: y,
      cols: pcols,
      headerH: 20,
      count: sorted.length,
      measure: (i) => { setText(F.bold, 8.5, C.ink); return Math.max(20, doc.heightOfString(sorted[i].panelName, { width: cPanel.w - 5 }) + 8); },
      drawRow: (i, ry, h) => {
        const p = sorted[i];
        cell(String(i + 1), cNo, ry, h, { hex: C.slate500 });
        cell(p.panelName, cPanel, ry, h, { font: F.bold, valign: 'top' });
        cell(truncate(p.technicianName || '—', cTech.w - 5, F.reg, 8.5), cTech, ry, h);
        cell(String(p.cablesTotal || 0), cCab, ry, h);
        fraction(cSrc, ry, h, p.cablesSrcDone || 0, p.cablesTotal || 0);
        fraction(cDst, ry, h, p.cablesDstDone || 0, p.cablesTotal || 0);
        cell(fmtKpi(p.kpi), cKpi, ry, h, { hex: kpiColor(p.kpi), font: F.bold });
        const s = statusChip(p.status); chip(cStat.x, ry + (h - 15) / 2, cStat.w, s.label, s.fill, s.text);
        const r = qaChip(p.reviewStatus); chip(cRev.x, ry + (h - 15) / 2, cRev.w, r.label, r.fill, r.text);
      },
      totalsRow: {
        height: 20,
        draw: (ry) => {
          setText(F.bold, 8.5, C.navy);
          doc.text('TOTALS', cNo.x + 5, ry + (20 - 8.5) / 2 - 0.5, { width: cPanel.x + cPanel.w - cNo.x - 5, lineBreak: false });
          cell(String(totalCables), cCab, ry, 20, { font: F.bold });
          cell(String(sumSrc), cSrc, ry, 20, { font: F.bold });
          cell(String(sumDst), cDst, ry, 20, { font: F.bold });
          cell(fmtKpi(overallKpi), cKpi, ry, 20, { font: F.bold, hex: kpiColor(overallKpi) });
        },
      },
    });
  }

  /* ═══════════════════════════════ 2. PANEL DETAIL RECORDS ════════════════════ */
  panels.forEach((p, pi) => {
    doc.addPage();
    let py = BODY_TOP;
    // Panel header bar: panel name, technician, and status badges.
    const barH = 34;
    drawBox(doc, CL, py, CW, barH, { fill: C.navy, radius: 4 });
    drawText(doc, `2.${pi + 1} ${p.panelName}`, CL + 10, py + 11, { font: F.bold, size: 10.5, color: C.white }, { width: 230, lineBreak: false, ellipsis: true });
    drawText(doc, `Technician: ${p.technicianName || '—'}`, CL + 245, py + 12, { font: F.reg, size: 8, color: C.white }, { width: 150, lineBreak: false, ellipsis: true });
    const ps = statusChip(p.status);
    const qs = qaChip(p.reviewStatus);
    chip(CR - 148, py + 9, 72, ps.label, ps.fill, ps.text);
    chip(CR - 72, py + 9, 72, qs.label, qs.fill, qs.text);
    py += barH + 10;

    // 3-column meta strip
    const colGap = 16, mcW = (CW - 2 * colGap) / 3;
    const meta: [string, string][][] = [
      [['Technician', p.technicianName || 'Unassigned'], ['Assigned', fmtDate(p.assignedAt)]],
      [['Execution start', fmtDate(p.startedAt)], ['Completed', fmtDate(p.completedAt)]],
      [['Review / QC', `${qaChip(p.reviewStatus).label}${p.inspectionResult ? ` · ${titleize(p.inspectionResult)}` : ''}`], ['Approval', p.supervisorApproved ? `Approved ${fmtDate(p.approvedAt)}` : 'Pending']],
    ];
    meta.forEach((colPairs, ci) => {
      const mx = CL + ci * (mcW + colGap);
      colPairs.forEach(([k, v], ri) => {
        const myy = py + ri * 22;
        drawText(doc, k.toUpperCase(), mx, myy, { ...TYPE.meta, color: C.slate500 }, { characterSpacing: 0.4, lineBreak: false });
        drawText(doc, v, mx, myy + 9, { ...TYPE.body, font: F.bold, color: C.ink }, { width: mcW, lineBreak: false, ellipsis: true });
      });
    });
    py += 2 * 22 + 8;

    const executionDetail = `Status: ${statusChip(p.status).label}  ·  Terminations: Src ${p.cablesSrcDone || 0}/${p.cablesTotal || 0}, Dst ${p.cablesDstDone || 0}/${p.cablesTotal || 0}  ·  Recorded wiring time: ${formatDuration(p.wiringSeconds)}`;
    drawText(doc, executionDetail, CL, py, { font: F.reg, size: 8, color: C.slate500 }, { width: CW, lineBreak: false, ellipsis: true });
    py += 18;

    if (p.pauseReason || p.reviewerName || p.approverName || p.inspectorName) {
      const assurance = [
        p.pauseReason ? `Pause reason: ${p.pauseReason}` : '',
        p.inspectorName ? `QC inspector: ${p.inspectorName}` : '',
        p.reviewerName ? `Reviewer: ${p.reviewerName}` : '',
        p.approverName ? `Supervisor approver: ${p.approverName}` : '',
      ].filter(Boolean).join('  ·  ');
      drawText(doc, assurance, CL, py, { font: F.reg, size: 7.5, color: C.slate500 }, { width: CW, lineBreak: false, ellipsis: true });
      py += 18;
    }

    // Review-note callout
    if (p.reviewNotes && p.reviewNotes.trim()) {
      const rejected = (p.reviewStatus || '').toLowerCase() === 'rejected';
      const barHex = rejected ? C.rose : C.accent;
      const prefix = rejected ? 'REJECTION NOTE: ' : '';
      setText(F.obl, 8, C.slate500);
      let noteH = doc.heightOfString(prefix + p.reviewNotes, { width: CW - 24 }) + 12;
      // Break to a fresh page if the callout won't fit; cap + ellipsize pathological notes
      // (margin:0 means pdfkit won't auto-paginate, so an unbounded note would run off-page).
      if (py + noteH + 10 > PAGE_BOTTOM && py > BODY_TOP) { doc.addPage(); py = BODY_TOP; }
      const maxNoteH = PAGE_BOTTOM - py - 10;
      if (noteH > maxNoteH) noteH = maxNoteH;
      drawBox(doc, CL, py, CW, noteH, { fill: C.blue50, radius: 4 });
      drawBox(doc, CL, py, 2.5, noteH, { fill: barHex });
      drawText(doc, prefix + p.reviewNotes, CL + 12, py + 6, { font: F.obl, size: 8, color: rejected ? C.rose : C.slate500 }, { width: CW - 24, height: noteH - 12, ellipsis: true });
      py = py + noteH + 10;
    }

    // Cable schedule — keep the heading with its table header + first row (never start in the footer zone)
    const cableCount = Array.isArray(p.cables) ? p.cables.length : 0;
    if (py + 14 + 18 + 20 > PAGE_BOTTOM) { doc.addPage(); py = BODY_TOP; }
    kicker(`Cable Schedule (${cableCount} cable${cableCount !== 1 ? 's' : ''})`, CL, py); py += 14;

    if (p.cables === null) {
      drawText(doc, 'Cable schedule unavailable for this frame.', CL, py, { font: F.obl, size: 8, color: C.slate500 }, { width: CW });
    } else if (p.cables.length === 0) {
      drawText(doc, 'No cable schedule recorded for this panel.', CL, py, { font: F.reg, size: 8, color: C.slate500 }, { width: CW });
    } else {
      const ccols = makeCols([
        { header: '#', pct: 6, align: 'right' },
        { header: 'SOURCE', pct: 30, align: 'left' },
        { header: 'DESTINATION', pct: 30, align: 'left' },
        { header: 'SIZE', pct: 9, align: 'left' },
        { header: 'COLOUR', pct: 13, align: 'left' },
        { header: 'STATUS', pct: 12, align: 'center' },
      ]);
      const [xNo, xSrc, xDst, xSize, xColor, xStat] = ccols;
      const CAP = 250;
      const rows = p.cables.slice(0, CAP);
      const cableBottom = renderTable({
        startY: py,
        cols: ccols,
        headerH: 18,
        count: rows.length,
        continuationCaption: `2.${pi + 1}.1 Cable Schedule (continued)`,
        measure: (i) => {
          setText(F.reg, 8, C.ink);
          const hs = Math.max(
            doc.heightOfString(rows[i].source || '—', { width: xSrc.w - 5 }),
            doc.heightOfString(rows[i].destination || '—', { width: xDst.w - 5 }),
          );
          return Math.max(15, hs + 6);
        },
        drawRow: (i, ry, h) => {
          const c = rows[i];
          cell(String(i + 1), xNo, ry, h, { size: 8, hex: C.slate500 });
          cell(c.source || '—', xSrc, ry, h, { size: 8, valign: h > 18 ? 'top' : 'middle' });
          cell(c.destination || '—', xDst, ry, h, { size: 8, valign: h > 18 ? 'top' : 'middle' });
          cell(c.size && c.size.trim() ? c.size : '—', xSize, ry, h, { size: 8, hex: C.slate500 });
          colorCell(c.color, xColor, ry, h);
          const cc = cableChip(c.status); chip(xStat.x, ry + (h - 15) / 2, xStat.w, cc.label, cc.fill, cc.text);
        },
      });
      if (p.cables.length > CAP) {
        const moreMsg = `… and ${p.cables.length - CAP} more cables (schedule truncated for print; full data in the Excel export).`;
        setText(F.obl, 7.5, C.slate500);
        const moreH = doc.heightOfString(moreMsg, { width: CW });
        let moreY = cableBottom + 6;
        if (moreY + moreH > PAGE_BOTTOM) { doc.addPage(); moreY = BODY_TOP; setText(F.obl, 7.5, C.slate500); }
        doc.text(moreMsg, CL, moreY, { width: CW });
      }
    }
  });

  /* ═══════════════════════════════ 3. APPROVAL & SIGN-OFF ═════════════════════ */
  doc.addPage();
  let ay = sectionHead('Authorisation', '3. Approval & Sign-off', CL, BODY_TOP);
  drawText(doc, 'By signing below, the named parties confirm the wiring execution recorded in this report has been performed, reviewed, and approved in accordance with project requirements.', CL, ay, { ...TYPE.body, color: C.ink }, { width: CW });
  ay = doc.y + 18;

  const sgGap = 16, sgW = (CW - 2 * sgGap) / 3, sgH = 92;
  const blocks: { role: string; sub: string; name?: string; date?: string }[] = [
    { role: 'TECHNICIAN SIGNATURE', sub: 'Assigned Technician', name: genBy !== '—' ? genBy : '', date: fmtDate(generatedAt) },
    { role: 'SUPERVISOR SIGNATURE', sub: 'Production Supervisor' },
    { role: 'CLIENT SIGNATURE', sub: 'Client Representative' },
  ];
  blocks.forEach((b, i) => {
    const bx = CL + i * (sgW + sgGap);
    drawBox(doc, bx, ay, sgW, sgH, { stroke: C.border, strokeWidth: 0.75, radius: 4 });
    drawText(doc, b.role, bx + 12, ay + 10, { font: F.bold, size: 8, color: C.navy }, { lineBreak: false });
    drawText(doc, b.sub, bx + 12, ay + 20, { font: F.reg, size: 7, color: C.slate500 }, { lineBreak: false });
    drawDivider(doc, bx + 12, bx + sgW - 12, ay + 64, { color: C.slate300, width: 0.75 });
    if (b.name) drawText(doc, b.name, bx + 12, ay + 54, { ...TYPE.body, font: F.bold, color: C.ink }, { width: sgW - 24, lineBreak: false, ellipsis: true });
    drawText(doc, `Name: ${b.name || ''}`, bx + 12, ay + 70, { font: F.reg, size: 7.5, color: C.slate500 }, { lineBreak: false });
    doc.text(`Date: ${b.date || ''}`, bx + 12, ay + 80, { lineBreak: false });
  });
  ay += sgH + 18;

  // Revision-history mini-table
  const rcols = makeCols([
    { header: 'REV', pct: 12, align: 'left' },
    { header: 'DATE', pct: 20, align: 'left' },
    { header: 'DESCRIPTION', pct: 52, align: 'left' },
    { header: 'BY', pct: 16, align: 'left' },
  ]);
  const revBottom = renderTable({
    startY: ay,
    cols: rcols,
    headerH: 18,
    count: 1,
    measure: () => 20,
    drawRow: (_i, ry, h) => {
      cell('1.0', rcols[0], ry, h, { size: 8 });
      cell(issueDate, rcols[1], ry, h, { size: 8 });
      cell('Initial issue for client review', rcols[2], ry, h, { size: 8 });
      cell(genBy, rcols[3], ry, h, { size: 8 });
    },
  });

  drawText(doc, 'This report was generated by the Digital Wiring Execution System (DWES) as a read-only export and reflects recorded execution data at the time of generation.',
    CL, revBottom + 14, { font: F.obl, size: 7.5, color: C.slate500 }, { width: CW });

  /* ═══════════════════════════ Header/footer buffered pass ════════════════════ */
  const range = doc.bufferedPageRange();
  const totalPages = range.count;
  for (let i = range.start; i < range.start + range.count; i++) {
    doc.switchToPage(i);
    const isCover = i === range.start;
    if (!isCover) drawRunningHeader();
    drawFooter(i - range.start + 1, totalPages);
  }

  doc.end();
  return done;
}

export default buildProjectReportPdf;
