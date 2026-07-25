import { PanelLeftClose, PanelLeftOpen } from '../ui/icons';
import { useUIStore } from '../../store/useUIStore';
import type { NavItem } from './Topbar';

interface SidebarProps {
  items: NavItem[];
  activeTab?: string;
  onTabChange?: (key: string) => void;
  mobileOpen?: boolean;
  onMobileClose?: () => void;
}

export default function Sidebar({
  items,
  activeTab,
  onTabChange,
  mobileOpen = false,
  onMobileClose,
}: SidebarProps) {
  const { sidebarExpanded, toggleSidebar } = useUIStore();

  if (items.length === 0) return null;

  const handleSelect = (key: string) => {
    onTabChange?.(key);
    onMobileClose?.();
  };

  return (
    <>
      {mobileOpen && (
        <button
          type="button"
          className="sidebar-backdrop"
          aria-label="Close navigation"
          onClick={onMobileClose}
        />
      )}

      <aside
        className={`dash-sidebar${sidebarExpanded || mobileOpen ? '' : ' dash-sidebar--collapsed'}${mobileOpen ? ' dash-sidebar--mobile-open' : ''}`}
        aria-label="Dashboard navigation"
      >
        <div className="dash-sidebar-head">
          <span className={`dash-sidebar-title${sidebarExpanded || mobileOpen ? '' : ' sr-only'}`}>Workspace</span>
          <button
            type="button"
            className="dash-sidebar-toggle hidden tablet-land:flex items-center justify-center"
            onClick={toggleSidebar}
            title={sidebarExpanded ? 'Collapse sidebar' : 'Expand sidebar'}
            aria-label={sidebarExpanded ? 'Collapse sidebar' : 'Expand sidebar'}
            aria-expanded={sidebarExpanded}
          >
            {sidebarExpanded ? <PanelLeftClose size={18} /> : <PanelLeftOpen size={18} />}
          </button>
        </div>

        <nav className="dash-sidebar-nav">
          {items.map(item => (
            <button
              key={item.key}
              type="button"
              className={`dash-sidebar-link${activeTab === item.key ? ' is-active' : ''}`}
              onClick={() => handleSelect(item.key)}
              title={item.label}
              aria-label={item.label}
            >
              <span className="dash-sidebar-icon">{item.icon}</span>
              <span className={`dash-sidebar-label${sidebarExpanded || mobileOpen ? '' : ' sr-only'}`}>{item.label}</span>
            </button>
          ))}
        </nav>
      </aside>
    </>
  );
}
