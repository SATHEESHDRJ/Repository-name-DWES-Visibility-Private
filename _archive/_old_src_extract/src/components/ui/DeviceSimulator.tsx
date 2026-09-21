import React, { useEffect, useState } from 'react';
import { useUIStore } from '../../store/useUIStore';
import type { DeviceProfile } from '../../store/useUIStore';

const PROFILES: Record<Exclude<DeviceProfile, 'auto'>, { width: number; height: number; name: string }> = {
  '10.1': { width: 1280, height: 800, name: '10.1" Tablet' },
  '10.9': { width: 1180, height: 820, name: '10.9" Tablet' },
  '11.0': { width: 1194, height: 834, name: '11.0" Tablet' },
  '12.4': { width: 1400, height: 875, name: '12.4" Tablet' },
  'desktop': { width: 1920, height: 1080, name: 'Desktop' }
};

export function DeviceSimulator({ children }: { children: React.ReactNode }) {
  const { deviceProfile } = useUIStore();
  const [scale, setScale] = useState(1);

  useEffect(() => {
    if (deviceProfile === 'auto') {
      setScale(1);
      return;
    }

    const target = PROFILES[deviceProfile as keyof typeof PROFILES];
    if (!target) return;

    const calculateScale = () => {
      const scaleX = window.innerWidth / target.width;
      const scaleY = window.innerHeight / target.height;
      // Fit within window, max scale 1 (don't scale up past 100%)
      setScale(Math.min(scaleX, scaleY, 1));
    };

    calculateScale();
    window.addEventListener('resize', calculateScale);
    return () => window.removeEventListener('resize', calculateScale);
  }, [deviceProfile]);

  if (deviceProfile === 'auto') {
    return <div className="w-full h-screen overflow-hidden bg-background text-slate-800 font-sans">{children}</div>;
  }

  const target = PROFILES[deviceProfile as keyof typeof PROFILES];

  return (
    <div className="w-full h-screen bg-slate-900 flex items-center justify-center overflow-hidden font-sans">
      <div 
        className="bg-background shadow-2xl relative overflow-hidden ring-1 ring-white/10"
        style={{
          width: target.width,
          height: target.height,
          transform: `scale(${scale})`,
          transformOrigin: 'center center',
          transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)'
        }}
      >
        {children}
      </div>
    </div>
  );
}
