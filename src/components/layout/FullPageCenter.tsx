import type { ReactNode } from 'react';

interface FullPageCenterProps {
  children: ReactNode;
}

export function FullPageCenter({ children }: FullPageCenterProps) {
  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      {children}
    </div>
  );
}