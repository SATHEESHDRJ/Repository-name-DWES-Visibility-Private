import { Injectable, NotFoundException } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import * as PDFDocument from 'pdfkit';
import { PDFDocument as PDFLibDocument, StandardFonts, rgb } from 'pdf-lib';
import { PrismaService } from '../prisma/prisma.service';
import { MockStore, Cable, Drawing } from '../data/mock-store';
import { FrameStore } from '../frames/frame-store';
import { parseCableStatus, cableStatusCounts } from '../common/cable-status.util';
import { wiringKpiPercent, compositeKpiPercent } from '../common/kpi.constants';
import { drawEnterpriseFooter, drawEnterpriseHeader, pageBox } from '../common/pdf-report-layout';

const COMPANY = 'Ingenious Network FZC';
const DOC_TITLE = 'Digital Wiring Execution System';

const PAGE_W = 842;
const PAGE_H = 595;
const M_LEFT = 24;
const M_RIGHT = 24;
const M_TOP = 28;
const M_BOTTOM = 32;
const FOOTER_H = 18;
const ROW_MIN = 10;

interface TableCol {
  key: string;
  label: string;
  w: number;
  align?: 'left' | 'center' | 'right';
}

const TABLE_COLS: TableCol[] = [
  { key: 'sno', label: 'S.No', w: 24, align: 'center' },
  { key: 'panel', label: 'Panel', w: 36 },
  { key: 'device', label: 'Device', w: 40 },
  { key: 'terminal', label: 'Terminal', w: 34 },
  { key: 'termA', label: 'Term A', w: 30 },
  { key: 'termB', label: 'Term B', w: 30 },
  { key: 'ferrule', label: 'Ferrule', w: 52 },
  { key: 'source', label: 'Source', w: 52 },
  { key: 'destination', label: 'Destination', w: 52 },
  { key: 'ref', label: 'Ref/Path', w: 40 },
  { key: 'color', label: 'Color', w: 44 },
  { key: 'size', label: 'Size', w: 38 },
  { key: 'sign', label: 'Sign', w: 28 },
  { key: 'length', label: 'Len(m)', w: 32, align: 'center' },
  { key: 'src', label: 'Src', w: 22, align: 'center' },
  { key: 'dst', label: 'Dst', w: 22, align: 'center' },
  { key: 'remarks', label: 'Remarks', w: 58 },
];

const TABLE_W = TABLE_COLS.reduce((s, c) => s + c.w, 0);

const COLOR_SWATCH: Record<string, string> = {
  grey: '#9ca3af', gray: '#9ca3af',
  blue: '#2563eb',
  red: '#dc2626',
  green: '#16a34a',
  yellow: '#eab308',
  black: '#1f2937',
  white: '#f8fafc',
  brown: '#92400e',
  orange: '#ea580c',
  violet: '#7c3aed',
  purple: '#9333ea',
};

function uploadRoot(): string {
  const raw = process.env.UPLOAD_DIR || 'uploads';
  return path.isAbsolute(raw) ? raw : path.join(process.cwd(), raw);
}

function clip(text: string, max: number): string {
  const s = String(text ?? '').replace(/\s+/g, ' ').trim();
  if (s.length <= max) return s;
  return s.slice(0, max - 1) + '…';
}

function colorHex(name: string): string | null {
  const n = (name || '').toLowerCase();
  for (const [key, hex] of Object.entries(COLOR_SWATCH)) {
    if (n.includes(key)) return hex;
  }
  if (n.includes('green') && n.includes('yellow')) return '#84cc16';
  return null;
}

function parseProjectSegments(code: string): { region: string; location: string; voltage: string } {
  const parts = code.split('_');
  // Legacy: PANELTYPE_VOLTAGE_REGION_LOCATION_YEAR_SEQ; current: VOLTAGE_REGION_LOCATION_YEAR_SEQ
  if (parts.length >= 6) {
    return { voltage: parts[1] || '', region: parts[2] || '', location: parts[3] || '' };
  }
  return { voltage: parts[0] || '', region: parts[1] || '', location: parts[2] || '' };
}

