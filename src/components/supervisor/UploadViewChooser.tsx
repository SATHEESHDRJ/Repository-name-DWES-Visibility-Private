import { Eye, Upload, FileSpreadsheet, FileText } from '../ui/icons';

export type UploadViewKind = 'wiring' | 'drawing';

export interface UploadedFileMetadata {
  fileName: string;
  fileType?: string;
  uploadedAt?: string;
  fileSize?: number;
  uploadedBy?: string;
}

interface UploadViewChooserProps {
  kind: UploadViewKind;
  fileLabel?: string;
  metadata?: UploadedFileMetadata | null;
  onView: () => void;
  onReplace: () => void;
  /** When true, view/replace are disabled (e.g. duplicate panel name). */
  actionsBlocked?: boolean;
  blockReason?: string;
}

function formatFileSize(bytes?: number): string {
  if (bytes == null || bytes <= 0) return '—';
  if (bytes > 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024).toFixed(0)} KB`;
}

function formatUploadedAt(iso?: string): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

export default function UploadViewChooser({
  kind,
  fileLabel,
  metadata,
  onView,
  onReplace,
  actionsBlocked = false,
  blockReason,
}: UploadViewChooserProps) {
  const isWiring = kind === 'wiring';
  const viewTitle = isWiring ? 'View Wiring' : 'GA View';
  const replaceTitle = 'Replace Upload';
  const Icon = isWiring ? FileSpreadsheet : FileText;
  const resolvedName = metadata?.fileName || fileLabel;

  return (
    <div className="upload-view-chooser flex flex-col gap-4">
      <p className="text-[13px] text-slate-600 leading-relaxed">
        {isWiring
          ? 'A wiring schedule is already uploaded for this panel.'
          : 'A GA Drawing is already uploaded for this panel.'}
        {resolvedName && (
          <>
            {' '}
            <strong className="text-slate-800">{resolvedName}</strong>
          </>
        )}
      </p>

      {metadata && (
        <dl className="upload-view-file-meta" aria-label="Uploaded file details">
          <div className="upload-view-file-meta-row">
            <dt>File</dt>
            <dd title={metadata.fileName}>{metadata.fileName}</dd>
          </div>
          <div className="upload-view-file-meta-row">
            <dt>Type</dt>
            <dd>{metadata.fileType || '—'}</dd>
          </div>
          <div className="upload-view-file-meta-row">
            <dt>Uploaded</dt>
            <dd>{formatUploadedAt(metadata.uploadedAt)}</dd>
          </div>
          <div className="upload-view-file-meta-row">
            <dt>Size</dt>
            <dd>{formatFileSize(metadata.fileSize)}</dd>
          </div>
          {metadata.uploadedBy && (
            <div className="upload-view-file-meta-row">
              <dt>By</dt>
              <dd>{metadata.uploadedBy}</dd>
            </div>
          )}
        </dl>
      )}

      {actionsBlocked && blockReason && (
        <p className="text-[12.5px] text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2" role="status">
          {blockReason}
        </p>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <button
          type="button"
          className="upload-view-choice"
          onClick={onView}
          disabled={actionsBlocked}
          title={actionsBlocked ? blockReason : undefined}
        >
          <span className="upload-view-choice-icon upload-view-choice-icon--view">
            <Eye size={22} strokeWidth={1.5} />
          </span>
          <span className="upload-view-choice-title">{viewTitle}</span>
          <span className="upload-view-choice-desc">
            {isWiring
              ? 'Read-only Excel-like grid with search, zoom, and full view'
              : 'Open inline PDF preview or download DWG'}
          </span>
        </button>
        <button
          type="button"
          className="upload-view-choice"
          onClick={onReplace}
          disabled={actionsBlocked}
          title={actionsBlocked ? blockReason : undefined}
        >
          <span className="upload-view-choice-icon upload-view-choice-icon--replace">
            <Upload size={22} strokeWidth={1.5} />
          </span>
          <span className="upload-view-choice-title">{replaceTitle}</span>
          <span className="upload-view-choice-desc">
            Upload a new {isWiring ? 'Excel schedule' : `${fileLabel?.split('.').pop()?.toUpperCase() || 'file'}`} file
          </span>
          {!isWiring && (
            <span className="upload-view-choice-meta">
              <Icon size={14} strokeWidth={1.5} aria-hidden />
            </span>
          )}
        </button>
      </div>
    </div>
  );
}
