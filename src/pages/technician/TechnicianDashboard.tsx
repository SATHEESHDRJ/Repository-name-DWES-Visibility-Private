import { useCallback, useEffect, useRef, useState } from 'react';
import { Zap } from '../../components/ui/icons';
import DashboardShell from '../../components/ui/DashboardShell';
import { techApi } from '../../services/api';
import { useLiveWiringStore } from '../../store/useLiveWiringStore';
import { useDwesRefresh } from '../../hooks/useDwesRefresh';
import PanelsTab from './tabs/PanelsTab';
import WiringTab from './tabs/WiringTab';
import { useLatestRequest } from '../../hooks/useLatestRequest';
import { onFramesChanged } from '../../utils/projectFramesEvents';

function pickDefaultPanel(panels: any[]) {
  const inProgress = panels.find(p => p.status === 'in_progress');
  if (inProgress) return inProgress;
  return [...panels].sort((a, b) => {
    const ta = a.assigned_at ? new Date(a.assigned_at).getTime() : 0;
    const tb = b.assigned_at ? new Date(b.assigned_at).getTime() : 0;
    return tb - ta;
  })[0] ?? null;
}

export default function TechnicianDashboard() {
  const setLiveFromPanel = useLiveWiringStore(s => s.setFromPanel);
  const [panels, setPanels] = useState<any[]>([]);
  const [panelsLoading, setPanelsLoading] = useState(true);
  const [selectedPanel, setSelectedPanel] = useState<any>(null);
  const [wiringOpen, setWiringOpen] = useState(false);
  const selectedPanelRef = useRef<any>(null);
  const panelRequests = useLatestRequest();
  const detailRequests = useLatestRequest();

  useEffect(() => { selectedPanelRef.current = selectedPanel; }, [selectedPanel]);

  const loadPanels = useCallback(async () => {
    const request = panelRequests.begin();
    setPanelsLoading(true);
    setPanels([]);
    try {
      const data = await techApi.myPanels(request.signal);
      if (!panelRequests.isLatest(request.id)) return;
      setPanels(data);
      const inProgress = data.find((p: any) => p.status === 'in_progress');
      setLiveFromPanel(inProgress ?? null);
      const previous = selectedPanelRef.current;
      const stillAssigned = previous ? data.find((panel: any) => panel.id === previous.id) : null;
      if (previous && !stillAssigned) setWiringOpen(false);
      const next = stillAssigned ?? pickDefaultPanel(data);
      selectedPanelRef.current = next;
      setSelectedPanel(next);
    } catch (error: any) {
      if (error?.code === 'ERR_CANCELED' || !panelRequests.isLatest(request.id)) return;
      setPanels([]);
      setSelectedPanel(null);
      selectedPanelRef.current = null;
      setWiringOpen(false);
      setLiveFromPanel(null);
    } finally {
      if (panelRequests.isLatest(request.id)) setPanelsLoading(false);
    }
  }, [panelRequests, setLiveFromPanel]);

  useEffect(() => { loadPanels(); }, [loadPanels]);

  useDwesRefresh(loadPanels);

  useEffect(() => onFramesChanged(detail => {
    if (detail.action !== 'deleted') return;
    panelRequests.cancel();
    detailRequests.cancel();
    setPanels(current => current.filter(panel => (
      panel.project_code !== detail.projectCode
      || (!!detail.frameId && panel.frame_id !== detail.frameId)
    )));
    const selected = selectedPanelRef.current;
    if (selected?.project_code === detail.projectCode
      && (!detail.frameId || selected.frame_id === detail.frameId)) {
      selectedPanelRef.current = null;
      setSelectedPanel(null);
      setWiringOpen(false);
      setLiveFromPanel(null);
    }
  }), [detailRequests, panelRequests, setLiveFromPanel]);

  useEffect(() => {
    if (!wiringOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [wiringOpen]);

  const handleSelectPanel = (panel: any) => {
    selectedPanelRef.current = panel;
    setSelectedPanel(panel);
  };

  const handleOpenDigitalWiring = (panel: any) => {
    selectedPanelRef.current = panel;
    setSelectedPanel(panel);
    setWiringOpen(true);
  };

  const handlePanelUpdate = () => {
    void loadPanels();
    const selected = selectedPanelRef.current;
    if (selected) {
      const request = detailRequests.begin();
      techApi.myAssignmentDetail(selected.id, request.signal).then(data => {
        if (!detailRequests.isLatest(request.id)) return;
        const current = selectedPanelRef.current;
        if (!current || current.id !== selected.id) return;
        const next = { ...current, ...data.assignment };
        selectedPanelRef.current = next;
        setSelectedPanel(next);
      }).catch(() => {});
    }
  };

  const handleExitWiring = () => {
    setWiringOpen(false);
    loadPanels();
  };

  const selectedLive = selectedPanel
    ? { ...(panels.find(p => p.id === selectedPanel.id) ?? {}), ...selectedPanel }
    : null;

  const isLive = selectedLive?.status === 'in_progress';

  return (
    <DashboardShell
      title="Technician Dashboard"
      subtitle="Panel wiring, progress tracking, and digital frame execution"
      tabs={[{ key: 'panels', label: 'Panels', icon: <Zap size={20} /> }]}
      activeTab="panels"
      badge="Wiring Technician"
      widthVariant="wide"
      hideTabSectionHeader
      heroClassName="dashboard-hero--technician"
      heroLive={isLive}
    >
      <section className="dash-module dash-module--wide tech-dash-module">
        {wiringOpen && selectedLive ? (
          <div className="tech-wiring-shell" aria-live="polite">
            <WiringTab
              panel={selectedLive}
              onPanelUpdate={handlePanelUpdate}
              onExit={handleExitWiring}
            />
          </div>
        ) : (
          <PanelsTab
            panels={panels}
            loading={panelsLoading}
            onRefresh={loadPanels}
            selectedPanel={selectedLive}
            onSelectPanel={handleSelectPanel}
            onOpenDigitalWiring={handleOpenDigitalWiring}
          />
        )}
      </section>
    </DashboardShell>
  );
}
