import { useEffect, useState } from 'react';
import { InstallDesktop } from './ui/icons';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

/** True while DWES runs as an installed app rather than a browser tab. */
function isStandalone(): boolean {
  return window.matchMedia('(display-mode: standalone)').matches
    || (navigator as { standalone?: boolean }).standalone === true;
}

/** Browsers that never fire `beforeinstallprompt` but can still install from the share menu. */
function manualInstallHint(): string | null {
  const ua = navigator.userAgent;
  const iOS = /iPad|iPhone|iPod/.test(ua)
    || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  if (iOS) return 'On iPad / iPhone: tap Share, then "Add to Home Screen" to install DWES.';
  if (/Firefox\//.test(ua)) return 'In Firefox: open the browser menu, then "Install" or "Add to Home Screen".';
  return null;
}

/**
 * "Install app" action for the login page. DWES installs as a Progressive Web App so it
 * opens standalone instead of as a browser page. Rendered only when installation is
 * supported and the app is not already installed.
 */
export default function InstallAppButton() {
  const [promptEvent, setPromptEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [installing, setInstalling] = useState(false);
  const [installed, setInstalled] = useState(() => isStandalone());
  const [hintOpen, setHintOpen] = useState(false);
  const hint = manualInstallHint();

  useEffect(() => {
    if (isStandalone()) return;

    const onPrompt = (e: Event) => {
      e.preventDefault();
      setPromptEvent(e as BeforeInstallPromptEvent);
    };
    const onInstalled = () => {
      setPromptEvent(null);
      setInstalled(true);
    };

    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  // Already installed, or a browser that offers no install path at all.
  if (installed || (!promptEvent && !hint)) return null;

  const handleClick = async () => {
    if (!promptEvent) {
      setHintOpen(open => !open);
      return;
    }
    setInstalling(true);
    try {
      await promptEvent.prompt();
      const { outcome } = await promptEvent.userChoice;
      if (outcome === 'accepted') setPromptEvent(null);
    } finally {
      setInstalling(false);
    }
  };

  return (
    <div className="login-install-wrap">
      <button
        type="button"
        onClick={handleClick}
        disabled={installing}
        className="login-install-btn"
        title="Install DWES so it opens as a standalone app"
        aria-label={installing ? 'Installing DWES app' : 'Install DWES app'}
        aria-expanded={hint && !promptEvent ? hintOpen : undefined}
      >
        <InstallDesktop size={16} strokeWidth={1.5} aria-hidden="true" />
        <span className="login-install-label">{installing ? 'Installing…' : 'Install app'}</span>
      </button>
      {hintOpen && hint && !promptEvent && (
        <p className="login-install-hint" role="status">{hint}</p>
      )}
    </div>
  );
}
