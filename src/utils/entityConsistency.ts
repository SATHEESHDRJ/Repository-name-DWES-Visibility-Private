export function reconcileProjectSelection<T extends { code: string }>(
  projects: readonly T[],
  selectedCode: string | null | undefined,
): T | null {
  if (selectedCode) {
    const current = projects.find(project => project.code === selectedCode);
    if (current) return current;
  }
  return projects[0] ?? null;
}

export function excludeDeletedEntity<T extends { projectCode: string; panelId?: string }>(
  records: readonly T[],
  deletion: { projectCode: string; frameId?: string },
): T[] {
  return records.filter(record => deletion.frameId
    ? !(record.projectCode === deletion.projectCode && record.panelId === deletion.frameId)
    : record.projectCode !== deletion.projectCode);
}

/** True when a project/panel deletion event targets this assignment row. */
export function assignmentMatchesDeletion(
  assignment: { project_code: string; frame_id?: string | null; id?: number },
  deletion: { projectCode: string; frameId?: string },
): boolean {
  if (assignment.project_code !== deletion.projectCode) return false;
  if (!deletion.frameId) return true;
  return assignment.frame_id === deletion.frameId
    || String(assignment.id ?? '') === deletion.frameId;
}
