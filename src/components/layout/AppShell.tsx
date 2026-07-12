import { type ReactNode, useEffect, useRef, useState } from 'react';
import Topbar from './Topbar';
import Sidebar from './Sidebar';
import type { NavItem } from './Topbar';
import { useAuthStore } from '../../store/useAuthStore';
import { useProjectSelectionStore } from '../../store/useProjectSelectionStore';

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
  const { user } = useAuthStore();
  const { selectedProject, ownerUserId, initializeForUser } = useProjectSelectionStore();

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
  const activeProject = user?.id && selectedProject && ownerUserId === user.id ? selectedProject : null;

  // Keep the persisted project context scoped to the signed-in user.
  useEffect(() => {
    if (!user?.id) return;
    initializeForUser(user.id);
  }, [initializeForUser, user?.id]);

  return (
    <div ref={shellRef} className="app-shell" data-ui-polish="saas">
      <Topbar
        navItems={useSidebar ? [] : navItems}
        activeTab={activeTab}
        onTabChange={onTabChange}
        onMenuClick={useSidebar ? () => setMobileNavOpen(v => !v) : undefined}
        showMenuButton={useSidebar}
        activeProject={activeProject}
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
