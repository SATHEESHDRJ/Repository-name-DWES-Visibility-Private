import { useCallback, useState } from 'react';
import { Users } from '../../../components/ui/icons';
import SupervisorSectionHeader from '../../../components/supervisor/SupervisorSectionHeader';
import SupervisorScopeToolbar from '../../../components/supervisor/SupervisorScopeToolbar';
import { useSupervisorScope } from '../../../hooks/useSupervisorScope';
import AssignmentTab from '../tabs/AssignmentTab';

export default function AssignmentSection() {
  const scope = useSupervisorScope();
  const [openAssignTick, setOpenAssignTick] = useState(0);

  const handleQuickAssign = useCallback(() => {
    setOpenAssignTick(v => v + 1);
  }, []);

  return (
    <div className="flex flex-col min-w-0 gap-4">
      <SupervisorSectionHeader
        title="Assignments"
        description="Assign technicians to panels directly — no OTP gate. Monitor active ownership, KPI progress, and submission state."
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
        selectedPanel={scope.selectedPanel}
        selectedPanelVerified={scope.selectedPanelVerified}
        showTechnicianFilter
        selectedTechName={scope.selectedTech?.full_name}
      />

      <section className="ops-actions-card" aria-label="Assignment actions">
        <div className="ops-action-cluster">
          <button
            type="button"
            className="btn-primary"
            onClick={handleQuickAssign}
            disabled={!scope.canAssign}
            title={!scope.canAssign ? 'Select project and panel first' : 'Assign a technician to selected panel'}
          >
            <Users size={16} />
            <span>Assign Technician</span>
          </button>
        </div>

        {!scope.canAssign && (
          <p className="ops-action-hint" role="note">
            Select a project and panel with an uploaded wiring schedule to enable assignment.
          </p>
        )}
      </section>

      <AssignmentTab
        projects={scope.projects}
        projectCode={scope.selectedProjectCode}
        panelId={scope.selectedPanelId}
        selectedTechId={scope.selectedTechId}
        assignmentsOnly
        panelsRefreshKey={scope.panelsRefreshKey}
        openAssignTick={openAssignTick}
      />
    </div>
  );
}