function findGaDrawing(projectCode: string): Drawing | null {
  const drawings = MockStore.findDrawingsByProject(projectCode);
  if (drawings.length) {
    const gaNamed = drawings.find(d => /ga|general.?arrangement/i.test(d.original_name));
    if (gaNamed) return gaNamed;
    const pdf = drawings.find(d => /\.pdf$/i.test(d.original_name) || d.content_type === 'application/pdf');
    if (pdf) return pdf;
    return drawings.find(d => /^image\//.test(d.content_type) || /\.(png|jpe?g|webp)$/i.test(d.original_name)) || null;
  }
  const dir = path.join(uploadRoot(), projectCode, 'drawings');
  if (!fs.existsSync(dir)) return null;
  for (const file of fs.readdirSync(dir)) {
    if (/ga|general.?arrangement/i.test(file)) {
      return {
        id: file.split('_')[0] || file,
        project_code: projectCode,
        filename: file,
        original_name: file.includes('_') ? file.slice(file.indexOf('_') + 1) : file,
        content_type: file.toLowerCase().endsWith('.pdf') ? 'application/pdf' : 'application/octet-stream',
        uploaded_at: '',
        size: 0,
      };
    }
  }
  return null;
}

function readDrawingBuffer(projectCode: string, drawing: Drawing): Buffer | null {
  const fromStore = FrameStore.getDrawingFile(projectCode, drawing.id);
  if (fromStore) return fromStore.buffer;
  const filePath = FrameStore.getDrawingFilePath(projectCode, drawing.id);
  if (filePath && fs.existsSync(filePath)) return fs.readFileSync(filePath);
  return null;
}

function cableRowCells(
  c: Cable,
  idx: number,
  cs: Record<string, { src?: boolean; dst?: boolean; note?: string }>,
  panelDefault: string,
) {
  const st = cs[String(idx)] || {};
  const note = st.note || c.remarks || '';
  return {
    sno: String(c.sno ?? idx + 1),
    panel: c.panel || panelDefault,
    device: c.source_device || c.dest_device || '',
    terminal: [c.source_terminal, c.dest_terminal].filter(Boolean).join('/') || '',
    termA: c.source_terminal || '',
    termB: c.dest_terminal || '',
    ferrule: c.ferrule || (c.source && c.destination ? `${c.source}/${c.destination}` : ''),
    source: c.source || '',
    destination: c.destination || '',
    ref: c.ref || c.path || c.rack || '',
    color: c.color || '',
    size: c.size || '',
    sign: c.sign || '',
    length: (c.length || '').replace(/m$/i, '').trim() || c.length || '',
    src: st.src ? 'Y' : '',
    dst: st.dst ? 'Y' : '',
    remarks: note,
  };
}

@Injectable()
export class WiringDocumentService {
  constructor(private prisma: PrismaService) {}

  async generateFrameDocument(
    projectCode: string,
    frameId: string,
    generatedBy = '',
  ): Promise<{ buffer: Buffer; filename: string }> {
    const project = await this.prisma.projects.findUnique({ where: { code: projectCode } });
    if (!project) throw new NotFoundException(`Project ${projectCode} not found`);

    const frame = MockStore.findFrameByProjectAndId(projectCode, frameId)
      ?? FrameStore.getFrameFromDisk(projectCode, frameId);
    if (!frame) throw new NotFoundException(`Frame ${frameId} not found`);

    const cables = Array.isArray(frame.cables) ? frame.cables : [];
    const assignment = await this.prisma.tech_assignments.findFirst({
      where: { project_code: projectCode, frame_id: frameId },
      orderBy: { assigned_at: 'desc' },
    });

    const cableStatus = parseCableStatus(assignment?.cable_status);
    const total = cables.length;
    const counts = cableStatusCounts(cableStatus, total);
    const srcDone = assignment?.cables_src_done ?? counts.srcDone;
    const dstDone = assignment?.cables_dst_done ?? counts.dstDone;
    const wiringKpi = wiringKpiPercent(srcDone, dstDone, total || assignment?.cables_total || 0);

    let qcPassRate = 0;
    if (assignment) {
      const inspections = await this.prisma.panel_inspections.findMany({ where: { assignment_id: assignment.id } });
      if (inspections.length) {
        qcPassRate = Math.round((inspections.filter(i => i.overall_result === 'PASS').length / inspections.length) * 100);
      }
    }
    const composite = compositeKpiPercent(wiringKpi, qcPassRate);

    let techName = '';
    if (assignment?.technician_id) {
      const tech = await this.prisma.users.findUnique({ where: { id: assignment.technician_id } });
      techName = tech?.full_name || tech?.username || '';
    }

    const mainBuffer = await this.buildCablePdf({
      project,
      frame,
      cables,
      cableStatus,
      generatedBy,
      techName,
      segs: parseProjectSegments(projectCode),
      wiringKpi,
      composite,
      qcPassRate,
      srcDone,
      dstDone,
      counts,
      dwgNo: frame.original_filename || '',
    });

    const finalBuffer = await this.appendGaSection(mainBuffer, projectCode, findGaDrawing(projectCode));
    const safePanel = (frame.panel_name || frameId).replace(/[^a-zA-Z0-9_\-]/g, '_').slice(0, 40);
    return { buffer: finalBuffer, filename: `${projectCode}_${safePanel}_wiring_document.pdf` };
  }

  private async buildCablePdf(ctx: {
    project: { code: string; name: string; client: string | null; project_state: string | null };
    frame: { id: string; panel_name: string; original_filename?: string };
    cables: Cable[];
    cableStatus: Record<string, { src?: boolean; dst?: boolean; note?: string }>;
    generatedBy: string;
    techName: string;
    segs: { region: string; location: string; voltage: string };
    wiringKpi: number;
    composite: number;
    qcPassRate: number;
    srcDone: number;
    dstDone: number;
    counts: { bothDone: number; pending: number };
    dwgNo: string;
  }): Promise<Buffer> {
    const { project, frame, cables, cableStatus, generatedBy, techName, segs, wiringKpi, composite, qcPassRate, srcDone, dstDone, counts, dwgNo } = ctx;
    const panelDefault = frame.panel_name || '';

    return new Promise((resolve, reject) => {
      const generatedAt = new Date();
      const doc = new PDFDocument({
        size: [PAGE_W, PAGE_H],
        margin: 0,
        bufferPages: true,
        info: { Title: `Wiring Schedule — ${frame.panel_name}`, Author: DOC_TITLE },
      });
      const chunks: Buffer[] = [];
      doc.on('data', (c: Buffer) => chunks.push(c));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      let pageNum = 1;
      let y = 0;
      const box = pageBox(doc, { marginLeft: M_LEFT, marginRight: M_RIGHT, marginTop: M_TOP, marginBottom: M_BOTTOM });
      const bottomY = box.bottom - FOOTER_H;

      const drawFooter = () => {
        drawEnterpriseFooter(doc, {
          pageNumber: pageNum,
          projectCode: project.code,
          generatedAt,
          left: box.left,
          right: box.right,
          y: box.bottom - 6,
        });
      };

      y = drawEnterpriseHeader(doc, {
        title: `Wiring Schedule — ${frame.panel_name}`,
        subtitle: `${DOC_TITLE} · ${COMPANY}`,
        docRef: `FRAME-${project.code.replace(/_/g, '-')}-${frame.id}`,
        left: box.left,
        right: box.right,
        top: box.top,
      });

      const metaY = y;
      const metaH = 92;
      doc.roundedRect(box.left, metaY, box.width, metaH, 6).stroke('#cbd5e1');
      doc.fontSize(8).font('Helvetica').fillColor('#334155');
      const lines: [string, string][] = [
        ['Project', `${project.name} (${project.code.replace(/_/g, ' ')})`],
        ['Client', project.client || '—'],
        ['Region / Location', [segs.region, segs.location].filter(Boolean).join(' / ') || '—'],
        ['Voltage', segs.voltage || '—'],
        ['Frame ID', frame.id],
        ['DWG / Schedule', dwgNo || '—'],
        ['Total Cables', String(cables.length)],
        ['Technician', techName || '—'],
        ['Generated', `${generatedAt.toISOString().slice(0, 16).replace('T', ' ')} UTC`],
        ['Generated By', generatedBy || '—'],
      ];
      let ty = metaY + 8;
      lines.forEach(([label, val], i) => {
        const col = i % 2;
        const row = Math.floor(i / 2);
        const x = box.left + 8 + col * (box.width / 2);
        doc.font('Helvetica-Bold').text(`${label}: `, x, ty + row * 14, { continued: true, width: 90 });
        doc.font('Helvetica').text(String(val), { width: Math.max(140, box.width / 2 - 24), lineBreak: false, ellipsis: true });
      });
      doc.fontSize(8).font('Helvetica-Bold').fillColor('#1e40af')
        .text(
          `Summary: ${cables.length} cables  ·  Verified: ${counts.bothDone}  ·  Pending: ${counts.pending}  ·  Src ${srcDone}/${cables.length}  ·  Dst ${dstDone}/${cables.length}  ·  Wiring KPI ${wiringKpi}%  ·  Composite KPI ${composite}% (QC ${qcPassRate}%)`,
          box.left + 8,
          metaY + metaH - 14,
          { width: box.width - 16, lineBreak: false, ellipsis: true },
        );

      const drawTableHeader = (atY: number) => {
        let x = M_LEFT;
        doc.rect(M_LEFT, atY, TABLE_W, 12).fill('#1e3a5c');
        TABLE_COLS.forEach(col => {
          doc.fontSize(5.5).font('Helvetica-Bold').fillColor('#ffffff')
            .text(col.label, x + 2, atY + 2, { width: col.w - 4, align: col.align || 'left', lineBreak: false });
          x += col.w;
        });
        return atY + 12;
      };

      const rowHeight = (cells: Record<string, string>) => {
        const rem = cells.remarks || '';
        if (!rem) return ROW_MIN;
        const h = doc.heightOfString(rem, { width: TABLE_COLS.find(c => c.key === 'remarks')!.w - 4 });
        return Math.max(ROW_MIN, h + 4);
      };

      const drawRow = (cells: Record<string, string>, atY: number, zebra: boolean, rh: number) => {
        if (zebra) doc.rect(M_LEFT, atY, TABLE_W, rh).fill('#f8fafc');
        let x = M_LEFT;
        TABLE_COLS.forEach(col => {
          doc.rect(x, atY, col.w, rh).stroke('#e2e8f0');
          if (col.key === 'color') {
            const hex = colorHex(cells.color);
            if (hex) doc.rect(x + 2, atY + 2, 8, rh - 4).fill(hex).stroke('#94a3b8');
            doc.fontSize(5).font('Helvetica').fillColor('#0f172a')
              .text(cells.color || '', x + 12, atY + 2, { width: col.w - 14, lineBreak: false });
          } else {
            const val = cells[col.key] || '';
            doc.fontSize(5).font('Helvetica').fillColor('#0f172a')
              .text(col.key === 'remarks' ? val : clip(val, 28), x + 2, atY + 2, {
                width: col.w - 4,
                align: col.align || 'left',
                lineBreak: col.key === 'remarks',
              });
          }
          x += col.w;
        });
      };

      y = drawTableHeader(metaY + metaH + 8);
      drawFooter();

      cables.forEach((cable, idx) => {
        const cells = cableRowCells(cable, idx, cableStatus, panelDefault);
        const rh = rowHeight(cells);
        if (y + rh > bottomY) {
          doc.addPage({ size: [PAGE_W, PAGE_H], margin: 0 });
          pageNum++;
          const pageHeaderBottom = drawEnterpriseHeader(doc, {
            title: `Wiring Schedule — ${frame.panel_name}`,
            subtitle: `${project.code.replace(/_/g, ' ')} · ${frame.id}`,
            docRef: `FRAME-${project.code.replace(/_/g, '-')}-${frame.id}`,
            left: box.left,
            right: box.right,
            top: box.top,
            logoHeight: 20,
          });
          y = drawTableHeader(pageHeaderBottom + 4);
          drawFooter();
        }
        drawRow(cells, y, idx % 2 === 0, rh);
        y += rh;
      });

      doc.end();
    });
  }

  private async appendGaSection(mainBuffer: Buffer, projectCode: string, gaDrawing: Drawing | null): Promise<Buffer> {
    if (!gaDrawing) return this.addGaPlaceholderPage(mainBuffer, 'No GA drawing uploaded for this project.');

    const ext = gaDrawing.original_name.split('.').pop()?.toLowerCase() || '';
    if (ext === 'dwg' || gaDrawing.content_type.includes('dwg')) {
      return this.addGaPlaceholderPage(
        mainBuffer,
        `GA drawing: ${gaDrawing.original_name} — DWG format; download separately from the Drawings tab.`,
      );
    }

    const buf = readDrawingBuffer(projectCode, gaDrawing);
    if (!buf) {
      return this.addGaPlaceholderPage(mainBuffer, `GA drawing record found (${gaDrawing.original_name}) but file missing on disk.`);
    }

    if (ext === 'pdf' || gaDrawing.content_type === 'application/pdf') {
      try {
        const merged = await PDFLibDocument.create();
        const main = await PDFLibDocument.load(mainBuffer);
        const ga = await PDFLibDocument.load(buf);
        (await merged.copyPages(main, main.getPageIndices())).forEach(p => merged.addPage(p));

        const labelDoc = await PDFLibDocument.create();
        const lp = labelDoc.addPage([PAGE_W, PAGE_H]);
        const bold = await labelDoc.embedFont(StandardFonts.HelveticaBold);
        const regular = await labelDoc.embedFont(StandardFonts.Helvetica);
        lp.drawText('General Arrangement (GA)', { x: 40, y: PAGE_H - 60, size: 16, font: bold, color: rgb(0.1, 0.23, 0.36) });
        lp.drawText(gaDrawing.original_name, { x: 40, y: PAGE_H - 82, size: 10, font: regular, color: rgb(0.2, 0.25, 0.33) });
        (await merged.copyPages(await PDFLibDocument.load(await labelDoc.save()), [0])).forEach(p => merged.addPage(p));
        (await merged.copyPages(ga, ga.getPageIndices())).forEach(p => merged.addPage(p));
        return Buffer.from(await merged.save());
      } catch {
        return this.addGaPlaceholderPage(mainBuffer, `GA PDF (${gaDrawing.original_name}) could not be embedded — download separately.`);
      }
    }

    if (/^(png|jpe?g|webp|gif)$/i.test(ext) || gaDrawing.content_type.startsWith('image/')) {
      return this.addGaImagePage(mainBuffer, buf, gaDrawing.original_name);
    }

    return this.addGaPlaceholderPage(mainBuffer, `GA file: ${gaDrawing.original_name} — unsupported format for embedding.`);
  }

  private async mergeAppendix(mainBuffer: Buffer, appendixBuffer: Buffer): Promise<Buffer> {
    const merged = await PDFLibDocument.create();
    const main = await PDFLibDocument.load(mainBuffer);
    const appendix = await PDFLibDocument.load(appendixBuffer);
    (await merged.copyPages(main, main.getPageIndices())).forEach(p => merged.addPage(p));
    (await merged.copyPages(appendix, appendix.getPageIndices())).forEach(p => merged.addPage(p));
    return Buffer.from(await merged.save());
  }

  private async addGaPlaceholderPage(mainBuffer: Buffer, message: string): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ size: [PAGE_W, PAGE_H], margin: 0 });
      const chunks: Buffer[] = [];
      doc.on('data', (c: Buffer) => chunks.push(c));
      doc.on('end', () => { this.mergeAppendix(mainBuffer, Buffer.concat(chunks)).then(resolve).catch(reject); });
      doc.on('error', reject);
      doc.fontSize(14).font('Helvetica-Bold').fillColor('#1a3a5c').text('General Arrangement (GA)', M_LEFT, M_TOP);
      doc.fontSize(10).font('Helvetica').fillColor('#475569').text(message, M_LEFT, M_TOP + 30, { width: PAGE_W - M_LEFT - M_RIGHT });
      doc.end();
    });
  }

  private async addGaImagePage(mainBuffer: Buffer, imageBuffer: Buffer, filename: string): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ size: [PAGE_W, PAGE_H], margin: 0 });
      const chunks: Buffer[] = [];
      doc.on('data', (c: Buffer) => chunks.push(c));
      doc.on('end', () => { this.mergeAppendix(mainBuffer, Buffer.concat(chunks)).then(resolve).catch(reject); });
      doc.on('error', reject);
      doc.fontSize(14).font('Helvetica-Bold').fillColor('#1a3a5c').text('General Arrangement (GA)', M_LEFT, M_TOP);
      doc.fontSize(8).font('Helvetica').fillColor('#64748b').text(filename, M_LEFT, M_TOP + 20);
      try {
        doc.image(imageBuffer, M_LEFT, M_TOP + 36, {
          fit: [PAGE_W - M_LEFT - M_RIGHT, PAGE_H - M_TOP - M_BOTTOM - 40],
          align: 'center',
          valign: 'center',
        });
      } catch {
        doc.fontSize(10).fillColor('#dc2626').text('Could not render image preview.', M_LEFT, M_TOP + 50);
      }
      doc.end();
    });
  }
}
