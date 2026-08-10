import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Zap, Maximize, Columns3, Tag, ListChecks, Search, InternalLoop } from '../../components/ui/icons';
import DashboardShell from '../../components/ui/DashboardShell';
import SectionHeader from '../../components/ui/SectionHeader';
import TagCableWiseFilterModal from '../../components/technician/TagCableWiseFilterModal';
import EquipmentFilterPopup from '../../components/technician/EquipmentFilterPopup';
import InternalDeviceLoopingModal from '../../components/technician/wiring/InternalDeviceLoopingModal';
import LiveTbViewModal from '../../components/technician/LiveTbViewModal';
import { techApi } from '../../services/api';
import { useLiveWiringStore } from '../../store/useLiveWiringStore';
import { useDwesRefresh, type RefreshOptions } from '../../hooks/useDwesRefresh';
import PanelsTab, {
  resolveActiveAssignment,
  shouldEmbedDigitalWiringSchedule,
  TechnicianMidChangeBanner,
} from './tabs/PanelsTab';
import WiringTab from './tabs/WiringTab';
import { useLatestRequest } from '../../hooks/useLatestRequest';
import { onFramesChanged } from '../../utils/projectFramesEvents';
import {
  buildTechnicianPanelsSectionTitleParts,
  type TechnicianAssignmentHeaderSource,
} from '../../utils/projectDisplay';
import type { ScheduleFilterMode } from '../../components/technician/wiring/wiring-utils';
import type { ActiveWireSnapshot } from '../../types/liveTbView';

const PANELS_SECTION_DESCRIPTION = 'View assigned panels and work from the Digital Wiring Schedule.';

const EQUIPMENT_FILTER_STORAGE_PREFIX = 'dwes.tech.equipmentFilter.';

/** Only one technician surface at a time (sidebar filter XOR tablet/full XOR LIVE TB). */
type ActiveTechnicianFunction =
  | 'TAG_FILTER'
  | 'SKIPPED_FILTER'
  | 'EQUIPMENT_FILTER'
  | 'INTERNAL_DEVICE'
  | null;

function readStoredEquipmentFilter(panelId: string | number): string {
  try {
    return String(localStorage.getItem(`${EQUIPMENT_FILTER_STORAGE_PREFIX}${panelId}`) ?? '');
  } catch {
    return '';
  }
}

function writeStoredEquipmentFilter(panelId: string | number, equipment: string) {
  try {
    const key = `${EQUIPMENT_FILTER_STORAGE_PREFIX}${panelId}`;
    const value = equipment.trim();
    if (!value) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    /* storage may be unavailable */
  }
}

