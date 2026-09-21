import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { InstallDesktop } from './ui/icons';

/** Brief guidance only — dismisses so it never blocks Exit / LIVE clock. */
const HINT_AUTO_HIDE_MS = 5000;
const HINT_SESSION_KEY = 'dwes-login-install-hint-dismissed-v1';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

interface InstallGuidance {
  kind: 'ios' | 'browser' | 'insecure';
  title: string;
  message: string;
}

const DEVICE_INSTALL_KEY = 'dwes-pwa-installed-on-this-device-v1';

/** True while DWES runs as an installed app rather than a browser tab. */
function isStandalone(): boolean {
  return window.matchMedia('(display-mode: standalone)').matches
    || (navigator as { standalone?: boolean }).standalone === true;
}

function writeDeviceInstallMarker(installed: boolean): void {
  try {
    if (installed) localStorage.setItem(DEVICE_INSTALL_KEY, '1');
    else localStorage.removeItem(DEVICE_INSTALL_KEY);
  } catch {
    /* Private browsing can block storage; runtime install state still works. */
  }
}

function readHintSessionDismissed(): boolean {
  try {
    return sessionStorage.getItem(HINT_SESSION_KEY) === '1';
  } catch {
    return false;
  }
}

function manualInstallGuidance(): InstallGuidance {
  if (!window.isSecureContext) {
    const secureUrl = `https://${window.location.hostname}:${import.meta.env.VITE_DWES_HTTPS_PORT || '5173'}`;
    return {
      kind: 'insecure',
      title: 'Trusted HTTPS is required to install DWES',
      message: `On the DWES laptop, start trusted HTTPS with “npm run dev:https”, then open ${secureUrl} and use Chrome menu → Install app.`,
    };
  }

  const ua = navigator.userAgent;
  const isiPad = /iPad/.test(ua)
    || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const isiPhone = /iPhone|iPod/.test(ua);

  if (isiPad || isiPhone) {
    const device = isiPad ? 'iPad' : 'iPhone';
    return {
      kind: 'ios',
      title: `Add DWES to this ${device}`,
      message: 'Open this page in Safari, tap Share, then choose “Add to Home Screen”.',
    };
  }

  if (/Android/.test(ua)) {
    return {
      kind: 'browser',
      title: 'Install DWES on this tablet',
      message: 'Open the browser menu and choose “Install app” or “Add to Home screen”.',
    };
  }

  if (/Firefox\//.test(ua)) {
    return {
      kind: 'browser',
      title: 'Install DWES from Firefox',
      message: 'Open the browser menu and choose “Install” or “Add to Home Screen”.',
    };
  }

  return {
    kind: 'browser',
    title: 'Install DWES on this device',
    message: 'Use your browser’s Install app option if the installation prompt is unavailable.',
  };
}

/**
 * Device-local PWA action for Login. Chromium gets its user-confirmed native prompt;
 * iOS/iPadOS gets explicit Share → Add to Home Screen guidance. A local marker keeps
 * the browser-side label in sync after installation without sharing state across devices.
 */
