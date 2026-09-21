import { Injectable, Optional } from '@nestjs/common';
import type { projects as ProjectRow } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { DashboardCacheService } from '../common/cache/dashboard-cache.service';
import { MockStore } from '../data/mock-store';
import { assignedCableKpiPercent, wiringKpiPercent, compositeKpiPercent } from '../common/kpi.constants';
import { parseCableStatus } from '../common/cable-status.util';
import { directorSubmissionKey } from '../common/director-submission.util';
import {
  buildOneSideRows,
  mapAssignmentStatus,
  projectLifecycleBucket,
  rollupCableStatus,
} from '../common/director-monitoring.helper';
import { summarizeCrimpingKpis } from '../common/crimping';
import { FrameStore } from '../frames/frame-store';
import { drawEnterpriseFooter, drawEnterpriseHeader, pageBox } from '../common/pdf-report-layout';
import * as ExcelJS from 'exceljs';
import * as PDFDocument from 'pdfkit';

interface DirectorAssignmentRow {
  id: number; project_code: string; technician_id: number;
  status: string | null; review_status: string | null; qc_status: string | null;
  supervisor_approved: boolean | null; rework_requested: boolean | null;
  total_wiring_seconds: number | null;
  cables_total: number | null; cables_src_done: number | null; cables_dst_done: number | null;
}
interface DirectorTechRow {
  id: number; full_name: string | null; employee_id: string | null;
  is_active: boolean | null; whatsapp_number: string | null; last_login: Date | null;
}
interface DirectorInspectionRow { assignment_id: number; overall_result: string | null }
interface DirectorCore {
  projects: ProjectRow[];
  assignments: DirectorAssignmentRow[];
  techs: DirectorTechRow[];
  inspections: DirectorInspectionRow[];
}

@Injectable()
export class DirectorService {
  constructor(
    private prisma: PrismaService,
    @Optional() private cacheService?: DashboardCacheService,
  ) {}

  /**
   * The stats/projects/workforce views aggregate the same four datasets; the
   * exports render all three at once. Fetch each table exactly once and keep
   * the payload to the columns the aggregations read — tech_assignments in
   * particular carries the full cable_status JSON, which none of these use.
   */
  private async loadCore(): Promise<DirectorCore> {
    const cached = await this.cacheService?.getAsync<DirectorCore>('director:core');
    if (cached) return cached;

    const [projects, assignments, techs, inspections] = await Promise.all([
      this.prisma.projects.findMany({ where: { is_active: true } }),
      this.prisma.tech_assignments.findMany({
        select: {
          id: true, project_code: true, technician_id: true, status: true,
          review_status: true, qc_status: true, supervisor_approved: true,
          rework_requested: true, total_wiring_seconds: true,
          cables_total: true, cables_src_done: true, cables_dst_done: true,
        },
      }),
      this.prisma.users.findMany({
        where: { role: 'wiring_technician' },
        select: {
          id: true, full_name: true, employee_id: true, is_active: true,
          whatsapp_number: true, last_login: true,
        },
      }),
      this.prisma.panel_inspections.findMany({
        select: { assignment_id: true, overall_result: true },
      }),
    ]);
    const core = { projects, assignments, techs, inspections };
    this.cacheService?.set('director:core', core, 30_000);
    return core;
  }

  async stats() {
    const cached = await this.cacheService?.getAsync<any>('director:stats');
    if (cached) return cached;
    const res = this.statsFrom(await this.loadCore());
    this.cacheService?.set('director:stats', res, 30_000);
    return res;
  }

