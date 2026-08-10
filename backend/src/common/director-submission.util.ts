import { parseCableStatus, cableStatusCounts, type CableStatusEntry } from './cable-status.util';

export type DirectorSubmissionMeta = {
  submittedAt: Date;
  submittedBy: string;
  assignmentId: number;
};

export function directorSubmissionKey(projectCode: string, frameId: string): string {
  return `${projectCode}::${frameId}`;
}

export function countOpenEnds(cableStatusRaw: string | Record<string, CableStatusEntry> | null | undefined): {
  openEndSource: number;
  openEndDestination: number;
} {
  const cs = parseCableStatus(cableStatusRaw);
  let openEndSource = 0;
  let openEndDestination = 0;
  for (const st of Object.values(cs)) {
    const note = st.note || '';
    const hasSrc = st.openEnd === 'source' || st.openEnd === 'both' || /\[SOURCE END OPEN /.test(note);
    const hasDst = st.openEnd === 'destination' || st.openEnd === 'both' || /\[DESTINATION END OPEN /.test(note);
    if (hasSrc) openEndSource += 1;
    if (hasDst) openEndDestination += 1;
  }
  return { openEndSource, openEndDestination };
}

export function isPanelWiringCompleteForDirector(assignment: {
  cable_status?: string | Record<string, CableStatusEntry> | null;
  cables_total?: number | null;
  status?: string | null;
  completed_at?: Date | null;
}): boolean {
  const total = assignment.cables_total ?? 0;
  if (total <= 0) return false;
  const cs = parseCableStatus(assignment.cable_status);
  const { bothDone, pending } = cableStatusCounts(cs, total);
  if (pending !== 0 || bothDone !== total) return false;
  if (assignment.status !== 'completed' && !assignment.completed_at) return false;
  return true;
}

export function buildDirectorSubmissionAuditDetails(input: {
  projectCode: string;
  frameId: string;
  panelName: string;
  assignmentId: number;
  submittedBy: string;
  submittedAt: Date;
  technicianName: string;
  cablesTotal: number;
  cablesCompleted: number;
  openEndSource: number;
  openEndDestination: number;
  reportRef: string;
}): string {
  return [
    `status=submitted`,
    `assignmentId=${input.assignmentId}`,
    `by=${input.submittedBy}`,
    `at=${input.submittedAt.toISOString()}`,
    `project=${input.projectCode}`,
    `panel=${input.panelName}`,
    `frame=${input.frameId}`,
    `technician=${input.technicianName}`,
    `total=${input.cablesTotal}`,
    `completed=${input.cablesCompleted}`,
    `openSrc=${input.openEndSource}`,
    `openDst=${input.openEndDestination}`,
    `reportRef=${input.reportRef}`,
  ].join('; ').slice(0, 500);
}
