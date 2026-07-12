import { Injectable, NotFoundException, ConflictException, BadRequestException } from '@nestjs/common';
import * as ExcelJS from 'exceljs';
import * as fs from 'fs';
import * as path from 'path';
import { PrismaService } from '../prisma/prisma.service';
import { MockStore, FrameData } from '../data/mock-store';
import { FrameStore } from '../frames/frame-store';
import { prependExcelReportHeader } from '../common/report-branding';
import { buildProjectReportPdf, ReportCable } from '../common/report-pdf';

export interface CreatePanelDto {
  name: string;
  type?: string;
  description?: string;
  voltage_level?: string;
  system_type?: string;
}

function parseCS(raw: string | null | undefined): Record<string, { src?: boolean; dst?: boolean }> {
  if (!raw) return {};
  try { return typeof raw === 'string' ? JSON.parse(raw) : raw; } catch { return {}; }
}

@Injectable()
export class ProjectsService {
  constructor(private prisma: PrismaService) {}

  async findAll() {
    return this.prisma.projects.findMany({ where: { is_active: true }, orderBy: { sequence: 'asc' } });
  }

  async findOne(code: string) {
    const p = await this.prisma.projects.findUnique({ where: { code } });
    if (!p) throw new NotFoundException(`Project ${code} not found`);
    return p;
  }

  async create(dto: {
    code: string;
    client: string;
    name: string;
    description?: string;
    sequence?: number;
    panels?: CreatePanelDto[];
  }) {
    const panels = Array.isArray(dto.panels) ? dto.panels : [];
    if (panels.length === 0) {
      throw new BadRequestException('At least one panel is required');
    }
    for (let i = 0; i < panels.length; i++) {
      if (!String(panels[i]?.name || '').trim()) {
        throw new BadRequestException(`Panel ${i + 1}: name is required`);
      }
      if (!String(panels[i]?.voltage_level || '').trim()) {
        throw new BadRequestException(`Panel ${i + 1}: voltage level is required`);
      }
    }

    const existing = await this.prisma.projects.findUnique({ where: { code: dto.code } });
    if (existing) throw new ConflictException('Project code already exists');

    const project = await this.prisma.projects.create({
      data: {
        code: dto.code, client: dto.client, name: dto.name,
        description: dto.description || '', sequence: dto.sequence || 1,
        is_active: true, project_state: 'not_started', assigned_technicians: '',
      },
    });

    const createdPanels = panels.map((panel, idx) => {
      const frameId = `frame_${Date.now()}_${idx}_${Math.random().toString(36).slice(2, 7)}`;
      const frame: FrameData = {
        id: frameId,
        project_code: dto.code,
        panel_name: panel.name.trim(),
        cables: [],
        uploaded_at: new Date().toISOString(),
        compare_status: 'none',
        original_filename: '(created with project)',
        cable_count: 0,
        mapping: {},
        sheet_name: '',
        ...(panel.type?.trim() ? { panel_type: panel.type.trim() } : {}),
        ...(panel.description?.trim() ? { panel_description: panel.description.trim() } : {}),
        voltage_level: panel.voltage_level!.trim(),
        ...(panel.system_type?.trim() ? { system_type: panel.system_type.trim() } : {}),
      };
      MockStore.frames.push(frame);
      FrameStore.save(frame);
      return {
        id: frameId,
        name: frame.panel_name,
        type: frame.panel_type || null,
        description: frame.panel_description || null,
        voltage_level: frame.voltage_level || null,
        system_type: frame.system_type || null,
      };
    });

    return { ...project, panels: createdPanels };
  }

  async update(code: string, dto: Partial<{ client: string; name: string; description: string; sequence: number }>) {
    const p = await this.prisma.projects.findUnique({ where: { code } });
    if (!p) throw new NotFoundException(`Project ${code} not found`);
    const data: any = {};
    if (dto.client !== undefined)      data.client = dto.client;
    if (dto.name !== undefined)        data.name = dto.name;
    if (dto.description !== undefined) data.description = dto.description;
    if (dto.sequence !== undefined)    data.sequence = dto.sequence;
    return this.prisma.projects.update({ where: { code }, data });
  }

