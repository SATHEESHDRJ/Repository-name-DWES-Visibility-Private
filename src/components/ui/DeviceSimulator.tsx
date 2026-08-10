import type { ReactNode } from 'react';

/** Full-viewport app wrapper — no device frame / letterboxing; page scrolls naturally. */
export function DeviceSimulator({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-col flex-1 w-full min-w-0 min-h-dvh bg-background text-primary font-sans">
      {children}
    </div>
  );
}
