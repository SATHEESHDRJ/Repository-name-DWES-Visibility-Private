import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Modal from '../Modal';
import FileViewer, { type FileViewerType } from '../ui/FileViewer';
import { ChevronLeft, ChevronRight, MapPin } from '../ui/icons';
import { liveTbAnalysisApi, projectsApi, tbMarkersApi } from '../../services/api';
import { useLatestRequest } from '../../hooks/useLatestRequest';
import {
  panelDrawingAssetForSlot,
  type PanelDrawingAsset,
  type PanelDrawingPackage,
} from '../../types/panelDrawing';
import type { ActiveWireSnapshot } from '../../types/liveTbView';
import type { TBMarkerMatchCandidate, TbCompletionOverviewGroup } from '../../types/tbMarker';
import DrawingMarkerOverlay, {
  type LiveTbFocusRegion,
  type StatusOverlayGroup,
} from './DrawingMarkerOverlay';
import LiveTbDemoOverlay, {
  DEMO_HAS_PHYSICAL_TB,
  LIVE_TB_DEMO_GEOMETRY,
  LIVE_TB_DEMO_WIRE,
  type LiveTbDemoScenario,
} from './LiveTbDemoOverlay';
import { liveTbDebugLog } from '../../utils/liveTbDebugLog';
import type { PdfFocusRegion } from '../ui/PdfDocumentViewer';
import { LIVE_TB_DEMO_ENABLED } from '../../config/features';

const NATIVE_IMAGE_FORMATS = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg']);

type Props = {
  open: boolean;
  snapshot: ActiveWireSnapshot | null;
  onClose: () => void;
};

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

function isDirectlyViewable(asset: PanelDrawingAsset | null | undefined): boolean {
  if (!asset) return false;
  const format = effectiveFormat(asset);
  return format === 'pdf' || NATIVE_IMAGE_FORMATS.has(format);
}

function indexOfBest(
  candidates: TBMarkerMatchCandidate[],
  best: TBMarkerMatchCandidate | null,
): number {
  if (!candidates.length) return 0;
  if (!best) return 0;
  const idx = candidates.findIndex(c => c.id === best.id);
  return idx >= 0 ? idx : 0;
}

/**
 * Read-only LIVE TB VIEW. Wiring mode: Source red / Destination blue.
 * Completion mode: each TB_GROUP once with status colours. Never edits GA or wiring.
 */