  async remove(code: string) {
    const p = await this.prisma.projects.findUnique({ where: { code } });
    if (!p) throw new NotFoundException(`Project ${code} not found`);

    const uploadBase = process.env.UPLOAD_ROOT || path.resolve(process.cwd(), 'uploads');
    const projectUploadsDir = path.join(uploadBase, code);

    const assignments = await this.prisma.tech_assignments.findMany({
      where: { project_code: code },
      select: { id: true },
    });
    const assignmentIds = assignments.map(a => a.id);

    const inspectionDelete = assignmentIds.length
      ? await this.prisma.panel_inspections.deleteMany({
          where: { assignment_id: { in: assignmentIds } },
        })
      : { count: 0 };

    const assignmentDelete = await this.prisma.tech_assignments.deleteMany({ where: { project_code: code } });
    const hashDelete = await this.prisma.file_hashes.deleteMany({ where: { project_code: code } });
    const auditDelete = await this.prisma.tech_audit_log.deleteMany({ where: { project_code: code } });
    const sessionDelete = await this.prisma.session_log.deleteMany({ where: { project_code: code } });

    await this.prisma.projects.delete({ where: { code } });

    MockStore.frames = MockStore.frames.filter(frame => frame.project_code !== code);
    MockStore.drawings = MockStore.drawings.filter(drawing => drawing.project_code !== code);

    let uploadsRemoved = false;
    if (fs.existsSync(projectUploadsDir)) {
      fs.rmSync(projectUploadsDir, { recursive: true, force: true });
      uploadsRemoved = true;
    }

    return {
      message: `Project "${code}" permanently deleted.`,
      deleted: {
        inspections: inspectionDelete.count,
        assignments: assignmentDelete.count,
        file_hashes: hashDelete.count,
        audit_logs: auditDelete.count,
        session_logs: sessionDelete.count,
        project_row: 1,
        uploads_removed: uploadsRemoved,
      },
    };
  }

  async setState(code: string, state: string) {
    const p = await this.prisma.projects.findUnique({ where: { code } });
    if (!p) throw new NotFoundException(`Project ${code} not found`);
    return this.prisma.projects.update({ where: { code }, data: { project_state: state } });
  }

  async assign(code: string, techUsernames: string[]) {
    const p = await this.prisma.projects.findUnique({ where: { code } });
    if (!p) throw new NotFoundException(`Project ${code} not found`);
    return this.prisma.projects.update({ where: { code }, data: { assigned_technicians: techUsernames.join(',') } });
  }

  async submitToDirector(code: string) {
    const p = await this.prisma.projects.findUnique({ where: { code } });
    if (!p) throw new NotFoundException(`Project ${code} not found`);

    const completed = await this.prisma.tech_assignments.findMany({
      where: { project_code: code, status: 'completed' },
    });
    if (completed.length === 0) {
      throw new BadRequestException('No completed panels to submit');
    }

    const pendingQc = completed.filter(a => a.review_status === 'ready_for_qc').length;
    if (pendingQc > 0) {
      throw new BadRequestException(`${pendingQc} panel(s) still pending QC check`);
    }

    const notApproved = completed.filter(a => a.review_status !== 'approved').length;
    if (notApproved > 0) {
      throw new BadRequestException(`${notApproved} panel(s) not yet approved`);
    }

    await this.prisma.projects.update({ where: { code }, data: { project_state: 'submitted_to_director' } });
    return { message: `Project submitted to director with ${completed.length} approved panels` };
  }

