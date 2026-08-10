import { useEffect, useRef, useState, type ReactNode } from 'react';
import { DashboardIcon } from '../ui/DashboardIcon';
import { Icon } from '../ui/Icon';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../../store/useAuthStore';
import Avatar from './Avatar';
import CompanyLogo from '../ui/CompanyLogo';
import BiometricSettings from '../biometric/BiometricSettings';
import { useBiometricAvailable } from '../../hooks/useBiometric';
import { adminApi } from '../../services/api';
import MyProfileModal from '../profile/MyProfileModal';
import TopbarProfileMenu from './TopbarProfileMenu';
import { browserFullscreenSupported, useBrowserFullscreen } from '../../hooks/useBrowserFullscreen';
import type { ActiveProjectContext } from '../../store/useProjectSelectionStore';

const ROLE_LABELS: Record<string, string> = {
  system_admin:      'System Admin',
  ops_director:      'Ops Director',
  prod_supervisor:   'Supervisor',
  qaqc_engineer:     'QA/QC Engineer',
  wiring_technician: 'Technician',
};

export interface NavItem {
  key: string;
  label: string;
  icon?: ReactNode;
  id?: string;
  onSelect?: () => void;
  /** Short description shown in the app-wide section header for this tab. */
  description?: string;
  /** When true on sideNavItems, shows secondary filter-applied indicator (`is-filter-applied`), not primary `is-active` selection. */
  active?: boolean;
  /** Optional compact subtitle/badge under the sidebar label (e.g. selected equipment). */
  badge?: string;
  /** When true, selecting this side-nav item does not close the mobile sidebar drawer. */
  keepSidebarOpen?: boolean;
  /** When set, render this control instead of a sidebar nav button (e.g. equipment filter). */
  customControl?: ReactNode;
}

interface TopbarProps {
  navItems?: NavItem[];
  activeTab?: string;
  onTabChange?: (key: string) => void;
  onMenuClick?: () => void;
  showMenuButton?: boolean;
  activeProject?: ActiveProjectContext | null;
  projectSelectionRequired?: boolean;
  projectContextLoading?: boolean;
  noProjectAvailable?: boolean;
}

