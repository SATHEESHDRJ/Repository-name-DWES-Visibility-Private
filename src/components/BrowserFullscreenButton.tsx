import { useState } from 'react';
import { Maximize, Minimize2 } from './ui/icons';
import { browserFullscreenSupported, useBrowserFullscreen } from '../hooks/useBrowserFullscreen';

function isIosBrowser(): boolean {
  const ua = navigator.userAgent;
  return /iPad|iPhone|iPod/.test(ua)
    || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

interface Props {
  /** `login` = pill on login top bar; `compact` = icon-only for headers */
  variant?: 'login' | 'compact';
  className?: string;
}

const IOS_HINT =
  'On iPad or iPhone: use Install App, then Safari Share → Add to Home Screen. Open DWES from the home screen for a view without the browser address bar.';

/**
 * Hides the browser address bar using the Fullscreen API (desktop/Android Chrome).
 * Installed PWA remains the best option on iOS.
 */
export default function BrowserFullscreenButton({ variant = 'login', className = '' }: Props) {
  const { active, standalone, toggle } = useBrowserFullscreen();
  const [hint, setHint] = useState<string | null>(null);
  const nativeFs = browserFullscreenSupported();

  if (standalone) return null;

  const onClick = async () => {
    setHint(null);
    if (!nativeFs) {
      setHint(isIosBrowser() ? IOS_HINT : 'Use Install App on this device for a chromeless view.');
      return;
    }
    try {
      await toggle();
    } catch {
      setHint(IOS_HINT);
    }
  };

  if (variant === 'compact') {
    return (
      <button
          type="button"
          className={`topbar-capsule-btn topbar-capsule-btn--bio${active ? ' is-active' : ''} ${className}`.trim()}
          onClick={() => void onClick()}
          title={active ? 'Exit browser full screen' : 'Browser full screen (hide address bar)'}
          aria-label={active ? 'Exit browser full screen' : 'Enter browser full screen'}
        >
          {active ? <Minimize2 size={18} strokeWidth={1.75} /> : <Maximize size={18} strokeWidth={1.75} />}
      </button>
    );
  }

  return (
    <div className="login-install-wrap">
      <button
        type="button"
        className={`login-install-btn login-install-btn--fullscreen login-install-btn--compact${active ? ' is-active' : ''} ${className}`.trim()}
        onClick={() => void onClick()}
        title={active ? 'Exit full screen' : 'Full screen — hide browser address bar'}
        aria-label={active ? 'Exit full screen' : 'Enter full screen in this tab'}
      >
        {active
          ? <Minimize2 className="login-install-device-icon" size={16} strokeWidth={1.75} aria-hidden="true" />
          : <Maximize className="login-install-device-icon" size={16} strokeWidth={1.75} aria-hidden="true" />}
        <span className="login-install-label">{active ? 'Exit' : 'Full'}</span>
      </button>
      {hint && (
        <p className="login-install-hint" role="status">{hint}</p>
      )}
    </div>
  );
}
