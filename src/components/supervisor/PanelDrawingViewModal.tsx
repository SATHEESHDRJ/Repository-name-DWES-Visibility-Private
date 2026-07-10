import { useCallback, useEffect, useState } from 'react';
import Modal from '../Modal';
import FileViewer, { type FileViewerType } from '../ui/FileViewer';
import { projectsApi } from '../../services/api';

export interface PanelDrawingSummary {
  id: string;
  original_name: string;
}

interface Props {
  projectCode: string;
  drawing: PanelDrawingSummary;
  panelLabel: string;
  /** When false, the Download control is hidden (permission-based). */
  canDownload?: boolean;
  onClose: () => void;
}

function fileTypeFromName(name: string): FileViewerType {
  const ext = name.split('.').pop()?.toLowerCase() ?? '';
  if (ext === 'pdf') return 'pdf';
  if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg'].includes(ext)) return 'image';
  return 'download-only'; // dwg / dxf and anything non-previewable
}

/**
 * Read-only preview of an uploaded project/panel drawing.
 * Reuses FileViewer → PdfDocumentViewer (zoom, search, page navigation,
 * fullscreen, download) so the Supervisor sees the drawing exactly as stored.
 */
export default function PanelDrawingViewModal({
  projectCode,
  drawing,
  panelLabel,
  canDownload = true,
  onClose,
}: Props) {
  const [blob, setBlob] = useState<Blob | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [fetchKey, setFetchKey] = useState(0);

  const fileType = fileTypeFromName(drawing.original_name);

  const load = useCallback(async (signal: { cancelled: boolean }) => {
    setLoading(true);
    setError('');
    setBlob(null);
    try {
      const raw = await projectsApi.drawingFile(projectCode, drawing.id);
      if (signal.cancelled) return;
      setBlob(raw);
    } catch (err: unknown) {
      if (!signal.cancelled) {
        const apiMsg = (err as { response?: { data?: { message?: string }; status?: number }; message?: string })?.response?.data?.message;
        const status = (err as { response?: { status?: number } })?.response?.status;
        if (status === 404) {
          setError(apiMsg || 'Drawing file not found on disk — it may have been removed.');
        } else if (status === 403) {
          setError(apiMsg || 'You do not have permission to view this drawing.');
        } else {
          setError(apiMsg || 'Failed to load drawing — the file may have been removed, or you may not have access.');
        }
      }
    } finally {
      if (!signal.cancelled) setLoading(false);
    }
  }, [projectCode, drawing.id]);

  useEffect(() => {
    const signal = { cancelled: false };
    void load(signal);
    return () => { signal.cancelled = true; };
  }, [load, fetchKey]);

  const download = () => {
    if (!blob) return;
    const href = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = href;
    anchor.download = drawing.original_name;
    anchor.click();
    URL.revokeObjectURL(href);
  };

  return (
    <Modal
      title="View Drawing"
      subtitle={`${panelLabel} · ${drawing.original_name}`}
      onClose={onClose}
      size="fullscreen"
      bodyClassName="modal-body-flush"
      footer={(
        <button type="button" className="btn-primary" onClick={onClose}>Close</button>
      )}
    >
      <FileViewer
        blob={blob}
        fileType={fileType}
        panelLabel={panelLabel}
        fileName={drawing.original_name}
        loading={loading}
        error={error}
        onRetry={() => setFetchKey(k => k + 1)}
        onDownload={canDownload ? download : undefined}
        className="pdf-viewer--modal"
      />
    </Modal>
  );
}
