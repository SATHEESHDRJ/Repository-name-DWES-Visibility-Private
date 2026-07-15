/**
 * Panel production report — single-page executive PDF (portrait A4).
 *
 * The document type follows the real production process: a panel still in
 * execution prints a PRODUCTION PROGRESS REPORT; only a fully wired and
 * supervisor-approved panel prints a PROJECT COMPLETION REPORT.
 *
 * Palette is industrial: dark charcoal, slate grey, white, restrained teal accent.
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
const ML = 42;
const MR = 553;
const CW = MR - ML;
const LOGO_ASPECT = 332 / 175; // native dimensions of logo-full.png (keep aspect faithful)

/** Industrial palette — charcoal + slate + white, teal used sparingly for emphasis. */
const C = {
  charcoal: '#1E293B',
  charcoalDeep: '#0F172A',
  teal: '#0D9488',
  tealDeep: '#0F766E',
  tealSoft: '#CCFBF1',
  tealTint: '#F0FDFA',
  ink: '#111827',
  slate700: '#334155',
  slate600: '#475569',
  slate500: '#64748B',
  slate400: '#94A3B8',
  slate300: '#CBD5E1',
  border: '#E2E8F0',
  hairline: '#EEF2F6',
  white: '#FFFFFF',
  panel: '#F8FAFC',
  amber: '#B45309',
  amberSoft: '#FEF3C7',
  rose: '#B91C1C',
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
  if (!t) return '—';
  if (t.length <= max) return t;
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

function statusStyle(status: PanelReportStatus): { fill: string; text: string; border: string } {
  return status === 'completed'
    ? { fill: C.tealSoft, text: C.tealDeep, border: C.teal }
    : { fill: C.panel, text: C.slate700, border: C.slate300 };
}

function progressColor(v: number): string {
  return v >= 100 ? C.teal : v >= 50 ? C.slate600 : C.amber;
}

/** Section rule: a thin charcoal bar with a teal tick — quieter than a filled band. */
function drawSectionHeading(doc: PDFKit.PDFDocument, y: number, label: string): number {
  drawBox(doc, ML, y, 3, 11, { fill: C.teal });
  drawText(doc, label.toUpperCase(), ML + 9, y + 1, {
    font: F.bold, size: 7.5, color: C.charcoal,
  }, { lineBreak: false, characterSpacing: 0.6 });
  drawDivider(doc, ML, MR, y + 15, { color: C.border });
  return y + 22;
}

function drawField(
  doc: PDFKit.PDFDocument,
  x: number,
  y: number,
  w: number,
  label: string,
  value: string,
): void {
  drawText(doc, label.toUpperCase(), x, y, {
    font: F.bold, size: 6, color: C.slate500,
  }, { lineBreak: false, characterSpacing: 0.4 });
  drawText(doc, clip(value, Math.max(12, Math.floor(w / 4.6))), x, y + 9.5, {
    font: F.reg, size: 9, color: C.ink,
  }, { width: w, lineBreak: false, ellipsis: true });
}

function drawFieldGrid(
  doc: PDFKit.PDFDocument,
  x: number,
  y: number,
  w: number,
  rows: [string, string][],
  cols: number,
  rowH = 26,
): number {
  const colW = w / cols;
  let cy = y;
  for (let i = 0; i < rows.length; i += cols) {
    for (let c = 0; c < cols; c++) {
      const row = rows[i + c];
      if (!row) break;
      drawField(doc, x + c * colW, cy, colW - 12, row[0], row[1]);
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
  opts: { primary?: boolean; valueColor?: string; valueSize?: number } = {},
): void {
  const primary = opts.primary ?? false;
  drawBox(doc, x, y, w, h, {
    fill: primary ? C.charcoal : C.white,
    stroke: primary ? undefined : C.border,
    strokeWidth: primary ? undefined : 0.75,
    radius: 5,
  });
  // Shrink the value until it fits on one line, so a long value can never wrap into
  // the label beneath it.
  const baseSize = opts.valueSize ?? (primary ? 21 : 15);
  const inner = w - 12;
  let size = baseSize;
  doc.font(F.bold);
  while (size > 7 && doc.fontSize(size).widthOfString(value) > inner) size -= 0.5;
  drawText(doc, value, x + 6, y + (primary ? 13 : 14) + (baseSize - size) / 2, {
    font: F.bold,
    size,
    color: primary ? C.white : (opts.valueColor || C.charcoal),
  }, { width: inner, align: 'center', lineBreak: false, ellipsis: true });
  drawText(doc, label.toUpperCase(), x, y + h - 14, {
    font: F.bold,
    size: 6,
    color: primary ? C.slate400 : C.slate500,
  }, { width: w, align: 'center', lineBreak: false, characterSpacing: 0.4 });
}

function drawProgressBar(doc: PDFKit.PDFDocument, x: number, y: number, w: number, pct: number): void {
  const h = 5;
  drawBox(doc, x, y, w, h, { fill: '#334155', radius: 2.5 });
  const fillW = Math.max(0, Math.min(w, (w * pct) / 100));
  if (fillW > 0) drawBox(doc, x, y, fillW, h, { fill: C.teal, radius: 2.5 });
}

export async function buildPanelCompletionReportPdf(data: PanelCompletionReportData): Promise<Buffer> {
  const isCompletion = data.reportKind === 'completion';
  const reportTitle = data.reportTitle;
  const hasContributionPage = data.contributions.length > 1 || data.midChangeHistory.length > 0;
  const reportPageCount = hasContributionPage ? 2 : 1;
  // Reference is derived from the project + panel the reader can actually see —
  // no internal frame identifier is printed anywhere in the document.
  const refCode = `${data.project.code}-${data.panel.name}`
    .toUpperCase()
    .replace(/[^A-Z0-9-]/g, '')
    .slice(0, 30);
  const docNo = `DWES-${isCompletion ? 'PCR' : 'PPR'}-${refCode}`;

  const doc = new PDFDocument({
    size: 'A4',
    margin: 0,
    autoFirstPage: true,
    info: {
      Title: `${reportTitle} — ${data.panel.name}`,
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
  // Compact enough for a KPI card; the reason itself is printed under Remarks.
  const reworkLabel = data.rework.count > 0
    ? `${data.rework.count} recorded`
    : 'None';

  // ── Header band ───────────────────────────────────────────────────────────
  const headerH = 62;
  drawBox(doc, 0, 0, PAGE_W, headerH, { fill: C.charcoalDeep });
  drawBox(doc, 0, headerH, PAGE_W, 2.5, { fill: C.teal });

  const logoY = 13;
  if (logoPath) {
    const logoH = 32;
    const logoW = Math.round(logoH * LOGO_ASPECT);
    // White card keeps the full-colour mark legible on the charcoal band.
    drawBox(doc, ML - 5, logoY - 5, logoW + 12, logoH + 10, { fill: C.white, radius: 5 });
    try { doc.image(logoPath, ML + 1, logoY, { height: logoH }); } catch { /* text fallback */ }
  }
  const headerTextX = logoPath ? ML + 90 : ML;
  drawText(doc, REPORT_COMPANY, headerTextX, logoY + 3, {
    font: F.bold, size: 9.5, color: C.white,
  }, { lineBreak: false });
  drawText(doc, REPORT_SYSTEM, headerTextX, logoY + 16, {
    font: F.reg, size: 7, color: C.slate400,
  }, { lineBreak: false });

  drawText(doc, reportTitle.toUpperCase(), MR - 230, logoY + 2, {
    font: F.bold, size: 10, color: C.white,
  }, { width: 230, align: 'right', lineBreak: false, characterSpacing: 0.5 });
  drawText(doc, `Ref: ${docNo}`, MR - 230, logoY + 17, {
    font: F.reg, size: 6.5, color: C.slate400,
  }, { width: 230, align: 'right', lineBreak: false });
  drawText(doc, fmtDateTime(data.generatedAt), MR - 230, logoY + 27, {
    font: F.reg, size: 6.5, color: C.slate400,
  }, { width: 230, align: 'right', lineBreak: false });

  // ── Project & panel identification ────────────────────────────────────────
  let y = headerH + 20;
  y = drawSectionHeading(doc, y, 'Project & panel');
  y = drawFieldGrid(doc, ML, y, CW, [
    ['Project name', substation],
    ['Panel / subpanel', data.panel.name],
    ['Project number', data.project.code],
    ['Panel type', data.panel.panelType || '—'],
    ['Client', client],
    ['Voltage', voltage],
    ['Region / location', regionLocation],
    ['Assigned by', data.assignedBy?.fullName || '—'],
  ], 2, 27);
  y += 4;

  // ── Personnel ─────────────────────────────────────────────────────────────
  y = drawSectionHeading(doc, y, 'Personnel');
  const personGap = 10;
  const personW = (CW - 2 * personGap) / 3;
  const personH = 40;
  const personnel = [
    { label: 'Assigned technician(s)', name: data.technicians.map(t => t.fullName).join(', ') || '—' },
    { label: 'Production supervisor', name: data.supervisor?.fullName || '—' },
    { label: 'Report generated by', name: data.generatedBy },
  ];
  personnel.forEach((p, i) => {
    const x = ML + i * (personW + personGap);
    drawBox(doc, x, y, personW, personH, { fill: C.panel, stroke: C.border, strokeWidth: 0.75, radius: 5 });
    drawText(doc, p.label.toUpperCase(), x + 9, y + 8, {
      font: F.bold, size: 6, color: C.slate500,
    }, { lineBreak: false, characterSpacing: 0.4 });
    drawText(doc, clip(p.name, 24), x + 9, y + 21, {
      font: F.reg, size: 9, color: C.ink,
    }, { width: personW - 18, lineBreak: false, ellipsis: true });
  });
  y += personH + 14;

  // ── Wiring progress (KPI row) ─────────────────────────────────────────────
  y = drawSectionHeading(doc, y, 'Wiring progress');
  const kpiGap = 8;
  const leadW = CW * 0.29;
  const smallW = (CW - leadW - 4 * kpiGap) / 4;
  const kpiH = 60;
  drawKpiCard(doc, ML, y, leadW, kpiH, 'Completion', `${data.completionPercent}%`, { primary: true });
  drawProgressBar(doc, ML + 12, y + kpiH - 24, leadW - 24, data.completionPercent);

  const kx = ML + leadW + kpiGap;
  drawKpiCard(doc, kx, y, smallW, kpiH, 'Total cables', String(data.cables.total));
  drawKpiCard(doc, kx + smallW + kpiGap, y, smallW, kpiH, 'Completed', String(data.cables.completed), { valueColor: C.teal });
  drawKpiCard(doc, kx + 2 * (smallW + kpiGap), y, smallW, kpiH, 'Remaining', String(data.cables.remaining), {
    valueColor: data.cables.remaining > 0 ? C.amber : C.slate600,
  });
  drawKpiCard(doc, kx + 3 * (smallW + kpiGap), y, smallW, kpiH, 'Assigned cable KPI', `${data.kpi}%`, {
    valueColor: progressColor(data.kpi),
  });
  y += kpiH + kpiGap;

  // Secondary row: open ends, rework, and the live status chip.
  const subW = (CW - 3 * kpiGap) / 4;
  const subH = 42;
  drawKpiCard(doc, ML, y, subW, subH, 'Open-end (src / dst)', `${data.cables.openEndSource} / ${data.cables.openEndDestination}`);
  drawKpiCard(doc, ML + subW + kpiGap, y, subW, subH, 'Rework', reworkLabel, {
    valueColor: data.rework.count > 0 ? C.amber : C.slate600,
  });
  const statusX = ML + 2 * (subW + kpiGap);
  const statusW = subW * 2 + kpiGap;
  drawBox(doc, statusX, y, statusW, subH, {
    fill: st.fill, stroke: st.border, strokeWidth: 0.75, radius: 5,
  });
  drawText(doc, 'CURRENT STATUS', statusX, y + 9, {
    font: F.bold, size: 6, color: C.slate500,
  }, { width: statusW, align: 'center', lineBreak: false, characterSpacing: 0.4 });
  drawText(doc, data.reportStatusLabel.toUpperCase(), statusX, y + 21, {
    font: F.bold, size: 12, color: st.text,
  }, { width: statusW, align: 'center', lineBreak: false, characterSpacing: 0.6 });
  y += subH + 14;

  // ── Execution timeline ────────────────────────────────────────────────────
  y = drawSectionHeading(doc, y, 'Execution timeline & duration');
  y = drawFieldGrid(doc, ML, y, CW, [
    ['Wiring start', fmtDateTime(data.wiring.startedAt)],
    ['Wiring completion', fmtDateTime(data.wiring.completedAt)],
    ['Wiring duration', data.wiring.durationHuman],
    ['Total working hours', data.totalWorkingHours],
    ['Technician login(s)', loginTimes],
    ['Technician logout(s)', logoutTimes],
  ], 2, 27);
  y += 4;

  // ── Remarks ───────────────────────────────────────────────────────────────
  y = drawSectionHeading(doc, y, 'Remarks & notes');
  const techRemarks = data.technicianRemarks.length ? data.technicianRemarks.join(' · ') : '—';
  const supRemarks = data.supervisorRemarks || data.rework.reason || '—';
  const remarksH = 56;
  drawBox(doc, ML, y, CW, remarksH, { fill: C.panel, stroke: C.border, strokeWidth: 0.75, radius: 5 });
  drawText(doc, 'TECHNICIAN', ML + 12, y + 9, {
    font: F.bold, size: 6, color: C.slate500,
  }, { lineBreak: false, characterSpacing: 0.4 });
  drawText(doc, clip(techRemarks, 108), ML + 92, y + 8, {
    font: F.reg, size: 8.5, color: C.ink,
  }, { width: CW - 104, lineBreak: false, ellipsis: true });
  drawDivider(doc, ML + 12, MR - 12, y + 28, { color: C.hairline });
  drawText(doc, 'SUPERVISOR', ML + 12, y + 36, {
    font: F.bold, size: 6, color: C.slate500,
  }, { lineBreak: false, characterSpacing: 0.4 });
  drawText(doc, clip(supRemarks, 108), ML + 92, y + 35, {
    font: F.reg, size: 8.5, color: C.ink,
  }, { width: CW - 104, lineBreak: false, ellipsis: true });
  y += remarksH + 14;

  // ── Approval & sign-off ───────────────────────────────────────────────────
  y = drawSectionHeading(doc, y, 'Approval & sign-off');
  const approvalChip = data.approval.approved
    ? `APPROVED${data.approval.approvedAt ? ` · ${fmtDateTime(data.approval.approvedAt)}` : ''}`
    : data.technician ? 'PENDING SUPERVISOR APPROVAL' : 'NOT YET ASSIGNED';
  const chipColor = data.approval.approved ? C.tealDeep : data.technician ? C.amber : C.slate500;
  const chipFill = data.approval.approved ? C.tealTint : data.technician ? C.amberSoft : C.panel;
  const chipW = 210;
  drawBox(doc, MR - chipW, y - 24, chipW, 15, { fill: chipFill, radius: 3 });
  drawText(doc, approvalChip, MR - chipW, y - 20, {
    font: F.bold, size: 6.5, color: chipColor,
  }, { width: chipW, align: 'center', lineBreak: false });

  const sigGap = 11;
  const sigW = (CW - 2 * sigGap) / 3;
  const sigH = 58;
  const supervisorSignName = data.approval.approvedBy?.fullName || data.supervisor?.fullName || data.generatedBy;
  const roles: { title: string; name: string; sub?: string }[] = [
    { title: 'Technician', name: data.technician?.fullName || '' },
    {
      title: 'Production Supervisor',
      name: supervisorSignName,
      sub: data.approval.approved && data.approval.approvedAt
        ? `Approved ${fmtDateTime(data.approval.approvedAt)}`
        : '',
    },
    { title: 'Client / Management', name: '' },
  ];
  roles.forEach((r, i) => {
    const x = ML + i * (sigW + sigGap);
    drawBox(doc, x, y, sigW, sigH, { fill: C.white, stroke: C.border, strokeWidth: 0.75, radius: 5 });
    drawText(doc, r.title.toUpperCase(), x + 9, y + 8, {
      font: F.bold, size: 6, color: C.slate500,
    }, { lineBreak: false, characterSpacing: 0.4 });
    if (r.name) {
      drawText(doc, clip(r.name, 26), x + 9, y + 20, {
        font: F.reg, size: 8.5, color: C.ink,
      }, { width: sigW - 18, lineBreak: false, ellipsis: true });
    }
    if (r.sub) {
      drawText(doc, clip(r.sub, 30), x + 9, y + 31, {
        font: F.reg, size: 6, color: C.tealDeep,
      }, { width: sigW - 18, lineBreak: false, ellipsis: true });
    }
    drawDivider(doc, x + 9, x + sigW - 9, y + 44, { color: C.slate300 });
    drawText(doc, 'Signature / Date', x + 9, y + 48, {
      font: F.reg, size: 6, color: C.slate400,
    }, { lineBreak: false });
  });
  y += sigH + 12;

  // Closing note fills the tail of the page so the sheet reads as balanced rather
  // than truncated, and states plainly what the document does (and does not) certify.
  const noteH = 30;
  drawBox(doc, ML, y, CW, noteH, { fill: C.tealTint, stroke: C.tealSoft, strokeWidth: 0.75, radius: 5 });
  const note = isCompletion
    ? 'This panel is fully wired and supervisor-approved. Figures are taken from the recorded execution data and this document certifies completion.'
    : 'This panel is still in execution. Figures reflect progress recorded to date; a Project Completion Report is issued only after full wiring and supervisor approval.';
  drawText(doc, note, ML + 12, y + 9, {
    font: F.reg, size: 7.5, color: C.tealDeep,
  }, { width: CW - 24, align: 'left' });

  // ── Footer ────────────────────────────────────────────────────────────────
  drawEnterpriseFooter(doc, {
    pageNumber: 1,
    totalPages: reportPageCount,
    projectCode: data.project.code,
    generatedAt: data.generatedAt,
    left: ML,
    right: MR,
    y: PAGE_H - 28,
    confidentialNote: 'Confidential — Management and Client Review Copy',
  });

  if (hasContributionPage) {
    doc.addPage({ size: 'A4', margin: 0 });
    drawBox(doc, 0, 0, PAGE_W, 54, { fill: C.charcoalDeep });
    drawBox(doc, 0, 54, PAGE_W, 2.5, { fill: C.teal });
    drawText(doc, 'TECHNICIAN CONTRIBUTION & MID CHANGE HISTORY', ML, 17, {
      font: F.bold, size: 12, color: C.white,
    }, { width: CW, lineBreak: false });
    drawText(doc, `${clip(data.project.name, 70)} · ${clip(data.panel.name, 50)}`, ML, 34, {
      font: F.reg, size: 7.5, color: C.slate300,
    }, { width: CW, lineBreak: false, ellipsis: true });

    let detailY = 76;
    const columns = [
      { label: 'Technician', x: ML, w: 105 },
      { label: 'Work period', x: ML + 105, w: 148 },
      { label: 'Duration', x: ML + 253, w: 58 },
      { label: 'Contribution', x: ML + 311, w: 112 },
      { label: 'Progress', x: ML + 423, w: 88 },
    ];
    drawBox(doc, ML, detailY, CW, 22, { fill: C.charcoal });
    columns.forEach(column => drawText(doc, column.label.toUpperCase(), column.x + 6, detailY + 7, {
      font: F.bold, size: 6, color: C.white,
    }, { width: column.w - 12, lineBreak: false }));
    detailY += 22;

    data.contributions.forEach((contribution, index) => {
      const rowH = 43;
      drawBox(doc, ML, detailY, CW, rowH, {
        fill: index % 2 === 0 ? C.white : C.panel,
        stroke: C.border,
        strokeWidth: 0.5,
      });
      const values = [
        `${contribution.technician.fullName}${contribution.technician.username ? ` (@${contribution.technician.username})` : ''}`,
        `${fmtDateTime(contribution.startedAt)} → ${contribution.endedAt ? fmtDateTime(contribution.endedAt) : 'Active'}`,
        contribution.durationHuman || '—',
        `${contribution.cablesCompleted} cables · ${contribution.sourceEndsCompleted} src · ${contribution.destinationEndsCompleted} dst`,
        `${contribution.progressBefore} → ${contribution.progressAfter}`,
      ];
      columns.forEach((column, columnIndex) => drawText(doc, values[columnIndex], column.x + 6, detailY + 7, {
        font: columnIndex === 0 ? F.bold : F.reg,
        size: 7,
        color: C.ink,
      }, { width: column.w - 12, height: rowH - 12, lineBreak: true, ellipsis: true }));
      detailY += rowH;
    });

    if (data.midChangeHistory.length > 0) {
      detailY += 14;
      detailY = drawSectionHeading(doc, detailY, 'Permanent Mid Change audit');
      data.midChangeHistory.forEach(entry => {
        drawText(doc, `${fmtDateTime(entry.at)} · ${entry.technicianName || 'Technician'} · ${entry.action.replace(/_/g, ' ')}`, ML + 8, detailY, {
          font: F.reg, size: 7.5, color: C.slate700,
        }, { width: CW - 16, lineBreak: false, ellipsis: true });
        detailY += 14;
      });
    }

    drawEnterpriseFooter(doc, {
      pageNumber: 2,
      totalPages: reportPageCount,
      projectCode: data.project.code,
      generatedAt: data.generatedAt,
      left: ML,
      right: MR,
      y: PAGE_H - 28,
      confidentialNote: 'Confidential — Management and Client Review Copy',
    });
  }

  doc.end();
  const raw = await done;
  const pdf = await PDFLibDocument.load(raw);
  if (pdf.getPageCount() > reportPageCount) {
    const trimmed = await PDFLibDocument.create();
    const pages = await trimmed.copyPages(pdf, Array.from({ length: reportPageCount }, (_, index) => index));
    pages.forEach(page => trimmed.addPage(page));
    return Buffer.from(await trimmed.save());
  }
  return raw;
}

export default buildPanelCompletionReportPdf;
