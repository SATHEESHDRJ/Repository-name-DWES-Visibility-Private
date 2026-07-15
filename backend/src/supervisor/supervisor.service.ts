import { Injectable, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { TechService } from '../tech/tech.service';
import { MockStore } from '../data/mock-store';
import { FrameStore } from '../frames/frame-store';
import * as ExcelJS from 'exceljs';
import { buildCompletionReport } from '../common/completion-report.helper';
import { getReportLogoBuffer, REPORT_COMPANY, REPORT_SYSTEM } from '../common/report-branding';
import { collectPanelCompletionReportData } from '../common/panel-completion-report.helper';
import { assertPanelNameUniqueForWrite } from '../common/panel-duplicate.helper';
import { assignedCableKpiPercent, wiringKpiPercent } from '../common/kpi.constants';
import { parseCableStatus as parseCS } from '../common/cable-status.util';

interface AnyUser { id: number; role: string | null; full_name: string | null; }

@Injectable()
export class SupervisorService {
  constructor(
    private prisma: PrismaService,
    private techService: TechService,
  ) {}

  async allPanels() {
    const assignments = await this.prisma.tech_assignments.findMany({ orderBy: { assigned_at: 'desc' } });
    const techIds = [...new Set(assignments.map(a => a.technician_id))];
    const techs = await this.prisma.users.findMany({ where: { id: { in: techIds } } });
    const techMap = new Map(techs.map(t => [t.id, t]));
    return assignments.map(a => {
      const tech = techMap.get(a.technician_id);
      const frame = MockStore.findFrameById(a.frame_id);
      const cableState = parseCS(a.cable_status);
      const states = Object.values(cableState);
      const cablesCompleted = states.filter(state => Boolean(state?.src && state?.dst)).length;
      const hasRecordedWork = (a.cables_src_done || 0) > 0
        || (a.cables_dst_done || 0) > 0
        || states.some(state => Boolean(state?.src || state?.dst));
      const cablesTotal = a.cables_total || 0;
      const kpi = assignedCableKpiPercent(cablesCompleted, cablesTotal);
      return {
        ...a,
        cable_status: undefined,
        technician_name: tech?.full_name || '',
        technician_username: tech?.username || '',
        panel_display_name: frame?.panel_name || a.panel_name,
        cables_completed: cablesCompleted,
        cables_remaining: Math.max(0, cablesTotal - cablesCompleted),
        has_recorded_work: hasRecordedWork,
        kpi,
      };
    });
  }

  async reviewPanels(projectCode: string) {
    const assignments = await this.prisma.tech_assignments.findMany({
      where: { project_code: projectCode, status: 'completed' },
      orderBy: { completed_at: 'desc' },
    });
    const techIds = [...new Set(assignments.map(a => a.technician_id))];
    const techs = await this.prisma.users.findMany({ where: { id: { in: techIds } } });
    const techMap = new Map(techs.map(t => [t.id, t]));
    return assignments.map(a => {
      const tech = techMap.get(a.technician_id);
      const kpi = wiringKpiPercent(a.cables_src_done || 0, a.cables_dst_done || 0, a.cables_total || 0);
      return { ...a, cable_status: undefined, technician_name: tech?.full_name || '', kpi };
    });
  }

  async panelDetail(id: number) {
    const a = await this.prisma.tech_assignments.findUnique({ where: { id } });
    if (!a) throw new NotFoundException(`Assignment ${id} not found`);
    const tech = await this.prisma.users.findUnique({ where: { id: a.technician_id } });
    const frame = MockStore.findFrameById(a.frame_id)
               ?? FrameStore.getFrameFromDisk(a.project_code, a.frame_id);
    const audit = await this.prisma.tech_audit_log.findMany({
      where: { technician_id: a.technician_id, frame_id: a.frame_id },
      orderBy: { created_at: 'asc' },
    });
    const kpi = wiringKpiPercent(a.cables_src_done || 0, a.cables_dst_done || 0, a.cables_total || 0);
    const { hashed_password: _hashed_password, ...safeTech } = tech || ({} as any);
    return {
      assignment: { ...a, cable_status: parseCS(a.cable_status) },
      technician: tech ? safeTech : null,
      frame: frame ? { id: frame.id, panel_name: frame.panel_name, cables: frame.cables, cable_count: frame.cable_count } : null,
      audit_trail: audit, kpi,
    };
  }

  // Full completion report for any assignment — supervisor/admin view
  async completionReport(assignmentId: number) {
    const a = await this.prisma.tech_assignments.findUnique({ where: { id: assignmentId } });
    if (!a) throw new NotFoundException(`Assignment ${assignmentId} not found`);
    return buildCompletionReport(a, this.prisma);
  }

  // Real-time progress for a specific frame — polled by supervisor every ~12s
  async frameProgress(projectCode: string, frameId: string) {
    const assignments = await this.prisma.tech_assignments.findMany({
      where: { project_code: projectCode, frame_id: frameId },
      orderBy: { assigned_at: 'desc' },
    });
    if (assignments.length === 0) return { assignments: [], frameId, projectCode };
    const techIds = [...new Set(assignments.map(a => a.technician_id))];
    const techs = await this.prisma.users.findMany({ where: { id: { in: techIds } } });
    const techMap = new Map(techs.map(t => [t.id, t]));
    const result = assignments.map(a => {
      const tech = techMap.get(a.technician_id);
      const src = a.cables_src_done || 0;
      const dst = a.cables_dst_done || 0;
      const total = a.cables_total || 0;
      const kpi = total > 0 ? Math.round(((src + dst) / (total * 2)) * 100) : 0;
      return {
        id: a.id,
        status: a.status,
        technician_name: tech?.full_name || `Tech #${a.technician_id}`,
        technician_id: a.technician_id,
        cables_total: total,
        cables_src_done: src,
        cables_dst_done: dst,
        src_pct: total > 0 ? Math.round((src / total) * 100) : 0,
        dst_pct: total > 0 ? Math.round((dst / total) * 100) : 0,
        kpi,
        started_at: a.started_at,
        completed_at: a.completed_at,
        review_status: a.review_status,
        report_submitted: a.report_submitted,
        rework_requested: a.rework_requested,
      };
    });
    return { assignments: result, frameId, projectCode, polled_at: new Date().toISOString() };
  }

  async review(id: number, reviewStatus: string, reviewNotes: string, reviewerId: number) {
    const a = await this.prisma.tech_assignments.findUnique({ where: { id } });
    if (!a) throw new NotFoundException(`Assignment ${id} not found`);
    const data: any = { review_status: reviewStatus, review_notes: reviewNotes || '', reviewed_by: reviewerId, reviewed_at: new Date() };
    if (reviewStatus === 'rework') data.status = 'assigned';
    const updated = await this.prisma.tech_assignments.update({ where: { id }, data });
    return { message: `Review status set to ${reviewStatus}`, assignment: updated };
  }

  async pendingApprovals() {
    const assignments = await this.prisma.tech_assignments.findMany({
      where: { status: 'assigned', supervisor_approved: false, rework_requested: { not: true } },
      orderBy: { assigned_at: 'asc' },
    });
    const techIds = [...new Set(assignments.map(a => a.technician_id))];
    const techs = await this.prisma.users.findMany({ where: { id: { in: techIds } } });
    const techMap = new Map(techs.map(t => [t.id, t]));
    return assignments.map(a => {
      const tech = techMap.get(a.technician_id);
      const frame = MockStore.findFrameById(a.frame_id);
      return {
        id: a.id, project_code: a.project_code, frame_id: a.frame_id,
        panel_name: frame?.panel_name || a.panel_name,
        technician_name: tech?.full_name || '', technician_username: tech?.username || '',
        technician_whatsapp: tech?.whatsapp_number || '',
        assigned_at: a.assigned_at, cables_total: a.cables_total,
        rework_requested: a.rework_requested, rework_reason: a.rework_reason,
      };
    });
  }

  async approve(id: number, approver: AnyUser) {
    if (approver.role !== 'prod_supervisor' && approver.role !== 'system_admin') {
      throw new ForbiddenException('Only Production Supervisor can approve assignments');
    }
    const a = await this.prisma.tech_assignments.findUnique({ where: { id } });
    if (!a) throw new NotFoundException(`Assignment ${id} not found`);
    await this.prisma.tech_assignments.update({
      where: { id }, data: { supervisor_approved: true, approved_at: new Date(), approved_by: approver.id },
    });
    console.log(`[WHATSAPP] Assignment ${id} approved by ${approver.full_name}`);
    return { message: 'Assignment approved — technician may now start', assignment: { id, supervisor_approved: true } };
  }

  async requestRework(id: number, reason: string, requester: AnyUser) {
    if (requester.role !== 'prod_supervisor' && requester.role !== 'system_admin') {
      throw new ForbiddenException('Only Production Supervisor can request rework');
    }
    if (!reason || reason.trim().length < 5) throw new BadRequestException('Rework reason must be at least 5 characters');
    const a = await this.prisma.tech_assignments.findUnique({ where: { id } });
    if (!a) throw new NotFoundException(`Assignment ${id} not found`);
    await this.prisma.tech_assignments.update({
      where: { id },
      data: { rework_requested: true, rework_reason: reason, rework_requested_at: new Date(), rework_requested_by: requester.id },
    });
    const tech = await this.prisma.users.findUnique({ where: { id: a.technician_id } });
    console.log(`[WHATSAPP] Rework requested for assignment ${id}: ${reason}`);
    return {
      message: 'Rework requested',
      reason,
      panel_name: a.panel_name,
      technician_name: tech?.full_name || '',
      technician_whatsapp: tech?.whatsapp_number || '',
      project_code: a.project_code,
    };
  }

  private countCableProgress(cableStatus: string | null | undefined, cablesTotal: number | null | undefined) {
    const total = cablesTotal || 0;
    const cs = parseCS(cableStatus);
    let completed = 0;
    for (const st of Object.values(cs)) {
      const s = st as { src?: boolean; dst?: boolean };
      if (s?.src && s?.dst) completed++;
    }
    return {
      completed_cables: completed,
      remaining_cables: Math.max(0, total - completed),
      cables_total: total,
    };
  }

  async pendingChangeovers() {
    return this.techService.midChangeRequests();
  }

  async changeoverCandidate(projectCode: string, frameId: string) {
    const a = await this.prisma.tech_assignments.findFirst({
      where: {
        project_code: projectCode,
        frame_id: frameId,
        OR: [
          { status: { in: ['paused', 'in_progress'] } },
          {
            status: 'assigned',
            OR: [
              { handover_from_id: { not: null } },
              { cables_src_done: { gt: 0 } },
              { cables_dst_done: { gt: 0 } },
            ],
          },
        ],
        changeover_locked: { not: true },
        is_hidden: { not: true },
      },
      orderBy: { assigned_at: 'desc' },
    });
    if (!a) return null;
    const tech = await this.prisma.users.findUnique({ where: { id: a.technician_id } });
    const counts = this.countCableProgress(a.cable_status, a.cables_total);
    return {
      id: a.id,
      project_code: a.project_code,
      frame_id: a.frame_id,
      panel_name: a.panel_name,
      status: a.status,
      technician_id: a.technician_id,
      technician_name: tech?.full_name || '',
      pause_reason: a.pause_reason,
      ...counts,
    };
  }

  midChangeover(
    oldAssignmentId: number,
    newTechId: number,
    supervisorId: number,
    changeoverReason: string,
    reasonNotes = '',
  ) {
    return this.techService.changeover(oldAssignmentId, newTechId, supervisorId, changeoverReason, reasonNotes);
  }

  async panelReport(projectCode: string, frameId: string) {
    assertPanelNameUniqueForWrite(projectCode, frameId);
    const frame = MockStore.findFrameByProjectAndId(projectCode, frameId)
               ?? FrameStore.getFrameFromDisk(projectCode, frameId);
    if (!frame) throw new NotFoundException(`Frame ${frameId} not found`);
    const assignments = await this.prisma.tech_assignments.findMany({
      where: { project_code: projectCode, frame_id: frameId },
      orderBy: { assigned_at: 'asc' },
    });
    const project = await this.prisma.projects.findFirst({ where: { code: projectCode, is_active: true } });
    const auditAll = await this.prisma.tech_audit_log.findMany({
      where: { project_code: projectCode, frame_id: frameId }, orderBy: { created_at: 'asc' },
    });
    const techIds = [...new Set(assignments.map(a => a.technician_id))];
    const techs = await this.prisma.users.findMany({ where: { id: { in: techIds } } });
    const techMap = new Map(techs.map(t => [t.id, t]));

    const techDetails = assignments.map(a => {
      const tech = techMap.get(a.technician_id);
      const kpi = wiringKpiPercent(a.cables_src_done || 0, a.cables_dst_done || 0, a.cables_total || 0);
      const { hashed_password: _hashed_password, ...safeTech } = tech || ({} as any);
      return { assignment: { ...a, cable_status: parseCS(a.cable_status) }, technician: tech ? safeTech : null, kpi };
    });
    const latestAssignment = assignments[assignments.length - 1];
    const totalSrc = latestAssignment?.cables_src_done || 0;
    const totalDst = latestAssignment?.cables_dst_done || 0;
    const overallKpi = frame.cable_count > 0 ? Math.round(((totalSrc + totalDst) / (frame.cable_count * 2)) * 100) : 0;

    const mergedStatus: Record<string, any> = {};
    for (const a of assignments) {
      const cs = parseCS(a.cable_status);
      for (const [idx, st] of Object.entries(cs)) {
        const previous = mergedStatus[idx] || {};
        const state = st as any;
        mergedStatus[idx] = {
          ...state,
          src_technician_id: state.src && !previous.src ? a.technician_id : previous.src_technician_id,
          dst_technician_id: state.dst && !previous.dst ? a.technician_id : previous.dst_technician_id,
          technician_id: state.dst && !previous.dst
            ? a.technician_id
            : state.src && !previous.src ? a.technician_id : previous.technician_id,
        };
      }
    }
    const cablesWithStatus = frame.cables.map((c, i) => {
      const st = mergedStatus[String(i)];
      return { ...c, status: st ? { src_done: st.src, dst_done: st.dst, note: st.note } : null };
    });

    return {
      project, frame: { id: frame.id, panel_name: frame.panel_name, cable_count: frame.cable_count, original_filename: frame.original_filename, compare_status: frame.compare_status },
      cables: cablesWithStatus, total_cables: frame.cable_count,
      cables_src_done: totalSrc, cables_dst_done: totalDst, kpi: overallKpi,
      assignments: techDetails, audit_trail: auditAll, generated_at: new Date().toISOString(),
    };
  }

  /**
   * Panel Completion Report — professional, management-quality Excel export.
   * Live data (project status, KPIs, timeline, working hours, approval) from the
   * DB via collectPanelCompletionReportData, plus a fully-styled cable execution
   * table. Branded, print-friendly (landscape, fit-to-width, repeating header).
   */
  async panelReportXlsx(projectCode: string, frameId: string): Promise<Buffer> {
    const data = await collectPanelCompletionReportData(this.prisma, projectCode, frameId, 'Production Supervisor');
    const frame = MockStore.findFrameByProjectAndId(projectCode, frameId)
               ?? FrameStore.getFrameFromDisk(projectCode, frameId);
    if (!frame) throw new NotFoundException(`Frame ${frameId} not found`);
    const assignments = await this.prisma.tech_assignments.findMany({
      where: { project_code: projectCode, frame_id: frameId },
      orderBy: { assigned_at: 'asc' },
    });
    const techIds = [...new Set(assignments.map(a => a.technician_id))];
    const techs = await this.prisma.users.findMany({ where: { id: { in: techIds } } });
    const techMap = new Map(techs.map(t => [t.id, t]));

    // ── palette (ARGB) ──
    const A = (hex: string) => `FF${hex}`;
    const NAVY = A('0F2557'), BLUE = A('2563EB'), INK = A('0F172A'), SLATE = A('475569');
    const LABEL = A('64748B'), BORDER = A('CBD5E1'), ZEBRA = A('F5F8FC'), HEAD_BG = A('1E293B'), WHITE = A('FFFFFF');
    const GREEN = A('15803D'), GREENBG = A('DCFCE7'), AMBER = A('B45309'), AMBERBG = A('FEF3C7'), BLUEBG = A('EFF6FF');
    const thin = { style: 'thin' as const, color: { argb: BORDER } };
    const boxBorder = { top: thin, left: thin, right: thin, bottom: thin };

    const fmt = (d: Date | null | undefined): string => {
      if (!d) return '—';
      const dt = d instanceof Date ? d : new Date(d);
      if (isNaN(dt.getTime())) return '—';
      const mon = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][dt.getUTCMonth()];
      return `${String(dt.getUTCDate()).padStart(2, '0')} ${mon} ${dt.getUTCFullYear()} ${String(dt.getUTCHours()).padStart(2, '0')}:${String(dt.getUTCMinutes()).padStart(2, '0')} UTC`;
    };

    const wb = new ExcelJS.Workbook();
    wb.creator = REPORT_COMPANY;
    wb.created = new Date();
    const sheetName = (frame.panel_name || frameId).replace(/[\\/*?[\]:]/g, '').slice(0, 28) || 'Panel Report';
    const ws = wb.addWorksheet(sheetName, {
      pageSetup: {
        orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0,
        margins: { left: 0.4, right: 0.4, top: 0.5, bottom: 0.5, header: 0.2, footer: 0.2 },
      },
    });

    const COLS = 11;
    const LAST = 'K';
    ws.columns = [6, 16, 22, 22, 14, 10, 8, 8, 14, 22, 34].map(w => ({ width: w }));
    const mergeRow = (r: number) => { try { ws.mergeCells(`A${r}:${LAST}${r}`); } catch { /* merged */ } };

    // ── Header: logo on WHITE, company on the right, then navy title band ──
    try { ws.mergeCells('A1:D1'); } catch { /* */ }
    try { ws.mergeCells('E1:K1'); } catch { /* */ }
    ws.getRow(1).height = 44;
    for (const col of ['A', 'E']) {
      ws.getCell(`${col}1`).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: WHITE } };
    }
    const logoBuf = getReportLogoBuffer();
    if (logoBuf) {
      const id = wb.addImage({ buffer: logoBuf as any, extension: 'png' });
      const h = 38, w = Math.round((h * 332) / 175); // aspect-correct (native 332×175)
      ws.addImage(id, { tl: { col: 0.1, row: 0.15 }, ext: { width: w, height: h } });
    }
    const co = ws.getCell('E1');
    co.value = `${REPORT_COMPANY}\n${REPORT_SYSTEM}`;
    co.font = { bold: true, size: 11, color: { argb: NAVY } };
    co.alignment = { horizontal: 'right', vertical: 'middle', wrapText: true, indent: 1 };

    mergeRow(2); ws.getRow(2).height = 22;
    const t2 = ws.getCell('A2');
    // Title follows the real production state: progress while wiring is in flight,
    // completion only once the panel is fully wired and supervisor-approved.
    t2.value = `${data.reportTitle.toUpperCase()} — ${data.panel.name}`;
    t2.font = { bold: true, size: 12, color: { argb: WHITE } };
    t2.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: NAVY } };
    t2.alignment = { horizontal: 'left', vertical: 'middle', indent: 1 };

    mergeRow(3); ws.getRow(3).height = 16;
    const t3 = ws.getCell('A3');
    t3.value = `${projectCode.replace(/_/g, ' ')}  ·  Client: ${data.project.client || '—'}  ·  Generated ${fmt(data.generatedAt)}`;
    t3.font = { size: 9, color: { argb: SLATE } };
    t3.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BLUEBG } };
    t3.alignment = { horizontal: 'left', vertical: 'middle', indent: 1 };

    // ── Summary section ──
    const bar = (r: number, text: string) => {
      mergeRow(r); ws.getRow(r).height = 18;
      const c = ws.getCell(`A${r}`);
      c.value = text;
      c.font = { bold: true, size: 9, color: { argb: WHITE } };
      c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: NAVY } };
      c.alignment = { horizontal: 'left', vertical: 'middle', indent: 1 };
    };
    const pair = (r: number, l1: string, v1: string, l2: string, v2: string) => {
      ws.getRow(r).height = 15;
      const put = (lCell: string, vStart: string, vEnd: string, label: string, value: string) => {
        const lc = ws.getCell(`${lCell}${r}`);
        lc.value = label.toUpperCase();
        lc.font = { bold: true, size: 7.5, color: { argb: LABEL } };
        lc.alignment = { vertical: 'middle', indent: 1 };
        try { ws.mergeCells(`${vStart}${r}:${vEnd}${r}`); } catch { /* */ }
        const vc = ws.getCell(`${vStart}${r}`);
        vc.value = value;
        vc.font = { size: 9, color: { argb: INK } };
        vc.alignment = { vertical: 'middle', indent: 1 };
      };
      try { ws.mergeCells(`A${r}:B${r}`); } catch { /* */ }
      put('A', 'C', 'E', l1, v1);
      try { ws.mergeCells(`F${r}:G${r}`); } catch { /* */ }
      put('F', 'H', 'K', l2, v2);
    };

    const reworkLabel = data.rework.count > 0 ? `${data.rework.count} · ${data.rework.status}` : 'None';
    const approvalText = data.approval.approved
      ? `Approved · ${fmt(data.approval.approvedAt)}`
      : data.technician ? 'Pending supervisor approval' : 'Not yet submitted';

    // Substation = first segment of the composite project name (matches the PDF).
    const substation = (data.project.name || '').split(/\s+[–—-]\s+/)[0].trim() || data.project.name || '—';
    bar(5, 'EXECUTION SUMMARY');
    pair(6, 'Project', substation, 'Final status', data.reportStatusLabel);
    pair(7, 'Panel / subpanel', data.panel.name, 'Completion', `${data.completionPercent}%`);
    pair(8, 'Client', data.project.client || '—', 'Cables (done / total)', `${data.cables.completed} / ${data.cables.total}`);
    pair(9, 'Region / location', data.project.locationRegion || '—', 'Wiring KPI', `${data.kpi}%`);
    pair(10, 'Voltage', data.panel.voltageLevel || '—', 'Rework', reworkLabel);
    pair(11, 'Assigned technician', data.technician?.fullName || '—', 'Production supervisor', data.supervisor?.fullName || '—');
    pair(12, 'Wiring start', fmt(data.wiring.startedAt), 'Wiring completion', fmt(data.wiring.completedAt));
    pair(13, 'Working hours', data.totalWorkingHours, 'Project duration', `${data.projectDurationDays} day(s)`);
    pair(14, 'Approval', approvalText, 'Approved by', data.approval.approvedBy?.fullName || '—');

    // ── Cable execution detail table ──
    bar(16, 'CABLE EXECUTION DETAIL');
    const headerRow = 17;
    const headers = ['#', 'Ferrule', 'Source', 'Destination', 'Wire Color', 'Size', 'Src', 'Dst', 'Status', 'Technician', 'Remarks'];
    const hr = ws.getRow(headerRow); hr.height = 22;
    headers.forEach((h, i) => {
      const c = hr.getCell(i + 1);
      c.value = h;
      c.font = { bold: true, size: 9, color: { argb: WHITE } };
      c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: HEAD_BG } };
      c.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
      c.border = boxBorder;
    });

    const centerCols = new Set([1, 6, 7, 8, 9]);
    let r = headerRow + 1;
    frame.cables.forEach((cable, idx) => {
      let cs: any = null; let techId: number | undefined;
      for (const a of [...assignments].reverse()) {
        const parsed = parseCS(a.cable_status);
        if (parsed[String(idx)]) { cs = parsed[String(idx)]; techId = a.technician_id; break; }
      }
      const src = !!cs?.src, dst = !!cs?.dst, issue = !!cs?.issue;
      const status = issue ? 'Issue' : (src && dst) ? 'Completed' : (src || dst) ? 'In Progress' : 'Pending';
      const tech = techId ? techMap.get(techId) : null;
      const row = ws.getRow(r);
      row.values = [
        cable.sno ?? idx + 1, cable.ferrule || '', cable.source || '', cable.destination || '',
        cable.color || '', cable.size || '', src ? 'YES' : '—', dst ? 'YES' : '—',
        status, tech?.full_name || '—', cs?.note || '',
      ];
      row.height = 15;
      const zebra = (r - headerRow) % 2 === 0;
      row.eachCell({ includeEmpty: true }, (c, col) => {
        if (col > COLS) return;
        c.border = boxBorder;
        c.font = { size: 8.5, color: { argb: INK } };
        c.alignment = { vertical: 'middle', horizontal: centerCols.has(col) ? 'center' : 'left', wrapText: col === 11, indent: centerCols.has(col) ? 0 : 1 };
        if (zebra) c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: ZEBRA } };
      });
      const sc = row.getCell(9);
      const stStyle = status === 'Completed' ? { fg: GREEN, bg: GREENBG }
        : status === 'Issue' ? { fg: AMBER, bg: AMBERBG }
          : status === 'In Progress' ? { fg: BLUE, bg: BLUEBG }
            : { fg: SLATE, bg: null as string | null };
      sc.font = { size: 8.5, bold: true, color: { argb: stStyle.fg } };
      if (stStyle.bg) sc.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: stStyle.bg } };
      r++;
    });
    if (frame.cables.length === 0) {
      mergeRow(r);
      const c = ws.getCell(`A${r}`);
      c.value = 'No cables in this panel schedule.';
      c.font = { italic: true, size: 9, color: { argb: LABEL } };
      c.alignment = { horizontal: 'center', vertical: 'middle' };
      c.border = boxBorder;
    }

    // ── Freeze header, filter, print titles, footer ──
    ws.views = [{ state: 'frozen', ySplit: headerRow, showGridLines: false }];
    ws.autoFilter = { from: { row: headerRow, column: 1 }, to: { row: headerRow, column: COLS } };
    ws.pageSetup.printTitlesRow = `${headerRow}:${headerRow}`;
    ws.headerFooter.oddFooter = `&L&8${REPORT_COMPANY} — Confidential&C&8Panel Completion Report&R&8Page &P of &N`;

    if (data.contributions.length > 0) {
      const history = wb.addWorksheet('Technician Contributions', {
        pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
      });
      history.columns = [
        { header: 'Technician', key: 'technician', width: 30 },
        { header: 'Username', key: 'username', width: 18 },
        { header: 'Work Start', key: 'start', width: 24 },
        { header: 'Work End', key: 'end', width: 24 },
        { header: 'Duration', key: 'duration', width: 14 },
        { header: 'Cables Completed', key: 'cables', width: 18 },
        { header: 'Source Ends', key: 'source', width: 14 },
        { header: 'Destination Ends', key: 'destination', width: 18 },
        { header: 'Progress Before', key: 'before', width: 17 },
        { header: 'Progress After', key: 'after', width: 17 },
        { header: 'Login / Logout Details', key: 'sessions', width: 48 },
      ];
      const historyHeader = history.getRow(1);
      historyHeader.height = 24;
      historyHeader.eachCell(cell => {
        cell.font = { bold: true, color: { argb: WHITE } };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: HEAD_BG } };
        cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
        cell.border = boxBorder;
      });
      data.contributions.forEach(contribution => {
        const row = history.addRow({
          technician: contribution.technician.fullName,
          username: contribution.technician.username,
          start: fmt(contribution.startedAt),
          end: contribution.endedAt ? fmt(contribution.endedAt) : 'Active',
          duration: contribution.durationHuman,
          cables: contribution.cablesCompleted,
          source: contribution.sourceEndsCompleted,
          destination: contribution.destinationEndsCompleted,
          before: contribution.progressBefore,
          after: contribution.progressAfter,
          sessions: contribution.sessionLog.length
            ? contribution.sessionLog.map(session => `${fmt(session.loginAt)} → ${session.logoutAt ? fmt(session.logoutAt) : 'Active'}`).join('\n')
            : '—',
        });
        row.height = Math.max(20, contribution.sessionLog.length * 15);
        row.eachCell({ includeEmpty: true }, cell => {
          cell.font = { size: 9, color: { argb: INK } };
          cell.alignment = { vertical: 'top', wrapText: true };
          cell.border = boxBorder;
        });
      });
      if (data.midChangeHistory.length > 0) {
        const titleRow = history.addRow([]);
        history.mergeCells(`A${titleRow.number}:K${titleRow.number}`);
        titleRow.getCell(1).value = 'PERMANENT MID CHANGE AUDIT';
        titleRow.getCell(1).font = { bold: true, color: { argb: WHITE } };
        titleRow.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: NAVY } };
        data.midChangeHistory.forEach(entry => {
          const auditRow = history.addRow([fmt(entry.at), entry.technicianName, entry.action.replace(/_/g, ' '), entry.details]);
          history.mergeCells(`D${auditRow.number}:K${auditRow.number}`);
          auditRow.eachCell({ includeEmpty: true }, cell => {
            cell.alignment = { vertical: 'top', wrapText: true };
            cell.border = boxBorder;
          });
        });
      }
      history.views = [{ state: 'frozen', ySplit: 1, showGridLines: false }];
      history.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: 11 } };
      history.headerFooter.oddFooter = `&L&8${REPORT_COMPANY} — Confidential&C&8Technician Contribution History&R&8Page &P of &N`;
    }

    return Buffer.from(await wb.xlsx.writeBuffer());
  }

  // ── Wiring Schedule Excel Export (professional, color-coded, visually guided) ──

  async wiringScheduleXlsx(projectCode: string, frameId: string): Promise<Buffer> {
    assertPanelNameUniqueForWrite(projectCode, frameId);
    const frame = MockStore.findFrameByProjectAndId(projectCode, frameId)
               ?? FrameStore.getFrameFromDisk(projectCode, frameId);
    if (!frame) throw new NotFoundException(`Frame ${frameId} not found`);

    const project = await this.prisma.projects.findFirst({ where: { code: projectCode, is_active: true } });

    const wb = new ExcelJS.Workbook();
    wb.creator = 'DWES — Digital Wiring Execution System';
    wb.created = new Date();

    const sheetName = (frame.panel_name || frameId).replace(/[\\/*?[\]:]/g, '').slice(0, 31);
    const ws = wb.addWorksheet(sheetName, {
      pageSetup: {
        orientation: 'landscape',
        fitToPage: true,
        fitToWidth: 1,
        fitToHeight: 0,
        printTitlesRow: '7:7',
      },
      properties: { defaultRowHeight: 18 },
    });

    // ── Column definitions (A–N, 14 columns) ───────────────────────────────
    ws.columns = [
      { key: 'sno',     width: 6  },   // A  S.No
      { key: 'panel',   width: 14 },   // B  Panel
      { key: 'srcDev',  width: 14 },   // C  Source Device
      { key: 'srcTerm', width: 10 },   // D  Source Terminal
      { key: 'ferrA',   width: 24 },   // E  Ferrule (A)
      { key: 'ferrB',   width: 24 },   // F  Ferrule (B) — reversed
      { key: 'ref',     width: 12 },   // G  Reference
      { key: 'src',     width: 18 },   // H  Source
      { key: 'dst',     width: 18 },   // I  Destination
      { key: 'color',   width: 16 },   // J  Wire Color ← color-coded cell
      { key: 'size',    width: 14 },   // K  Wire Size
      { key: 'sign',    width: 12 },   // L  Sign Mark
      { key: 'length',  width: 12 },   // M  Length (m) ← data-bar
      { key: 'remarks', width: 34 },   // N  Remarks
    ];
    const NCOLS = 14;
    const lastCol = 'N';

    // ── Header block rows 1-6 ─────────────────────────────────────────────
    const NAVY = '0F2557';
    const APP_BLUE = '2563EB';
    const INFO_BG = 'EFF6FF';
    const INFO_FG = '1E3A5F';

    const merge = (rowNum: number) => ws.mergeCells(`A${rowNum}:${lastCol}${rowNum}`);

    // Row 1 — Company / system banner (logo + title)
    merge(1);
    ws.getRow(1).height = 52;
    const logoBuf = getReportLogoBuffer();
    if (logoBuf) {
      const imageId = wb.addImage({ buffer: logoBuf as any, extension: 'png' });
      ws.addImage(imageId, {
        tl: { col: 0.15, row: 0.08 },
        ext: { width: 130, height: 38 },
      });
    }
    const r1 = ws.getCell('A1');
    r1.value = logoBuf
      ? `  DWES — Digital Wiring Execution System`
      : 'DWES — Digital Wiring Execution System';
    r1.font = { bold: true, size: 13, color: { argb: 'FFFFFFFF' } };
    r1.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: NAVY } };
    r1.alignment = { horizontal: 'left', vertical: 'middle', indent: logoBuf ? 12 : 1 };

    // Row 2 — Panel / report title
    merge(2);
    const r2 = ws.getCell('A2');
    r2.value = `Wiring Schedule — ${frame.panel_name || frameId}`;
    r2.font = { bold: true, size: 11, color: { argb: 'FFFFFFFF' } };
    r2.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: APP_BLUE } };
    r2.alignment = { horizontal: 'left', vertical: 'middle', indent: 1 };
    ws.getRow(2).height = 24;

    // Row 3 — Project / client
    merge(3);
    const r3 = ws.getCell('A3');
    r3.value = `Project: ${projectCode}   |   Client: ${project?.client || '—'}   |   ${project?.name || ''}`;
    r3.font = { size: 10, color: { argb: INFO_FG } };
    r3.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: INFO_BG } };
    r3.alignment = { horizontal: 'left', vertical: 'middle', indent: 1 };
    ws.getRow(3).height = 18;

    // Row 4 — Panel / total cables. The internal frame id is never printed: readers
    // identify the panel by its name.
    merge(4);
    const r4 = ws.getCell('A4');
    r4.value = `Panel: ${frame.panel_name || frameId}   |   Total Cables: ${frame.cable_count || frame.cables.length}`;
    r4.font = { size: 10, color: { argb: INFO_FG } };
    r4.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: INFO_BG } };
    r4.alignment = { horizontal: 'left', vertical: 'middle', indent: 1 };
    ws.getRow(4).height = 18;

    // Row 5 — Generated timestamp
    merge(5);
    const r5 = ws.getCell('A5');
    r5.value = `Generated: ${new Date().toISOString().replace('T', ' ').slice(0, 19)} UTC`;
    r5.font = { size: 9, italic: true, color: { argb: '64748B' } };
    r5.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: INFO_BG } };
    r5.alignment = { horizontal: 'left', vertical: 'middle', indent: 1 };
    ws.getRow(5).height = 15;

    // Row 6 — blank separator
    merge(6);
    ws.getRow(6).height = 6;
    ws.getCell('A6').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'E2E8F0' } };

    // ── Column header row (Row 7) ─────────────────────────────────────────
    const COL_HEADERS = [
      'S.No', 'Panel', 'Source Device', 'Src Terminal',
      'Ferrule (A)', 'Ferrule (B)', 'Reference', 'Source', 'Destination',
      'Wire Color', 'Wire Size', 'Sign Mark', 'Length (m)', 'Remarks',
    ];
    const hRow = ws.getRow(7);
    hRow.height = 22;
    COL_HEADERS.forEach((label, i) => {
      const cell = hRow.getCell(i + 1);
      cell.value = label;
      cell.font = { bold: true, size: 10, color: { argb: 'FFFFFFFF' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: '1E293B' } };
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
      cell.border = { bottom: { style: 'medium', color: { argb: '2563EB' } } };
    });

    // Freeze rows 1-7 so column header stays visible while scrolling
    ws.views = [{ state: 'frozen', xSplit: 0, ySplit: 7, topLeftCell: 'A8', showGridLines: true }];

    // Auto-filter on column header row
    ws.autoFilter = { from: { row: 7, column: 1 }, to: { row: 7, column: NCOLS } };

    // ── Cable color → cell fill map ───────────────────────────────────────
    type ColorDef = { bg: string; fg: string };
    const COLOR_MAP: Record<string, ColorDef> = {
      'BLUE':           { bg: '4472C4', fg: 'FFFFFF' },
      'GREY':           { bg: '808080', fg: 'FFFFFF' },
      'GRAY':           { bg: '808080', fg: 'FFFFFF' },
      'RED':            { bg: 'D32F2F', fg: 'FFFFFF' },
      'GREEN/YELLOW':   { bg: '70AD47', fg: 'FFFFFF' },
      'YELLOW':         { bg: 'FFD700', fg: '000000' },
      'BLACK':          { bg: '212121', fg: 'FFFFFF' },
      'WHITE':          { bg: 'F5F5F5', fg: '212121' },
      'BROWN':          { bg: '8B4513', fg: 'FFFFFF' },
      'ORANGE':         { bg: 'EF6C00', fg: 'FFFFFF' },
      'GREEN':          { bg: '00895A', fg: 'FFFFFF' },
      'PINK':           { bg: 'E91E63', fg: 'FFFFFF' },
      'VIOLET':         { bg: '7030A0', fg: 'FFFFFF' },
      'PURPLE':         { bg: '7030A0', fg: 'FFFFFF' },
    };

    const ZEBRA_ODD  = 'FFFFFF';
    const ZEBRA_EVEN = 'F1F5F9';  // slate-100

    // ── Cable data rows (starting at row 8) ──────────────────────────────
    const FIRST_ROW = 8;
    frame.cables.forEach((cable: any, idx: number) => {
      const rowNum = FIRST_ROW + idx;
      const dRow   = ws.getRow(rowNum);
      dRow.height  = 18;
      const zebraFg = idx % 2 === 0 ? ZEBRA_ODD : ZEBRA_EVEN;

      // Parse length string "2.5m" → 2.5
      const lenNum = parseFloat(String(cable.length || '').replace(/[^0-9.]/g, '')) || 0;

      // Derive reversed ferrule (Ferrule B)
      const ferr = String(cable.ferrule || '');
      const slash = ferr.indexOf('/');
      const ferrB = slash >= 0 ? ferr.slice(slash + 1) + '/' + ferr.slice(0, slash) : '';

      const values: (string | number)[] = [
        cable.sno,
        cable.panel || '',
        cable.source_device || '',
        cable.source_terminal || '',
        ferr,
        ferrB,
        cable.ref || '',
        cable.source || '',
        cable.destination || '',
        cable.color || '',
        cable.size || '',
        cable.sign || '',
        lenNum,
        cable.remarks || '',
      ];

      values.forEach((v, ci) => {
        const cell = dRow.getCell(ci + 1);
        cell.value = v;
        cell.font  = { size: 9 };
        cell.fill  = { type: 'pattern', pattern: 'solid', fgColor: { argb: zebraFg } };
        cell.alignment = { vertical: 'middle' };

        // Right-align S.No and Length
        if (ci === 0 || ci === 12) cell.alignment = { ...cell.alignment, horizontal: 'right' };
        // Center-align Panel, devices, terminals, color, size, sign
        if ([1, 2, 3, 9, 10, 11].includes(ci)) cell.alignment = { ...cell.alignment, horizontal: 'center' };
        // Wrap Remarks
        if (ci === 13) cell.alignment = { ...cell.alignment, wrapText: true };

        // Wire Color cell (column J, ci=9): override fill + font
        if (ci === 9) {
          const key = String(v).toUpperCase().trim();
          const def: ColorDef | undefined = COLOR_MAP[key];
          if (def) {
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: def.bg } };
            cell.font = { size: 9, bold: true, color: { argb: def.fg } };
            // White cable: add thin border so cell is visible
            if (key === 'WHITE') {
              cell.border = {
                top: { style: 'thin', color: { argb: 'CBD5E1' } },
                bottom: { style: 'thin', color: { argb: 'CBD5E1' } },
                left: { style: 'thin', color: { argb: 'CBD5E1' } },
                right: { style: 'thin', color: { argb: 'CBD5E1' } },
              };
            }
          }
        }
      });
    });

    const lastDataRow = FIRST_ROW + frame.cables.length - 1;

    // ── Data-bar conditional format on Length column (M) ─────────────────
    if (frame.cables.length > 0) {
      ws.addConditionalFormatting({
        ref: `M${FIRST_ROW}:M${lastDataRow}`,
        rules: [{
          type: 'dataBar' as any,
          priority: 1,
          minLength: 0,
          maxLength: 100,
          cfvo: [{ type: 'min' }, { type: 'max' }],
          color: { argb: 'FF2563EB' },
          showValue: true,
        } as any],
      });
    }

    // Print area
    ws.pageSetup.printArea = `A1:${lastCol}${lastDataRow}`;

    const raw = await wb.xlsx.writeBuffer();
    return Buffer.from(raw);
  }

  async revalidate(projectCode: string, frameId: string) {
    assertPanelNameUniqueForWrite(projectCode, frameId);
    const frame = MockStore.findFrameByProjectAndId(projectCode, frameId)
               ?? FrameStore.getFrameFromDisk(projectCode, frameId);
    if (!frame) throw new NotFoundException(`Frame ${frameId} not found`);
    const assignments = await this.prisma.tech_assignments.findMany({
      where: { project_code: projectCode, frame_id: frameId },
    });
    const mismatches = [];
    let matched = 0;
    
    // Quick validation simulation
    const mergedStatus: Record<string, any> = {};
    for (const a of assignments) {
      const cs = parseCS(a.cable_status);
      for (const [idx, st] of Object.entries(cs)) {
        mergedStatus[idx] = st;
      }
    }
    
    frame.cables.forEach((c, i) => {
      const st = mergedStatus[String(i)];
      if (st && st.src && st.dst) {
        matched++;
      } else if (!st || (!st.src && !st.dst)) {
        mismatches.push({ cable_index: i, issue: 'Cable pending' });
      } else {
        mismatches.push({ cable_index: i, issue: 'One end open' });
      }
    });

    return {
      verified: mismatches.length === 0,
      mismatches,
      total: frame.cables.length,
      matched,
      unmatched: mismatches.length
    };
  }

  async confirmRevalidation(projectCode: string, frameId: string, user: AnyUser) {
    assertPanelNameUniqueForWrite(projectCode, frameId);
    const path = require('path');
    const fs = require('fs');
    const dir = path.join(process.cwd(), 'uploads', projectCode, 'frames');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    
    const meta = { stamped_at: new Date().toISOString(), stamped_by: user.id, name: user.full_name };
    fs.writeFileSync(path.join(dir, `${frameId}.revalidation.json`), JSON.stringify(meta, null, 2));

    try {
      // The DB schema doesn't have revalidated_at, fallback to updating reviewed_at
      await this.prisma.tech_assignments.updateMany({
        where: { project_code: projectCode, frame_id: frameId },
        data: { reviewed_at: new Date() }
      });
    } catch (e) {
      console.warn('Could not update revalidated_at column', e);
    }

    return { message: 'Revalidation confirmed and stamped' };
  }
}
