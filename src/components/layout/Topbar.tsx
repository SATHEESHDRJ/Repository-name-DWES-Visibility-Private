import { useEffect, useRef, useState } from 'react';
import { Fingerprint, FolderKanban, LogOut, Menu, X } from '../ui/icons';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../../store/useAuthStore';
import Avatar from './Avatar';
import CompanyLogo from '../ui/CompanyLogo';
import BiometricSettings from '../biometric/BiometricSettings';
import { useBiometricAvailable } from '../../hooks/useBiometric';
import { adminApi } from '../../services/api';
import MyProfileModal from '../profile/MyProfileModal';
import type { ActiveProjectContext } from '../../store/useProjectSelectionStore';
import { useLiveWiringStore } from '../../store/useLiveWiringStore';

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
  icon?: React.ReactNode;
  /** Short description shown in the app-wide section header for this tab. */
  description?: string;
}

interface TopbarProps {
  navItems?: NavItem[];
  activeTab?: string;
  onTabChange?: (key: string) => void;
  onMenuClick?: () => void;
  showMenuButton?: boolean;
  activeProject?: ActiveProjectContext | null;
  projectSelectionRequired?: boolean;
}

export default function Topbar({
  navItems = [],
  activeTab,
  onTabChange,
  onMenuClick,
  showMenuButton = false,
  activeProject = null,
  projectSelectionRequired = false,
}: TopbarProps) {
  const navigate = useNavigate();
  const { user, logout } = useAuthStore();
  const liveWiring = useLiveWiringStore();
  const isTechLive = user?.role === 'wiring_technician' && liveWiring.live;
  const [clock, setClock] = useState(new Date());
  const [showBioPanel, setShowBioPanel] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const [deployMode, setDeployMode] = useState<'intranet' | 'cloud' | null>(null);
  const bioPanelRef = useRef<HTMLDivElement>(null);

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
    if (!showBioPanel) return;
    const handler = (e: MouseEvent) => {
      if (bioPanelRef.current && !bioPanelRef.current.contains(e.target as Node))
        setShowBioPanel(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showBioPanel]);

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
              className="topbar-menu-btn tablet-land:hidden"
              onClick={onMenuClick}
              title="Open navigation"
              aria-label="Open navigation menu"
            >
              <Menu size={18} strokeWidth={1.75} />
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
          <div
            className={`topbar-project-pill topbar-float topbar-float--light${projectSelectionRequired ? ' topbar-project-pill--required' : ''}${isTechLive ? ' topbar-project-pill--live' : ''}`}
            aria-live="polite"
            title={isTechLive
              ? `Wiring in progress — ${liveWiring.projectName || liveWiring.projectCode || ''}`
              : projectSelectionRequired
                ? 'Project selection required before using the application'
                : `Active Project: ${activeProject?.code ?? ''}`}
          >
            <div className="topbar-project-icon" aria-hidden="true">
              <FolderKanban size={16} strokeWidth={1.75} />
            </div>
            <div className="topbar-project-meta min-w-0">
              <span className="topbar-project-label">Project</span>
              <span className="topbar-project-value">
                {isTechLive
                  ? (liveWiring.projectName || liveWiring.projectCode || 'In progress')
                  : projectSelectionRequired
                    ? 'Selection Required'
                    : (activeProject?.code ?? 'Unassigned')}
              </span>
            </div>
            {isTechLive && (
              <span className="topbar-live-dot" aria-label="Wiring in progress" />
            )}
          </div>

          {user?.role === 'system_admin' && deployMode && (
            <span className={`topbar-env topbar-float-pill${deployMode === 'cloud' ? ' topbar-env--cloud' : ''}`}>
              {deployMode === 'cloud' ? 'Cloud Hosted' : 'Local Intranet'}
            </span>
          )}

          {user && (
            <div
              className={`topbar-user-card topbar-float topbar-float--light${user.role === 'wiring_technician' ? ' cursor-pointer hover:bg-white/90' : ''}`}
              title={`${user.full_name} · @${user.username} · ${ROLE_LABELS[user.role] ?? user.role}`}
              onClick={user.role === 'wiring_technician' ? () => setShowProfile(true) : undefined}
              onKeyDown={user.role === 'wiring_technician' ? (e) => { if (e.key === 'Enter' || e.key === ' ') setShowProfile(true); } : undefined}
              role={user.role === 'wiring_technician' ? 'button' : undefined}
              tabIndex={user.role === 'wiring_technician' ? 0 : undefined}
            >
              <Avatar name={user.full_name} role={user.role} size={30} />
              <div className="topbar-user-meta min-w-0 hidden xs:block">
                <div className="topbar-user-name">{user.full_name}</div>
                <div className="topbar-user-role">
                  <span className="topbar-user-handle">@{user.username}</span>
                  <span className="topbar-user-role-sep"> · </span>
                  {ROLE_LABELS[user.role] ?? user.role}
                </div>
              </div>
            </div>
          )}

          <div className="topbar-actions-capsule topbar-float topbar-float--dark" role="group" aria-label="Header actions">
            {showBioSettings && (
              <div className="topbar-bio-anchor" ref={bioPanelRef}>
                <button
                  type="button"
                  onClick={() => setShowBioPanel(v => !v)}
                  title="Fingerprint sign-in settings"
                  className={`topbar-capsule-btn topbar-capsule-btn--bio${showBioPanel ? ' is-active' : ''}`}
                  aria-expanded={showBioPanel}
                  aria-haspopup="dialog"
                >
                  <Fingerprint size={20} strokeWidth={1.75} />
                </button>

                {showBioPanel && (
                  <div className="bio-panel-dropdown" role="dialog" aria-label="Fingerprint sign-in settings">
                    <div className="flex items-center justify-between px-5 py-4 border-b shrink-0">
                      <div>
                        <p className="text-sm font-semibold">Fingerprint sign-in</p>
                        <p className="text-xs mt-0.5">Enrolled devices on this server</p>
                      </div>
                      <button
                        type="button"
                        title="Close fingerprint settings"
                        onClick={() => setShowBioPanel(false)}
                        className="p-1.5 min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg transition-colors"
                      >
                        <X size={16} />
                      </button>
                    </div>
                    <div className="bio-panel-dropdown-body px-5 py-4">
                      <BiometricSettings />
                    </div>
                  </div>
                )}
              </div>
            )}

            <button
              className="topbar-capsule-btn topbar-capsule-btn--logout"
              onClick={handleLogout}
              type="button"
              title="Logout"
              aria-label="Logout"
            >
              <LogOut size={20} strokeWidth={1.75} />
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
              <div className="topbar-clock-date hidden xs:block">
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