  /** Read-only assignment check used to scope technician access to project reports. */
  async technicianAssignedToProject(projectCode: string, technicianId: number): Promise<boolean> {
    const a = await this.prisma.tech_assignments.findFirst({
      where: { project_code: projectCode, technician_id: technicianId },
      select: { id: true },
    });
    return !!a;
  }

  /** Shared read-only data collection for project reports (PDF + Excel). */
  private async collectReportData(code: string) {
    const project = await this.prisma.projects.findUnique({ where: { code } });
    if (!project) throw new NotFoundException(`Project ${code} not found`);

    const rows = await this.prisma.tech_assignments.findMany({
      where: { project_code: code },
      orderBy: { assigned_at: 'asc' },
    });
    const techIds = [...new Set(rows.map(r => r.technician_id))];
    const techs = await this.prisma.users.findMany({ where: { id: { in: techIds } } });
    const techMap = new Map(techs.map(t => [t.id, t]));

    const panels = rows.map(a => {
      const tech = techMap.get(a.technician_id);
      const cables = a.cables_total || 0;
      const kpi = cables > 0
        ? Math.round((((a.cables_src_done || 0) + (a.cables_dst_done || 0)) / (cables * 2)) * 1000) / 10
        : 0;
      return { assignment: a, tech, kpi };
    });

    return { project, panels };
  }

  /** Read-only project completion PDF — does not mutate project_state (DWES policy). */
  async generateReportPdf(code: string, generatedBy = ''): Promise<{ buffer: Buffer; filename: string }> {
    const { project, panels } = await this.collectReportData(code);

    const reportPanels = panels.map(({ assignment: a, tech, kpi }) => {
      const frame = MockStore.findFrameByProjectAndId(code, a.frame_id)
        ?? FrameStore.getFrameFromDisk(code, a.frame_id);
      const frameCables = Array.isArray((frame as any)?.cables) ? (frame as any).cables as any[] : null;
      const cableStatus = parseCS(a.cable_status);
      const cables: ReportCable[] | null = frameCables
        ? frameCables.map((c, ci) => {
            const cs = cableStatus[String(ci)] || {};
            const status: 'done' | 'partial' | 'pending' =
              cs.src && cs.dst ? 'done' : (cs.src || cs.dst ? 'partial' : 'pending');
            return {
              source: String(c.source ?? ''),
              destination: String(c.destination ?? ''),
              status,
              size: c.size != null ? String(c.size) : undefined,
              color: c.color != null ? String(c.color) : undefined,
              ferrule: c.ferrule != null ? String(c.ferrule) : undefined,
            };
          })
        : null;
      return {
        panelName: a.panel_name || '',
        technicianName: tech?.full_name || tech?.username || '',
        technicianUsername: tech?.username || '',
        status: a.status || '',
        reviewStatus: a.review_status || 'pending',
        reviewNotes: a.review_notes || '',
        cablesTotal: a.cables_total || 0,
        cablesSrcDone: a.cables_src_done || 0,
        cablesDstDone: a.cables_dst_done || 0,
        kpi,
        wiringSeconds: a.total_wiring_seconds || 0,
        assignedAt: a.assigned_at || null,
        cables,
      };
    });

    const buffer = await buildProjectReportPdf({
      project: {
        code,
        client: project.client,
        name: project.name,
        description: project.description,
        projectState: project.project_state,
      },
      panels: reportPanels,
      generatedBy,
      generatedAt: new Date(),
    });

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    return { buffer, filename: `Report_${code}_${timestamp}.pdf` };
  }