  private statsFrom({ projects, assignments, techs: allTechs, inspections }: DirectorCore) {
    // Same predicate the previous dedicated query used (is_active: true excludes null).
    const techs = allTechs.filter(t => t.is_active === true);

    const totalCables = assignments.reduce((s, a) => s + (a.cables_total || 0), 0);
    const srcDone = assignments.reduce((s, a) => s + (a.cables_src_done || 0), 0);
    const dstDone = assignments.reduce((s, a) => s + (a.cables_dst_done || 0), 0);
    const wiringKpi = wiringKpiPercent(srcDone, dstDone, totalCables);
    const qcPassed = inspections.filter(i => i.overall_result === 'PASS').length;
    const qcTotal = inspections.length;
    const qcPassRate = qcTotal > 0 ? Math.round((qcPassed / qcTotal) * 100) : 0;

    const completedAssignments = assignments.filter(a => a.status === 'completed');
    const totalWiringSeconds = completedAssignments.reduce((s, a) => s + (a.total_wiring_seconds || 0), 0);
    const compositeKpi = compositeKpiPercent(wiringKpi, qcPassRate);

    return {
      projects_total: projects.length,
      // 'active' and 'wiring_started' both mean live project; 'not_started' = created but not begun
      projects_active: projects.filter(p => p.project_state === 'active' || p.project_state === 'wiring_started').length,
      // 'completed_by_tech' is the real completion state written by the technician workflow
      projects_completed: projects.filter(p => p.project_state === 'completed' || p.project_state === 'completed_by_tech').length,
      technicians_active: techs.length,
      technicians_in_progress: assignments.filter(a => a.status === 'in_progress').length,
      panels_total: assignments.length,
      // Director view: 'assigned' = panel given to tech (active work); 'in_progress' = tech has started
      panels_assigned: assignments.filter(a => a.status === 'assigned').length,
      panels_in_progress: assignments.filter(a => a.status === 'assigned' || a.status === 'in_progress').length,
      panels_completed: completedAssignments.length,
      panels_paused: assignments.filter(a => a.status === 'paused').length,
      panels_ready_for_qc: assignments.filter(a => a.review_status === 'ready_for_qc' || a.qc_status === 'ready_for_qc').length,
      cables_total: totalCables, cables_src_done: srcDone, cables_dst_done: dstDone,
      wiring_kpi: wiringKpi, qc_inspections: qcTotal, qc_pass_rate: qcPassRate,
      composite_kpi: compositeKpi, total_wiring_hours: Math.round(totalWiringSeconds / 3600 * 10) / 10,
      pending_approvals: assignments.filter(a => !a.supervisor_approved && a.status === 'assigned').length,
      rework_requested: assignments.filter(a => a.rework_requested).length,
    };
  }

  async projects() {
    return this.projectsFrom(await this.loadCore());
  }

  private projectsFrom({ projects, assignments, inspections }: DirectorCore) {
    const assignMap: Record<string, any[]> = {};
    for (const a of assignments) {
      if (!assignMap[a.project_code]) assignMap[a.project_code] = [];
      assignMap[a.project_code].push(a);
    }

    return projects.map(p => {
      const projectAssignments = assignMap[p.code] || [];
      const frames = MockStore.findFramesByProject(p.code);
      const totalCables = projectAssignments.reduce((s, a) => s + (a.cables_total || 0), 0);
      const srcDone = projectAssignments.reduce((s, a) => s + (a.cables_src_done || 0), 0);
      const dstDone = projectAssignments.reduce((s, a) => s + (a.cables_dst_done || 0), 0);
      const kpi = totalCables > 0 ? Math.round(((srcDone + dstDone) / (totalCables * 2)) * 100) : 0;
      const activeTechIds = new Set(projectAssignments.filter(a => a.status === 'in_progress').map(a => a.technician_id));
      const totalWiringSeconds = projectAssignments.filter(a => a.status === 'completed').reduce((s, a) => s + (a.total_wiring_seconds || 0), 0);
      const assignIds = new Set(projectAssignments.map(a => a.id));
      const qcInspections = inspections.filter(i => assignIds.has(i.assignment_id));
      return {
        ...p, status: p.project_state, client_name: p.client,
        frames_total: frames.length, frames_validated: frames.filter(f => f.compare_status === 'validated').length,
        panels_total: projectAssignments.length, panels_completed: projectAssignments.filter(a => a.status === 'completed').length,
        panels_in_progress: projectAssignments.filter(a => a.status === 'in_progress').length,
        cables_total: totalCables, cables_src_done: srcDone, cables_dst_done: dstDone, kpi,
        active_technicians: activeTechIds.size, wiring_hours: Math.round(totalWiringSeconds / 3600 * 10) / 10,
        qc_pass_rate: qcInspections.length > 0 ? Math.round(qcInspections.filter(i => i.overall_result === 'PASS').length / qcInspections.length * 100) : null,
      };
    });
  }

  async workforce() {
    return this.workforceFrom(await this.loadCore());
  }

