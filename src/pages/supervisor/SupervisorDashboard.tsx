import { useState } from 'react';
import {
  FolderKanban, Users, ArrowLeftRight, ClipboardCheck, LayoutGrid,
} from '../../components/ui/icons';
import DashboardShell from '../../components/ui/DashboardShell';
import SupervisorAlertStrips from '../../components/supervisor/SupervisorAlertStrips';
import SupervisorSectionHeader from '../../components/supervisor/SupervisorSectionHeader';
import ProjectsTab from './tabs/ProjectsTab';
import AssignmentSection from './sections/AssignmentSection';
import MidChangeoverSection from './sections/MidChangeoverSection';
import ReviewApprovalSection from './sections/ReviewApprovalSection';
import PanelStatusSection from './sections/PanelStatusSection';

const TABS = [
  { key: 'projects', label: 'Projects', icon: <FolderKanban size={20} /> },
  { key: 'assignment', label: 'Assignments', icon: <Users size={20} /> },
  { key: 'changeover', label: 'Mid-Changeover', icon: <ArrowLeftRight size={20} /> },
  { key: 'review', label: 'Review & Approval', icon: <ClipboardCheck size={20} /> },
  { key: 'panel-status', label: 'Overall Panel Status', icon: <LayoutGrid size={20} /> },
];

export default function SupervisorDashboard() {
  const [tab, setTab] = useState('projects');

  const handleNavigate = (nextTab: string) => {
    setTab(nextTab);
  };

  return (
    <DashboardShell
      title="Production Supervisor"
      tabs={TABS}
      activeTab={tab}
      onTabChange={setTab}
      subtitle="Projects, assignments, changeover, review, and panel status — five focused workspace sections."
      badge="Supervisor Workspace"
      widthVariant="wide"
      hideTabSectionHeader
      heroClassName="dashboard-hero--supervisor"
    >
      <SupervisorAlertStrips onNavigate={handleNavigate} hideChangeover={tab === 'projects'} />
      {tab === 'projects' && (
        <div className="dash-module dash-module--wide flex flex-col gap-4 min-w-0">
          <SupervisorSectionHeader
            title="Projects"
            description="Select one project at a time — uploads and reports always target the active project."
          />
          <ProjectsTab />
        </div>
      )}
      {tab === 'assignment' && (
        <div className="dash-module dash-module--wide">
          <AssignmentSection />
        </div>
      )}
      {tab === 'changeover' && (
        <div className="dash-module dash-module--wide">
          <MidChangeoverSection />
        </div>
      )}
      {tab === 'review' && (
        <div className="dash-module dash-module--wide">
          <ReviewApprovalSection />
        </div>
      )}
      {tab === 'panel-status' && (
        <div className="dash-module dash-module--wide">
          <PanelStatusSection />
        </div>
      )}
    </DashboardShell>
  );
}
