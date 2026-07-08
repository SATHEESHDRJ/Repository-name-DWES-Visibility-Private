import SupervisorSectionHeader from '../../../components/supervisor/SupervisorSectionHeader';
import SupervisorScopeToolbar from '../../../components/supervisor/SupervisorScopeToolbar';
import { useSupervisorScope } from '../../../hooks/useSupervisorScope';
import ReviewTab from '../tabs/ReviewTab';

export default function ReviewApprovalSection() {
  const scope = useSupervisorScope();

  return (
    <div className="flex flex-col min-w-0 gap-4">
      <SupervisorSectionHeader
        title="Review & Approval"
        description="Review completed panel submissions and approve work or request supervisor rework."
      />

      <SupervisorScopeToolbar
        projects={scope.projects}
        selectedProjectCode={scope.selectedProjectCode}
        selectedPanelId={scope.selectedPanelId}
        onProjectChange={scope.handleProjectChange}
        onPanelChange={scope.handlePanelChange}
        onPanelsLoaded={scope.setLoadedPanels}
        panelsRefreshKey={scope.panelsRefreshKey}
      />

      <ReviewTab
        projectCode={scope.selectedProjectCode}
        panelId={scope.selectedPanelId}
      />
    </div>
  );
}