  /** Read-only project completion Excel workbook — same data as the PDF report. */
  async generateReportXlsx(code: string, generatedBy = ''): Promise<{ buffer: Buffer; filename: string }> {
    const { project, panels } = await this.collectReportData(code);

    let totalCables = 0; let totalSrc = 0; let totalDst = 0; let totalTime = 0;
    for (const { assignment: a } of panels) {
      totalCables += a.cables_total || 0;
      totalSrc += a.cables_src_done || 0;
      totalDst += a.cables_dst_done || 0;
      totalTime += a.total_wiring_seconds || 0;
    }
    const overallKpi = totalCables > 0
      ? Math.round(((totalSrc + totalDst) / (totalCables * 2)) * 1000) / 10
      : 0;

    const wb = new ExcelJS.Workbook();
    wb.creator = 'DWES — Digital Wiring Execution System';
    wb.created = new Date();

    const summaryWs = wb.addWorksheet('Summary');
    summaryWs.columns = [{ width: 22 }, { width: 48 }];
    const summaryStart = await prependExcelReportHeader(wb, summaryWs, {
      title: 'Project Completion Report',
      subtitle: `${code.replace(/_/g, ' ')} · ${project.client || ''}`,
      colCount: 8,
    });
    const summaryRows: [string, string | number][] = [
      ['Project Code', code],
      ['Client', project.client || ''],
      ['Name', project.name || ''],
      ['Description', project.description || ''],
      ['State', (project.project_state || '').replace(/_/g, ' ')],
      ['Total Panels', panels.length],
      ['Total Cables', totalCables],
      ['Overall KPI %', overallKpi],
      ['Total Wiring Time', `${Math.floor(totalTime / 3600)}h ${Math.floor((totalTime % 3600) / 60)}m`],
      ['Generated By', generatedBy],
    ];
    summaryRows.forEach(([label, val], i) => {
      const row = summaryWs.getRow(summaryStart + i);
      row.getCell(1).value = label;
      row.getCell(1).font = { bold: true };
      row.getCell(2).value = val;
    });

    const panelWs = wb.addWorksheet('Panels');
    const panelHeaders = ['Panel', 'Technician', 'Status', 'Review', 'Cables Total', 'Source Done', 'Destination Done', 'KPI %', 'Wiring Time', 'Review Notes'];
    panelWs.columns = panelHeaders.map(() => ({ width: 16 }));
    const panelStart = await prependExcelReportHeader(wb, panelWs, {
      title: 'Panel Summary',
      subtitle: code.replace(/_/g, ' '),
      colCount: panelHeaders.length,
    });
    const hdr = panelWs.getRow(panelStart);
    panelHeaders.forEach((h, i) => {
      const cell = hdr.getCell(i + 1);
      cell.value = h;
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: '1E293B' } };
    });
    let pr = panelStart + 1;
    for (const { assignment: a, tech, kpi } of panels) {
      const secs = a.total_wiring_seconds || 0;
      panelWs.getRow(pr).values = [
        a.panel_name || '',
        tech?.full_name || tech?.username || '',
        (a.status || '').replace(/_/g, ' '),
        (a.review_status || 'pending').replace(/_/g, ' '),
        a.cables_total || 0,
        a.cables_src_done || 0,
        a.cables_dst_done || 0,
        kpi,
        `${Math.floor(secs / 3600)}h ${Math.floor((secs % 3600) / 60)}m`,
        a.review_notes || '',
      ];
      pr++;
    }

    const buffer = Buffer.from(await wb.xlsx.writeBuffer());
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    return { buffer, filename: `Report_${code}_${timestamp}.xlsx` };
  }

  async stats(code: string) {
    const frames = MockStore.findFramesByProject(code);
    const assignments = await this.prisma.tech_assignments.findMany({ where: { project_code: code } });
    const total_cables = frames.reduce((s, f) => s + f.cable_count, 0);
    const done_assignments = assignments.filter(a => a.status === 'completed').length;
    const src_done = assignments.reduce((s, a) => s + (a.cables_src_done || 0), 0);
    const dst_done = assignments.reduce((s, a) => s + (a.cables_dst_done || 0), 0);
    const kpi = total_cables > 0 ? Math.round(((src_done + dst_done) / (total_cables * 2)) * 100) : 0;
    return { code, frames: frames.length, assignments: assignments.length, done_assignments, kpi };
  }

}
