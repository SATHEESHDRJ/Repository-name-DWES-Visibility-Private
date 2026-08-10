import { useEffect, useState } from 'react';
import { DashboardIcon } from '../../components/ui/DashboardIcon';
import DashboardShell from '../../components/ui/DashboardShell';
import { useAuthStore } from '../../store/useAuthStore';
import WorkspaceSectionHeading from '../../components/ui/WorkspaceSectionHeading';
import SupervisorAlertStrips from '../../components/supervisor/SupervisorAlertStrips';
import TechnicianWorkflowModal, {
  type TechnicianWorkflowSection,
} from '../../components/supervisor/TechnicianWorkflowModal';
import LiveTbSupervisorPanel from '../../components/supervisor/LiveTbSupervisorPanel';
import ProjectsTab from './tabs/ProjectsTab';
import ReviewApprovalSection from './sections/ReviewApprovalSection';
import { onFramesChanged } from '../../utils/projectFramesEvents';
import { useProjectSelectionStore } from '../../store/useProjectSelectionStore';

const TABS = [
  {
    key: 'projects',
    label: 'Projects',
    icon: <DashboardIcon name="projects" size={20} />,
    description: 'Select one project and one panel — uploads, reports, and technician workflow target the active panel.',
  },
  { key: 'status', label: 'Status', icon: <DashboardIcon name="status" size={20} /> },
  { key: 'live-tb', label: 'LIVE TB', icon: <DashboardIcon name="status" size={20} /> },
];

interface WorkflowState {
  section?: TechnicianWorkflowSection;
  projectCode: string;
  panelId: string;
  projectName: string;
  panelName: string;
  cableCount?: number;
}

export default function SupervisorDashboard() {
  const { user } = useAuthStore();
  const [tab, setTab] = useState('projects');
  const [workflow, setWorkflow] = useState<WorkflowState | null>(null);
  const selectedProject = useProjectSelectionStore(s => s.selectedProject);
  const selectedPanelByProject = useProjectSelectionStore(s => s.selectedPanelByProject);
  const liveTbProjectCode = selectedProject?.code || '';
  const liveTbFrameId = liveTbProjectCode
    ? (selectedPanelByProject[liveTbProjectCode] || '')
    : '';

  const handleNavigate = (nextTab: string) => {
    setTab(nextTab);
  };

  const openTechnicianWorkflow = (opts: WorkflowState) => {
    if (!opts.projectCode || !opts.panelId) {
      setTab('projects');
      return;
    }
    setWorkflow(opts);
  };

  useEffect(() => onFramesChanged(detail => {
    if (detail.action !== 'deleted' || !workflow) return;
    if (workflow.projectCode === detail.projectCode
      && (!detail.frameId || workflow.panelId === detail.frameId)) {
      setWorkflow(null);
    }
  }), [workflow]);

  return (
    <DashboardShell
      title="Production Supervisor"
      tabs={TABS}
      activeTab={tab}
      onTabChange={handleNavigate}
      subtitle={`${user?.full_name || ''} · ${user?.employee_id || ''}`}
      badge="Supervisor Workspace"
      widthVariant="wide"
      hideTabSectionHeader
    >
      <SupervisorAlertStrips onNavigate={handleNavigate} />
      {tab === 'projects' && (
        <div className="dash-module dash-module--wide flex flex-col gap-4 min-w-0">
          <WorkspaceSectionHeading
            title="Projects"
            subtitle="Select one project and one panel — uploads, reports, and technician workflow target the active panel."
            icon={<DashboardIcon name="projects" size={16} />}
          />
          <ProjectsTab onOpenTechnicianWorkflow={openTechnicianWorkflow} />
        </div>
      )}
      <div className="dash-module dash-module--wide" hidden={tab !== 'status'}>
        <ReviewApprovalSection isActive={tab === 'status'} />
      </div>
      <div className="dash-module dash-module--wide" hidden={tab !== 'live-tb'}>
        <WorkspaceSectionHeading
          title="LIVE TB"
          subtitle="Panel analysis status, Supervisor verification, Retry Analysis, and debug export."
          icon={<DashboardIcon name="status" size={16} />}
        />
        <LiveTbSupervisorPanel
          projectCode={liveTbProjectCode}
          frameId={liveTbFrameId}
          panelName={liveTbFrameId}
        />
      </div>

      {workflow && (
        <TechnicianWorkflowModal
          onClose={() => setWorkflow(null)}
          initialSection={workflow.section ?? 'assign'}
          projectCode={workflow.projectCode}
          panelId={workflow.panelId}
          projectName={workflow.projectName}
          panelName={workflow.panelName}
          cableCount={workflow.cableCount}
        />
      )}
    </DashboardShell>
  );
}
