import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type { ProjectState } from '../types';
import { rememberSelectedPanel, type SelectedPanelByProject } from '../utils/panelSelection';

export interface ActiveProjectContext {
  code: string;
  name: string;
  client: string;
  project_state: ProjectState;
  is_active: boolean;
}

interface ProjectSelectionState {
  selectedProject: ActiveProjectContext | null;
  ownerUserId: number | null;
  /**
   * Panel the supervisor last selected, keyed by project code. Kept in the session
   * store (outside the React tree) so it survives the Status workspace remounting on
   * tab changes. Ids only — no sensitive data. Scoped to `ownerUserId`; reset when a
   * different user takes ownership of the session.
   */
  selectedPanelByProject: SelectedPanelByProject;
  setProjectForUser: (project: ActiveProjectContext, userId: number) => void;
  setSelectedPanelForProject: (projectCode: string, panelId: string) => void;
  initializeForUser: (userId: number) => void;
  clearProjectForUser: (userId: number) => void;
  clearSelection: () => void;
}

export const PROJECT_SELECTION_STORAGE_KEY = 'dwes-project-selection-session';

export const useProjectSelectionStore = create<ProjectSelectionState>()(
  persist(
    (set, get) => ({
      selectedProject: null,
      ownerUserId: null,
      selectedPanelByProject: {},

      setProjectForUser: (project, userId) =>
        set({ selectedProject: project, ownerUserId: userId }),

      setSelectedPanelForProject: (projectCode, panelId) =>
        set(state => ({
          selectedPanelByProject: rememberSelectedPanel(state.selectedPanelByProject, projectCode, panelId),
        })),

      initializeForUser: (userId) => {
        const state = get();
        if (state.ownerUserId !== userId) {
          // A different signed-in user must never inherit the previous user's
          // project or remembered panels.
          set({ selectedProject: null, ownerUserId: userId, selectedPanelByProject: {} });
        }
      },

      clearProjectForUser: (userId) =>
        set({ selectedProject: null, ownerUserId: userId }),

      clearSelection: () => set({ selectedProject: null, ownerUserId: null, selectedPanelByProject: {} }),
    }),
    {
      name: PROJECT_SELECTION_STORAGE_KEY,
      storage: createJSONStorage(() => sessionStorage),
    },
  ),
);
