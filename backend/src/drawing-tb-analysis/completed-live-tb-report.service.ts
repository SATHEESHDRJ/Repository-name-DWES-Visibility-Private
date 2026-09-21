import { Injectable, Logger } from '@nestjs/common';
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import * as fs from 'fs';
import { FrameStore } from '../frames/frame-store';
import { MockStore } from '../data/mock-store';
import { AutomaticTbMarkerService } from './automatic-tb-marker.service';
import { normalizeDeviceName, isTerminalInRange, parseTerminalRange } from '../tb-markers/terminal-range';

export type GroupCompletionStatus =
  | 'completed'
  | 'partial'
  | 'issues'
  | 'mixed'
  | 'neutral';

export type OverviewGroup = {
  id: number;
  tb_number: string;
  terminal_group: string;
  page_number: number;
  geometry: any;
  status: GroupCompletionStatus;
  colour: string;
  total_wires: number;
  completed: number;
  skipped: number;
  open_ends: number;
  corrections: number;
};

const COLOURS: Record<GroupCompletionStatus, string> = {
  completed: '#16a34a',
  partial: '#d97706',
  issues: '#e11d48',
  mixed: '#64748b',
  neutral: '#94a3b8',
};

/** Report PDF palette (Phase 6): green / amber / red */
const REPORT_RGB: Record<'completed' | 'partial' | 'issues', { r: number; g: number; b: number }> = {
  completed: { r: 0.09, g: 0.64, b: 0.29 },
  partial: { r: 0.85, g: 0.47, b: 0.02 },
  issues: { r: 0.88, g: 0.11, b: 0.28 },
};

@Injectable()
export class CompletedLiveTbReportService {
  private readonly logger = new Logger(CompletedLiveTbReportService.name);

  constructor(private readonly markers: AutomaticTbMarkerService) {}

  async buildOverview(projectCode: string, frameId: string) {
    const pkg = FrameStore.getDrawingPackage(projectCode, frameId);
    const sha = pkg?.drawing_2d?.sha256 || null;
    const groups = await this.markers.listActiveGroups(projectCode, frameId, sha);
    const frame =
      MockStore.findFrameByProjectAndId(projectCode, frameId) ||
      FrameStore.getFrameFromDisk(projectCode, frameId);
    const cables = ((frame as any)?.cables || []) as any[];
    const cableStatus = ((frame as any)?.cable_status || {}) as Record<string, any>;

    const overview: OverviewGroup[] = groups.map(g => {
      const stats = this.statsForGroup(g.tb_number, g.terminal_group, cables, cableStatus);
      const status = this.aggregateStatus(stats);
      return {
        id: g.id,
        tb_number: g.tb_number,
        terminal_group: g.terminal_group,
        page_number: g.page_number,
        geometry: g.geometry,
        status,
        colour: COLOURS[status],
        ...stats,
      };
    });

    return {
      drawing_revision: pkg ? String(pkg.revision) : null,
      drawing_checksum: sha,
      groups: overview,
    };
  }

