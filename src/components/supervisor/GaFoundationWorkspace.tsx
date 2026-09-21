import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import * as pdfjs from 'pdfjs-dist';
import pdfjsWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { gaApi } from '../../services/api';
import { emitWorkflowChanged, onWorkflowChanged } from '../../utils/dwesRefreshEvents';
import {
  Check,
  CheckCircle,
  FileText,
  Loader,
  Map,
  Plus,
  RefreshCw,
  Trash2,
  TriangleAlert,
  Upload,
} from '../ui/icons';

pdfjs.GlobalWorkerOptions.workerSrc = pdfjsWorker;

type GaFace = 'front' | 'internal' | 'rear' | 'custom';
type JobStatus = 'queued' | 'processing' | 'review_required' | 'completed' | 'failed' | 'cancelled';

interface NormalizedRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface GaSource {
  id: number;
  face: GaFace;
  revision: string;
  filename: string;
  mime_type: string;
  size: number;
  conversion_job_id?: string | null;
  conversion_status: string;
  conversion_error?: string | null;
  uploaded_at: string;
  superseded_at?: string | null;
}

interface GaFaceRecord {
  id: string;
  ga_asset_set_id: string;
  face: GaFace;
  custom_label?: string | null;
  drawing_asset_id: number;
  selected_page?: number | null;
  crop: NormalizedRect;
  image_width: number;
  image_height: number;
  status: string;
}

interface GaAssetSet {
  id: string;
  revision: number;
  source_revision: string;
  status: string;
  release_status: string;
  invalidated_reason?: string | null;
  panel_height?: number | null;
  panel_width?: number | null;
  panel_depth?: number | null;
  mapping_model_id?: number | null;
  mapping_revision?: string | null;
  schedule_revision?: string | null;
  confirmed_at?: string | null;
  released_at?: string | null;
}

interface GaStatus {
  asset_set: GaAssetSet | null;
  sources: GaSource[];
  faces: GaFaceRecord[];
  mapping: MappingModel | null;
  finalization: Array<{ state: string; review_status: string; _count: { _all: number } }>;
  schedule_revision: string;
  cad_provider: { available: boolean; provider: string; version?: string; message?: string };
  fallback: string;
}

interface MappingItem {
  stableItemId: string;
  tag: string;
  type: string;
  description: string;
  face: GaFace;
  rect: NormalizedRect;
  aliases: string[];
  terminalBlock?: {
    tag: string;
    count: number;
    firstTerminalNumber: string;
    pitch: number;
    orientation: 'horizontal' | 'vertical';
    reversed: boolean;
  };
}

interface MappingModel {
  id: number;
  mapping_revision?: string | null;
  mapping_state?: string | null;
  approval_status?: string | null;
}

interface MappingDeviceRow {
  stable_item_id: string;
  device_tag: string;
  device_type: string;
  description?: string | null;
  face: GaFace;
  normalized_x: number;
  normalized_y: number;
  normalized_width: number;
  normalized_height: number;
  aliases?: unknown;
  terminal_block_tag?: string | null;
  terminal_count?: number | null;
  first_terminal_number?: string | null;
  terminal_pitch?: number | null;
  terminal_orientation?: string | null;
  terminal_reversed?: boolean | null;
}

interface MappingTerminalRow {
  id: number;
  terminal_block: string;
  terminal_number: string;
  normalized_terminal_reference: string;
  face: GaFace;
  normalized_x: number;
  normalized_y: number;
}

interface MappingDetail {
  model: MappingModel;
  devices: MappingDeviceRow[];
  terminals: MappingTerminalRow[];
}

interface FinalizationItem {
  id: string;
  wiring_row_id: string;
  endpoint: string;
  raw_device: string;
  raw_terminal: string;
  normalized_reference: string;
  state: string;
  confidence?: number | null;
  evidence?: unknown;
  candidate_terminal_ids?: unknown;
  suggested_terminal_id?: number | null;
  review_status: string;
  exception_hold: boolean;
}

interface BackgroundJob {
  id: string;
  job_type: string;
  status: JobStatus;
  attempts: number;
  max_attempts: number;
  error?: string | null;
  result?: unknown;
}

interface GaFoundationWorkspaceProps {
  projectCode: string;
  frameId: string;
  /** Compact chrome when hosted inside Engineering Convert tab (GA nav tab stays hidden). */
  embedded?: boolean;
}

interface ItemDraft {
  tag: string;
  type: string;
  description: string;
  aliases: string;
  terminalEnabled: boolean;
  terminalTag: string;
  terminalCount: number;
  firstTerminalNumber: string;
  terminalPitch: number;
  terminalOrientation: 'horizontal' | 'vertical';
  terminalReversed: boolean;
}

const EMPTY_ITEM: ItemDraft = {
  tag: '',
  type: 'terminal_block',
  description: '',
  aliases: '',
  terminalEnabled: true,
  terminalTag: '',
  terminalCount: 12,
  firstTerminalNumber: '1',
  terminalPitch: 0.01,
  terminalOrientation: 'horizontal',
  terminalReversed: false,
};

const FACE_OPTIONS: Array<{ value: GaFace; label: string }> = [
  { value: 'front', label: 'Front' },
  { value: 'internal', label: 'Internal' },
  { value: 'rear', label: 'Rear' },
  { value: 'custom', label: 'Custom' },
];

const TERMINAL_JOB_STATES = new Set<JobStatus>(['review_required', 'completed', 'failed', 'cancelled']);

function errorMessage(error: unknown): string {
  if (typeof error !== 'object' || error === null) return 'The request failed.';
  const response = 'response' in error ? (error as { response?: { data?: { message?: unknown } } }).response : undefined;
  const message = response?.data?.message;
  if (Array.isArray(message)) return message.map(String).join(', ');
  if (typeof message === 'string') return message;
  if ('message' in error && typeof (error as { message?: unknown }).message === 'string') {
    return (error as { message: string }).message;
  }
  return 'The request failed.';
}

function normalizeTag(value: string): string {
  return value.trim().toUpperCase().replace(/[\s_-]+/g, '');
}

function aliasesFromUnknown(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string') : [];
}

