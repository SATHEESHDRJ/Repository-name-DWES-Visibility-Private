import { Injectable, NotFoundException, ConflictException, BadRequestException } from '@nestjs/common';
import * as ExcelJS from 'exceljs';
import * as path from 'path';
import { PrismaService } from '../prisma/prisma.service';
import { MockStore, FrameData } from '../data/mock-store';
import { FrameStore } from '../frames/frame-store';
import { prependExcelReportHeader } from '../common/report-branding';
import { buildProjectReportPdf, ReportCable, ReportPanel } from '../common/report-pdf';
import { permanentlyDeleteProject } from '../common/project-delete.util';

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
    const project = await this.prisma.projects.findUnique({ where: { code } });
    if (!project) throw new NotFoundException(`Project ${code} not found`);

    const uploadBase = process.env.UPLOAD_ROOT || path.resolve(process.cwd(), 'uploads');
    return permanentlyDeleteProject(this.prisma, code, uploadBase);
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
      include: {
        panel_inspections: {
          orderBy: { created_at: 'desc' },
          take: 1,
          include: { users: true },
        },
      },
    });
    const userIds = [...new Set(rows.flatMap(r => [
      r.technician_id, r.assigned_by, r.reviewed_by, r.approved_by,
      r.panel_inspections[0]?.qc_user_id,
    ]).filter((id): id is number => typeof id === 'number'))];
    const techs = userIds.length ? await this.prisma.users.findMany({ where: { id: { in: userIds } } }) : [];
    const techMap = new Map(techs.map(t => [t.id, t]));

    const assignedFrameIds = new Set(rows.map(a => a.frame_id));
    const frameById = new Map<string, FrameData>();
    for (const frame of MockStore.findFramesByProject(code)) frameById.set(frame.id, frame);
    for (const frameId of assignedFrameIds) {
      if (!frameById.has(frameId)) {
        const frame = FrameStore.getFrameFromDisk(code, frameId);
        if (frame) frameById.set(frameId, frame);
      }
    }

    const panels = rows.map(a => {
      const tech = techMap.get(a.technician_id);
      const cables = a.cables_total || 0;
      const kpi = cables > 0
        ? Math.round((((a.cables_src_done || 0) + (a.cables_dst_done || 0)) / (cables * 2)) * 1000) / 10
        : 0;
      return { assignment: a, tech, kpi, frame: frameById.get(a.frame_id) ?? null };
    });

    const unassignedFrames = [...frameById.values()]
      .filter(frame => !assignedFrameIds.has(frame.id));

    return { project, panels, techMap, unassignedFrames };
  }

  /** Read-only project completion PDF — does not mutate project_state (DWES policy). */
  async generateReportPdf(code: string, generatedBy = ''): Promise<{ buffer: Buffer; filename: string }> {
    const { project, panels, techMap, unassignedFrames } = await this.collectReportData(code);

    const reportPanels: ReportPanel[] = panels.map(({ assignment: a, tech, kpi, frame }) => {
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
      const inspection = a.panel_inspections[0];
      const liveSeconds = (a.total_wiring_seconds || 0)
        + (a.status === 'in_progress' && a.started_at
          ? Math.max(0, Math.floor((Date.now() - new Date(a.started_at).getTime()) / 1000))
          : 0);
      return {
        frameId: a.frame_id,
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
        wiringSeconds: liveSeconds,
        assignedAt: a.assigned_at || null,
        startedAt: a.started_at || null,
        pausedAt: a.paused_at || null,
        completedAt: a.completed_at || null,
        reviewedAt: a.reviewed_at || null,
        approvedAt: a.approved_at || null,
        reportSubmittedAt: a.report_submitted_at || null,
        reviewerName: a.reviewed_by ? techMap.get(a.reviewed_by)?.full_name || techMap.get(a.reviewed_by)?.username || '' : '',
        approverName: a.approved_by ? techMap.get(a.approved_by)?.full_name || techMap.get(a.approved_by)?.username || '' : '',
        inspectionResult: inspection?.overall_result || '',
        inspectorName: inspection?.users?.full_name || inspection?.users?.username || '',
        pauseReason: a.pause_reason || '',
        supervisorApproved: !!a.supervisor_approved,
        cables,
      };
    });
    for (const frame of unassignedFrames) {
      const cables = Array.isArray(frame.cables)
        ? frame.cables.map(c => ({
            source: String(c.source ?? ''), destination: String(c.destination ?? ''),
            status: 'pending' as const, size: c.size != null ? String(c.size) : undefined,
            color: c.color != null ? String(c.color) : undefined,
            ferrule: c.ferrule != null ? String(c.ferrule) : undefined,
          }))
        : [];
      reportPanels.push({
        frameId: frame.id, panelName: frame.panel_name || frame.id, technicianName: '',
        status: 'not_started', reviewStatus: 'not_ready', cablesTotal: frame.cable_count || cables.length,
        cablesSrcDone: 0, cablesDstDone: 0, kpi: 0, wiringSeconds: 0, supervisorApproved: false, cables,
      });
    }

    const buffer = await buildProjectReportPdf({
      project: {
        code,
        client: project.client,
        name: project.name,
        description: project.description,
        projectState: project.project_state,
        createdAt: project.created_at,
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
    const { project, panels, techMap, unassignedFrames } = await this.collectReportData(code);
    const titleize = (value?: string | null) => (value || 'not_started').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
    const now = Date.now();
    const exportPanels = panels.map(({ assignment: a, tech, kpi, frame }) => {
      const inspection = a.panel_inspections[0];
      const seconds = (a.total_wiring_seconds || 0) + (a.status === 'in_progress' && a.started_at
        ? Math.max(0, Math.floor((now - new Date(a.started_at).getTime()) / 1000)) : 0);
      const cables: ReportCable[] = Array.isArray(frame?.cables) ? frame!.cables.map((c: any, i: number) => {
        const status = parseCS(a.cable_status)[String(i)] || {};
        return { source: String(c.source || ''), destination: String(c.destination || ''), size: c.size ? String(c.size) : '', color: c.color ? String(c.color) : '', ferrule: c.ferrule ? String(c.ferrule) : '', status: status.src && status.dst ? 'done' : status.src || status.dst ? 'partial' : 'pending' };
      }) : [];
      return { frameId: a.frame_id, panel: a.panel_name || frame?.panel_name || a.frame_id, technician: tech?.full_name || tech?.username || 'Unassigned', status: a.status || 'not_started', review: a.review_status || 'not_ready', inspection: inspection?.overall_result || '', inspector: inspection?.users?.full_name || inspection?.users?.username || '', cablesTotal: a.cables_total || frame?.cable_count || cables.length, src: a.cables_src_done || 0, dst: a.cables_dst_done || 0, kpi, seconds, assignedAt: a.assigned_at, startedAt: a.started_at, pausedAt: a.paused_at, completedAt: a.completed_at, reviewedAt: a.reviewed_at, approvedAt: a.approved_at, reviewer: a.reviewed_by ? techMap.get(a.reviewed_by)?.full_name || techMap.get(a.reviewed_by)?.username || '' : '', approver: a.approved_by ? techMap.get(a.approved_by)?.full_name || techMap.get(a.approved_by)?.username || '' : '', pauseReason: a.pause_reason || '', submittedAt: a.report_submitted_at, supervisorApproved: !!a.supervisor_approved, notes: a.review_notes || '', cables };
    });
    for (const frame of unassignedFrames) {
      const cables = Array.isArray(frame.cables) ? frame.cables.map((c: any) => ({ source: String(c.source || ''), destination: String(c.destination || ''), size: c.size ? String(c.size) : '', color: c.color ? String(c.color) : '', ferrule: c.ferrule ? String(c.ferrule) : '', status: 'pending' as const })) : [];
      exportPanels.push({ frameId: frame.id, panel: frame.panel_name || frame.id, technician: 'Unassigned', status: 'not_started', review: 'not_ready', inspection: '', inspector: '', cablesTotal: frame.cable_count || cables.length, src: 0, dst: 0, kpi: 0, seconds: 0, assignedAt: null, startedAt: null, pausedAt: null, completedAt: null, reviewedAt: null, approvedAt: null, reviewer: '', approver: '', pauseReason: '', submittedAt: null, supervisorApproved: false, notes: '', cables });
    }
    const totalCables = exportPanels.reduce((sum, panel) => sum + panel.cablesTotal, 0);
    const totalSrc = exportPanels.reduce((sum, panel) => sum + panel.src, 0);
    const totalDst = exportPanels.reduce((sum, panel) => sum + panel.dst, 0);
    const totalTime = exportPanels.reduce((sum, panel) => sum + panel.seconds, 0);
    const overallKpi = totalCables ? Math.round(((totalSrc + totalDst) / (totalCables * 2)) * 1000) / 10 : 0;
    const approved = exportPanels.filter(panel => panel.review === 'approved' || panel.inspection === 'PASS').length;
    const completed = exportPanels.filter(panel => panel.status === 'completed').length;

    const wb = new ExcelJS.Workbook();
    wb.creator = 'DWES - Digital Wiring Execution System';
    wb.created = new Date();
    wb.modified = new Date();
    const applySheetDefaults = (ws: ExcelJS.Worksheet) => {
      ws.views = [{ state: 'frozen', ySplit: 6, showGridLines: false }];
      ws.pageSetup = { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0, paperSize: 9, margins: { left: 0.25, right: 0.25, top: 0.4, bottom: 0.45, header: 0.15, footer: 0.2 } };
      ws.headerFooter.oddFooter = '&L DWES - Confidential &C Project report &R Page &P of &N';
    };
    const styleHeader = (row: ExcelJS.Row) => {
      row.height = 28;
      row.eachCell(cell => { cell.font = { name: 'Aptos', bold: true, color: { argb: 'FFFFFFFF' }, size: 10 }; cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: '0F2557' } }; cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true }; cell.border = { bottom: { style: 'medium', color: { argb: '2563EB' } } }; });
    };
    const styleData = (ws: ExcelJS.Worksheet, startRow: number, endRow: number) => {
      for (let r = startRow; r <= endRow; r++) { const row = ws.getRow(r); row.height = 22; row.eachCell(cell => { cell.font = { name: 'Aptos', size: 10, color: { argb: '0F172A' } }; cell.alignment = { vertical: 'middle', wrapText: true }; cell.border = { bottom: { style: 'thin', color: { argb: 'E2E8F0' } } }; if (r % 2 === 0) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'F8FAFC' } }; }); }
    };

    const summaryWs = wb.addWorksheet('Executive Summary');
    applySheetDefaults(summaryWs);
    summaryWs.columns = [20, 26, 20, 26, 20, 20, 20, 22].map(width => ({ width }));
    const summaryStart = await prependExcelReportHeader(wb, summaryWs, { title: 'Project Engineering Report', subtitle: `${code.replace(/_/g, ' ')} | ${project.client || 'Client not recorded'}`, colCount: 8 });
    const pairs: Array<[string, string | number]> = [['Project Code', code], ['Project State', titleize(project.project_state)], ['Client', project.client || 'Not recorded'], ['Project Name', project.name || code], ['Project Created', project.created_at ? new Date(project.created_at).toISOString() : 'Not recorded'], ['Panels', exportPanels.length], ['Completed Panels', completed], ['Approved / Passed', approved], ['Scheduled Cables', totalCables], ['Source Terminated', totalSrc], ['Destination Terminated', totalDst], ['Overall Completion', overallKpi / 100], ['Recorded Working Hours', totalTime / 3600], ['Generated By', generatedBy || 'DWES'], ['Generated At (UTC)', new Date().toISOString()], ['Description', project.description || 'No description recorded']];
    for (let i = 0; i < pairs.length; i += 2) { const row = summaryWs.getRow(summaryStart + i / 2); for (const [offset, pair] of [pairs[i], pairs[i + 1]].entries()) { if (!pair) continue; const col = offset * 4 + 1; row.getCell(col).value = pair[0]; row.getCell(col).font = { name: 'Aptos', bold: true, size: 10, color: { argb: '475569' } }; row.getCell(col).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'EFF6FF' } }; row.getCell(col + 1).value = pair[1]; row.getCell(col + 1).font = { name: 'Aptos', bold: pair[0] === 'Overall Completion', size: 10, color: { argb: pair[0] === 'Overall Completion' ? '1D4ED8' : '0F172A' } }; row.getCell(col + 1).alignment = { vertical: 'middle', wrapText: true }; } row.height = 26; }
    summaryWs.getCell(`F${summaryStart + 5}`).numFmt = '0.0%';
    summaryWs.getCell(`B${summaryStart + 6}`).numFmt = '0.0';
    summaryWs.mergeCells(`A${summaryStart + 8}:H${summaryStart + 8}`);
    summaryWs.getCell(`A${summaryStart + 8}`).value = 'Live database snapshot: counts, KPIs, working time, approvals, and execution status are calculated at export time.';
    summaryWs.getCell(`A${summaryStart + 8}`).font = { name: 'Aptos', italic: true, size: 9, color: { argb: '64748B' } };

    const panelWs = wb.addWorksheet('Panel Register');
    applySheetDefaults(panelWs);
    const panelHeaders = ['Panel', 'Technician', 'Execution Status', 'QC / Review', 'Inspection', 'Cables', 'Source Done', 'Destination Done', 'Completion', 'Working Hours', 'Assigned', 'Started', 'Completed', 'Supervisor Approval', 'Review Notes'];
    panelWs.columns = [24, 22, 18, 16, 16, 11, 12, 14, 13, 14, 18, 18, 18, 20, 34].map(width => ({ width }));
    const panelStart = await prependExcelReportHeader(wb, panelWs, { title: 'Panel Execution Register', subtitle: 'Live assignment, progress, QC and approval status', colCount: panelHeaders.length });
    panelWs.getRow(panelStart).values = panelHeaders; styleHeader(panelWs.getRow(panelStart));
    exportPanels.forEach(panel => panelWs.addRow([panel.panel, panel.technician, titleize(panel.status), titleize(panel.review), titleize(panel.inspection), panel.cablesTotal, panel.src, panel.dst, panel.kpi / 100, panel.seconds / 3600, panel.assignedAt ? new Date(panel.assignedAt) : null, panel.startedAt ? new Date(panel.startedAt) : null, panel.completedAt ? new Date(panel.completedAt) : null, panel.supervisorApproved ? `Approved${panel.approver ? ` - ${panel.approver}` : ''}` : 'Pending', panel.notes]));
    styleData(panelWs, panelStart + 1, panelStart + exportPanels.length);
    panelWs.getColumn(9).numFmt = '0.0%'; panelWs.getColumn(10).numFmt = '0.00'; [11, 12, 13].forEach(col => panelWs.getColumn(col).numFmt = 'yyyy-mm-dd hh:mm');
    panelWs.autoFilter = { from: { row: panelStart, column: 1 }, to: { row: panelStart + exportPanels.length, column: panelHeaders.length } };

    const cableWs = wb.addWorksheet('Cable Schedule');
    applySheetDefaults(cableWs);
    const cableHeaders = ['Panel', 'Wire No.', 'Source', 'Destination', 'Ferrule', 'Size', 'Colour', 'Live Status'];
    cableWs.columns = [24, 12, 30, 30, 16, 12, 14, 16].map(width => ({ width }));
    const cableStart = await prependExcelReportHeader(wb, cableWs, { title: 'Cable Completion Schedule', subtitle: 'Live cable termination status at time of export', colCount: cableHeaders.length });
    cableWs.getRow(cableStart).values = cableHeaders; styleHeader(cableWs.getRow(cableStart));
    exportPanels.forEach(panel => panel.cables.forEach((cable, index) => cableWs.addRow([panel.panel, index + 1, cable.source || '', cable.destination || '', cable.ferrule || '', cable.size || '', cable.color || '', titleize(cable.status)])));
    const cableEnd = cableWs.rowCount; if (cableEnd > cableStart) styleData(cableWs, cableStart + 1, cableEnd);
    cableWs.autoFilter = { from: { row: cableStart, column: 1 }, to: { row: Math.max(cableStart, cableEnd), column: cableHeaders.length } };

    const timelineWs = wb.addWorksheet('Execution Timeline');
    applySheetDefaults(timelineWs);
    const timelineHeaders = ['Panel', 'Technician', 'Assigned', 'Started', 'Paused', 'Completed', 'Report Submitted', 'Reviewed', 'Approved', 'Pause Reason', 'QC Inspector'];
    timelineWs.columns = [24, 22, 18, 18, 18, 18, 20, 18, 18, 30, 22].map(width => ({ width }));
    const timelineStart = await prependExcelReportHeader(wb, timelineWs, { title: 'Execution & Approval Timeline', subtitle: 'Database timestamps and accountability trail', colCount: timelineHeaders.length });
    timelineWs.getRow(timelineStart).values = timelineHeaders; styleHeader(timelineWs.getRow(timelineStart));
    exportPanels.forEach(panel => timelineWs.addRow([panel.panel, panel.technician, panel.assignedAt ? new Date(panel.assignedAt) : null, panel.startedAt ? new Date(panel.startedAt) : null, panel.pausedAt ? new Date(panel.pausedAt) : null, panel.completedAt ? new Date(panel.completedAt) : null, panel.submittedAt ? new Date(panel.submittedAt) : null, panel.reviewedAt ? new Date(panel.reviewedAt) : null, panel.approvedAt ? new Date(panel.approvedAt) : null, panel.pauseReason, panel.inspector]));
    styleData(timelineWs, timelineStart + 1, timelineStart + exportPanels.length);
    for (let col = 3; col <= 9; col++) timelineWs.getColumn(col).numFmt = 'yyyy-mm-dd hh:mm';
    timelineWs.autoFilter = { from: { row: timelineStart, column: 1 }, to: { row: timelineStart + exportPanels.length, column: timelineHeaders.length } };

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
