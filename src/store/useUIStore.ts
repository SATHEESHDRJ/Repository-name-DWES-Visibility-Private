import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type DeviceProfile = 'auto' | '10.1' | '10.9' | '11.0' | '12.4' | 'desktop';

interface UIState {
  deviceProfile: DeviceProfile;
  setDeviceProfile: (profile: DeviceProfile) => void;
  sidebarExpanded: boolean;
  setSidebarExpanded: (expanded: boolean) => void;
  toggleSidebar: () => void;
}

export const useUIStore = create<UIState>()(
  persist(
    (set) => ({
      deviceProfile: 'auto',
      setDeviceProfile: (profile) => set({ deviceProfile: profile }),
      sidebarExpanded: true,
      setSidebarExpanded: (expanded) => set({ sidebarExpanded: expanded }),
      toggleSidebar: () => set((state) => ({ sidebarExpanded: !state.sidebarExpanded })),
    }),
    {
      name: 'dwes-ui-storage',
    }
  )
);
