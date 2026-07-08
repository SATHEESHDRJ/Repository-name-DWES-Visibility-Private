import { type ReactNode, useEffect, useState } from 'react';
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
  const { user } = useAuthStore();
  const { selectedProject, ownerUserId, initializeForUser } = useProjectSelectionStore();

  const useSidebar = sidebarNav && navItems.length > 0;
  // Project context is surfaced in the header pill, not enforced by a blocking gate.
  const activeProject = user?.id && selectedProject && ownerUserId === user.id ? selectedProject : null;

  // Keep the persisted project context scoped to the signed-in user.
  useEffect(() => {
    if (!user?.id) return;
    initializeForUser(user.id);
  }, [initializeForUser, user?.id]);

  return (
    <div className="app-shell" data-ui-polish="saas">
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
