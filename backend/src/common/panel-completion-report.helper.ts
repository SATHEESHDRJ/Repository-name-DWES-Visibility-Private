import { PrismaService } from '../prisma/prisma.service';
import { MockStore } from '../data/mock-store';
import { FrameStore } from '../frames/frame-store';
import { isPanelDeleted } from './deleted-resource.util';
import { parseCableStatus, cableStatusCounts } from './cable-status.util';
import { assignedCableKpiPercent, compositeKpiPercent } from './kpi.constants';

/** Executive reports deliberately expose only the two management states. */
export type PanelReportStatus = 'active' | 'completed';

/**
 * Which report the production process actually warrants.
 *
 * A panel still being wired — or wired but not yet signed off — produces a
 * PRODUCTION PROGRESS REPORT. Only a panel whose cables are all complete AND that
 * a supervisor has approved produces a PROJECT COMPLETION REPORT. The document
 * never claims completion the records do not support.
 */
export type PanelReportKind = 'progress' | 'completion';

export const PANEL_REPORT_TITLES: Record<PanelReportKind, string> = {
  progress: 'Production Progress Report',
  completion: 'Project Completion Report',
};

/** The single rule for report type — used by the PDF, the Excel export, and the UI. */
export function resolvePanelReportKind(input: {
  cablesTotal: number;
  cablesCompleted: number;
  approved: boolean;
}): PanelReportKind {
  const fullyWired = input.cablesTotal > 0 && input.cablesCompleted >= input.cablesTotal;
  return fullyWired && input.approved ? 'completion' : 'progress';
}

export interface PanelCompletionReportData {
  project: {
    code: string;
    name: string;
    client: string | null;
    createdAt: Date | null;
    projectState: string | null;
    locationRegion: string | null;
    monthYear: string | null;
  };
  panel: {
    id: string;
    name: string;
    panelType: string | null;
    voltageLevel: string | null;
  };
  reportStatus: PanelReportStatus;
  reportStatusLabel: string;
  /** Progress vs Completion — driven by the real production state, not the caller. */
  reportKind: PanelReportKind;
  reportTitle: string;
  technicians: { fullName: string; username: string }[];
  technician: { fullName: string; username: string } | null;
  midChangeTechnician: { fullName: string; username: string } | null;
  supervisor: { fullName: string } | null;
  assignedBy: { fullName: string } | null;
  cables: {
    total: number;
    completed: number;
    remaining: number;
    openEnd: number;
    openEndSource: number;
    openEndDestination: number;
    srcDone: number;
    dstDone: number;
  };
  wiring: {
    startedAt: Date | null;
    completedAt: Date | null;
    durationSeconds: number;
    durationHuman: string;
  };
  sessionLog: { loginAt: Date; logoutAt: Date | null }[];
  totalWorkingHours: string;
  completionPercent: number;
  kpi: number;
  compositeKpi: number;
  projectDurationDays: number;
  rework: { count: number; status: string; reason: string };
  approval: {
    approved: boolean;
    approvedAt: Date | null;
    approvedBy: { fullName: string } | null;
    reviewStatus: string | null;
  };
  technicianRemarks: string[];
  supervisorRemarks: string;
  generatedBy: string;
  generatedAt: Date;
}