function mappingItemsFromDetail(detail: MappingDetail | null): MappingItem[] {
  if (!detail) return [];
  return detail.devices.map(device => ({
    stableItemId: device.stable_item_id,
    tag: device.device_tag,
    type: device.device_type,
    description: device.description ?? '',
    face: device.face,
    rect: {
      x: Number(device.normalized_x),
      y: Number(device.normalized_y),
      width: Number(device.normalized_width),
      height: Number(device.normalized_height),
    },
    aliases: aliasesFromUnknown(device.aliases),
    terminalBlock: device.terminal_block_tag && device.terminal_count
      ? {
          tag: device.terminal_block_tag,
          count: device.terminal_count,
          firstTerminalNumber: device.first_terminal_number ?? '1',
          pitch: Number(device.terminal_pitch ?? 1),
          orientation: device.terminal_orientation === 'vertical' ? 'vertical' : 'horizontal',
          reversed: Boolean(device.terminal_reversed),
        }
      : undefined,
  }));
}

function badgeClass(status: string): string {
  if (['released', 'completed', 'confirmed', 'exact_match', 'resolved', 'not_required'].includes(status)) {
    return 'border-emerald-200 bg-emerald-50 text-emerald-700';
  }
  if (['failed', 'blocked', 'not_matched', 'duplicate_or_ambiguous'].includes(status)) {
    return 'border-red-200 bg-red-50 text-red-700';
  }
  return 'border-amber-200 bg-amber-50 text-amber-700';
}