  /**
   * Read-only Monitoring payload for the Director dashboard.
   * Separate from loadCore() so full cable_status JSON is not kept in the core cache.
   */
  async monitoring() {
    const cached = await this.cacheService?.getAsync<any>('director:monitoring');
    if (cached) return cached;

    const [projects, assignments, techs, latestAudits] = await Promise.all([
      this.prisma.projects.findMany({ where: { is_active: true } }),
      this.prisma.tech_assignments.findMany({
        where: { is_hidden: { not: true } },
        select: {
          id: true,
          project_code: true,
          frame_id: true,
          panel_name: true,
          technician_id: true,
          status: true,
          cable_status: true,
          cables_total: true,
          cables_src_done: true,
          cables_dst_done: true,
          assigned_at: true,
          started_at: true,
          paused_at: true,
          completed_at: true,
          pause_reason: true,
          rework_requested: true,
        },
      }),
      this.prisma.users.findMany({
        where: { role: 'wiring_technician' },
        select: {
          id: true, full_name: true, employee_id: true, is_active: true, last_login: true,
        },
      }),
      this.prisma.tech_audit_log.findMany({
        orderBy: { created_at: 'desc' },
        take: 2000,
        select: {
          project_code: true,
          frame_id: true,
          panel_name: true,
          created_at: true,
          technician_id: true,
        },
      }),
    ]);

    const techById = new Map(techs.map(t => [t.id, t]));
    const projectByCode = new Map(projects.map(p => [p.code, p]));

    // tech_audit_log has no assignment_id — key by tech + project + frame (fallback panel)
    const auditActivityKey = (
      technicianId: number,
      projectCode: string | null | undefined,
      frameId: string | null | undefined,
      panelName?: string | null,
    ) => `${technicianId}::${projectCode || ''}::${frameId || panelName || ''}`;

    const latestActivityByKey = new Map<string, string>();
    for (const a of latestAudits) {
      const key = auditActivityKey(a.technician_id, a.project_code, a.frame_id, a.panel_name);
      if (latestActivityByKey.has(key)) continue;
      latestActivityByKey.set(
        key,
        a.created_at?.toISOString?.() || String(a.created_at || ''),
      );
    }

    const frameWireCache = new Map<string, Array<{ sno: string | number | null; wire_ref: string }>>();
    const resolveWireRef = (projectCode: string, frameId: string, cableIndex: number) => {
      const key = `${projectCode}::${frameId}`;
      if (!frameWireCache.has(key)) {
        const frame = MockStore.findFrameByProjectAndId(projectCode, frameId)
          ?? FrameStore.getFrameFromDisk(projectCode, frameId);
        const cables = Array.isArray((frame as any)?.cables) ? (frame as any).cables : [];
        frameWireCache.set(
          key,
          cables.map((c: any, idx: number) => {
            const sno = c?.sno ?? c?.['S.NO'] ?? idx + 1;
            const ferrule = String(c?.ferrule || c?.path || '').trim();
            const src = String(c?.source || `${c?.source_device || ''}:${c?.source_terminal || ''}`).replace(/^:|:$/g, '');
            const dst = String(c?.destination || `${c?.dest_device || ''}:${c?.dest_terminal || ''}`).replace(/^:|:$/g, '');
            const wire_ref = ferrule || (src && dst ? `${src} → ${dst}` : `Cable ${idx + 1}`);
            return { sno, wire_ref };
          }),
        );
      }
      const list = frameWireCache.get(key) || [];
      return list[cableIndex] || { sno: cableIndex + 1, wire_ref: `Cable ${cableIndex + 1}` };
    };

    // --- Projects status ---
    const assignByProject: Record<string, typeof assignments> = {};
    for (const a of assignments) {
      if (!assignByProject[a.project_code]) assignByProject[a.project_code] = [];
      assignByProject[a.project_code].push(a);
    }

    let panelsCompleted = 0;
    let cablesTotalAll = 0;
    let cablesSrcAll = 0;
    let cablesDstAll = 0;
    const projectRows = projects.map(p => {
      const list = assignByProject[p.code] || [];
      const completed = list.filter(a => a.status === 'completed').length;
      panelsCompleted += completed;
      const inProg = list.filter(a => a.status === 'in_progress' || a.status === 'paused').length;
      const totalCables = list.reduce((s, a) => s + (a.cables_total || 0), 0);
      const srcDone = list.reduce((s, a) => s + (a.cables_src_done || 0), 0);
      const dstDone = list.reduce((s, a) => s + (a.cables_dst_done || 0), 0);
      cablesTotalAll += totalCables;
      cablesSrcAll += srcDone;
      cablesDstAll += dstDone;
      const progress_pct = wiringKpiPercent(srcDone, dstDone, totalCables);
      const status = projectLifecycleBucket(p.project_state);
      return {
        code: p.code,
        name: p.name,
        client: p.client,
        status,
        progress_pct,
        panels_total: list.length,
        panels_completed: completed,
        panels_in_progress: inProg,
        cables_total: totalCables,
        cables_completed: Math.min(totalCables, Math.round((srcDone + dstDone) / 2)),
      };
    });

    const projects_status = {
      totals: {
        projects: projects.length,
        not_started: projectRows.filter(p => p.status === 'not_started').length,
        in_progress: projectRows.filter(p => p.status === 'in_progress').length,
        completed: projectRows.filter(p => p.status === 'completed').length,
        overall_progress_pct: wiringKpiPercent(cablesSrcAll, cablesDstAll, cablesTotalAll),
        panels_total: assignments.length,
        panels_completed: panelsCompleted,
      },
      projects: projectRows,
    };

    // --- Consolidated panels + one-side + employee rollups ---
    const consolidated_panels: any[] = [];
    const oneSideRows: any[] = [];
    let oneSideSummary = {
      src_only: 0,
      dst_only: 0,
      both_done: 0,
      both_pending: 0,
      open_source: 0,
      open_destination: 0,
    };

    const employeeMap = new Map<number, {
      technician_id: number;
      full_name: string;
      employee_id: string | null;
      assignments: any[];
    }>();

    for (const a of assignments) {
      const total = a.cables_total || 0;
      const rollup = rollupCableStatus(a.cable_status, total);
      const csMap = parseCableStatus(a.cable_status);
      const cablesForCrimp = [];
      for (let i = 0; i < total; i++) {
        cablesForCrimp.push(csMap[String(i)] || { src: false, dst: false });
      }
      const crimping = summarizeCrimpingKpis(cablesForCrimp);
      const tech = techById.get(a.technician_id);
      const techName = tech?.full_name || `Technician #${a.technician_id}`;
      const project = projectByCode.get(a.project_code);
      const latest = latestActivityByKey.get(
        auditActivityKey(a.technician_id, a.project_code, a.frame_id, a.panel_name),
      )
        || a.completed_at?.toISOString?.()
        || a.paused_at?.toISOString?.()
        || a.started_at?.toISOString?.()
        || a.assigned_at?.toISOString?.()
        || null;

      consolidated_panels.push({
        project_code: a.project_code,
        project_name: project?.name || a.project_code,
        panel_name: a.panel_name,
        frame_id: a.frame_id,
        assignment_id: a.id,
        total_wires: total,
        finished: rollup.finished,
        remaining: rollup.remaining,
        skipped: rollup.skipped,
        open_source: rollup.open_source,
        open_destination: rollup.open_destination,
        corrections: rollup.corrections + (a.rework_requested ? 1 : 0),
        progress_pct: rollup.progress_pct,
        assigned_employees: [techName],
        started_at: a.started_at?.toISOString?.() || a.assigned_at?.toISOString?.() || null,
        latest_activity_at: latest,
        assignment_status: mapAssignmentStatus(a.status),
        // Crimping / Stripping KPIs — required denominator (not total wires)
        crimping_required: crimping.required,
        crimping_completed: crimping.completed,
        crimping_partial: crimping.partial,
        crimping_pending: crimping.pending,
        crimping_rework: crimping.rework,
        crimping_percent: crimping.percent,
        source_stripped: crimping.sourceStripped,
        source_crimped: crimping.sourceCrimped,
        destination_stripped: crimping.destinationStripped,
        destination_crimped: crimping.destinationCrimped,
        ready_for_wiring: crimping.readyForWiring,
      });

      oneSideSummary.src_only += rollup.src_only;
      oneSideSummary.dst_only += rollup.dst_only;
      oneSideSummary.both_done += rollup.both_done;
      oneSideSummary.both_pending += rollup.both_pending;
      oneSideSummary.open_source += rollup.open_source;
      oneSideSummary.open_destination += rollup.open_destination;

      const wireRows = buildOneSideRows({
        project_code: a.project_code,
        panel_name: a.panel_name || '',
        assignment_id: a.id,
        technician_name: techName,
        panel_progress_pct: rollup.progress_pct,
        cables_total: total,
        cable_status: a.cable_status,
        wireRef: (idx) => resolveWireRef(a.project_code, a.frame_id, idx),
      });
      // Prefer actionable one-side / pending / skipped rows for the dedicated report table
      oneSideRows.push(
        ...wireRows.filter(r => r.bucket === 'src_only' || r.bucket === 'dst_only'
          || r.bucket === 'both_pending' || r.bucket === 'skipped'),
      );

      if (!employeeMap.has(a.technician_id)) {
        employeeMap.set(a.technician_id, {
          technician_id: a.technician_id,
          full_name: techName,
          employee_id: tech?.employee_id || null,
          assignments: [],
        });
      }
      employeeMap.get(a.technician_id)!.assignments.push({
        project_code: a.project_code,
        panel_name: a.panel_name,
        frame_id: a.frame_id,
        assignment_id: a.id,
        status: mapAssignmentStatus(a.status),
        assigned_wires: total,
        finished: rollup.finished,
        remaining: rollup.remaining,
        skipped: rollup.skipped,
        open_side: rollup.open_source + rollup.open_destination,
        corrections: rollup.corrections + (a.rework_requested ? 1 : 0),
        started_at: a.started_at?.toISOString?.() || a.assigned_at?.toISOString?.() || null,
        last_activity_at: latest,
        productivity_pct: rollup.progress_pct,
      });
    }

    const activeAssignStatuses = new Set(['assigned', 'in_progress', 'paused']);
    const peopleRows: any[] = [];
    let working = 0;
    let paused = 0;
    let not_started = 0;
    let completedPeople = 0;
    let withActive = 0;

    const activeTechs = techs.filter(t => t.is_active !== false);
    for (const t of activeTechs) {
      const mine = assignments.filter(a => a.technician_id === t.id);
      const active = mine.find(a => activeAssignStatuses.has(String(a.status || '')))
        || mine.find(a => a.status === 'completed')
        || null;
      if (!active) {
        peopleRows.push({
          technician_id: t.id,
          full_name: t.full_name || `Technician #${t.id}`,
          status: 'no_active_assignment',
          project_code: null,
          panel_name: null,
          last_activity_at: t.last_login?.toISOString?.() || null,
        });
        continue;
      }
      withActive += 1;
      const mapped = mapAssignmentStatus(active.status);
      if (mapped === 'working') working += 1;
      else if (mapped === 'paused') paused += 1;
      else if (mapped === 'not_started') not_started += 1;
      else if (mapped === 'completed') completedPeople += 1;

      peopleRows.push({
        technician_id: t.id,
        full_name: t.full_name || `Technician #${t.id}`,
        status: mapped === 'not_started' ? 'not_started' : mapped,
        project_code: active.project_code,
        panel_name: active.panel_name,
        last_activity_at: latestActivityByKey.get(
          auditActivityKey(active.technician_id, active.project_code, active.frame_id, active.panel_name),
        )
          || active.started_at?.toISOString?.()
          || t.last_login?.toISOString?.()
          || null,
      });
    }

    const no_active_assignment = activeTechs.length - withActive;

    const res = {
      projects_status,
      consolidated_panels,
      one_side: {
        summary: oneSideSummary,
        rows: oneSideRows,
      },
      employees: [...employeeMap.values()].sort((a, b) => a.full_name.localeCompare(b.full_name)),
      people_working: {
        totals: {
          assigned: withActive,
          working,
          paused,
          not_started,
          completed: completedPeople,
          no_active_assignment: Math.max(0, no_active_assignment),
        },
        rows: peopleRows,
      },
    };

    this.cacheService?.set('director:monitoring', res, 30_000);
    return res;
  }

