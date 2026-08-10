import Avatar from './Avatar';
import { Icon } from '../ui/Icon';
import { DashboardIcon } from '../ui/DashboardIcon';

interface TopbarProfileUser {
  full_name: string;
  username: string;
  role: string;
}

interface TopbarProfileMenuProps {
  user: TopbarProfileUser;
  roleLabel: string;
  onClose: () => void;
  onLogout: () => void;
  onOpenProfile?: () => void;
  onOpenBio?: () => void;
  showBioSettings?: boolean;
  showFullscreen?: boolean;
  onToggleFullscreen?: () => void;
  fullscreenActive?: boolean;
}

export default function TopbarProfileMenu({
  user,
  roleLabel,
  onClose,
  onLogout,
  onOpenProfile,
  onOpenBio,
  showBioSettings,
  showFullscreen,
  onToggleFullscreen,
  fullscreenActive,
}: TopbarProfileMenuProps) {
  return (
    <div className="topbar-profile-menu" role="menu" aria-label="User account">
      <div className="topbar-profile-menu-head">
        <Avatar name={user.full_name} role={user.role} size={40} />
        <div className="topbar-profile-menu-identity min-w-0">
          <p className="topbar-profile-menu-name">{user.full_name}</p>
          <p className="topbar-profile-menu-handle">@{user.username}</p>
          <span className="topbar-profile-menu-role">{roleLabel}</span>
        </div>
        <button
          type="button"
          className="topbar-profile-menu-close"
          onClick={onClose}
          aria-label="Close account menu"
        >
          <DashboardIcon name="close" size={16} />
        </button>
      </div>
      <div className="topbar-profile-menu-actions">
        {onOpenProfile && (
          <button
            type="button"
            role="menuitem"
            className="topbar-profile-menu-item"
            onClick={() => { onOpenProfile(); onClose(); }}
          >
            <Icon name="person" size={18} weight={600} />
            My profile
          </button>
        )}
        {showBioSettings && onOpenBio && (
          <button
            type="button"
            role="menuitem"
            className="topbar-profile-menu-item"
            onClick={() => { onOpenBio(); onClose(); }}
          >
            <Icon name="fingerprint" size={18} weight={600} />
            Fingerprint sign-in
          </button>
        )}
        {showFullscreen && onToggleFullscreen && (
          <button
            type="button"
            role="menuitem"
            className="topbar-profile-menu-item"
            onClick={() => { onToggleFullscreen(); onClose(); }}
          >
            <Icon name={fullscreenActive ? 'close_fullscreen' : 'fullscreen'} size={18} weight={600} />
            {fullscreenActive ? 'Exit browser full screen' : 'Browser full screen'}
          </button>
        )}
        <button
          type="button"
          role="menuitem"
          className="topbar-profile-menu-item topbar-profile-menu-item--logout"
          onClick={() => { void onLogout(); onClose(); }}
        >
          <Icon name="logout" size={18} weight={600} />
          Logout
        </button>
      </div>
    </div>
  );
}