function pickDefaultPanel(panels: any[]) {
  const isWorkable = (p: { status?: string | null; }) => {
    const st = String(p?.status ?? '').toLowerCase().replace(/[\s_-]+/g, '');
    return st === 'assigned' || st === 'inprogress' || st === 'paused' || st === 'started';
  };
  const active = panels.find(isWorkable);
  if (active) return active;
  return [...panels].sort((a: { assigned_at: string | number | Date; }, b: { assigned_at: string | number | Date; }) => {
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
  const [midChangeSaving, setMidChangeSaving] = useState(false);
  const [tabletMode, setTabletMode] = useState(false);
  const [isFullViewOpen, setIsFullViewOpen] = useState(false);
  const [scheduleFilter, setScheduleFilter] = useState<ScheduleFilterMode>('none');
  const [tagQuery, setTagQuery] = useState('');
  const [equipmentQuery, setEquipmentQuery] = useState('');
  const [equipmentOptions, setEquipmentOptions] = useState<string[]>([]);
  const [activeTechnicianFunction, setActiveTechnicianFunction] =
    useState<ActiveTechnicianFunction>(null);
  const [skippedPendingCount, setSkippedPendingCount] = useState(0);
  const [liveTbOpen, setLiveTbOpen] = useState(false);
  const tagFilterOpen = activeTechnicianFunction === 'TAG_FILTER';
  const skippedFilterOpen = activeTechnicianFunction === 'SKIPPED_FILTER';
  const equipmentFilterOpen = activeTechnicianFunction === 'EQUIPMENT_FILTER';
  const showInternalLooping = activeTechnicianFunction === 'INTERNAL_DEVICE';
  const [activeWireSnapshot, setActiveWireSnapshot] = useState<ActiveWireSnapshot | null>(null);
  const selectedPanelRef = useRef<any>(null);
  const panelRequests = useLatestRequest();
  const detailRequests = useLatestRequest();

  useEffect(() => { selectedPanelRef.current = selectedPanel; }, [selectedPanel]);

  /**
   * A silent refresh keeps the technician's open panel and wiring view: it swaps the
   * panel data in place, and only closes the workstation if the panel is genuinely gone
   * (unassigned or deleted). A failed silent refresh keeps the last good data on screen.
   */
  const loadPanels = useCallback(async (options?: RefreshOptions) => {
    const silent = options?.silent === true;
    const request = panelRequests.begin();
    if (!silent && panels.length === 0) {
      setPanelsLoading(true);
    }
    try {
      const data = await techApi.myPanels(request.signal);
      if (!panelRequests.isLatest(request.id)) return;
      setPanels(data);
      const inProgress = data.find((p: any) => p.status === 'in_progress');
      setLiveFromPanel(inProgress ?? null);
      const previous = selectedPanelRef.current;
      const stillAssigned = previous ? data.find((panel: any) => panel.id === previous.id) : null;
      if (previous && !stillAssigned) {
        selectedPanelRef.current = null;
        setSelectedPanel(null);
      }
      // Keep the panel the technician is working on; adopt its fresh data.
      const next = stillAssigned ?? pickDefaultPanel(data);
      if (next) {
        selectedPanelRef.current = next;
        setSelectedPanel(next);
      }
    } catch (error: any) {
      if (silent || error?.code === 'ERR_CANCELED' || !panelRequests.isLatest(request.id)) return;
      if (panels.length === 0) {
        setPanels([]);
        setSelectedPanel(null);
        selectedPanelRef.current = null;
        setLiveFromPanel(null);
      }
    } finally {
      if (panelRequests.isLatest(request.id)) setPanelsLoading(false);
    }
  }, [panelRequests, setLiveFromPanel, panels.length]);

  useEffect(() => { void loadPanels(); }, [loadPanels]);

  useDwesRefresh(loadPanels);

  useEffect(() => onFramesChanged((detail: { action: string; projectCode: string; frameId?: string; }) => {
    if (detail.action !== 'deleted') return;
    panelRequests.cancel();
    detailRequests.cancel();
    setPanels(current => current.filter((panel: any) => (
      panel.project_code !== detail.projectCode
      || (!!detail.frameId && panel.frame_id !== detail.frameId)
    )));
    const selected = selectedPanelRef.current;
    if (selected?.project_code === detail.projectCode
      && (!detail.frameId || selected.frame_id === detail.frameId)) {
      selectedPanelRef.current = null;
      setSelectedPanel(null);
      setLiveFromPanel(null);
    }
  }), [detailRequests, panelRequests, setLiveFromPanel]);

  const handleSelectPanel = (panel: any) => {
    selectedPanelRef.current = panel;
    setSelectedPanel(panel);
  };

  const handlePanelUpdate = () => {
    void loadPanels({ silent: true });
    const selected = selectedPanelRef.current;
    if (selected) {
      const request = detailRequests.begin();
      techApi.myAssignmentDetail(selected.id, request.signal).then(data => {
        if (!detailRequests.isLatest(request.id)) return;
        const current = selectedPanelRef.current;
        if (!current || current.id !== selected.id) return;
        const next = { ...current, ...data.assignment };
        selectedPanelRef.current = next;
        setSelectedPanel(next);
      }).catch(() => {});
    }
  };

  const handleExitWiring = () => {
    void loadPanels({ silent: true });
  };

  const handleResumeMidChange = async (assignmentId: number) => {
    setMidChangeSaving(true);
    try {
      await techApi.start(assignmentId);
      void loadPanels({ silent: true });
    } catch {
      /* Panels tab / banner surfaces errors on next refresh */
    } finally {
      setMidChangeSaving(false);
    }
  };

  const selectedLive = selectedPanel
    ? { ...(panels.find((p: { id: number; }) => p.id === selectedPanel.id) ?? {}), ...selectedPanel }
    : null;

  const activeAssignment = useMemo(
    () => resolveActiveAssignment(panels, selectedLive),
    [panels, selectedLive],
  );

  const embedWiringSchedule = useMemo(
    () => !panelsLoading && shouldEmbedDigitalWiringSchedule(activeAssignment),
    [activeAssignment, panelsLoading],
  );

  useEffect(() => {
    if (embedWiringSchedule) return;
    setScheduleFilter('none');
    setTagQuery('');
    setEquipmentQuery('');
    setEquipmentOptions([]);
    setActiveTechnicianFunction(null);
    setSkippedPendingCount(0);
    setLiveTbOpen(false);
    setActiveWireSnapshot(null);
  }, [embedWiringSchedule]);

  const wiringPanel = activeAssignment
    ? { ...(panels.find(p => p.id === activeAssignment.id) ?? {}), ...activeAssignment }
    : null;

  useEffect(() => {
    if (!embedWiringSchedule || !wiringPanel?.id) return;
    setEquipmentQuery(readStoredEquipmentFilter(wiringPanel.id));
  }, [embedWiringSchedule, wiringPanel?.id]);

  useEffect(() => {
    if (!embedWiringSchedule || !wiringPanel?.id) return;
    const selected = equipmentQuery.trim();
    if (!selected || equipmentOptions.length === 0) return;
    const exists = equipmentOptions.some(
      item => item === selected || item.toLowerCase() === selected.toLowerCase(),
    );
    if (exists) return;
    setEquipmentQuery('');
    writeStoredEquipmentFilter(wiringPanel.id, '');
  }, [embedWiringSchedule, wiringPanel?.id, equipmentOptions, equipmentQuery]);

  const isLive = activeAssignment?.status === 'in_progress';

  useEffect(() => {
    if (!embedWiringSchedule) return;
    const immersive = tabletMode || isFullViewOpen;
    document.documentElement.classList.toggle('dwf-tablet-active', tabletMode);
    document.documentElement.classList.toggle('dwf-full-view-active', isFullViewOpen && !tabletMode);
    const prev = document.body.style.overflow;
    if (immersive) document.body.style.overflow = 'hidden';
    return () => {
      document.documentElement.classList.remove('dwf-tablet-active');
      document.documentElement.classList.remove('dwf-full-view-active');
      document.body.style.overflow = prev;
    };
  }, [embedWiringSchedule, tabletMode, isFullViewOpen]);

  /** One surface at a time: sidebar function XOR tablet/full XOR LIVE TB. */
  const openTechnicianFunction = useCallback((fn: NonNullable<typeof activeTechnicianFunction>) => {
    setLiveTbOpen(false);
    setTabletMode(false);
    setIsFullViewOpen(false);
    setActiveTechnicianFunction(fn);
  }, []);

  const handleSidebarSelect = useCallback((key: string) => {
    setLiveTbOpen(false);
    setActiveTechnicianFunction(null);
    if (key === 'panels') {
      setTabletMode(false);
      setIsFullViewOpen(false);
      return;
    }
    if (!embedWiringSchedule) return;
    if (key === 'tablet') {
      setTabletMode(true);
      setIsFullViewOpen(false);
    } else if (key === 'full') {
      setTabletMode(false);
      setIsFullViewOpen(true);
    }
  }, [embedWiringSchedule]);

  const handleActiveWireChange = useCallback((snapshot: ActiveWireSnapshot | null) => {
    setActiveWireSnapshot(snapshot);
  }, []);

  const handleTagCableFilter = useCallback(() => {
    if (!embedWiringSchedule || !wiringPanel?.id) return;
    if (scheduleFilter === 'tag') {
      setScheduleFilter('none');
      setTagQuery('');
      setActiveTechnicianFunction(null);
      return;
    }
    openTechnicianFunction('TAG_FILTER');
  }, [embedWiringSchedule, scheduleFilter, wiringPanel?.id, openTechnicianFunction]);

  const handleApplyTagFilter = useCallback((tag: string) => {
    const next = tag.trim();
    if (!next) {
      setScheduleFilter('none');
      setTagQuery('');
      setActiveTechnicianFunction(null);
      return;
    }
    setTagQuery(next);
    setScheduleFilter('tag');
    setActiveTechnicianFunction(null);
  }, []);

  const handleSkippedWireFilter = useCallback(() => {
    if (!embedWiringSchedule) return;
    openTechnicianFunction('SKIPPED_FILTER');
  }, [embedWiringSchedule, openTechnicianFunction]);

  const handleClearSkippedFilter = useCallback(() => {
    setScheduleFilter(prev => (prev === 'skipped' ? 'none' : prev));
    setActiveTechnicianFunction(null);
  }, []);

  const handleOpenEquipmentFilter = useCallback(() => {
    if (!embedWiringSchedule) return;
    openTechnicianFunction('EQUIPMENT_FILTER');
  }, [embedWiringSchedule, openTechnicianFunction]);

  const handleOpenInternalLooping = useCallback(() => {
    if (!embedWiringSchedule) return;
    openTechnicianFunction('INTERNAL_DEVICE');
  }, [embedWiringSchedule, openTechnicianFunction]);

  const closeActiveTechnicianFunction = useCallback(() => {
    setActiveTechnicianFunction(null);
  }, []);

  // Keep the sidebar above filter modal backdrops so clicking another function
  // replaces the open popup (instead of being blocked by the overlay).
  useEffect(() => {
    const open = activeTechnicianFunction != null;
    document.documentElement.classList.toggle('tech-fn-modal-open', open);
    return () => {
      document.documentElement.classList.remove('tech-fn-modal-open');
    };
  }, [activeTechnicianFunction]);
  const handleApplyEquipmentFilter = useCallback((equipment: string) => {
    const next = equipment.trim();
    setEquipmentQuery(next);
    if (wiringPanel?.id != null) writeStoredEquipmentFilter(wiringPanel.id, next);
  }, [wiringPanel?.id]);

  const handleClearEquipmentFilter = useCallback(() => {
    setEquipmentQuery('');
    if (wiringPanel?.id != null) writeStoredEquipmentFilter(wiringPanel.id, '');
  }, [wiringPanel?.id]);

  const handleEquipmentQueryChange = useCallback((equipment: string) => {
    const next = equipment.trim();
    setEquipmentQuery(next);
    if (wiringPanel?.id != null) writeStoredEquipmentFilter(wiringPanel.id, next);
  }, [wiringPanel?.id]);

  const filterSideNavItems = useMemo(() => {
    if (!embedWiringSchedule) return [];
    return [
      {
        id: 'tag-cable-wise-filter',
        key: 'tag-cable-wise-filter',
        label: 'Tag Cable-Wise Filter',
        icon: <Tag size={20} />,
        // Applied filter only — never steals primary sidebar is-active
        active: scheduleFilter === 'tag',
        onSelect: handleTagCableFilter,
      },
      {
        id: 'skipped-wire-filter',
        key: 'skipped-wire-filter',
        label: 'Skipped Wire Filter',
        icon: <ListChecks size={20} />,
        active: scheduleFilter === 'skipped',
        badge: skippedPendingCount > 0 ? String(skippedPendingCount) : undefined,
        keepSidebarOpen: true,
        onSelect: handleSkippedWireFilter,
      },
      {
        id: 'equipment-wise-filter',
        key: 'equipment-wise-filter',
        label: 'Equipment Filter',
        icon: <Search size={20} />,
        active: !!equipmentQuery.trim(),
        badge: equipmentQuery.trim() || undefined,
        keepSidebarOpen: true,
        onSelect: handleOpenEquipmentFilter,
      },
      {
        id: 'internal-device-looping',
        key: 'internal-device-looping',
        label: 'Internal Device Looping',
        icon: <InternalLoop size={20} />,
        // Status badge only — opening the modal must not look like primary nav
        active: false,
        badge: 'NOT CONFIGURED',
        keepSidebarOpen: true,
        onSelect: handleOpenInternalLooping,
      },
    ];
  }, [
    embedWiringSchedule,
    scheduleFilter,
    handleTagCableFilter,
    handleSkippedWireFilter,
    handleOpenEquipmentFilter,
    handleOpenInternalLooping,
    equipmentQuery,
    skippedPendingCount,
  ]);

  const activeSidebarTab = isFullViewOpen
    ? 'full'
    : tabletMode
      ? 'tablet'
      : 'panels';

  const headerSource = useMemo((): TechnicianAssignmentHeaderSource | null => {
    if (panelsLoading && panels.length === 0) return null;
    const row = activeAssignment ?? pickDefaultPanel(panels);
    if (!row?.project_code) return null;
    const live = panels.find((p: { id: number }) => p.id === row.id) ?? row;
    return {
      project_code: live.project_code,
      project_name: live.project_name,
      project_client: live.project_client,
      panel_name: live.panel_name,
    };
  }, [panels, panelsLoading, activeAssignment]);

  const sectionTitleParts = useMemo(
    () => buildTechnicianPanelsSectionTitleParts(headerSource),
    [headerSource],
  );

  const sectionTitleContent = useMemo(() => {
    if (sectionTitleParts.plain === 'Panels') return 'Panels';
    if (sectionTitleParts.panelName) {
      return (
        <>
          <span className="tech-panels-heading-emphasis">{sectionTitleParts.substationName}</span>
          {sectionTitleParts.projectSuffix}
          {' — '}
          <span className="tech-panels-heading-emphasis">{sectionTitleParts.panelName}</span>
        </>
      );
    }
    return (
      <>
        <span className="tech-panels-heading-emphasis">{sectionTitleParts.substationName}</span>
        {sectionTitleParts.projectSuffix}
      </>
    );
  }, [sectionTitleParts]);

  return (
    <DashboardShell
      title="Technician Dashboard"
      subtitle="Panel wiring, progress tracking, and digital frame execution"
      tabs={[
        { key: 'panels', label: 'Panels', icon: <Zap size={20} /> },
        { key: 'tablet', label: 'Tablet View', icon: <Maximize size={20} /> },
        { key: 'full', label: 'Full View', icon: <Columns3 size={20} /> },
      ]}
      sideNavItems={filterSideNavItems}
      activeTab={activeSidebarTab}
      onTabChange={handleSidebarSelect}
      badge="Wiring Technician"
      widthVariant="wide"
      hideTabSectionHeader
      heroClassName="dashboard-hero--technician"
      heroLive={isLive}
    >
      {!embedWiringSchedule && (
        <SectionHeader
          title={sectionTitleParts.plain}
          titleContent={sectionTitleContent}
          description={PANELS_SECTION_DESCRIPTION}
          icon={<Zap size={20} />}
        />
      )}
      <section className="dash-module dash-module--wide tech-dash-module">
        {embedWiringSchedule && wiringPanel ? (
          <div className="tech-wiring-shell" aria-live="polite">
            <TechnicianMidChangeBanner
              saving={midChangeSaving}
              onResume={handleResumeMidChange}
            />
            <WiringTab
              panel={wiringPanel}
              onPanelUpdate={handlePanelUpdate}
              onExit={handleExitWiring}
              tabletMode={tabletMode}
              setTabletMode={setTabletMode}
              fullViewOpen={isFullViewOpen}
              setFullViewOpen={setIsFullViewOpen}
              scheduleFilter={scheduleFilter}
              tagQuery={tagQuery}
              equipmentQuery={equipmentQuery}
              onEquipmentQueryChange={handleEquipmentQueryChange}
              onEquipmentOptionsChange={setEquipmentOptions}
              skippedFilterOpen={skippedFilterOpen}
              onSkippedFilterClose={closeActiveTechnicianFunction}
              onClearSkippedFilter={handleClearSkippedFilter}
              onSkippedCountChange={setSkippedPendingCount}
              onActiveWireChange={handleActiveWireChange}
              onOpenLiveTb={() => {
                setActiveTechnicianFunction(null);
                setLiveTbOpen(true);
              }}
            />
          </div>
        ) : (
          <PanelsTab
            panels={panels}
            loading={panelsLoading}
            onRefresh={loadPanels}
            selectedPanel={selectedLive}
            onSelectPanel={handleSelectPanel}
          />
        )}
      </section>
      {tagFilterOpen && wiringPanel?.id ? (
        <TagCableWiseFilterModal
          assignmentId={wiringPanel.id}
          defaultValue={tagQuery}
          onClose={closeActiveTechnicianFunction}
          onApply={handleApplyTagFilter}
        />
      ) : null}
      <EquipmentFilterPopup
        open={equipmentFilterOpen}
        options={equipmentOptions}
        value={equipmentQuery}
        onApply={handleApplyEquipmentFilter}
        onClear={handleClearEquipmentFilter}
        onClose={closeActiveTechnicianFunction}
      />
      <InternalDeviceLoopingModal
        open={showInternalLooping}
        onClose={closeActiveTechnicianFunction}
      />
      <LiveTbViewModal
        open={liveTbOpen}
        snapshot={activeWireSnapshot}
        onClose={() => setLiveTbOpen(false)}
      />
    </DashboardShell>
  );
}
