import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  AlertTriangle, ArrowLeft, CheckCircle2, ChevronLeft, ChevronRight, PauseCircle, Play, Pencil, MapPin,
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
  mergeOpenEnd,
  resolveLiveTbWireEnds,
  type ExtendedCableStatus,
  type ScheduleFilterMode,
} from './wiring-utils';
import type { CorrectableFieldOption, WireCorrectionView } from './SingleWireMatrixCard';
import { buildTechnicianPanelsSectionTitleParts } from '../../../utils/projectDisplay';

const SYNC_INTERVAL_MS = DWES_WIRING_SYNC_MS;
/** One end checked for longer than this → status chip blinks as an alert. */
const PARTIAL_ALERT_MS = 120_000;

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
  /** Lift active wire IDs for LIVE TB VIEW without remounting this workstation. */
  onActiveWireChange?: (snapshot: ActiveWireSnapshot | null) => void;
  /** Open LIVE TB VIEW overlay from the wiring header. */
  onOpenLiveTb?: () => void;
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
}: Props) {
  const dialog = useAppDialog();
  const { user } = useAuthStore();
  const setLiveFromPanel = useLiveWiringStore(s => s.setFromPanel);
  const detailRequests = useLatestRequest();
  const [detail, setDetail] = useState<any>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [status, setStatus] = useState<Record<string, ExtendedCableStatus>>({});
  const [saving, setSaving] = useState(false);
  const [showPause, setShowPause] = useState(false);
  const [showAck, setShowAck] = useState(false);
  const [showCorrectionHistory, setShowCorrectionHistory] = useState(false);
  const [showOpenSide, setShowOpenSide] = useState(false);
  const [openSideChoice, setOpenSideChoice] = useState<'source' | 'destination' | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [activeIdx, setActiveIdx] = useState(0);
  /** Execution head — updated by advance actions; PREVIOUS review does not move this. */
  const [workingIdx, setWorkingIdx] = useState(0);
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
      // Match API uses source_device/dest_device — values are *physical* TB headers only.
      source_device: tbEnds.source_tb,
      source_terminal: tbEnds.source_terminal,
      dest_device: tbEnds.dest_tb,
      dest_terminal: tbEnds.dest_terminal,
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
    setSaving(true);
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
      await techApi.cableAction(
        panel.id,
        activeIdx,
        action,
        action === 'skip' ? skipNote : undefined,
      );
      emitWorkflowChanged({ scope: 'wiring', projectCode: panel.project_code, frameId: panel.id });
      if (advance) {
        const nextPending = filterActive
          ? findNextPendingInIndexes(activeIdx, filteredIndexes, updated)
          : findNextPending(activeIdx, total, updated);
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
    } catch {
      setStatus(m => ({ ...m, [key]: prev }));
      setToast('Could not save cable status. Try again.');
      return false;
    } finally {
      setSaving(false);
    }
  };

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
          {onOpenLiveTb ? (
            <button
              type="button"
              className="btn-secondary btn-sm live-tb-open-btn"
              onClick={() => {
                onOpenLiveTb();
              }}
              title="Open LIVE TB VIEW for the active wire"
              aria-label="LIVE TB VIEW"
            >
              <MapPin size={16} />
              LIVE TB VIEW
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
      />
      )}
      </div>

      <div
        className={`dwf-action-bar dwf-action-bar--footer dwf-action-bar--exec dwf-action-bar--matrix${tabletMode ? ' dwf-action-bar--compact' : ''}`}
        role="toolbar"
        aria-label="Cable execution controls"
        aria-busy={saving}
      >
        {panel.status === 'assigned' && (
          <button
            type="button"
            className="dwf-action-btn start dwf-action-btn--start"
            onClick={() => setShowAck(true)}
            disabled={saving}
            title="Acknowledge and start wiring"
            aria-label="Start wiring"
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

        <button
          type="button"
          className="dwf-action-btn dwf-action-btn--finished"
          onClick={() => { void doCableAction('complete'); }}
          disabled={!scheduleReady || !canWire || isPaused || saving || activeDone}
          title="Mark this cable finished and load the next cable"
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

        {!isPaused ? (
          <button
            type="button"
            className="dwf-action-btn dwf-action-btn--pause"
            onClick={() => setShowPause(true)}
            disabled={!scheduleReady || panel.status !== 'in_progress' || saving}
            title="Pause wiring"
          >
            <PauseCircle size={16} /> PAUSE
          </button>
        ) : null}

        {panel.status === 'in_progress' && allDone && (
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
