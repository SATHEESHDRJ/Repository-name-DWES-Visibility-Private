import { useMemo } from 'react';
import {
  assertNoDuplicatePanels,
  type PanelDuplicateGuardResult,
} from '../utils/panelDuplicates';

export type { PanelDuplicateGuardResult };

type PanelEntry = { id?: string; panel_name: string };

/**
 * Project-scoped duplicate panel guard for toolbar and modal gating.
 * `actionGated` — panel selected and compact tag is unique (hard block on duplicates).
 * `reportGated` — same as actionGated (reports also require a unique tag).
 * When `bannerDismissed` is true, UI gates open for session testing (server guard unchanged).
 */
export function usePanelDuplicateGuard(
  panels: PanelEntry[],
  selectedPanelId?: string,
  selectedPanelName?: string,
  bannerDismissed = false,
): PanelDuplicateGuardResult & { actionGated: boolean; reportGated: boolean } {
  return useMemo(() => {
    const guard = assertNoDuplicatePanels(panels, selectedPanelId, selectedPanelName);
    const hasSelection = Boolean(selectedPanelId);
    const allowed = hasSelection && (!guard.blocked || bannerDismissed);
    return {
      ...guard,
      actionGated: allowed,
      reportGated: allowed,
    };
  }, [panels, selectedPanelId, selectedPanelName, bannerDismissed]);
}
