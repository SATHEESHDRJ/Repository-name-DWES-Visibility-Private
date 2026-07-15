import { useLocation, useNavigate } from 'react-router-dom';
import { Icon } from '../ui/icons';

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

  if (typeof window !== 'undefined' && window.self !== window.top) return null;
  if (location.pathname.startsWith('/__device-preview')) return null;

  return (
    <button
      type="button"
      onClick={() => navigate('/__device-preview')}
      title="Device Preview — tablet viewport testing (dev only)"
      aria-label="Open Device Preview"
      className="fixed bottom-4 left-4 z-[400] flex h-10 w-10 items-center justify-center rounded-full border border-slate-300 bg-white/90 text-slate-500 opacity-70 shadow-lg backdrop-blur transition-all hover:scale-105 hover:text-blue-600 hover:opacity-100 focus-visible:opacity-100"
    >
      <Icon name="devices" size={20} />
    </button>
  );
}
