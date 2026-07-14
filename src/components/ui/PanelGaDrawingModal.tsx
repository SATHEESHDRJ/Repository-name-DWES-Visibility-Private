import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import Modal from '../Modal';
import FileViewer, { type FileViewerType } from './FileViewer';
import EngineeringModelViewer, { type EngineeringModelFormat } from './EngineeringModelViewer';
import PanelDrawingUploadModal from '../supervisor/PanelDrawingUploadModal';
import { AlertTriangle, CheckCircle, Download, FileText, Plus, RefreshCw, ShieldCheck, Trash2, Upload } from './icons';
import { projectsApi } from '../../services/api';
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
} from '../../types/panelModel';
import { useLatestRequest } from '../../hooks/useLatestRequest';
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

type GaTab = '2d' | 'generated' | '3d' | 'revisions' | 'verify';

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
  onClose,
}: {
  projectCode: string;
  frameId: string;
  panelName: string;
  projectName?: string;
  initialTab?: PanelDrawingSlot;
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
  const [activeTab, setActiveTab] = useState<GaTab>(initialTab);
  const [visited, setVisited] = useState<Set<GaTab>>(() => new Set([initialTab]));
  const [files, setFiles] = useState<Record<PanelDrawingSlot, SlotFileState>>({ '2d': EMPTY_FILE, '3d': EMPTY_FILE });
  const [downloadBusy, setDownloadBusy] = useState<PanelDrawingSlot | null>(null);
  const [uploadSlot, setUploadSlot] = useState<PanelDrawingSlot | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const [model, setModel] = useState<PanelModelView | null>(null);
  const [modelLoading, setModelLoading] = useState(true);
  const [modelError, setModelError] = useState('');
  const [viewModelId, setViewModelId] = useState<string | null>(null);
  const [modelBlobs, setModelBlobs] = useState<Record<string, SlotFileState>>({});
  const [form, setForm] = useState<SpecForm>(specToForm(null));
  const [optionalDirty, setOptionalDirty] = useState<Set<OptionalSpecField>>(() => new Set());
  const [dimensionErrors, setDimensionErrors] = useState<PanelDimensionErrors>({});
  const [focusDimension, setFocusDimension] = useState<PanelDimensionKey | null>(null);
  const [assumptionsAcknowledged, setAssumptionsAcknowledged] = useState(false);
  const [verificationNotes, setVerificationNotes] = useState('');
  const [busy, setBusy] = useState<'convert' | 'save' | 'approve' | null>(null);
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
    setActiveTab(initialTab);
    setVisited(new Set([initialTab]));
  }, [
    cancelActionRequest,
    cancelGeneratedFileRequest,
    cancelModelRequest,
    cancelPackageRequest,
    cancelSlotFileRequest,
    projectCode,
    frameId,
    initialTab,
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
              [slot]: { blob: null, loading: false, error: err?.response?.data?.message || `Unable to load the ${slot === '2d' ? 'drawing' : '3D model'}.` },
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

  const availableTabs: GaTab[] = useMemo(() => {
    const tabs: GaTab[] = [];
    if (drawing2d) tabs.push('2d');
    tabs.push('generated');
    if (model3d) tabs.push('3d');
    tabs.push('revisions');
    if (supervisor) tabs.push('verify');
    return tabs;
  }, [drawing2d, model3d, supervisor]);

  useEffect(() => {
    if (!packageLoading && !modelLoading && !availableTabs.includes(activeTab)) {
      setActiveTab(availableTabs[0] ?? 'generated');
    }
  }, [availableTabs, activeTab, packageLoading, modelLoading]);

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

  const packageActions = useMemo(() => {
    if (!drawingPackage) return [];
    return (['2d', '3d'] as PanelDrawingSlot[]).filter(slot => canUploadPanelDrawingSlot(drawingPackage, slot));
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
      return <div className="ga-viewer-message" role="status">Loading generated 3D model…</div>;
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
    if (modelLoading) return <div className="ga-viewer-message">Loading this panel’s generated-model record…</div>;
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
    if (modelLoading || packageLoading) return <div className="ga-viewer-message">Loading revision history…</div>;
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
      return <div className="ga-viewer-message" role="status">Loading the latest panel drawing and model revision…</div>;
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
            </div>
            <div className="pm-form-row">
              {(['width', 'height', 'depth'] as PanelDimensionKey[]).map(key => (
                <label key={key} className="pm-required-field">
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

  const tabLabel: Record<GaTab, string> = {
    '2d': 'Original 2D Drawing',
    generated: 'Generated 3D View',
    '3d': 'Uploaded 3D Model',
    revisions: 'Revisions',
    verify: 'Side-by-Side Verify',
  };

  return (
    <>
      <Modal
        title="3D GA / 2D Drawing View"
        subtitle={`${projectName || projectCode} · ${panelName} · Panel-specific · ${supervisor ? 'Supervisor review enabled' : 'Read-only viewer'}`}
        onClose={onClose}
        size="fullscreen"
        bodyClassName="modal-body-flush"
      >
        <div className="ga-drawing-shell">
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
              {model?.current && statusChip(model.current.status)}
              {packageActions.map(slot => (
                <button key={slot} type="button" className="ga-drawing-upload-action" onClick={() => setUploadSlot(slot)}>
                  <Upload size={15} />
                  <span>{panelDrawingAssetForSlot(drawingPackage!, slot) ? 'Replace' : 'Upload'} {slot === '2d' ? '2D' : '3D'}</span>
                </button>
              ))}
            </div>
          </div>

          {packageLoading && modelLoading ? (
            <div className="ga-viewer-message">Loading this panel’s drawing record…</div>
          ) : packageError ? (
            <div className="ga-viewer-message" role="alert">
              <p>{packageError}</p>
              <button type="button" className="btn-secondary" onClick={() => setRefreshKey(key => key + 1)}><RefreshCw size={16} />Retry</button>
            </div>
          ) : (
            <div className="ga-drawing-panes">
              {(['2d', '3d'] as PanelDrawingSlot[]).map(slot => {
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
                      <span>{slot === '2d' ? 'Original 2D Drawing' : 'Uploaded 3D Model'}</span>
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

              <section
                id="ga-panel-generated"
                role="tabpanel"
                aria-labelledby="ga-tab-generated"
                aria-hidden={activeTab !== 'generated'}
                className={`ga-drawing-pane${activeTab === 'generated' ? ' is-active' : ''}`}
              >
                {visited.has('generated') && renderGeneratedTab()}
              </section>

              <section
                id="ga-panel-revisions"
                role="tabpanel"
                aria-labelledby="ga-tab-revisions"
                aria-hidden={activeTab !== 'revisions'}
                className={`ga-drawing-pane ga-drawing-pane--scroll${activeTab === 'revisions' ? ' is-active' : ''}`}
              >
                {visited.has('revisions') && renderRevisionsTab()}
              </section>

              {supervisor && (
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
            </div>
          )}
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
