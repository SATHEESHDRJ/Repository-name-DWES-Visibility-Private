import { useEffect, useState } from 'react';
import { LogOut } from './ui/icons';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/useAuthStore';
import { ROLE_LABELS } from '../types';
import type { UserRole } from '../types';
import { useAppDialog } from './AppDialogProvider';

interface NavTab {
  key: string;
  label: string;
  icon: React.ReactNode;
}

interface NavBarProps {
  tabs?: NavTab[];
  activeTab?: string;
  onTabChange?: (key: string) => void;
}

export default function NavBar({ tabs = [], activeTab, onTabChange }: NavBarProps) {
  const navigate = useNavigate();
  const dialog = useAppDialog();
  const { user, logout } = useAuthStore();
  const [clock, setClock] = useState(new Date());
  const [logoutLoading, setLogoutLoading] = useState(false);

  useEffect(() => {
    const timer = setInterval(() => setClock(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const handleLogout = async () => {
    const ok = await dialog.confirm({
      title: 'Logout',
      message: 'You will be signed out of DWES on this device. Unsaved work in other tabs may be lost.',
      tone: 'logout',
      confirmText: 'Logout',
      actionSummary: 'End the current session and return to the login screen.',
      entity: user ? { label: 'User', value: user.full_name, meta: user.username, kind: 'user' } : undefined,
    });
    if (!ok) return;
    setLogoutLoading(true);
    await logout();
    navigate('/', { replace: true });
  };

  if (!user) return null;

  const initials = user.full_name
    .split(' ')
    .map(part => part[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  return (
    <header className="dwes-topbar">
      <div className="dwes-nav">
        <div className="dwes-logo">
          <div className="dwes-logo-mark">W</div>
          <div className="dwes-logo-copy">
            <span className="dwes-logo-title">DWES</span>
            <span className="dwes-logo-subtitle">Digital Wiring Execution System</span>
          </div>
        </div>

        {tabs.length > 0 && (
          <nav className="dwes-nav-tabs" aria-label="Dashboard tabs">
            {tabs.map(tab => (
              <button
                key={tab.key}
                className={`dwes-nav-tab ${activeTab === tab.key ? 'is-active' : ''}`}
                onClick={() => onTabChange?.(tab.key)}
                type="button"
              >
                {tab.icon}
                <span>{tab.label}</span>
              </button>
            ))}
          </nav>
        )}

        <div className="dwes-nav-right">
          <span className="dwes-clock">
            {clock.toLocaleTimeString('en-GB', { hour12: false })}
          </span>
          <span className="dwes-pill dwes-pill-primary">Local Dev</span>
          <div className="dwes-user-chip">
            <div
              className="dwes-avatar"
              data-role={user.role as UserRole}
            >
              {initials}
            </div>
            <div>
              <div className="dwes-user-name">
                {user.full_name.split(' ').slice(0, 2).join(' ')}
              </div>
              <div className="dwes-user-role">
                {ROLE_LABELS[user.role as UserRole] || user.role}
              </div>
            </div>
          </div>
          <button className="dwes-button dwes-button-danger" onClick={handleLogout} disabled={logoutLoading} type="button">
            <LogOut size={16} />
            <span>{logoutLoading ? 'Signing out' : 'Logout'}</span>
          </button>
        </div>
      </div>
    </header>
  );
}
