import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type DeviceProfile = 'auto' | '10.1' | '10.9' | '11.0' | '12.4' | 'desktop';

interface UIState {
  deviceProfile: DeviceProfile;
  setDeviceProfile: (profile: DeviceProfile) => void;
  sidebarExpanded: boolean;
  /** When true, sidebar stays expanded until unpinned (all role dashboards). */
  sidebarPinned: boolean;
  setSidebarExpanded: (expanded: boolean) => void;
  setSidebarPinned: (pinned: boolean) => void;
  toggleSidebar: () => void;
  toggleSidebarPin: () => void;
}

export const useUIStore = create<UIState>()(
  persist(
    (set, get) => ({
      deviceProfile: 'auto',
      setDeviceProfile: (profile) => set({ deviceProfile: profile }),
      sidebarExpanded: true,
      sidebarPinned: false,
      setSidebarExpanded: (expanded) => {
        if (!expanded && get().sidebarPinned) {
          set({ sidebarPinned: false, sidebarExpanded: false });
          return;
        }
        set({ sidebarExpanded: expanded });
      },
      setSidebarPinned: (pinned) => set(
        pinned
          ? { sidebarPinned: true, sidebarExpanded: true }
          : { sidebarPinned: false },
      ),
      toggleSidebar: () => {
        const { sidebarPinned, sidebarExpanded } = get();
        if (sidebarPinned) {
          set({ sidebarPinned: false, sidebarExpanded: false });
          return;
        }
        set({ sidebarExpanded: !sidebarExpanded });
      },
      toggleSidebarPin: () => {
        const { sidebarPinned } = get();
        if (sidebarPinned) {
          set({ sidebarPinned: false });
          return;
        }
        set({ sidebarPinned: true, sidebarExpanded: true });
      },
    }),
    {
      name: 'dwes-ui-storage',
      // Older persisted blobs lacked sidebarPinned — always merge defaults.
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<UIState>;
        return {
          ...current,
          ...p,
          sidebarExpanded: typeof p.sidebarExpanded === 'boolean' ? p.sidebarExpanded : current.sidebarExpanded,
          sidebarPinned: typeof p.sidebarPinned === 'boolean' ? p.sidebarPinned : false,
          deviceProfile: p.deviceProfile ?? current.deviceProfile,
        };
      },
    },
  ),
);
