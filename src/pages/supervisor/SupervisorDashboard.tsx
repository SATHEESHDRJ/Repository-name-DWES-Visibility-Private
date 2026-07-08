import { useState } from 'react';
import {
  FolderKanban, Activity,
} from '../../components/ui/icons';
import DashboardShell from '../../components/ui/DashboardShell';
import { useAuthStore } from '../../store/useAuthStore';
import SupervisorAlertStrips from '../../components/supervisor/SupervisorAlertStrips';
import SupervisorSectionHeader from '../../components/supervisor/SupervisorSectionHeader';
import TechnicianWorkflowModal, {
  type TechnicianWorkflowSection,
} from '../../components/supervisor/TechnicianWorkflowModal';
import ProjectsTab from './tabs/ProjectsTab';
import ReviewApprovalSection from './sections/ReviewApprovalSection';

const TABS = [
  { key: 'projects', label: 'Projects', icon: <FolderKanban size={20} /> },
  { key: 'status', label: 'Status', icon: <Activity size={20} /> },
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

  return (
    <DashboardShell
      title="Production Supervisor"
      tabs={TABS}
      activeTab={tab}
      onTabChange={setTab}
      subtitle={`${user?.full_name || ''} · ${user?.employee_id || ''}`}
      badge="Supervisor Workspace"
      widthVariant="wide"
      hideTabSectionHeader
    >
      <SupervisorAlertStrips
        onNavigate={handleNavigate}
        hideChangeover={tab === 'projects'}
      />
      {tab === 'projects' && (
        <div className="dash-module dash-module--wide flex flex-col gap-4 min-w-0">
          <SupervisorSectionHeader
            title="Projects"
            description="Select one project and one panel — uploads, reports, and technician workflow target the active panel."
          />
          <ProjectsTab onOpenTechnicianWorkflow={openTechnicianWorkflow} />
        </div>
      )}
      <div className="dash-module dash-module--wide" hidden={tab !== 'status'}>
        <ReviewApprovalSection isActive={tab === 'status'} />
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
