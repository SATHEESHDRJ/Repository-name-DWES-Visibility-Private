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
  // Parallel lookups for tech user + project + project-wide rollup + pause audit trail
  const [tech, project, allProjectAssignments, pauseAudit] = await Promise.all([
    prisma.users.findUnique({ where: { id: a.technician_id } }),
    prisma.projects.findUnique({ where: { code: a.project_code } }),
    prisma.tech_assignments.findMany({
      where: { project_code: a.project_code },
      select: { id: true, status: true, frame_id: true, cables_total: true, cables_src_done: true, cables_dst_done: true },
    }),
    prisma.tech_audit_log.findMany({
      where: { technician_id: a.technician_id, project_code: a.project_code, frame_id: a.frame_id, action: 'pause' },
      orderBy: { created_at: 'asc' },
      select: { details: true, created_at: true },
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

  // Project overall KPI across all assignments
  const allSrc = allProjectAssignments.reduce((s, pa) => s + (pa.cables_src_done || 0), 0);
  const allDst = allProjectAssignments.reduce((s, pa) => s + (pa.cables_dst_done || 0), 0);
  const allTot = allProjectAssignments.reduce((s, pa) => s + (pa.cables_total || 0), 0);
  const projectKpi = allTot > 0 ? Math.round(((allSrc + allDst) / (allTot * 2)) * 100) : 0;

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
    generated_at: new Date().toISOString(),
  };
}