export default function InstallAppButton() {
  const [promptEvent, setPromptEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [installing, setInstalling] = useState(false);
  const [installed, setInstalled] = useState(() => isStandalone());
  const [hintOpen, setHintOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const hintRef = useRef<HTMLDivElement>(null);
  const guidance = manualInstallGuidance();

  const dismissHint = () => {
    setHintOpen(false);
    try {
      sessionStorage.setItem(HINT_SESSION_KEY, '1');
    } catch {
      /* Private browsing can block storage. */
    }
  };

  useEffect(() => {
    if (isStandalone()) writeDeviceInstallMarker(true);

    const onPrompt = (e: Event) => {
      e.preventDefault();
      writeDeviceInstallMarker(false);
      setInstalled(false);
      setHintOpen(false);
      setPromptEvent(e as BeforeInstallPromptEvent);
    };
    const onInstalled = () => {
      writeDeviceInstallMarker(true);
      setPromptEvent(null);
      setInstalled(true);
      setHintOpen(false);
    };
    const displayMode = window.matchMedia('(display-mode: standalone)');
    const onDisplayModeChange = () => {
      if (isStandalone()) {
        writeDeviceInstallMarker(true);
        setInstalled(true);
      }
    };

    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('appinstalled', onInstalled);
    displayMode.addEventListener('change', onDisplayModeChange);
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt);
      window.removeEventListener('appinstalled', onInstalled);
      displayMode.removeEventListener('change', onDisplayModeChange);
    };
  }, []);

  useLayoutEffect(() => {
    if (!hintOpen) return;
    const hint = hintRef.current;
    const wrap = wrapRef.current;
    if (!hint || !wrap) return;

    const live = document.querySelector('.login-clock-widget')?.getBoundingClientRect();
    const panel = document.querySelector('.login-panel-right')?.getBoundingClientRect();
    const btn = wrap.querySelector('.login-install-btn')?.getBoundingClientRect();
    const wrapRect = wrap.getBoundingClientRect();

    // Prefer plan defaults: ~260px, centred under Install, 9px gap
    hint.style.width = '260px';
    hint.style.maxWidth = 'min(260px, calc(100vw - 1.5rem))';
    hint.style.left = '50%';
    hint.style.right = 'auto';
    hint.style.top = '';
    hint.style.transform = 'translateX(-50%)';
    hint.style.setProperty('--caret-nudge', '50%');

    let hr = hint.getBoundingClientRect();
    let shift = 0;
    if (panel) {
      if (hr.left < panel.left + 10) shift += (panel.left + 10) - hr.left;
      if (hr.right + shift > panel.right - 10) shift -= (hr.right + shift) - (panel.right - 10);
    }
    hint.style.transform = `translateX(calc(-50% + ${shift}px))`;
    hr = hint.getBoundingClientRect();

    // If the bubble intersects LIVE horizontally, drop just below LIVE (keeps ~260px + caret)
    if (live && hr.left < live.right && hr.right > live.left && hr.top < live.bottom) {
      hint.style.top = `${Math.round(live.bottom - wrapRect.top + 6)}px`;
      hr = hint.getBoundingClientRect();
    }

    if (btn) {
      const caretTarget = btn.left + btn.width / 2 - hr.left;
      hint.style.setProperty('--caret-nudge', `${caretTarget}px`);
    }
  }, [hintOpen]);

  useEffect(() => {
    if (!hintOpen) return;

    const onPointerDown = (event: PointerEvent) => {
      if (!wrapRef.current?.contains(event.target as Node)) {
        dismissHint();
      }
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        dismissHint();
      }
    };

    const timer = window.setTimeout(() => dismissHint(), HINT_AUTO_HIDE_MS);
    document.addEventListener('pointerdown', onPointerDown, true);
    document.addEventListener('keydown', onKeyDown, true);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener('pointerdown', onPointerDown, true);
      document.removeEventListener('keydown', onKeyDown, true);
    };
    // dismissHint closes over stable setters; re-run only when hint opens
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hintOpen]);

  const handleClick = async () => {
    if (promptEvent) {
      setInstalling(true);
      setHintOpen(false);
      try {
        await promptEvent.prompt();
        const { outcome } = await promptEvent.userChoice;
        setPromptEvent(null);
        if (outcome === 'accepted') {
          writeDeviceInstallMarker(true);
          setInstalled(true);
          setHintOpen(false);
        }
      } catch {
        setPromptEvent(null);
        setHintOpen(true);
      } finally {
        setInstalling(false);
      }
      return;
    }

    // No native prompt yet: show guidance (always responds to click)
    const dismissed = readHintSessionDismissed();
    if (hintOpen) {
      dismissHint();
      return;
    }
    if (dismissed) {
      // One explicit retry per session after dismiss — then show guidance again
      try {
        sessionStorage.removeItem(HINT_SESSION_KEY);
      } catch {
        /* ignore */
      }
    }
    setHintOpen(true);
  };

  if (installed) {
    return (
      <div className="login-install-wrap" ref={wrapRef}>
        <a
          href="/"
          className="login-install-btn login-install-btn--open login-install-btn--compact"
          title="Open DWES in this tab"
          aria-label="Open DWES app in this tab"
        >
          <InstallDesktop className="login-install-device-icon" size={16} strokeWidth={1.75} aria-hidden="true" />
          <span className="login-install-label">Open</span>
        </a>
      </div>
    );
  }

  const isiOS = guidance.kind === 'ios';
  const insecure = guidance.kind === 'insecure';
  const shortLabel = installing
    ? '…'
    : insecure
      ? 'HTTPS'
      : isiOS
        ? 'Add'
        : 'Install';
  const fullLabel = installing
    ? 'Installing…'
    : insecure
      ? 'HTTPS Required'
      : isiOS
        ? 'Add to Home Screen'
        : 'Install App';

  return (
    <div className="login-install-wrap" ref={wrapRef}>
      <button
        type="button"
        onClick={handleClick}
        disabled={installing}
        className={`login-install-btn login-install-btn--install login-install-btn--compact${isiOS ? ' login-install-btn--ios' : ''}`}
        title={insecure
          ? 'Trusted HTTPS is required before DWES can be installed as an app'
          : isiOS
            ? 'How to add DWES to your Home Screen'
            : 'Install DWES as an app on this device'}
        aria-label={installing ? 'Installing DWES app' : fullLabel}
        aria-controls="login-install-guidance"
        aria-expanded={!promptEvent ? hintOpen : undefined}
      >
        <InstallDesktop className="login-install-device-icon" size={16} strokeWidth={1.75} aria-hidden="true" />
        <span className="login-install-label">{shortLabel}</span>
      </button>
      {hintOpen && !promptEvent && (
        <div
          id="login-install-guidance"
          ref={hintRef}
          className="login-install-hint login-install-hint--guided"
          role="status"
        >
          <strong>{guidance.title}</strong>
          <p>{guidance.message}</p>
        </div>
      )}
    </div>
  );
}
