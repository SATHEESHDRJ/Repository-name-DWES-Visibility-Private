import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  AlertTriangle, ArrowLeft, CheckCircle2, ChevronLeft, ChevronRight, Loader, PauseCircle, Play, Pencil, MapPin,
} from '../../ui/icons';
import { techApi } from '../../../services/api';
import { useAppDialog } from '../../AppDialogProvider';
import { useReadOnlyPoll } from '../../../hooks/useReadOnlyPoll';
import { DWES_WIRING_SYNC_MS } from '../../../constants/refreshIntervals';
import { emitWorkflowChanged } from '../../../utils/dwesRefreshEvents';
import { onFramesChanged } from '../../../utils/projectFramesEvents';
import { assignmentMatchesDeletion } from '../../../utils/entityConsistency';
import { useLatestRequest } from '../../../hooks/useLatestRequest';
import Toast from '../../ui/Toast';
import PauseReasonModal from '../PauseReasonModal';
import AssignmentAcknowledgmentModal from '../AssignmentAcknowledgmentModal';
import { useAuthStore } from '../../../store/useAuthStore';
import { useLiveWiringStore } from '../../../store/useLiveWiringStore';
import DigitalWiringFrame from './DigitalWiringFrame';
import CrimpingGroupView from './CrimpingGroupView';
import TechnicianCrimpingReport from './TechnicianCrimpingReport';
import PrepareWireDrawer from './PrepareWireDrawer';
import WireCorrectionHistoryModal from './WireCorrectionHistoryModal';
import SkippedWireFilterPopup from '../SkippedWireFilterPopup';
import { DwesLoadingIndicator } from '../../ui/DwesLoadingIndicator';
import type { Cable } from '../../../types';
import type { ActiveWireSnapshot } from '../../../types/liveTbView';
import { liveTbDebugLog } from '../../../utils/liveTbDebugLog';
import {
  DEFAULT_CABLE_STATUS,
  ensureCableList,
  filterCableIndexes,
  findNextPending,
  findNextPendingInIndexes,
  collectScheduleEquipment,
  collectSkippedWireRows,
  countPendingSkipped,
  isWiringLockedByCrimping,
  mergeOpenEnd,
  resolveLiveTbWireEnds,
  executionModeForModule,
  type ExtendedCableStatus,
  type ScheduleFilterMode,
  type TechnicianWorkspaceModule,
  type CrimpingWorkspaceView,
} from './wiring-utils';
import type { CorrectableFieldOption, WireCorrectionView } from './SingleWireMatrixCard';
import { buildTechnicianPanelsSectionTitleParts } from '../../../utils/projectDisplay';

const SYNC_INTERVAL_MS = DWES_WIRING_SYNC_MS;
/** One end checked for longer than this → status chip blinks as an alert. */
const PARTIAL_ALERT_MS = 120_000;
/** Frozen Digital Wiring path — module switching must not alter FINISHED / SKIP / OPEN SIDE. */
const WORKSPACE_MODULE_KEY = 'dwes_tech_workspace_module';
const EXEC_MODE_KEY = 'dwes_tech_execution_mode';
const CRIMP_VIEW_KEY = 'dwes_tech_crimp_view';

function readStoredWorkspaceModule(assignmentId: number | null | undefined): TechnicianWorkspaceModule {
  if (assignmentId == null) return 'stripping';
  try {
    const raw = sessionStorage.getItem(`${WORKSPACE_MODULE_KEY}:${assignmentId}`);
    if (raw === 'wiring' || raw === 'stripping' || raw === 'crimping' || raw === 'report') return raw;
    // Migrate CR-04 combined mode storage
    const legacy = sessionStorage.getItem(`${EXEC_MODE_KEY}:${assignmentId}`);
    if (legacy === 'wiring') return 'wiring';
    return 'stripping';
  } catch {
    return 'stripping';
  }
}

function writeStoredWorkspaceModule(assignmentId: number | null | undefined, module: TechnicianWorkspaceModule) {
  if (assignmentId == null) return;
  try {
    sessionStorage.setItem(`${WORKSPACE_MODULE_KEY}:${assignmentId}`, module);
    sessionStorage.setItem(`${EXEC_MODE_KEY}:${assignmentId}`, executionModeForModule(module));
  } catch { /* ignore */ }
}

function readStoredCrimpView(assignmentId: number | null | undefined): CrimpingWorkspaceView {
  if (assignmentId == null) return 'wire';
  try {
    const raw = sessionStorage.getItem(`${CRIMP_VIEW_KEY}:${assignmentId}`);
    if (raw === 'group' || raw === 'report') return raw;
    return 'wire';
  } catch {
    return 'wire';
  }
}

function writeStoredCrimpView(assignmentId: number | null | undefined, view: CrimpingWorkspaceView) {
  if (assignmentId == null) return;
  try {
    sessionStorage.setItem(`${CRIMP_VIEW_KEY}:${assignmentId}`, view);
  } catch { /* ignore */ }
}

type CableAction =
  | 'complete'
  | 'skip'
  | 'source_end_open'
  | 'destination_end_open';

interface Props {
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
  /** Lift active wire IDs for LIVE ENDPOINT VIEW without remounting this workstation. */
  onActiveWireChange?: (snapshot: ActiveWireSnapshot | null) => void;
  /** Open LIVE ENDPOINT VIEW overlay from the wiring header. */
  onOpenLiveTb?: () => void;
  /** Optional controlled dashboard module (Digital Wiring | Stripping | Crimping | Report). */
  workspaceModule?: TechnicianWorkspaceModule;
  onWorkspaceModuleChange?: (module: TechnicianWorkspaceModule) => void;
}

