import { useEffect, useRef, useState } from 'react';
import * as pdfjs from 'pdfjs-dist';
import pdfjsWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import Modal from '../Modal';
import { useAppDialog } from '../AppDialogProvider';
import ActionStatusPanel from '../ui/ActionStatusPanel';
import { FileSpreadsheet, FileText, FolderKanban, TriangleAlert, Upload } from '../ui/icons';
import { uploadApi } from '../../services/api';
import { emitDocumentsChanged } from '../../utils/projectDocumentsEvents';

pdfjs.GlobalWorkerOptions.workerSrc = pdfjsWorker;

function extension(name: string) {
  return name.split('.').pop()?.toLowerCase() ?? '';
}

function formatBytes(bytes: number) {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

const EXCEL_EXT = ['xlsx', 'xls'];
const DRAWING_EXT = ['pdf', 'dwg', 'dxf', 'png', 'jpg', 'jpeg', 'webp'];

interface ExcelPreview {
  sheetName: string;
  cableCount: number;
  headerRow: number;
  analyzing: boolean;
  error: string;
}

interface DrawingPreview {
  pageCount: number | null;
  analyzing: boolean;
  error: string;
}

export interface EngineeringPackageUploadModalProps {
  projectCode: string;
  projectName?: string;
  frameId: string;
  panelName: string;
  hasExistingDrawing?: boolean;
  onClose: () => void;
  onPackageReady: (excelFile: File) => void;
  /** When true, render panel content only (parent Engineering workspace supplies Modal chrome). */
  embedded?: boolean;
}

/**
 * Combined Engineering Package upload — Excel wiring schedule + Flat 2D GA layout
 * for the selected panel. Drawing uploads here; Excel mapping continues in
 * UploadFrameModal (preserved schedule workflow). Separate Wiring Upload and
 * Drawing buttons remain as fallbacks.
 *
 * Geometry for 3D Operational Twin is enrolled on the Convert tab (GA sources),
 * not fabricated from cover sheets or full wiring schematic packages.
 */
export default function EngineeringPackageUploadModal({
  projectCode,
  projectName,
  frameId,
  panelName,
  hasExistingDrawing = false,
  onClose,
  onPackageReady,
  embedded = false,
}: EngineeringPackageUploadModalProps) {
  const dialog = useAppDialog();
  const excelRef = useRef<HTMLInputElement>(null);
  const drawingRef = useRef<HTMLInputElement>(null);
  const [excelFile, setExcelFile] = useState<File | null>(null);
  const [drawingFile, setDrawingFile] = useState<File | null>(null);
  const [excelPreview, setExcelPreview] = useState<ExcelPreview | null>(null);
  const [drawingPreview, setDrawingPreview] = useState<DrawingPreview | null>(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!excelFile) {
      setExcelPreview(null);
      return;
    }
    let cancelled = false;
    setExcelPreview({
      sheetName: '',
      cableCount: 0,
      headerRow: 0,
      analyzing: true,
      error: '',
    });
    const formData = new FormData();
    formData.append('file', excelFile);
    uploadApi.readHeaders(projectCode, formData)
      .then((result: any) => {
        if (cancelled) return;
        const bestName = result.best_sheet || result.sheets?.[0]?.name || '';
        const best = (result.sheets || []).find((s: any) => s.name === bestName) || result.sheets?.[0];
        const rows = best?.sample_rows || best?.rows || [];
        const cableCount = Number(best?.data_row_count ?? best?.dataRowCount ?? rows.length) || 0;
        const headerRow = Number(best?.header_row ?? best?.headerRow ?? 0) || 0;
        setExcelPreview({
          sheetName: bestName,
          cableCount,
          headerRow,
          analyzing: false,
          error: cableCount > 0 ? '' : 'No cable data rows detected — check the worksheet.',
        });
      })
      .catch((e: any) => {
        if (cancelled) return;
        setExcelPreview({
          sheetName: '',
          cableCount: 0,
          headerRow: 0,
          analyzing: false,
          error: e?.response?.data?.message || 'Could not read Excel headers.',
        });
      });
    return () => { cancelled = true; };
  }, [excelFile, projectCode]);

  useEffect(() => {
    if (!drawingFile) {
      setDrawingPreview(null);
      return;
    }
    const ext = extension(drawingFile.name);
    if (ext !== 'pdf') {
      setDrawingPreview({ pageCount: null, analyzing: false, error: '' });
      return;
    }
    let cancelled = false;
    setDrawingPreview({ pageCount: null, analyzing: true, error: '' });
    drawingFile.arrayBuffer()
      .then(data => pdfjs.getDocument({ data }).promise)
      .then(doc => {
        if (cancelled) return;
        setDrawingPreview({ pageCount: doc.numPages, analyzing: false, error: '' });
        void doc.destroy();
      })
      .catch(() => {
        if (cancelled) return;
        setDrawingPreview({
          pageCount: null,
          analyzing: false,
          error: 'Could not inventory PDF pages — file can still upload.',
        });
      });
    return () => { cancelled = true; };
  }, [drawingFile]);

  const pickExcel = (file: File | null) => {
    setError('');
    if (!file) { setExcelFile(null); return; }
    if (!EXCEL_EXT.includes(extension(file.name))) {
      setExcelFile(null);
      setError('Wiring schedule must be an Excel file (.xlsx or .xls).');
      return;
    }
    if (file.size > 50 * 1024 * 1024) {
      setExcelFile(null);
      setError('Excel file is too large — max 50 MB.');
      return;
    }
    setExcelFile(file);
  };

  const pickDrawing = (file: File | null) => {
    setError('');
    if (!file) { setDrawingFile(null); return; }
    if (!DRAWING_EXT.includes(extension(file.name))) {
      setDrawingFile(null);
      setError(`Drawing must be one of: ${DRAWING_EXT.map(e => `.${e}`).join(', ')}.`);
      return;
    }
    if (file.size > 200 * 1024 * 1024) {
      setDrawingFile(null);
      setError('Drawing file is too large — max 200 MB.');
      return;
    }
    setDrawingFile(file);
  };

  const submit = async () => {
    if (!excelFile || !drawingFile || uploading) return;
    if (excelPreview?.analyzing) {
      setError('Wait for Excel analysis to finish before continuing.');
      return;
    }
    if (excelPreview && excelPreview.cableCount <= 0 && !excelPreview.error.includes('Could not read')) {
      const ok = await dialog.confirm({
        title: 'No cables detected',
        message: 'Excel analysis found 0 cable rows. Continue to mapping anyway?',
        tone: 'warning',
        confirmText: 'Continue',
      });
      if (!ok) return;
    }
    if (hasExistingDrawing) {
      const ok = await dialog.confirm({
        title: 'Replace approved drawing?',
        message: `This panel already has an approved drawing. Continue will replace it with ${drawingFile.name}, then open wiring-schedule mapping for ${excelFile.name}.`,
        tone: 'warning',
        confirmText: 'Replace & Continue',
      });
      if (!ok) return;
    }

    setUploading(true);
    setError('');
    setProgress(0);
    try {
      const formData = new FormData();
      formData.append('file', drawingFile);
      await uploadApi.panelDrawingSlot(projectCode, frameId, '2d', formData, setProgress);
      emitDocumentsChanged({
        projectCode,
        frameId,
        kind: 'drawing',
        action: hasExistingDrawing ? 'replaced' : 'uploaded',
      });
      onPackageReady(excelFile);
    } catch (e: any) {
      setError(e?.response?.data?.message || e?.message || 'Drawing upload failed. Separate Drawing and Wiring Upload buttons remain available.');
    } finally {
      setUploading(false);
    }
  };

  const canSubmit = Boolean(excelFile && drawingFile) && !uploading && !excelPreview?.analyzing;

  const body = (
    <div className="panel-drawing-upload flex flex-col gap-3">
      <ActionStatusPanel
        message={
          error
            ? error
            : uploading
              ? `Uploading Flat 2D GA layout ${drawingFile?.name || ''}…`
              : 'Select the Excel wiring schedule and Flat 2D GA layout for this panel. Drawing uploads first; schedule mapping opens next. Use Convert to 3D Operational Twin after GA faces are enrolled.'
        }
        status={error ? 'failed' : uploading ? 'uploading' : 'idle'}
        statusDetail={uploading ? `${progress}%` : undefined}
        progress={uploading ? progress : null}
        actionSummary="Wiring schedule = execution source. Flat 2D GA layout = geometry source for 3D Operational Twin enrollment."
        entity={[
          { label: 'Project', value: projectName || projectCode, meta: projectCode, kind: 'project' },
          { label: 'Panel', value: panelName, kind: 'panel' },
          ...(excelFile ? [{ label: 'Excel', value: excelFile.name, meta: formatBytes(excelFile.size), kind: 'file' as const }] : []),
          ...(drawingFile ? [{ label: 'GA layout', value: drawingFile.name, meta: formatBytes(drawingFile.size), kind: 'file' as const }] : []),
        ]}
      />

      {(excelPreview || drawingPreview) && (
        <div className="grid gap-2 sm:grid-cols-2">
          <div className="rounded-md border border-[var(--border)] bg-[var(--surface-raised,#0f172a0d)] px-3 py-2">
            <div className="text-[11px] uppercase tracking-wide text-[var(--text-muted)]">TOTAL CABLES</div>
            <div className="text-2xl font-semibold tabular-nums leading-tight">
              {excelPreview?.analyzing ? '…' : (excelPreview?.cableCount ?? '—')}
            </div>
            {excelPreview && !excelPreview.analyzing && excelPreview.sheetName && (
              <p className="mb-0 mt-1 text-xs text-[var(--text-secondary)]">
                Sheet {excelPreview.sheetName}
                {excelPreview.headerRow > 0 ? ` · header row ${excelPreview.headerRow + 1}` : ''}
              </p>
            )}
            {excelPreview?.error && (
              <p className="mb-0 mt-1 text-xs text-amber-600">{excelPreview.error}</p>
            )}
          </div>
          <div className="rounded-md border border-[var(--border)] bg-[var(--surface-raised,#0f172a0d)] px-3 py-2">
            <div className="text-[11px] uppercase tracking-wide text-[var(--text-muted)]">GA LAYOUT PAGES</div>
            <div className="text-2xl font-semibold tabular-nums leading-tight">
              {drawingPreview?.analyzing
                ? '…'
                : drawingPreview?.pageCount != null
                  ? drawingPreview.pageCount
                  : drawingFile
                    ? (extension(drawingFile.name) === 'pdf' ? '—' : 'N/A')
                    : '—'}
            </div>
            <p className="mb-0 mt-1 text-xs text-[var(--text-secondary)]">
              {drawingFile
                ? (extension(drawingFile.name) === 'pdf'
                  ? 'Prefer front / internal / rear GA sheets — not cover-only pages'
                  : 'Non-PDF drawing — enroll PDF GA faces on Convert tab if needed')
                : 'Choose Flat 2D GA layout to inventory pages'}
            </p>
            {drawingPreview?.error && (
              <p className="mb-0 mt-1 text-xs text-amber-600">{drawingPreview.error}</p>
            )}
          </div>
        </div>
      )}

      <p className="text-sm text-[var(--text-secondary)] m-0">
        Separate <strong>Wiring Upload</strong> and <strong>Drawing</strong> toolbar actions remain available as fallbacks.
        After package upload, open <strong>Convert to 3D Operational Twin</strong> to enroll GA faces, preview, and approve release.
      </p>

      {hasExistingDrawing && (
        <div className="flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm">
          <TriangleAlert size={16} className="mt-0.5 shrink-0" />
          <span>This panel already has an approved drawing. Continuing will replace it.</span>
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-md border border-[var(--border)] p-3">
          <div className="mb-2 flex items-center gap-2 text-sm font-medium">
            <FileSpreadsheet size={16} /> Wiring schedule (Excel)
          </div>
          <input
            ref={excelRef}
            type="file"
            accept=".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
            className="sr-only"
            onChange={e => pickExcel(e.target.files?.[0] ?? null)}
          />
          <button type="button" className="btn-secondary w-full" onClick={() => excelRef.current?.click()} disabled={uploading}>
            {excelFile ? 'Change Excel file' : 'Choose Excel file'}
          </button>
          {excelFile && (
            <p className="mt-2 mb-0 text-xs text-[var(--text-secondary)]">
              {excelFile.name} · {formatBytes(excelFile.size)}
            </p>
          )}
        </div>

        <div className="rounded-md border border-[var(--border)] p-3">
          <div className="mb-2 flex items-center gap-2 text-sm font-medium">
            <FileText size={16} /> Flat 2D GA layout
          </div>
          <p className="mb-2 mt-0 text-xs text-[var(--text-muted)]">
            Front / internal / rear GA sheets for panel geometry. Not cover sheets; not full wiring schematic packages.
          </p>
          <input
            ref={drawingRef}
            type="file"
            accept=".pdf,.dwg,.dxf,.png,.jpg,.jpeg,.webp,application/pdf,image/*"
            className="sr-only"
            onChange={e => pickDrawing(e.target.files?.[0] ?? null)}
          />
          <button type="button" className="btn-secondary w-full" onClick={() => drawingRef.current?.click()} disabled={uploading}>
            {drawingFile ? 'Change GA layout file' : 'Choose GA layout file'}
          </button>
          {drawingFile && (
            <p className="mt-2 mb-0 text-xs text-[var(--text-secondary)]">
              {drawingFile.name} · {formatBytes(drawingFile.size)}
            </p>
          )}
        </div>
      </div>

      <div className="panel-drawing-upload-footer flex flex-wrap justify-end gap-2 border-t border-[var(--border)] pt-3">
        {!embedded && (
          <button type="button" className="btn-secondary" onClick={onClose} disabled={uploading}>
            Cancel
          </button>
        )}
        <button type="button" className="btn-primary" onClick={() => void submit()} disabled={!canSubmit}>
          <Upload size={16} />
          {uploading ? `Uploading drawing ${progress}%` : 'Upload GA layout & map schedule'}
        </button>
      </div>
    </div>
  );

  if (embedded) return body;

  return (
    <Modal
      title="Upload Engineering Package"
      subtitle={`${projectName || projectCode} · ${panelName}`}
      icon={<FolderKanban />}
      onClose={onClose}
      size="lg"
      closeOnBackdrop={!uploading}
      closeOnEscape={!uploading}
      footer={null}
    >
      {body}
    </Modal>
  );
}