  /**
   * Phase 6: generate a NEW report PDF copy with completion overlays.
   * Never modifies the original uploaded GA.
   */
  async generatePdf(projectCode: string, frameId: string, _userId: number): Promise<Buffer | null> {
    const overview = await this.buildOverview(projectCode, frameId);
    const pkg = FrameStore.getDrawingPackage(projectCode, frameId);
    const asset = pkg?.drawing_2d;
    if (!asset?.id) return null;

    const sourcePath = FrameStore.getDrawingFilePath(projectCode, asset.id);
    if (!sourcePath || !fs.existsSync(sourcePath)) return null;

    try {
      const srcBytes = fs.readFileSync(sourcePath);
      const isPdf = /\.pdf$/i.test(asset.original_name || sourcePath) || asset.content_type?.includes('pdf');

      if (isPdf) {
        const srcDoc = await PDFDocument.load(srcBytes, { ignoreEncryption: true });
        const outDoc = await PDFDocument.create();
        const pages = await outDoc.copyPages(srcDoc, srcDoc.getPageIndices());
        for (const p of pages) outDoc.addPage(p);
        const font = await outDoc.embedFont(StandardFonts.HelveticaBold);

        for (const g of overview.groups) {
          const pageIndex = Math.max(0, (g.page_number || 1) - 1);
          if (pageIndex >= outDoc.getPageCount()) continue;
          const page = outDoc.getPage(pageIndex);
          const { width, height } = page.getSize();
          const geom = g.geometry || {};
          const x = Number(geom.x) * width;
          const y = height - (Number(geom.y) + Number(geom.height)) * height;
          const w = Number(geom.width) * width;
          const h = Number(geom.height) * height;
          const tone =
            g.status === 'completed'
              ? REPORT_RGB.completed
              : g.status === 'partial' || g.status === 'mixed' || g.status === 'neutral'
                ? REPORT_RGB.partial
                : REPORT_RGB.issues;
          page.drawRectangle({
            x,
            y,
            width: w,
            height: h,
            borderColor: rgb(tone.r, tone.g, tone.b),
            borderWidth: 2,
            color: rgb(tone.r, tone.g, tone.b),
            opacity: 0.12,
            borderOpacity: 1,
          });
          page.drawText(
            `${g.tb_number} ${g.terminal_group} · ${g.completed}/${g.total_wires}`,
            {
              x: x,
              y: Math.min(height - 12, y + h + 4),
              size: 9,
              font,
              color: rgb(tone.r, tone.g, tone.b),
            },
          );
        }

        // Legend page appendix
        const legend = outDoc.addPage([595, 160]);
        legend.drawText('Completed LIVE TB Report — read-only overlay copy', {
          x: 40,
          y: 130,
          size: 12,
          font,
        });
        legend.drawText(
          `Project ${projectCode} · Panel ${frameId} · Green=completed · Amber=partial · Red=skipped/open-end/correction`,
          { x: 40, y: 110, size: 9, font },
        );
        legend.drawText('Original uploaded GA was not modified.', {
          x: 40,
          y: 90,
          size: 9,
          font,
        });

        const bytes = await outDoc.save();
        return Buffer.from(bytes);
      }

      // Image GA: create simple PDF with note (full image embed optional)
      const outDoc = await PDFDocument.create();
      const page = outDoc.addPage([595, 842]);
      const font = await outDoc.embedFont(StandardFonts.Helvetica);
      page.drawText('Completed LIVE TB Report', { x: 40, y: 800, size: 14, font });
      page.drawText(`Project ${projectCode} frame ${frameId}`, { x: 40, y: 780, size: 10, font });
      page.drawText('Source drawing is an image; overlay summary:', { x: 40, y: 760, size: 10, font });
      let y = 740;
      for (const g of overview.groups.slice(0, 40)) {
        page.drawText(
          `${g.tb_number} ${g.terminal_group}: ${g.status} (${g.completed}/${g.total_wires})`,
          { x: 40, y, size: 9, font },
        );
        y -= 14;
        if (y < 40) break;
      }
      return Buffer.from(await outDoc.save());
    } catch (err: any) {
      this.logger.warn(`Report PDF failed: ${err?.message || err}`);
      return null;
    }
  }

  private statsForGroup(
    tbNumber: string,
    terminalGroup: string,
    cables: any[],
    cableStatus: Record<string, any>,
  ) {
    const tb = normalizeDeviceName(tbNumber);
    const range = parseTerminalRange(terminalGroup);
    let total = 0;
    let completed = 0;
    let skipped = 0;
    let open_ends = 0;
    let corrections = 0;

    cables.forEach((c, idx) => {
      const src = normalizeDeviceName(String(c.source_device || ''));
      const dst = normalizeDeviceName(String(c.dest_device || c.destination_device || ''));
      const srcTerm = String(c.source_terminal || '');
      const dstTerm = String(c.dest_terminal || '');
      const touches =
        (src === tb && isTerminalInRange(srcTerm, range)) ||
        (dst === tb && isTerminalInRange(dstTerm, range));
      if (!touches) return;
      total += 1;
      const key = String(c.id ?? c.ref ?? c.sno ?? idx);
      const st = cableStatus[key] || cableStatus[String(idx)] || {};
      const status = String(st.status || st.state || c.status || '').toLowerCase();
      if (status.includes('complete') || status.includes('done') || status === 'finished') {
        completed += 1;
      } else if (status.includes('skip')) {
        skipped += 1;
      }
      if (st.open_side || st.source_open_end || st.dest_open_end || st.open_end) open_ends += 1;
      if (st.correction || st.has_correction || (Array.isArray(st.corrections) && st.corrections.length)) {
        corrections += 1;
      }
    });

    return { total_wires: total, completed, skipped, open_ends, corrections };
  }

  private aggregateStatus(stats: {
    total_wires: number;
    completed: number;
    skipped: number;
    open_ends: number;
    corrections: number;
  }): GroupCompletionStatus {
    if (stats.corrections > 0 || stats.skipped > 0 || stats.open_ends > 0) return 'issues';
    if (stats.total_wires === 0) return 'neutral';
    if (stats.completed >= stats.total_wires) return 'completed';
    if (stats.completed > 0) return 'partial';
    return 'mixed';
  }
}
