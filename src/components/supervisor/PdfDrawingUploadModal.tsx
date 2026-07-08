import { useRef, useState } from 'react';
import Modal from '../Modal';
import { uploadApi } from '../../services/api';
import { FileText, Upload, X, CheckCircle, TriangleAlert } from '../ui/icons';

const MAX_SIZE_MB = 50;

type DrawingFileType = 'pdf' | 'dwg';

const DRAWING_FILE_CONFIG: Record<DrawingFileType, {
  label: string;
  title: string;
  accept: string;
  hint: string;
  test: RegExp;
}> = {
  pdf: {
    label: 'PDF',
    title: 'Upload PDF Drawing',
    accept: '.pdf,application/pdf',
    hint: '.pdf only',
    test: /\.pdf$/i,
  },
  dwg: {
    label: 'DWG',
    title: 'Upload DWG Drawing',
    accept: '.dwg,application/acad,application/x-acad',
    hint: '.dwg only',
    test: /\.dwg$/i,
  },
};

function formatSize(bytes: number) {
  if (bytes > 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024).toFixed(0)} KB`;
}

/**
 * Project-specific drawing upload dialog (PDF or DWG).
 * Drag-and-drop / browse, file-type validation, upload progress bar,
 * and explicit Upload / Save & Close / Cancel actions.
 */
export default function PdfDrawingUploadModal({
  projectCode,
  projectName,
  fileType = 'pdf',
  onClose,
  onUploaded,
}: {
  projectCode: string;
  projectName?: string;
  fileType?: DrawingFileType;
  onClose: () => void;
  onUploaded?: () => void;
}) {
  const cfg = DRAWING_FILE_CONFIG[fileType];
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState('');
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [done, setDone] = useState(false);

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
    if (!file || uploading) return;
    setUploading(true);
    setError('');
    setProgress(0);
    try {
      const fd = new FormData();
      fd.append('file', file);
      await uploadApi.drawing(projectCode, fd, setProgress);
      setDone(true);
      onUploaded?.();
    } catch (e: any) {
      setError(e?.response?.data?.message || 'Upload failed. Please try again.');
    } finally {
      setUploading(false);
    }
  };

  return (
    <Modal
      title={cfg.title}
      onClose={onClose}
      footer={(
        <div className="flex items-center justify-end gap-3 w-full">
          <button type="button" onClick={onClose} className="btn-secondary">
            Cancel
          </button>
          {done ? (
            <button type="button" onClick={onClose} className="btn-primary">
              <CheckCircle size={16} strokeWidth={1.5} />
              Save &amp; Close
            </button>
          ) : (
            <button
              type="button"
              onClick={handleUpload}
              disabled={!file || uploading}
              className="btn-primary"
            >
              <Upload size={16} strokeWidth={1.5} />
              {uploading ? `Uploading… ${progress}%` : 'Upload'}
            </button>
          )}
        </div>
      )}
    >
      <div className="flex flex-col gap-4">
        <p className="text-[13px] text-slate-600 leading-relaxed">
          Add a {cfg.label} drawing to{' '}
          <span className="font-semibold text-slate-800">{projectName || projectCode}</span>
          {projectName && <span className="font-mono text-[12px] text-slate-400"> · {projectCode}</span>}
        </p>

        {/* Dropzone */}
        <button
          type="button"
          disabled={uploading}
          onClick={() => fileRef.current?.click()}
          onDragOver={e => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={e => {
            e.preventDefault();
            setDragOver(false);
            const f = e.dataTransfer.files[0];
            if (f) pickFile(f);
          }}
          className={`group flex flex-col items-center justify-center gap-2 w-full min-h-[140px] rounded-[12px] border-2 border-dashed transition-all ${
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

        {/* Selected file card */}
        {file && (
          <div className="flex items-center gap-3 px-3.5 py-3 rounded-[10px] border border-slate-200 bg-slate-50/70">
            <FileText size={20} className="text-red-500 shrink-0" strokeWidth={1.5} />
            <div className="min-w-0 flex-1">
              <div className="text-[13px] font-semibold text-slate-800 truncate" title={file.name}>
                {file.name}
              </div>
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
                className="flex items-center justify-center w-8 h-8 rounded-[8px] text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors shrink-0"
              >
                <X size={16} strokeWidth={1.5} />
              </button>
            )}
          </div>
        )}

        {/* Progress bar */}
        {uploading && (
          <div className="flex flex-col gap-1.5">
            <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
              <div
                className="h-full rounded-full bg-blue-500 transition-[width] duration-200"
                style={{ width: `${progress}%` }}
              />
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
            {cfg.label} drawing uploaded successfully. You can upload another or save &amp; close.
          </div>
        )}
      </div>
    </Modal>
  );
}