function formatDuration(sec: number): string {
  const s = Math.max(0, Math.floor(sec || 0));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function formatWorkingHours(sec: number): string {
  const s = Math.max(0, Math.floor(sec || 0));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return `${h}h ${m}m`;
}

function daysBetween(start: Date | null | undefined, end: Date): number {
  if (!start) return 0;
  const ms = end.getTime() - new Date(start).getTime();
  return Math.max(0, Math.ceil(ms / (1000 * 60 * 60 * 24)));
}

function decodeProjectMeta(description: string | null | undefined): { locationRegion: string; monthYear: string } | null {
  const raw = (description || '').trim();
  if (!raw.startsWith('@dwes-meta:')) return null;
  try {
    const meta = JSON.parse(raw.slice('@dwes-meta:'.length)) as { locationRegion?: string; monthYear?: string };
    if (meta?.locationRegion) {
      return { locationRegion: meta.locationRegion, monthYear: meta.monthYear || '' };
    }
  } catch { /* ignore */ }
  return null;
}

export function resolvePanelReportStatus(
  assignment: {
    status?: string | null;
    started_at?: Date | null;
    paused_at?: Date | null;
    review_status?: string | null;
  } | null | undefined,
): { status: PanelReportStatus; label: string } {
  const raw = (assignment?.status || '').toLowerCase();
  if (raw === 'completed') {
    return { status: 'completed', label: 'Completed' };
  }
  return { status: 'active', label: 'Active' };
}

export async function collectPanelCompletionReportData(
  prisma: PrismaService,
  projectCode: string,
  frameId: string,
  generatedBy: string,
): Promise<PanelCompletionReportData> {
  // These three reads are independent of each other; run them together and
  // keep the original error precedence by checking the results in order.
  const [project, panelDeleted, assignments] = await Promise.all([
    prisma.projects.findFirst({ where: { code: projectCode, is_active: true } }),
    isPanelDeleted(prisma, projectCode, frameId),
    prisma.tech_assignments.findMany({
      where: { project_code: projectCode, frame_id: frameId },
      orderBy: { assigned_at: 'asc' },
    }),
  ]);
  if (!project) throw new Error(`Project ${projectCode} not found`);

  if (panelDeleted) {
    FrameStore.blockPanel(projectCode, frameId);
    throw new Error(`Frame ${frameId} not found`);
  }

  const frame = MockStore.findFrameByProjectAndId(projectCode, frameId)
    ?? FrameStore.getFrameFromDisk(projectCode, frameId);
  if (!frame) throw new Error(`Frame ${frameId} not found`);
  const assignment = assignments.length
    ? assignments[assignments.length - 1]
    : null;

  const userIds = new Set<number>();
  if (assignment?.technician_id) userIds.add(assignment.technician_id);
  if (assignment?.assigned_by) userIds.add(assignment.assigned_by);
  if (assignment?.handover_from_id) userIds.add(assignment.handover_from_id);
  if (assignment?.approved_by) userIds.add(assignment.approved_by);
  if (assignment?.reviewed_by) userIds.add(assignment.reviewed_by);
  for (const a of assignments) {
    if (a.technician_id) userIds.add(a.technician_id);
    if (a.assigned_by) userIds.add(a.assigned_by);
  }

  // The user, inspection and rework-audit lookups only depend on the
  // assignment rows fetched above — batch them into one round trip.
  const [users, assignmentInspections, reworkAudits] = await Promise.all([
    userIds.size
      ? prisma.users.findMany({ where: { id: { in: [...userIds] } } })
      : Promise.resolve([]),
    assignment
      ? prisma.panel_inspections.findMany({ where: { assignment_id: assignment.id } })
      : Promise.resolve([]),
    assignment
      ? prisma.tech_audit_log.findMany({
          where: {
            project_code: projectCode,
            frame_id: frameId,
            action: { in: ['rework', 'mid_changeover', 'changeover_locked'] },
          },
          orderBy: { created_at: 'asc' },
        })
      : Promise.resolve([]),
  ]);
  const userMap = new Map(users.map(u => [u.id, u]));

  const tech = assignment ? userMap.get(assignment.technician_id) : null;
  const assignedBy = assignment?.assigned_by ? userMap.get(assignment.assigned_by) : null;
  const approvedByUser = assignment?.approved_by ? userMap.get(assignment.approved_by) : null;

  let midChangeTechnician: { fullName: string; username: string } | null = null;
  if (assignments.length > 1) {
    const prev = assignments[assignments.length - 2];
    const prevTech = userMap.get(prev.technician_id);
    if (prevTech && prev.technician_id !== assignment?.technician_id) {
      midChangeTechnician = {
        fullName: prevTech.full_name || prevTech.username || '',
        username: prevTech.username || '',
      };
    }
  } else if (assignment?.handover_from_id) {
    const prevTech = userMap.get(assignment.handover_from_id);
    if (prevTech) {
      midChangeTechnician = {
        fullName: prevTech.full_name || prevTech.username || '',
        username: prevTech.username || '',
      };
    }
  }

  const supervisorUser = assignedBy?.role === 'prod_supervisor'
    ? assignedBy
    : users.find(u => u.role === 'prod_supervisor') || assignedBy;

  const frameCables = Array.isArray(frame.cables) ? frame.cables : [];
  const cableStatus = parseCableStatus(assignment?.cable_status);
  const counts = cableStatusCounts(cableStatus, frameCables.length || assignment?.cables_total || 0);
  const total = assignment?.cables_total || frameCables.length || 0;
  const srcDone = assignment?.cables_src_done ?? counts.srcDone;
  const dstDone = assignment?.cables_dst_done ?? counts.dstDone;
  const completed = counts.bothDone;
  const remaining = Math.max(0, total - completed);

  let openEndSource = 0;
  let openEndDestination = 0;
  for (const st of Object.values(cableStatus)) {
    if (st.src && !st.dst) openEndSource++;
    if (!st.src && st.dst) openEndDestination++;
  }
  const openEnd = openEndSource + openEndDestination;

  const wiringSeconds = assignment?.total_wiring_seconds || 0;
  // Canonical DWES panel KPI: completed assigned cables / total assigned cables.
  // A cable is complete only when both its source and destination are complete.
  const kpi = assignedCableKpiPercent(completed, total);
  let qcPassRate = 0;
  if (assignmentInspections.length) {
    qcPassRate = Math.round(
      (assignmentInspections.filter(i => i.overall_result === 'PASS').length / assignmentInspections.length) * 100,
    );
  }
  const compositeKpi = compositeKpiPercent(kpi, qcPassRate);
  const completionPercent = kpi;

  const sessionRows = tech
    ? await prisma.session_log.findMany({
        where: { user_id: tech.id, project_code: projectCode },
        orderBy: { created_at: 'asc' },
      })
    : [];

  const sessionLog: { loginAt: Date; logoutAt: Date | null }[] = [];
  let pendingLogin: Date | null = null;
  for (const row of sessionRows) {
    if (row.action === 'login' && row.created_at) {
      pendingLogin = row.created_at;
    } else if (row.action === 'logout' && pendingLogin) {
      sessionLog.push({ loginAt: pendingLogin, logoutAt: row.created_at });
      pendingLogin = null;
    }
  }
  if (pendingLogin) {
    sessionLog.push({ loginAt: pendingLogin, logoutAt: null });
  }

  const technicianNotes = Object.entries(cableStatus)
    .filter(([, st]) => (st.note || '').trim().length > 0)
    .map(([, st]) => st.note!.trim());

  const isCompleted = total > 0 && completed >= total;
  const status: PanelReportStatus = isCompleted ? 'completed' : 'active';
  const label = status === 'completed' ? 'Completed' : 'Active';
  // `supervisor_approved` defaults to true in the schema, so `approved_at` is the
  // only reliable signal that a supervisor explicitly signed the panel off.
  const isApproved = !!assignment?.approved_at;
  const reportKind = resolvePanelReportKind({
    cablesTotal: total,
    cablesCompleted: completed,
    approved: isApproved,
  });
  const generatedAt = new Date();
  const anchorStart = assignment?.assigned_at || project.created_at;
  const meta = decodeProjectMeta(project.description);

  return {
    project: {
      code: project.code,
      name: project.name || project.code,
      client: project.client,
      createdAt: project.created_at,
      projectState: project.project_state,
      locationRegion: meta?.locationRegion || null,
      monthYear: meta?.monthYear || null,
    },
    panel: {
      id: frame.id,
      name: frame.panel_name || frameId,
      panelType: frame.panel_type || null,
      voltageLevel: frame.voltage_level || null,
    },
    reportStatus: status,
    reportStatusLabel: label,
    reportKind,
    reportTitle: PANEL_REPORT_TITLES[reportKind],
    technicians: [...new Map(assignments.map(a => {
      const u = userMap.get(a.technician_id);
      return [a.technician_id, u
        ? { fullName: u.full_name || u.username || '', username: u.username || '' }
        : { fullName: `Technician #${a.technician_id}`, username: '' }];
    })).values()],
    technician: tech
      ? { fullName: tech.full_name || tech.username || '', username: tech.username || '' }
      : null,
    midChangeTechnician,
    supervisor: supervisorUser
      ? { fullName: supervisorUser.full_name || supervisorUser.username || '' }
      : null,
    assignedBy: assignedBy
      ? { fullName: assignedBy.full_name || assignedBy.username || '' }
      : null,
    cables: {
      total,
      completed,
      remaining,
      openEnd,
      openEndSource,
      openEndDestination,
      srcDone,
      dstDone,
    },
    wiring: {
      startedAt: assignment?.started_at || null,
      completedAt: assignment?.completed_at || null,
      durationSeconds: wiringSeconds,
      durationHuman: formatDuration(wiringSeconds),
    },
    sessionLog,
    totalWorkingHours: formatWorkingHours(wiringSeconds),
    completionPercent,
    kpi,
    compositeKpi,
    projectDurationDays: daysBetween(anchorStart, assignment?.completed_at || generatedAt),
    rework: {
      count: reworkAudits.filter(a => a.action === 'rework').length
        + (assignment?.rework_requested ? 1 : 0),
      status: assignment?.rework_requested
        ? 'Rework requested'
        : reworkAudits.length
          ? 'Rework recorded'
          : 'None',
      reason: assignment?.rework_reason || '',
    },
    approval: {
      // `supervisor_approved` defaults to true in the schema, so `approved_at`
      // is the reliable signal that a supervisor explicitly signed off.
      approved: !!assignment?.approved_at,
      approvedAt: assignment?.approved_at || null,
      approvedBy: approvedByUser
        ? { fullName: approvedByUser.full_name || approvedByUser.username || '' }
        : null,
      reviewStatus: assignment?.review_status || null,
    },
    technicianRemarks: technicianNotes,
    supervisorRemarks: assignment?.review_notes || '',
    generatedBy: generatedBy || 'Production Supervisor',
    generatedAt,
  };
}

/** JSON-safe payload for on-screen completion report preview. */
export function serializePanelCompletionReportForApi(data: PanelCompletionReportData) {
  return {
    ...data,
    project: {
      ...data.project,
      createdAt: data.project.createdAt?.toISOString() ?? null,
    },
    wiring: {
      ...data.wiring,
      startedAt: data.wiring.startedAt?.toISOString() ?? null,
      completedAt: data.wiring.completedAt?.toISOString() ?? null,
    },
    sessionLog: data.sessionLog.map(s => ({
      loginAt: s.loginAt.toISOString(),
      logoutAt: s.logoutAt?.toISOString() ?? null,
    })),
    approval: {
      ...data.approval,
      approvedAt: data.approval.approvedAt?.toISOString() ?? null,
    },
    generatedAt: data.generatedAt.toISOString(),
  };
}