export default function WiringWorkstation({
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
  workspaceModule: workspaceModuleProp,
  onWorkspaceModuleChange,
}: Props) {
  const dialog = useAppDialog();
  const { user } = useAuthStore();
  const setLiveFromPanel = useLiveWiringStore(s => s.setFromPanel);
  const detailRequests = useLatestRequest();
  const [detail, setDetail] = useState<any>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [status, setStatus] = useState<Record<string, ExtendedCableStatus>>({});
  const [saving, setSaving] = useState(false);
  const [savingStage, setSavingStage] = useState<'cut' | 'strip' | 'crimp' | null>(null);
  const [showPause, setShowPause] = useState(false);
  const [showAck, setShowAck] = useState(false);
  const [showCorrectionHistory, setShowCorrectionHistory] = useState(false);
  const [showOpenSide, setShowOpenSide] = useState(false);
  const [openSideChoice, setOpenSideChoice] = useState<'source' | 'destination' | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [activeIdx, setActiveIdx] = useState(0);
  /** Execution head — updated by advance actions; PREVIOUS review does not move this. */
  const [workingIdx, setWorkingIdx] = useState(0);
  const [workspaceModuleInternal, setWorkspaceModuleInternal] = useState<TechnicianWorkspaceModule>(() =>
    readStoredWorkspaceModule(panel?.id),
  );
  const workspaceModule = workspaceModuleProp ?? workspaceModuleInternal;
  const executionMode = executionModeForModule(workspaceModule);
  const [crimpView, setCrimpView] = useState<CrimpingWorkspaceView>(() =>
    readStoredCrimpView(panel?.id),
  );
  const [crimpingGateMsg, setCrimpingGateMsg] = useState<string | null>(null);
  const [showPrepareWire, setShowPrepareWire] = useState(false);
  const workspaceRef = useRef<HTMLDivElement>(null);
  const loadedAssignmentIdRef = useRef<number | null>(null);
  const panelId = panel?.id;
  const panelProjectCode = panel?.project_code;

  const projectPanelLine = useMemo(() => {
    if (!panel?.project_code) return '';
    const parts = buildTechnicianPanelsSectionTitleParts({
      project_code: panel.project_code,
      project_name: panel.project_name,
      project_client: panel.project_client,
      panel_name: panel.panel_name,
    });
    const projectPart = `${parts.substationName}${parts.projectSuffix}`.trim();
    if (parts.panelName && projectPart) return `${projectPart}  |  PANEL: ${parts.panelName}`;
    if (parts.panelName) return `PANEL: ${parts.panelName}`;
    return projectPart || parts.plain;
  }, [panel?.project_code, panel?.project_name, panel?.project_client, panel?.panel_name]);

  useEffect(() => {
    if (tabletMode || !detail) return;
    const root = workspaceRef.current;
    const focusable = root?.querySelector<HTMLElement>(
      'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
    );
    focusable?.focus();
  }, [detail, tabletMode, panel?.id]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (showPause || showAck || showCorrectionHistory || skippedFilterOpen) return;
      if (showOpenSide) {
        e.preventDefault();
        setShowOpenSide(false);
        setOpenSideChoice(null);
        return;
      }
      if (fullViewOpen) {
        e.preventDefault();
        setFullViewOpen(false);
        return;
      }
      if (tabletMode) {
        e.preventDefault();
        setTabletMode(false);
        return;
      }
      if (!onExit) return;
      e.preventDefault();
      onExit();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onExit, tabletMode, fullViewOpen, showPause, showAck, showCorrectionHistory, showOpenSide, skippedFilterOpen, setTabletMode, setFullViewOpen]);

  const applyStatusMap = (cableStatus: Record<string, any> | null | undefined) => {
    const next: Record<string, ExtendedCableStatus> = {};
    Object.entries(cableStatus || {}).forEach(([k, v]: [string, any]) => {
      next[k] = {
        src: !!v.src,
        dst: !!v.dst,
        note: v.note || '',
        issue: !!v.issue,
        openEnd: (() => {
          if (v.openEnd === 'source' || v.openEnd === 'destination' || v.openEnd === 'both') return v.openEnd;
          const note = String(v.note || '');
          const hasSrc = /\[SOURCE END OPEN /.test(note);
          const hasDst = /\[DESTINATION END OPEN /.test(note);
          if (hasSrc && hasDst) return 'both' as const;
          if (hasSrc) return 'source' as const;
          if (hasDst) return 'destination' as const;
          return null;
        })(),
        corrected: !!v.corrected || /\[CORRECTED /.test(v.note || ''),
        ...(v.correctionComment ? { correctionComment: String(v.correctionComment) } : {}),
        ...(v.technicianId != null ? { technicianId: Number(v.technicianId) } : {}),
        ...(v.crimping && typeof v.crimping === 'object' ? { crimping: { ...v.crimping } } : {}),
      };
    });
    setStatus(next);
  };

  const load = useCallback(() => {
    if (!panelId) return;
    const request = detailRequests.begin();
    techApi.myAssignmentDetail(panelId, request.signal).then(data => {
      if (!detailRequests.isLatest(request.id)) return;
      setDetail(data);
      setLoadError(null);
      applyStatusMap(data.assignment.cable_status);
    }).catch((e: any) => {
      if (!detailRequests.isLatest(request.id) || e?.code === 'ERR_CANCELED') return;
      const httpStatus = e?.response?.status;
      const msg = e?.response?.data?.message;
      if (httpStatus === 404 || httpStatus === 410) {
        setDetail(null);
        setLoadError(msg || 'This assignment is no longer available.');
        setLiveFromPanel(null);
        onExit?.();
        return;
      }
      setLoadError(httpStatus
        ? `HTTP ${httpStatus}${msg ? ` — ${msg}` : ''}`
        : 'Network error — backend unreachable');
    });
  }, [detailRequests, onExit, panelId, setLiveFromPanel]);

  useEffect(() => {
    if (!panelId) {
      loadedAssignmentIdRef.current = null;
      setDetail(null);
      setLoadError(null);
      return;
    }
    if (loadedAssignmentIdRef.current === panelId) return;
    loadedAssignmentIdRef.current = panelId;
    setLoadError(null);
    load();
  }, [panelId, load]);

  useEffect(() => onFramesChanged(detail => {
    if (!panelId) return;
    if (detail.action === 'deleted') {
      if (!assignmentMatchesDeletion(panel, detail)) return;
      detailRequests.cancel();
      setDetail(null);
      setLoadError(null);
      setLiveFromPanel(null);
      onExit?.();
      return;
    }
    // Supervisor re-upload / frame update — reload so Cable Visual picks up revised Excel cells.
    if (detail.projectCode !== panelProjectCode) return;
    if (detail.frameId && detail.frameId !== panel.frame_id && detail.frameId !== panel.id) return;
    load();
  }), [detailRequests, load, onExit, panel, panelId, panelProjectCode, setLiveFromPanel]);

  const syncProgress = useCallback(() => {
    if (!panelId || saving) return;
    const request = detailRequests.begin();
    techApi.myAssignmentDetail(panelId, request.signal).then(data => {
      if (!detailRequests.isLatest(request.id)) return;
      setDetail(data);
      applyStatusMap(data.assignment.cable_status);
    }).catch((e: any) => {
      if (!detailRequests.isLatest(request.id) || e?.code === 'ERR_CANCELED') return;
      if (e?.response?.status === 404 || e?.response?.status === 410) {
        setDetail(null);
        setLiveFromPanel(null);
        onExit?.();
      }
    });
  }, [detailRequests, onExit, panelId, saving, setLiveFromPanel]);

  useReadOnlyPoll(syncProgress, SYNC_INTERVAL_MS);

  const partialSince = useRef<Record<string, number>>({});
  const [alertTick, setAlertTick] = useState(0);
  useEffect(() => {
    const now = Date.now();
    const map = partialSince.current;
    Object.entries(status).forEach(([k, s]) => {
      const partial = (s.src || s.dst) && !(s.src && s.dst);
      if (partial && !map[k]) map[k] = now;
      if (!partial && map[k]) delete map[k];
    });
  }, [status]);
  useEffect(() => {
    const id = setInterval(() => setAlertTick(t => t + 1), 10_000);
    return () => clearInterval(id);
  }, []);
  const alertRows = useMemo(() => {
    void alertTick;
    const now = Date.now();
    const set = new Set<string>();
    Object.entries(partialSince.current).forEach(([k, since]) => {
      if (now - since >= PARTIAL_ALERT_MS) set.add(k);
    });
    return set;
  }, [alertTick, status]);

  const mapping: Record<string, string> = useMemo(() => detail?.frame?.mapping || {}, [detail?.frame?.mapping]);
  const cables: Cable[] = useMemo(
    () => {
      const frameCables: Cable[] = Array.isArray(detail?.frame?.cables) ? detail.frame.cables : [];
      return ensureCableList(frameCables, frameCables.length, mapping);
    },
    [detail?.frame?.cables, mapping],
  );

  useEffect(() => {
    if (!onActiveWireChange) return;
    const projectCode = String(panel?.project_code || '').trim();
    const frameId = String(panel?.frame_id || '').trim();
    const assignmentId = Number(panel?.id);
    const cable = cables[activeIdx];
    if (!projectCode || !frameId || !Number.isFinite(assignmentId) || assignmentId <= 0 || !cable) {
      onActiveWireChange(null);
      return;
    }
    const wireId = String(cable.ref || cable.sno || activeIdx + 1).trim() || String(activeIdx + 1);
    const donePairs = Object.values(status).filter(s => s.src && s.dst).length;
    const panelComplete =
      String(panel?.status || '').toLowerCase() === 'completed'
      || String(panel?.status || '').toLowerCase() === 'finished'
      || (cables.length > 0 && donePairs === cables.length);
    const tbEnds = resolveLiveTbWireEnds(cable, mapping);
        liveTbDebugLog('WiringWorkstation.tsx:activeWire', 'Resolved LIVE TB snapshot ends', {
      wireId,
      source_equipment: tbEnds.source_equipment,
      source_equipment_terminal: tbEnds.source_equipment_terminal,
      dest_equipment: tbEnds.dest_equipment,
      dest_equipment_terminal: tbEnds.dest_equipment_terminal,
      source_tb: tbEnds.source_tb,
      source_terminal: tbEnds.source_terminal,
      dest_tb: tbEnds.dest_tb,
      dest_terminal: tbEnds.dest_terminal,
      tb_fields_present: tbEnds.tb_fields_present,
      source_is_physical_tb: tbEnds.source_is_physical_tb,
      dest_is_physical_tb: tbEnds.dest_is_physical_tb,
      source_endpoint_type: tbEnds.source_endpoint_type,
      dest_endpoint_type: tbEnds.dest_endpoint_type,
      source_physical_lookup_key: tbEnds.source_physical_lookup_key,
      dest_physical_lookup_key: tbEnds.dest_physical_lookup_key,
      project: projectCode,
      frame: frameId,
    }, 'E');
        onActiveWireChange({
      project_code: projectCode,
      frame_id: frameId,
      assignment_id: assignmentId,
      panel_name: String(panel?.panel_name || '').trim(),
      cable_index: activeIdx,
      wire_id: wireId,
      wire_number: String(cable.ref || '').trim() || undefined,
      sno: String(cable.sno || '').trim() || undefined,
      // Match API: physical TB header when present; else equipment/connector lookup key
      // so LIVE ENDPOINT VIEW can highlight header/group rects for DEVICE ends too.
      source_device: tbEnds.source_tb
        || tbEnds.source_physical_lookup_key
        || tbEnds.source_equipment
        || '',
      source_terminal: tbEnds.source_terminal
        || tbEnds.source_equipment_terminal
        || tbEnds.source_terminal_reference
        || '',
      dest_device: tbEnds.dest_tb
        || tbEnds.dest_physical_lookup_key
        || tbEnds.dest_equipment
        || '',
      dest_terminal: tbEnds.dest_terminal
        || tbEnds.dest_equipment_terminal
        || tbEnds.dest_terminal_reference
        || '',
      source_tb: tbEnds.source_tb,
      dest_tb: tbEnds.dest_tb,
      tb_fields_present: tbEnds.tb_fields_present,
      source_tb_from: tbEnds.source_tb_from,
      dest_tb_from: tbEnds.dest_tb_from,
      source_equipment: tbEnds.source_equipment,
      source_equipment_terminal: tbEnds.source_equipment_terminal,
      dest_equipment: tbEnds.dest_equipment,
      dest_equipment_terminal: tbEnds.dest_equipment_terminal,
      source_is_physical_tb: tbEnds.source_is_physical_tb,
      dest_is_physical_tb: tbEnds.dest_is_physical_tb,
      source_endpoint_type: tbEnds.source_endpoint_type,
      dest_endpoint_type: tbEnds.dest_endpoint_type,
      source_physical_lookup_key: tbEnds.source_physical_lookup_key,
      dest_physical_lookup_key: tbEnds.dest_physical_lookup_key,
      source_terminal_reference: tbEnds.source_terminal_reference,
      dest_terminal_reference: tbEnds.dest_terminal_reference,
      panel_complete: panelComplete,
    });
  }, [
    onActiveWireChange,
    panel?.project_code,
    panel?.frame_id,
    panel?.id,
    panel?.panel_name,
    panel?.status,
    cables,
    activeIdx,
    status,
    mapping,
  ]);

  useEffect(() => {
    onEquipmentOptionsChange?.(collectScheduleEquipment(cables));
  }, [cables, onEquipmentOptionsChange]);

  const skippedWireRows = useMemo(
    () => collectSkippedWireRows(cables, status),
    [cables, status],
  );

  useEffect(() => {
    onSkippedCountChange?.(countPendingSkipped(cables, status));
  }, [cables, status, onSkippedCountChange]);

  const handleOpenSkippedWire = useCallback((index: number) => {
    if (index < 0 || index >= cables.length) return;
    setActiveIdx(index);
    setWorkingIdx(index);
    onSkippedFilterClose?.();
  }, [cables.length, onSkippedFilterClose]);

  const allCorrections: WireCorrectionView[] = useMemo(
    () => (Array.isArray(detail?.corrections) ? detail.corrections : []) as WireCorrectionView[],
    [detail?.corrections],
  );
  const activeCorrections = useMemo(
    () => allCorrections.filter(c => Number((c as any).cable_index) === activeIdx),
    [allCorrections, activeIdx],
  );
  const correctableFields: CorrectableFieldOption[] = useMemo(() => {
    if (Array.isArray(detail?.correctable_fields) && detail.correctable_fields.length) {
      return detail.correctable_fields;
    }
    return [
      { field: 'color', label: 'Cable colour' },
      { field: 'size', label: 'Cable size' },
      { field: 'length', label: 'Cable length' },
      { field: 'source', label: 'Source (equipment:terminal)' },
      { field: 'destination', label: 'Destination (equipment:terminal)' },
      { field: 'source_device', label: 'Source equipment' },
      { field: 'source_terminal', label: 'Source terminal' },
      { field: 'dest_device', label: 'Destination equipment' },
      { field: 'dest_terminal', label: 'Destination terminal' },
      { field: 'ferrule', label: 'Source ferrule' },
      { field: 'dest_ferrule', label: 'Destination ferrule' },
      { field: 'ref', label: 'Reference' },
      { field: 'sign', label: 'Sign mark' },
      { field: 'remarks', label: 'Remarks' },
    ];
  }, [detail?.correctable_fields]);
  const total = cables.length;
  const donePairs = Object.values(status).filter(s => s.src && s.dst).length;
  const allDone = total > 0 && donePairs === total;
  const canWire = ['assigned', 'in_progress'].includes(panel?.status ?? '');
  const isPaused = panel?.status === 'paused';
  const filteredIndexes = useMemo(
    () => filterCableIndexes(cables, status, scheduleFilter, tagQuery, equipmentQuery),
    [cables, status, scheduleFilter, tagQuery, equipmentQuery],
  );
  const filterActive = scheduleFilter !== 'none' || !!equipmentQuery.trim();

  useEffect(() => {
    if (!filterActive) return;
    if (filteredIndexes.length === 0) return;
    if (filteredIndexes.includes(activeIdx)) return;
    const next = filteredIndexes[0];
    setActiveIdx(next);
    setWorkingIdx(next);
  }, [filterActive, filteredIndexes, activeIdx]);

  useEffect(() => {
    if (total <= 0) return;
    const pending = findNextPending(-1, total, status);
    const next = pending ?? 0;
    setActiveIdx(next);
    setWorkingIdx(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [panel?.id, total]);

  useEffect(() => {
    if (workspaceModuleProp != null) return;
    setWorkspaceModuleInternal(readStoredWorkspaceModule(panel?.id));
    setCrimpView(readStoredCrimpView(panel?.id));
    setCrimpingGateMsg(null);
  }, [panel?.id, workspaceModuleProp]);

  const activeSt = status[String(activeIdx)] ?? DEFAULT_CABLE_STATUS;
  const wiringLockedActive = isWiringLockedByCrimping(activeSt);
  const prepRequired = Boolean(activeSt.crimping?.required);
  const prepRework = String(activeSt.crimping?.overall || '') === 'REWORK_REQUIRED';
  const prepNeedsAction = prepRequired && (wiringLockedActive || prepRework);
  const skippedNote = /\[SKIPPED\b/i.test(String(activeSt.note || ''));
  const cutDone = activeSt.crimping?.cut?.status === 'COMPLETED';
  const stripDone = activeSt.crimping?.wireStrip?.status === 'COMPLETED';
  const crimpDone = activeSt.crimping?.wireCrimp?.status === 'COMPLETED';
  const isLegacyPartial = activeSt.crimping?.legacyPartial === true;

  const goPreviousCable = () => {
    if (!filterActive) {
      setActiveIdx(Math.max(0, activeIdx - 1));
      return;
    }
    const pos = filteredIndexes.indexOf(activeIdx);
    if (pos > 0) {
      setActiveIdx(filteredIndexes[pos - 1]);
      return;
    }
    if (pos < 0) {
      const prev = [...filteredIndexes].reverse().find(index => index < activeIdx);
      if (prev != null) setActiveIdx(prev);
    }
  };

  const goNextCable = () => {
    if (!filterActive) {
      setActiveIdx(Math.min(total - 1, activeIdx + 1));
      return;
    }
    const pos = filteredIndexes.indexOf(activeIdx);
    if (pos >= 0 && pos < filteredIndexes.length - 1) {
      setActiveIdx(filteredIndexes[pos + 1]);
      return;
    }
    if (pos < 0) {
      const next = filteredIndexes.find(index => index > activeIdx);
      if (next != null) setActiveIdx(next);
    }
  };

  const canGoPrevious = filterActive
    ? filteredIndexes.some(index => index < activeIdx)
    : activeIdx > 0;

  const canGoNext = filterActive
    ? filteredIndexes.some(index => index > activeIdx)
    : activeIdx < total - 1;

  const handleActiveIndexJump = useCallback((idx: number) => {
    setActiveIdx(idx);
    setWorkingIdx(idx);
  }, []);

  const doCableAction = async (action: CableAction, advance = true): Promise<boolean> => {
    if (!canWire || isPaused || saving) return false;
    if (executionMode === 'wiring' && action === 'complete') {
      const cur = status[String(activeIdx)] ?? DEFAULT_CABLE_STATUS;
      if (isWiringLockedByCrimping(cur)) {
        setCrimpingGateMsg(
          `CRIMPING NOT COMPLETED. Complete Source and Destination Stripping and Crimping before Wiring wire ${activeIdx + 1}.`,
        );
        return false;
      }
    }
    setSaving(true);
    setCrimpingGateMsg(null);
    const key = String(activeIdx);
    const prev = status[key] ?? DEFAULT_CABLE_STATUS;
    const next: ExtendedCableStatus = { ...prev };
    const skipNote = 'Skipped by technician';
    const isOpenSide = action === 'source_end_open' || action === 'destination_end_open';
    if (action === 'skip') {
      next.note = `[SKIPPED ${new Date().toISOString()}] ${skipNote}`;
      next.openEnd = null;
    } else if (action === 'complete') {
      next.src = true;
      next.dst = true;
      // Keep intentional open-end so finished wires retain SOURCE/DESTINATION OPEN status.
    } else if (action === 'source_end_open') {
      next.openEnd = mergeOpenEnd(next.openEnd, 'source', next.note || '');
      const entry = `[SOURCE END OPEN ${new Date().toISOString()}] Source end intentionally not terminated`;
      next.note = next.note ? `${next.note}\n${entry}` : entry;
    } else if (action === 'destination_end_open') {
      next.openEnd = mergeOpenEnd(next.openEnd, 'destination', next.note || '');
      const entry = `[DESTINATION END OPEN ${new Date().toISOString()}] Destination end intentionally not terminated`;
      next.note = next.note ? `${next.note}\n${entry}` : entry;
    } else if (!isOpenSide) {
      next.src = true;
      next.dst = true;
    }
    const updated = { ...status, [key]: next };
    setStatus(updated);
    try {
      const cableRes = await techApi.cableAction(
        panel.id,
        activeIdx,
        action,
        action === 'skip' ? skipNote : undefined,
      );
      const finishedWireId = String(cableRes?.wire_id || cableRes?.previous_wire_id || '').trim() || undefined;
      const nextWireId = String(cableRes?.next_wire_id || '').trim() || undefined;
      const nextCableIndex = typeof cableRes?.next_cable_index === 'number'
        ? cableRes.next_cable_index
        : undefined;
      emitWorkflowChanged({
        scope: 'wiring',
        projectCode: panel.project_code,
        frameId: panel.id,
        assignmentId: panel.id,
        cableIndex: activeIdx,
        wireId: finishedWireId,
        previousWireId: finishedWireId,
        nextWireId,
        nextCableIndex,
      });
      if (advance) {
        // Prefer backend next index when FINISHED returns it; else local pending scan.
        const backendNext =
          action === 'complete' && nextCableIndex != null && nextCableIndex >= 0
            ? nextCableIndex
            : null;
        const nextPending = backendNext != null
          ? backendNext
          : (filterActive
            ? findNextPendingInIndexes(activeIdx, filteredIndexes, updated)
            : findNextPending(activeIdx, total, updated));
        if (nextPending != null) {
          setActiveIdx(nextPending);
          setWorkingIdx(nextPending);
        } else {
          setWorkingIdx(activeIdx);
        }
      } else {
        setWorkingIdx(activeIdx);
      }
      return true;
    } catch (err: any) {
      setStatus(m => ({ ...m, [key]: prev }));
      const data = err?.response?.data;
      const code = data?.code || data?.message?.code;
      const msg = typeof data?.message === 'string'
        ? data.message
        : data?.message?.message;
      if (code === 'CRIMPING_NOT_COMPLETED' || String(msg || '').includes('CRIMPING NOT COMPLETED')) {
        setCrimpingGateMsg(msg || 'Complete wire preparation before wiring.');
      } else {
        setToast('Could not save cable status. Try again.');
      }
      return false;
    } finally {
      setSaving(false);
    }
  };

  const doPrepareWireApplied = (res: { crimping: any; wiring_locked: boolean; changed: boolean }, autoAdvance = false) => {
    const key = String(activeIdx);
    const prev = status[key] ?? DEFAULT_CABLE_STATUS;
    const nextCrimp = res?.crimping ? { ...res.crimping } : prev.crimping;
    const next: ExtendedCableStatus = { ...prev, crimping: nextCrimp };
    const updated = { ...status, [key]: next };
    setStatus(updated);
    setCrimpingGateMsg(null);
    emitWorkflowChanged({ scope: 'wiring', projectCode: panel.project_code, frameId: panel.id });
    // Auto-advance only for whole-wire prepare (drawer), not staged actions
    if (autoAdvance && nextCrimp?.overall === 'COMPLETED') {
      const nextPending = filterActive
        ? filteredIndexes.find(index => {
          if (index <= activeIdx) return false;
          const st = updated[String(index)] ?? DEFAULT_CABLE_STATUS;
          return st.crimping?.required && st.crimping?.overall !== 'COMPLETED';
        })
        : (() => {
          for (let i = activeIdx + 1; i < total; i++) {
            const st = updated[String(i)] ?? DEFAULT_CABLE_STATUS;
            if (st.crimping?.required && st.crimping?.overall !== 'COMPLETED') return i;
          }
          return undefined;
        })();
      if (nextPending != null) {
        setActiveIdx(nextPending);
        setWorkingIdx(nextPending);
      }
    }
  };

  const doStageAction = async (stage: 'cut' | 'strip' | 'crimp') => {
    if (saving || !prepRequired || skippedNote) return;
    setSaving(true);
    setSavingStage(stage);
    try {
      const cable = cables[activeIdx];
      const opts = {
        remarks: undefined as string | undefined,
        expected_sno: cable?.sno,
        expected_ferrule: cable?.ferrule,
      };
      let res: any;
      if (stage === 'cut') {
        res = await techApi.cutWire(panel.id, activeIdx, {
          planned_length: cable?.length,
          ...opts,
        });
      } else if (stage === 'strip') {
        res = await techApi.stripWire(panel.id, activeIdx, opts);
      } else {
        res = await techApi.crimpWire(panel.id, activeIdx, opts);
      }
      if (res?.crimping) {
        doPrepareWireApplied({ crimping: res.crimping, wiring_locked: Boolean(res.wiring_locked), changed: Boolean(res.changed) });
      }
    } catch (err: any) {
      const data = err?.response?.data;
      const msg = typeof data?.message === 'string' ? data.message
        : typeof data?.message?.message === 'string' ? data.message.message
          : `${stage} failed. Try again.`;
      setToast(msg);
    } finally {
      setSaving(false);
      setSavingStage(null);
    }
  };

  const setModule = (module: TechnicianWorkspaceModule) => {
    if (workspaceModuleProp == null) {
      setWorkspaceModuleInternal(module);
    }
    onWorkspaceModuleChange?.(module);
    writeStoredWorkspaceModule(panel?.id, module);
    if (module === 'stripping' || module === 'crimping') {
      setCrimpView((prev) => (prev === 'report' ? 'wire' : prev));
    }
    setCrimpingGateMsg(null);
  };

  const setPrepView = (view: CrimpingWorkspaceView) => {
    // Report is its own dashboard module now — keep sub-view as wire|group only.
    const next = view === 'report' ? 'wire' : view;
    setCrimpView(next);
    writeStoredCrimpView(panel?.id, next);
  };

  useEffect(() => {
    const onOpenReport = () => {
      setModule('report');
    };
    window.addEventListener('dwes:open-crimping-report', onOpenReport);
    return () => window.removeEventListener('dwes:open-crimping-report', onOpenReport);
  });

  const saveCorrection = async (payload: { field: string; corrected_value: string; reason: string }) => {
    if (!canWire || isPaused || saving) {
      throw new Error('Correction not available in the current state');
    }
    setSaving(true);
    try {
      await techApi.correctCable(
        panel.id,
        activeIdx,
        payload.field,
        payload.corrected_value,
        payload.reason,
      );
      emitWorkflowChanged({ scope: 'wiring', projectCode: panel.project_code, frameId: panel.id });
      await new Promise<void>((resolve, reject) => {
        const request = detailRequests.begin();
        techApi.myAssignmentDetail(panel.id, request.signal).then(data => {
          if (!detailRequests.isLatest(request.id)) return resolve();
          setDetail(data);
          applyStatusMap(data.assignment.cable_status);
          resolve();
        }).catch(err => reject(err));
      });
      setToast('Correction saved');
    } catch (e: any) {
      setToast(e?.response?.data?.message || e?.message || 'Could not save correction');
      throw e;
    } finally {
      setSaving(false);
    }
  };

  const handleStart = async () => {
    setSaving(true);
    try {
      await techApi.start(panel.id);
      emitWorkflowChanged({ scope: 'wiring', projectCode: panel.project_code, frameId: panel.id });
      setLiveFromPanel({
        status: 'in_progress',
        project_name: panel.project_name,
        project_code: panel.project_code,
        panel_name: panel.panel_name,
      });
      onPanelUpdate();
      load();
    } catch { /* show via parent refresh */ }
    finally { setSaving(false); }
  };

  const handleResume = async () => {
    const ok = await dialog.confirm({
      title: 'Resume wiring',
      message: 'Resume cable execution for this panel from the paused state.',
      tone: 'save',
      confirmText: 'Resume',
      actionSummary: 'Continue Digital Wiring Schedule work on the selected panel.',
      entity: [
        { label: 'Project', value: panel.project_code, kind: 'project' },
        { label: 'Panel', value: panel.panel_name, kind: 'panel' },
      ],
    });
    if (!ok) return;
    setSaving(true);
    try {
      await techApi.resume(panel.id);
      emitWorkflowChanged({ scope: 'wiring', projectCode: panel.project_code, frameId: panel.id });
      setActiveIdx(workingIdx);
      onPanelUpdate();
    } catch { /* stay */ }
    finally { setSaving(false); }
  };

  const handleComplete = async () => {
    const ok = await dialog.confirm({
      title: 'Mark panel complete',
      message: `All ${total} cables are done. Mark this panel as completed and lock further wiring edits.`,
      tone: 'save',
      confirmText: 'Mark Complete',
      actionSummary: 'Set panel status to completed and submit for supervisor / QA review.',
      entity: [
        { label: 'Project', value: panel.project_code, kind: 'project' },
        { label: 'Panel', value: panel.panel_name, kind: 'panel' },
      ],
      counts: [{ label: 'cables completed', value: total }],
    });
    if (!ok) return;
    setSaving(true);
    try {
      await techApi.complete(panel.id);
      emitWorkflowChanged({ scope: 'wiring', projectCode: panel.project_code, frameId: panel.id });
      onPanelUpdate();
      onExit?.();
    } catch { /* retry */ }
    finally { setSaving(false); }
  };

  const confirmPause = async (reason: string) => {
    const elapsed = (panel.total_wiring_seconds || 0) + (
      panel.status === 'in_progress' && panel.started_at
        ? Math.floor((Date.now() - new Date(panel.started_at).getTime()) / 1000)
        : 0
    );
    setSaving(true);
    try {
      await techApi.pause(panel.id, elapsed, reason);
      emitWorkflowChanged({ scope: 'wiring', projectCode: panel.project_code, frameId: panel.id });
      onPanelUpdate();
      setShowPause(false);
      onExit?.();
    } catch { /* stay */ }
    finally { setSaving(false); }
  };

  const scheduleReady = Boolean(detail?.frame);
  const initialLoadPending = !detail && !loadError;
  const missingScheduleFile = Boolean(
    detail && !detail.frame && (detail.assignment?.cables_total ?? 0) > 0,
  );
  const wiringBodyBusy = initialLoadPending || saving;
  const activeDone = Boolean(status[String(activeIdx)]?.src && status[String(activeIdx)]?.dst);

  const handleResumeClick = () => {
    if (isPaused) {
      void handleResume();
      return;
    }
    if (activeIdx !== workingIdx) {
      setActiveIdx(workingIdx);
    }
  };

  const resumeDisabled = !scheduleReady || saving || (!isPaused && activeIdx === workingIdx);
  const resumeTitle = isPaused
    ? 'Resume wiring from the paused working wire'
    : activeIdx === workingIdx
      ? 'Already on current working wire'
      : 'Return to current working wire';

  const workspace = (
    <div
      ref={workspaceRef}
      className={`dwf-workspace wiring-workstation${tabletMode ? ' dwf-workspace--tablet-fullscreen' : ''}`}
      role="dialog"
      aria-modal={tabletMode ? 'true' : undefined}
      aria-label={`Digital Wiring Schedule — ${panel.panel_name}`}
      data-testid="digital-wiring-workspace"
    >
      <header className={`dwf-workspace-header dwf-workspace-header--clean${tabletMode ? ' dwf-workspace-header--tablet' : ''}`}>
        <div className="dwf-workspace-header-main">
          {tabletMode && (
            <button
              type="button"
              className="dwf-workspace-back"
              onClick={() => setTabletMode(false)}
              aria-label="Back / Exit View"
              title="Back / Exit View"
            >
              <ArrowLeft size={18} />
              <span>Back / Exit View</span>
            </button>
          )}
          <div className="dwf-workspace-identity">
            <div className="dwf-workspace-kicker">Digital Wiring Schedule</div>
            {projectPanelLine ? (
              <p className="dwf-workspace-project-line" aria-live="polite">
                {projectPanelLine}
              </p>
            ) : null}
          </div>
        </div>

        <div className="dwf-workspace-header-controls">
          <div className="dwf-exec-mode" role="group" aria-label="Technician workspace module">
            <button
              type="button"
              className={`dwf-exec-mode__btn${workspaceModule === 'wiring' ? ' is-active' : ''}`}
              onClick={() => setModule('wiring')}
              aria-pressed={workspaceModule === 'wiring'}
            >
              DIGITAL WIRING
            </button>
            <button
              type="button"
              className={`dwf-exec-mode__btn${workspaceModule === 'stripping' ? ' is-active' : ''}`}
              onClick={() => setModule('stripping')}
              aria-pressed={workspaceModule === 'stripping'}
            >
              STRIPPING
            </button>
            <button
              type="button"
              className={`dwf-exec-mode__btn${workspaceModule === 'crimping' ? ' is-active' : ''}`}
              onClick={() => setModule('crimping')}
              aria-pressed={workspaceModule === 'crimping'}
            >
              CRIMPING
            </button>
            <button
              type="button"
              className={`dwf-exec-mode__btn${workspaceModule === 'report' ? ' is-active' : ''}`}
              onClick={() => setModule('report')}
              aria-pressed={workspaceModule === 'report'}
            >
              CRIMPING REPORT
            </button>
          </div>
          {workspaceModule === 'stripping' || workspaceModule === 'crimping' ? (
            <div className="dwf-exec-mode dwf-exec-mode--sub" role="group" aria-label="Preparation workspace view">
              <button type="button" className={`dwf-exec-mode__btn${crimpView === 'wire' ? ' is-active' : ''}`} onClick={() => setPrepView('wire')} aria-pressed={crimpView === 'wire'}>WIRE VIEW</button>
              <button type="button" className={`dwf-exec-mode__btn${crimpView === 'group' ? ' is-active' : ''}`} onClick={() => setPrepView('group')} aria-pressed={crimpView === 'group'}>GROUP VIEW</button>
            </div>
          ) : null}
          {onOpenLiveTb ? (
            <button
              type="button"
              className="btn-secondary btn-sm live-tb-open-btn"
              onClick={() => {
                onOpenLiveTb();
              }}
              title="Open LIVE ENDPOINT VIEW for the active wire"
              aria-label="LIVE ENDPOINT VIEW"
            >
              <MapPin size={16} />
              LIVE ENDPOINT VIEW
            </button>
          ) : null}
          {panel.status === 'assigned' && (
            <button type="button" className="dwf-action-btn start" onClick={() => setShowAck(true)} disabled={saving}>
              <Play size={16} /> Acknowledge and Start
            </button>
          )}
        </div>
      </header>

      {isPaused && (
        <div className="ws-pause-banner">
          <PauseCircle size={16} />
          <span className="ws-pause-text">Paused{panel.pause_reason ? ` — ${panel.pause_reason}` : ''}</span>
          <button type="button" className="ws-pause-resume" onClick={handleResume} disabled={saving}>
            <Play size={14} /> Resume
          </button>
        </div>
      )}

      <div className="dwf-workspace-body" aria-busy={wiringBodyBusy}>
      {loadError ? (
        <div className="dwf-workspace-inline-status" role="alert">
          <AlertTriangle size={18} className="text-red-500 shrink-0" aria-hidden />
          <div className="min-w-0">
            <p className="text-[13px] font-semibold text-primary">Could not load wiring schedule</p>
            <p className="text-[12px] text-muted mt-0.5">{loadError}</p>
            <div className="flex flex-wrap gap-2 mt-2">
              <button type="button" className="btn-primary btn-sm" onClick={() => { setLoadError(null); load(); }}>Retry</button>
              <button type="button" className="btn-secondary btn-sm" onClick={() => onExit?.()}>Back to panels</button>
            </div>
          </div>
        </div>
      ) : initialLoadPending ? (
        <div className="dwf-workspace-inline-status dwes-loader-inline-panel" aria-live="polite">
          <DwesLoadingIndicator label="Loading wiring schedule…" size="sm" />
        </div>
      ) : missingScheduleFile ? (
        <div className="dwf-workspace-inline-status" role="status">
          <AlertTriangle size={18} className="text-amber-500 shrink-0" aria-hidden />
          <div>
            <p className="text-[13px] font-semibold text-primary">Wiring schedule file missing</p>
            <button type="button" className="btn-primary btn-sm mt-2" onClick={() => onExit?.()}>Back to panels</button>
          </div>
        </div>
      ) : workspaceModule === 'report' ? (
        <TechnicianCrimpingReport
          assignmentId={panel.id}
          panelName={panel.panel_name}
          projectCode={panel.project_code}
          technicianName={user?.full_name}
          cables={cables}
          status={status}
          activeIndex={activeIdx}
          onSelectWire={(idx) => {
            setActiveIdx(idx);
            setWorkingIdx(idx);
            setModule('crimping');
            setPrepView('wire');
          }}
        />
      ) : (workspaceModule === 'stripping' || workspaceModule === 'crimping') && crimpView === 'group' ? (
        <CrimpingGroupView
          assignmentId={panel.id}
          projectCode={panel.project_code}
          cables={cables}
          status={status}
          canEdit={Boolean(scheduleReady && canWire && !isPaused)}
          saving={saving}
          operationsMode={workspaceModule === 'stripping' ? 'strip' : 'crimp'}
          onStatusPatch={setStatus}
          onSelectWire={(idx) => {
            setActiveIdx(idx);
            setWorkingIdx(idx);
            setPrepView('wire');
          }}
          onBusy={setSaving}
          onToast={setToast}
          onWorkflow={() => emitWorkflowChanged({ scope: 'wiring', projectCode: panel.project_code, frameId: panel.id })}
        />
      ) : (
      <DigitalWiringFrame
        cables={cables}
        status={status}
        alertRows={alertRows}
        activeIndex={activeIdx}
        onActiveIndexChange={handleActiveIndexJump}
        mapping={mapping}
        excelHeaders={detail?.frame?.excel_headers}
        fullViewOpen={fullViewOpen}
        setFullViewOpen={setFullViewOpen}
        scheduleFilter={scheduleFilter}
        tagQuery={tagQuery}
        equipmentQuery={equipmentQuery}
        onEquipmentQueryChange={onEquipmentQueryChange}
        activeCorrections={activeCorrections}
        onShowCorrectionHistory={() => setShowCorrectionHistory(true)}
        canEditCorrections={Boolean(scheduleReady && canWire && !isPaused)}
        correctableFields={correctableFields}
        correctionBusy={saving}
        onSaveCorrection={saveCorrection}
        executionMode={executionMode}
      />
      )}
      </div>

      {crimpingGateMsg || (workspaceModule === 'wiring' && wiringLockedActive) ? (
        <div className="dwf-crimp-gate" role="alert">
          <AlertTriangle size={16} aria-hidden />
          <span className="dwf-crimp-gate__msg">
            {crimpingGateMsg || 'Wire preparation pending.'}
          </span>
          <button
            type="button"
            className="dwf-action-btn dwf-action-btn--goto-crimp"
            onClick={() => setModule('stripping')}
          >
            GO TO STRIPPING
          </button>
        </div>
      ) : null}

      <div
        className={`dwf-action-bar dwf-action-bar--footer dwf-action-bar--exec dwf-action-bar--matrix${tabletMode ? ' dwf-action-bar--compact' : ''}`}
        role="toolbar"
        aria-label={
          workspaceModule === 'stripping' ? 'Stripping execution controls'
            : workspaceModule === 'crimping' ? 'Crimping execution controls'
              : workspaceModule === 'report' ? 'Crimping report controls'
                : 'Cable execution controls'
        }
        aria-busy={saving}
      >
        {panel.status === 'assigned' && (
          <button
            type="button"
            className="dwf-action-btn start dwf-action-btn--start"
            onClick={() => setShowAck(true)}
            disabled={saving}
            title="Acknowledge and start"
            aria-label="Start"
          >
            <Play size={16} aria-hidden /> START
          </button>
        )}

        <button
          type="button"
          className="dwf-action-btn dwf-action-btn--previous"
          onClick={goPreviousCable}
          disabled={!scheduleReady || !canGoPrevious || saving}
          title="Previous cable (does not change completion status)"
        >
          <ChevronLeft size={16} /> PREVIOUS
        </button>

        <button
          type="button"
          className="dwf-action-btn dwf-action-btn--next"
          onClick={goNextCable}
          disabled={!scheduleReady || !canGoNext || saving}
          title="Next cable (does not change completion status)"
        >
          NEXT <ChevronRight size={16} />
        </button>

        <button
          type="button"
          className="dwf-action-btn dwf-action-btn--resume"
          onClick={handleResumeClick}
          disabled={resumeDisabled}
          title={resumeTitle}
          aria-label={resumeTitle}
        >
          <Play size={16} /> RESUME
        </button>

        {(workspaceModule === 'stripping' || workspaceModule === 'crimping') && crimpView === 'wire' ? (
          <>
            {/* V2 Staged Controls — Mark Wire Cut / Both Ends Stripped / Mark Both Ends Crimped */}
            {workspaceModule === 'stripping' ? (
              <>
                <button
                  type="button"
                  className="dwf-action-btn dwf-action-btn--prepare-wire"
                  onClick={() => { void doStageAction('cut'); }}
                  disabled={!scheduleReady || !canWire || isPaused || saving || !prepRequired || cutDone || skippedNote}
                  title={cutDone ? 'Wire already cut' : 'Mark this wire cut to scheduled length'}
                  style={{ minHeight: 48 }}
                  data-testid="mark-wire-cut"
                >
                  {savingStage === 'cut' ? <Loader size={16} aria-hidden /> : <CheckCircle2 size={16} aria-hidden />} Mark Wire Cut
                </button>
                <button
                  type="button"
                  className="dwf-action-btn dwf-action-btn--prepare-wire"
                  onClick={() => { void doStageAction('strip'); }}
                  disabled={!scheduleReady || !canWire || isPaused || saving || !prepRequired || !cutDone || (!prepRework && stripDone) || skippedNote}
                  title={stripDone && !prepRework ? 'Both ends already stripped' : !cutDone ? 'Cut wire first' : prepRework ? 'Clear stripping rework / confirm both ends stripped' : 'Mark both applicable ends stripped'}
                  style={{ minHeight: 48 }}
                  data-testid="mark-both-ends-stripped"
                >
                  {savingStage === 'strip' ? <Loader size={16} aria-hidden /> : <CheckCircle2 size={16} aria-hidden />} Mark Both Ends Stripped
                </button>
              </>
            ) : (
              <button
                type="button"
                className="dwf-action-btn dwf-action-btn--prepare-wire"
                onClick={() => { void doStageAction('crimp'); }}
                disabled={!scheduleReady || !canWire || isPaused || saving || !prepRequired || !stripDone || (!prepRework && crimpDone) || skippedNote}
                title={crimpDone && !prepRework ? 'Both ends already crimped' : !stripDone ? 'Strip wire first' : prepRework ? 'Clear crimping rework / confirm both ends crimped' : 'Mark both applicable ends crimped'}
                style={{ minHeight: 48 }}
                data-testid="mark-wire-crimped"
              >
                {savingStage === 'crimp' ? <Loader size={16} aria-hidden /> : <CheckCircle2 size={16} aria-hidden />} Mark Both Ends Crimped
              </button>
            )}
            {/* Compat escape — PREPARE WIRE for rework / legacy only */}
            {prepRework || isLegacyPartial ? (
              <button
                type="button"
                className="dwf-action-btn dwf-action-btn--prepare-wire"
                onClick={() => setShowPrepareWire(true)}
                disabled={!scheduleReady || !canWire || isPaused || saving || skippedNote}
                title={prepRework ? 'Re-prepare this wire after rework' : 'Resolve legacy partial via full prepare'}
                style={{ minHeight: 44, fontSize: '0.85em', opacity: 0.85 }}
              >
                {prepRework ? 'RE-PREPARE WIRE' : 'PREPARE WIRE (compat)'}
              </button>
            ) : null}
            {/* V2 Stage badges + attribution */}
            {prepRequired ? (
              <span className="dwf-stage-badges" data-testid="stage-badges" style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: '0.75em', marginLeft: 4, flexWrap: 'wrap' }}>
                <span style={{ color: cutDone ? 'var(--t-success,#16a34a)' : 'var(--t-muted,#94a3b8)' }}>CUT {cutDone ? '✓' : '—'}</span>
                <span style={{ color: stripDone ? 'var(--t-success,#16a34a)' : 'var(--t-muted,#94a3b8)' }}>STRIPPED {stripDone ? '✓' : '—'}</span>
                <span style={{ color: crimpDone ? 'var(--t-success,#16a34a)' : 'var(--t-muted,#94a3b8)' }}>CRIMPED {crimpDone ? '✓' : '—'}</span>
                {isLegacyPartial ? <span style={{ color: '#d97706' }}>LEGACY PARTIAL</span> : null}
                {prepRework ? <span style={{ color: '#dc2626' }}>REWORK</span> : null}
                {prepRequired && cutDone && stripDone && crimpDone && !isLegacyPartial && !prepRework ? <span style={{ color: 'var(--t-success,#16a34a)', fontWeight: 600 }}>READY</span> : null}
              </span>
            ) : null}
            {/* Stage attribution (by / at) */}
            {prepRequired ? (
              <span className="dwf-stage-attribution" style={{ display: 'flex', gap: 8, fontSize: '0.7em', color: 'var(--t-muted,#64748b)', marginLeft: 4, flexWrap: 'wrap' }}>
                {activeSt.crimping?.cut?.by ? <span>Cut: {activeSt.crimping.cut.by ? `Tech #${activeSt.crimping.cut.by}` : ''}{activeSt.crimping.cut.at ? ` · ${new Date(activeSt.crimping.cut.at).toLocaleString()}` : ''}</span> : null}
                {activeSt.crimping?.wireStrip?.by ? <span>Strip: {`Tech #${activeSt.crimping.wireStrip.by}`}{activeSt.crimping.wireStrip.at ? ` · ${new Date(activeSt.crimping.wireStrip.at).toLocaleString()}` : ''}</span> : null}
                {activeSt.crimping?.wireCrimp?.by ? <span>Crimp: {`Tech #${activeSt.crimping.wireCrimp.by}`}{activeSt.crimping.wireCrimp.at ? ` · ${new Date(activeSt.crimping.wireCrimp.at).toLocaleString()}` : ''}</span> : null}
              </span>
            ) : null}
          </>
        ) : workspaceModule === 'wiring' ? (
          <>
            {prepNeedsAction && !skippedNote ? (
              <button
                type="button"
                className="dwf-action-btn dwf-action-btn--prepare-wire"
                onClick={() => setShowPrepareWire(true)}
                disabled={!scheduleReady || !canWire || isPaused || saving}
                title="Complete wire preparation before wiring"
                style={{ minHeight: 48 }}
              >
                <CheckCircle2 size={16} aria-hidden /> {prepRework ? 'RE-PREPARE WIRE' : 'PREPARE WIRE'}
              </button>
            ) : null}
            <button
              type="button"
              className="dwf-action-btn dwf-action-btn--finished"
              onClick={() => { void doCableAction('complete'); }}
              disabled={!scheduleReady || !canWire || isPaused || saving || activeDone || wiringLockedActive}
              title={wiringLockedActive
                ? 'Complete wire preparation before Wiring FINISHED on this wire'
                : 'Mark this cable finished and load the next cable'}
            >
              <CheckCircle2 size={16} aria-hidden /> FINISHED
            </button>

            <button
              type="button"
              className="dwf-action-btn dwf-action-btn--skip-wire"
              onClick={() => { void doCableAction('skip'); }}
              disabled={!scheduleReady || !canWire || isPaused || saving || activeDone}
              title="Mark this cable skipped, then load the next pending cable"
            >
              SKIP
            </button>

            <button
              type="button"
              className="dwf-action-btn dwf-action-btn--open-side"
              onClick={() => {
                setOpenSideChoice(null);
                setShowOpenSide(true);
              }}
              disabled={!scheduleReady || !canWire || isPaused || saving || activeDone}
              title="Mark source or destination end intentionally open"
              aria-haspopup="dialog"
              aria-expanded={showOpenSide}
            >
              OPEN SIDE
            </button>

            <button
              type="button"
              className="dwf-action-btn dwf-action-btn--correction"
              onClick={() => setShowCorrectionHistory(true)}
              disabled={!scheduleReady || saving || !cables[activeIdx]}
              title="Correction Centre — project/panel corrections and Excel"
              aria-label="Correction"
            >
              <Pencil size={15} aria-hidden /> CORRECTION
            </button>
          </>
        ) : null}

        {!isPaused ? (
          <button
            type="button"
            className="dwf-action-btn dwf-action-btn--pause"
            onClick={() => setShowPause(true)}
            disabled={!scheduleReady || panel.status !== 'in_progress' || saving}
            title="Pause"
          >
            <PauseCircle size={16} /> PAUSE
          </button>
        ) : null}

        {panel.status === 'in_progress' && allDone && workspaceModule === 'wiring' && (
          <button
            type="button"
            className="dwf-action-btn dwf-action-btn--project"
            onClick={handleComplete}
            disabled={saving}
            title="Mark frame complete"
          >
            <CheckCircle2 size={16} /> Complete Panel
          </button>
        )}
      </div>

      {showOpenSide && createPortal(
        <div className="dwf-open-side-root" role="presentation">
          <button
            type="button"
            className="dwf-open-side-backdrop"
            aria-label="Close open side dialog"
            onClick={() => {
              if (saving) return;
              setShowOpenSide(false);
              setOpenSideChoice(null);
            }}
          />
          <div
            className="dwf-open-side-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="dwf-open-side-title"
          >
            <h3 id="dwf-open-side-title" className="dwf-open-side-title">Open Side</h3>
            <p className="dwf-open-side-hint">
              Record which end is intentionally open. You can keep wiring this cable and mark it Finished later — the open-side status stays attached.
            </p>
            <div className="dwf-open-side-choices" role="radiogroup" aria-label="Open end choice">
              <button
                type="button"
                className={`dwf-open-side-choice dwf-open-side-choice--src${openSideChoice === 'source' ? ' is-selected' : ''}`}
                role="radio"
                aria-checked={openSideChoice === 'source'}
                onClick={() => setOpenSideChoice('source')}
                disabled={saving}
              >
                <span className="dwf-open-side-choice-label">Source End Open</span>
                <span className="dwf-open-side-choice-hint">Orange / red endpoint</span>
              </button>
              <button
                type="button"
                className={`dwf-open-side-choice dwf-open-side-choice--dst${openSideChoice === 'destination' ? ' is-selected' : ''}`}
                role="radio"
                aria-checked={openSideChoice === 'destination'}
                onClick={() => setOpenSideChoice('destination')}
                disabled={saving}
              >
                <span className="dwf-open-side-choice-label">Destination End Open</span>
                <span className="dwf-open-side-choice-hint">Indigo / purple endpoint</span>
              </button>
            </div>
            <div className="dwf-open-side-footer">
              <button
                type="button"
                className="btn-secondary btn-sm"
                disabled={saving}
                onClick={() => {
                  setShowOpenSide(false);
                  setOpenSideChoice(null);
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn-primary btn-sm"
                disabled={saving || !openSideChoice}
                onClick={() => {
                  if (!openSideChoice) return;
                  const action = openSideChoice === 'source' ? 'source_end_open' : 'destination_end_open';
                  void (async () => {
                    const ok = await doCableAction(action, false);
                    if (!ok) return;
                    setShowOpenSide(false);
                    setOpenSideChoice(null);
                  })();
                }}
              >
                Confirm
              </button>
            </div>
          </div>
        </div>,
        document.body,
      )}

      {showPause && createPortal(
        <PauseReasonModal
          assignmentId={panel.id}
          onClose={() => !saving && setShowPause(false)}
          onConfirm={confirmPause}
          onMidChange={async (targetTechnicianId, reason) => {
            setSaving(true);
            try {
              await techApi.executeMidChange(panel.id, targetTechnicianId, reason);
              emitWorkflowChanged({ scope: 'wiring', projectCode: panel.project_code, frameId: panel.id });
              onPanelUpdate();
              setShowPause(false);
              onExit?.();
            } catch (e: any) {
              setToast(e?.response?.data?.message || 'Mid change failed');
            } finally {
              setSaving(false);
            }
          }}
          busy={saving}
        />,
        document.body,
      )}

      {showAck && (
        <AssignmentAcknowledgmentModal
          panel={panel}
          technicianName={user?.full_name || 'Technician'}
          onClose={() => !saving && setShowAck(false)}
          onAcknowledge={async () => {
            await handleStart();
            setShowAck(false);
          }}
          busy={saving}
        />
      )}

      {showCorrectionHistory && (
        <WireCorrectionHistoryModal
          open={showCorrectionHistory}
          activeWireNumber={cables[activeIdx]?.sno ?? activeIdx + 1}
          projectCode={panel.project_code}
          projectName={panel.project_name}
          panelName={panel.panel_name}
          assignmentId={panel.id}
          corrections={allCorrections}
          correctedExcelPath={
            (detail as any)?.corrected_excel_display_path
            || allCorrections.find(c => (c as any).corrected_excel_display_path)?.corrected_excel_display_path
            || allCorrections.find(c => c.corrected_excel_filename)?.corrected_excel_filename
            || ''
          }
          onClose={() => setShowCorrectionHistory(false)}
        />
      )}

      <SkippedWireFilterPopup
        open={skippedFilterOpen}
        rows={skippedWireRows}
        onOpenWire={handleOpenSkippedWire}
        onClear={() => {
          onClearSkippedFilter?.();
        }}
        onClose={() => onSkippedFilterClose?.()}
      />

      {showPrepareWire ? (
        <PrepareWireDrawer
          open={showPrepareWire}
          assignmentId={panel.id}
          cableIndex={activeIdx}
          cable={cables[activeIdx]}
          status={activeSt}
          panelName={panel.panel_name}
          isRework={prepRework}
          busy={saving}
          onBusy={setSaving}
          onClose={() => setShowPrepareWire(false)}
          onPrepared={(res) => doPrepareWireApplied(res, true)}
          onError={(msg) => setToast(msg)}
        />
      ) : null}

      {toast && (
        <Toast message={toast} tone="success" onDismiss={() => setToast(null)} />
      )}
    </div>
  );

  if (tabletMode) {
    return createPortal(
      <div className="dwf-tablet-root" role="dialog" aria-modal="true" aria-label="Tablet wiring view">
        {workspace}
      </div>,
      document.body,
    );
  }

  return workspace;
}