  private workforceFrom({ techs, assignments, inspections }: DirectorCore) {
    const assignMap: Record<number, any[]> = {};
    for (const a of assignments) {
      if (!assignMap[a.technician_id]) assignMap[a.technician_id] = [];
      assignMap[a.technician_id].push(a);
    }
    return techs.map(t => {
      const techAssignments = assignMap[t.id] || [];
      const completed = techAssignments.filter(a => a.status === 'completed');
      const totalCables = techAssignments.reduce((s, a) => s + (a.cables_total || 0), 0);
      const srcDone = techAssignments.reduce((s, a) => s + (a.cables_src_done || 0), 0);
      const dstDone = techAssignments.reduce((s, a) => s + (a.cables_dst_done || 0), 0);
      const kpi = totalCables > 0 ? Math.round(((srcDone + dstDone) / (totalCables * 2)) * 100) : 0;
      const totalWiringSeconds = completed.reduce((s, a) => s + (a.total_wiring_seconds || 0), 0);
      const assignIds = new Set(techAssignments.map(a => a.id));
      const qcInspections = inspections.filter(i => assignIds.has(i.assignment_id));
      const current = techAssignments.find(a => a.status === 'in_progress') || null;
      return {
        id: t.id, full_name: t.full_name, employee_id: t.employee_id, is_active: t.is_active, whatsapp: t.whatsapp_number,
        panels_total: techAssignments.length, panels_completed: completed.length, panels_in_progress: techAssignments.filter(a => a.status === 'in_progress').length,
        cables_total: totalCables, cables_src_done: srcDone, cables_dst_done: dstDone, kpi,
        wiring_hours: Math.round(totalWiringSeconds / 3600 * 10) / 10,
        qc_pass_count: qcInspections.filter(i => i.overall_result === 'PASS').length,
        qc_fail_count: qcInspections.filter(i => i.overall_result === 'FAIL').length,
        qc_inspections: qcInspections.length, current_project: current?.project_code || null, last_login: t.last_login,
      };
    }).sort((a, b) => b.kpi - a.kpi);
  }

