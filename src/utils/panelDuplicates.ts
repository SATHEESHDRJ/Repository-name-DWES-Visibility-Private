import { compactPanelDisplayName } from './projectDisplay';

/** Normalize panel names for duplicate comparison (case-insensitive, trimmed). */
export function normalizePanelName(name: string): string {
  return name.trim().toUpperCase();
}

/** Compact panel key for dropdown dedupe and cross-format duplicate checks. */
export function compactPanelKey(name: string): string {
  return normalizePanelName(compactPanelDisplayName(name));
}

type PanelListEntry = { id: string; panel_name: string; cable_count?: number };

export type PanelDuplicateEntry = {
  id: string;
  panel_name: string;
  cable_count?: number;
  original_filename?: string | null;
};

/** Last segment of internal panel id for compact UI labels. */
export function shortPanelId(panelId: string): string {
  const trimmed = panelId.trim();
  if (!trimmed) return 'unknown';
  const parts = trimmed.split('_').filter(Boolean);
  return parts.length > 1 ? parts[parts.length - 1]! : trimmed.slice(-8);
}

/** Human-readable schedule state for duplicate resolver buttons. */
export function panelScheduleHint(panel: Pick<PanelDuplicateEntry, 'cable_count' | 'original_filename'>): string {
  const cables = panel.cable_count ?? 0;
  if (cables > 0) return `${cables} cable${cables === 1 ? '' : 's'}`;
  if (panel.original_filename?.trim()) return 'schedule file';
  return 'no schedule';
}

/** Distinguishable rename label — tag + short id + schedule hint. */
export function duplicatePanelRenameLabel(panel: PanelDuplicateEntry): string {
  const tag = compactPanelDisplayName(panel.panel_name).trim() || panel.panel_name.trim();
  return `Rename ${tag} (id ${shortPanelId(panel.id)}, ${panelScheduleHint(panel)})`;
}

/** Option label for picking which duplicate panel is active. */
export function duplicatePanelSelectLabel(panel: PanelDuplicateEntry): string {
  const tag = compactPanelDisplayName(panel.panel_name).trim() || panel.panel_name.trim();
  return `${tag} · id ${shortPanelId(panel.id)} · ${panelScheduleHint(panel)}`;
}

/** Dedupe panel rows by internal id (guards against duplicate API rows). */
export function uniquePanelsById<T extends { id?: string }>(panels: T[]): T[] {
  const seen = new Map<string, T>();
  for (const panel of panels) {
    const id = panel.id?.trim();
    if (!id || seen.has(id)) continue;
    seen.set(id, panel);
  }
  return [...seen.values()];
}

/**
 * One entry per compact panel name for project-scoped dropdowns.
 * Prefers frames with wiring data, then the shortest stored panel_name.
 */
export function buildProjectPanelSelectList<T extends PanelListEntry>(panels: T[]): T[] {
  const byCompact = new Map<string, T>();
  for (const panel of panels) {
    const key = compactPanelKey(panel.panel_name);
    if (!key) continue;
    const existing = byCompact.get(key);
    if (!existing) {
      byCompact.set(key, panel);
      continue;
    }
    const panelCables = panel.cable_count ?? 0;
    const existingCables = existing.cable_count ?? 0;
    const preferPanel =
      panelCables > existingCables
      || (panelCables === existingCables && panel.panel_name.length < existing.panel_name.length);
    if (preferPanel) byCompact.set(key, panel);
  }
  return [...byCompact.values()].sort((a, b) =>
    compactPanelDisplayName(a.panel_name).localeCompare(
      compactPanelDisplayName(b.panel_name),
      undefined,
      { numeric: true, sensitivity: 'base' },
    ),
  );
}

/** Returns compact keys that appear on more than one panel in the list. */
export function getDuplicatePanelNameKeys(panels: { panel_name: string }[]): Set<string> {
  const counts = new Map<string, number>();
  for (const panel of panels) {
    const key = compactPanelKey(panel.panel_name);
    if (!key) continue;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return new Set(
    [...counts.entries()].filter(([, count]) => count > 1).map(([key]) => key),
  );
}

export function isPanelNameDuplicate(
  panelName: string,
  panels: { panel_name: string }[],
): boolean {
  if (!panelName.trim()) return false;
  return getDuplicatePanelNameKeys(panels).has(compactPanelKey(panelName));
}

export function panelsWithDuplicateNames<T extends { id?: string; panel_name: string }>(
  panels: T[],
): T[] {
  const unique = uniquePanelsById(panels);
  const dupKeys = getDuplicatePanelNameKeys(unique);
  return unique
    .filter(p => dupKeys.has(compactPanelKey(p.panel_name)))
    .sort((a, b) => {
      const tagCmp = compactPanelDisplayName(a.panel_name).localeCompare(
        compactPanelDisplayName(b.panel_name),
        undefined,
        { numeric: true, sensitivity: 'base' },
      );
      if (tagCmp !== 0) return tagCmp;
      return (a.id ?? '').localeCompare(b.id ?? '');
    });
}

/** Confirmation copy when uploading/replacing against a non-unique panel tag. */
export function duplicatePanelUploadConfirm(
  panelName: string,
  panelId?: string,
): { title: string; message: string; confirmText: string } {
  const tag = compactPanelDisplayName(panelName).trim();
  const idHint = panelId ? ` Panel ID: ${panelId}.` : '';
  return {
    title: 'Duplicate panel name — confirm target',
    message:
      `This project has multiple panels named "${tag}". Upload, view, and replace bind to the panel's internal ID, not the display tag alone.${idHint} Continue with this panel?`,
    confirmText: 'Yes, this panel',
  };
}

/** Standard block message when panel-scoped actions must not proceed. */
export function duplicatePanelBlockMessage(panelDisplayName: string): string {
  const tag = compactPanelDisplayName(panelDisplayName).trim() || panelDisplayName.trim();
  return (
    `Duplicate Panel Name Detected — a panel named '${tag}' already exists. ` +
    'Each panel name must be unique so Wiring Schedule, Drawings, Reports, and Technician Assignments link to the correct panel. ' +
    'Please rename the duplicate panel or select the existing panel before continuing.'
  );
}

export interface PanelDuplicateGuardResult {
  blocked: boolean;
  duplicateKeys: Set<string>;
  message: string;
  selectedPanelBlocked: boolean;
}

/** Shared project-level duplicate check for UI gating. */
export function assertNoDuplicatePanels(
  panels: { id?: string; panel_name: string }[],
  selectedPanelId?: string,
  selectedPanelName?: string,
): PanelDuplicateGuardResult {
  const unique = uniquePanelsById(panels);
  const duplicateKeys = getDuplicatePanelNameKeys(unique);
  const selected = selectedPanelId
    ? unique.find(p => p.id === selectedPanelId)
    : undefined;
  const panelName = selected?.panel_name ?? selectedPanelName ?? '';
  const selectedPanelBlocked = panelName ? isPanelNameDuplicate(panelName, unique) : false;
  return {
    blocked: selectedPanelBlocked,
    duplicateKeys,
    message: selectedPanelBlocked ? duplicatePanelBlockMessage(panelName) : '',
    selectedPanelBlocked,
  };
}