function StatusBadge({ value }: { value: string }) {
  return (
    <span className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide ${badgeClass(value)}`}>
      {value.replaceAll('_', ' ')}
    </span>
  );
}

function SectionHeading({ number, title, subtitle }: { number: number; title: string; subtitle: string }) {
  return (
    <div className="mb-4 flex items-start gap-3">
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-blue-50 text-xs font-bold text-blue-700">
        {number}
      </span>
      <div className="min-w-0">
        <h3 className="text-lg font-bold leading-tight text-[#0B1F3A]">{title}</h3>
        <p className="mt-1 text-sm leading-5 text-slate-500">{subtitle}</p>
      </div>
    </div>
  );
}

function boundedRect(start: { x: number; y: number }, end: { x: number; y: number }): NormalizedRect {
  const x = Math.max(0, Math.min(start.x, end.x));
  const y = Math.max(0, Math.min(start.y, end.y));
  const right = Math.min(1, Math.max(start.x, end.x));
  const bottom = Math.min(1, Math.max(start.y, end.y));
  return { x, y, width: right - x, height: bottom - y };
}

function rectStyle(rect: NormalizedRect) {
  return {
    left: `${rect.x * 100}%`,
    top: `${rect.y * 100}%`,
    width: `${rect.width * 100}%`,
    height: `${rect.height * 100}%`,
  };
}

function TerminalDots({ item }: { item: MappingItem }) {
  if (!item.terminalBlock) return null;
  const count = Math.max(1, item.terminalBlock.count);
  return (
    <>
      {Array.from({ length: count }, (_, index) => {
        const position = item.terminalBlock?.reversed ? count - index - 1 : index;
        const left = item.terminalBlock?.orientation === 'horizontal'
          ? item.rect.x + position * item.terminalBlock.pitch
          : item.rect.x + item.rect.width / 2;
        const top = item.terminalBlock?.orientation === 'vertical'
          ? item.rect.y + position * item.terminalBlock.pitch
          : item.rect.y + item.rect.height / 2;
        return (
          <span
            key={`${item.stableItemId}-${index}`}
            className="pointer-events-none absolute h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full border border-white bg-amber-500 shadow"
            style={{ left: `${left * 100}%`, top: `${top * 100}%` }}
          />
        );
      })}
    </>
  );
}

export default function GaFoundationWorkspace({ projectCode, frameId, embedded = false }: GaFoundationWorkspaceProps) {
  const [status, setStatus] = useState<GaStatus | null>(null);
  const [mapping, setMapping] = useState<MappingDetail | null>(null);
  const [items, setItems] = useState<MappingItem[]>([]);
  const [finalization, setFinalization] = useState<FinalizationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [sourceFace, setSourceFace] = useState<GaFace>('front');
  const [customLabel, setCustomLabel] = useState('');
  const [sourceFile, setSourceFile] = useState<File | null>(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [selectedSourceId, setSelectedSourceId] = useState<number | null>(null);
  const [pdfPage, setPdfPage] = useState(1);
  const [pdfPages, setPdfPages] = useState(0);
  const [pdfScale, setPdfScale] = useState(1.5);
  const [crop, setCrop] = useState<NormalizedRect>({ x: 0, y: 0, width: 1, height: 1 });
  const [cropStart, setCropStart] = useState<{ x: number; y: number } | null>(null);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [dimensions, setDimensions] = useState({ height: '', width: '', depth: '' });
  const [selectedFace, setSelectedFace] = useState<GaFace>('front');
  const [faceImageUrl, setFaceImageUrl] = useState('');
  const [mappingZoom, setMappingZoom] = useState(1);
  const [selection, setSelection] = useState<NormalizedRect | null>(null);
  const [selectionStart, setSelectionStart] = useState<{ x: number; y: number } | null>(null);
  const [itemDraft, setItemDraft] = useState<ItemDraft>(EMPTY_ITEM);
  const [activeJob, setActiveJob] = useState<BackgroundJob | null>(null);
  const [decisionTargets, setDecisionTargets] = useState<Record<string, string>>({});
  const [decisionReasons, setDecisionReasons] = useState<Record<string, string>>({});
  const pdfCanvasRef = useRef<HTMLCanvasElement>(null);
  const pdfDocRef = useRef<pdfjs.PDFDocumentProxy | null>(null);
  const mapHostRef = useRef<HTMLDivElement>(null);

  const loadWorkspace = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    setError('');
    try {
      const nextStatus = await gaApi.status(projectCode, frameId, signal) as GaStatus;
      setStatus(nextStatus);
      setDimensions({
        height: nextStatus.asset_set?.panel_height?.toString() ?? '',
        width: nextStatus.asset_set?.panel_width?.toString() ?? '',
        depth: nextStatus.asset_set?.panel_depth?.toString() ?? '',
      });
      const activeSources = nextStatus.sources.filter(source => !source.superseded_at);
      setSelectedSourceId(current => activeSources.some(source => source.id === current) ? current : activeSources[0]?.id ?? null);
      const availableFaces = nextStatus.faces.map(face => face.face);
      setSelectedFace(current => availableFaces.includes(current) ? current : availableFaces[0] ?? 'front');
      if (nextStatus.asset_set) {
        const [nextMapping, nextFinalization] = await Promise.all([
          gaApi.mapping(projectCode, frameId, signal) as Promise<MappingDetail | null>,
          gaApi.finalization(projectCode, frameId, signal) as Promise<FinalizationItem[]>,
        ]);
        setMapping(nextMapping);
        setItems(mappingItemsFromDetail(nextMapping));
        setFinalization(nextFinalization);
      } else {
        setMapping(null);
        setItems([]);
        setFinalization([]);
      }
    } catch (nextError) {
      if (!(nextError instanceof DOMException && nextError.name === 'AbortError')) setError(errorMessage(nextError));
    } finally {
      setLoading(false);
    }
  }, [frameId, projectCode]);

  useEffect(() => {
    const controller = new AbortController();
    void loadWorkspace(controller.signal);
    return () => controller.abort();
  }, [loadWorkspace]);

  useEffect(() => {
    return onWorkflowChanged(detail => {
      if (detail.projectCode && detail.projectCode !== projectCode) return;
      if (detail.frameId && detail.frameId !== frameId) return;
      void loadWorkspace();
    });
  }, [frameId, loadWorkspace, projectCode]);

  useEffect(() => () => {
    void pdfDocRef.current?.destroy();
  }, []);

  useEffect(() => {
    let cancelled = false;
    let objectUrl = '';
    const face = status?.faces.find(entry => entry.face === selectedFace);
    setFaceImageUrl('');
    if (!face) return () => undefined;
    void gaApi.faceImage(projectCode, frameId, face.id)
      .then(blob => {
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setFaceImageUrl(objectUrl);
      })
      .catch(nextError => { if (!cancelled) setError(errorMessage(nextError)); });
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [frameId, projectCode, selectedFace, status?.faces]);

  useEffect(() => {
    if (!activeJob || TERMINAL_JOB_STATES.has(activeJob.status)) return;
    const controller = new AbortController();
    const timer = window.setInterval(() => {
      void gaApi.job(projectCode, frameId, activeJob.id, controller.signal)
        .then((job: BackgroundJob) => {
          setActiveJob(job);
          if (TERMINAL_JOB_STATES.has(job.status)) {
            window.clearInterval(timer);
            void loadWorkspace();
          }
        })
        .catch(nextError => {
          window.clearInterval(timer);
          setError(errorMessage(nextError));
        });
    }, 1500);
    return () => {
      controller.abort();
      window.clearInterval(timer);
    };
  }, [activeJob, frameId, loadWorkspace, projectCode]);

  const activeSources = useMemo(
    () => status?.sources.filter(source => !source.superseded_at) ?? [],
    [status?.sources],
  );
  const selectedSource = activeSources.find(source => source.id === selectedSourceId) ?? null;
  const currentFaceItems = items.filter(item => item.face === selectedFace);
  const canMap = status?.asset_set?.status === 'confirmed';

  const run = async (key: string, action: () => Promise<unknown>, success: string) => {
    setBusy(key);
    setError('');
    setNotice('');
    try {
      await action();
      setNotice(success);
      await loadWorkspace();
    } catch (nextError) {
      setError(errorMessage(nextError));
    } finally {
      setBusy('');
    }
  };

  const uploadSource = async () => {
    if (!sourceFile) {
      setError('Select a PDF, DWG, or DXF source file.');
      return;
    }
    if (sourceFace === 'custom' && customLabel.trim().length < 2) {
      setError('Enter a clear label for the custom face.');
      return;
    }
    setBusy('source');
    setError('');
    setNotice('');
    setUploadProgress(0);
    try {
      const formData = new FormData();
      formData.append('file', sourceFile);
      if (sourceFace === 'custom') formData.append('custom_label', customLabel.trim());
      const result = await gaApi.uploadSource(projectCode, frameId, sourceFace, formData, setUploadProgress) as {
        source: GaSource;
        conversion_job?: BackgroundJob | null;
      };
      setSourceFile(null);
      if (result.conversion_job) setActiveJob(result.conversion_job);
      setSelectedSourceId(result.source.id);
      setNotice('The immutable GA source revision was uploaded.');
      await loadWorkspace();
    } catch (nextError) {
      setError(errorMessage(nextError));
    } finally {
      setBusy('');
    }
  };

  const loadPdfPage = async () => {
    if (!selectedSource || !selectedSource.filename.toLowerCase().endsWith('.pdf')) {
      setError('Select an active PDF source. DWG/DXF files need an approved PDF derivative for browser face selection.');
      return;
    }
    setPdfLoading(true);
    setError('');
    try {
      const blob = await gaApi.sourceFile(projectCode, frameId, selectedSource.id);
      await pdfDocRef.current?.destroy();
      const document = await pdfjs.getDocument({ data: await blob.arrayBuffer() }).promise;
      pdfDocRef.current = document;
      const pageNumber = Math.min(Math.max(1, pdfPage), document.numPages);
      setPdfPage(pageNumber);
      setPdfPages(document.numPages);
      const page = await document.getPage(pageNumber);
      const viewport = page.getViewport({ scale: pdfScale });
      const canvas = pdfCanvasRef.current;
      if (!canvas) throw new Error('PDF canvas is unavailable.');
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      const context = canvas.getContext('2d');
      if (!context) throw new Error('PDF canvas could not be initialized.');
      await page.render({ canvasContext: context, viewport }).promise;
      setCrop({ x: 0, y: 0, width: 1, height: 1 });
    } catch (nextError) {
      setError(errorMessage(nextError));
    } finally {
      setPdfLoading(false);
    }
  };

  const canvasPoint = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    return {
      x: Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width)),
      y: Math.min(1, Math.max(0, (event.clientY - rect.top) / rect.height)),
    };
  };

  const saveFaceSelection = async () => {
    const source = selectedSource;
    const canvas = pdfCanvasRef.current;
    if (!source || !canvas || canvas.width === 0 || crop.width < 0.01 || crop.height < 0.01) {
      setError('Load a PDF page and draw a valid crop selection first.');
      return;
    }
    setBusy('face');
    setError('');
    try {
      const sourceX = Math.round(crop.x * canvas.width);
      const sourceY = Math.round(crop.y * canvas.height);
      const sourceWidth = Math.max(1, Math.round(crop.width * canvas.width));
      const sourceHeight = Math.max(1, Math.round(crop.height * canvas.height));
      const ratio = Math.min(1, 4096 / Math.max(sourceWidth, sourceHeight));
      const output = document.createElement('canvas');
      output.width = Math.max(1, Math.round(sourceWidth * ratio));
      output.height = Math.max(1, Math.round(sourceHeight * ratio));
      const context = output.getContext('2d');
      if (!context) throw new Error('Crop canvas could not be initialized.');
      context.drawImage(canvas, sourceX, sourceY, sourceWidth, sourceHeight, 0, 0, output.width, output.height);
      const png = await new Promise<Blob>((resolve, reject) => {
        output.toBlob(blob => blob ? resolve(blob) : reject(new Error('Could not create the selected GA face image.')), 'image/png');
      });
      const formData = new FormData();
      formData.append('file', png, `${source.face}-page-${pdfPage}.png`);
      formData.append('source_asset_id', String(source.id));
      formData.append('selected_page', String(pdfPage));
      formData.append('crop', JSON.stringify(crop));
      formData.append('viewport', JSON.stringify({ width: canvas.width, height: canvas.height }));
      formData.append('scale', String(pdfScale));
      if (source.face === 'custom') formData.append('custom_label', customLabel.trim() || 'Custom face');
      await gaApi.saveFace(projectCode, frameId, source.face, formData);
      setSelectedFace(source.face);
      setNotice(`${source.face} face selection saved.`);
      await loadWorkspace();
      emitWorkflowChanged({ scope: 'general', projectCode, frameId });
    } catch (nextError) {
      setError(errorMessage(nextError));
    } finally {
      setBusy('');
    }
  };

  const mapPoint = (event: ReactPointerEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    return {
      x: Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width)),
      y: Math.min(1, Math.max(0, (event.clientY - rect.top) / rect.height)),
    };
  };

  const addMappingItem = () => {
    const tag = itemDraft.tag.trim();
    if (!selection || selection.width < 0.005 || selection.height < 0.005) {
      setError('Draw a rectangle on the selected face before adding an item.');
      return;
    }
    if (!tag || itemDraft.type.trim().length < 2) {
      setError('Enter a device tag and type.');
      return;
    }
    if (items.some(item => normalizeTag(item.tag) === normalizeTag(tag))) {
      setError(`Device tag ${tag} is already mapped.`);
      return;
    }
    if (itemDraft.terminalEnabled && (!itemDraft.terminalTag.trim() || itemDraft.terminalCount < 1 || itemDraft.terminalCount > 500)) {
      setError('Terminal blocks require a tag and a terminal count from 1 to 500.');
      return;
    }
    const next: MappingItem = {
      stableItemId: crypto.randomUUID(),
      tag,
      type: itemDraft.type.trim(),
      description: itemDraft.description.trim(),
      face: selectedFace,
      rect: selection,
      aliases: itemDraft.aliases.split(',').map(value => value.trim()).filter(Boolean),
      terminalBlock: itemDraft.terminalEnabled
        ? {
            tag: itemDraft.terminalTag.trim(),
            count: itemDraft.terminalCount,
            firstTerminalNumber: itemDraft.firstTerminalNumber.trim() || '1',
            pitch: itemDraft.terminalPitch,
            orientation: itemDraft.terminalOrientation,
            reversed: itemDraft.terminalReversed,
          }
        : undefined,
    };
    setItems(current => [...current, next]);
    setSelection(null);
    setItemDraft(EMPTY_ITEM);
    setError('');
  };

  const saveMapping = async () => {
    if (!status?.asset_set || items.length === 0) {
      setError('Map at least one item before saving the catalog.');
      return;
    }
    await run(
      'mapping',
      () => gaApi.saveMapping(projectCode, frameId, { gaAssetSetId: status.asset_set?.id, items }),
      'Mapping Catalog draft saved as a new server revision.',
    );
  };

  const queueCorrelation = async () => {
    setBusy('correlation');
    setError('');
    try {
      const job = await gaApi.correlate(projectCode, frameId) as BackgroundJob;
      setActiveJob(job);
      setNotice('Schedule correlation was queued.');
      await loadWorkspace();
    } catch (nextError) {
      setError(errorMessage(nextError));
    } finally {
      setBusy('');
    }
  };

  const decide = async (
    item: FinalizationItem,
    decision: 'confirm_suggestion' | 'link_existing' | 'exception_hold',
  ) => {
    const target = Number(decisionTargets[item.id]);
    const reason = decisionReasons[item.id]?.trim();
    await run(
      `decision-${item.id}`,
      () => gaApi.decideFinalization(projectCode, frameId, item.id, {
        decision,
        target_terminal_id: decision === 'link_existing' && Number.isInteger(target) ? target : undefined,
        reason,
      }),
      'Finalization decision recorded with its revision context.',
    );
  };

  if (loading && !status) {
    return <div className="flex min-h-48 items-center justify-center text-sm text-slate-500"><Loader size={18} /> Loading GA foundation…</div>;
  }

  return (
    <section
      className={
        embedded
          ? 'mt-1 min-w-0 overflow-hidden rounded-xl border border-slate-200 bg-white p-3 sm:p-4'
          : 'mt-6 min-w-0 overflow-hidden rounded-2xl border border-slate-200 bg-white p-4 sm:p-6'
      }
      aria-labelledby="ga-foundation-title"
    >
      <div className={`flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 ${embedded ? 'pb-3' : 'pb-5'}`}>
        <div>
          <h2 id="ga-foundation-title" className={`${embedded ? 'text-base' : 'text-xl'} font-bold text-[#0B1F3A]`}>
            {embedded ? 'GA enrollment & mapping release' : 'GA Foundation & Mapping Release'}
          </h2>
          <p className="mt-1 max-w-3xl text-sm text-slate-500">
            {embedded
              ? 'Enroll Flat 2D GA layout sheets (front / internal / rear), confirm faces and dimensions, map devices/terminals, correlate to the wiring schedule, then release. Cover sheets are not valid geometry sources.'
              : 'Panel-scoped source control, face selection, deterministic terminal mapping, correlation, and release gating.'}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {status?.asset_set ? <StatusBadge value={status.asset_set.release_status} /> : <StatusBadge value="not_started" />}
          <button type="button" className="btn-secondary" onClick={() => void loadWorkspace()} disabled={loading}>
            <RefreshCw size={15} /> Refresh
          </button>
        </div>
      </div>

      {(error || notice) && (
        <div className={`mt-4 flex items-start gap-2 rounded-xl border p-3 text-sm ${error ? 'border-red-200 bg-red-50 text-red-800' : 'border-emerald-200 bg-emerald-50 text-emerald-800'}`} role={error ? 'alert' : 'status'}>
          {error ? <TriangleAlert size={17} className="mt-0.5 shrink-0" /> : <CheckCircle size={17} className="mt-0.5 shrink-0" />}
          <span>{error || notice}</span>
        </div>
      )}

      <div className="mt-6 grid min-w-0 gap-5">
        <div className="min-w-0 rounded-xl border border-slate-200 p-4 sm:p-5">
          <SectionHeading
            number={1}
            title="Immutable GA sources"
            subtitle={
              embedded
                ? 'Upload Flat 2D GA layout PDF revisions for front, internal, rear, or custom faces. Do not use cover-only sheets as the 3D geometry source.'
                : 'Upload an approved front, internal, rear, or custom PDF/DWG/DXF revision for this panel.'
            }
          />
          <div className="grid gap-3 lg:grid-cols-[150px_minmax(220px,1fr)_minmax(190px,1fr)_auto]">
            <select className="form-select" value={sourceFace} onChange={event => setSourceFace(event.target.value as GaFace)} aria-label="GA source face">
              {FACE_OPTIONS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
            {sourceFace === 'custom' && (
              <input className="form-input" value={customLabel} onChange={event => setCustomLabel(event.target.value)} placeholder="Custom face label" aria-label="Custom face label" />
            )}
            <input
              className="form-input min-w-0"
              type="file"
              accept=".pdf,.dwg,.dxf"
              aria-label="Select GA source file"
              onChange={event => setSourceFile(event.target.files?.[0] ?? null)}
            />
            <button type="button" className="btn-primary" onClick={() => void uploadSource()} disabled={!sourceFile || busy === 'source'}>
              <Upload size={16} /> {busy === 'source' ? `Uploading ${uploadProgress}%` : 'Upload revision'}
            </button>
          </div>
          <div className="mt-4 grid gap-2">
            {activeSources.length === 0 && <p className="text-sm text-slate-500">No active GA source revision for this panel.</p>}
            {activeSources.map(source => (
              <div key={source.id} className="flex min-w-0 flex-wrap items-center justify-between gap-3 rounded-lg bg-slate-50 px-3 py-2.5 text-sm">
                <div className="min-w-0">
                  <span className="font-semibold text-[#0B1F3A]">{source.face.toUpperCase()}</span>
                  <span className="ml-2 break-all text-slate-600">{source.filename}</span>
                  <span className="ml-2 text-xs text-slate-400">{source.revision}</span>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <StatusBadge value={source.conversion_status} />
                  {source.conversion_status === 'review_required' && source.filename.toLowerCase().endsWith('.dwg') && (
                    <button
                      type="button"
                      className="text-xs font-semibold text-blue-700 hover:underline"
                      onClick={() => void run(
                        `retry-${source.id}`,
                        async () => { const job = await gaApi.retryConversion(projectCode, frameId, source.id) as BackgroundJob; setActiveJob(job); },
                        'CAD conversion retry queued.',
                      )}
                    >
                      Retry conversion
                    </button>
                  )}
                </div>
                {source.conversion_error && <p className="basis-full text-xs text-red-600">{source.conversion_error}</p>}
              </div>
            ))}
          </div>
          <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-xs text-slate-500">
            <span>CAD provider: <strong className="text-slate-700">{status?.cad_provider.provider ?? 'Unavailable'}</strong></span>
            <span>Health: <strong className={status?.cad_provider.available ? 'text-emerald-700' : 'text-amber-700'}>{status?.cad_provider.available ? 'Available' : 'Unavailable - PDF/DXF fallback remains active'}</strong></span>
          </div>
        </div>

        <div className="min-w-0 rounded-xl border border-slate-200 p-4 sm:p-5">
          <SectionHeading number={2} title="Face selection & dimensions" subtitle="Render only the selected PDF page, crop the required face, and record real panel dimensions in millimetres." />
          <div className="grid min-w-0 gap-5 xl:grid-cols-[minmax(0,1.4fr)_minmax(280px,0.6fr)]">
            <div className="min-w-0">
              <div className="grid gap-3 sm:grid-cols-[minmax(180px,1fr)_100px_110px_auto]">
                <select className="form-select min-w-0" value={selectedSourceId ?? ''} onChange={event => setSelectedSourceId(Number(event.target.value))} aria-label="Select PDF GA source">
                  <option value="">Select active source</option>
                  {activeSources.map(source => <option key={source.id} value={source.id}>{source.face}: {source.filename}</option>)}
                </select>
                <input className="form-input" type="number" min={1} max={pdfPages || 10000} value={pdfPage} onChange={event => setPdfPage(Number(event.target.value))} aria-label="PDF page" />
                <select className="form-select" value={pdfScale} onChange={event => setPdfScale(Number(event.target.value))} aria-label="PDF render scale">
                  <option value={1}>100%</option>
                  <option value={1.5}>150%</option>
                  <option value={2}>200%</option>
                  <option value={3}>300%</option>
                </select>
                <button type="button" className="btn-secondary" onClick={() => void loadPdfPage()} disabled={!selectedSourceId || pdfLoading}>
                  <FileText size={16} /> {pdfLoading ? 'Rendering…' : 'Load page'}
                </button>
              </div>
              {pdfPages > 0 && <p className="mt-2 text-xs text-slate-500">Page {pdfPage} of {pdfPages}. Drag on the page to define the face crop.</p>}
              <div className="mt-3 max-h-[520px] overflow-auto rounded-xl border border-dashed border-slate-300 bg-slate-100 p-2">
                <div className="relative mx-auto w-fit max-w-full select-none">
                  <canvas
                    ref={pdfCanvasRef}
                    className="block h-auto max-w-full touch-none bg-white shadow-sm"
                    onPointerDown={event => {
                      if (!pdfCanvasRef.current?.width) return;
                      event.currentTarget.setPointerCapture(event.pointerId);
                      const point = canvasPoint(event);
                      setCropStart(point);
                      setCrop({ x: point.x, y: point.y, width: 0, height: 0 });
                    }}
                    onPointerMove={event => { if (cropStart) setCrop(boundedRect(cropStart, canvasPoint(event))); }}
                    onPointerUp={event => {
                      if (cropStart) setCrop(boundedRect(cropStart, canvasPoint(event)));
                      setCropStart(null);
                    }}
                    aria-label="PDF page crop canvas"
                  />
                  {pdfCanvasRef.current?.width ? <div className="pointer-events-none absolute border-2 border-blue-500 bg-blue-400/15" style={rectStyle(crop)} /> : null}
                </div>
                {!pdfCanvasRef.current?.width && <div className="flex min-h-48 items-center justify-center text-sm text-slate-500">Select an active PDF source and load one page.</div>}
              </div>
              <button type="button" className="btn-primary mt-3" onClick={() => void saveFaceSelection()} disabled={!selectedSourceId || busy === 'face'}>
                <Check size={16} /> {busy === 'face' ? 'Saving face…' : 'Save selected face'}
              </button>
            </div>
            <div className="min-w-0 rounded-xl bg-slate-50 p-4">
              <h4 className="font-bold text-[#0B1F3A]">Panel dimensions</h4>
              <div className="mt-3 grid gap-3">
                {(['height', 'width', 'depth'] as const).map(key => (
                  <label key={key} className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    {key} (mm)
                    <input className="form-input mt-1 w-full" type="number" min={1} step="0.1" value={dimensions[key]} onChange={event => setDimensions(current => ({ ...current, [key]: event.target.value }))} />
                  </label>
                ))}
              </div>
              <button
                type="button"
                className="btn-secondary mt-4 w-full"
                disabled={!status?.asset_set || Boolean(status.asset_set.confirmed_at) || busy === 'dimensions'}
                onClick={() => void run('dimensions', () => gaApi.updateDimensions(projectCode, frameId, {
                  height: Number(dimensions.height), width: Number(dimensions.width), depth: Number(dimensions.depth),
                }), 'Panel dimensions saved.')}
              >
                Save dimensions
              </button>
              <button
                type="button"
                className="btn-primary mt-2 w-full"
                disabled={!status?.asset_set || Boolean(status.asset_set.confirmed_at) || status.faces.length === 0 || busy === 'asset'}
                onClick={() => void run('asset', () => gaApi.confirmAssetSet(projectCode, frameId), 'GA Asset Set confirmed and locked to this source revision.')}
              >
                <CheckCircle size={16} /> Confirm GA Asset Set
              </button>
              {status?.asset_set && (
                <div className="mt-4 text-xs leading-5 text-slate-500">
                  <div>Revision: <strong className="break-all text-slate-700">{status.asset_set.source_revision.slice(0, 16)}</strong></div>
                  <div>Faces selected: <strong className="text-slate-700">{status.faces.length}</strong></div>
                  <div>Status: <strong className="text-slate-700">{status.asset_set.status}</strong></div>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="min-w-0 rounded-xl border border-slate-200 p-4 sm:p-5">
          <SectionHeading number={3} title="Mapping Catalog" subtitle="Switch faces, zoom or pan, draw device rectangles, and generate deterministic terminal points from explicit block settings." />
          {!canMap && <div className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800">Confirm the GA Asset Set before creating a Mapping Catalog.</div>}
          <div className="grid min-w-0 gap-5 xl:grid-cols-[minmax(0,1.5fr)_minmax(300px,0.5fr)]">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                {FACE_OPTIONS.filter(option => status?.faces.some(face => face.face === option.value)).map(option => (
                  <button key={option.value} type="button" className={selectedFace === option.value ? 'btn-primary' : 'btn-secondary'} onClick={() => setSelectedFace(option.value)}>
                    {option.label}
                  </button>
                ))}
                <label className="ml-auto flex items-center gap-2 text-xs font-semibold text-slate-600">
                  Zoom
                  <input type="range" min={1} max={2.5} step={0.1} value={mappingZoom} onChange={event => setMappingZoom(Number(event.target.value))} />
                  {Math.round(mappingZoom * 100)}%
                </label>
              </div>
              <div className="mt-3 max-h-[620px] min-h-64 overflow-auto rounded-xl border border-slate-200 bg-slate-100 p-2">
                {faceImageUrl ? (
                  <div className="mx-auto w-fit min-w-full" style={{ width: `${mappingZoom * 100}%` }}>
                    <div
                      ref={mapHostRef}
                      className={`relative w-full touch-none select-none ${canMap ? 'cursor-crosshair' : 'cursor-default'}`}
                      onPointerDown={event => {
                        if (!canMap) return;
                        event.currentTarget.setPointerCapture(event.pointerId);
                        const point = mapPoint(event);
                        setSelectionStart(point);
                        setSelection({ x: point.x, y: point.y, width: 0, height: 0 });
                      }}
                      onPointerMove={event => { if (selectionStart) setSelection(boundedRect(selectionStart, mapPoint(event))); }}
                      onPointerUp={event => {
                        if (selectionStart) setSelection(boundedRect(selectionStart, mapPoint(event)));
                        setSelectionStart(null);
                      }}
                    >
                      <img className="pointer-events-none block h-auto w-full" src={faceImageUrl} alt={`${selectedFace} GA face`} draggable={false} />
                      {currentFaceItems.map(item => (
                        <div key={item.stableItemId} className="pointer-events-none absolute border-2 border-blue-600 bg-blue-500/10" style={rectStyle(item.rect)}>
                          <span className="absolute left-0 top-0 max-w-full truncate bg-blue-700 px-1.5 py-0.5 text-[10px] font-bold text-white">{item.tag}</span>
                        </div>
                      ))}
                      {currentFaceItems.map(item => <TerminalDots key={`term-${item.stableItemId}`} item={item} />)}
                      {selection && <div className="pointer-events-none absolute border-2 border-dashed border-amber-500 bg-amber-400/20" style={rectStyle(selection)} />}
                    </div>
                  </div>
                ) : (
                  <div className="flex min-h-64 items-center justify-center px-4 text-center text-sm text-slate-500">Save a selected GA face image before mapping.</div>
                )}
              </div>
              <div className="mt-3 grid gap-2">
                {items.map(item => (
                  <div key={item.stableItemId} className="flex min-w-0 items-center justify-between gap-3 rounded-lg bg-slate-50 px-3 py-2 text-sm">
                    <div className="min-w-0 truncate"><strong className="text-[#0B1F3A]">{item.tag}</strong> <span className="text-slate-500">- {item.type} - {item.face}{item.terminalBlock ? ` - ${item.terminalBlock.count} terminals` : ''}</span></div>
                    <button type="button" className="shrink-0 text-slate-400 hover:text-red-600" aria-label={`Remove ${item.tag}`} onClick={() => setItems(current => current.filter(entry => entry.stableItemId !== item.stableItemId))}>
                      <Trash2 size={16} />
                    </button>
                  </div>
                ))}
              </div>
            </div>

            <div className="min-w-0 rounded-xl bg-slate-50 p-4">
              <h4 className="font-bold text-[#0B1F3A]">New mapped item</h4>
              <p className="mt-1 text-xs text-slate-500">Draw a rectangle, complete the fields, then add it to the draft.</p>
              <div className="mt-3 grid gap-2.5">
                <input className="form-input" placeholder="Device tag (for example -X1)" value={itemDraft.tag} onChange={event => setItemDraft(current => ({ ...current, tag: event.target.value, terminalTag: current.terminalTag || event.target.value }))} />
                <input className="form-input" placeholder="Device type" value={itemDraft.type} onChange={event => setItemDraft(current => ({ ...current, type: event.target.value }))} />
                <input className="form-input" placeholder="Description (optional)" value={itemDraft.description} onChange={event => setItemDraft(current => ({ ...current, description: event.target.value }))} />
                <input className="form-input" placeholder="Aliases, comma separated" value={itemDraft.aliases} onChange={event => setItemDraft(current => ({ ...current, aliases: event.target.value }))} />
                <label className="flex items-center gap-2 text-sm font-semibold text-slate-700">
                  <input type="checkbox" checked={itemDraft.terminalEnabled} onChange={event => setItemDraft(current => ({ ...current, terminalEnabled: event.target.checked }))} />
                  Generate terminal points
                </label>
                {itemDraft.terminalEnabled && (
                  <>
                    <input className="form-input" placeholder="Terminal block tag" value={itemDraft.terminalTag} onChange={event => setItemDraft(current => ({ ...current, terminalTag: event.target.value }))} />
                    <div className="grid grid-cols-2 gap-2">
                      <label className="text-xs font-semibold text-slate-500">Count<input className="form-input mt-1 w-full" type="number" min={1} max={500} value={itemDraft.terminalCount} onChange={event => setItemDraft(current => ({ ...current, terminalCount: Number(event.target.value) }))} /></label>
                      <label className="text-xs font-semibold text-slate-500">First number<input className="form-input mt-1 w-full" value={itemDraft.firstTerminalNumber} onChange={event => setItemDraft(current => ({ ...current, firstTerminalNumber: event.target.value }))} /></label>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <label className="text-xs font-semibold text-slate-500">Orientation<select className="form-select mt-1 w-full" value={itemDraft.terminalOrientation} onChange={event => setItemDraft(current => ({ ...current, terminalOrientation: event.target.value as 'horizontal' | 'vertical' }))}><option value="horizontal">Horizontal</option><option value="vertical">Vertical</option></select></label>
                      <label className="text-xs font-semibold text-slate-500">Pitch<input className="form-input mt-1 w-full" type="number" min={0.01} step={0.01} value={itemDraft.terminalPitch} onChange={event => setItemDraft(current => ({ ...current, terminalPitch: Number(event.target.value) }))} /></label>
                    </div>
                    <label className="flex items-center gap-2 text-sm text-slate-700"><input type="checkbox" checked={itemDraft.terminalReversed} onChange={event => setItemDraft(current => ({ ...current, terminalReversed: event.target.checked }))} />Reverse terminal order</label>
                  </>
                )}
              </div>
              <button type="button" className="btn-secondary mt-4 w-full" onClick={addMappingItem} disabled={!canMap || !selection}>
                <Plus size={16} /> Add mapped item
              </button>
              <button type="button" className="btn-primary mt-2 w-full" onClick={() => void saveMapping()} disabled={!canMap || items.length === 0 || busy === 'mapping'}>
                Save Mapping Catalog draft
              </button>
              {mapping?.model && (
                <button
                  type="button"
                  className="btn-primary mt-2 w-full"
                  disabled={mapping.model.mapping_state === 'confirmed' || busy === 'confirm-mapping'}
                  onClick={() => void run('confirm-mapping', () => gaApi.confirmMapping(projectCode, frameId, mapping.model.id), 'Mapping Catalog confirmed.')}
                >
                  <CheckCircle size={16} /> Confirm Mapping Catalog
                </button>
              )}
              {mapping?.model && <p className="mt-3 break-all text-xs text-slate-500">Revision: {mapping.model.mapping_revision} - {mapping.model.mapping_state}</p>}
            </div>
          </div>
        </div>

        <div className="min-w-0 rounded-xl border border-slate-200 p-4 sm:p-5">
          <SectionHeading number={4} title="Schedule correlation & Finalization Queue" subtitle="Run deterministic endpoint matching, review every exception, and preserve the evidence for each decision." />
          <div className="flex flex-wrap items-center gap-3">
            <button type="button" className="btn-primary" onClick={() => void queueCorrelation()} disabled={mapping?.model.mapping_state !== 'confirmed' || busy === 'correlation'}>
              <Map size={16} /> {busy === 'correlation' ? 'Queueing…' : 'Run correlation'}
            </button>
            {activeJob && (
              <div className="flex flex-wrap items-center gap-2 text-sm text-slate-600">
                {!TERMINAL_JOB_STATES.has(activeJob.status) && <Loader size={16} />}
                <span>{activeJob.job_type.replaceAll('_', ' ')}</span>
                <StatusBadge value={activeJob.status} />
                <span className="text-xs">attempt {activeJob.attempts}/{activeJob.max_attempts}</span>
              </div>
            )}
          </div>
          {activeJob?.error && <p className="mt-2 text-sm text-red-600">{activeJob.error}</p>}
          <div className="mt-4 grid gap-3">
            {finalization.length === 0 && <p className="text-sm text-slate-500">No unresolved Finalization exceptions. Run correlation after confirming the current Mapping Catalog.</p>}
            {finalization.map(item => (
              <div key={item.id} className="min-w-0 rounded-xl border border-slate-200 p-3.5">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-bold text-[#0B1F3A]">Row {item.wiring_row_id} - {item.endpoint}</div>
                    <div className="mt-1 break-all text-sm text-slate-600">Original: {item.raw_device} / {item.raw_terminal}</div>
                    <div className="break-all text-xs text-slate-500">Normalized: {item.normalized_reference}</div>
                  </div>
                  <div className="flex flex-wrap gap-2"><StatusBadge value={item.state} /><StatusBadge value={item.review_status} /></div>
                </div>
                <div className="mt-3 grid gap-2 lg:grid-cols-[minmax(190px,1fr)_minmax(220px,1.4fr)_auto_auto_auto]">
                  <select className="form-select min-w-0" value={decisionTargets[item.id] ?? ''} onChange={event => setDecisionTargets(current => ({ ...current, [item.id]: event.target.value }))} aria-label={`Terminal link for row ${item.wiring_row_id}`}>
                    <option value="">Select mapped terminal</option>
                    {(mapping?.terminals ?? []).map(terminal => <option key={terminal.id} value={terminal.id}>{terminal.terminal_block}:{terminal.terminal_number}</option>)}
                  </select>
                  <input className="form-input min-w-0" placeholder="Decision reason (required for link/hold)" value={decisionReasons[item.id] ?? ''} onChange={event => setDecisionReasons(current => ({ ...current, [item.id]: event.target.value }))} />
                  <button type="button" className="btn-secondary" disabled={!item.suggested_terminal_id || busy === `decision-${item.id}`} onClick={() => void decide(item, 'confirm_suggestion')}>Accept suggestion</button>
                  <button type="button" className="btn-secondary" disabled={!decisionTargets[item.id] || busy === `decision-${item.id}`} onClick={() => void decide(item, 'link_existing')}>Link existing</button>
                  <button type="button" className="btn-secondary" disabled={(decisionReasons[item.id]?.trim().length ?? 0) < 3 || busy === `decision-${item.id}`} onClick={() => void decide(item, 'exception_hold')}>Exception hold</button>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="min-w-0 rounded-xl border border-slate-200 p-4 sm:p-5">
          <SectionHeading number={5} title="Release gate" subtitle="Release only when the confirmed GA revision, mapping revision, and current schedule correlation are complete and resolved. Until release, technicians see Twin Not Ready for 3D; 2D Operational Twin remains available." />
          {(() => {
            const gaOk = status?.asset_set?.status === 'confirmed';
            const mapOk = mapping?.model.mapping_state === 'confirmed';
            const scheduleOk = Boolean(status?.schedule_revision);
            const queueOk = finalization.length === 0;
            const alreadyReleased = status?.asset_set?.release_status === 'released';
            const canRelease = Boolean(status?.asset_set) && !alreadyReleased && mapOk && queueOk && busy !== 'release';
            const checks: Array<{ ok: boolean; label: string; detail: string }> = [
              { ok: gaOk, label: 'GA Asset Set confirmed', detail: status?.asset_set?.status ?? 'not started' },
              { ok: mapOk, label: 'Mapping Catalog confirmed', detail: mapping?.model.mapping_state ?? 'not started' },
              { ok: scheduleOk, label: 'Schedule revision present', detail: status?.schedule_revision?.slice(0, 18) ?? 'unavailable' },
              { ok: queueOk, label: 'Finalization queue clear', detail: queueOk ? 'No unresolved exceptions' : `${finalization.length} unresolved` },
            ];
            return (
              <div className="flex flex-col gap-4">
                <ul className="m-0 grid list-none gap-2 p-0 sm:grid-cols-2">
                  {checks.map(check => (
                    <li
                      key={check.label}
                      className={`rounded-lg border px-3 py-2 text-sm ${check.ok ? 'border-emerald-200 bg-emerald-50 text-emerald-900' : 'border-amber-200 bg-amber-50 text-amber-950'}`}
                    >
                      <div className="font-semibold">{check.ok ? 'Ready' : 'Pending'} - {check.label}</div>
                      <div className="mt-0.5 break-all text-xs opacity-80">{check.detail}</div>
                    </li>
                  ))}
                </ul>
                {status?.asset_set?.invalidated_reason && (
                  <div className="text-sm text-amber-700">Blocked: {status.asset_set.invalidated_reason}</div>
                )}
                {!queueOk && (
                  <div className="text-sm text-amber-800">
                    Resolve Finalization Queue exceptions above before release. Critical mapping gaps block the 3D Twin.
                  </div>
                )}
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <p className="m-0 max-w-xl text-sm leading-6 text-slate-600">
                    After release, assign the panel to one technician. Only that technician may open the Digital Wiring Schedule and 2D/3D Operational Twin.
                  </p>
                  <button
                    type="button"
                    className="btn-primary"
                    disabled={!canRelease}
                    onClick={() => void run('release', () => gaApi.release(projectCode, frameId), 'Panel GA foundation released for the current schedule.')}
                  >
                    <CheckCircle size={17} /> {busy === 'release' ? 'Validating…' : alreadyReleased ? 'Already released' : 'Validate & release panel'}
                  </button>
                </div>
              </div>
            );
          })()}
        </div>
      </div>
    </section>
  );
}
