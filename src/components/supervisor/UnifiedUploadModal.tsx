import { useCallback, useEffect, useRef, useState } from 'react';
import Modal from '../Modal';
import { useAppDialog } from '../AppDialogProvider';
import { projectsApi, uploadApi } from '../../services/api';
import {
  FileText, SendHorizonal, Upload, Trash2, ExternalLink, CheckCircle, FileSpreadsheet,
} from '../ui/icons';

type FileRecord = {
  id: string;
  original_name: string;
  uploaded_at: string;
  size: number;
};

function formatSize(bytes: number) {
  if (bytes > 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024).toFixed(0)} KB`;
}

async function hashFile(f: File) {
  const buf = await f.arrayBuffer();
  const hash = await crypto.subtle.digest('SHA-256', buf);
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
}

interface UploadSectionProps {
  title: string;
  subtitle: string;
  icon: React.ReactNode;
  accent: 'blue' | 'violet';
  files: FileRecord[];
  accept: string;
  hint: string;
  uploading: boolean;
  onUpload: (file: File) => Promise<void>;
  onView: (file: FileRecord) => void;
  onDelete: (file: FileRecord) => void;
  viewingId: string | null;
}

function UploadSection({
  title, subtitle, icon, accent, files, accept, hint, uploading,
  onUpload, onView, onDelete, viewingId,
}: UploadSectionProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState('');

  const accentBorder = accent === 'blue' ? 'border-blue-200' : 'border-violet-200';
  const accentBg = accent === 'blue' ? 'bg-blue-50' : 'bg-violet-50';
  const accentText = accent === 'blue' ? 'text-blue-700' : 'text-violet-700';
  const accentIconBg = accent === 'blue' ? 'bg-blue-100 text-blue-600' : 'bg-violet-100 text-violet-600';

  const pickFile = async (f: File) => {
    setError('');
    try {
      await onUpload(f);
    } catch (e: any) {
      setError(e?.response?.data?.message || e?.message || 'Upload failed');
    }
  };

  return (
    <section className={`rounded-[12px] border ${accentBorder} bg-white overflow-hidden`}>
      <div className={`flex items-start gap-3 px-4 py-3.5 ${accentBg} border-b ${accentBorder}`}>
        <div className={`flex items-center justify-center w-10 h-10 rounded-[10px] shrink-0 ${accentIconBg}`}>
          {icon}
        </div>
        <div className="min-w-0 flex-1">
          <h3 className={`text-[14px] font-bold ${accentText}`}>{title}</h3>
          <p className="text-[12px] text-slate-600 mt-0.5 leading-snug">{subtitle}</p>
        </div>
        <span className="text-[11px] font-semibold text-slate-500 tabular-nums shrink-0 pt-1">
          {files.length} file{files.length !== 1 ? 's' : ''}
        </span>
      </div>

      <div className="p-4 flex flex-col gap-3">
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
          className={`group flex flex-col items-center justify-center gap-2 w-full min-h-[112px] rounded-[10px] border-2 border-dashed transition-all ${
            dragOver
              ? `${accentBorder} ${accentBg}`
              : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50/80'
          } disabled:opacity-50`}
        >
          <div className={`flex items-center justify-center w-10 h-10 rounded-full ${accentIconBg} group-hover:scale-105 transition-transform`}>
            {uploading
              ? <span className="w-5 h-5 rounded-full border-2 border-current border-t-transparent animate-spin" />
              : <Upload size={20} strokeWidth={1.5} />
            }
          </div>
          <span className="text-[13px] font-semibold text-slate-700">
            {uploading ? 'Uploading…' : 'Drop file or click to browse'}
          </span>
          <span className="text-[11px] text-slate-500">{hint}</span>
          <input
            ref={fileRef}
            type="file"
            accept={accept}
            className="sr-only"
            aria-label={`Upload ${title}`}
            onChange={e => { const f = e.target.files?.[0]; if (f) pickFile(f); e.target.value = ''; }}
          />
        </button>

        {error && <div className="form-error text-[12px]">{error}</div>}

        {files.length === 0 ? (
          <p className="text-center text-[12px] text-slate-400 py-1">No files uploaded yet.</p>
        ) : (
          <ul className="flex flex-col gap-2 max-h-[180px] overflow-y-auto pr-0.5">
            {files.map(f => (
              <li
                key={f.id}
                className="flex items-center gap-3 px-3 py-2.5 rounded-[10px] border border-slate-100 bg-slate-50/60 hover:bg-white hover:border-slate-200 transition-colors"
              >
                <FileText size={18} className="text-red-500 shrink-0" strokeWidth={1.5} />
                <div className="min-w-0 flex-1">
                  <div className="text-[13px] font-semibold text-slate-800 truncate" title={f.original_name}>
                    {f.original_name}
                  </div>
                  <div className="text-[11px] text-slate-500">
                    {formatSize(f.size)} · {new Date(f.uploaded_at).toLocaleDateString()}
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    type="button"
                    title="View file"
                    disabled={viewingId === f.id}
                    onClick={() => onView(f)}
                    className="flex items-center justify-center w-9 h-9 rounded-[8px] border border-slate-200 bg-white text-slate-500 hover:text-blue-600 hover:border-blue-200 transition-colors disabled:opacity-50"
                  >
                    {viewingId === f.id
                      ? <span className="w-3.5 h-3.5 rounded-full border-2 border-slate-200 border-t-blue-500 animate-spin block" />
                      : <ExternalLink size={16} strokeWidth={1.5} />
                    }
                  </button>
                  <button
                    type="button"
                    title="Delete file"
                    onClick={() => onDelete(f)}
                    className="flex items-center justify-center w-9 h-9 rounded-[8px] border border-slate-200 bg-white text-slate-500 hover:text-red-600 hover:border-red-200 transition-colors"
                  >
                    <Trash2 size={16} strokeWidth={1.5} />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

export default function UnifiedUploadModal({
  projectCode,
  onClose,
  onUpdated,
}: {
  projectCode: string;
  onClose: () => void;
  onUpdated: () => void;
}) {
  const dialog = useAppDialog();
  const [pdfDocs, setPdfDocs] = useState<FileRecord[]>([]);
  const [directorReports, setDirectorReports] = useState<FileRecord[]>([]);
  const [uploadingPdf, setUploadingPdf] = useState(false);
  const [uploadingReport, setUploadingReport] = useState(false);
  const [viewingId, setViewingId] = useState<string | null>(null);
  const [toast, setToast] = useState('');

  const load = useCallback(() => {
    Promise.all([
      projectsApi.drawings(projectCode).catch(() => []),
      projectsApi.directorReports(projectCode).catch(() => []),
    ]).then(([drawings, reports]) => {
      const pdfs = (drawings as FileRecord[]).filter(d =>
        /\.pdf$/i.test(d.original_name) || (d as any).content_type === 'application/pdf',
      );
      setPdfDocs(pdfs);
      setDirectorReports(reports as FileRecord[]);
    });
  }, [projectCode]);

  useEffect(() => { load(); }, [load]);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(''), 2500);
  };

  const uploadPdf = async (file: File) => {
    if (!/\.pdf$/i.test(file.name)) {
      throw new Error('PDF Documents must be .pdf files');
    }
    setUploadingPdf(true);
    try {
      await hashFile(file);
      const fd = new FormData();
      fd.append('file', file);
      await uploadApi.drawing(projectCode, fd);
      load();
      onUpdated();
      showToast('PDF document uploaded');
    } finally {
      setUploadingPdf(false);
    }
  };

  const uploadDirectorReport = async (file: File) => {
    if (!/\.pdf$/i.test(file.name)) {
      throw new Error('Director reports must be .pdf files');
    }
    setUploadingReport(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      await uploadApi.directorReport(projectCode, fd);
      load();
      onUpdated();
      showToast('Director report uploaded');
    } finally {
      setUploadingReport(false);
    }
  };

  const openFile = async (kind: 'pdf' | 'report', file: FileRecord) => {
    setViewingId(file.id);
    try {
      const blob = kind === 'pdf'
        ? await projectsApi.drawingFile(projectCode, file.id)
        : await projectsApi.directorReportFile(projectCode, file.id);
      const url = URL.createObjectURL(blob);
      window.open(url, '_blank', 'noopener,noreferrer');
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch {
      await dialog.alert({ title: 'Could not open file', message: 'The file may have been moved or deleted.', tone: 'error' });
    } finally {
      setViewingId(null);
    }
  };

  const deleteFile = async (kind: 'pdf' | 'report', file: FileRecord) => {
    const ok = await dialog.confirm({
      title: 'Delete file',
      message: `Remove "${file.original_name}" from this project?`,
      tone: 'delete',
      confirmText: 'Delete',
    });
    if (!ok) return;
    try {
      if (kind === 'pdf') {
        await projectsApi.deleteDrawing(projectCode, file.id);
      } else {
        await projectsApi.deleteDirectorReport(projectCode, file.id);
      }
      load();
      onUpdated();
      showToast('File deleted');
    } catch (e: any) {
      await dialog.alert({ title: 'Delete failed', message: e?.response?.data?.message || 'Could not delete file.', tone: 'error' });
    }
  };

  return (
    <Modal
      title="Upload Files"
      onClose={onClose}
      size="lg"
      footer={(
        <button type="button" onClick={onClose} className="pj-btn-primary">
          Done
        </button>
      )}
    >
      <div className="flex flex-col gap-5">
        <p className="text-[13px] text-slate-600 leading-relaxed">
          Project <span className="font-mono font-semibold text-slate-800">{projectCode}</span>
          {' '}— manage PDF documents and director reports independently.
        </p>

        {toast && (
          <div className="flex items-center gap-2 px-3 py-2.5 rounded-[10px] bg-green-50 border border-green-200 text-[13px] text-green-800">
            <CheckCircle size={16} className="shrink-0" strokeWidth={1.5} />
            {toast}
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <UploadSection
            title="PDF Documents"
            subtitle="GA drawings, schematics, and reference PDFs"
            icon={<FileText size={20} strokeWidth={1.5} />}
            accent="blue"
            files={pdfDocs}
            accept=".pdf,application/pdf"
            hint=".pdf only · max 50 MB"
            uploading={uploadingPdf}
            onUpload={uploadPdf}
            onView={f => openFile('pdf', f)}
            onDelete={f => deleteFile('pdf', f)}
            viewingId={viewingId}
          />
          <UploadSection
            title="Director Reports"
            subtitle="KPI summaries and submission reports for director review"
            icon={<SendHorizonal size={20} strokeWidth={1.5} />}
            accent="violet"
            files={directorReports}
            accept=".pdf,application/pdf"
            hint=".pdf only · max 50 MB"
            uploading={uploadingReport}
            onUpload={uploadDirectorReport}
            onView={f => openFile('report', f)}
            onDelete={f => deleteFile('report', f)}
            viewingId={viewingId}
          />
        </div>

        <div className="flex items-start gap-2.5 px-3.5 py-3 rounded-[10px] bg-amber-50 border border-amber-100 text-[12px] text-amber-800 leading-relaxed">
          <FileSpreadsheet size={16} className="shrink-0 mt-0.5 text-amber-600" strokeWidth={1.5} />
          <span>
            Wiring schedules (.xlsx) use the separate <strong>Upload Schedule</strong> action in the frames toolbar — not this dialog.
          </span>
        </div>
      </div>
    </Modal>
  );
}
