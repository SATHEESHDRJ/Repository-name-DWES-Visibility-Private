import { useCallback, useEffect, useRef, useState } from 'react';
import Modal from '../Modal';
import { useAppDialog } from '../AppDialogProvider';
import { projectsApi, uploadApi } from '../../services/api';
import { emitDocumentsChanged } from '../../utils/projectDocumentsEvents';
import { FileText, Upload, X, CheckCircle, TriangleAlert } from '../ui/icons';
import UploadTargetHeader from '../supervisor/UploadTargetHeader';
import DuplicatePanelWarning from '../supervisor/DuplicatePanelWarning';
import PanelFileMetadataBar from '../supervisor/PanelFileMetadataBar';
import FileViewer from '../ui/FileViewer';
import type { FramePanel } from '../assignment/ProjectPanelSelect';
import { assertNoDuplicatePanels } from '../../utils/panelDuplicates';
import {
  type PanelFileMetadata,
  type PanelFilePopupMode,
  inferViewerFileType,
} from './panelFilePopup';

const MAX_SIZE_MB = 50;

type DrawingFileType = 'pdf' | 'dwg';

interface ProjectDrawing {
  id: string;
  original_name: string;
  content_type?: string;
  uploaded_at?: string;
  size?: number;
}

const DRAWING_FILE_CONFIG: Record<DrawingFileType, {
  label: string;
  accept: string;
  hint: string;
  test: RegExp;
}> = {
  pdf: {
    label: 'PDF',
    accept: '.pdf,application/pdf',
    hint: '.pdf only',
    test: /\.pdf$/i,
  },
  dwg: {
    label: 'DWG',
    accept: '.dwg,application/acad,application/x-acad',
    hint: '.dwg only',
    test: /\.dwg$/i,
  },
};

