import { useCallback, useEffect, useState } from 'react';
import Modal from '../Modal';
import { asPdfBlob } from '../ui/FileViewer';
import { lazy, Suspense } from 'react';
const PdfDocumentViewer = lazy(() => import('../ui/PdfDocumentViewer'));
import { projectsApi } from '../../services/api';
import { sanitizeFilenameSegment } from '../../utils/reportFilename';
import { Download, FileText } from '../ui/icons';
import { DwesLoadingCenter } from '../ui/DwesLoadingIndicator';

interface ProjectPdfPreviewModalProps {
  projectCode: string;
  panelId?: string;
  title: string;
  onClose: () => void;
}

export default function ProjectPdfPreviewModal({
  projectCode,
  panelId,
  title,
  onClose,
}: ProjectPdfPreviewModalProps) {
  const [blob, setBlob] = useState<Blob | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [modalFullscreen, setModalFullscreen] = useState(true);
  const [fetchKey, setFetchKey] = useState(0);

  const loadPdf = useCallback(async (signal?: { cancelled: boolean }) => {
    setLoading(true);
    setError('');
    setBlob(null);
    try {
      const raw: Blob = await projectsApi.reportPdf(projectCode, panelId);
      if (signal?.cancelled) return;
      setBlob(asPdfBlob(raw));
    } catch {
      if (!signal?.cancelled) setError('Failed to load report PDF');
    } finally {
      if (!signal?.cancelled) setLoading(false);
    }
  }, [projectCode, panelId]);

  useEffect(() => {
    const signal = { cancelled: false };
    void loadPdf(signal);
    return () => { signal.cancelled = true; };
  }, [loadPdf, fetchKey]);

  const retry = () => setFetchKey(k => k + 1);

  const downloadFilename = `Report_${sanitizeFilenameSegment(projectCode, 80)}.pdf`;

  const download = () => {
    if (!blob) return;
    const href = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = href;
    anchor.download = downloadFilename;
    anchor.click();
    URL.revokeObjectURL(href);
  };

  return (
    <Modal
      title={title}
      icon={<FileText />}
      onClose={onClose}
      size={modalFullscreen ? 'fullscreen' : 'team'}
      bodyClassName="modal-body-flush"
      footer={(
        <>
          <button type="button" className="btn-secondary dwes-report-action-btn dwes-report-export-btn" onClick={download} disabled={!blob}>
            <Download size={16} />
            <span>Download PDF</span>
          </button>
          <button type="button" className="btn-secondary" onClick={() => setModalFullscreen(v => !v)}>
            {modalFullscreen ? 'Compact view' : 'Expand view'}
          </button>
          <button type="button" className="btn-primary" onClick={onClose}>Close</button>
        </>
      )}
    >
      <Suspense fallback={(
        <div className="pdf-viewer--modal flex items-center justify-center p-8">
          <DwesLoadingCenter label="Loading PDF viewer…" className="min-h-0" />
        </div>
      )}>
        <PdfDocumentViewer
          blob={blob}
          title={title}
          loading={loading}
          error={error}
          onRetry={retry}
          downloadFilename={downloadFilename}
          className="pdf-viewer--modal"
        />
      </Suspense>
    </Modal>
  );
}
