import { useEffect, useState } from 'react';
import { InstallDesktop } from './ui/icons';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

/**
 * "Install app" button shown only when the browser offers PWA installation
 * (Chrome / Edge fire `beforeinstallprompt`). Hidden once installed or when
 * already running as an installed app (standalone display mode).
 */
export default function InstallAppButton() {
  const [promptEvent, setPromptEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [installing, setInstalling] = useState(false);

  useEffect(() => {
    if (window.matchMedia('(display-mode: standalone)').matches) return;

    const onPrompt = (e: Event) => {
      e.preventDefault();
      setPromptEvent(e as BeforeInstallPromptEvent);
    };
    const onInstalled = () => setPromptEvent(null);

    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  if (!promptEvent) return null;

  const handleInstall = async () => {
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
    <button
      type="button"
      onClick={handleInstall}
      disabled={installing}
      title="Install DWES as a desktop app for quick access"
      className="inline-flex items-center gap-2 self-start rounded-2xl border border-[var(--t-border-strong,rgba(15,23,42,0.14))] bg-[var(--t-card,#ffffff)] px-3.5 py-2.5 text-[13px] font-semibold text-[var(--t-text,#0F172A)] shadow-sm transition-opacity hover:opacity-80 disabled:opacity-50"
    >
      <InstallDesktop size={16} strokeWidth={1.5} aria-hidden="true" />
      <span>Install app</span>
    </button>
  );
}