function formatSize(bytes: number) {
  if (bytes > 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024).toFixed(0)} KB`;
}

function findDrawingByType(drawings: ProjectDrawing[], fileType: DrawingFileType): ProjectDrawing | null {
  const matches = drawings.filter(d => DRAWING_FILE_CONFIG[fileType].test.test(d.original_name));
  if (!matches.length) return null;
  return matches.sort((a, b) => {
    const ta = a.uploaded_at ? new Date(a.uploaded_at).getTime() : 0;
    const tb = b.uploaded_at ? new Date(b.uploaded_at).getTime() : 0;
    return tb - ta;
  })[0];
}

function drawingToMetadata(drawing: ProjectDrawing, fileType: DrawingFileType): PanelFileMetadata {
  return {
    fileName: drawing.original_name,
    fileType: DRAWING_FILE_CONFIG[fileType].label,
    uploadedAt: drawing.uploaded_at,
    sizeBytes: drawing.size,
  };
}

/**
 * Panel drawing upload / view dialog — single resolved state on open.
 * Populated → auto View + metadata + Replace; empty → upload only.
 */
export default function PdfDrawingUploadModal({
  projectCode,
  projectName,
  panelName,
  panelId,
  siblingPanels = [],
  onEditPanel,
  onSelectPanel,
  fileType = 'pdf',
  onClose,
  onUploaded,
}: {
  projectCode: string;
  projectName?: string;
  panelName?: string;
  panelId?: string;
  siblingPanels?: FramePanel[];
  onEditPanel?: (panelId: string) => void;
  onSelectPanel?: (panelId: string) => void;
  fileType?: DrawingFileType;
  onClose: () => void;
  onUploaded?: () => void;
}) {
  const dialog = useAppDialog();
  const cfg = DRAWING_FILE_CONFIG[fileType];
  const fileRef = useRef<HTMLInputElement>(null);

  const [mode, setMode] = useState<PanelFilePopupMode>('loading');
  const [existingDrawing, setExistingDrawing] = useState<ProjectDrawing | null>(null);
  const [metadata, setMetadata] = useState<PanelFileMetadata | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState('');
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [done, setDone] = useState(false);
  const [viewBlob, setViewBlob] = useState<Blob | null>(null);
  const [viewLoading, setViewLoading] = useState(false);
  const [viewError, setViewError] = useState('');

  const duplicateGuard = assertNoDuplicatePanels(
    siblingPanels,
    panelId,
    panelName,
  );
  const duplicateBlocked = duplicateGuard.blocked;
  const duplicateBlockMessage = duplicateGuard.message;

  const resolveExisting = useCallback(async () => {
    setMode('loading');
    setError('');
    try {
      const drawings: ProjectDrawing[] = await projectsApi.drawings(projectCode);
      const match = findDrawingByType(drawings, fileType);
      setExistingDrawing(match);
      if (match) {
        setMetadata(drawingToMetadata(match, fileType));
        setMode('populated');
      } else {
        setMetadata(null);
        setMode('empty');
      }
    } catch {
      setExistingDrawing(null);
      setMetadata(null);
      setMode('empty');
    }
  }, [projectCode, fileType]);

  useEffect(() => {
    void resolveExisting();
  }, [resolveExisting]);

  const loadViewBlob = useCallback(async () => {
    if (!existingDrawing) return;
    setViewLoading(true);
    setViewError('');
    setViewBlob(null);
    try {
      const raw = await projectsApi.drawingFile(projectCode, existingDrawing.id);
      setViewBlob(raw);
    } catch {
      setViewError('Failed to load drawing file.');
    } finally {
      setViewLoading(false);
    }
  }, [projectCode, existingDrawing]);

  useEffect(() => {
    if (mode !== 'populated' || !existingDrawing || duplicateBlocked) return;
    void loadViewBlob();
  }, [mode, existingDrawing, loadViewBlob, duplicateBlocked]);

  const confirmReplaceDrawing = async (): Promise<boolean> => {
    const name = existingDrawing?.original_name || `${cfg.label} drawing`;
    const panelLabel = panelName || projectName || projectCode;
    return dialog.confirm({
      title: `Replace ${cfg.label} drawing?`,
      message:
        `This will replace the current drawing for panel ${panelLabel}. The current file ("${name}") will be archived to uploads/backups/ before overwrite.`,
      tone: 'warning',
      confirmText: 'Replace Upload',
    });
  };

  const pickFile = (f: File) => {
    setError('');
    setDone(false);
    if (!cfg.test.test(f.name)) {
      setError(`Only ${cfg.label} files (${cfg.hint}) are allowed.`);
      return;
    }
    if (f.size > MAX_SIZE_MB * 1024 * 1024) {
      setError(`File is too large — max ${MAX_SIZE_MB} MB.`);
      return;
    }
    setFile(f);
  };

  const handleUpload = async () => {
    if (!file || uploading || duplicateBlocked) return;
    if (existingDrawing && !(await confirmReplaceDrawing())) return;

    setUploading(true);
    setError('');
    setProgress(0);
    try {
      const fd = new FormData();
      fd.append('file', file);
      if (existingDrawing?.id) {
        fd.append('replace_drawing_id', existingDrawing.id);
      }
      if (panelId) {
        fd.append('frame_id', panelId);
      }
      const result = await uploadApi.drawing(projectCode, fd, setProgress);
      setDone(true);
      setExistingDrawing(result);
      setMetadata(drawingToMetadata(result, fileType));
      setMode('populated');
      setFile(null);
      onUploaded?.();
      emitDocumentsChanged({
        projectCode,
        frameId: panelId,
        kind: 'drawing',
        action: existingDrawing?.id ? 'replaced' : 'uploaded',
      });
      await resolveExisting();
    } catch (e: any) {
      setError(e?.response?.data?.message || 'Upload failed. Please try again.');
    } finally {
      setUploading(false);
    }
  };

  const startReplace = async () => {
    if (duplicateBlocked) return;
    if (!(await confirmReplaceDrawing())) return;
    setMode('replacing');
    setFile(null);
    setError('');
    setDone(false);
  };

  const downloadExisting = async () => {
    if (!existingDrawing) return;
    try {
      const blob = await projectsApi.drawingFile(projectCode, existingDrawing.id);
      const href = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = href;
      anchor.download = existingDrawing.original_name;
      anchor.click();
      URL.revokeObjectURL(href);
    } catch {
      setViewError('Failed to download drawing.');
    }
  };

  const viewerType = inferViewerFileType(
    existingDrawing?.original_name || '',
    existingDrawing?.content_type,
  );

  const showViewer = mode === 'populated';
  const showUpload = mode === 'empty' || mode === 'replacing';
  const modalTitle = showViewer
    ? `View ${cfg.label} Drawing`
    : mode === 'replacing'
      ? `Replace ${cfg.label} Drawing`
      : `Upload ${cfg.label} Drawing`;

  const uploadControls = (
    <div className="panel-file-upload-section flex flex-col gap-4">
      {mode === 'replacing' && (
        <p className="text-[13px] text-slate-600">
          Select a new {cfg.label} file to replace the current drawing.
        </p>
      )}
      {duplicateBlocked && (
        <DuplicatePanelWarning
          panels={siblingPanels}
          selectedPanelId={panelId}
          onEditPanel={onEditPanel}
          onSelectPanel={onSelectPanel}
        />
      )}
      <button
        type="button"
        disabled={uploading || duplicateBlocked}
        title={duplicateBlocked ? duplicateBlockMessage : undefined}
        onClick={() => fileRef.current?.click()}
        onDragOver={e => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={e => {
          e.preventDefault();
          setDragOver(false);
          const f = e.dataTransfer.files[0];
          if (f) pickFile(f);
        }}
        className={`group flex flex-col items-center justify-center gap-2 w-full min-h-[120px] rounded-[12px] border-2 border-dashed transition-all ${
          dragOver
            ? 'border-blue-300 bg-blue-50'
            : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50/80'
        } disabled:opacity-50`}
      >
        <div className="flex items-center justify-center w-11 h-11 rounded-full bg-blue-100 text-blue-600 group-hover:scale-105 transition-transform">
          <FileText size={20} strokeWidth={1.5} />
        </div>
        <span className="text-[13.5px] font-semibold text-slate-700">
          Drop a {cfg.label} here or click to browse
        </span>
        <span className="text-[11.5px] text-slate-500">{cfg.hint} · max {MAX_SIZE_MB} MB</span>
        <input
          ref={fileRef}
          type="file"
          accept={cfg.accept}
          className="sr-only"
          aria-label={`Select ${cfg.label} drawing`}
          onChange={e => { const f = e.target.files?.[0]; if (f) pickFile(f); e.target.value = ''; }}
        />
      </button>

      {file && (
        <div className="flex items-center gap-3 px-3.5 py-3 rounded-[10px] border border-slate-200 bg-slate-50/70">
          <FileText size={20} className="text-red-500 shrink-0" strokeWidth={1.5} />
          <div className="min-w-0 flex-1">
            <div className="text-[13px] font-semibold text-slate-800 modal-filename" title={file.name}>{file.name}</div>
            <div className="text-[11px] text-slate-500">{formatSize(file.size)}</div>
          </div>
          {done ? (
            <span className="flex items-center gap-1.5 text-[12px] font-semibold text-green-700 shrink-0">
              <CheckCircle size={16} strokeWidth={1.5} /> Uploaded
            </span>
          ) : !uploading && (
            <button
              type="button"
              title="Remove file"
              onClick={() => { setFile(null); setError(''); }}
              className="flex items-center justify-center w-9 h-9 rounded-[8px] text-slate-500 hover:text-red-600 hover:bg-red-50 transition-colors shrink-0"
            >
              <X size={16} strokeWidth={1.5} />
            </button>
          )}
        </div>
      )}

      {uploading && (
        <div className="flex flex-col gap-1.5">
          <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
            <div className="h-full rounded-full bg-blue-500 transition-[width] duration-200" style={{ width: `${progress}%` }} />
          </div>
          <span className="text-[11.5px] text-slate-500 tabular-nums">{progress}% uploaded</span>
        </div>
      )}

      {error && (
        <div className="flex items-start gap-2 px-3 py-2.5 rounded-[10px] bg-red-50 border border-red-200 text-[12.5px] text-red-700" role="alert">
          <TriangleAlert size={16} className="shrink-0 mt-0.5" strokeWidth={1.5} />
          {error}
        </div>
      )}

      {done && (
        <div className="flex items-center gap-2 px-3 py-2.5 rounded-[10px] bg-green-50 border border-green-200 text-[13px] text-green-800">
          <CheckCircle size={16} className="shrink-0" strokeWidth={1.5} />
          {cfg.label} drawing uploaded successfully.
        </div>
      )}
    </div>
  );

  return (
    <Modal
      title={modalTitle}
      onClose={onClose}
      size={showViewer && fileType === 'pdf' ? 'fullscreen' : undefined}
      bodyClassName={showViewer && fileType === 'pdf' ? 'modal-body-flush' : undefined}
      footer={(
        <div className="flex items-center justify-end gap-3 w-full">
          {mode === 'loading' ? (
            <button type="button" onClick={onClose} className="btn-secondary">Cancel</button>
          ) : showUpload ? (
            <>
              {mode === 'replacing' && (
                <button type="button" className="btn-secondary" onClick={() => setMode('populated')}>Cancel replace</button>
              )}
              <button type="button" onClick={onClose} className="btn-secondary">Close</button>
              {file && !done && (
                <button
                  type="button"
                  onClick={handleUpload}
                  disabled={uploading || duplicateBlocked}
                  title={duplicateBlocked ? duplicateBlockMessage : undefined}
                  className="btn-primary"
                >
                  <Upload size={16} strokeWidth={1.5} />
                  {uploading ? `Uploading… ${progress}%` : existingDrawing ? 'Replace Upload' : 'Upload'}
                </button>
              )}
            </>
          ) : (
            <>
              <button
                type="button"
                className="btn-secondary"
                onClick={() => void startReplace()}
                disabled={duplicateBlocked}
                title={duplicateBlocked ? duplicateBlockMessage : undefined}
              >
                <Upload size={16} strokeWidth={1.5} />
                <span>Replace Upload</span>
              </button>
              <button type="button" className="btn-secondary" onClick={onClose}>Close</button>
            </>
          )}
        </div>
      )}
    >
      {mode === 'loading' ? (
        <div className="flex items-center justify-center py-12 text-slate-500 text-[13px]">
          Checking for existing drawing…
        </div>
      ) : !panelId && !panelName ? (
        <div className="flex flex-col items-center justify-center py-12 gap-2 text-slate-500 text-[13px]">
          <TriangleAlert size={24} className="text-amber-500" />
          <p>Select a panel before uploading a drawing.</p>
        </div>
      ) : (
        <div className="panel-file-popup flex flex-col gap-4">
          {panelName && projectName && (
            <UploadTargetHeader
              projectName={projectName}
              projectCode={projectCode}
              panelName={panelName}
              panelId={panelId}
              kind="drawing"
            />
          )}

          {duplicateBlocked && (
            <DuplicatePanelWarning
              panels={siblingPanels}
              selectedPanelId={panelId}
              onEditPanel={onEditPanel}
              onSelectPanel={onSelectPanel}
            />
          )}

          {showViewer && metadata && (
            <>
              <PanelFileMetadataBar metadata={metadata} />
              <FileViewer
                blob={viewBlob}
                fileType={viewerType}
                panelLabel={
                  panelName && panelId
                    ? `${panelName} · ID: ${panelId}`
                    : panelName || projectName || projectCode
                }
                fileName={existingDrawing?.original_name}
                loading={viewLoading}
                error={viewError}
                onRetry={loadViewBlob}
                onDownload={downloadExisting}
                className="file-viewer--modal"
              />
            </>
          )}

          {showUpload && uploadControls}
        </div>
      )}
    </Modal>
  );
}
