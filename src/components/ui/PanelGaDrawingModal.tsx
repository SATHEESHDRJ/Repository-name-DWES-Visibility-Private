import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import Modal from '../Modal';
import FileViewer, { type FileViewerType } from './FileViewer';
import EngineeringModelViewer, { type EngineeringModelFormat } from './EngineeringModelViewer';
import PanelDrawingUploadModal from '../supervisor/PanelDrawingUploadModal';
import { AlertTriangle, CheckCircle, Download, FileText, Map, Plus, RefreshCw, ShieldCheck, Trash2, Upload, PenTool } from './icons';
import { projectsApi, techApi, engineeringApi } from '../../services/api';
import FlatPanelView from './FlatPanelView';
import OperationalTwin2D, { deriveWireVisualStatus } from '../technician/wiring/OperationalTwin2D';
import { useAppDialog } from '../AppDialogProvider';
import {
  CABLE_TWIN_CLASS_META,
  classifyCableTwin,
  missingTwinRequirements,
  type CableTwinClassification,
  type CableTwinEvidence,
} from '../../utils/cableTwinClassification';
import {
  displayValue as twinDisplayValue,
  ensureCableList,
  findNextPending,
  type ExtendedCableStatus,
} from '../technician/wiring/wiring-utils';
import type { Cable } from '../../types';
import { DwesGaViewerLoading } from './DwesLoadingIndicator';
import {
  canDownloadPanelDrawingSlot,
  canUploadPanelDrawingSlot,
  panelDrawingAssetForSlot,
  type PanelDrawingAsset,
  type PanelDrawingPackage,
  type PanelDrawingSlot,
} from '../../types/panelDrawing';
import {
  PANEL_MODEL_STATUS_LABELS,
  type PanelGeneratedModel,
  type PanelModelSpecPatchRequest,
  type PanelModelView,
  type PanelAutoExtractResponse,
  type PanelAutoExtractConfidence,
} from '../../types/panelModel';
import { useLatestRequest } from '../../hooks/useLatestRequest';
import { onFramesChanged } from '../../utils/projectFramesEvents';
import { onWorkflowChanged } from '../../utils/dwesRefreshEvents';
import { assignmentMatchesDeletion } from '../../utils/entityConsistency';
import { OPERATIONAL_TWIN_3D_ENABLED, PANEL_3D_ENABLED } from '../../config/features';
import {
  TWIN_NOT_READY_COPY,
  TWIN_NOT_READY_TITLE,
  TWIN_2D_UNAVAILABLE_COPY,
  TWIN_3D_UNAVAILABLE_COPY,
} from '../../constants/twinMessaging';
import { useAuthStore } from '../../store/useAuthStore';
import type { Ot3dPayload } from '../../types/ot3d';

const OperationalTwin3D = lazy(() => import('../technician/wiring/OperationalTwin3D'));
import {
  firstInvalidPanelDimension,
  PANEL_DIMENSION_MAX_MM,
  PANEL_DIMENSION_MIN_MM,
  validatePanelDimensions,
  type PanelDimensionErrors,
  type PanelDimensionKey,
} from '../../utils/panelModelRecovery';

interface SlotFileState {
  blob: Blob | null;
  loading: boolean;
  error: string;
}

type GaTab = '2d' | 'ot2d' | 'flat' | 'generated' | '3d' | 'revisions' | 'verify';

const EMPTY_FILE: SlotFileState = { blob: null, loading: false, error: '' };
const MODEL_FORMATS = new Set(['glb', 'gltf', 'obj', 'stl', 'fbx', 'step', 'stp', 'ifc']);
const NATIVE_IMAGE_FORMATS = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg']);

const COMPONENT_TYPE_OPTIONS = [
  'protection_relay', 'aux_relay', 'mcb', 'mccb', 'contactor', 'meter', 'ct_vt', 'switch',
  'lamp', 'push_button', 'heater', 'thermostat', 'power_supply', 'fuse', 'socket', 'timer',
  'terminal_block', 'device',
] as const;

interface SpecForm {
  width: string;
  height: string;
  depth: string;
  doors: string;
  mounting: boolean | null;
  gland: boolean | null;
  base: boolean | null;
  baseHeight: string;
  troughs: string;
  terminalRows: string;
  components: Array<{ label: string; type: string }>;
}

type OptionalSpecField = 'doors' | 'mounting' | 'gland' | 'base' | 'baseHeight' | 'troughs' | 'terminalRows' | 'components';

function normalizedFormat(value?: string) {
  return (value || '').toLowerCase().replace(/^\./, '');
}

function effectiveFormat(asset: PanelDrawingAsset) {
  if (asset.preview?.status === 'ready' || asset.preview?.status === 'source') {
    return normalizedFormat(asset.preview.format || asset.preview.filename.split('.').pop());
  }
  return normalizedFormat(asset.source_format || asset.original_name.split('.').pop());
}

function effectiveFileName(asset: PanelDrawingAsset) {
  return asset.preview?.status === 'ready' && asset.preview.filename
    ? asset.preview.filename
    : asset.original_name;
}

function fileViewerType(asset: PanelDrawingAsset): FileViewerType {
  const format = effectiveFormat(asset);
  if (format === 'pdf') return 'pdf';
  if (NATIVE_IMAGE_FORMATS.has(format)) return 'image';
  return 'download-only';
}

function isDirectlyViewable(asset: PanelDrawingAsset, slot: PanelDrawingSlot) {
  const format = effectiveFormat(asset);
  if (slot === '3d' && MODEL_FORMATS.has(format)) return true;
  if (asset.preview?.status === 'pending' || asset.preview?.status === 'failed') return false;
  return slot === '2d'
    ? format === 'pdf' || NATIVE_IMAGE_FORMATS.has(format)
    : MODEL_FORMATS.has(format);
}

function conversionMessage(asset: PanelDrawingAsset, slot: PanelDrawingSlot) {
  if (asset.preview?.status === 'pending') {
    return `${slot === '2d' ? 'Drawing' : '3D model'} preview is being prepared. The original file remains unchanged.`;
  }
  if (asset.preview?.status === 'failed') {
    return asset.preview.error || `${slot === '2d' ? 'Drawing' : '3D model'} preview could not be prepared. The original file remains available to authorized users.`;
  }
  if (slot === '2d') {
    return `A browser preview is not available for this ${asset.source_format.toUpperCase()} drawing.`;
  }
  return `A secure browser-compatible preview is required for this ${asset.source_format.toUpperCase()} model.`;
}

function saveBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  URL.revokeObjectURL(url);
}

function applyAutoExtractToForm(extract: PanelAutoExtractResponse['extract']): SpecForm {
  const f = extract.form;
  return {
    width: f.width_mm != null ? String(f.width_mm) : '',
    height: f.height_mm != null ? String(f.height_mm) : '',
    depth: f.depth_mm != null ? String(f.depth_mm) : '',
    doors: f.doors != null ? String(f.doors) : '',
    mounting: f.mounting_plate,
    gland: f.gland_plate,
    base: f.base_frame,
    baseHeight: f.base_frame_height_mm != null ? String(f.base_frame_height_mm) : '',
    troughs: f.wire_troughs != null ? String(f.wire_troughs) : '',
    terminalRows: f.terminal_rows != null ? String(f.terminal_rows) : '',
    components: f.components.map(c => ({ label: c.label, type: c.type })),
  };
}

function confidenceInputClass(conf?: PanelAutoExtractConfidence): string {
  if (!conf || conf === 'UNRESOLVED') return '';
  return `pm-field-conf pm-field-conf--${conf.toLowerCase().replace(/_/g, '-')}`;
}

function specToForm(model: PanelGeneratedModel | null): SpecForm {
  const spec = model?.spec;
  const known = (source?: string) => Boolean(source && source !== 'placeholder');
  return {
    width: spec?.enclosure.width.value_mm != null ? String(spec.enclosure.width.value_mm) : '',
    height: spec?.enclosure.height.value_mm != null ? String(spec.enclosure.height.value_mm) : '',
    depth: spec?.enclosure.depth.value_mm != null ? String(spec.enclosure.depth.value_mm) : '',
    doors: spec && known(spec.doors.source) ? String(spec.doors.count) : '',
    mounting: spec && known(spec.mounting_plate.source) ? spec.mounting_plate.present : null,
    gland: spec && known(spec.gland_plate.source) ? spec.gland_plate.present : null,
    base: spec && known(spec.base_frame.source) ? spec.base_frame.present : null,
    baseHeight: spec && known(spec.base_frame.source) ? String(spec.base_frame.height_mm) : '',
    troughs: spec && known(spec.wire_troughs.source) ? String(spec.wire_troughs.count) : '',
    terminalRows: spec && known(spec.terminal_rows.source) ? String(spec.terminal_rows.count) : '',
    components: (spec?.components ?? []).map(c => ({ label: c.label, type: c.type })),
  };
}

function formatDateTime(value?: string | null) {
  if (!value) return '—';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString();
}

function statusChip(status: PanelGeneratedModel['status'] | 'drawing_uploaded' | 'no_drawing') {
  return (
    <span className={`pm-status pm-status--${status}`}>
      {PANEL_MODEL_STATUS_LABELS[status] ?? status}
    </span>
  );
}

