import { useCallback, useEffect, useState } from 'react';

function getFullscreenElement(): Element | null {
  return document.fullscreenElement
    ?? (document as Document & { webkitFullscreenElement?: Element }).webkitFullscreenElement
    ?? null;
}

function isStandaloneDisplay(): boolean {
  return window.matchMedia('(display-mode: standalone)').matches
    || (navigator as { standalone?: boolean }).standalone === true;
}

export function browserFullscreenSupported(): boolean {
  if (isStandaloneDisplay()) return false;
  const el = document.documentElement as HTMLElement & {
    requestFullscreen?: () => Promise<void>;
    webkitRequestFullscreen?: () => Promise<void>;
  };
  return typeof el.requestFullscreen === 'function'
    || typeof el.webkitRequestFullscreen === 'function';
}

/** Browser tab full screen   hides address bar / browser chrome (user gesture required). */
export function useBrowserFullscreen() {
  const [active, setActive] = useState(() => Boolean(getFullscreenElement()));

  useEffect(() => {
    const sync = () => setActive(Boolean(getFullscreenElement()));
    document.addEventListener('fullscreenchange', sync);
    document.addEventListener('webkitfullscreenchange', sync);
    return () => {
      document.removeEventListener('fullscreenchange', sync);
      document.removeEventListener('webkitfullscreenchange', sync);
    };
  }, []);

  const enter = useCallback(async () => {
    const el = document.documentElement as HTMLElement & {
      requestFullscreen?: () => Promise<void>;
      webkitRequestFullscreen?: () => Promise<void>;
    };
    if (typeof el.requestFullscreen === 'function') {
      await el.requestFullscreen();
      return;
    }
    if (typeof el.webkitRequestFullscreen === 'function') {
      el.webkitRequestFullscreen();
    }
  }, []);

  const exit = useCallback(async () => {
    if (typeof document.exitFullscreen === 'function') {
      await document.exitFullscreen();
      return;
    }
    const doc = document as Document & { webkitExitFullscreen?: () => void };
    doc.webkitExitFullscreen?.();
  }, []);

  const toggle = useCallback(async () => {
    if (getFullscreenElement()) await exit();
    else await enter();
  }, [enter, exit]);

  return {
    active,
    supported: browserFullscreenSupported(),
    standalone: isStandaloneDisplay(),
    enter,
    exit,
    toggle,
  };
}
