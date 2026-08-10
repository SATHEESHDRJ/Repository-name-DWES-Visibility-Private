import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type { TbGroupCandidate } from './expected-headers';

@Injectable()
export class AutomaticTbMarkerService {
  private readonly logger = new Logger(AutomaticTbMarkerService.name);

  constructor(private readonly prisma: PrismaService) {}

  /** Supersede ACTIVE auto markers for a prior checksum on this panel. */
  async supersedeForChecksum(
    projectCode: string,
    frameId: string,
    oldChecksum: string | null | undefined,
  ): Promise<number> {
    if (!oldChecksum) return 0;
    try {
      const result = await this.prisma.tb_markers.updateMany({
        where: {
          project_code: projectCode,
          frame_id: frameId,
          drawing_checksum: oldChecksum,
          marker_status: 'ACTIVE',
          created_automatically: true,
        },
        data: { marker_status: 'SUPERSEDED', updated_at: new Date() },
      });
      return result.count;
    } catch (err: any) {
      this.logger.warn(`supersede skipped: ${err?.message || err}`);
      return 0;
    }
  }

  /** Persist only HIGH-confidence TB_GROUP markers for the current drawing revision. */
  async persistHighCandidates(input: {
    projectCode: string;
    frameId: string;
    drawingRevision: string;
    drawingChecksum: string;
    analysisRunId: string;
    createdBy: number;
    candidates: TbGroupCandidate[];
  }): Promise<{ saved: number; skipped: number }> {
    // Replace prior auto markers for this checksum so a re-run cannot leave stale HIGH rows.
    await this.supersedeForChecksum(input.projectCode, input.frameId, input.drawingChecksum);

    let saved = 0;
    let skipped = 0;
    for (const c of input.candidates) {
      if (c.confidence !== 'HIGH') {
        skipped += 1;
        continue;
      }
      const g = c.geometry || ({} as any);
      const hasBox =
        Number.isFinite(Number(g.x))
        && Number.isFinite(Number(g.y))
        && Number.isFinite(Number(g.width))
        && Number.isFinite(Number(g.height))
        && Number(g.width) > 0.002
        && Number(g.height) > 0.002;
      if (!hasBox) {
        this.logger.warn(`skip HIGH ${c.tb_number}: missing real geometry (never invent coords)`);
        skipped += 1;
        continue;
      }
      try {
        await this.prisma.tb_markers.create({
          data: {
            project_code: input.projectCode,
            frame_id: input.frameId,
            page_number: c.page_number || 1,
            view_name: c.view_name || null,
            marker_type: 'TB_GROUP',
            tb_number: c.tb_number,
            terminal_group: c.terminal_group,
            geometry: c.geometry as any,
            notes: (c.reasons || []).join('; ').slice(0, 500) || null,
            drawing_revision: input.drawingRevision,
            drawing_checksum: input.drawingChecksum,
            detection_method: c.detection_method,
            confidence_score: c.confidence_score,
            created_automatically: true,
            marker_status: 'ACTIVE',
            analysis_run_id: input.analysisRunId,
            created_by: input.createdBy,
            updated_at: new Date(),
          } as any,
        });
        saved += 1;
      } catch (err: any) {
        this.logger.warn(`persist marker failed for ${c.tb_number}: ${err?.message || err}`);
        skipped += 1;
      }
    }
    return { saved, skipped };
  }

  async listActiveGroups(projectCode: string, frameId: string, checksum?: string | null) {
    const rows = await this.prisma.tb_markers.findMany({
      where: {
        project_code: projectCode,
        frame_id: frameId,
        marker_type: 'TB_GROUP',
      },
      orderBy: [{ page_number: 'asc' }, { id: 'asc' }],
    });
    return rows.filter(m => {
      const status = (m as any).marker_status;
      if (status && status !== 'ACTIVE') return false;
      if (checksum && (m as any).drawing_checksum && (m as any).drawing_checksum !== checksum) {
        return false;
      }
      return true;
    });
  }

  /** Dev baseline markers — notes tagged DEV_BASELINE_FIXTURE; never created_automatically HIGH. */
  async persistDevBaselineMarkers(input: {
    projectCode: string;
    frameId: string;
    drawingRevision: string;
    drawingChecksum: string;
    createdBy: number;
    markers: Array<{
      tb_number: string;
      page_number: number;
      terminal_group: string;
      geometry: { x: number; y: number; width: number; height: number; rotation?: number };
    }>;
  }): Promise<number[]> {
    const ids: number[] = [];
    for (const m of input.markers) {
      const row = await this.prisma.tb_markers.create({
        data: {
          project_code: input.projectCode,
          frame_id: input.frameId,
          page_number: m.page_number || 1,
          marker_type: 'TB_GROUP',
          tb_number: m.tb_number,
          terminal_group: m.terminal_group || '1-99',
          geometry: m.geometry as any,
          notes: 'DEV_BASELINE_FIXTURE — consume-path proof only; not AUTO_VERIFIED',
          drawing_revision: input.drawingRevision,
          drawing_checksum: input.drawingChecksum,
          detection_method: 'DEV_BASELINE',
          confidence_score: 0.5,
          created_automatically: false,
          marker_status: 'ACTIVE',
          created_by: input.createdBy,
          updated_at: new Date(),
        } as any,
      });
      ids.push(row.id);
    }
    return ids;
  }
}
