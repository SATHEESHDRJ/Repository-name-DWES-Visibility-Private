import { useCallback, useEffect, useState } from 'react';
import { Boxes, ClipboardList, Cuboid, Wrench } from 'lucide-react';
import DashboardShell from '../../components/ui/DashboardShell';
import { techApi } from '../../services/api';
import { useAuthStore } from '../../store/useAuthStore';
import PanelView3D from './tabs/PanelView3D';
import PanelsTab from './tabs/PanelsTab';
import ReportTab from './tabs/ReportTab';
import WiringTab from './tabs/WiringTab';

const TABS = [
  { key: 'assigned_projects', label: 'Assigned Projects', icon: <Boxes size={18} /> },
  { key: 'wiring_workspace', label: 'Wiring Workspace', icon: <Wrench size={18} /> },
];

type WorkspaceTab = 'wiring' | 'view3d' | 'report';

export default function TechnicianDashboard() {
  const { user } = useAuthStore();
  const [tab, setTab] = useState('assigned_projects');
  const [workspaceTab, setWorkspaceTab] = useState<WorkspaceTab>('wiring');
  const [panels, setPanels] = useState<any[]>([]);
  const [activePanel, setActivePanel] = useState<any>(null);
  const [panelDetail, setPanelDetail] = useState<any>(null);

  const loadPanels = useCallback(() => {
    techApi.myPanels().then(data => {
      setPanels(data);
      const inProgressPanel = data.find((p: any) => p.status === 'in_progress');
      if (inProgressPanel && (!activePanel || activePanel.id !== inProgressPanel.id)) {
        setActivePanel(inProgressPanel);
      }
    }).catch(() => {});
  }, [activePanel]);

  useEffect(() => {
    loadPanels();
  }, [loadPanels]);

  useEffect(() => {
    if (!activePanel) {
      setPanelDetail(null);
      return;
    }
    techApi.myAssignmentDetail(activePanel.id)
      .then(setPanelDetail)
      .catch(() => setPanelDetail(null));
  }, [activePanel, activePanel?.id]);

  const handleSelectPanel = (panel: any) => {
    setActivePanel(panel);
    setTab('wiring_workspace');
    setWorkspaceTab('wiring');
  };

  const handlePanelUpdate = () => {
    loadPanels();
    if (activePanel) {
      techApi.myAssignmentDetail(activePanel.id).then(data => {
        setPanelDetail(data);
        setActivePanel((previous: any) => previous ? { ...previous, ...data.assignment } : previous);
      }).catch(() => {});
    }
  };

  const stats = {
    assigned: panels.filter(panel => panel.status === 'assigned').length,
    inProgress: panels.filter(panel => panel.status === 'in_progress').length,
    done: panels.filter(panel => panel.status === 'completed').length,
  };

  const cableStatus: Record<string, { src: boolean; dst: boolean }> = {};
  if (panelDetail?.assignment?.cable_status) {
    Object.entries(panelDetail.assignment.cable_status).forEach(([key, value]: [string, any]) => {
      cableStatus[key] = { src: value.src, dst: value.dst };
    });
  }

  const cables3d = panelDetail?.frame?.cables || [];
  const activePanelLive = panels.find(panel => panel.id === activePanel?.id) || activePanel;

  return (
    <DashboardShell
      title="Tablet-first Cable Execution"
      tabs={TABS}
      activeTab={tab}
      onTabChange={setTab}
        subtitle={`${user?.full_name || ''} · ${user?.employee_id || ''}${activePanelLive ? ` · Active Panel: ${activePanelLive.panel_name}` : ''}`}
        badge="Wiring Technician"
        kpis={[
          { label: 'Assigned', value: stats.assigned, color: 'var(--status-pending)' },
          { label: 'In Progress', value: stats.inProgress, color: 'var(--status-progress)' },
          { label: 'Completed', value: stats.done, color: 'var(--status-completed)' },
        ]}
      >
        <section className="tech-workspace tech-workspace-reset">
          {tab === 'assigned_projects' && (
            <PanelsTab
              onSelectPanel={handleSelectPanel}
              activePanel={activePanelLive}
            />
          )}

          {tab === 'wiring_workspace' && (
            <>
              <div className="table-toolbar mb-md">
                <button className={`button-compact ${workspaceTab === 'wiring' ? 'is-active' : ''}`} onClick={() => setWorkspaceTab('wiring')} type="button">
                  <Wrench size={16} />
                  <span>Wiring</span>
                </button>
                <button className={`button-compact ${workspaceTab === 'view3d' ? 'is-active' : ''}`} onClick={() => setWorkspaceTab('view3d')} type="button">
                  <Cuboid size={16} />
                  <span>3D View</span>
                </button>
                <button className={`button-compact ${workspaceTab === 'report' ? 'is-active' : ''}`} onClick={() => setWorkspaceTab('report')} type="button">
                  <ClipboardList size={16} />
                  <span>Report</span>
                </button>
              </div>

              {workspaceTab === 'wiring' && (
                <WiringTab
                  panel={activePanelLive}
                  onPanelUpdate={handlePanelUpdate}
                />
              )}

              {workspaceTab === 'view3d' && (
                activePanelLive ? (
                  <PanelView3D
                    cables={cables3d}
                    cableStatus={cableStatus}
                    panelName={activePanelLive.panel_name}
                  />
                ) : (
                  <div className="dwes-empty-state">
                    <div className="dwes-empty-title">No panel selected</div>
                    <div className="dwes-empty-copy">
                      Open a panel from Assigned Projects to inspect its 3D layout.
                    </div>
                  </div>
                )
              )}

              {workspaceTab === 'report' && (
                <ReportTab
                  panel={activePanelLive}
                  onPanelUpdate={handlePanelUpdate}
                />
              )}
            </>
          )}
        </section>
    </DashboardShell>
  );
}
