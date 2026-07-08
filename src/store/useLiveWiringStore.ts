import { create } from 'zustand';

interface LiveWiringState {
  live: boolean;
  projectName: string | null;
  projectCode: string | null;
  panelName: string | null;
  setFromPanel: (panel: {
    status: string;
    project_name?: string;
    project_code: string;
    panel_name: string;
  } | null) => void;
  clear: () => void;
}

/** Shared live-wiring flag — top bar + dashboard header read `status === 'in_progress'`. */
export const useLiveWiringStore = create<LiveWiringState>((set) => ({
  live: false,
  projectName: null,
  projectCode: null,
  panelName: null,
  setFromPanel: (panel) => {
    if (!panel || panel.status !== 'in_progress') {
      set({ live: false, projectName: null, projectCode: null, panelName: null });
      return;
    }
    set({
      live: true,
      projectName: panel.project_name || null,
      projectCode: panel.project_code,
      panelName: panel.panel_name,
    });
  },
  clear: () => set({ live: false, projectName: null, projectCode: null, panelName: null }),
}));
