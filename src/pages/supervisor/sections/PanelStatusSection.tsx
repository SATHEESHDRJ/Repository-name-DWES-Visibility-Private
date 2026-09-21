import { Activity } from '../../../components/ui/icons';
import SupervisorSectionHeader from '../../../components/supervisor/SupervisorSectionHeader';
import SupervisorScopeToolbar from '../../../components/supervisor/SupervisorScopeToolbar';
import { useSupervisorScope } from '../../../hooks/useSupervisorScope';
import SummaryTab from '../tabs/SummaryTab';

export default function PanelStatusSection() {
  const scope = useSupervisorScope();

  return (
    <div className="flex flex-col min-w-0 gap-4">
      <SupervisorSectionHeader
        title="Overall Panel Status"
        description="At-a-glance view of panel ownership, progress, completion, and submission state across projects."
        icon={<Activity size={16} strokeWidth={1.75} />}
      />

      <SupervisorScopeToolbar
        projects={scope.projects}
        selectedProjectCode={scope.selectedProjectCode}
        selectedPanelId={scope.selectedPanelId}
        onProjectChange={scope.handleProjectChange}
        onPanelChange={scope.handlePanelChange}
        onPanelsLoaded={scope.setLoadedPanels}
        panelsRefreshKey={scope.panelsRefreshKey}
        technicians={scope.technicians}
        selectedTechId={scope.selectedTechId}
        onTechChange={scope.setSelectedTechId}
        techSelectDisabled={scope.techSelectDisabled}
        showTechnicianFilter
        selectedTechName={scope.selectedTech?.full_name}
      />

      <SummaryTab
        projectCode={scope.selectedProjectCode}
        panelId={scope.selectedPanelId}
        selectedTechId={scope.selectedTechId}
        selectedTechName={scope.selectedTech?.full_name}
      />
    </div>
  );
}
