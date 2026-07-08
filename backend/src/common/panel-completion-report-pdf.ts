/**
 * Panel Project Completion Report — single-page executive PDF (portrait A4).
 * Layout zones per dwes_project_completion_report_redesign.md spec.
 */
import * as PDFDocument from 'pdfkit';
import { PDFDocument as PDFLibDocument } from 'pdf-lib';
import {
  REPORT_COMPANY,
  REPORT_SYSTEM,
  REPORT_SYSTEM_SHORT,
  resolveReportLogoPath,
} from './report-branding';
import { drawBox, drawText, drawDivider, drawEnterpriseFooter, REPORT_FONTS } from './pdf-report-layout';
import type { PanelCompletionReportData, PanelReportStatus } from './panel-completion-report.helper';

const F = REPORT_FONTS;
const PAGE_W = 595.28;
const PAGE_H = 841.89;
const ML = 40;
const MR = 555;
const CW = MR - ML;

const C = {
  navy: '#0F2557',
  accent: '#2563EB',
  ink: '#0F172A',
  slate600: '#475569',
  slate500: '#64748B',
  slate400: '#94A3B8',
  border: '#E2E8F0',
  white: '#FFFFFF',
  success: '#15803D',
  successBg: '#DCFCE7',
  amber: '#B45309',
  amberBg: '#FEF3C7',
  rose: '#B91C1C',
  roseBg: '#FEE2E2',
  neutralBg: '#F1F5F9',
  zebra: '#F8FAFC',
  blue50: '#EFF6FF',
};

function fmtDateTime(d?: Date | null): string {
  if (!d) return '—';
  const dt = d instanceof Date ? d : new Date(d);
  if (isNaN(dt.getTime())) return '—';
  const mon = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][dt.getUTCMonth()];
  return `${String(dt.getUTCDate()).padStart(2, '0')} ${mon} ${dt.getUTCFullYear()} ${String(dt.getUTCHours()).padStart(2, '0')}:${String(dt.getUTCMinutes()).padStart(2, '0')} UTC`;
}

function clip(s: string, max = 56): string {
  const t = (s || '').trim();
  if (t.length <= max) return t || '—';
  return `${t.slice(0, max - 1)}…`;
}

function parseSubstationName(name: string, client: string | null): string {
  const parts = name.split(/\s+[–—]\s+|\s+-\s+/).map(p => p.trim()).filter(Boolean);
  if (parts.length <= 1) return name.trim() || '—';
  let i = 1;
  const norm = (v: string) => v.trim().toUpperCase().replace(/\s+/g, ' ');
  if (parts[i] && client && norm(parts[i]) === norm(client)) i += 1;
  return parts[0];
}

function parseCodeMeta(code: string): { location: string; region: string; voltage: string } {
  const p = code.split('_').filter(Boolean);
  if (p.length < 5) return { location: '—', region: '—', voltage: '—' };
  return {
    voltage: p.slice(0, -4).join(' ').replace(/_/g, ' '),
    location: p[p.length - 3].replace(/_/g, ' '),
    region: p[p.length - 4],
  };
}

function statusStyle(status: PanelReportStatus): { fill: string; text: string } {
  switch (status) {
    case 'completed': return { fill: C.successBg, text: C.success };
    case 'in_progress': return { fill: C.amberBg, text: C.amber };
    case 'on_hold': return { fill: C.neutralBg, text: C.slate600 };
    case 'not_started': return { fill: C.blue50, text: C.accent };
    default: return { fill: C.neutralBg, text: C.slate600 };
  }
}

function kpiColor(v: number): string {
  return v >= 90 ? C.success : v >= 50 ? C.amber : C.rose;
}

function drawMetaField(
  doc: PDFKit.PDFDocument,
  x: number,
  y: number,
  w: number,
  label: string,
  value: string,
): void {
  drawText(doc, label.toUpperCase(), x, y, { font: F.bold, size: 6.5, color: C.slate500 }, { lineBreak: false });
  drawText(doc, clip(value, Math.floor(w / 5)), x, y + 9, { font: F.reg, size: 8.5, color: C.ink }, {
    width: w - 4,
    lineBreak: false,
    ellipsis: true,
  });
}

function drawMetaGrid(
  doc: PDFKit.PDFDocument,
  x: number,
  y: number,
  w: number,
  rows: [string, string][],
  cols = 2,
): number {
  const colW = w / cols;
  const rowH = 24;
  let cy = y;
  for (let i = 0; i < rows.length; i += cols) {
    for (let c = 0; c < cols; c++) {
      const row = rows[i + c];
      if (!row) break;
      drawMetaField(doc, x + c * colW, cy, colW - 10, row[0], row[1]);
    }
    cy += rowH;
  }
  return cy;
}

