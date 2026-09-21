import WiringWorkstation from '../../../components/technician/wiring/WiringWorkstation';
import type { ScheduleFilterMode, TechnicianWorkspaceModule } from '../../../components/technician/wiring/wiring-utils';
import type { ActiveWireSnapshot } from '../../../types/liveTbView';
import {
  NO_PANEL_WORK_ASSIGNED_COPY,
  NO_PANEL_WORK_ASSIGNED_TITLE,
} from '../../../constants/twinMessaging';

interface WiringTabProps {
  panel: any;
  onPanelUpdate: () => void;
  onExit?: () => void;
  tabletMode: boolean;
  setTabletMode: (enabled: boolean) => void;
  fullViewOpen: boolean;
  setFullViewOpen: (open: boolean) => void;
  scheduleFilter?: ScheduleFilterMode;
  tagQuery?: string;
  equipmentQuery?: string;
  onEquipmentQueryChange?: (equipment: string) => void;
  onEquipmentOptionsChange?: (options: string[]) => void;
  skippedFilterOpen?: boolean;
  onSkippedFilterClose?: () => void;
  onClearSkippedFilter?: () => void;
  onSkippedCountChange?: (count: number) => void;
  onActiveWireChange?: (snapshot: ActiveWireSnapshot | null) => void;
  onOpenLiveTb?: () => void;
  workspaceModule?: TechnicianWorkspaceModule;
  onWorkspaceModuleChange?: (module: TechnicianWorkspaceModule) => void;
}

/** Technician wiring — embedded execution workspace inside the dashboard shell. */
export default function WiringTab({
  panel,
  onPanelUpdate,
  onExit,
  tabletMode,
  setTabletMode,
  fullViewOpen,
  setFullViewOpen,
  scheduleFilter = 'none',
  tagQuery = '',
  equipmentQuery = '',
  onEquipmentQueryChange,
  onEquipmentOptionsChange,
  skippedFilterOpen = false,
  onSkippedFilterClose,
  onClearSkippedFilter,
  onSkippedCountChange,
  onActiveWireChange,
  onOpenLiveTb,
  workspaceModule,
  onWorkspaceModuleChange,
}: WiringTabProps) {
  if (!panel) {
    return (
      <div className="tech-no-assignment" role="status">
        <p className="tech-no-assignment-title">{NO_PANEL_WORK_ASSIGNED_TITLE}</p>
        <p className="tech-no-assignment-copy">{NO_PANEL_WORK_ASSIGNED_COPY}</p>
      </div>
    );
  }

  return (
    <WiringWorkstation
      panel={panel}
      onPanelUpdate={onPanelUpdate}
      onExit={onExit}
      tabletMode={tabletMode}
      setTabletMode={setTabletMode}
      fullViewOpen={fullViewOpen}
      setFullViewOpen={setFullViewOpen}
      scheduleFilter={scheduleFilter}
      tagQuery={tagQuery}
      equipmentQuery={equipmentQuery}
      onEquipmentQueryChange={onEquipmentQueryChange}
      onEquipmentOptionsChange={onEquipmentOptionsChange}
      skippedFilterOpen={skippedFilterOpen}
      onSkippedFilterClose={onSkippedFilterClose}
      onClearSkippedFilter={onClearSkippedFilter}
      onSkippedCountChange={onSkippedCountChange}
      onActiveWireChange={onActiveWireChange}
      onOpenLiveTb={onOpenLiveTb}
      workspaceModule={workspaceModule}
      onWorkspaceModuleChange={onWorkspaceModuleChange}
    />
  );
}
