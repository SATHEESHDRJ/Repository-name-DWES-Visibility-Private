import fs from 'node:fs';

const p = 'C:/Users/sathe/OneDrive/Desktop/DWES/src/components/supervisor/Panel3dModelWorkspaceModal.tsx';
const content = `import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Modal from '../Modal';
import ActionStatusPanel from '../ui/ActionStatusPanel';
import { Boxes, CheckCircle, Eye, FileSpreadsheet, FileText, Upload } from '../ui/icons';
import { engineeringApi, gaApi, projectsApi } from '../../services/api';
import { PANEL_3D_ENABLED } from '../../config/features';
import {
  PANEL_MODEL_STATUS_LABELS,
  type PanelModelStatus,
  type PanelModelView,
} from '../../types/panelModel';
import PanelDrawingUploadModal from './PanelDrawingUploadModal';
import EngineeringPackageUploadModal from './EngineeringPackageUploadModal';
import GaFoundationWorkspace from './GaFoundationWorkspace';
import { DwesLoadingCenter } from '../ui/DwesLoadingIndicator';
import { emitDocumentsChanged } from '../../utils/projectDocumentsEvents';
import PanelGaDrawingModal from '../ui/PanelGaDrawingModal';
import {
  describePanel3dPriority,
  PANEL_3D_SOURCE_LABEL,
  resolvePrimaryPanel3dSource,
  type Panel3dSourceSnapshot,
} from '../../utils/panel3dSourcePriority';

type WorkspaceStep = 'upload' | 'convert' | 'map' | 'validate' | 'publish';

const STEPS: Array<{ id: WorkspaceStep; label: string; hint: string }> = [
  { id: 'upload', label: '1. Upload', hint: 'Engineering package (primary)' },
  { id: 'convert', label: '2. Secondary', hint: 'Generated / GA paths' },
  { id: 'map', label: '3. Map', hint: 'GA mapping (secondary)' },
  { id: 'validate', label: '4. Validate', hint: 'Package + review' },
  { id: 'publish', label: '5. Publish', hint: 'approveAndPublish' },
];

type EngListResponse = {
  published: { model_id: number; model_revision: string; devices: number; terminals: number; published: boolean } | null;
  draft: { model_id: number; model_revision: string; devices: number; terminals: number; approval_status: string } | null;
  revisions: Array<{ model_id: number; model_revision: string; approval_status: string; published: boolean; devices: number; terminals: number }>;
};

type ValidationResult = {
  valid: boolean;
  issues?: Array<{ level: string; code: string; message: string }>;
  deviceCount?: number;
  terminalCount?: number;
  scheduleMatch?: { totalEnds: number; matchedEnds: number; unmatchedRefs: string[] };
};

type ReviewSummary = {
  model_id: number;
  model_revision: string;
  approval_status: string;
  published: boolean;
  devices: number;
  terminals: number;
  matched_ends: number;
  schedule_ends: number;
  unmatched_refs: string[];
};

function statusTone(status: PanelModelStatus | 'no_drawing' | string | undefined): 'ok' | 'warn' | 'error' | 'idle' {
  if (!status || status === 'no_drawing') return 'idle';
  if (status === 'approved') return 'ok';
  if (status === 'conversion_failed') return 'error';
  if (status === 'verification_required') return 'warn';
  return 'warn';
}

/**
 * Supervisor Panel 3D Model workspace — Phase 2.
 * Primary: Engineering Package validate → import → approveAndPublish.
 * Secondary: GA Foundation + generated Panel Model convert.
 */
export default function Panel3dModelWorkspaceModal({
  projectCode,
  projectName,
  frameId,
  panelName,
  hasDrawing2d = false,
  onClose,
  onChanged,
}: {
  projectCode: string;
  projectName?: string;
  frameId: string;
  panelName: string;
  hasDrawing2d?: boolean;
  onClose: () => void;
  onChanged?: () => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState<WorkspaceStep>('upload');
  const [model, setModel] = useState<PanelModelView | null>(null);
  const [engList, setEngList] = useState<EngListResponse | null>(null);
  const [gaReleased, setGaReleased] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<'convert' | 'approve-gen' | 'validate' | 'import' | 'approve-eng' | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [pkgJson, setPkgJson] = useState<unknown | null>(null);
  const [pkgFileName, setPkgFileName] = useState('');
  const [validation, setValidation] = useState<ValidationResult | null>(null);
  const [review, setReview] = useState<ReviewSummary | null>(null);
  const [uploadSlot, setUploadSlot] = useState<'2d' | '3d' | null>(null);
  const [showPackageExcel, setShowPackageExcel] = useState(false);
  const [showViewer, setShowViewer] = useState(false);
  const [showGaMap, setShowGaMap] = useState(false);
  const [twinSummary, setTwinSummary] = useState('');
  const [ackAssumptions, setAckAssumptions] = useState(false);
  const [verifyNotes, setVerifyNotes] = useState('');

  const refresh = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    setError('');
    try {
      const [view, list] = await Promise.all([
        projectsApi.panelModel(projectCode, frameId, signal) as Promise<PanelModelView>,
        engineeringApi.listModels(projectCode, frameId, signal) as Promise<EngListResponse>,
      ]);
      if (signal?.aborted) return;
      setModel(view);
      setEngList(list);
      if (list?.draft?.model_id) {
        try {
          const summary = await engineeringApi.reviewModel(list.draft.model_id) as ReviewSummary;
          if (!signal?.aborted) setReview(summary);
        } catch { /* draft review optional */ }
      } else if (list?.published?.model_id) {
        try {
          const summary = await engineeringApi.reviewModel(list.published.model_id) as ReviewSummary;
          if (!signal?.aborted) setReview(summary);
        } catch { /* ignore */ }
      }
      try {
        const ga = await gaApi.status(projectCode, frameId, signal);
        if (!signal?.aborted) setGaReleased(ga?.asset_set?.release_status === 'released');
      } catch {
        if (!signal?.aborted) setGaReleased(false);
      }
      try {
        const ctx = await engineeringApi.twinContext(projectCode, frameId, 0, signal);
        if (!signal?.aborted && ctx) {
          const modes = Array.isArray(ctx.availableModes) ? ctx.availableModes.join(', ') : 'none';
          setTwinSummary(\`Published twin modes: \${modes || 'none yet'}\`);
        }
      } catch {
        if (!signal?.aborted) setTwinSummary('Twin context: Approved 2D only until an Engineering Package is published.');
      }
    } catch (e: unknown) {
      if (signal?.aborted) return;
      const msg = (e as { response?: { data?: { message?: string } }; message?: string })?.response?.data?.message
        || (e as { message?: string })?.message
        || 'Could not load panel 3D model status.';
      setError(msg);
      setModel(null);
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, [projectCode, frameId]);

  useEffect(() => {
    const ac = new AbortController();
    void refresh(ac.signal);
    return () => ac.abort();
  }, [refresh]);

  const snapshot: Panel3dSourceSnapshot = useMemo(() => ({
    engineeringPublished: Boolean(engList?.published),
    engineeringDraft: Boolean(engList?.draft),
    gaReleased,
    generatedApproved: model?.current?.status === 'approved',
    generatedPresent: Boolean(model?.current),
    hasDrawing2d: Boolean(model?.has_drawing_2d || hasDrawing2d),
  }), [engList, gaReleased, model, hasDrawing2d]);

  const primarySource = resolvePrimaryPanel3dSource(snapshot);
  const priorityText = describePanel3dPriority(snapshot);

  const current = model?.current ?? null;
  const panelStatus = (model?.panel_status ?? 'no_drawing') as PanelModelStatus | 'no_drawing';
  const statusLabel = engList?.published
    ? \`Engineering published (\${engList.published.model_revision})\`
    : engList?.draft
      ? \`Engineering draft (\${engList.draft.model_revision})\`
      : (PANEL_MODEL_STATUS_LABELS[panelStatus] ?? String(panelStatus));
  const tone = engList?.published ? 'ok' : engList?.draft ? 'warn' : statusTone(panelStatus);
  const canConvert = Boolean(model?.permissions.can_convert && model.has_drawing_2d);
  const canApproveGen = Boolean(
    model?.permissions.can_approve
    && current
    && current.status === 'verification_required'
    && current.model_file,
  );
  const draftId = engList?.draft?.model_id ?? review?.model_id ?? null;
  const canApproveEng = Boolean(draftId && review && review.devices > 0 && review.terminals > 0 && !review.published);

  const onPickPackage = async (file: File) => {
    setError('');
    setNotice('');
    setValidation(null);
    try {
      const text = await file.text();
      const parsed = JSON.parse(text) as Record<string, unknown>;
      // Bind package to the selected panel (authoritative route params on import).
      parsed.project_code = projectCode;
      parsed.frame_id = frameId;
      if (!parsed.package_type) parsed.package_type = 'dwes-engineering-package';
      if (!parsed.spec_version) parsed.spec_version = 1;
      if (!parsed.units) parsed.units = 'mm';
      setPkgJson(parsed);
      setPkgFileName(file.name);
      setNotice(\`Loaded \${file.name}. Run Validate (primary path) before import.\`);
      setStep('validate');
    } catch {
      setPkgJson(null);
      setPkgFileName('');
      setError('Could not parse JSON. Use a DWES engineering package (see docs/ENGINEERING-PACKAGE-SPEC.md).');
    }
  };

  const runValidate = async () => {
    if (!pkgJson || busy) return;
    setBusy('validate');
    setError('');
    setNotice('');
    try {
      const result = await engineeringApi.validatePackage(projectCode, frameId, pkgJson) as ValidationResult;
      setValidation(result);
      if (result.valid) {
        setNotice(\`Validation passed — \${result.deviceCount ?? 0} devices, \${result.terminalCount ?? 0} terminals. Import creates a DRAFT only.\`);
        setStep('validate');
      } else {
        setError('Package validation failed — nothing was written.');
      }
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { message?: string } }; message?: string })?.response?.data?.message
        || (e as { message?: string })?.message
        || 'Validate failed.';
      setError(msg);
    } finally {
      setBusy(null);
    }
  };

  const runImport = async () => {
    if (!pkgJson || busy) return;
    if (validation && !validation.valid) {
      setError('Fix validation errors before import.');
      return;
    }
    setBusy('import');
    setError('');
    setNotice('');
    try {
      const result = await engineeringApi.importPackage(projectCode, frameId, pkgJson) as {
        model_id: number;
        model_revision: string;
        schedule_match?: { matchedEnds: number; totalEnds: number };
      };
      setNotice(\`Imported DRAFT model #\${result.model_id} (rev \${result.model_revision}). Technicians cannot see drafts until publish.\`);
      const summary = await engineeringApi.reviewModel(result.model_id) as ReviewSummary;
      setReview(summary);
      setStep('publish');
      await refresh();
      onChanged?.();
    } catch (e: unknown) {
      const data = (e as { response?: { data?: { message?: string; issues?: unknown } } })?.response?.data;
      setError(data?.message || (e as { message?: string })?.message || 'Import failed.');
    } finally {
      setBusy(null);
    }
  };

  const runApproveEng = async () => {
    if (!draftId || busy) return;
    setBusy('approve-eng');
    setError('');
    setNotice('');
    try {
      await engineeringApi.approveModel(draftId);
      setNotice('Engineering model approved and published. Technician Cable Digital Twin can show Flat 3D when device/terminal geometry exists.');
      setStep('publish');
      await refresh();
      onChanged?.();
      emitDocumentsChanged({ projectCode, frameId, kind: 'drawing', action: 'replaced' });
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { message?: string } }; message?: string })?.response?.data?.message
        || (e as { message?: string })?.message
        || 'Approve/publish failed.';
      setError(msg);
    } finally {
      setBusy(null);
    }
  };

  const runConvert = async () => {
    if (!model || busy) return;
    setBusy('convert');
    setError('');
    setNotice('');
    try {
      await projectsApi.panelModelConvert(projectCode, frameId, model.package_revision);
      setNotice('Secondary generated convert finished (or queued result returned). This path does not replace Engineering Package publish.');
      await refresh();
      onChanged?.();
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { message?: string } }; message?: string })?.response?.data?.message
        || (e as { message?: string })?.message
        || 'Conversion failed.';
      setError(msg);
    } finally {
      setBusy(null);
    }
  };

  const runApproveGen = async () => {
    if (!model?.current || busy || !ackAssumptions) return;
    setBusy('approve-gen');
    setError('');
    setNotice('');
    try {
      await projectsApi.panelModelApprove(
        projectCode,
        frameId,
        model.current.id,
        model.package_revision,
        true,
        verifyNotes.trim() || undefined,
      );
      setNotice('Generated Panel Model approved (secondary). Flat/Engineering twin modes still require a published Engineering Package.');
      await refresh();
      onChanged?.();
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { message?: string } }; message?: string })?.response?.data?.message
        || (e as { message?: string })?.message
        || 'Generated approve failed.';
      setError(msg);
    } finally {
      setBusy(null);
    }
  };

  const honestyNote = engList?.published
    ? 'Primary source published. Technician Cable Digital Twin uses twin-context Flat 3D when terminals are mapped.'
    : 'Primary path: Engineering Package JSON → Validate → Import (draft) → Approve & Publish. Generated 2D→GLB and GA are secondary.';

  return (
    <>
      <Modal
        title="Panel 3D Model"
        subtitle={\`\${projectName || projectCode} · \${panelName}\`}
        icon={<Boxes />}
        onClose={onClose}
        size="fullscreen"
        bodyClassName="modal-body-flush"
        footer={(
          <div className="flex flex-wrap items-center justify-between gap-2 w-full">
            <p className="text-[12px] text-muted m-0 max-w-[56ch]">{honestyNote}</p>
            <div className="flex flex-wrap gap-2">
              <button type="button" className="btn-secondary" onClick={() => void refresh()} disabled={loading || busy !== null}>
                Refresh status
              </button>
              <button type="button" className="btn-secondary" onClick={onClose}>Close</button>
            </div>
          </div>
        )}
      >
        <div className="panel-3d-workspace flex min-h-0 flex-col gap-0">
          <div className="panel-3d-workspace__status px-4 py-3 border-b flex flex-wrap items-center gap-3" style={{ borderColor: 'var(--t-border)' }}>
            <span className={\`panel-3d-status-badge panel-3d-status-badge--\${tone}\`} role="status">{statusLabel}</span>
            <span className="text-[12px] font-semibold text-primary">{PANEL_3D_SOURCE_LABEL[primarySource]}</span>
            {twinSummary && <span className="text-[12px] text-muted min-w-0 flex-1">{twinSummary}</span>}
            {!PANEL_3D_ENABLED && (
              <span className="text-[12px] text-amber-700">Set VITE_ENABLE_PANEL_3D=true for Flat/Engineering tabs.</span>
            )}
          </div>
          <p className="px-4 py-2 text-[12px] text-muted border-b m-0" style={{ borderColor: 'var(--t-border)' }}>{priorityText}</p>

          <div className="dwv-tab-bar panel-3d-workspace__steps" role="tablist" aria-label="3D model steps">
            {STEPS.map(s => (
              <button
                key={s.id}
                type="button"
                role="tab"
                aria-selected={step === s.id}
                className={\`dwv-tab\${step === s.id ? ' dwv-tab--active' : ''}\`}
                onClick={() => setStep(s.id)}
              >
                <span className="font-semibold">{s.label}</span>
                <span className="text-[10px] opacity-80 ml-1 hidden sm:inline">{s.hint}</span>
              </button>
            ))}
          </div>

          <div className="panel-3d-workspace__body flex-1 min-h-0 overflow-auto p-4 flex flex-col gap-4">
            {loading && !model && !engList ? (
              <DwesLoadingCenter label="Loading panel model status…" />
            ) : (
              <>
                {error && <ActionStatusPanel status="failed" message={error} />}
                {notice && <ActionStatusPanel status="completed" message={notice} />}

                {step === 'upload' && (
                  <section className="panel-3d-card" aria-label="Primary engineering package upload">
                    <h3 className="text-[15px] font-semibold text-primary m-0">Primary — Engineering Package (JSON)</h3>
                    <p className="text-[13px] text-muted m-0">
                      Upload the Chennai structured package (devices, terminals, panel dims, optional ducts).
                      This is the only path that publishes Flat 3D for technicians via approveAndPublish.
                      PDF-only remains Approved 2D until this package exists.
                    </p>
                    <input
                      ref={fileRef}
                      type="file"
                      accept="application/json,.json"
                      className="sr-only"
                      onChange={e => {
                        const f = e.target.files?.[0];
                        if (f) void onPickPackage(f);
                        e.target.value = '';
                      }}
                    />
                    <div className="flex flex-wrap gap-2 mt-2">
                      <button type="button" className="btn-primary" onClick={() => fileRef.current?.click()}>
                        <Upload size={16} /> Load engineering package JSON
                      </button>
                      <button type="button" className="btn-secondary" onClick={() => setShowViewer(true)}>
                        <Eye size={16} /> Open viewer
                      </button>
                      <button type="button" className="btn-secondary" onClick={() => setUploadSlot('2d')}>
                        <FileText size={16} /> Replace Approved 2D
                      </button>
                      <button type="button" className="btn-secondary" onClick={() => setShowPackageExcel(true)}>
                        <FileSpreadsheet size={16} /> Excel + drawing helper
                      </button>
                    </div>
                    <ul className="text-[12px] text-muted m-0 pl-4 list-disc">
                      <li>Package file: {pkgFileName || 'none loaded'}</li>
                      <li>Engineering published: {engList?.published ? \`yes (#\${engList.published.model_id})\` : 'no'}</li>
                      <li>Engineering draft: {engList?.draft ? \`yes (#\${engList.draft.model_id})\` : 'no'}</li>
                      <li>2D drawing: {snapshot.hasDrawing2d ? 'yes' : 'no'}</li>
                    </ul>
                  </section>
                )}

                {step === 'convert' && (
                  <section className="panel-3d-card" aria-label="Secondary conversion paths">
                    <h3 className="text-[15px] font-semibold text-primary m-0">Secondary — Generated Panel Model / GLB preview</h3>
                    <p className="text-[13px] text-muted m-0">
                      Server-side 2D→GLB is optional. Insufficient GA/dimensions will fail honestly (as on this panel).
                      Approving a generated model does not publish Flat/Engineering twin modes — use the Engineering Package path.
                    </p>
                    <div className="flex flex-wrap gap-2 mt-2">
                      <button type="button" className="btn-secondary" disabled={!canConvert || busy !== null} onClick={() => void runConvert()}>
                        {busy === 'convert' ? 'Converting…' : 'Start generated convert'}
                      </button>
                      <button type="button" className="btn-secondary" onClick={() => setUploadSlot('3d')}>
                        <Boxes size={16} /> Upload native 3D (GLB/STEP/IFC)
                      </button>
                      <button type="button" className="btn-secondary" onClick={() => setShowViewer(true)}>
                        <Eye size={16} /> Preview in viewer
                      </button>
                    </div>
                    {current?.status_message && <p className="text-[12px] text-muted m-0">{current.status_message}</p>}
                    {canApproveGen && (
                      <div className="flex flex-col gap-2 mt-2 border-t pt-3" style={{ borderColor: 'var(--t-border)' }}>
                        <label className="flex items-start gap-2 text-[13px]">
                          <input type="checkbox" checked={ackAssumptions} onChange={e => setAckAssumptions(e.target.checked)} className="mt-1" />
                          <span>Acknowledge placeholders are not Approved Exact Route data (generated path).</span>
                        </label>
                        <button type="button" className="btn-secondary self-start" disabled={!ackAssumptions || busy !== null} onClick={() => void runApproveGen()}>
                          {busy === 'approve-gen' ? 'Approving…' : 'Approve generated model (secondary)'}
                        </button>
                      </div>
                    )}
                  </section>
                )}

                {step === 'map' && (
                  <section className="panel-3d-card" aria-label="Secondary GA mapping">
                    <h3 className="text-[15px] font-semibold text-primary m-0">Secondary — GA Foundation mapping</h3>
                    <p className="text-[13px] text-muted m-0">
                      Use GA face mapping when correlating drawings to schedule tags. Prefer Engineering Package device/terminal
                      coordinates for Flat 3D publish. GA release remains a secondary operational path.
                    </p>
                    <div className="flex flex-wrap gap-2 mt-2">
                      <button type="button" className="btn-secondary" onClick={() => setShowGaMap(v => !v)}>
                        {showGaMap ? 'Hide GA workspace' : 'Open GA mapping workspace'}
                      </button>
                    </div>
                    {showGaMap && (
                      <div className="mt-3 border rounded-xl overflow-hidden min-h-[420px]" style={{ borderColor: 'var(--t-border)' }}>
                        <GaFoundationWorkspace projectCode={projectCode} frameId={frameId} embedded />
                      </div>
                    )}
                  </section>
                )}

                {step === 'validate' && (
                  <section className="panel-3d-card" aria-label="Validate engineering package">
                    <h3 className="text-[15px] font-semibold text-primary m-0">Validate Engineering Package</h3>
                    <p className="text-[13px] text-muted m-0">
                      Dry-run against docs/ENGINEERING-PACKAGE-SPEC.md. Failed validation writes nothing.
                    </p>
                    <div className="flex flex-wrap gap-2 mt-2">
                      <button type="button" className="btn-primary" disabled={!pkgJson || busy !== null} onClick={() => void runValidate()}>
                        {busy === 'validate' ? 'Validating…' : 'Validate package'}
                      </button>
                      <button type="button" className="btn-primary" disabled={!pkgJson || busy !== null || (validation != null && !validation.valid)} onClick={() => void runImport()}>
                        {busy === 'import' ? 'Importing…' : 'Import as DRAFT'}
                      </button>
                      <button type="button" className="btn-secondary" onClick={() => fileRef.current?.click()}>
                        Reload JSON
                      </button>
                    </div>
                    {validation && (
                      <dl className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[13px] m-0">
                        <div><dt className="text-muted">Valid</dt><dd className="m-0 font-semibold">{validation.valid ? 'Yes' : 'No'}</dd></div>
                        <div><dt className="text-muted">Devices / terminals</dt><dd className="m-0 font-semibold">{validation.deviceCount ?? 0} / {validation.terminalCount ?? 0}</dd></div>
                        {validation.scheduleMatch && (
                          <div className="sm:col-span-2">
                            <dt className="text-muted">Schedule match</dt>
                            <dd className="m-0 font-semibold">{validation.scheduleMatch.matchedEnds}/{validation.scheduleMatch.totalEnds} ends</dd>
                          </div>
                        )}
                      </dl>
                    )}
                    {!!validation?.issues?.length && (
                      <ul className="text-[12px] m-0 pl-4 list-disc text-muted">
                        {validation.issues.slice(0, 12).map((issue, i) => (
                          <li key={\`\${issue.code}-\${i}\`}><strong>{issue.level}</strong> {issue.code}: {issue.message}</li>
                        ))}
                      </ul>
                    )}
                  </section>
                )}

                {step === 'publish' && (
                  <section className="panel-3d-card" aria-label="Approve and publish engineering">
                    <h3 className="text-[15px] font-semibold text-primary m-0">Approve &amp; Publish (primary)</h3>
                    <p className="text-[13px] text-muted m-0">
                      Calls engineering approveAndPublish. Requires devices and terminals. Prior published revisions become superseded.
                    </p>
                    {review ? (
                      <dl className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[13px] m-0">
                        <div><dt className="text-muted">Model</dt><dd className="m-0 font-semibold">#{review.model_id} · {review.model_revision}</dd></div>
                        <div><dt className="text-muted">Status</dt><dd className="m-0 font-semibold">{review.published ? 'Published' : review.approval_status}</dd></div>
                        <div><dt className="text-muted">Devices / terminals</dt><dd className="m-0 font-semibold">{review.devices} / {review.terminals}</dd></div>
                        <div><dt className="text-muted">Schedule ends matched</dt><dd className="m-0 font-semibold">{review.matched_ends}/{review.schedule_ends}</dd></div>
                      </dl>
                    ) : (
                      <p className="text-[13px] text-muted m-0">No draft loaded. Validate and import a package first.</p>
                    )}
                    {!!review?.unmatched_refs?.length && (
                      <ActionStatusPanel
                        status="confirm"
                        message={\`Unmatched schedule ends (sample): \${review.unmatched_refs.slice(0, 8).join(', ')}\`}
                      />
                    )}
                    <div className="flex flex-wrap gap-2 mt-2">
                      <button type="button" className="btn-primary" disabled={!canApproveEng || busy !== null} onClick={() => void runApproveEng()}>
                        <CheckCircle size={16} /> {busy === 'approve-eng' ? 'Publishing…' : 'Approve & publish engineering'}
                      </button>
                      <button type="button" className="btn-secondary" onClick={() => setShowViewer(true)}>
                        <Eye size={16} /> Open Cable / Drawing viewer
                      </button>
                    </div>
                  </section>
                )}
              </>
            )}
          </div>
        </div>
      </Modal>

      {uploadSlot && (
        <PanelDrawingUploadModal
          projectCode={projectCode}
          projectName={projectName}
          frameId={frameId}
          panelName={panelName}
          slot={uploadSlot}
          onClose={() => setUploadSlot(null)}
          onUploaded={() => {
            setUploadSlot(null);
            setNotice('Source file stored.');
            void refresh();
            onChanged?.();
          }}
        />
      )}

      {showPackageExcel && (
        <EngineeringPackageUploadModal
          projectCode={projectCode}
          projectName={projectName}
          frameId={frameId}
          panelName={panelName}
          hasExistingDrawing={snapshot.hasDrawing2d}
          onClose={() => setShowPackageExcel(false)}
          onPackageReady={() => {
            setShowPackageExcel(false);
            setNotice('Excel/drawing helper finished. Continue with Engineering Package JSON for Flat 3D publish.');
            void refresh();
            onChanged?.();
          }}
        />
      )}

      {showViewer && (
        <PanelGaDrawingModal
          projectCode={projectCode}
          frameId={frameId}
          panelName={panelName}
          projectName={projectName || projectCode}
          onClose={() => setShowViewer(false)}
        />
      )}
    </>
  );
}
`;

fs.writeFileSync(p, content, 'utf8');
console.log('wrote', p, fs.statSync(p).size);
