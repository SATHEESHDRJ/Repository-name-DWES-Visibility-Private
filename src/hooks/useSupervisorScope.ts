import { useCallback, useEffect, useState } from 'react';
import { projectsApi, usersApi } from '../services/api';
import type { Project } from '../types';
import type { FramePanel } from '../components/assignment/ProjectPanelSelect';
import { isVerifiedFrame } from '../components/assignment/frameUtils';

export function useSupervisorScope() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProjectCode, setSelectedProjectCode] = useState('');
  const [selectedPanelId, setSelectedPanelId] = useState('');
  const [loadedPanels, setLoadedPanels] = useState<FramePanel[]>([]);
  const [technicians, setTechnicians] = useState<any[]>([]);
  const [selectedTechId, setSelectedTechId] = useState('');
  const [panelsRefreshKey, setPanelsRefreshKey] = useState(0);

  useEffect(() => {
    projectsApi.list().then(setProjects).catch(() => {});
    usersApi.technicians().then(setTechnicians).catch(() => {});
  }, []);

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
