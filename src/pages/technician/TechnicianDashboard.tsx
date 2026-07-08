import { useCallback, useEffect, useState } from 'react';
import { Zap } from '../../components/ui/icons';
import DashboardShell from '../../components/ui/DashboardShell';
import { techApi } from '../../services/api';
import { useLiveWiringStore } from '../../store/useLiveWiringStore';
import { useReadOnlyPoll } from '../../hooks/useReadOnlyPoll';
import { onFramesChanged } from '../../utils/projectFramesEvents';
import PanelsTab from './tabs/PanelsTab';
import WiringTab from './tabs/WiringTab';

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

  const loadPanels = useCallback(() => {
    techApi.myPanels().then(data => {
      setPanels(data);
      setPanelsLoading(false);
      const inProgress = data.find((p: any) => p.status === 'in_progress');
      setLiveFromPanel(inProgress ?? null);
      setSelectedPanel((prev: any) => {
        if (prev) return data.find((p: any) => p.id === prev.id) ?? pickDefaultPanel(data);
        return pickDefaultPanel(data);
      });
    }).catch(() => setPanelsLoading(false));
  }, [setLiveFromPanel]);

  useEffect(() => { loadPanels(); }, [loadPanels]);

  useReadOnlyPoll(loadPanels, 4000);

  useEffect(() => {
    return onFramesChanged(() => { loadPanels(); });
  }, [loadPanels]);

  const handleSelectPanel = (panel: any) => {
    setSelectedPanel(panel);
  };

  const handleOpenDigitalWiring = (panel: any) => {
    setSelectedPanel(panel);
    setWiringOpen(true);
  };

  const handlePanelUpdate = () => {
    loadPanels();
    if (selectedPanel) {
      techApi.myAssignmentDetail(selectedPanel.id).then(data => {
        setSelectedPanel((prev: any) => prev ? { ...prev, ...data.assignment } : prev);
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
          <WiringTab
            panel={selectedLive}
            onPanelUpdate={handlePanelUpdate}
            onExit={handleExitWiring}
          />
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
