import { PrismaService } from '../prisma/prisma.service';

function parseCS(raw: string | null | undefined): Record<string, { src: boolean; dst: boolean; note: string }> {
  try { return JSON.parse(raw || '{}'); } catch { return {}; }
}

function formatDuration(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

export async function buildCompletionReport(a: any, prisma: PrismaService) {
  // Parallel lookups for project rollup, panel work segments, and permanent audit history.
  const [tech, project, allProjectAssignments, pauseAudit, panelAssignments, panelAudit] = await Promise.all([
    prisma.users.findUnique({ where: { id: a.technician_id } }),
    prisma.projects.findUnique({ where: { code: a.project_code } }),
    prisma.tech_assignments.findMany({
      where: { project_code: a.project_code },
      select: {
        id: true, status: true, frame_id: true, cables_total: true,
        cables_src_done: true, cables_dst_done: true, assigned_at: true,
        changeover_locked: true,
      },
    }),
    prisma.tech_audit_log.findMany({
      where: { technician_id: a.technician_id, project_code: a.project_code, frame_id: a.frame_id, action: 'pause' },
      orderBy: { created_at: 'asc' },
      select: { details: true, created_at: true },
    }),
    prisma.tech_assignments.findMany({
      where: { project_code: a.project_code, frame_id: a.frame_id },
      orderBy: { assigned_at: 'asc' },
    }),
    prisma.tech_audit_log.findMany({
      where: { project_code: a.project_code, frame_id: a.frame_id },
      orderBy: { created_at: 'asc' },
    }),
  ]);

  // Break reason log — parsed from pause audit entries ("Paused: <reason>, time=<n>s")
  const breakLog = pauseAudit.map(entry => {
    const match = /^Paused:\s*(.*?),\s*time=\d+s$/.exec(entry.details || '');
    return {
      reason: match ? match[1] : (entry.details || 'Paused'),
      at: entry.created_at,
    };
  });

  const cs = parseCS(a.cable_status);
  const cablesBothDone = Object.values(cs).filter(s => s.src && s.dst).length;

  // Technician notes/remarks — non-empty per-cable notes from the cable_status JSON
  const technicianNotes = Object.entries(cs)
    .filter(([, s]) => (s.note || '').trim().length > 0)
    .map(([idx, s]) => ({
      cable_index: Number(idx) + 1,
      note: s.note.trim(),
      issue: Boolean((s as any).issue),
    }));
  const total = a.cables_total || 0;
  const src   = a.cables_src_done || 0;
  const dst   = a.cables_dst_done || 0;
  const kpi   = total > 0 ? Math.round(((src + dst) / (total * 2)) * 100) : 0;
  const srcPct = total > 0 ? Math.round((src / total) * 100) : 0;
  const dstPct = total > 0 ? Math.round((dst / total) * 100) : 0;

  // Unique frames in the project (by frame_id), count completed ones
  const frameMap = new Map<string, string>();
  for (const pa of allProjectAssignments) {
    // Keep "completed" status if any assignment for this frame is completed
    const existing = frameMap.get(pa.frame_id);
    if (!existing || pa.status === 'completed') {
      frameMap.set(pa.frame_id, pa.status);
    }
  }
  const totalFrames     = frameMap.size;
  const completedFrames = [...frameMap.values()].filter(s => s === 'completed').length;

  // Project KPI uses the latest continuation for each panel. Historical handover rows
  // contain cumulative snapshots and must not be added again.
  const latestByFrame = new Map<string, typeof allProjectAssignments[number]>();
  for (const assignment of allProjectAssignments) {
    const current = latestByFrame.get(assignment.frame_id);
    const currentTime = current?.assigned_at ? current.assigned_at.getTime() : 0;
    const nextTime = assignment.assigned_at ? assignment.assigned_at.getTime() : 0;
    if (!current || (!assignment.changeover_locked && current.changeover_locked) || nextTime >= currentTime) {
      latestByFrame.set(assignment.frame_id, assignment);
    }
  }
  const currentProjectAssignments = [...latestByFrame.values()];
  const allSrc = currentProjectAssignments.reduce((s, pa) => s + (pa.cables_src_done || 0), 0);
  const allDst = currentProjectAssignments.reduce((s, pa) => s + (pa.cables_dst_done || 0), 0);
  const allTot = currentProjectAssignments.reduce((s, pa) => s + (pa.cables_total || 0), 0);
  const projectKpi = allTot > 0 ? Math.round(((allSrc + allDst) / (allTot * 2)) * 100) : 0;

  const contributorIds = [...new Set(panelAssignments.map(assignment => assignment.technician_id))];
  const [contributorUsers, sessionEvents] = await Promise.all([
    contributorIds.length
      ? prisma.users.findMany({ where: { id: { in: contributorIds } } })
      : [],
    contributorIds.length
      ? prisma.session_log.findMany({
        where: { user_id: { in: contributorIds } },
        orderBy: { created_at: 'asc' },
      })
      : [],
  ]);
  const contributorUserMap = new Map(contributorUsers.map(user => [user.id, user]));
  const assignmentMap = new Map(panelAssignments.map(assignment => [assignment.id, assignment]));
  const now = Date.now();
  const contributors = panelAssignments.map(segment => {
    const baseline = segment.handover_from_id ? assignmentMap.get(segment.handover_from_id) : null;
    const before = parseCS(baseline?.cable_status);
    const after = parseCS(segment.cable_status);
    const completedCables = Object.keys(after).filter(index => (
      after[index]?.src && after[index]?.dst && !(before[index]?.src && before[index]?.dst)
    )).length;
    const startedAt = segment.started_at || segment.assigned_at;
    const endedAt = segment.paused_at || segment.completed_at || null;
    const startTime = startedAt ? startedAt.getTime() : 0;
    const endTime = endedAt ? endedAt.getTime() : now;
    const durationSeconds = segment.total_wiring_seconds && segment.total_wiring_seconds > 0
      ? segment.total_wiring_seconds
      : startTime > 0 ? Math.max(0, Math.floor((endTime - startTime) / 1000)) : 0;
    const user = contributorUserMap.get(segment.technician_id);
    const logins = sessionEvents.filter(event => {
      const eventTime = event.created_at?.getTime() || 0;
      return event.user_id === segment.technician_id
        && eventTime >= startTime
        && eventTime <= endTime;
    }).map(event => ({ action: event.action, at: event.created_at }));
    return {
      assignment_id: segment.id,
      technician_id: segment.technician_id,
      technician_name: user?.full_name || `Tech #${segment.technician_id}`,
      technician_username: user?.username || '',
      started_at: startedAt,
      ended_at: endedAt,
      duration_seconds: durationSeconds,
      duration_human: formatDuration(durationSeconds),
      cables_src_completed: Math.max(0, (segment.cables_src_done || 0) - (baseline?.cables_src_done || 0)),
      cables_dst_completed: Math.max(0, (segment.cables_dst_done || 0) - (baseline?.cables_dst_done || 0)),
      cables_completed: completedCables,
      progress_before: {
        cables_src_done: baseline?.cables_src_done || 0,
        cables_dst_done: baseline?.cables_dst_done || 0,
      },
      progress_after: {
        cables_src_done: segment.cables_src_done || 0,
        cables_dst_done: segment.cables_dst_done || 0,
      },
      login_logout_events: logins,
      handover_from_assignment_id: segment.handover_from_id,
      handover_to_assignment_id: segment.handover_to_id,
    };
  });
  const midChangeHistory = panelAudit
    .filter(entry => entry.action === 'mid_change_swap' || entry.action === 'mid_change_requested' || entry.action === 'mid_change_confirmed')
    .map(entry => ({
      action: entry.action,
      technician_id: entry.technician_id,
      technician_name: entry.technician_name || '',
      at: entry.created_at,
      details: entry.details || '',
    }));

  const { hashed_password: _hp, ...safeTech } = (tech || {}) as any;

  return {
    technician: {
      full_name:   tech?.full_name   || `Tech #${a.technician_id}`,
      username:    tech?.username    || '',
      employee_id: tech?.employee_id || '',
    },
    project: {
      code:   a.project_code,
      name:   project?.name   || a.project_code,
      client: project?.client || '--',
    },
    assignment: {
      id:                    a.id,
      panel_name:            a.panel_name,
      frame_id:              a.frame_id,
      status:                a.status,
      cables_total:          total,
      cables_src_done:       src,
      cables_dst_done:       dst,
      cables_both_done:      cablesBothDone,
      cables_pending:        Math.max(0, total - Math.max(src, dst)),
      kpi,
      src_pct:               srcPct,
      dst_pct:               dstPct,
      started_at:            a.started_at,
      completed_at:          a.completed_at,
      total_wiring_seconds:  a.total_wiring_seconds || 0,
      duration_human:        formatDuration(a.total_wiring_seconds || 0),
      review_status:         a.review_status,
      report_submitted:      a.report_submitted || false,
    },
    rollup: {
      total_frames:     totalFrames,
      completed_frames: completedFrames,
      project_kpi:      projectKpi,
    },
    break_log:        breakLog,
    technician_notes: technicianNotes,
    contributors,
    mid_change_history: midChangeHistory,
    generated_at: new Date().toISOString(),
  };
}
