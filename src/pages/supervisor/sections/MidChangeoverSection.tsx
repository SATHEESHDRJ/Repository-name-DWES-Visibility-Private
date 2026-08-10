import { useCallback, useEffect, useState } from 'react';
import { ArrowLeftRight } from '../../../components/ui/icons';
import SupervisorSectionHeader from '../../../components/supervisor/SupervisorSectionHeader';
import SupervisorScopeToolbar from '../../../components/supervisor/SupervisorScopeToolbar';
import { supervisorApi } from '../../../services/api';
import { useSupervisorScope } from '../../../hooks/useSupervisorScope';
import ChangeoverTab from '../tabs/ChangeoverTab';

export default function MidChangeoverSection() {
  const scope = useSupervisorScope();
  const [changeoverCount, setChangeoverCount] = useState(0);

  const loadChangeoverCount = useCallback(() => {
    supervisorApi.pendingChangeovers()
      .then(d => setChangeoverCount((d || []).length))
      .catch(() => setChangeoverCount(0));
  }, []);

  useEffect(() => {
    loadChangeoverCount();
  }, [loadChangeoverCount]);

  return (
    <div className="flex flex-col min-w-0 gap-4">
      <SupervisorSectionHeader
        title="Mid-Changeover"
        description="Initiate technician handovers for in-progress or paused panels without losing cable progress."
        icon={<ArrowLeftRight size={16} strokeWidth={1.75} />}
      />

      {changeoverCount > 0 && (
        <div className="supervisor-changeover-strip" role="status">
          <ArrowLeftRight size={16} className="shrink-0" />
          <span>
            <strong>{changeoverCount}</strong> panel{changeoverCount !== 1 ? 's' : ''} eligible for mid-changeover
          </span>
        </div>
      )}

      <SupervisorScopeToolbar
        projects={scope.projects}
        selectedProjectCode={scope.selectedProjectCode}
        selectedPanelId={scope.selectedPanelId}
        onProjectChange={scope.handleProjectChange}
        onPanelChange={scope.handlePanelChange}
        onPanelsLoaded={scope.setLoadedPanels}
        panelsRefreshKey={scope.panelsRefreshKey}
      />

      <ChangeoverTab
        projects={scope.projects}
        projectCode={scope.selectedProjectCode}
        panelId={scope.selectedPanelId}
      />
    </div>
  );
}
