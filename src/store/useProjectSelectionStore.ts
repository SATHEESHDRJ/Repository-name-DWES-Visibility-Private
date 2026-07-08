import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type { ProjectState } from '../types';

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
  setProjectForUser: (project: ActiveProjectContext, userId: number) => void;
  initializeForUser: (userId: number) => void;
  clearSelection: () => void;
}

export const PROJECT_SELECTION_STORAGE_KEY = 'dwes-project-selection-session';

export const useProjectSelectionStore = create<ProjectSelectionState>()(
  persist(
    (set, get) => ({
      selectedProject: null,
      ownerUserId: null,

      setProjectForUser: (project, userId) =>
        set({ selectedProject: project, ownerUserId: userId }),

      initializeForUser: (userId) => {
        const state = get();
        if (state.ownerUserId !== userId) {
          set({ selectedProject: null, ownerUserId: userId });
        }
      },

      clearSelection: () => set({ selectedProject: null, ownerUserId: null }),
    }),
    {
      name: PROJECT_SELECTION_STORAGE_KEY,
      storage: createJSONStorage(() => sessionStorage),
    },
  ),
);