  async activity(limit = 100) {
    const [sessions, audits] = await Promise.all([
      this.prisma.session_log.findMany({ include: { users: { select: { full_name: true, role: true } } }, orderBy: { created_at: 'desc' }, take: limit }),
      this.prisma.tech_audit_log.findMany({ orderBy: { created_at: 'desc' }, take: limit }),
    ]);

    const sessionItems = sessions.map(s => ({
      id: `s-${s.id}`, type: 'session' as const,
      user_name: s.users?.full_name || `User #${s.user_id}`,
      role: s.login_role, project_code: s.project_code || '—', action: s.action,
      details: `${s.action.replace('_', ' ')} from ${s.ip_address}`,
      created_at: s.created_at?.toISOString() || '',
    }));
    const auditItems = audits.map(a => ({
      id: `a-${a.id}`, type: 'audit' as const,
      user_name: a.technician_name || '', role: 'wiring_technician',
      project_code: a.project_code || '', action: a.action,
      details: `${a.panel_name}: ${a.details}`,
      created_at: a.created_at?.toISOString() || '',
    }));
    return [...sessionItems, ...auditItems].sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, limit);
  }

  async projectsSummary(redactPersonnel = false) {
    const cacheKey = `director:projectsSummary:${redactPersonnel}`;
    const cached = await this.cacheService?.getAsync<any>(cacheKey);
    if (cached) return cached;

    const [projects, assignments, submitAudits] = await Promise.all([
      this.prisma.projects.findMany({ where: { is_active: true }, orderBy: { code: 'asc' } }),
      this.prisma.tech_assignments.findMany({
        select: {
          id: true,
          project_code: true,
          frame_id: true,
          panel_name: true,
        },
      }),
      this.prisma.tech_audit_log.findMany({
        where: { action: 'submitted_to_director' },
        orderBy: { created_at: 'desc' },
        take: 5000,
      }),
    ]);

    const projectByCode = new Map(projects.map(p => [p.code, p]));
    const assignmentByFrame = new Map<string, (typeof assignments)[number]>();
    for (const row of assignments) {
      const key = directorSubmissionKey(row.project_code, row.frame_id);
      const prev = assignmentByFrame.get(key);
      if (!prev || row.id > prev.id) assignmentByFrame.set(key, row);
    }

    const latestSubmissionByFrame = new Map<string, typeof submitAudits[number]>();
    for (const audit of submitAudits) {
      const code = audit.project_code || '';
      const frameId = audit.frame_id || '';
      if (!code || !frameId) continue;
      const key = directorSubmissionKey(code, frameId);
      if (!latestSubmissionByFrame.has(key)) latestSubmissionByFrame.set(key, audit);
    }

    const grouped = new Map<string, Array<{
      panelName: string;
      frameId: string;
      assignmentId: number;
      submittedAt: string | null;
      submittedBy: string;
      client: string | null;
    }>>();

    for (const [key, audit] of latestSubmissionByFrame.entries()) {
      const sep = key.indexOf('::');
      if (sep < 0) continue;
      const projectCode = key.slice(0, sep);
      const frameId = key.slice(sep + 2);
      const project = projectByCode.get(projectCode);
      if (!project) continue;
      const assignment = assignmentByFrame.get(key);
      const list = grouped.get(projectCode) || [];
      list.push({
        panelName: audit.panel_name || assignment?.panel_name || frameId,
        frameId,
        assignmentId: assignment?.id ?? 0,
        submittedAt: audit.created_at?.toISOString() || null,
        submittedBy: redactPersonnel ? 'Restricted' : (audit.technician_name || 'Supervisor'),
        client: project.client,
      });
      grouped.set(projectCode, list);
    }

    const result = [...grouped.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([code, panels]) => {
        const project = projectByCode.get(code)!;
        panels.sort((a, b) => a.panelName.localeCompare(b.panelName));
        return {
          project: {
            code: project.code,
            name: project.name,
            client: project.client,
          },
          panels,
        };
      })
      .filter(entry => entry.panels.length > 0);

    this.cacheService?.set(cacheKey, result, 30_000);
    return result;
  }

  /** One shared table read per export request instead of one per section. */
  private async exportSections() {
    const core = await this.loadCore();
    return {
      stats: this.statsFrom(core),
      projects: this.projectsFrom(core),
      workforce: this.workforceFrom(core),
    };
  }

  async exportXlsx(): Promise<Buffer> {
    const { stats, projects, workforce } = await this.exportSections();
    const wb = new ExcelJS.Workbook();
    wb.creator = 'DWES Director Export';
    wb.created = new Date();

    const kpiSheet = wb.addWorksheet('KPI Summary');
    kpiSheet.addRows([
      ['DWES — Director KPI Export'],
      ['Generated', new Date().toISOString()],
      [],
      ['Metric', 'Value'],
      ['Projects Total', stats.projects_total],
      ['Projects Active', stats.projects_active],
      ['Projects Completed', stats.projects_completed],
      ['Technicians Active', stats.technicians_active],
      ['Panels Total', stats.panels_total],
      ['Panels Completed', stats.panels_completed],
      ['Panels In Progress', stats.panels_in_progress],
      ['Cables Total', stats.cables_total],
      ['Cables Src Done', stats.cables_src_done],
      ['Cables Dst Done', stats.cables_dst_done],
      ['Wiring KPI %', stats.wiring_kpi],
      ['QC Inspections', stats.qc_inspections],
      ['QC Pass Rate %', stats.qc_pass_rate],
      ['Composite KPI %', stats.composite_kpi],
      ['Total Wiring Hours', stats.total_wiring_hours],
    ]);

    const projSheet = wb.addWorksheet('Projects');
    const projRows = [
      ['Code', 'Name', 'State', 'Client', 'Frames', 'Panels', 'Completed', 'Cables', 'Src Done', 'Dst Done', 'KPI %', 'Active Techs', 'Wiring Hrs', 'QC Pass %'],
      ...projects.map(p => [p.code, p.name, p.project_state, p.client, p.frames_total, p.panels_total, p.panels_completed, p.cables_total, p.cables_src_done, p.cables_dst_done, p.kpi, p.active_technicians, p.wiring_hours, p.qc_pass_rate ?? '—']),
    ];
    projSheet.addRows(projRows);

    const wfSheet = wb.addWorksheet('Workforce');
    const wfRows = [
      ['Name', 'Employee ID', 'Status', 'Panels', 'Completed', 'Cables', 'Src Done', 'Dst Done', 'KPI %', 'Wiring Hrs', 'QC Passes', 'QC Fails'],
      ...workforce.map(w => [w.full_name, w.employee_id, w.is_active ? 'Active' : 'Inactive', w.panels_total, w.panels_completed, w.cables_total, w.cables_src_done, w.cables_dst_done, w.kpi, w.wiring_hours, w.qc_pass_count, w.qc_fail_count]),
    ];
    wfSheet.addRows(wfRows);

    return Buffer.from(await wb.xlsx.writeBuffer());
  }

  async exportCsv(): Promise<string> {
    const { stats, projects, workforce } = await this.exportSections();
    const lines = [
      'DWES Director Export', `Generated,${new Date().toISOString()}`, '',
      '== KPI SUMMARY ==', 'Metric,Value',
      `Composite KPI %,${stats.composite_kpi}`, `Wiring KPI %,${stats.wiring_kpi}`,
      `QC Pass Rate %,${stats.qc_pass_rate}`, `Projects Total,${stats.projects_total}`,
      `Panels Completed,${stats.panels_completed}`, `Cables Total,${stats.cables_total}`,
      '', '== PROJECTS ==', 'Code,Name,State,Panels,Completed,KPI %',
      ...projects.map(p => `${p.code},"${p.name}",${p.project_state},${p.panels_total},${p.panels_completed},${p.kpi}`),
      '', '== WORKFORCE ==', 'Name,Employee ID,Panels,Completed,KPI %,Wiring Hrs',
      ...workforce.map(w => `"${w.full_name}",${w.employee_id},${w.panels_total},${w.panels_completed},${w.kpi},${w.wiring_hours}`),
    ];
    return lines.join('\n');
  }

  async exportPdf(): Promise<Buffer> {
    const { stats, projects, workforce } = await this.exportSections();
    return new Promise<Buffer>((resolve, reject) => {
      const generatedAt = new Date();
      const doc = new PDFDocument({ size: 'A4', margin: 0, bufferPages: true, info: { Title: 'DWES Director Report', Author: 'DWES System' } });
      const chunks: Buffer[] = [];
      doc.on('data', (chunk: Buffer) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      const B = pageBox(doc, { marginLeft: 42, marginRight: 42, marginTop: 28, marginBottom: 30 });
      const bodyBottom = doc.page.height - 52;

      let y = drawEnterpriseHeader(doc, {
        title: 'Director Engineering Performance Report',
        subtitle: 'Portfolio KPI, project execution and workforce performance summary',
        docRef: `DWES-DR-${generatedAt.toISOString().slice(0, 10).replace(/-/g, '')}`,
        left: B.left,
        right: B.right,
        top: B.top,
      });

      const section = (title: string) => {
        doc.font('Helvetica-Bold').fontSize(12).fillColor('#0f2557').text(title, B.left, y, { lineBreak: false });
        y += 16;
      };

      const ensureSpace = (need: number) => {
        if (y + need <= bodyBottom) return;
        doc.addPage();
        y = drawEnterpriseHeader(doc, {
          title: 'Director Engineering Performance Report',
          subtitle: 'Portfolio KPI, project execution and workforce performance summary',
          docRef: `DWES-DR-${generatedAt.toISOString().slice(0, 10).replace(/-/g, '')}`,
          left: B.left,
          right: B.right,
          top: B.top,
        });
      };

      // KPI summary blocks
      section('Executive Summary');
      const summary = [
        ['Composite KPI', `${stats.composite_kpi}%`],
        ['Wiring KPI', `${stats.wiring_kpi}%`],
        ['QC Pass Rate', `${stats.qc_pass_rate}%`],
        ['Projects Active', String(stats.projects_active)],
        ['Panels Completed', String(stats.panels_completed)],
        ['Total Wiring Hours', `${stats.total_wiring_hours} h`],
      ];
      const gap = 10;
      const cardW = (B.width - gap * 2) / 3;
      const cardH = 56;
      summary.forEach(([label, value], i) => {
        const row = Math.floor(i / 3);
        const col = i % 3;
        const x = B.left + col * (cardW + gap);
        const cy = y + row * (cardH + 8);
        doc.roundedRect(x, cy, cardW, cardH, 6).fillAndStroke('#f8fafc', '#e2e8f0');
        doc.font('Helvetica').fontSize(8).fillColor('#64748b').text(label, x + 8, cy + 8, { lineBreak: false, width: cardW - 16, ellipsis: true });
        doc.font('Helvetica-Bold').fontSize(16).fillColor('#1d4ed8').text(value, x + 8, cy + 24, { lineBreak: false, width: cardW - 16, ellipsis: true });
      });
      y += cardH * 2 + 16;

      const drawTable = (
        title: string,
        headers: string[],
        widths: number[],
        rows: string[][],
      ) => {
        ensureSpace(28);
        section(title);

        const headerH = 18;
        const rowH = 16;
        let x = B.left;
        doc.rect(B.left, y, B.width, headerH).fill('#1a3a5c');
        headers.forEach((h, i) => {
          doc.font('Helvetica-Bold').fontSize(8).fillColor('#ffffff')
            .text(h, x + 4, y + 5, { width: widths[i] - 8, lineBreak: false, ellipsis: true });
          x += widths[i];
        });
        y += headerH;

        rows.forEach((row, idx) => {
          ensureSpace(rowH + 2 + 30);
          if (idx % 2 === 0) {
            doc.rect(B.left, y, B.width, rowH).fill('#f8fafc');
          }
          let cx = B.left;
          row.forEach((cell, ci) => {
            doc.rect(cx, y, widths[ci], rowH).stroke('#e2e8f0');
            doc.font('Helvetica').fontSize(8).fillColor('#0f172a')
              .text(cell, cx + 4, y + 4, { width: widths[ci] - 8, lineBreak: false, ellipsis: true });
            cx += widths[ci];
          });
          y += rowH;
        });
        y += 12;
      };

      const projectWidths = [156, 94, 70, 58, 52, 60, 47];
      const projectRows = projects.slice(0, 28).map(p => [
        String(p.name || '').slice(0, 32),
        String(p.code || '').slice(0, 18),
        String(p.project_state || '').replace(/_/g, ' '),
        String(p.panels_total || 0),
        String(p.panels_completed || 0),
        String(p.cables_total || 0),
        `${p.kpi || 0}%`,
      ]);
      drawTable('Project Execution Register', ['Project', 'Code', 'State', 'Panels', 'Done', 'Cables', 'KPI'], projectWidths, projectRows);

      const workforceWidths = [170, 82, 52, 52, 58, 56, 67];
      const workforceRows = workforce.slice(0, 28).map(w => [
        String(w.full_name || '').slice(0, 30),
        String(w.employee_id || ''),
        String(w.panels_total || 0),
        String(w.panels_completed || 0),
        String(w.cables_total || 0),
        `${w.wiring_hours || 0}h`,
        `${w.kpi || 0}%`,
      ]);
      drawTable('Workforce Performance Register', ['Technician', 'Emp ID', 'Panels', 'Done', 'Cables', 'Hours', 'KPI'], workforceWidths, workforceRows);

      const range = doc.bufferedPageRange();
      for (let i = range.start; i < range.start + range.count; i++) {
        doc.switchToPage(i);
        drawEnterpriseFooter(doc, {
          pageNumber: i - range.start + 1,
          totalPages: range.count,
          generatedAt,
          left: B.left,
          right: B.right,
        });
      }

      doc.end();
    });
  }
}
