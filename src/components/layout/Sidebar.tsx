import { cloneElement, isValidElement, type ReactNode } from 'react';
import { DashboardIcon } from '../ui/DashboardIcon';
import type { NavItem } from './Topbar';

const SIDEBAR_ICON_SIZE = 22;

/** Normalize dashboard tab icons for the compact rail — filled 3D, legible, consistent. */
function renderSidebarIcon(icon: ReactNode): ReactNode {
  if (!isValidElement<{ name?: string; size?: number | string; filled?: boolean; weight?: number }>(icon)) {
    return icon;
  }
  const props = icon.props;
  // Prefer DashboardIcon size override; Material filled/weight still accepted for legacy nodes.
  if (typeof props.name === 'string') {
    return cloneElement(icon, {
      size: props.size ?? SIDEBAR_ICON_SIZE,
    });
  }
  return cloneElement(icon, {
    filled: props.filled ?? true,
    size: props.size ?? SIDEBAR_ICON_SIZE,
    weight: props.weight ?? 600,
  });
}

interface SidebarProps {
  items: NavItem[];
  sideNavItems?: NavItem[];
  activeTab?: string;
  onTabChange?: (key: string) => void;
  mobileOpen?: boolean;
  onMobileClose?: () => void;
}

export default function Sidebar({
  items,
  sideNavItems = [],
  activeTab,
  onTabChange,
  mobileOpen = false,
  onMobileClose,
}: SidebarProps) {
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
        className={[
          'dash-sidebar',
          mobileOpen ? 'dash-sidebar--mobile-open' : '',
        ].filter(Boolean).join(' ')}
        aria-label="Dashboard navigation"
      >
        <div className="dash-sidebar-head">
          <div className="dash-sidebar-title-wrap" title="Workspace navigation">
            <span className="dash-sidebar-title-icon" aria-hidden="true">
              <DashboardIcon name="workspace" size={SIDEBAR_ICON_SIZE} />
            </span>
            <span className="dash-sidebar-title">Workspace</span>
          </div>
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
              aria-current={activeTab === item.key ? 'page' : undefined}
            >
              <span className="dash-sidebar-icon">{renderSidebarIcon(item.icon)}</span>
              <span className="dash-sidebar-label">{item.label}</span>
            </button>
          ))}
          {sideNavItems.map(item => (
            item.customControl ? (
              <div
                key={item.id ?? item.key}
                className={`dash-sidebar-control${item.active ? ' is-filter-applied' : ''}`}
              >
                {item.customControl}
              </div>
            ) : (
              <button
                key={item.id}
                id={item.id}
                type="button"
                className={`dash-sidebar-link${item.active ? ' is-filter-applied' : ''}`}
                onClick={() => {
                  item.onSelect?.();
                  if (!item.keepSidebarOpen) onMobileClose?.();
                }}
                title={item.badge ? `${item.label}: ${item.badge}` : item.label}
                aria-label={item.badge ? `${item.label}: ${item.badge}` : item.label}
                aria-pressed={item.active ? true : undefined}
              >
                <span className="dash-sidebar-icon">{renderSidebarIcon(item.icon)}</span>
                <span className="dash-sidebar-label">{item.label}</span>
                {item.badge ? (
                  <span className="dash-sidebar-badge" title={item.badge}>{item.badge}</span>
                ) : item.active ? (
                  <span className="dash-sidebar-filter-dot" aria-hidden="true" />
                ) : null}
              </button>
            )
          ))}
        </nav>
      </aside>
    </>
  );
}
