/**
 * Formal CRIMPING / WIRE PREPARATION REPORT PDF — landscape A4.
 * Consumes getCrimpingReport projection only (no invented leg values).
 */
import * as PDFDocument from 'pdfkit';
import {
  REPORT_COMPANY,
  REPORT_SYSTEM,
  resolveReportLogoPath,
} from './report-branding';
import type { CrimpingReportProjection } from './crimping-report';

const PAGE_W = 841.89; // landscape A4
const PAGE_H = 595.28;
const ML = 28;
const MR = PAGE_W - 28;

function cellText(cell: { value: string | null; available: boolean } | null | undefined): string {
  if (!cell || !cell.available || cell.value == null || String(cell.value).trim() === '') {
    return 'NOT AVAILABLE';
  }
  return String(cell.value);
}

function st(v: string | undefined): string {
  if (!v || v === 'NOT_STARTED') return 'PENDING';
  if (v === 'COMPLETED') return 'COMPLETE';
  if (v === 'NOT_APPLICABLE') return 'N/A';
  return v;
}

export async function buildCrimpingReportPdf(
  report: CrimpingReportProjection,
  opts?: { scope?: 'all' | 'complete' | 'partial' | 'pending' | 'rework' },
): Promise<Buffer> {
  const scope = opts?.scope || 'all';
  const rows = (report.wireRows || []).filter((r) => {
    if (scope === 'all') return true;
    if (scope === 'complete') return r.overall === 'COMPLETED';
    if (scope === 'partial') return r.overall === 'PARTIAL';
    if (scope === 'pending') return r.overall === 'NOT_STARTED' || r.overall === 'NOT_REQUIRED';
    if (scope === 'rework') return r.overall === 'REWORK_REQUIRED'
      || r.source.crimpingStatus === 'REWORK_REQUIRED'
      || r.destination.crimpingStatus === 'REWORK_REQUIRED';
    return true;
  });

  const doc = new PDFDocument({
    size: [PAGE_W, PAGE_H],
    margins: { top: 28, bottom: 28, left: ML, right: 28 },
    info: {
      Title: 'Stripping & Crimping Report',
      Author: REPORT_COMPANY,
      Subject: `${report.metadata.projectCode} / ${report.metadata.panelName}`,
    },
  });

  const chunks: Buffer[] = [];
  doc.on('data', (c: Buffer) => chunks.push(c));

  const logo = resolveReportLogoPath();
  if (logo) {
    try { doc.image(logo, ML, 20, { height: 28 }); } catch { /* ignore missing logo */ }
  }
  doc.fontSize(14).fillColor('#0F172A').text('CRIMPING / WIRE PREPARATION REPORT', ML + 90, 24, { width: 420 });
  doc.fontSize(8).fillColor('#64748B').text(REPORT_SYSTEM, ML + 90, 42);

  const m = report.metadata;
  const s = report.summary;
  doc.moveDown(1.5);
  doc.fontSize(9).fillColor('#111827');
  doc.text(`Project: ${m.projectCode}   Panel: ${m.panelName}   Frame: ${m.frameId}`);
  doc.text(`Technician: ${m.technicianName || m.technicianId || '—'}   Generated: ${new Date(m.generatedAt).toLocaleString()}`);
  doc.moveDown(0.5);
  doc.fontSize(8).fillColor('#334155');
  doc.text(
    `Total ${s.totalWires}  |  Preparation Required ${s.required}  |  Cut ${s.cut ?? 0}  |  Both Ends Stripped ${s.stripped ?? 0}  |  Both Ends Crimped ${s.crimped ?? 0}  |  `
    + `Ready for Wiring ${s.readyForWiring ?? s.completed}  |  Open Rework ${s.openRework ?? s.rework ?? 0}  |  `
    + `QA Hold ${s.qaHold ?? 0}  |  Legacy Partial ${s.legacyPartial ?? 0}  |  `
    + `Complete ${s.completed}  |  Partial ${s.partial}  |  Pending ${s.pending}  |  `
    + `% ${s.percent} (of required)`,
  );

  doc.moveDown(0.8);
  doc.fontSize(7).fillColor('#0F172A');
  const headerY = doc.y;
  const cols = [
    { x: ML, w: 28, h: 'Wire' },
    { x: ML + 28, w: 50, h: 'Ferrule' },
    { x: ML + 78, w: 70, h: 'Src Dev' },
    { x: ML + 148, w: 40, h: 'Src Leg#' },
    { x: ML + 188, w: 40, h: 'Src Size' },
    { x: ML + 228, w: 36, h: 'SrcClr' },
    { x: ML + 264, w: 36, h: 'S.Strip' },
    { x: ML + 300, w: 36, h: 'S.Crimp' },
    { x: ML + 336, w: 70, h: 'Dst Dev' },
    { x: ML + 406, w: 40, h: 'Dst Leg#' },
    { x: ML + 446, w: 40, h: 'Dst Size' },
    { x: ML + 486, w: 36, h: 'DstClr' },
    { x: ML + 522, w: 36, h: 'D.Strip' },
    { x: ML + 558, w: 36, h: 'D.Crimp' },
    { x: ML + 594, w: 50, h: 'Overall' },
    { x: ML + 644, w: 40, h: 'Ready' },
    { x: ML + 684, w: 80, h: 'Group' },
  ];
  for (const c of cols) {
    doc.text(c.h, c.x, headerY, { width: c.w, ellipsis: true });
  }
  doc.moveTo(ML, headerY + 12).lineTo(MR, headerY + 12).strokeColor('#CBD5E1').stroke();

  let y = headerY + 16;
  for (const row of rows) {
    if (y > PAGE_H - 40) {
      doc.addPage({ size: [PAGE_W, PAGE_H], margins: { top: 28, bottom: 28, left: ML, right: 28 } });
      y = 28;
      doc.fontSize(8).fillColor('#64748B').text('CRIMPING / WIRE PREPARATION REPORT (continued)', ML, y);
      y += 16;
    }
    const vals = [
      String(row.sno),
      row.ferrule || '—',
      row.source.device || '—',
      cellText(row.source.legNumber),
      cellText(row.source.legSize),
      cellText(row.source.legColor),
      st(row.source.strippingStatus),
      st(row.source.crimpingStatus),
      row.destination.device || '—',
      cellText(row.destination.legNumber),
      cellText(row.destination.legSize),
      cellText(row.destination.legColor),
      st(row.destination.strippingStatus),
      st(row.destination.crimpingStatus),
      row.overall,
      row.readyForWiring ? 'YES' : 'NO',
      row.groupKey,
    ];
    doc.fontSize(6.5).fillColor('#111827');
    cols.forEach((c, i) => {
      doc.text(String(vals[i] ?? ''), c.x, y, { width: c.w, ellipsis: true, lineBreak: false });
    });
    y += 11;
  }

  // Detail continuation for required wires (full SRC/DST independence)
  for (const row of rows.filter(r => r.crimpingRequired)) {
    doc.addPage({ size: [PAGE_W, PAGE_H], margins: { top: 28, bottom: 28, left: ML, right: 28 } });
    doc.fontSize(11).fillColor('#0F172A').text(`Wire ${row.sno} / ${row.ferrule || '—'} — Detail`);
    doc.fontSize(8).fillColor('#334155');
    doc.text(`Size ${row.wireSize || '—'} · Color ${row.wireColor || '—'} · Length ${row.length || '—'} · Open ${row.openEnd || 'none'}`);
    doc.text(`Overall ${row.overall} · Ready ${row.readyForWiring ? 'YES' : 'NO'} · Wiring SRC ${row.wiringSrc ? 'Y' : 'N'} / DST ${row.wiringDst ? 'Y' : 'N'}`);
    doc.moveDown(0.4);
    for (const end of ['source', 'destination'] as const) {
      const e = row[end];
      doc.fontSize(9).fillColor('#0F172A').text(end.toUpperCase());
      doc.fontSize(8).fillColor('#334155');
      doc.text(`Device ${e.device || '—'} · Terminal ${e.terminal || '—'} · Side ${e.side || '—'}`);
      doc.text(`Leg No ${cellText(e.legNumber)} · Leg Size ${cellText(e.legSize)} · Leg Color ${cellText(e.legColor)}`);
      doc.text(`Ferrule Type ${cellText(e.ferruleType)} · Marking ${cellText(e.ferruleMarking)}`);
      doc.text(`Strip ${st(e.strippingStatus)} by ${e.strippedBy ?? '—'} at ${e.strippedAt || '—'}`);
      doc.text(`Crimp ${st(e.crimpingStatus)} by ${e.crimpedBy ?? '—'} at ${e.crimpedAt || '—'}`);
      doc.moveDown(0.3);
    }
  }

  doc.end();
  await new Promise<void>((resolve) => doc.on('end', () => resolve()));
  return Buffer.concat(chunks);
}