export default function PanelGaDrawingModal({
  projectCode,
  frameId,
  panelName,
  projectName,
  initialTab = '2d',
  twinAssignmentId,
  onClose,
}: {
  projectCode: string;
  frameId: string;
  panelName: string;
  projectName?: string;
  initialTab?: PanelDrawingSlot;
  /**
   * Cable Digital Twin mode: the technician's assignment id. The viewer follows the
   * assignment's current (next pending) schedule cable, shows an explicit route
   * classification, and offers the controlled fallback when no visualization data
   * exists. Absent → classic drawing-viewer behavior, unchanged.
   */
  twinAssignmentId?: number;
  onClose: () => void;
}) {
  const selectionKey = `${projectCode}\u0000${frameId}`;
  const selectionKeyRef = useRef(selectionKey);
  selectionKeyRef.current = selectionKey;
  const tabRefs = useRef<Partial<Record<GaTab, HTMLButtonElement | null>>>({});
  const dimensionRefs = useRef<Partial<Record<PanelDimensionKey, HTMLInputElement | null>>>({});
  const modelBlobCacheRef = useRef<Record<string, SlotFileState>>({});
  const {
    begin: beginPackageRequest,
    isLatest: isLatestPackageRequest,
    cancel: cancelPackageRequest,
  } = useLatestRequest();
  const {
    begin: beginModelRequest,
    isLatest: isLatestModelRequest,
    cancel: cancelModelRequest,
  } = useLatestRequest();
  const {
    begin: beginSlotFileRequest,
    isLatest: isLatestSlotFileRequest,
    cancel: cancelSlotFileRequest,
  } = useLatestRequest();
  const {
    begin: beginGeneratedFileRequest,
    isLatest: isLatestGeneratedFileRequest,
    cancel: cancelGeneratedFileRequest,
  } = useLatestRequest();
  const {
    begin: beginActionRequest,
    isLatest: isLatestActionRequest,
    cancel: cancelActionRequest,
  } = useLatestRequest();
  const [drawingPackage, setDrawingPackage] = useState<PanelDrawingPackage | null>(null);
  const [packageLoading, setPackageLoading] = useState(true);
  const [packageError, setPackageError] = useState('');
  // Cable Digital Twin opens on Operational 2D Twin — not Approved 2D / 3D.
  const startTab: GaTab = twinAssignmentId != null ? 'ot2d' : initialTab;
  const [activeTab, setActiveTab] = useState<GaTab>(startTab);
  const [visited, setVisited] = useState<Set<GaTab>>(() => new Set([startTab]));
  const [files, setFiles] = useState<Record<PanelDrawingSlot, SlotFileState>>({ '2d': EMPTY_FILE, '3d': EMPTY_FILE });
  const [downloadBusy, setDownloadBusy] = useState<PanelDrawingSlot | null>(null);
  const [uploadSlot, setUploadSlot] = useState<PanelDrawingSlot | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const [model, setModel] = useState<PanelModelView | null>(null);
  const [modelLoading, setModelLoading] = useState(true);
  const [modelError, setModelError] = useState('');

  /* ── Cable Digital Twin context (twin mode only) ─────────────────────────── */
  const twinMode = twinAssignmentId != null;
  const twinDialog = useAppDialog();
  const currentUserId = useAuthStore(s => s.user?.id);
  const [twinCable, setTwinCable] = useState<{ cable: Cable; index: number } | null>(null);
  const [twinCablesList, setTwinCablesList] = useState<Cable[]>([]);
  const [twinCableStatus, setTwinCableStatus] = useState<ExtendedCableStatus | null>(null);
  const [twinCableStatusMap, setTwinCableStatusMap] = useState<Record<string, ExtendedCableStatus>>({});
  const [twinPanelStatus, setTwinPanelStatus] = useState<string | undefined>();
  const [twinBusy, setTwinBusy] = useState(false);
  const [twinNotice, setTwinNotice] = useState('');
  const [twinWorkflowTick, setTwinWorkflowTick] = useState(0);
  /** Server-authoritative twin context (published geometry only); null until loaded. */
  const [twinCtx, setTwinCtx] = useState<any>(null);
  const [ot2d, setOt2d] = useState<any>(null);
  const [ot2dLoading, setOt2dLoading] = useState(false);
  const [ot2dError, setOt2dError] = useState<string | null>(null);
  const [ot3d, setOt3d] = useState<Ot3dPayload | null>(null);
  const [ot3dLoading, setOt3dLoading] = useState(false);
  const [ot3dError, setOt3dError] = useState<string | null>(null);
  useEffect(() => {
    if (!twinMode || !twinCable) {
      setTwinCtx(null);
      setOt2d(null);
      setOt2dError(null);
      setOt3d(null);
      setOt3dError(null);
      return;
    }
    let active = true;
    const cableRef = twinCable.cable.sno ?? twinCable.index + 1;
    setOt2dLoading(true);
    setOt2dError(null);
    engineeringApi.twinContext(projectCode, frameId, cableRef)
      .then(data => { if (active) setTwinCtx(data); })
      .catch((e: any) => {
        if (!active) return;
        if (e?.response?.status === 403 || e?.response?.status === 404) {
          onClose();
          return;
        }
        setTwinCtx(null);
      });
    engineeringApi.operationalTwin(projectCode, frameId, cableRef)
      .then(data => { if (active) setOt2d(data); })
      .catch((e: any) => {
        if (!active) return;
        if (e?.response?.status === 403 || e?.response?.status === 404) {
          onClose();
          return;
        }
        setOt2d(null);
        setOt2dError(e?.response?.data?.message || TWIN_2D_UNAVAILABLE_COPY);
      })
      .finally(() => { if (active) setOt2dLoading(false); });

    if (OPERATIONAL_TWIN_3D_ENABLED) {
      setOt3dLoading(true);
      setOt3dError(null);
      engineeringApi.operationalTwin3d(projectCode, frameId, cableRef)
        .then(data => { if (active) setOt3d(data); })
        .catch((e: any) => {
          if (!active) return;
          // OT3D readiness gates (e.g. GA not released → 403) must not close the
          // Cable Digital Twin modal — 2D Operational Twin remains the primary surface.
          setOt3d(null);
          const msg = e?.response?.data?.message;
          setOt3dError(
            (typeof msg === 'string' && msg.trim()) || TWIN_3D_UNAVAILABLE_COPY,
          );
        })
        .finally(() => { if (active) setOt3dLoading(false); });
    }

    return () => { active = false; };
  }, [frameId, onClose, projectCode, twinMode, twinCable, twinWorkflowTick]);
  useEffect(() => {
    if (!twinMode) return;
    let active = true;
    techApi.myAssignmentDetail(twinAssignmentId).then((data: any) => {
      if (!active) return;
      const twinMapping = data?.frame?.mapping || {};
      const expected = Math.max(
        data?.frame?.cables?.length ?? 0,
        data?.frame?.cable_count ?? 0,
        data?.assignment?.cables_total ?? 0,
      );
      const twinCables = ensureCableList(data?.frame?.cables, expected, twinMapping);
      if (twinCables.length === 0) {
        setTwinCable(null);
        setTwinCableStatus(null);
        return;
      }
      const twinStatus: Record<string, ExtendedCableStatus> = {};
      Object.entries(data?.assignment?.cable_status || {}).forEach(([k, v]: [string, any]) => {
        twinStatus[k] = {
          src: !!v.src,
          dst: !!v.dst,
          note: v.note || '',
          issue: !!v.issue,
          ...(v.technicianId != null ? { technicianId: Number(v.technicianId) } : {}),
        };
      });
      // The twin follows the current Digital Wiring Schedule cable: the next
      // pending row, matching the workstation's own starting rule.
      const idx = findNextPending(-1, twinCables.length, twinStatus) ?? 0;
      setTwinCablesList(twinCables);
      setTwinCableStatusMap(twinStatus);
      setTwinCable({ cable: twinCables[idx], index: idx });
      setTwinCableStatus(twinStatus[String(idx)] || null);
      setTwinPanelStatus(data?.assignment?.status || data?.frame?.status);
    }).catch((e: any) => {
      if (!active) return;
      if (e?.response?.status === 403 || e?.response?.status === 404) {
        onClose();
        return;
      }
      setTwinCable(null);
      setTwinCableStatus(null);
    });
    return () => { active = false; };
  }, [onClose, twinMode, twinAssignmentId, twinWorkflowTick]);

  useEffect(() => {
    if (!twinMode) return;
    const revoke = () => onClose();
    const unsubFrames = onFramesChanged(detail => {
      if (detail.action === 'deleted' && assignmentMatchesDeletion({ project_code: projectCode, frame_id: frameId }, detail)) {
        revoke();
      }
    });
    const unsubWorkflow = onWorkflowChanged(detail => {
      if (detail.frameId !== frameId || detail.projectCode !== projectCode) return;
      if (detail.scope === 'assignment') {
        revoke();
        return;
      }
      setTwinWorkflowTick(t => t + 1);
    });
    return () => {
      unsubFrames();
      unsubWorkflow();
    };
  }, [frameId, onClose, projectCode, twinMode]);

  useEffect(() => {
    if (twinMode) {
      setActiveTab('ot2d');
      setVisited(new Set(['ot2d']));
    }
  }, [twinMode, selectionKey]);

  const reportMappingIssue = async () => {
    if (!twinMode || !twinCable) return;
    const reason = await twinDialog.prompt({
      title: 'Report Mapping Issue',
      message: `Describe the drawing/mapping problem for cable ${twinCable.cable.sno ?? twinCable.index + 1}. Your supervisor sees this in the audit log.`,
      placeholder: 'e.g. Source device not on the drawing, terminal label mismatch…',
      confirmText: 'Report Issue',
    });
    if (reason == null || reason.trim().length < 3) return;
    setTwinBusy(true);
    try {
      await techApi.cableAction(twinAssignmentId!, twinCable.index, 'flag_issue', reason.trim());
      setTwinNotice('Mapping issue reported — recorded in the audit log.');
    } catch (issueError: any) {
      setTwinNotice(issueError?.response?.data?.message || 'Could not record the mapping issue.');
    } finally {
      setTwinBusy(false);
    }
  };
  const [viewModelId, setViewModelId] = useState<string | null>(null);
  const [modelBlobs, setModelBlobs] = useState<Record<string, SlotFileState>>({});
  const [form, setForm] = useState<SpecForm>(specToForm(null));
  const [optionalDirty, setOptionalDirty] = useState<Set<OptionalSpecField>>(() => new Set());
  const [dimensionErrors, setDimensionErrors] = useState<PanelDimensionErrors>({});
  const [focusDimension, setFocusDimension] = useState<PanelDimensionKey | null>(null);
  const [assumptionsAcknowledged, setAssumptionsAcknowledged] = useState(false);
  const [verificationNotes, setVerificationNotes] = useState('');
  const [busy, setBusy] = useState<'convert' | 'save' | 'approve' | 'autoExtract' | 'autoFix' | null>(null);
  const [extractFieldMeta, setExtractFieldMeta] = useState<Record<string, { confidence: PanelAutoExtractConfidence; source: string; source_page?: string | null }>>({});
  const [autoFixIssues, setAutoFixIssues] = useState<PanelAutoExtractResponse['extract']['auto_fix']['issues']>([]);
  const [actionError, setActionError] = useState('');
  const [actionNotice, setActionNotice] = useState('');

  // Hard reset whenever the active Project or Panel changes — no stale cross-panel data.
  useEffect(() => {
    cancelPackageRequest();
    cancelModelRequest();
    cancelSlotFileRequest();
    cancelGeneratedFileRequest();
    cancelActionRequest();
    setDrawingPackage(null);
    setPackageLoading(true);
    setPackageError('');
    setFiles({ '2d': EMPTY_FILE, '3d': EMPTY_FILE });
    setDownloadBusy(null);
    setModel(null);
    setModelLoading(true);
    setModelError('');
    setViewModelId(null);
    modelBlobCacheRef.current = {};
    setModelBlobs({});
    setForm(specToForm(null));
    setOptionalDirty(new Set());
    setDimensionErrors({});
    setFocusDimension(null);
    setAssumptionsAcknowledged(false);
    setVerificationNotes('');
    setBusy(null);
    setActionError('');
    setActionNotice('');
    const nextTab: GaTab = twinAssignmentId != null ? 'ot2d' : initialTab;
    setActiveTab(nextTab);
    setVisited(new Set([nextTab]));
  }, [
    cancelActionRequest,
    cancelGeneratedFileRequest,
    cancelModelRequest,
    cancelPackageRequest,
    cancelSlotFileRequest,
    projectCode,
    frameId,
    initialTab,
    twinAssignmentId,
  ]);

  useEffect(() => {
    setVisited(current => (current.has(activeTab) ? current : new Set(current).add(activeTab)));
  }, [activeTab]);

  useEffect(() => {
    if (activeTab !== 'verify' || !focusDimension) return;
    const timer = window.setTimeout(() => {
      const input = dimensionRefs.current[focusDimension];
      input?.scrollIntoView({ block: 'center', behavior: 'smooth' });
      input?.focus({ preventScroll: true });
      setFocusDimension(null);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [activeTab, focusDimension]);

  const loadPackage = useCallback(async () => {
    const request = beginPackageRequest();
    setPackageLoading(true);
    setPackageError('');
    try {
      const data = await projectsApi.panelDrawing(projectCode, frameId, request.signal) as PanelDrawingPackage;
      if (!isLatestPackageRequest(request.id)) return;
      if (data.project_code !== projectCode || data.frame_id !== frameId) {
        throw new Error('The drawing response did not match the selected project and panel.');
      }
      setDrawingPackage(data);
    } catch (err: any) {
      if (!isLatestPackageRequest(request.id) || request.signal.aborted) return;
      setDrawingPackage(null);
      setPackageError(err?.response?.data?.message || err?.message || 'Unable to load the drawing record for this panel.');
    } finally {
      if (isLatestPackageRequest(request.id)) setPackageLoading(false);
    }
  }, [beginPackageRequest, frameId, isLatestPackageRequest, projectCode]);

  const loadModel = useCallback(async () => {
    // 3D hidden: never call the generated-model API. The backend route and its data
    // stay intact; the viewer simply does not consult them.
    if (!PANEL_3D_ENABLED) {
      setModel(null);
      setModelError('');
      setModelLoading(false);
      return;
    }
    const request = beginModelRequest();
    setModelLoading(true);
    setModelError('');
    try {
      const data = await projectsApi.panelModel(projectCode, frameId, request.signal) as PanelModelView;
      if (!isLatestModelRequest(request.id)) return;
      if (data.project_code !== projectCode || data.frame_id !== frameId) {
        throw new Error('The generated-model response did not match the selected project and panel.');
      }
      setModel(data);
      setViewModelId(data.current?.id ?? null);
      setForm(specToForm(data.current));
      setOptionalDirty(new Set());
      setDimensionErrors({});
      setAssumptionsAcknowledged(false);
      setVerificationNotes(data.current?.verification_notes ?? data.current?.manual_entry?.verification_notes ?? '');
      modelBlobCacheRef.current = {};
      setModelBlobs({});
    } catch (err: any) {
      if (!isLatestModelRequest(request.id) || request.signal.aborted) return;
      setModel(null);
      setModelError(err?.response?.data?.message || err?.message || 'Unable to load the generated-model record for this panel.');
    } finally {
      if (isLatestModelRequest(request.id)) setModelLoading(false);
    }
  }, [beginModelRequest, frameId, isLatestModelRequest, projectCode]);

  useEffect(() => { void loadPackage(); }, [loadPackage, refreshKey]);
  useEffect(() => { void loadModel(); }, [loadModel, refreshKey]);

  useEffect(() => {
    if (!drawingPackage) {
      cancelSlotFileRequest();
      return;
    }
    setFiles({ '2d': EMPTY_FILE, '3d': EMPTY_FILE });
    const viewableSlots = (['2d', '3d'] as PanelDrawingSlot[]).filter(slot => {
      const asset = panelDrawingAssetForSlot(drawingPackage, slot);
      return Boolean(asset && isDirectlyViewable(asset, slot));
    });
    if (!viewableSlots.length) {
      cancelSlotFileRequest();
      return;
    }
    const request = beginSlotFileRequest();

    viewableSlots.forEach(slot => {
      setFiles(current => ({ ...current, [slot]: { blob: null, loading: true, error: '' } }));
      projectsApi.panelDrawingSlotFile(projectCode, frameId, slot, request.signal)
        .then(blob => {
          if (isLatestSlotFileRequest(request.id)) {
            setFiles(current => ({ ...current, [slot]: { blob, loading: false, error: '' } }));
          }
        })
        .catch((err: any) => {
          if (isLatestSlotFileRequest(request.id) && !request.signal.aborted) {
            setFiles(current => ({
              ...current,
              [slot]: {
                blob: null,
                loading: false,
                error: err?.response?.data?.message || err?.message || `Unable to load the ${slot === '2d' ? 'drawing' : '3D model'}.`,
              },
            }));
          }
        });
    });

    return () => {
      if (isLatestSlotFileRequest(request.id)) cancelSlotFileRequest();
    };
  }, [
    beginSlotFileRequest,
    cancelSlotFileRequest,
    drawingPackage,
    frameId,
    isLatestSlotFileRequest,
    projectCode,
  ]);

  // The model revision being viewed (defaults to the current one).
  const viewedModel: PanelGeneratedModel | null = useMemo(() => {
    if (!model) return null;
    if (viewModelId) return model.history.find(m => m.id === viewModelId) ?? model.current;
    return model.current;
  }, [model, viewModelId]);

  const updateModelBlobState = useCallback((id: string, state: SlotFileState) => {
    modelBlobCacheRef.current = { ...modelBlobCacheRef.current, [id]: state };
    setModelBlobs(current => ({ ...current, [id]: state }));
  }, []);

  // Lazily stream the viewed model's GLB when a 3D-bearing tab is open.
  useEffect(() => {
    if (!viewedModel?.model_file || (activeTab !== 'generated' && activeTab !== 'verify')) {
      cancelGeneratedFileRequest();
      return;
    }
    const id = viewedModel.id;
    if (modelBlobCacheRef.current[id]?.blob) return;
    const request = beginGeneratedFileRequest();
    updateModelBlobState(id, { blob: null, loading: true, error: '' });
    projectsApi.panelModelFile(projectCode, frameId, id, request.signal)
      .then(blob => {
        if (isLatestGeneratedFileRequest(request.id)) {
          updateModelBlobState(id, { blob, loading: false, error: '' });
        }
      })
      .catch((err: any) => {
        if (isLatestGeneratedFileRequest(request.id) && !request.signal.aborted) {
          updateModelBlobState(id, {
            blob: null,
            loading: false,
            error: err?.response?.data?.message || 'Unable to load the generated 3D model.',
          });
        }
      });
    return () => {
      if (isLatestGeneratedFileRequest(request.id)) cancelGeneratedFileRequest();
    };
  }, [
    activeTab,
    beginGeneratedFileRequest,
    cancelGeneratedFileRequest,
    frameId,
    isLatestGeneratedFileRequest,
    projectCode,
    updateModelBlobState,
    viewedModel,
  ]);

  const drawing2d = drawingPackage?.drawing_2d ?? null;
  const model3d = drawingPackage?.model_3d ?? null;
  const supervisor = Boolean(model?.permissions.can_convert || model?.permissions.can_correct || model?.permissions.can_approve);

  // Explicit route-confidence class for the Cable Digital Twin. DWES has no
  // terminal-coordinate maps, duct graphs, or approved cable routes yet, so those
  // evidence flags are honestly false — the class can currently only be
  // drawing-reference (assets exist) or unavailable (nothing approved exists).
  // Evidence: the server twin-context (published geometry only) is authoritative
  // when available; the asset-based client evidence is the offline fallback.
  const twinEvidence: CableTwinEvidence = useMemo(() => ({
    hasApprovedDrawing: Boolean(twinCtx ? twinCtx.hasApprovedDrawing : drawing2d),
    hasStructuredModel: twinCtx
      ? Boolean(twinCtx.hasStructuredModel)
      : PANEL_3D_ENABLED && Boolean(model3d || model?.current),
    hasTerminalMap: Boolean(twinCtx?.geometry?.terminals > 0),
    hasDuctGraph: Boolean(twinCtx?.geometry?.duct_nodes > 0 && twinCtx?.geometry?.duct_segments > 0),
    hasApprovedRoute: Boolean(twinCtx?.geometry?.approved_routes > 0),
  }), [twinCtx, drawing2d, model3d, model]);
  const twinClassification: CableTwinClassification = useMemo(() => {
    const serverCls = twinCtx?.classification;
    const known: CableTwinClassification[] = ['approved-exact', 'calculated-guidance', 'endpoint-guidance', 'drawing-reference', 'unavailable'];
    if (serverCls && known.includes(serverCls)) return serverCls as CableTwinClassification;
    return classifyCableTwin(twinEvidence);
  }, [twinCtx, twinEvidence]);
  const twinMissing: string[] = useMemo(() => (
    Array.isArray(twinCtx?.missing_requirements)
      ? twinCtx.missing_requirements
      : missingTwinRequirements(twinEvidence)
  ), [twinCtx, twinEvidence]);

  // With the 3D feature off this is a 2D-only viewer: Flat 3D, generated-3D,
  // uploaded-3D, and side-by-side verify tabs are hidden. Cable Digital Twin
  // always exposes Operational 2D Twin. Revisions stays (2D history).
  const availableTabs: GaTab[] = useMemo(() => {
    const tabs: GaTab[] = [];
    if (twinMode) tabs.push('ot2d');
    // Technicians open twin mode (2D Operational Twin) — hide Approved 2D tab.
    // Supervisors use classic drawing-viewer mode and keep Approved Drawing access.
    if (drawing2d && !twinMode) tabs.push('2d');
    // Flat 3D: twin mode + published geometry + explicit 3D feature flag only.
    if (
      PANEL_3D_ENABLED
      && twinMode
      && Array.isArray(twinCtx?.availableModes)
      && twinCtx.availableModes.includes('flat-3d')
    ) {
      tabs.push('flat');
    }
    if (PANEL_3D_ENABLED) {
      tabs.push('generated');
      const hasEngineering3d = twinMode && Array.isArray(twinCtx?.availableModes) && twinCtx.availableModes.includes('engineering-3d');
      if (model3d || hasEngineering3d) tabs.push('3d');
    }
    tabs.push('revisions');
    if (PANEL_3D_ENABLED && supervisor) tabs.push('verify');
    return tabs;
  }, [drawing2d, model3d, supervisor, twinMode, twinCtx]);

  useEffect(() => {
    if (!packageLoading && !modelLoading && !availableTabs.includes(activeTab)) {
      setActiveTab(availableTabs[0] ?? (twinMode ? 'ot2d' : '2d'));
    }
  }, [availableTabs, activeTab, packageLoading, modelLoading, twinMode]);

  const onTabKeyDown = (event: KeyboardEvent<HTMLButtonElement>, current: GaTab) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    if (!availableTabs.length) return;
    event.preventDefault();
    const index = Math.max(0, availableTabs.indexOf(current));
    const target = event.key === 'Home'
      ? availableTabs[0]
      : event.key === 'End'
        ? availableTabs[availableTabs.length - 1]
        : availableTabs[(index + (event.key === 'ArrowRight' ? 1 : -1) + availableTabs.length) % availableTabs.length];
    setActiveTab(target);
    tabRefs.current[target]?.focus();
  };

  const download = async (slot: PanelDrawingSlot) => {
    if (!drawingPackage || !canDownloadPanelDrawingSlot(drawingPackage, slot)) return;
    const asset = panelDrawingAssetForSlot(drawingPackage, slot);
    if (!asset) return;
    const requestedSelection = selectionKey;
    setDownloadBusy(slot);
    try {
      const blob = await projectsApi.panelDrawingSlotDownload(projectCode, frameId, slot);
      if (selectionKeyRef.current === requestedSelection) saveBlob(blob, asset.original_name);
    } finally {
      if (selectionKeyRef.current === requestedSelection) setDownloadBusy(null);
    }
  };

  // Only the 2D slot is offered while the 3D feature is hidden (no Upload/Replace 3D).
  const packageActions = useMemo(() => {
    if (!drawingPackage) return [];
    const slots: PanelDrawingSlot[] = PANEL_3D_ENABLED ? ['2d', '3d'] : ['2d'];
    return slots.filter(slot => canUploadPanelDrawingSlot(drawingPackage, slot));
  }, [drawingPackage]);

  const markOptionalDirty = (field: OptionalSpecField) => {
    setOptionalDirty(current => new Set(current).add(field));
  };

  const setDimensionValue = (key: PanelDimensionKey, value: string) => {
    setForm(current => ({ ...current, [key]: value }));
    setDimensionErrors(current => {
      if (!current[key]) return current;
      const next = { ...current };
      delete next[key];
      return next;
    });
  };

  const openManualRecovery = () => {
    if (!model?.current || !model.permissions.can_correct) return;
    setViewModelId(model.current.id);
    setVisited(current => new Set(current).add('verify'));
    setActiveTab('verify');
    setFocusDimension(firstInvalidPanelDimension({ width: form.width, height: form.height, depth: form.depth }) ?? 'width');
  };

  const requestFreshPanelData = (message: string) => {
    setActionError(message);
    setActionNotice('');
    setPackageLoading(true);
    setModelLoading(true);
    setAssumptionsAcknowledged(false);
    setRefreshKey(key => key + 1);
  };

  const runAutoExtractFill = async (regenerate: boolean) => {
    if (!model || busy) return;
    if (drawingPackage && drawingPackage.revision !== model.package_revision) {
      requestFreshPanelData('The drawing package changed. Reload before auto extract.');
      return;
    }
    const request = beginActionRequest();
    setBusy('autoExtract');
    setActionError('');
    setActionNotice('');
    try {
      const res = await projectsApi.panelModelAutoExtract(projectCode, frameId, model.package_revision, regenerate, request.signal);
      if (!isLatestActionRequest(request.id)) return;
      setForm(applyAutoExtractToForm(res.extract));
      const meta: typeof extractFieldMeta = {};
      for (const [key, field] of Object.entries(res.extract.fields)) {
        if (field && typeof field === 'object' && 'confidence' in field) {
          meta[key] = {
            confidence: field.confidence as PanelAutoExtractConfidence,
            source: String(field.source || ''),
            source_page: field.source_page,
          };
        }
      }
      setExtractFieldMeta(meta);
      setAutoFixIssues(res.extract.auto_fix.issues);
      setOptionalDirty(new Set(['doors', 'mounting', 'gland', 'base', 'baseHeight', 'troughs', 'terminalRows', 'components']));
      setDimensionErrors({});
      setVisited(current => new Set(current).add('verify'));
      setActiveTab('verify');
      if (res.model) {
        setModel(res.model);
        setViewModelId(res.model.current?.id ?? null);
        modelBlobCacheRef.current = {};
        setModelBlobs({});
      }
      setActionNotice(regenerate
        ? 'Auto Extract & Fill completed — review confidence markers and the regenerated preview before approval.'
        : `Auto Extract scanned ${res.extract.scanned_sources.length} source file(s) across ${res.extract.scanned_sources.reduce((n, s) => n + s.pages_scanned, 0)} page chunk(s).`);
    } catch (err: unknown) {
      if (!isLatestActionRequest(request.id)) return;
      const message = (err as { response?: { data?: { message?: string } }; message?: string })?.response?.data?.message
        || (err as { message?: string })?.message
        || 'Auto Extract & Fill failed.';
      setActionError(message);
    } finally {
      if (isLatestActionRequest(request.id)) setBusy(null);
    }
  };

  const runAutoFix = async () => {
    if (!model || busy) return;
    const request = beginActionRequest();
    setBusy('autoFix');
    setActionError('');
    try {
      const res = await projectsApi.panelModelAutoFix(projectCode, frameId, model.package_revision, request.signal);
      if (!isLatestActionRequest(request.id)) return;
      setAutoFixIssues(res.extract.auto_fix.issues);
      setForm(applyAutoExtractToForm(res.extract));
      setActionNotice(`Auto Fix revalidated ${res.extract.auto_fix.issues.length} issue(s).`);
    } catch (err: unknown) {
      const message = (err as { response?: { data?: { message?: string } }; message?: string })?.response?.data?.message
        || (err as { message?: string })?.message
        || 'Auto Fix failed.';
      setActionError(message);
    } finally {
      if (isLatestActionRequest(request.id)) setBusy(null);
    }
  };

  const runAction = async (kind: 'convert' | 'save' | 'approve') => {
    if (!model) return;
    if (drawingPackage && drawingPackage.revision !== model.package_revision) {
      requestFreshPanelData('The drawing package changed. DWES is loading the latest panel revision before you continue.');
      return;
    }

    let correctionPatch: PanelModelSpecPatchRequest | null = null;
    if (kind === 'save') {
      if (!model.current) return;
      const validation = validatePanelDimensions({ width: form.width, height: form.height, depth: form.depth });
      setDimensionErrors(validation.errors);
      const firstInvalid = firstInvalidPanelDimension({ width: form.width, height: form.height, depth: form.depth });
      if (firstInvalid) {
        setActionError('Enter valid verified width, height, and depth before regenerating.');
        setActionNotice('');
        setFocusDimension(firstInvalid);
        return;
      }
      if ((optionalDirty.has('base') || optionalDirty.has('baseHeight')) && form.base === true) {
        const baseHeight = Number(form.baseHeight);
        if (!form.baseHeight.trim() || !Number.isFinite(baseHeight) || baseHeight < 100 || baseHeight > 400) {
          setActionError('Base frame height must be between 100 and 400 mm when a base frame is present.');
          setActionNotice('');
          return;
        }
      }

      correctionPatch = {
        package_revision: model.package_revision,
        enclosure: {
          width_mm: validation.normalized.width!,
          height_mm: validation.normalized.height!,
          depth_mm: validation.normalized.depth!,
        },
      };
      if (optionalDirty.has('doors') && form.doors !== '') correctionPatch.doors = { count: Number(form.doors) };
      if (optionalDirty.has('mounting') && form.mounting !== null) correctionPatch.mounting_plate = { present: form.mounting };
      if (optionalDirty.has('gland') && form.gland !== null) correctionPatch.gland_plate = { present: form.gland };
      if ((optionalDirty.has('base') || optionalDirty.has('baseHeight')) && form.base !== null) {
        const baseHeight = Number(form.baseHeight);
        correctionPatch.base_frame = {
          present: form.base,
          ...(form.base && optionalDirty.has('baseHeight') && Number.isFinite(baseHeight)
            ? { height_mm: baseHeight }
            : {}),
        };
      }
      if (optionalDirty.has('troughs') && form.troughs !== '') correctionPatch.wire_troughs = { count: Number(form.troughs) };
      if (optionalDirty.has('terminalRows') && form.terminalRows !== '') correctionPatch.terminal_rows = { count: Number(form.terminalRows) };
      if (optionalDirty.has('components')) {
        correctionPatch.components = form.components
          .filter(component => component.label.trim())
          .map(component => ({ label: component.label.trim(), type: component.type }));
      }
      if (verificationNotes.trim()) correctionPatch.verification_notes = verificationNotes.trim();
    }

    if (kind === 'approve') {
      const current = model.current;
      if (!current?.model_file || current.status !== 'verification_required') {
        setActionError('A successfully generated model is required before approval.');
        return;
      }
      if (current.placeholders.length > 0 && !assumptionsAcknowledged) {
        setActionError('Acknowledge the listed assumptions before approving this model.');
        return;
      }
    }

    const request = beginActionRequest();
    setBusy(kind);
    setActionError('');
    setActionNotice('');
    try {
      let next: PanelModelView;
      let successNotice = '';
      if (kind === 'convert') {
        next = await projectsApi.panelModelConvert(projectCode, frameId, model.package_revision, request.signal) as PanelModelView;
        successNotice = next.current?.status === 'conversion_failed'
          ? 'Conversion completed without a model — see the reason below.'
          : `Model revision ${next.current?.revision ?? ''} generated — review and approve.`;
      } else if (kind === 'save') {
        next = await projectsApi.panelModelSpec(projectCode, frameId, model.current!.id, correctionPatch!, request.signal) as PanelModelView;
        successNotice = `Verified dimensions saved in model revision ${next.current?.revision ?? ''} — review the generated model before approval.`;
      } else {
        next = await projectsApi.panelModelApprove(
          projectCode,
          frameId,
          model.current!.id,
          model.package_revision,
          assumptionsAcknowledged,
          verificationNotes,
          request.signal,
        ) as PanelModelView;
        successNotice = 'Model approved. Assigned technicians can now view it.';
      }
      if (!isLatestActionRequest(request.id)) return;
      if (next.project_code !== projectCode || next.frame_id !== frameId) {
        throw new Error('The action response did not match the selected project and panel.');
      }
      setModel(next);
      setViewModelId(next.current?.id ?? null);
      setForm(specToForm(next.current));
      setOptionalDirty(new Set());
      setDimensionErrors({});
      setAssumptionsAcknowledged(false);
      setVerificationNotes(next.current?.verification_notes ?? next.current?.manual_entry?.verification_notes ?? '');
      modelBlobCacheRef.current = {};
      setModelBlobs({});
      setActionNotice(successNotice);
    } catch (err: any) {
      if (!isLatestActionRequest(request.id) || request.signal.aborted) return;
      const message = err?.response?.data?.message || err?.message || `The ${kind} action failed. Reload the panel and try again.`;
      if (err?.response?.status === 409) {
        requestFreshPanelData(`${message} DWES is loading the latest panel revision.`);
      } else {
        setActionError(message);
      }
    } finally {
      if (isLatestActionRequest(request.id)) setBusy(null);
    }
  };

  const updateComponent = (index: number, patch: Partial<{ label: string; type: string }>) => {
    markOptionalDirty('components');
    setForm(current => ({
      ...current,
      components: current.components.map((c, i) => (i === index ? { ...c, ...patch } : c)),
    }));
  };

  const renderModelViewer = (target: PanelGeneratedModel, compact = false) => {
    const state = modelBlobs[target.id] ?? EMPTY_FILE;
    if (!target.model_file) {
      return (
        <div className="ga-viewer-message" role="status">
          <FileText size={26} />
          <strong>{target.status_message || 'This model revision has no generated geometry.'}</strong>
        </div>
      );
    }
    if (state.error) {
      return <div className="ga-viewer-message" role="alert">{state.error}</div>;
    }
    if (!state.blob || state.loading) {
      return <DwesGaViewerLoading label="Loading generated 3D model…" />;
    }
    return (
      <EngineeringModelViewer
        blob={state.blob}
        fileName={target.model_file.filename}
        format={'glb' as EngineeringModelFormat}
        readOnly
        className={compact ? 'pm-model-viewer--compact' : undefined}
      />
    );
  };

  const renderGeneratedTab = () => {
    if (modelLoading) return <DwesGaViewerLoading label="Loading this panel’s generated-model record…" />;
    if (modelError) {
      return (
        <div className="ga-viewer-message" role="alert">
          <p>{modelError}</p>
          <button type="button" className="btn-secondary" onClick={() => setRefreshKey(key => key + 1)}><RefreshCw size={16} />Retry</button>
        </div>
      );
    }
    if (!model) return null;

    if (!viewedModel) {
      return (
        <div className="ga-viewer-message ga-viewer-message--empty">
          <FileText size={30} />
          <strong>
            {model.panel_status === 'no_drawing'
              ? 'No 2D drawing is uploaded for this panel yet.'
              : supervisor
                ? 'A 2D drawing is uploaded — no 3D model has been generated for this panel yet.'
                : 'No approved 3D model is available for this panel yet.'}
          </strong>
          <span>Project {projectCode} · Panel {panelName} · {statusChip(model.panel_status)}</span>
          {model.permissions.can_convert && (
            <button type="button" className="btn-primary" disabled={busy !== null} onClick={() => void runAction('convert')}>
              {busy === 'convert' ? 'Generating…' : 'Generate 3D Model from 2D Drawing'}
            </button>
          )}
        </div>
      );
    }

    const isHistorical = model.current && viewedModel.id !== model.current.id;
    return (
      <div className="pm-generated">
        <div className="pm-toolbar">
          {statusChip(viewedModel.status)}
          <span className="pm-meta">Rev {viewedModel.revision}</span>
          <span className="pm-meta">Confidence {Math.round((viewedModel.extraction.confidence || 0) * 100)}%</span>
          {viewedModel.manual_entry && (
            <span className="pm-meta">
              Verified dimensions · {viewedModel.manual_entry.entered_by_name} · {formatDateTime(viewedModel.manual_entry.entered_at)}
            </span>
          )}
          {viewedModel.placeholders.length > 0 && (
            <span className="pm-meta pm-meta--warn"><AlertTriangle size={14} /> {viewedModel.placeholders.length} placeholder(s)</span>
          )}
          {viewedModel.status === 'approved' && (
            <span className="pm-meta pm-meta--ok"><CheckCircle size={14} /> {viewedModel.verified_by_name} · {formatDateTime(viewedModel.approved_at)}</span>
          )}
          {isHistorical && (
            <button type="button" className="ga-filebar-action" onClick={() => setViewModelId(model.current?.id ?? null)}>
              Viewing historical revision — back to latest
            </button>
          )}
        </div>
        {viewedModel.status === 'conversion_failed' ? (
          <div className="ga-viewer-message ga-viewer-message--recovery" role="alert">
            <AlertTriangle size={28} />
            <strong>{viewedModel.status_message}</strong>
            {model.permissions.can_correct && model.current?.id === viewedModel.id && (
              <>
                <span>The original drawing remains available. Enter verified dimensions to create a new model revision.</span>
                <button type="button" className="btn-primary" onClick={openManualRecovery}>
                  Enter Dimensions &amp; Generate
                </button>
              </>
            )}
          </div>
        ) : renderModelViewer(viewedModel)}
      </div>
    );
  };

  const renderRevisionsTab = () => {
    if (packageLoading || (PANEL_3D_ENABLED && modelLoading)) {
      return <DwesGaViewerLoading label="Loading revision history…" />;
    }
    // 2D-only mode: the drawing package is the whole revision history.
    if (!PANEL_3D_ENABLED) {
      if (!drawingPackage) {
        return <div className="ga-viewer-message" role="alert">{packageError || 'Revision history is unavailable.'}</div>;
      }
      return (
        <div className="pm-revisions">
          <section>
            <h4>Drawing package · revision {drawingPackage.revision}</h4>
            <table className="pm-table">
              <thead><tr><th>Slot</th><th>File</th><th>Uploaded</th></tr></thead>
              <tbody>
                <tr>
                  <td>2D drawing</td>
                  <td>{drawing2d ? drawing2d.original_name : '—'}</td>
                  <td>{formatDateTime(drawing2d?.uploaded_at)}</td>
                </tr>
              </tbody>
            </table>
          </section>
        </div>
      );
    }
    if (!model) return <div className="ga-viewer-message" role="alert">{modelError || 'Revision history is unavailable.'}</div>;
    return (
      <div className="pm-revisions">
        <section>
          <h4>Drawing package · revision {model.package_revision}</h4>
          <table className="pm-table">
            <thead><tr><th>Slot</th><th>File</th><th>Uploaded</th></tr></thead>
            <tbody>
              <tr>
                <td>2D drawing</td>
                <td>{drawing2d ? drawing2d.original_name : '—'}</td>
                <td>{formatDateTime(drawing2d?.uploaded_at)}</td>
              </tr>
              <tr>
                <td>Uploaded 3D model</td>
                <td>{model3d ? model3d.original_name : '—'}</td>
                <td>{formatDateTime(model3d?.uploaded_at)}</td>
              </tr>
            </tbody>
          </table>
        </section>
        <section>
          <h4>Generated model revisions</h4>
          {model.history.length === 0 ? (
            <p className="pm-empty">No generated model revisions exist for this panel yet.</p>
          ) : (
            <table className="pm-table">
              <thead>
                <tr>
                  <th>Rev</th><th>Status</th><th>Generated</th><th>By</th><th>From pkg rev</th>
                  <th>Confidence</th><th>Placeholders</th><th>Approved</th><th>Superseded</th><th></th>
                </tr>
              </thead>
              <tbody>
                {model.history.map(revision => (
                  <tr key={revision.id} className={viewedModel?.id === revision.id ? 'is-viewing' : ''}>
                    <td>{revision.revision}</td>
                    <td>{statusChip(revision.status)}</td>
                    <td>{formatDateTime(revision.created_at)}</td>
                    <td>{revision.converted_by_name}</td>
                    <td>{revision.source_package_revision}</td>
                    <td>{Math.round((revision.extraction.confidence || 0) * 100)}%</td>
                    <td>{revision.placeholders.length}</td>
                    <td>{revision.approved_at ? `${revision.verified_by_name} · ${formatDateTime(revision.approved_at)}` : '—'}</td>
                    <td>{revision.superseded_at ? formatDateTime(revision.superseded_at) : '—'}</td>
                    <td>
                      {revision.model_file && (
                        <button
                          type="button"
                          className="ga-filebar-action"
                          onClick={() => { setViewModelId(revision.id); setActiveTab('generated'); }}
                        >
                          View
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      </div>
    );
  };

  const renderVerifyTab = () => {
    if (modelLoading || packageLoading) {
      return <DwesGaViewerLoading label="Loading the latest panel drawing and model revision…" />;
    }
    if (!model) return null;
    const current = model.current;
    const packageMatches = !drawingPackage || drawingPackage.revision === model.package_revision;
    const editable = model.permissions.can_correct && busy === null && packageMatches;
    const directDrawing = Boolean(drawing2d && isDirectlyViewable(drawing2d, '2d'));
    const canDownloadDrawing = Boolean(drawingPackage && canDownloadPanelDrawingSlot(drawingPackage, '2d'));
    const needsAcknowledgement = Boolean(current?.model_file && current.placeholders.length > 0);
    const canApproveCurrent = Boolean(
      model.permissions.can_approve
      && current?.status === 'verification_required'
      && current.model_file
      && packageMatches
      && (!needsAcknowledgement || assumptionsAcknowledged),
    );
    return (
      <div className="pm-verify">
        <div className="pm-verify-pane pm-verify-pane--2d">
          <div className="ga-drawing-filebar"><span>Original 2D drawing</span><strong>{drawing2d?.original_name ?? 'No 2D drawing uploaded'}</strong></div>
          {drawing2d && directDrawing ? (
            <FileViewer
              blob={files['2d'].blob}
              fileType={fileViewerType(drawing2d)}
              panelLabel={panelName}
              fileName={drawing2d.original_name}
              loading={files['2d'].loading}
              error={files['2d'].error}
              onRetry={() => setRefreshKey(key => key + 1)}
              onDownload={canDownloadDrawing ? () => void download('2d') : undefined}
              className="ga-file-viewer"
            />
          ) : drawing2d ? (
            <div className="ga-viewer-message ga-viewer-message--conversion" role={drawing2d.preview?.status === 'failed' ? 'alert' : 'status'}>
              <FileText size={28} />
              <strong>{conversionMessage(drawing2d, '2d')}</strong>
              <span>The original file still belongs to this selected Project and Panel.</span>
              {canDownloadDrawing && (
                <button type="button" className="btn-secondary" onClick={() => void download('2d')} disabled={downloadBusy === '2d'}>
                  <Download size={16} />{downloadBusy === '2d' ? 'Preparing…' : 'Download original'}
                </button>
              )}
            </div>
          ) : (
            <div className="ga-viewer-message">Upload a 2D drawing to enable conversion.</div>
          )}
        </div>
        <div className="pm-verify-pane pm-verify-pane--form">
          <div className="ga-drawing-filebar">
            <span>Generated 3D model</span>
            <strong>{current ? `Revision ${current.revision}` : 'Not generated yet'}</strong>
            {current && statusChip(current.status)}
          </div>
          <div className={`pm-verify-model${!current?.model_file ? ' is-pregeneration' : ''}`}>
            {current ? (current.status === 'conversion_failed'
              ? (
                <div className="ga-viewer-message" role="alert">
                  <AlertTriangle size={24} />
                  <strong>{current.status_message}</strong>
                  <span>Enter the verified enclosure dimensions and select Regenerate to create the 3D model.</span>
                </div>
              )
              : renderModelViewer(current, true))
              : (
                <div className="ga-viewer-message">
                  <span>Enter the verified enclosure dimensions and select Regenerate to create the 3D model.</span>
                </div>
              )}
          </div>

          {(actionError || actionNotice) && (
            <div className={`pm-action-note ${actionError ? 'is-error' : 'is-ok'}`} role={actionError ? 'alert' : 'status'}>
              {actionError || actionNotice}
            </div>
          )}

          <div className="pm-form" aria-label="Model verification and correction">
            <div className="pm-form-intro">
              <strong>Verified enclosure dimensions</strong>
              <span>Width, height, and depth are required. DWES stores the verified values in millimetres. Optional fields remain unspecified unless you explicitly change them.</span>
              {supervisor && model.permissions.can_correct && (
                <div className="flex flex-wrap gap-2 mt-2">
                  <button
                    type="button"
                    className="btn-primary"
                    disabled={!editable || busy !== null}
                    onClick={() => void runAutoExtractFill(true)}
                  >
                    {busy === 'autoExtract' ? 'Scanning drawing…' : 'Auto Extract & Fill'}
                  </button>
                  <button
                    type="button"
                    className="btn-secondary"
                    disabled={!editable || busy !== null}
                    onClick={() => void runAutoFix()}
                  >
                    {busy === 'autoFix' ? 'Revalidating…' : 'Auto Fix'}
                  </button>
                </div>
              )}
            </div>
            {autoFixIssues.length > 0 && (
              <div className="pm-auto-fix" role="status">
                <strong>Auto Fix ({autoFixIssues.length})</strong>
                <ul className="m-0 pl-4">
                  {autoFixIssues.slice(0, 12).map((issue, i) => (
                    <li key={`${issue.code}-${i}`} className={issue.severity === 'error' ? 'pm-field-error' : 'text-muted'}>{issue.message}</li>
                  ))}
                </ul>
              </div>
            )}
            <div className="pm-form-row">
              {(['width', 'height', 'depth'] as PanelDimensionKey[]).map(key => (
                <label key={key} className={`pm-required-field ${confidenceInputClass(extractFieldMeta[`${key}_mm`]?.confidence)}`}>
                  {key[0].toUpperCase()}{key.slice(1)} (mm)
                  <input
                    ref={element => { dimensionRefs.current[key] = element; }}
                    type="number"
                    inputMode="decimal"
                    min={PANEL_DIMENSION_MIN_MM}
                    max={PANEL_DIMENSION_MAX_MM}
                    step="any"
                    required
                    value={form[key]}
                    disabled={!editable}
                    aria-invalid={Boolean(dimensionErrors[key])}
                    aria-describedby={dimensionErrors[key] ? `pm-${key}-error` : undefined}
                    onChange={event => setDimensionValue(key, event.target.value)}
                  />
                  {extractFieldMeta[`${key}_mm`] && (
                    <span className="pm-field-source">
                      {extractFieldMeta[`${key}_mm`].confidence.replace(/_/g, ' ')}
                      {' · '}
                      {extractFieldMeta[`${key}_mm`].source}
                      {extractFieldMeta[`${key}_mm`].source_page ? ` · ${extractFieldMeta[`${key}_mm`].source_page}` : ''}
                    </span>
                  )}
                  {dimensionErrors[key] && <span id={`pm-${key}-error`} className="pm-field-error" role="alert">{dimensionErrors[key]}</span>}
                </label>
              ))}
              <label>Doors
                <select value={form.doors} disabled={!editable} onChange={event => { markOptionalDirty('doors'); setForm(value => ({ ...value, doors: event.target.value })); }}>
                  <option value="">Not specified</option>
                  {[1, 2, 3, 4].map(n => <option key={n} value={n}>{n}</option>)}
                </select>
              </label>
            </div>
            <div className="pm-form-row pm-form-row--optional">
              <label>Mounting plate
                <select value={form.mounting === null ? '' : String(form.mounting)} disabled={!editable} onChange={event => { markOptionalDirty('mounting'); setForm(value => ({ ...value, mounting: event.target.value === '' ? null : event.target.value === 'true' })); }}>
                  <option value="">Not specified</option><option value="true">Present</option><option value="false">Not present</option>
                </select>
              </label>
              <label>Gland plate
                <select value={form.gland === null ? '' : String(form.gland)} disabled={!editable} onChange={event => { markOptionalDirty('gland'); setForm(value => ({ ...value, gland: event.target.value === '' ? null : event.target.value === 'true' })); }}>
                  <option value="">Not specified</option><option value="true">Present</option><option value="false">Not present</option>
                </select>
              </label>
              <label>Base frame
                <select value={form.base === null ? '' : String(form.base)} disabled={!editable} onChange={event => { markOptionalDirty('base'); setForm(value => ({ ...value, base: event.target.value === '' ? null : event.target.value === 'true' })); }}>
                  <option value="">Not specified</option><option value="true">Present</option><option value="false">Not present</option>
                </select>
              </label>
              <label>Base height (mm)<input type="number" min={100} max={400} value={form.baseHeight} disabled={!editable || form.base !== true} onChange={event => { markOptionalDirty('baseHeight'); setForm(value => ({ ...value, baseHeight: event.target.value })); }} /></label>
              <label>Wire troughs
                <select value={form.troughs} disabled={!editable} onChange={event => { markOptionalDirty('troughs'); setForm(value => ({ ...value, troughs: event.target.value })); }}>
                  <option value="">Not specified</option>{[0, 1, 2, 3, 4, 5, 6].map(n => <option key={n} value={n}>{n}</option>)}
                </select>
              </label>
              <label>Terminal rows
                <select value={form.terminalRows} disabled={!editable} onChange={event => { markOptionalDirty('terminalRows'); setForm(value => ({ ...value, terminalRows: event.target.value })); }}>
                  <option value="">Not specified</option>{[0, 1, 2, 3, 4, 5].map(n => <option key={n} value={n}>{n}</option>)}
                </select>
              </label>
            </div>

            <div className="pm-components">
              <div className="pm-components-head">
                <strong>Components ({form.components.length})</strong>
                {editable && (
                  <button type="button" className="ga-filebar-action" onClick={() => { markOptionalDirty('components'); setForm(f => ({ ...f, components: [...f.components, { label: '', type: 'device' }] })); }}>
                    <Plus size={14} /> Add component
                  </button>
                )}
              </div>
              <div className="pm-components-list">
                {form.components.length === 0 && <p className="pm-empty">No components identified or added.</p>}
                {form.components.map((component, index) => (
                  <div className="pm-component-row" key={index}>
                    <input type="text" value={component.label} placeholder="Label (e.g. 86 Lockout Relay)" maxLength={60} disabled={!editable} onChange={e => updateComponent(index, { label: e.target.value })} />
                    <select value={component.type} disabled={!editable} onChange={e => updateComponent(index, { type: e.target.value })}>
                      {COMPONENT_TYPE_OPTIONS.map(t => <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>)}
                    </select>
                    {editable && (
                      <button type="button" aria-label={`Remove component ${index + 1}`} onClick={() => { markOptionalDirty('components'); setForm(f => ({ ...f, components: f.components.filter((_, i) => i !== index) })); }}>
                        <Trash2 size={15} />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {current && current.placeholders.length > 0 && (
              <div className="pm-placeholders" role="status">
                <strong><AlertTriangle size={14} /> Verification required — placeholder values in use:</strong>
                <ul>{current.placeholders.map(p => <li key={p}>{p}</li>)}</ul>
              </div>
            )}

            {current && current.extraction.notes.length > 0 && (
              <details className="pm-notes">
                <summary>Extraction notes ({current.extraction.notes.length}) · text quality {Math.round(current.extraction.text_quality * 100)}%</summary>
                <ul>{current.extraction.notes.slice(0, 12).map((n, i) => <li key={i}>{n}</li>)}</ul>
              </details>
            )}
            {current?.analysis && (
              <details className="pm-extraction-notes">
                <summary>GA / wiring comparison</summary>
                <p>GA detected: {current.analysis.ga_detected ? 'Yes' : 'No'} · confidence {Math.round(current.analysis.ga_confidence * 100)}%</p>
                <p>Schedule rows: {current.analysis.schedule_comparison.schedule_rows} · matched references: {current.analysis.schedule_comparison.matched_references.length}</p>
                {current.analysis.schedule_comparison.schedule_only_references.length > 0 && <p className="pm-field-error">Schedule-only: {current.analysis.schedule_comparison.schedule_only_references.join(', ')}</p>}
                {current.analysis.schedule_comparison.drawing_only_references.length > 0 && <p>Drawing-only: {current.analysis.schedule_comparison.drawing_only_references.join(', ')}</p>}
              </details>
            )}

            <label className="pm-verification-notes">
              Verification notes (optional)
              <textarea
                value={verificationNotes}
                maxLength={1000}
                disabled={!editable && !model.permissions.can_approve}
                placeholder="Record the source of the verified dimensions or other review notes."
                onChange={event => setVerificationNotes(event.target.value)}
              />
            </label>

            {needsAcknowledgement && (
              <label className="pm-assumption-ack">
                <input
                  type="checkbox"
                  checked={assumptionsAcknowledged}
                  disabled={busy !== null || !current?.model_file}
                  onChange={event => setAssumptionsAcknowledged(event.target.checked)}
                />
                <span>I reviewed and acknowledge every listed placeholder assumption for this model revision.</span>
              </label>
            )}

            <div className="pm-actions">
              {model.permissions.can_convert && !current && (
                <button type="button" className="btn-secondary" disabled={busy !== null} onClick={() => void runAction('convert')}>
                  {busy === 'convert' ? 'Generating…' : 'Generate 3D Model'}
                </button>
              )}
              {model.permissions.can_correct && current && (
                <button type="button" className="btn-primary" disabled={!editable} onClick={() => void runAction('save')}>
                  {busy === 'save' ? 'Regenerating…' : 'Regenerate 3D Model'}
                </button>
              )}
              {model.permissions.can_approve && (
                <button type="button" className="btn-primary" disabled={busy !== null || !canApproveCurrent} onClick={() => void runAction('approve')}>
                  <ShieldCheck size={16} /> {busy === 'approve' ? 'Approving…' : 'Approve model'}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  };

  const tabLabel: Record<GaTab, string> = twinMode ? {
    ot2d: 'Operational 2D Twin',
    '2d': 'Approved 2D',
    flat: 'Flat 3D',
    generated: 'Generated 3D',
    '3d': 'Engineering 3D',
    revisions: 'Revisions',
    verify: 'Side-by-Side Verify',
  } : {
    ot2d: 'Operational 2D Twin',
    '2d': 'GA Drawing',
    flat: 'Flat 3D',
    generated: 'Generated 3D View',
    '3d': 'Uploaded 3D Model',
    revisions: 'Revisions',
    verify: 'Side-by-Side Verify',
  };
  const twinMeta = CABLE_TWIN_CLASS_META[twinClassification];
  const ot2dWireStatus = deriveWireVisualStatus({
    src: twinCableStatus?.src,
    dst: twinCableStatus?.dst,
    note: twinCableStatus?.note,
    panelStatus: twinPanelStatus,
  });
  const twinWireStatusesBySno = useMemo(() => {
    const map: Record<string, ExtendedCableStatus> = {};
    twinCablesList.forEach((cable, idx) => {
      const snoKey = String(cable.sno ?? idx + 1);
      const st = twinCableStatusMap[String(idx)] ?? twinCableStatusMap[snoKey] ?? { src: false, dst: false, note: '', issue: false };
      // Prefer OT3D executionBySno for per-cable technician attribution (Mid Change).
      const exec = ot3d?.executionBySno?.[snoKey] ?? ot3d?.executionBySno?.[String(idx)];
      const merged: ExtendedCableStatus = {
        ...st,
        ...(exec ? {
          src: !!exec.src,
          dst: !!exec.dst,
          issue: !!exec.issue,
          ...(exec.technicianId != null ? { technicianId: exec.technicianId } : {}),
        } : {}),
      };
      map[snoKey] = merged;
      map[String(idx)] = merged;
    });
    return map;
  }, [twinCablesList, twinCableStatusMap, ot3d?.executionBySno]);
  const twinStatusRevision = useMemo(() => {
    let h = twinWorkflowTick;
    Object.values(twinCableStatusMap).forEach(s => {
      h += (s.src ? 1 : 0) + (s.dst ? 2 : 0) + (s.issue ? 4 : 0);
    });
    return h;
  }, [twinCableStatusMap, twinWorkflowTick]);

  return (
    <>
      <Modal
        title={twinMode ? 'Cable Digital Twin' : 'GA Drawing View'}
        subtitle={`${projectName || projectCode} · ${panelName} · Panel-specific · ${PANEL_3D_ENABLED && supervisor ? 'Supervisor review enabled' : 'Read-only viewer'}`}
        icon={twinMode ? <Map /> : <PenTool />}
        onClose={onClose}
        size="fullscreen"
        bodyClassName="modal-body-flush"
      >
        <div className="ga-drawing-shell">
          {twinMode && (
            <div className={`twin-context-bar twin-context-bar--${twinMeta.tone}`} role="status">
              <div className="twin-context-class min-w-0">
                <span className="twin-context-class-label">{twinMeta.label}</span>
                <span className="twin-context-class-desc">{twinMeta.description}</span>
              </div>
              {twinCable && (
                <div className="twin-context-cable" aria-label="Current cable">
                  <span className="twin-context-cable-item"><strong>Cable</strong> #{twinCable.cable.sno ?? twinCable.index + 1}</span>
                  <span className="twin-context-cable-item"><strong>Src</strong> {twinDisplayValue(twinCable.cable.source_device || twinCable.cable.source)}</span>
                  <span className="twin-context-cable-item"><strong>Dst</strong> {twinDisplayValue(twinCable.cable.dest_device || twinCable.cable.destination)}</span>
                  <span className="twin-context-cable-item"><strong>Colour</strong> {twinDisplayValue(twinCable.cable.color)}</span>
                  <span className="twin-context-cable-item"><strong>Size</strong> {twinDisplayValue(twinCable.cable.size)}</span>
                  {drawingPackage && <span className="twin-context-cable-item"><strong>Rev</strong> {drawingPackage.revision}</span>}
                </div>
              )}
              <button
                type="button"
                className="btn-secondary twin-context-report"
                onClick={() => void reportMappingIssue()}
                disabled={twinBusy || !twinCable}
                title="Record a drawing/mapping problem for this cable in the audit log"
              >
                Report Mapping Issue
              </button>
            </div>
          )}
          {twinMode && twinNotice && (
            <p className="twin-context-notice" role="status">{twinNotice}</p>
          )}
          {/* Which engineering inputs are still missing for a higher confidence
              class — informational only; never blocks permitted wiring. */}
          {twinMode && twinClassification !== 'approved-exact' && twinMissing.length > 0 && (
            <details className="twin-missing" role="note">
              <summary className="twin-missing-summary">
                Missing engineering data for a higher confidence class ({twinMissing.length})
              </summary>
              <ul className="twin-missing-list">
                {twinMissing.map(item => <li key={item}>{item}</li>)}
              </ul>
            </details>
          )}
          {/* Only when Operational 2D Twin also has nothing — Mode B schematic satisfies the twin. */}
          {twinMode && twinClassification === 'unavailable' && !packageLoading && !ot2d && !ot2dLoading && (
            <div className="twin-fallback" role="note">
              <h3 className="twin-fallback-title">{TWIN_NOT_READY_TITLE}</h3>
              <p className="twin-fallback-copy">
                {TWIN_NOT_READY_COPY}
              </p>
              {twinCable && (
                <div className="twin-fallback-details" aria-label="Cable details">
                  <h4 className="twin-fallback-details-title">Cable Details</h4>
                  <div className="twin-fallback-grid">
                    <span><strong>Project</strong> {projectName || projectCode}</span>
                    <span><strong>Panel</strong> {panelName}</span>
                    <span><strong>Cable No.</strong> #{twinCable.cable.sno ?? twinCable.index + 1}</span>
                    <span><strong>Source</strong> {twinDisplayValue(twinCable.cable.source_device || twinCable.cable.source)}{twinCable.cable.source_terminal ? ` : ${twinCable.cable.source_terminal}` : ''}</span>
                    <span><strong>Destination</strong> {twinDisplayValue(twinCable.cable.dest_device || twinCable.cable.destination)}{twinCable.cable.dest_terminal ? ` : ${twinCable.cable.dest_terminal}` : ''}</span>
                    <span><strong>Colour</strong> {twinDisplayValue(twinCable.cable.color)}</span>
                    <span><strong>Size</strong> {twinDisplayValue(twinCable.cable.size)}</span>
                    <span><strong>Drawing Rev</strong> {drawingPackage ? drawingPackage.revision : '—'}</span>
                    <span><strong>Classification</strong> {twinMeta.label}</span>
                  </div>
                </div>
              )}
              <div className="twin-fallback-actions">
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => setActiveTab('ot2d')}
                >
                  View Operational 2D Twin
                </button>
                <button type="button" className="btn-primary" onClick={onClose}>
                  Return to Digital Wiring Schedule
                </button>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => void reportMappingIssue()}
                  disabled={twinBusy || !twinCable}
                >
                  Report Mapping Issue
                </button>
              </div>
            </div>
          )}
          <div className="ga-drawing-tabs" role="tablist" aria-label="Panel drawing views">
            {availableTabs.map(tab => (
              <button
                key={tab}
                ref={element => { tabRefs.current[tab] = element; }}
                id={`ga-tab-${tab}`}
                type="button"
                role="tab"
                aria-controls={`ga-panel-${tab}`}
                aria-selected={activeTab === tab}
                tabIndex={activeTab === tab ? 0 : -1}
                className={activeTab === tab ? 'is-active' : ''}
                onClick={() => setActiveTab(tab)}
                onKeyDown={event => onTabKeyDown(event, tab)}
              >
                {tabLabel[tab]}
              </button>
            ))}

            <div className="ga-drawing-tab-actions">
              {PANEL_3D_ENABLED && model?.current && statusChip(model.current.status)}
              {packageActions.map(slot => (
                <button key={slot} type="button" className="ga-drawing-upload-action" onClick={() => setUploadSlot(slot)}>
                  <Upload size={15} />
                  <span>{panelDrawingAssetForSlot(drawingPackage!, slot) ? 'Replace' : 'Upload'} {slot === '2d' ? '2D' : '3D'}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="ga-drawing-panes">
              {/* Operational 2D Twin — primary Cable Digital Twin surface (Mode A/B).
                  Independent of drawing-package load so technicians always get a 2D path. */}
              {twinMode && (
                <section
                  id="ga-panel-ot2d"
                  role="tabpanel"
                  aria-labelledby="ga-tab-ot2d"
                  aria-hidden={activeTab !== 'ot2d'}
                  className={`ga-drawing-pane${activeTab === 'ot2d' ? ' is-active' : ''}`}
                >
                  {visited.has('ot2d') && (
                    <>
                    <OperationalTwin2D
                      payload={ot2d}
                      loading={ot2dLoading}
                      error={ot2dError}
                      wireStatus={ot2dWireStatus}
                      readOnly
                      drawingBlob={files['2d']?.blob ?? null}
                      drawingLoading={files['2d']?.loading}
                      drawingError={files['2d']?.error || null}
                      drawingName={drawing2d?.original_name ?? null}
                      scheduleCable={twinCable ? {
                        sno: twinCable.cable?.sno,
                        color: twinCable.cable?.color,
                        length: twinCable.cable?.length,
                        size: twinCable.cable?.size,
                        source: twinCable.cable?.source,
                        destination: twinCable.cable?.destination,
                      } : null}
                    />
                    {OPERATIONAL_TWIN_3D_ENABLED && (
                      <Suspense fallback={null}>
                        <OperationalTwin3D
                          payload={ot3d}
                          loading={ot3dLoading}
                          error={ot3dError}
                          wireStatusesBySno={twinWireStatusesBySno}
                          readOnly
                          projectCode={projectCode}
                          frameId={frameId}
                          currentUserId={currentUserId}
                          statusRevision={twinStatusRevision}
                          compact
                        />
                      </Suspense>
                    )}
                    </>
                  )}
                </section>
              )}

          {(PANEL_3D_ENABLED ? packageLoading && modelLoading : packageLoading) ? (
            activeTab !== 'ot2d' ? (
              <DwesGaViewerLoading label="Loading this panel’s drawing record…" />
            ) : null
          ) : packageError ? (
            activeTab !== 'ot2d' ? (
              <div className="ga-viewer-message" role="alert">
                <p>{packageError}</p>
                <button type="button" className="btn-secondary" onClick={() => setRefreshKey(key => key + 1)}><RefreshCw size={16} />Retry</button>
              </div>
            ) : null
          ) : (
            <>
              {(PANEL_3D_ENABLED ? (['2d', '3d'] as PanelDrawingSlot[]) : (['2d'] as PanelDrawingSlot[])).map(slot => {
                const asset = drawingPackage ? panelDrawingAssetForSlot(drawingPackage, slot) : null;
                if (!asset || !visited.has(slot)) return null;
                const state = files[slot];
                const active = activeTab === slot;
                const directView = isDirectlyViewable(asset, slot);
                const canDownload = drawingPackage ? canDownloadPanelDrawingSlot(drawingPackage, slot) : false;
                return (
                  <section
                    key={`${slot}-${asset.id}`}
                    id={`ga-panel-${slot}`}
                    role="tabpanel"
                    aria-labelledby={`ga-tab-${slot}`}
                    aria-hidden={!active}
                    className={`ga-drawing-pane${active ? ' is-active' : ''}`}
                  >
                    <div className="ga-drawing-filebar">
                      <span>{slot === '2d' ? 'GA Drawing' : 'Uploaded 3D Model'}</span>
                      <strong title={asset.original_name}>{asset.original_name}</strong>
                      {asset.preview?.status === 'ready' && <small>Secure {asset.preview.format.toUpperCase()} preview</small>}
                      {canDownload && (
                        <button type="button" className="ga-filebar-action" onClick={() => void download(slot)} disabled={downloadBusy === slot}>
                          <Download size={15} />{downloadBusy === slot ? 'Preparing…' : 'Download original'}
                        </button>
                      )}
                    </div>

                    {!directView ? (
                      <div className="ga-viewer-message ga-viewer-message--conversion" role={asset.preview?.status === 'failed' ? 'alert' : 'status'}>
                        <FileText size={28} />
                        <strong>{conversionMessage(asset, slot)}</strong>
                        {asset.preview?.status === 'pending' && <span className="ga-conversion-pulse">Conversion pending</span>}
                        {canDownload && <button type="button" className="btn-secondary" onClick={() => void download(slot)}><Download size={16} />Download original</button>}
                      </div>
                    ) : slot === '2d' ? (
                      <FileViewer
                        blob={state.blob}
                        fileType={fileViewerType(asset)}
                        panelLabel={panelName}
                        fileName={asset.original_name}
                        loading={state.loading}
                        error={state.error}
                        onRetry={() => setRefreshKey(key => key + 1)}
                        onDownload={canDownload ? () => void download('2d') : undefined}
                        className="ga-file-viewer"
                      />
                    ) : state.blob && !state.loading && !state.error ? (
                      <EngineeringModelViewer
                        blob={state.blob}
                        fileName={effectiveFileName(asset)}
                        format={effectiveFormat(asset) as EngineeringModelFormat}
                        readOnly
                      />
                    ) : (
                      <div className="ga-viewer-message" role={state.error ? 'alert' : 'status'}>
                        {state.error || 'Loading 3D engineering model…'}
                      </div>
                    )}
                  </section>
                );
              })}

              {/* Flat 3D — published geometry plan view (Cable Digital Twin only) */}
              {twinMode && availableTabs.includes('flat') && (
                <section
                  id="ga-panel-flat"
                  role="tabpanel"
                  aria-labelledby="ga-tab-flat"
                  aria-hidden={activeTab !== 'flat'}
                  className={`ga-drawing-pane${activeTab === 'flat' ? ' is-active' : ''}`}
                >
                  {visited.has('flat') && twinCtx && (
                    <FlatPanelView
                      panel={twinCtx.panel ?? {}}
                      devices={twinCtx.devices ?? []}
                      ductNodes={twinCtx.duct_nodes ?? []}
                      ductSegments={twinCtx.duct_segments ?? []}
                      source={twinCtx.sourceMapping}
                      destination={twinCtx.destinationMapping}
                      route={twinCtx.route}
                      cableLabel={twinCable ? `Cable #${twinCable.cable.sno ?? twinCable.index + 1}` : undefined}
                    />
                  )}
                </section>
              )}

              {PANEL_3D_ENABLED && (
                <section
                  id="ga-panel-generated"
                  role="tabpanel"
                  aria-labelledby="ga-tab-generated"
                  aria-hidden={activeTab !== 'generated'}
                  className={`ga-drawing-pane${activeTab === 'generated' ? ' is-active' : ''}`}
                >
                  {visited.has('generated') && renderGeneratedTab()}
                </section>
              )}

              <section
                id="ga-panel-revisions"
                role="tabpanel"
                aria-labelledby="ga-tab-revisions"
                aria-hidden={activeTab !== 'revisions'}
                className={`ga-drawing-pane ga-drawing-pane--scroll${activeTab === 'revisions' ? ' is-active' : ''}`}
              >
                {visited.has('revisions') && renderRevisionsTab()}
              </section>

              {PANEL_3D_ENABLED && supervisor && (
                <section
                  id="ga-panel-verify"
                  role="tabpanel"
                  aria-labelledby="ga-tab-verify"
                  aria-hidden={activeTab !== 'verify'}
                  className={`ga-drawing-pane ga-drawing-pane--scroll ga-drawing-pane--verify${activeTab === 'verify' ? ' is-active' : ''}`}
                >
                  {visited.has('verify') && renderVerifyTab()}
                </section>
              )}
            </>
          )}
          </div>
        </div>
      </Modal>

      {uploadSlot && drawingPackage && (
        <PanelDrawingUploadModal
          projectCode={projectCode}
          projectName={projectName}
          frameId={frameId}
          panelName={panelName}
          slot={uploadSlot}
          existingAsset={panelDrawingAssetForSlot(drawingPackage, uploadSlot)}
          onClose={() => setUploadSlot(null)}
          onUploaded={() => {
            setUploadSlot(null);
            cancelPackageRequest();
            cancelModelRequest();
            cancelSlotFileRequest();
            cancelGeneratedFileRequest();
            cancelActionRequest();
            setDrawingPackage(null);
            setModel(null);
            setPackageLoading(true);
            setModelLoading(true);
            setViewModelId(null);
            setFiles({ '2d': EMPTY_FILE, '3d': EMPTY_FILE });
            modelBlobCacheRef.current = {};
            setModelBlobs({});
            setForm(specToForm(null));
            setOptionalDirty(new Set());
            setDimensionErrors({});
            setAssumptionsAcknowledged(false);
            setVerificationNotes('');
            setBusy(null);
            setActionError('');
            setActionNotice('Drawing package updated. Loading the new panel revision…');
            setRefreshKey(key => key + 1);
          }}
        />
      )}
    </>
  );
}
