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
