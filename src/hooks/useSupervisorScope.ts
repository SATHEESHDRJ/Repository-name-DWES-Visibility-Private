import { useCallback, useEffect, useState } from 'react';
import { projectsApi, usersApi } from '../services/api';
import type { Project } from '../types';
import type { FramePanel } from '../components/assignment/ProjectPanelSelect';
import { isVerifiedFrame } from '../components/assignment/frameUtils';
import { useLatestRequest } from './useLatestRequest';
import { useDwesRefresh, type RefreshOptions } from './useDwesRefresh';
import { onFramesChanged } from '../utils/projectFramesEvents';

export function useSupervisorScope() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProjectCode, setSelectedProjectCode] = useState('');
  const [selectedPanelId, setSelectedPanelId] = useState('');
  const [loadedPanels, setLoadedPanels] = useState<FramePanel[]>([]);
  const [technicians, setTechnicians] = useState<any[]>([]);
  const [selectedTechId, setSelectedTechId] = useState('');
  const [panelsRefreshKey, setPanelsRefreshKey] = useState(0);
  const projectRequests = useLatestRequest();

  const loadProjects = useCallback(async (options?: RefreshOptions) => {
    const silent = options?.silent === true;
    const request = projectRequests.begin();
    if (!silent) setProjects([]);
    try {
      const rows = await projectsApi.list(request.signal) as Project[];
      if (!projectRequests.isLatest(request.id)) return;
      setProjects(rows);
      setSelectedProjectCode(current => rows.some(project => project.code === current)
        ? current
        : (rows[0]?.code ?? ''));
    } catch { /* an unverified prior list must stay hidden */ }
  }, [projectRequests]);

  useEffect(() => {
    void loadProjects();
    usersApi.technicians().then(setTechnicians).catch(() => {});
  }, [loadProjects]);

  useDwesRefresh(loadProjects);

  useEffect(() => onFramesChanged(detail => {
    if (detail.action !== 'deleted') return;
    if (!detail.frameId) {
      setProjects(current => current.filter(project => project.code !== detail.projectCode));
      setSelectedProjectCode(current => current === detail.projectCode ? '' : current);
    } else if (selectedProjectCode === detail.projectCode) {
      setLoadedPanels(current => current.filter(panel => panel.id !== detail.frameId));
      setSelectedPanelId(current => current === detail.frameId ? '' : current);
    }
  }), [selectedProjectCode]);

  const handleProjectChange = useCallback((code: string) => {
    setSelectedProjectCode(code);
    setSelectedPanelId('');
    setSelectedTechId('');
  }, []);

  const handlePanelChange = useCallback((panelId: string) => {
    setSelectedPanelId(panelId);
    setSelectedTechId('');
  }, []);

  const selectedTech = technicians.find(t => String(t.id) === selectedTechId);
  const selectedPanel = loadedPanels.find(p => p.id === selectedPanelId);
  const selectedPanelVerified = isVerifiedFrame(selectedPanel);
  const techSelectDisabled = !selectedProjectCode || !selectedPanelId;
  const canAssign = Boolean(selectedProjectCode && selectedPanelId);

  const bumpPanelsRefresh = useCallback(() => setPanelsRefreshKey(k => k + 1), []);

  return {
    projects,
    selectedProjectCode,
    selectedPanelId,
    loadedPanels,
    technicians,
    selectedTechId,
    setSelectedTechId,
    panelsRefreshKey,
    handleProjectChange,
    handlePanelChange,
    setLoadedPanels,
    selectedTech,
    selectedPanel,
    selectedPanelVerified,
    techSelectDisabled,
    canAssign,
    bumpPanelsRefresh,
  };
}
