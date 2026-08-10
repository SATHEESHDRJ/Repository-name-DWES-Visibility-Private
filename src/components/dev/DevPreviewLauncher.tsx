import { useLocation, useNavigate } from 'react-router-dom';
import { Icon } from '../ui/icons';

function LoginTabletIcon() {
  return (
    <svg
      className="login-device-preview-icon"
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="login-tablet-outline" x1="5" y1="2" x2="19" y2="22" gradientUnits="userSpaceOnUse">
          <stop stopColor="#173568" />
          <stop offset="0.55" stopColor="#2563EB" />
          <stop offset="1" stopColor="#2E9DAA" />
        </linearGradient>
      </defs>
      <rect
        x="4.75"
        y="1.75"
        width="14.5"
        height="20.5"
        rx="2.5"
        fill="rgba(255, 255, 255, 0.48)"
        stroke="url(#login-tablet-outline)"
        strokeWidth="1.45"
      />
      <rect
        className="login-tablet-screen"
        x="6.7"
        y="4.9"
        width="10.6"
        height="12.1"
        rx="0.9"
        stroke="url(#login-tablet-outline)"
        strokeWidth="1.05"
      />
      <path d="M7.8 6.35H16.2" stroke="url(#login-tablet-outline)" strokeWidth="0.8" strokeLinecap="round" opacity="0.72" />
      <circle cx="12" cy="3.35" r="0.5" fill="#2E9DAA" />
      <path d="M10.35 19.55H13.65" stroke="url(#login-tablet-outline)" strokeWidth="1.05" strokeLinecap="round" />
    </svg>
  );
}

/**
 * DEV-ONLY floating "Device Preview" launcher (excluded from production builds
 * via the import.meta.env.DEV guard in App.tsx).
 *
 * One compact control serves the Login page and every authenticated screen, so
 * the simulated device size can be changed without returning to Login. It never
 * renders inside the preview iframe itself (window.self !== window.top) or on
 * the preview page.
 */
export default function DevPreviewLauncher() {
  const navigate = useNavigate();
  const location = useLocation();
  const isLogin = location.pathname === '/';

  if (typeof window !== 'undefined' && window.self !== window.top) return null;
  if (location.pathname.startsWith('/__device-preview')) return null;

  return (
    <button
      type="button"
      onClick={() => navigate('/__device-preview')}
      title="Device Preview — tablet viewport testing (dev only)"
      aria-label="Open Device Preview"
      className={isLogin
        ? 'login-device-preview-btn fixed bottom-4 left-4 z-[400] flex h-10 w-10 items-center justify-center rounded-full'
        : 'fixed bottom-4 left-4 z-[400] flex h-10 w-10 items-center justify-center rounded-full border border-slate-300 bg-white/90 text-muted opacity-70 shadow-lg backdrop-blur transition-all hover:scale-105 hover:text-blue-600 hover:opacity-100 focus-visible:opacity-100'}
    >
      {isLogin ? <LoginTabletIcon /> : <Icon name="devices" size={20} />}
    </button>
  );
}