function drawKpiCard(
  doc: PDFKit.PDFDocument,
  x: number,
  y: number,
  w: number,
  h: number,
  label: string,
  value: string,
  opts: { primary?: boolean; valueColor?: string } = {},
): void {
  const primary = opts.primary ?? false;
  drawBox(doc, x, y, w, h, {
    fill: primary ? C.accent : C.white,
    stroke: primary ? undefined : C.border,
    strokeWidth: primary ? undefined : 0.75,
    radius: 6,
  });
  drawText(doc, value, x, y + (primary ? 10 : 12), {
    font: F.bold,
    size: primary ? 22 : 16,
    color: primary ? C.white : (opts.valueColor || C.navy),
  }, { width: w, align: 'center', lineBreak: false });
  drawText(doc, label, x, y + h - 16, {
    font: F.reg,
    size: 6.5,
    color: primary ? '#BFDBFE' : C.slate500,
  }, { width: w, align: 'center', lineBreak: false });
}

function drawProgressBar(doc: PDFKit.PDFDocument, x: number, y: number, w: number, pct: number): void {
  const h = 7;
  drawBox(doc, x, y, w, h, { fill: C.border, radius: 3 });
  const fillW = Math.max(0, Math.min(w, (w * pct) / 100));
  if (fillW > 0) {
    drawBox(doc, x, y, fillW, h, { fill: pct >= 90 ? C.success : pct >= 50 ? C.amber : C.accent, radius: 3 });
  }
}