export default function Topbar({
  navItems = [],
  activeTab,
  onTabChange,
  onMenuClick,
  showMenuButton = false,
}: TopbarProps) {
  const navigate = useNavigate();
  const { user, logout } = useAuthStore();
  const [clock, setClock] = useState(new Date());
  const [showBioPanel, setShowBioPanel] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [deployMode, setDeployMode] = useState<'intranet' | 'cloud' | null>(null);
  const profileZoneRef = useRef<HTMLDivElement>(null);
  const { active: fullscreenActive, standalone: fsStandalone, toggle: toggleFullscreen } = useBrowserFullscreen();
  const showFullscreenControl = browserFullscreenSupported() && !fsStandalone;

  const { available: bioAvailable, checking: bioChecking, contextSupported } = useBiometricAvailable();
  const showBioSettings = !bioChecking && (bioAvailable || !contextSupported);

  useEffect(() => {
    const t = setInterval(() => setClock(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (user?.role !== 'system_admin') return;
    adminApi.getDeploymentConfig()
      .then((cfg) => setDeployMode(cfg.mode))
      .catch(() => setDeployMode('intranet'));
  }, [user?.role]);

  useEffect(() => {
    if (!showBioPanel && !showProfileMenu) return;
    const handler = (e: MouseEvent) => {
      if (profileZoneRef.current && !profileZoneRef.current.contains(e.target as Node)) {
        setShowBioPanel(false);
        setShowProfileMenu(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showBioPanel, showProfileMenu]);

  const [hh, mm, ss] = clock
    .toLocaleTimeString('en-GB', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })
    .split(':');
  const dateStr = clock.toLocaleDateString('en-GB', {
    weekday: 'short', day: '2-digit', month: 'short', year: 'numeric',
  });

  const handleLogout = async () => {
    await logout();
    navigate('/', { replace: true });
  };

  return (
    <header className="topbar" aria-label="Application header">
      <div className="topbar-inner">
        <div className="topbar-brand-card">
          {showMenuButton && (
            <button
              type="button"
              className="topbar-menu-btn tablet-port:hidden"
              onClick={onMenuClick}
              title="Open navigation"
              aria-label="Open navigation menu"
            >
              <DashboardIcon name="menu" size={18} />
            </button>
          )}
          <CompanyLogo variant="icon" size="sm" className="topbar-logo-img-wrap" />
          <div className="topbar-brand-text hidden xs:flex">
            <span className="topbar-logo-name">DWES</span>
            <span className="topbar-logo-sub hidden sm:block">Digital Wiring Execution System</span>
          </div>
        </div>

        {navItems.length > 0 && (
          <div className="topbar-nav-card topbar-float topbar-float--dark" role="tablist" aria-label="Module navigation">
            {navItems.map(item => (
              <button
                key={item.key}
                onClick={() => onTabChange?.(item.key)}
                className={`topbar-nav-btn${activeTab === item.key ? ' active' : ''}`}
                type="button"
                title={item.label}
                role="tab"
                aria-selected={activeTab === item.key}
              >
                {item.icon}
                <span className="hidden tablet-land:inline">{item.label}</span>
              </button>
            ))}
          </div>
        )}

        <div className="topbar-controls">
          {user?.role === 'system_admin' && deployMode && (
            <span className={`topbar-env topbar-float-pill${deployMode === 'cloud' ? ' topbar-env--cloud' : ''}`}>
              {deployMode === 'cloud' ? 'Cloud Hosted' : 'Local Intranet'}
            </span>
          )}

          {user && (
            <div className="topbar-profile-zone" ref={profileZoneRef}>
              <div
                className={`topbar-user-card topbar-float topbar-user-card--profile topbar-user-profile--expanded${user.role === 'wiring_technician' ? ' cursor-pointer' : ''}`}
                title={`${user.full_name} · @${user.username} · ${ROLE_LABELS[user.role] ?? user.role}`}
                onClick={user.role === 'wiring_technician' ? () => setShowProfile(true) : undefined}
                onKeyDown={user.role === 'wiring_technician' ? (e) => { if (e.key === 'Enter' || e.key === ' ') setShowProfile(true); } : undefined}
                role={user.role === 'wiring_technician' ? 'button' : undefined}
                tabIndex={user.role === 'wiring_technician' ? 0 : undefined}
              >
                <Avatar name={user.full_name} role={user.role} size={30} />
                <div className="topbar-user-meta topbar-user-meta--responsive min-w-0">
                  <div className="topbar-user-name">{user.full_name}</div>
                  <div className="topbar-user-details">
                    <span className="topbar-user-handle">@{user.username}</span>
                    <span className="topbar-user-role">{ROLE_LABELS[user.role] ?? user.role}</span>
                  </div>
                </div>
              </div>

              <button
                type="button"
                className="topbar-user-card topbar-float topbar-user-card--profile topbar-user-profile--compact"
                title="Account and settings"
                aria-label={`Account menu for ${user.full_name}`}
                aria-expanded={showProfileMenu}
                aria-haspopup="menu"
                onClick={() => setShowProfileMenu(v => !v)}
              >
                <Avatar name={user.full_name} role={user.role} size={30} />
              </button>

              {showProfileMenu && (
                <TopbarProfileMenu
                  user={user}
                  roleLabel={ROLE_LABELS[user.role] ?? user.role}
                  onClose={() => setShowProfileMenu(false)}
                  onLogout={handleLogout}
                  onOpenProfile={user.role === 'wiring_technician' ? () => setShowProfile(true) : undefined}
                  onOpenBio={showBioSettings ? () => setShowBioPanel(true) : undefined}
                  showBioSettings={showBioSettings}
                  showFullscreen={showFullscreenControl}
                  onToggleFullscreen={() => void toggleFullscreen()}
                  fullscreenActive={fullscreenActive}
                />
              )}

              {showBioPanel && (
                <div className="bio-panel-dropdown topbar-profile-bio-panel" role="dialog" aria-label="Fingerprint sign-in settings">
                  <div className="flex items-center justify-between px-4 py-3 border-b shrink-0">
                    <div>
                      <p className="text-sm font-semibold">Fingerprint sign-in</p>
                      <p className="text-xs mt-0.5">Enrolled devices on this server</p>
                    </div>
                    <button
                      type="button"
                      title="Close fingerprint settings"
                      onClick={() => setShowBioPanel(false)}
                      className="p-1.5 min-h-[38px] min-w-[38px] flex items-center justify-center rounded-lg transition-colors"
                    >
                      <DashboardIcon name="close" size={16} />
                    </button>
                  </div>
                  <div className="bio-panel-dropdown-body px-4 py-3">
                    <BiometricSettings />
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="topbar-actions-capsule topbar-float topbar-float--dark topbar-actions-capsule--desktop" role="group" aria-label="Header actions">
            {showFullscreenControl && (
              <button
                type="button"
                className={`topbar-capsule-btn topbar-capsule-btn--bio${fullscreenActive ? ' is-active' : ''}`}
                onClick={() => void toggleFullscreen()}
                title={fullscreenActive ? 'Exit browser full screen' : 'Browser full screen (hide address bar)'}
                aria-label={fullscreenActive ? 'Exit browser full screen' : 'Enter browser full screen'}
              >
                <Icon name={fullscreenActive ? 'close_fullscreen' : 'fullscreen'} size={18} weight={600} />
              </button>
            )}
            {showBioSettings && (
              <button
                type="button"
                onClick={() => setShowBioPanel(v => !v)}
                title="Fingerprint sign-in settings"
                className={`topbar-capsule-btn topbar-capsule-btn--bio topbar-bio-trigger--desktop${showBioPanel ? ' is-active' : ''}`}
                aria-expanded={showBioPanel}
                aria-haspopup="dialog"
              >
                <Icon name="fingerprint" size={20} weight={600} />
              </button>
            )}
            {!showBioSettings && (
              <span className="topbar-capsule-slot topbar-capsule-slot--desktop" aria-hidden="true" />
            )}

            <button
              className="topbar-capsule-btn topbar-capsule-btn--logout topbar-capsule-btn--icon-only"
              onClick={handleLogout}
              type="button"
              title="Logout"
              aria-label="Logout"
            >
              <Icon name="logout" size={18} weight={600} />
            </button>
          </div>

          <div
            className="topbar-clock-card topbar-float topbar-float--dark flex items-center gap-2.5 select-none shrink-0"
            aria-label={`Current time: ${hh}:${mm}:${ss}, ${dateStr}`}
          >
            <span className="topbar-clock-live" aria-hidden="true" />
            <div className="flex flex-col items-end justify-center leading-none gap-[3px] min-w-0">
              <div className="topbar-clock-digits">
                {hh}<span className="topbar-clock-sep">:</span>{mm}<span className="topbar-clock-sep">:</span><span className="topbar-clock-secs">{ss}</span>
              </div>
              <div className="topbar-clock-date hidden tablet-land:block">
                {dateStr}
              </div>
            </div>
          </div>
        </div>
      </div>
      {showProfile && <MyProfileModal onClose={() => setShowProfile(false)} />}
    </header>
  );
}