export default function LiveTbViewModal({ open, snapshot, onClose }: Props) {
  const viewerRootRef = useRef<HTMLDivElement>(null);
  const drawingRequests = useLatestRequest();
  const matchRequests = useLatestRequest();
  /** Immutable copy taken when the modal opens — does not track live parent changes. */
  const [frozen, setFrozen] = useState<ActiveWireSnapshot | null>(null);

  const [pkg, setPkg] = useState<PanelDrawingPackage | null>(null);
  const [blob, setBlob] = useState<Blob | null>(null);
  const [fileName, setFileName] = useState('');
  const [fileType, setFileType] = useState<FileViewerType>('pdf');
  const [drawingLoading, setDrawingLoading] = useState(false);
  const [drawingError, setDrawingError] = useState('');
  const [noGa, setNoGa] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  const [analysisStatus, setAnalysisStatus] = useState<string>('');
  const [analysisFailureReason, setAnalysisFailureReason] = useState<string>('');
  const [analysisResultSummary, setAnalysisResultSummary] = useState<Record<string, unknown> | null>(null);
  const [matchLoading, setMatchLoading] = useState(false);
  const [matchError, setMatchError] = useState('');
  const [sourceCandidates, setSourceCandidates] = useState<TBMarkerMatchCandidate[]>([]);
  const [destinationCandidates, setDestinationCandidates] = useState<TBMarkerMatchCandidate[]>([]);
  const [sourceIndex, setSourceIndex] = useState(0);
  const [destinationIndex, setDestinationIndex] = useState(0);
  const [markersConfigured, setMarkersConfigured] = useState(true);
  const [samePhysicalGroup, setSamePhysicalGroup] = useState(false);
  const [statusGroups, setStatusGroups] = useState<StatusOverlayGroup[] | null>(null);
  const [paintToken, setPaintToken] = useState(0);
  const [focusRegion, setFocusRegion] = useState<PdfFocusRegion | null>(null);
  const [reportBusy, setReportBusy] = useState(false);
  /** Presentation-only; never persisted. Reset on modal close. */
  const [demoMode, setDemoMode] = useState(false);
  const [demoScenario, setDemoScenario] = useState<LiveTbDemoScenario>('dual');
  
  // PHASE 5: Generic resolution metadata from Match API
  const [sourceResolution, setSourceResolution] = useState<any>(null);
  const [destinationResolution, setDestinationResolution] = useState<any>(null);

  const resetState = useCallback(() => {
    setPkg(null);
    setBlob(null);
    setFileName('');
    setFileType('pdf');
    setDrawingLoading(false);
    setDrawingError('');
    setNoGa(false);
    setAnalysisStatus('');
    setAnalysisFailureReason('');
    setAnalysisResultSummary(null);
    setMatchLoading(false);
    setMatchError('');
    setSourceCandidates([]);
    setDestinationCandidates([]);
    setSamePhysicalGroup(false);
    setSourceIndex(0);
    setDestinationIndex(0);
    setMarkersConfigured(true);
    setStatusGroups(null);
    setPaintToken(0);
    setFocusRegion(null);
    setDemoMode(false);
    setDemoScenario('dual');
    setSourceResolution(null);
    setDestinationResolution(null);
  }, []);

  const handleFocusRegion = useCallback((region: LiveTbFocusRegion | null) => {
    if (!region) {
      setFocusRegion(null);
      return;
    }
    setFocusRegion({
      page: region.page,
      x: region.x,
      y: region.y,
      width: region.width,
      height: region.height,
      token: region.token,
    });
  }, []);

  useEffect(() => {
    if (!open) {
      drawingRequests.cancel();
      matchRequests.cancel();
      resetState();
      setFrozen(null);
      return;
    }
    // Freeze snapshot at open — ignore subsequent parent updates while modal is open.
    setFrozen(snapshot ? { ...snapshot } : null);
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps -- intentional freeze-on-open

  // Demo-only: jump PDF viewer to physical TB banks on page 2 LEFT SIDE.
  // Uses a union box so SRC + DST both fit (presentation focusRegion only).
  useEffect(() => {
    if (!open || !demoMode || !DEMO_HAS_PHYSICAL_TB) return;
    const boxes = LIVE_TB_DEMO_GEOMETRY[demoScenario] || [];
    if (!boxes.length) return;
    let minX = 1;
    let minY = 1;
    let maxX = 0;
    let maxY = 0;
    let page = boxes[0].page;
    for (const b of boxes) {
      page = b.page;
      minX = Math.min(minX, b.x);
      minY = Math.min(minY, b.y);
      maxX = Math.max(maxX, b.x + b.width);
      maxY = Math.max(maxY, b.y + b.height);
    }
    // Pad so narrow vertical strips remain readable without panning off LEFT SIDE.
    const padX = 0.04;
    const padY = 0.03;
    setFocusRegion({
      page,
      x: Math.max(0, minX - padX),
      y: Math.max(0, minY - padY),
      width: Math.min(1, maxX - minX + padX * 2),
      height: Math.min(1, maxY - minY + padY * 2),
      token: `demo-${demoScenario}-${page}-${boxes.map(b => b.header).join('+')}`,
    });
  }, [open, demoMode, demoScenario]);

  useEffect(() => {
    if (!open || !frozen) return;

    const drawReq = drawingRequests.begin();
    setDrawingLoading(true);
    setDrawingError('');
    setNoGa(false);
    setBlob(null);

    void (async () => {
      try {
        const drawingPackage = await projectsApi.panelDrawing(
          frozen.project_code,
          frozen.frame_id,
          drawReq.signal,
        ) as PanelDrawingPackage;
        if (!drawingRequests.isLatest(drawReq.id)) return;
        setPkg(drawingPackage);
        const asset = panelDrawingAssetForSlot(drawingPackage, '2d');
        if (!asset || !isDirectlyViewable(asset)) {
          setNoGa(true);
          setDrawingLoading(false);
          return;
        }
        setFileName(effectiveFileName(asset));
        setFileType(fileViewerType(asset));
        const fileBlob = await projectsApi.panelDrawingSlotFile(
          frozen.project_code,
          frozen.frame_id,
          '2d',
          drawReq.signal,
        );
        if (!drawingRequests.isLatest(drawReq.id)) return;
        setBlob(fileBlob);
        setDrawingLoading(false);
        setPaintToken(t => t + 1);
      } catch (err: any) {
        if (!drawingRequests.isLatest(drawReq.id) || drawReq.signal.aborted) return;
        const status = err?.response?.status;
        if (status === 404) setNoGa(true);
        else {
          setDrawingError(
            err?.response?.data?.message || err?.message || 'Unable to load the GA drawing.',
          );
        }
        setDrawingLoading(false);
      }
    })();

    return () => {
      if (drawingRequests.isLatest(drawReq.id)) drawingRequests.cancel();
    };
  }, [open, frozen, reloadKey, drawingRequests]);

  useEffect(() => {
    if (!open || !frozen || noGa || drawingLoading || drawingError || !blob || !pkg) return;

    const matchReq = matchRequests.begin();
    setMatchLoading(true);
    setMatchError('');
    setStatusGroups(null);

    const PENDING_STATUSES = new Set([
      'ANALYSIS_PENDING',
      'ANALYSING',
      'ENRICHMENT_RETRY',
      'UPLOADED',
      'REANALYSIS_REQUIRED',
    ]);
    const drawingChecksum = pkg.drawing_2d?.sha256 || null;

    void (async () => {
      try {
        let status = '';
        let failureReason = '';
        let resultSummary: Record<string, unknown> | null = null;
        try {
          const st = await liveTbAnalysisApi.status(
            frozen.project_code,
            frozen.frame_id,
            matchReq.signal,
          );
          if (!matchRequests.isLatest(matchReq.id)) return;
          status = String(st?.status || '');
          failureReason = String(st?.failure_reason || '');
          resultSummary =
            st?.result_summary && typeof st.result_summary === 'object'
              ? (st.result_summary as Record<string, unknown>)
              : {};
          if (st?.panel_status) {
            resultSummary = { ...resultSummary, panel_status: st.panel_status };
          }
          if (st?.failed_stage) {
            resultSummary = { ...resultSummary, failed_stage: st.failed_stage };
          }
          setAnalysisStatus(status);
          setAnalysisFailureReason(failureReason);
          setAnalysisResultSummary(resultSummary);
        } catch {
          /* optional */
        }

        const analysisPending = PENDING_STATUSES.has(status);

        liveTbDebugLog('LiveTbViewModal.tsx:status', 'LIVE TB status+checksum before match', {
          project: frozen.project_code,
          frame: frozen.frame_id,
          status,
          failureReason,
          headersFound: resultSummary?.headers_found ?? null,
          headersMissing: resultSummary?.headers_missing ?? null,
          headersLegendOnly: resultSummary?.headers_legend_only ?? null,
          headersUnresolved: resultSummary?.headers_unresolved ?? null,
          scheduleMismatch: resultSummary?.schedule_drawing_mismatch ?? null,
          engine: resultSummary?.engine ?? null,
          notes: Array.isArray(resultSummary?.notes)
            ? (resultSummary!.notes as string[]).slice(0, 12)
            : null,
          high: resultSummary?.high ?? null,
          saved: resultSummary?.saved ?? null,
          analysisPending,
          drawingChecksum: drawingChecksum ? String(drawingChecksum).slice(0, 16) : null,
          sourceTb: frozen.source_tb,
          destTb: frozen.dest_tb,
          sourceTerminal: frozen.source_terminal,
          destTerminal: frozen.dest_terminal,
          sourceEquipment: frozen.source_equipment,
          destEquipment: frozen.dest_equipment,
          tbFieldsPresent: frozen.tb_fields_present,
          sourceIsPhysical: frozen.source_is_physical_tb,
          destIsPhysical: frozen.dest_is_physical_tb,
          wireId: frozen.wire_id,
          runId: 'post-fix',
        }, 'A,B,E');
        
        if (frozen.panel_complete) {
          const overview = await liveTbAnalysisApi.completionOverview(
            frozen.project_code,
            frozen.frame_id,
            matchReq.signal,
          );
          if (!matchRequests.isLatest(matchReq.id)) return;
          const groups = (overview?.groups || []) as TbCompletionOverviewGroup[];
          setStatusGroups(
            groups.map(g => ({
              id: g.id,
              page_number: g.page_number,
              geometry: g.geometry,
              colour: g.colour,
              label: `${g.tb_number} ${g.terminal_group} · ${g.completed}/${g.total_wires}`,
            })),
          );
          setMarkersConfigured(groups.length > 0);
          setSourceCandidates([]);
          setDestinationCandidates([]);
          setSamePhysicalGroup(false);
          setSourceResolution(null);
          setDestinationResolution(null);
          setMatchLoading(false);
          setPaintToken(t => t + 1);
          return;
        }

        // Equipment-only wires (e.g. 74IO → K01) have no physical TB header to match.
        if (frozen.tb_fields_present === false) {
          setSourceCandidates([]);
          setDestinationCandidates([]);
          setSamePhysicalGroup(false);
          setSourceResolution(null);
          setDestinationResolution(null);
          setSourceIndex(0);
          setDestinationIndex(0);
          setMarkersConfigured(false);
          setMatchLoading(false);
          setPaintToken(t => t + 1);
          return;
        }

        const res = await tbMarkersApi.match({
          projectCode: frozen.project_code,
          frameId: frozen.frame_id,
          source_device: frozen.source_device,
          source_terminal: frozen.source_terminal,
          dest_device: frozen.dest_device,
          dest_terminal: frozen.dest_terminal,
          drawing_checksum: drawingChecksum,
          signal: matchReq.signal,
        });
        if (!matchRequests.isLatest(matchReq.id)) return;

        let srcList: TBMarkerMatchCandidate[] = res?.source_marker_candidates || [];
        let dstList: TBMarkerMatchCandidate[] = res?.destination_marker_candidates || [];
        if (!srcList.length && res?.best_source) srcList = [res.best_source];
        if (!dstList.length && res?.best_destination) dstList = [res.best_destination];

        const hasSafeMatch = srcList.length > 0 || dstList.length > 0;

        // Pending/reanalysis: only paint when current-checksum HIGH markers exist; never paint stale.
        if (analysisPending && !hasSafeMatch) {
                    liveTbDebugLog('LiveTbViewModal.tsx:pending-gate', 'Pending gate: no paint', {
            status, srcCount: srcList.length, dstCount: dstList.length, hasSafeMatch,
          }, 'C,E');
                    setSourceCandidates([]);
          setDestinationCandidates([]);
          setSamePhysicalGroup(false);
          setSourceResolution(null);
          setDestinationResolution(null);
          setSourceIndex(0);
          setDestinationIndex(0);
          setMarkersConfigured(true);
          setMatchLoading(false);
          setPaintToken(t => t + 1);
          return;
        }

                liveTbDebugLog('LiveTbViewModal.tsx:paint', 'Paint path after match', {
          analysisPending,
          hasSafeMatch,
          srcCount: srcList.length,
          dstCount: dstList.length,
          srcIds: srcList.map(c => c.id),
          dstIds: dstList.map(c => c.id),
          srcTb: srcList[0]?.tb_number ?? null,
          dstTb: dstList[0]?.tb_number ?? null,
          srcGeom: srcList[0]?.geometry ?? null,
          dstGeom: dstList[0]?.geometry ?? null,
          sourceUnmatched: !!res?.source_unmatched,
          destUnmatched: !!res?.destination_unmatched,
          sourceReason: res?.source_match_reason ?? null,
          destReason: res?.destination_match_reason ?? null,
          checksumSent: drawingChecksum ? String(drawingChecksum).slice(0, 16) : null,
          checksumApplied: (res as any)?.drawing_checksum_applied
            ? String((res as any).drawing_checksum_applied).slice(0, 16)
            : null,
          supersededExcluded: (res as any)?.superseded_excluded ?? null,
          matchSrcDevice: frozen.source_device,
          matchDstDevice: frozen.dest_device,
          snapSrcTb: frozen.source_tb,
          snapDstTb: frozen.dest_tb,
          analysisStatus: status,
        }, 'B,C,E');

        setSourceCandidates(srcList);
        setDestinationCandidates(dstList);
        setSamePhysicalGroup(!!(res as { same_physical_group?: boolean })?.same_physical_group);
        setSourceIndex(indexOfBest(srcList, res?.best_source || null));
        setDestinationIndex(indexOfBest(dstList, res?.best_destination || null));
        // PHASE 5: Capture generic resolution metadata
        setSourceResolution((res as any)?.source_resolution || null);
        setDestinationResolution((res as any)?.destination_resolution || null);
        setMarkersConfigured(hasSafeMatch);
        setMatchLoading(false);
        setPaintToken(t => t + 1);
      } catch (err: any) {
        if (!matchRequests.isLatest(matchReq.id) || matchReq.signal.aborted) return;
        const status = err?.response?.status;
        if (status === 404) {
          setMarkersConfigured(false);
          setMatchError('');
        } else {
          setMatchError(
            err?.response?.data?.message
              || err?.message
              || 'Unable to match TB locations for this wire.',
          );
        }
        setMatchLoading(false);
      }
    })();

    return () => {
      if (matchRequests.isLatest(matchReq.id)) matchRequests.cancel();
    };
  }, [open, frozen, noGa, drawingLoading, drawingError, blob, pkg, matchRequests]);

  const activeSource = sourceCandidates[sourceIndex] ?? null;
  const activeDestination = destinationCandidates[destinationIndex] ?? null;
  const completionMode = !!frozen?.panel_complete;

  const cycleSource = useCallback((delta: number) => {
    setSourceIndex(prev => {
      const total = sourceCandidates.length;
      if (total <= 1) return prev;
      return (prev + delta + total) % total;
    });
    setPaintToken(t => t + 1);
  }, [sourceCandidates.length]);

  const cycleDestination = useCallback((delta: number) => {
    setDestinationIndex(prev => {
      const total = destinationCandidates.length;
      if (total <= 1) return prev;
      return (prev + delta + total) % total;
    });
    setPaintToken(t => t + 1);
  }, [destinationCandidates.length]);

  const focusMarkerLocation = useCallback((marker: TBMarkerMatchCandidate | null, role: 'source' | 'destination') => {
    if (!marker?.geometry) return;
    const g = marker.geometry;
    setFocusRegion({
      page: marker.page_number || 1,
      x: g.x,
      y: g.y,
      width: g.width,
      height: g.height,
      token: `${role}-${marker.id}-${Date.now()}`,
    });
  }, []);

  const downloadReport = useCallback(async () => {
    if (!frozen) return;
    setReportBusy(true);
    try {
      const blobOut = await liveTbAnalysisApi.downloadCompletionReport(
        frozen.project_code,
        frozen.frame_id,
      );
      const url = URL.createObjectURL(blobOut);
      const a = document.createElement('a');
      a.href = url;
      a.download = `LIVE-TB-Completion-${frozen.project_code}-${frozen.frame_id}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      /* ignore — optional Phase 6 */
    } finally {
      setReportBusy(false);
    }
  }, [frozen]);

  const wireChip = useMemo(() => {
    if (!frozen || completionMode) return null;
    // Demo header is presentation-only — does not mutate frozen / match state.
    // Labels must match physical overlay headers (never fake XTA-1 when table-only).
    if (LIVE_TB_DEMO_ENABLED && demoMode) {
      if (!DEMO_HAS_PHYSICAL_TB) {
        return (
          <div className="live-tb-wire-chip" aria-label="Demo wire (presentation only)">
            <span className="live-tb-wire-chip__id">Wire DEMO-001</span>
            <span className="live-tb-wire-chip__end">No physical TB strip on this GA page</span>
          </div>
        );
      }
      const demo = LIVE_TB_DEMO_WIRE[demoScenario];
      return (
        <div className="live-tb-wire-chip" aria-label="Demo wire (presentation only)">
          <span className="live-tb-wire-chip__id">Wire {demo.wireId}</span>
          <span className="live-tb-wire-chip__end live-tb-wire-chip__end--src">
            SRC TB {demo.sourceHeader} / {demo.sourceTerminal}
          </span>
          <span className="live-tb-wire-chip__end live-tb-wire-chip__end--dst">
            DST TB {demo.destHeader} / {demo.destTerminal}
          </span>
        </div>
      );
    }
    
    // PHASE 5: Use resolution metadata from API if available
    const srcResType = sourceResolution?.endpoint_type || frozen.source_endpoint_type || (frozen.source_is_physical_tb ? 'TB_GROUP' : (frozen.source_equipment ? 'DEVICE' : 'UNKNOWN'));
    const dstResType = destinationResolution?.endpoint_type || frozen.dest_endpoint_type || (frozen.dest_is_physical_tb ? 'TB_GROUP' : (frozen.dest_equipment ? 'DEVICE' : 'UNKNOWN'));
    
    const srcIdentity = sourceResolution?.physical_identity || frozen.source_physical_lookup_key || frozen.source_equipment || frozen.source_tb || '';
    const dstIdentity = destinationResolution?.physical_identity || frozen.dest_physical_lookup_key || frozen.dest_equipment || frozen.dest_tb || '';
    
    const srcTermRef = sourceResolution?.terminal_reference || frozen.source_terminal_reference || frozen.source_equipment_terminal || frozen.source_terminal || '';
    const dstTermRef = destinationResolution?.terminal_reference || frozen.dest_terminal_reference || frozen.dest_equipment_terminal || frozen.dest_terminal || '';
    
    const srcIsDevice = srcResType === 'DEVICE' || srcResType === 'DEVICE_TERMINAL';
    const dstIsDevice = dstResType === 'DEVICE' || dstResType === 'DEVICE_TERMINAL';
    
    const srcLabel = srcIsDevice
      ? `SRC DEVICE ${srcIdentity || '—'} · TERM ${srcTermRef || '—'}`
      : (srcIdentity
        ? `SRC TB ${srcIdentity} · TERM ${srcTermRef || '—'}`
        : `SRC —`);
    
    const dstLabel = dstIsDevice
      ? `DST DEVICE ${dstIdentity || '—'} · TERM ${dstTermRef || '—'}`
      : (dstIdentity
        ? `DST TB ${dstIdentity} · TERM ${dstTermRef || '—'}`
        : `DST —`);
    
    return (
      <div className="live-tb-wire-chip" aria-label="Active wire">
        <span className="live-tb-wire-chip__id">Wire {frozen.wire_id}</span>
        <span className="live-tb-wire-chip__end live-tb-wire-chip__end--src">
          {srcLabel}
        </span>
        <span className="live-tb-wire-chip__end live-tb-wire-chip__end--dst">
          {dstLabel}
        </span>
      </div>
    );
  }, [frozen, completionMode, demoMode, demoScenario, sourceResolution, destinationResolution]);

  if (!open) return null;

  const emptyWire = !frozen;
  const showViewer = !emptyWire && !noGa && !drawingError && (blob || drawingLoading);
  const panelStatusRaw = String(
    (analysisResultSummary as any)?.panel_status || analysisStatus || '',
  ).toUpperCase();
  const mismatchFromSummary =
    analysisFailureReason.includes('SCHEDULE_DRAWING_MISMATCH')
    || analysisResultSummary?.schedule_drawing_mismatch === true;
  // Legacy DETECTION_FAILED must never drive Technician technical copy.
  let panelStatus = panelStatusRaw;
  if (panelStatusRaw === 'DETECTION_FAILED' || panelStatusRaw === 'PARTIAL_DETECTION') {
    panelStatus = mismatchFromSummary
      ? 'SCHEDULE_DRAWING_MISMATCH'
      : 'SUPERVISOR_VERIFICATION_REQUIRED';
  }
  const pendingAnalysis = [
    'ANALYSIS_PENDING', 'ANALYSING', 'ENRICHMENT_RETRY', 'UPLOADED',
    'REANALYSIS_REQUIRED', 'ANALYSIS_IN_PROGRESS',
  ].includes(analysisStatus) || panelStatus === 'ANALYSIS_IN_PROGRESS';
  const analysisStatusPending = !analysisStatus && !matchLoading && !!frozen && !noGa && !drawingError;
  const analysisReady = ['READY_FOR_LIVE_TB', 'PARTIAL_DETECTION'].includes(analysisStatus)
    || panelStatus === 'READY_FOR_LIVE_TB';
  const awaitingSupervisor =
    analysisStatus === 'SUPERVISOR_VERIFICATION_REQUIRED'
    || panelStatus === 'SUPERVISOR_VERIFICATION_REQUIRED'
    || panelStatus === 'TECHNICAL_FAILURE';
  const scheduleMismatch =
    analysisStatus === 'SCHEDULE_DRAWING_MISMATCH'
    || panelStatus === 'SCHEDULE_DRAWING_MISMATCH'
    || mismatchFromSummary;
  const tbFieldsMissing = !!frozen && frozen.tb_fields_present === false;
  const normTb = (v: string) => String(v || '').trim().replace(/\s+/g, '').toUpperCase();
  const headersMissing = Array.isArray(analysisResultSummary?.headers_missing)
    ? (analysisResultSummary!.headers_missing as string[]).map(normTb)
    : [];
  const headersFound = Array.isArray(analysisResultSummary?.headers_found)
    ? (analysisResultSummary!.headers_found as string[]).map(normTb)
    : [];
  const wirePhysicalTbs = [frozen?.source_tb, frozen?.dest_tb].filter(Boolean).map(s => normTb(String(s)));
  const wireTbsAbsentFromDrawing =
    scheduleMismatch
    || (
      wirePhysicalTbs.length > 0
      && (headersFound.length + headersMissing.length) > 0
      && wirePhysicalTbs.some(tb => headersMissing.includes(tb) || !headersFound.includes(tb))
      && !activeSource
      && !activeDestination
    );
  const sourceDestPagesDiffer =
    !!activeSource
    && !!activeDestination
    && (activeSource.page_number || 1) !== (activeDestination.page_number || 1);
  const multiAmbiguous =
    !completionMode
    && ((sourceCandidates.length > 1) || (destinationCandidates.length > 1));

  // Technician banner contract — never show generic technical failure.
  const FORBIDDEN_TECH =
    'Automatic TB-location analysis could not be completed for this drawing.';
  let bannerMessage: string | null = null;
  if (emptyWire) {
    bannerMessage = 'No active wire is available. Start or resume a wire to view its TB location.';
  } else if (noGa) {
    bannerMessage = 'GA drawing is not available for this assigned panel.';
  } else if (drawingError) {
    bannerMessage = drawingError === FORBIDDEN_TECH
      ? 'The TB location is awaiting Supervisor verification.'
      : drawingError;
  } else if (tbFieldsMissing && !matchLoading) {
    const srcEq = frozen?.source_equipment;
    const dstEq = frozen?.dest_equipment;
    const srcDev = frozen?.source_endpoint_type === 'DEVICE'
      || frozen?.source_endpoint_type === 'DEVICE_TERMINAL';
    const dstDev = frozen?.dest_endpoint_type === 'DEVICE'
      || frozen?.dest_endpoint_type === 'DEVICE_TERMINAL';
    if (srcDev || dstDev || srcEq || dstEq) {
      bannerMessage = `This wire ends on equipment`
        + (srcEq ? ` ${srcEq}/${frozen?.source_equipment_terminal || '—'}` : '')
        + (srcEq && dstEq ? ' →' : '')
        + (dstEq ? ` ${dstEq}/${frozen?.dest_equipment_terminal || '—'}` : '')
        + '. No physical terminal-block header is present on the schedule row for LIVE TB highlight.';
    } else {
      bannerMessage = 'TB header information is not available for this wire in the wiring schedule.';
    }
  } else if ((activeSource || activeDestination) && !matchLoading) {
    // READY paint path — independent unresolved ends (DEVICE vs TB messages).
    const srcIsDevice = frozen?.source_endpoint_type === 'DEVICE'
      || frozen?.source_endpoint_type === 'DEVICE_TERMINAL';
    const dstIsDevice = frozen?.dest_endpoint_type === 'DEVICE'
      || frozen?.dest_endpoint_type === 'DEVICE_TERMINAL';
    const srcTag = frozen?.source_physical_lookup_key || frozen?.source_equipment || '—';
    const dstTag = frozen?.dest_physical_lookup_key || frozen?.dest_equipment || '—';
    if (multiAmbiguous) {
      bannerMessage = 'The TB location is awaiting Supervisor verification.';
    } else if (!completionMode && !activeSource && activeDestination && frozen?.source_is_physical_tb) {
      bannerMessage = 'The Source TB location could not be identified automatically for this wire.';
    } else if (!completionMode && !activeSource && activeDestination && srcIsDevice) {
      bannerMessage = `The Source device ${srcTag} could not be identified automatically in the assigned panel GA drawing.`;
    } else if (!completionMode && activeSource && !activeDestination && frozen?.dest_is_physical_tb) {
      bannerMessage = 'The Destination TB location could not be identified automatically for this wire.';
    } else if (!completionMode && activeSource && !activeDestination && dstIsDevice) {
      bannerMessage = `The Destination device ${dstTag} could not be identified automatically in the assigned panel GA drawing.`;
    } else if (!completionMode && !activeSource && activeDestination) {
      bannerMessage = null;
    } else if (!completionMode && activeSource && !activeDestination) {
      bannerMessage = null;
    } else {
      bannerMessage = null;
    }
  } else if (!activeSource && !activeDestination && !matchLoading && !completionMode && frozen) {
    // Both ends unresolved — prefer endpoint-specific device/TB copy over generic mismatch.
    const srcIsDevice = frozen.source_endpoint_type === 'DEVICE'
      || frozen.source_endpoint_type === 'DEVICE_TERMINAL';
    const dstIsDevice = frozen.dest_endpoint_type === 'DEVICE'
      || frozen.dest_endpoint_type === 'DEVICE_TERMINAL';
    const srcTag = frozen.source_physical_lookup_key || frozen.source_equipment || '';
    const dstTag = frozen.dest_physical_lookup_key || frozen.dest_equipment || '';
    if (srcIsDevice && frozen.dest_is_physical_tb) {
      bannerMessage = `The Source device ${srcTag} could not be identified automatically in the assigned panel GA drawing.`
        + (wireTbsAbsentFromDrawing || scheduleMismatch
          ? ' The Destination TB location could not be identified automatically for this wire.'
          : '');
    } else if (frozen.source_is_physical_tb && dstIsDevice) {
      bannerMessage = `The Destination device ${dstTag} could not be identified automatically in the assigned panel GA drawing.`
        + (wireTbsAbsentFromDrawing || scheduleMismatch
          ? ' The Source TB location could not be identified automatically for this wire.'
          : '');
    } else if (pendingAnalysis || analysisStatusPending) {
      bannerMessage = 'Automatic TB-location analysis is in progress for this panel.';
    } else if (
      scheduleMismatch
      || panelStatus === 'SCHEDULE_DRAWING_MISMATCH'
      || wireTbsAbsentFromDrawing
    ) {
      bannerMessage = 'The TB listed in the wiring schedule was not found in the assigned panel GA drawing.';
    } else if (
      awaitingSupervisor
      || panelStatus === 'TECHNICAL_FAILURE'
      || panelStatus === 'SUPERVISOR_VERIFICATION_REQUIRED'
      || multiAmbiguous
      || (!markersConfigured && analysisReady)
    ) {
      bannerMessage = 'The TB location is awaiting Supervisor verification.';
    } else if (matchError) {
      bannerMessage = String(matchError).includes('could not be completed')
        ? 'The TB location is awaiting Supervisor verification.'
        : matchError;
    }
  } else if (pendingAnalysis || analysisStatusPending) {
    bannerMessage = 'Automatic TB-location analysis is in progress for this panel.';
  } else if (
    scheduleMismatch
    || panelStatus === 'SCHEDULE_DRAWING_MISMATCH'
    || wireTbsAbsentFromDrawing
  ) {
    // Prefer mismatch over READY/awaiting — baseline markers must not hide schedule gaps.
    // Do not treat a DEVICE end's absent X* terminal-ref as a missing schedule TB.
    bannerMessage = 'The TB listed in the wiring schedule was not found in the assigned panel GA drawing.';
  } else if (
    awaitingSupervisor
    || panelStatus === 'TECHNICAL_FAILURE'
    || panelStatus === 'SUPERVISOR_VERIFICATION_REQUIRED'
    || multiAmbiguous
    || (!markersConfigured && analysisReady)
  ) {
    // Technical failure is Supervisor-only; Technician sees verification-needed.
    bannerMessage = 'The TB location is awaiting Supervisor verification.';
  } else if (matchError) {
    bannerMessage = String(matchError).includes('could not be completed')
      ? 'The TB location is awaiting Supervisor verification.'
      : matchError;
  }

  // Hard contract: Technician never sees generic technical failure.
  if (bannerMessage === FORBIDDEN_TECH) {
    bannerMessage = scheduleMismatch || mismatchFromSummary
      ? 'The TB listed in the wiring schedule was not found in the assigned panel GA drawing.'
      : 'The TB location is awaiting Supervisor verification.';
  }

  liveTbDebugLog('LiveTbViewModal.tsx:banner', 'Banner decision', {
    bannerMessage,
    analysisStatus,
    panelStatus,
    wireTbsAbsentFromDrawing,
    awaitingSupervisor,
    wirePhysicalTbs,
    headersFound,
    headersMissing,
    failureReason: analysisFailureReason.slice(0, 200),
    hasSrc: !!activeSource,
    hasDst: !!activeDestination,
    markersConfigured,
    matchLoading,
    verdictHint: wireTbsAbsentFromDrawing
      ? 'A_SCHEDULE_DRAWING_MISMATCH'
      : (awaitingSupervisor
        ? 'SUPERVISOR_VERIFICATION_REQUIRED'
        : (pendingAnalysis ? 'ANALYSIS_IN_PROGRESS' : (activeSource || activeDestination ? 'PAINT_OK' : 'OTHER'))),
  }, 'A,B,C,D');

  const bannerWarn = emptyWire || noGa || !!drawingError || !!matchError
    || panelStatus === 'SCHEDULE_DRAWING_MISMATCH'
    || panelStatus === 'SUPERVISOR_VERIFICATION_REQUIRED'
    || panelStatus === 'TECHNICAL_FAILURE'
    || awaitingSupervisor || tbFieldsMissing
    || (!markersConfigured && !pendingAnalysis);

  return (
    <Modal
      title="LIVE TB VIEW"
      subtitle={frozen
        ? `${frozen.panel_name || 'Panel'} · ${frozen.project_code}${completionMode ? ' · Completion overview' : ''}`
        : 'Terminal block locations'}
      icon={<MapPin size={20} />}
      onClose={onClose}
      size="fullscreen"
      bodyClassName="modal-body-flush live-tb-modal-body"
      footer={(
        <>
          {completionMode ? (
            <button
              type="button"
              className="btn-secondary"
              disabled={reportBusy}
              onClick={() => void downloadReport()}
            >
              {reportBusy ? 'Preparing report…' : 'Download Completed LIVE TB Report'}
            </button>
          ) : null}
          <button type="button" className="btn-primary" onClick={onClose}>Close</button>
        </>
      )}
    >
      <div className="live-tb-modal">
        {LIVE_TB_DEMO_ENABLED && !emptyWire && !completionMode ? (
          <div className="live-tb-demo-toolbar" role="toolbar" aria-label="LIVE TB presentation demo">
            <button
              type="button"
              className={`live-tb-demo-btn${demoMode ? ' live-tb-demo-btn--active' : ''}`}
              onClick={() => setDemoMode(v => !v)}
            >
              {demoMode ? 'EXIT DEMO' : 'DEMO VIEW'}
            </button>
            {demoMode ? (
              <>
                <span className="live-tb-demo-badge">DEMO VIEW — VISUAL EXAMPLE ONLY</span>
                <div className="live-tb-demo-scenario" role="group" aria-label="Demo scenario">
                  <button
                    type="button"
                    aria-pressed={demoScenario === 'dual'}
                    onClick={() => setDemoScenario('dual')}
                  >
                    Dual groups
                  </button>
                  <button
                    type="button"
                    aria-pressed={demoScenario === 'same_header'}
                    onClick={() => setDemoScenario('same_header')}
                  >
                    Same header
                  </button>
                </div>
              </>
            ) : null}
          </div>
        ) : null}
        {wireChip}
        {/* Real banners/legends hidden visually in demo only — state untouched. */}
        {!demoMode && bannerMessage ? (
          <div
            className={`live-tb-banner${bannerWarn ? ' live-tb-banner--warn' : ' live-tb-banner--info'}`}
            role="status"
          >
            {bannerMessage}
          </div>
        ) : null}
        {!demoMode && !emptyWire && !noGa && !matchLoading && (activeSource || activeDestination) ? (
          <div className="live-tb-banner live-tb-banner--info" role="status">
            {(() => {
              const srcTb = activeSource?.tb_number || '';
              const dstTb = activeDestination?.tb_number || '';
              const sameHeader =
                samePhysicalGroup
                || !!(srcTb && dstTb && srcTb.toUpperCase() === dstTb.toUpperCase());
              if (sameHeader && activeSource && activeDestination) {
                return (
                  <>
                    Source and Destination TB group: {srcTb}
                    {' '}
                    (schedule terminals {activeSource.matched_terminal || frozen?.source_terminal || '—'}
                    {' → '}
                    {activeDestination.matched_terminal || frozen?.dest_terminal || '—'}).
                    {activeSource.view_classification
                      ? ` (${activeSource.view_classification})`
                      : ''}
                  </>
                );
              }
              return (
                <>
                  Matched
                  {activeSource
                    ? ` Source TB group ${activeSource.tb_number} / ${activeSource.matched_terminal || frozen?.source_terminal || activeSource.terminal_group}`
                    : ''}
                  {activeSource && activeDestination ? ' ·' : ''}
                  {activeDestination
                    ? ` Destination TB group ${activeDestination.tb_number} / ${activeDestination.matched_terminal || frozen?.dest_terminal || activeDestination.terminal_group}`
                    : ''}
                  .
                  {activeSource?.view_classification || activeDestination?.view_classification
                    ? ` (${[activeSource?.view_classification, activeDestination?.view_classification].filter(Boolean).join(' / ')})`
                    : ''}
                </>
              );
            })()}
          </div>
        ) : null}
        {!demoMode && completionMode && statusGroups?.length ? (
          <div className="live-tb-toolbar">
            <div className="live-tb-legend">
              <span className="live-tb-legend__item"><i style={{ background: '#16a34a' }} /> Completed</span>
              <span className="live-tb-legend__item"><i style={{ background: '#d97706' }} /> Partial / skipped path</span>
              <span className="live-tb-legend__item"><i style={{ background: '#e11d48' }} /> Issues</span>
            </div>
          </div>
        ) : null}
        {!demoMode && !emptyWire && !noGa && !drawingError && !completionMode && (activeSource || activeDestination) ? (
          <div className="live-tb-toolbar">
            <div className="live-tb-legend live-tb-legend--src-dst" role="note">
              <span className="live-tb-legend__item live-tb-legend__item--source">
                <i /> RED = SOURCE
              </span>
              <span className="live-tb-legend__item live-tb-legend__item--destination">
                <i /> BLUE = DESTINATION
              </span>
            </div>
            <div className="live-tb-match-navs">
              {sourceDestPagesDiffer ? (
                <div className="live-tb-page-navs" aria-label="Source and destination page navigation">
                  <button
                    type="button"
                    className="live-tb-match-nav__btn live-tb-page-nav live-tb-page-nav--source"
                    onClick={() => focusMarkerLocation(activeSource, 'source')}
                  >
                    Source Location (p.{activeSource?.page_number || 1})
                  </button>
                  <button
                    type="button"
                    className="live-tb-match-nav__btn live-tb-page-nav live-tb-page-nav--destination"
                    onClick={() => focusMarkerLocation(activeDestination, 'destination')}
                  >
                    Destination Location (p.{activeDestination?.page_number || 1})
                  </button>
                </div>
              ) : null}
              {sourceCandidates.length > 1 ? (
                <div className="live-tb-match-nav live-tb-match-nav--source" aria-label="Source matches">
                  <button type="button" className="live-tb-match-nav__btn" onClick={() => cycleSource(-1)} aria-label="Previous source match">
                    <ChevronLeft size={16} />
                  </button>
                  <span className="live-tb-match-nav__label">
                    Source {sourceIndex + 1} of {sourceCandidates.length}
                  </span>
                  <button type="button" className="live-tb-match-nav__btn" onClick={() => cycleSource(1)} aria-label="Next source match">
                    <ChevronRight size={16} />
                  </button>
                </div>
              ) : null}
              {destinationCandidates.length > 1 ? (
                <div className="live-tb-match-nav live-tb-match-nav--destination" aria-label="Destination matches">
                  <button type="button" className="live-tb-match-nav__btn" onClick={() => cycleDestination(-1)} aria-label="Previous destination match">
                    <ChevronLeft size={16} />
                  </button>
                  <span className="live-tb-match-nav__label">
                    Destination {destinationIndex + 1} of {destinationCandidates.length}
                  </span>
                  <button type="button" className="live-tb-match-nav__btn" onClick={() => cycleDestination(1)} aria-label="Next destination match">
                    <ChevronRight size={16} />
                  </button>
                </div>
              ) : null}
            </div>
          </div>
        ) : null}
        {showViewer ? (
          <div className="live-tb-viewer" ref={viewerRootRef}>
            <FileViewer
              blob={blob}
              fileType={fileType}
              panelLabel={frozen?.panel_name || 'Panel'}
              fileName={fileName || pkg?.drawing_2d?.original_name || 'GA'}
              loading={drawingLoading}
              error=""
              onRetry={() => setReloadKey(k => k + 1)}
              className="pdf-viewer--modal"
              focusRegion={focusRegion}
            />
            {!demoMode && matchLoading ? (
              <div className="live-tb-banner live-tb-banner--info" role="status">
                Matching TB locations for this wire…
              </div>
            ) : null}
            {/* Real marker paint suppressed visually in demo; candidates/state unchanged. */}
            {!demoMode ? (
              <DrawingMarkerOverlay
                containerRef={viewerRootRef}
                source={completionMode ? null : activeSource}
                destination={completionMode ? null : activeDestination}
                samePhysicalGroup={!completionMode && samePhysicalGroup}
                statusGroups={completionMode ? statusGroups : null}
                paintToken={paintToken}
                onFocusRegion={handleFocusRegion}
              />
            ) : null}
            {LIVE_TB_DEMO_ENABLED ? (
              <LiveTbDemoOverlay
                active={demoMode}
                scenario={demoScenario}
                containerRef={viewerRootRef}
                paintToken={`${demoScenario}-${paintToken}`}
              />
            ) : null}
          </div>
        ) : null}
      </div>
    </Modal>
  );
}
