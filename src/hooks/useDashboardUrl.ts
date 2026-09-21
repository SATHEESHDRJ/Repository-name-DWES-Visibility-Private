import { useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';

/**
 * URL-addressable dashboard section (`?tab=`).
 * Pushes history so browser back/forward restores the prior tab.
 */
export function useDashboardTab(tabKeys: readonly string[], defaultTab: string) {
  const [params, setParams] = useSearchParams();
  const raw = params.get('tab') || '';
  const tab = tabKeys.includes(raw) ? raw : defaultTab;

  const setTab = useCallback((next: string) => {
    const safe = tabKeys.includes(next) ? next : defaultTab;
    setParams(prev => {
      const nextParams = new URLSearchParams(prev);
      nextParams.set('tab', safe);
      return nextParams;
    }, { replace: false });
  }, [defaultTab, setParams, tabKeys]);

  return [tab, setTab] as const;
}

/**
 * URL-addressable project + panel (`?project=&panel=`).
 * Used by Supervisor (and similar) so deep links and back/forward keep context.
 */
export function useDashboardProjectPanel() {
  const [params, setParams] = useSearchParams();
  const project = params.get('project') || '';
  const panel = params.get('panel') || '';

  const setProjectPanel = useCallback((projectCode: string, panelId: string, replace = false) => {
    setParams(prev => {
      const nextParams = new URLSearchParams(prev);
      const nextProject = (projectCode || '').trim();
      const nextPanel = (panelId || '').trim();
      if (nextProject) nextParams.set('project', nextProject);
      else nextParams.delete('project');
      if (nextPanel) nextParams.set('panel', nextPanel);
      else nextParams.delete('panel');
      return nextParams;
    }, { replace });
  }, [setParams]);

  return { project, panel, setProjectPanel };
}

/**
 * Technician view mode (`?view=panels|tablet|full`).
 */
export function useTechnicianViewParam(defaultView: 'panels' | 'tablet' | 'full' = 'panels') {
  const keys = ['panels', 'tablet', 'full'] as const;
  const [params, setParams] = useSearchParams();
  const raw = params.get('view') || '';
  const view = (keys as readonly string[]).includes(raw)
    ? (raw as typeof keys[number])
    : defaultView;

  const setView = useCallback((next: typeof keys[number]) => {
    setParams(prev => {
      const nextParams = new URLSearchParams(prev);
      nextParams.set('view', next);
      return nextParams;
    }, { replace: false });
  }, [setParams]);

  return [view, setView] as const;
}
