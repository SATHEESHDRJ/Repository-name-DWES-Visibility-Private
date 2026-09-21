/**
 * Per-project selected-panel memory for the Production Supervisor Status workspace.
 *
 * The Status workspace remounts when the dashboard switches tabs (DashboardShell
 * keys its content by the active tab), so the selected panel must live outside the
 * component tree to survive navigation. These helpers are the pure, framework-free
 * core of that behavior — they hold only panel ids keyed by project code (never any
 * sensitive data) and are unit-tested directly.
 *
 * Rules enforced here:
 *  - A remembered panel is honored only when it still exists / is still authorized
 *    for that project (the available list is the authoritative, access-filtered set).
 *  - Otherwise the first available panel is chosen; an empty project selects nothing.
 *  - Selections are always scoped by project code — a panel from one project is
 *    never applied to another.
 */

export type SelectedPanelByProject = Record<string, string>;

/**
 * Resolve which panel should be active for a project.
 *
 * @param storedPanelId  the panel the user last chose for this project (if any)
 * @param availablePanelIds  panels currently available/authorized for the project,
 *   in display order — this is the source of truth for existence and access
 * @returns the stored panel when it is still valid, else the first available panel,
 *   else '' for an empty project
 */
export function resolveSelectedPanelId(
  storedPanelId: string | null | undefined,
  availablePanelIds: readonly string[],
): string {
  if (storedPanelId && availablePanelIds.includes(storedPanelId)) {
    return storedPanelId;
  }
  return availablePanelIds[0] ?? '';
}

/**
 * Remember (or clear) the selected panel for a project without mutating the input.
 * An empty panel id removes the entry so a project is never left pointing at ''.
 */
export function rememberSelectedPanel(
  map: SelectedPanelByProject,
  projectCode: string,
  panelId: string,
): SelectedPanelByProject {
  if (!projectCode) return map;
  const next: SelectedPanelByProject = { ...map };
  if (panelId) next[projectCode] = panelId;
  else delete next[projectCode];
  return next;
}

/**
 * Drop remembered panels for projects that are no longer present/authorized, so the
 * map cannot grow stale entries for deleted or inaccessible projects.
 */
export function pruneSelectedPanels(
  map: SelectedPanelByProject,
  validProjectCodes: readonly string[],
): SelectedPanelByProject {
  const valid = new Set(validProjectCodes);
  const next: SelectedPanelByProject = {};
  for (const code of Object.keys(map)) {
    if (valid.has(code)) next[code] = map[code];
  }
  return next;
}
