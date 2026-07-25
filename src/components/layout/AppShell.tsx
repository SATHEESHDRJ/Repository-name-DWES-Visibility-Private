import { type ReactNode, useCallback, useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import Topbar from './Topbar';
import Sidebar from './Sidebar';
import type { NavItem } from './Topbar';
import { useAuthStore } from '../../store/useAuthStore';
import { useProjectSelectionStore } from '../../store/useProjectSelectionStore';
import { useLiveWiringStore } from '../../store/useLiveWiringStore';
import { projectsApi, techApi } from '../../services/api';
import { onFramesChanged } from '../../utils/projectFramesEvents';
import { useLatestRequest } from '../../hooks/useLatestRequest';
import { useServerEvents } from '../../hooks/useServerEvents';
import type { ActiveProjectContext } from '../../store/useProjectSelectionStore';
import { reconcileProjectSelection } from '../../utils/entityConsistency';

interface AppShellProps {
  children: ReactNode;
  navItems?: NavItem[];
  activeTab?: string;
  onTabChange?: (key: string) => void;
  noPadding?: boolean;
  /** When true, module nav renders in sidebar instead of topbar */
  sidebarNav?: boolean;
}

export default function AppShell({
  children,
  navItems = [],
  activeTab,
  onTabChange,
  noPadding = false,
  sidebarNav = true,
}: AppShellProps) {
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const shellRef = useRef<HTMLDivElement>(null);
  const { pathname } = useLocation();
  const { user } = useAuthStore();
  const {
    selectedProject,
    ownerUserId,
    initializeForUser,
    setProjectForUser,
    clearProjectForUser,
  } = useProjectSelectionStore();
  const clearLiveWiring = useLiveWiringStore(state => state.clear);
  const [projectContextLoading, setProjectContextLoading] = useState(Boolean(user?.id));
  const [projectContextVerified, setProjectContextVerified] = useState(false);
  const { begin: beginProjectValidation, isLatest: isLatestProjectValidation } = useLatestRequest();

  // Live change stream: silently refreshes only the affected data across users.
  // This tab's own mutations already refresh locally, so only their echo is ignored.
  useServerEvents(Boolean(user?.id));

  // Keep --dash-topbar-height equal to the topbar's REAL height at all times.
  // The topbar is a sticky flex-wrap bar whose height changes with viewport
  // width and content (project pill, wrapping to 2 rows on tablet portrait), so
  // any hardcoded value is wrong at some resolution. Measuring it here makes the
  // mobile drawer offset (and any other consumer) track reality — no magic number.
  useEffect(() => {
    const shell = shellRef.current;
    if (!shell) return;
    const topbar = shell.querySelector<HTMLElement>('.topbar');
    if (!topbar || typeof ResizeObserver === 'undefined') return;
    const apply = () => shell.style.setProperty('--dash-topbar-height', `${topbar.offsetHeight}px`);
    apply();
    const ro = new ResizeObserver(apply);
    ro.observe(topbar);
    return () => ro.disconnect();
  }, []);

  const useSidebar = sidebarNav && navItems.length > 0;
  // Project context is surfaced in the header pill, not enforced by a blocking gate.
  const activeProject = projectContextVerified
    && !projectContextLoading
    && user?.id
    && selectedProject
    && ownerUserId === user.id
    ? selectedProject
    : null;

  const validateProjectContext = useCallback(async () => {
    if (!user?.id) {
      setProjectContextLoading(false);
      setProjectContextVerified(false);
      return;
    }

    const request = beginProjectValidation();
    setProjectContextLoading(true);
    setProjectContextVerified(false);
    try {
      const rows = user.role === 'wiring_technician'
        ? Array.from(
            new Map(
              ((await techApi.myPanels(request.signal)) as Array<Record<string, unknown>>)
                .map(panel => [
                  String(panel.project_code),
                  {
                    code: String(panel.project_code),
                    name: String(panel.project_name ?? panel.project_code),
                    client: String(panel.client ?? ''),
                    project_state: String(panel.project_state ?? 'active'),
                    is_active: true,
                  },
                ]),
            ).values(),
          )
        : await projectsApi.list(request.signal) as Array<Record<string, unknown>>;
      if (!isLatestProjectValidation(request.id)) return;

      const state = useProjectSelectionStore.getState();
      const currentCode = state.ownerUserId === user.id ? state.selectedProject?.code : null;
      const selected = reconcileProjectSelection(rows as Array<Record<string, unknown> & { code: string }>, currentCode);

      if (selected) {
        setProjectForUser({
          code: String(selected.code),
          name: String(selected.name ?? selected.code),
          client: String(selected.client ?? ''),
          project_state: String(selected.project_state ?? 'not_started') as ActiveProjectContext['project_state'],
          is_active: selected.is_active !== false,
        }, user.id);
      } else {
        clearProjectForUser(user.id);
        clearLiveWiring();
      }
      setProjectContextVerified(true);
    } catch (error: any) {
      if (!isLatestProjectValidation(request.id) || error?.code === 'ERR_CANCELED') return;
      // Do not reveal an unverified persisted project while the database is unreachable.
      setProjectContextVerified(false);
    } finally {
      if (isLatestProjectValidation(request.id)) setProjectContextLoading(false);
    }
  }, [
    beginProjectValidation,
    clearLiveWiring,
    clearProjectForUser,
    isLatestProjectValidation,
    setProjectForUser,
    user?.id,
    user?.role,
  ]);

  // Keep the persisted project context scoped to the signed-in user.
  useEffect(() => {
    if (!user?.id) {
      setProjectContextLoading(false);
      setProjectContextVerified(false);
      return;
    }
    initializeForUser(user.id);
    void validateProjectContext();
  }, [initializeForUser, pathname, user?.id, user?.role, validateProjectContext]);

  useEffect(() => {
    if (!user?.id) return;
    const onFocus = () => void validateProjectContext();
    const onVisibility = () => { if (!document.hidden) void validateProjectContext(); };
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [user?.id, validateProjectContext]);

  useEffect(() => onFramesChanged(detail => {
    if (detail.action !== 'deleted') return;
    const state = useProjectSelectionStore.getState();
    if ((detail.entity ?? (detail.frameId ? 'panel' : 'project')) === 'project'
      && state.selectedProject?.code === detail.projectCode
      && user?.id) {
      clearProjectForUser(user.id);
    }
    const live = useLiveWiringStore.getState();
    if (live.projectCode === detail.projectCode) {
      clearLiveWiring();
    }
    void validateProjectContext();
  }), [clearLiveWiring, clearProjectForUser, user?.id, validateProjectContext]);

  return (
    <div ref={shellRef} className="app-shell" data-ui-polish="saas">
      <Topbar
        navItems={useSidebar ? [] : navItems}
        activeTab={activeTab}
        onTabChange={onTabChange}
        onMenuClick={useSidebar ? () => setMobileNavOpen(v => !v) : undefined}
        showMenuButton={useSidebar}
        activeProject={activeProject}
        projectContextLoading={projectContextLoading}
        noProjectAvailable={projectContextVerified && !projectContextLoading && !activeProject}
      />

      <div className="dash-layout">
        {useSidebar && (
          <Sidebar
            items={navItems}
            activeTab={activeTab}
            onTabChange={onTabChange}
            mobileOpen={mobileNavOpen}
            onMobileClose={() => setMobileNavOpen(false)}
          />
        )}

        <main className={noPadding ? 'dash-main dash-main--flush' : 'dash-main'}>
          {children}
        </main>
      </div>
    </div>
  );
}