export async function buildPanelCompletionReportPdf(data: PanelCompletionReportData): Promise<Buffer> {
  const docNo = `DWES-PCR-${data.panel.id.replace(/[^A-Za-z0-9]/g, '').slice(0, 24)}`;
  const doc = new PDFDocument({
    size: 'A4',
    margin: 0,
    autoFirstPage: true,
    info: {
      Title: `Project Completion Report — ${data.panel.name}`,
      Author: `${REPORT_SYSTEM_SHORT} — ${REPORT_COMPANY}`,
    },
  });
  const chunks: Buffer[] = [];
  doc.on('data', (c: Buffer) => chunks.push(c));
  const done = new Promise<Buffer>((resolve, reject) => {
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });

  const substation = parseSubstationName(data.project.name, data.project.client);
  const client = (data.project.client || '').trim() || '—';
  const codeMeta = parseCodeMeta(data.project.code);
  const regionLocation = data.project.locationRegion || `${codeMeta.location} / ${codeMeta.region}`;
  const voltage = data.panel.voltageLevel || codeMeta.voltage;
  const st = statusStyle(data.reportStatus);
  const logoPath = resolveReportLogoPath();

  const loginTimes = data.sessionLog.length
    ? data.sessionLog.map(s => fmtDateTime(s.loginAt)).join(' · ')
    : '—';
  const logoutTimes = data.sessionLog.length
    ? data.sessionLog.map(s => (s.logoutAt ? fmtDateTime(s.logoutAt) : 'Active')).join(' · ')
    : '—';
  const reworkLabel = data.rework.count > 0 ? `${data.rework.count} · ${data.rework.status}` : 'None';

  // ── Zone 1: Header band ───────────────────────────────────────────────────
  drawBox(doc, 0, 0, PAGE_W, 64, { fill: C.navy });
  drawBox(doc, 0, 60, PAGE_W, 3, { fill: C.accent });

  const logoY = 12;
  if (logoPath) {
    try { doc.image(logoPath, ML, logoY, { height: 34 }); } catch { /* text fallback */ }
  }
  const headerTextX = logoPath ? ML + 92 : ML;
  drawText(doc, REPORT_COMPANY, headerTextX, logoY + 2, { font: F.bold, size: 9, color: C.white }, { lineBreak: false });
  drawText(doc, REPORT_SYSTEM, headerTextX, logoY + 14, { font: F.reg, size: 7, color: '#BFDBFE' }, { lineBreak: false });

  drawText(doc, 'PROJECT COMPLETION REPORT', MR - 200, logoY + 2, {
    font: F.bold, size: 9, color: C.white,
  }, { width: 200, align: 'right', lineBreak: false });
  drawText(doc, `Ref: ${docNo}`, MR - 200, logoY + 14, {
    font: F.reg, size: 7, color: '#93C5FD',
  }, { width: 200, align: 'right', lineBreak: false });
  drawText(doc, `Frame: ${data.panel.id}`, MR - 200, logoY + 24, {
    font: F.reg, size: 7, color: '#93C5FD',
  }, { width: 200, align: 'right', lineBreak: false });

  // ── Zone 2: Project / client meta strip ───────────────────────────────────
  let y = 76;
  drawBox(doc, ML, y, CW, 4, { fill: C.accent, radius: 2 });
  y += 10;
  const metaRows: [string, string][] = [
    ['Project name', substation],
    ['Panel / subpanel', data.panel.name],
    ['Client', client],
    ['Region / location', regionLocation],
    ['Voltage', voltage],
    ['Project assigned by', data.assignedBy?.fullName || '—'],
    ['Generated', fmtDateTime(data.generatedAt)],
    ['Generated by', data.generatedBy],
  ];
  y = drawMetaGrid(doc, ML, y, CW, metaRows, 2) + 6;

  // ── Zone 3: Personnel row ─────────────────────────────────────────────────
  const personGap = 8;
  const personCount = data.midChangeTechnician ? 3 : 2;
  const personW = (CW - (personCount - 1) * personGap) / personCount;
  const personH = 42;
  const personnel = [
    { label: 'Assigned technician', name: data.technician?.fullName || '—' },
    ...(data.midChangeTechnician
      ? [{ label: 'Mid-change technician', name: data.midChangeTechnician.fullName }]
      : []),
    { label: 'Production supervisor', name: data.supervisor?.fullName || '—' },
  ];
  personnel.forEach((p, i) => {
    const x = ML + i * (personW + personGap);
    drawBox(doc, x, y, personW, personH, { fill: C.zebra, stroke: C.border, strokeWidth: 0.75, radius: 5 });
    drawText(doc, p.label.toUpperCase(), x + 8, y + 7, { font: F.bold, size: 6.5, color: C.slate500 }, { lineBreak: false });
    drawText(doc, clip(p.name, 32), x + 8, y + 20, { font: F.reg, size: 9, color: C.ink }, {
      width: personW - 16, lineBreak: false, ellipsis: true,
    });
  });
  y += personH + 10;

  // ── Zone 4: KPI card row (visual centerpiece) ─────────────────────────────
  const kpiGap = 7;
  const leadW = CW * 0.28;
  const smallW = (CW - leadW - 4 * kpiGap) / 4;
  const kpiH = 58;
  drawKpiCard(doc, ML, y, leadW, kpiH, 'Completion %', `${data.completionPercent}%`, { primary: true });
  drawProgressBar(doc, ML + 10, y + kpiH - 14, leadW - 20, data.completionPercent);

  const kpiX1 = ML + leadW + kpiGap;
  drawKpiCard(doc, kpiX1, y, smallW, kpiH, 'Total cables', String(data.cables.total));
  drawKpiCard(doc, kpiX1 + smallW + kpiGap, y, smallW, kpiH, 'Completed', String(data.cables.completed), { valueColor: C.success });
  drawKpiCard(doc, kpiX1 + 2 * (smallW + kpiGap), y, smallW, kpiH, 'Remaining', String(data.cables.remaining));
  drawKpiCard(doc, kpiX1 + 3 * (smallW + kpiGap), y, smallW, kpiH, 'Wiring KPI', `${data.kpi}%`, { valueColor: kpiColor(data.kpi) });

  y += kpiH + 8;
  const subCardW = (CW - 3 * kpiGap) / 4;
  drawKpiCard(doc, ML, y, subCardW, 40, 'Open-end (src / dst)', `${data.cables.openEndSource} / ${data.cables.openEndDestination}`);
  drawKpiCard(doc, ML + subCardW + kpiGap, y, subCardW, 40, 'Rework', reworkLabel, {
    valueColor: data.rework.count > 0 ? C.amber : C.slate600,
  });
  const statusX = ML + 2 * (subCardW + kpiGap);
  drawBox(doc, statusX, y, subCardW * 2 + kpiGap, 40, { fill: st.fill, radius: 6 });
  drawText(doc, 'FINAL STATUS', statusX, y + 8, { font: F.bold, size: 6.5, color: C.slate500 }, { width: subCardW * 2 + kpiGap, align: 'center', lineBreak: false });
  drawText(doc, data.reportStatusLabel.toUpperCase(), statusX, y + 20, { font: F.bold, size: 12, color: st.text }, { width: subCardW * 2 + kpiGap, align: 'center', lineBreak: false });

  y += 48;

  // ── Zone 5: Execution timeline / duration ─────────────────────────────────
  drawBox(doc, ML, y, CW, 18, { fill: C.navy, radius: 4 });
  drawText(doc, 'EXECUTION TIMELINE & DURATION', ML + 10, y + 5, { font: F.bold, size: 7, color: C.white }, { lineBreak: false });
  y += 22;
  y = drawMetaGrid(doc, ML + 4, y, CW - 8, [
    ['Wiring start', fmtDateTime(data.wiring.startedAt)],
    ['Wiring completion', fmtDateTime(data.wiring.completedAt)],
    ['Wiring duration', data.wiring.durationHuman],
    ['Project duration', `${data.projectDurationDays} day(s)`],
    ['Technician login(s)', loginTimes],
    ['Technician logout(s)', logoutTimes],
    ['Total working hours', data.totalWorkingHours],
    ['Frame ID', data.panel.id],
  ], 2) + 6;

  // ── Zone 6: Remarks ───────────────────────────────────────────────────────
  drawBox(doc, ML, y, CW, 18, { fill: C.navy, radius: 4 });
  drawText(doc, 'REMARKS & NOTES', ML + 10, y + 5, { font: F.bold, size: 7, color: C.white }, { lineBreak: false });
  y += 22;
  const remarksH = 44;
  drawBox(doc, ML, y, CW, remarksH, { fill: C.zebra, stroke: C.border, strokeWidth: 0.75, radius: 4 });
  const techRemarks = data.technicianRemarks.length ? data.technicianRemarks.join(' · ') : '—';
  const supRemarks = data.supervisorRemarks || data.rework.reason || '—';
  drawText(doc, 'Technician remarks', ML + 10, y + 6, { font: F.bold, size: 7, color: C.navy }, { lineBreak: false });
  drawText(doc, clip(techRemarks, 120), ML + 96, y + 6, { font: F.reg, size: 8, color: C.ink }, { width: CW - 108, lineBreak: false, ellipsis: true });
  drawDivider(doc, ML + 10, MR - 10, y + 22, { color: C.border });
  drawText(doc, 'Supervisor remarks', ML + 10, y + 26, { font: F.bold, size: 7, color: C.navy }, { lineBreak: false });
  drawText(doc, clip(supRemarks, 120), ML + 96, y + 26, { font: F.reg, size: 8, color: C.ink }, { width: CW - 108, lineBreak: false, ellipsis: true });
  y += remarksH + 8;

  // ── Zone 7: Approval / signature footer ───────────────────────────────────
  drawBox(doc, ML, y, CW, 18, { fill: C.navy, radius: 4 });
  drawText(doc, 'APPROVAL & SIGN-OFF', ML + 10, y + 5, { font: F.bold, size: 7, color: C.white }, { lineBreak: false });
  y += 22;
  const sigGap = 10;
  const sigW = (CW - 2 * sigGap) / 3;
  const sigH = 54;
  const roles = [
    { title: 'Technician', name: data.technician?.fullName || '' },
    { title: 'Production Supervisor', name: data.supervisor?.fullName || data.generatedBy },
    { title: 'Client / Management', name: '' },
  ];
  roles.forEach((r, i) => {
    const x = ML + i * (sigW + sigGap);
    drawBox(doc, x, y, sigW, sigH, { fill: C.white, stroke: C.border, strokeWidth: 0.75, radius: 4 });
    drawText(doc, r.title.toUpperCase(), x + 8, y + 6, { font: F.bold, size: 6.5, color: C.slate500 }, { lineBreak: false });
    if (r.name) {
      drawText(doc, clip(r.name, 28), x + 8, y + 20, { font: F.reg, size: 8, color: C.ink }, { width: sigW - 16, lineBreak: false, ellipsis: true });
    }
    drawDivider(doc, x + 8, x + sigW - 8, y + 36, { color: C.slate400 });
    drawText(doc, 'Signature / Date', x + 8, y + 42, { font: F.reg, size: 6.5, color: C.slate400 }, { lineBreak: false });
  });

  // ── Zone 8: Page footer ───────────────────────────────────────────────────
  drawEnterpriseFooter(doc, {
    pageNumber: 1,
    totalPages: 1,
    projectCode: data.project.code,
    generatedAt: data.generatedAt,
    left: ML,
    right: MR,
    y: PAGE_H - 28,
    confidentialNote: 'Confidential — Management and Client Review Copy',
  });

  doc.end();
  const raw = await done;
  const pdf = await PDFLibDocument.load(raw);
  if (pdf.getPageCount() > 1) {
    const trimmed = await PDFLibDocument.create();
    const [page0] = await trimmed.copyPages(pdf, [0]);
    trimmed.addPage(page0);
    return Buffer.from(await trimmed.save());
  }
  return raw;
}

export default buildPanelCompletionReportPdf;
