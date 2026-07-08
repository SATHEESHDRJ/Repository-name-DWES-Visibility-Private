import { useCallback, useEffect, useState } from 'react';
import Modal from '../Modal';
import PanelCompletionReportPreview, { type PanelCompletionReportPreviewData } from './PanelCompletionReportPreview';
import { projectsApi, supervisorApi } from '../../services/api';
import { buildPanelReportFilename } from '../../utils/reportFilename';
import { useReadOnlyPoll } from '../../hooks/useReadOnlyPoll';
import { Download } from './icons';

interface ReportPreviewModalProps {
  assignmentId: number;
  projectCode: string;
  frameId: string;
  panelName: string;
  onClose: () => void;
  /** Technician submit flow — preview first, then call on submit */
  onSubmit?: () => void | Promise<void>;
  submitting?: boolean;
  showExport?: boolean;
}

export default function ReportPreviewModal({
  assignmentId,
  projectCode,
  frameId,
  panelName,
  onClose,
  onSubmit,
  submitting = false,
  showExport = true,
}: ReportPreviewModalProps) {
  const [report, setReport] = useState<PanelCompletionReportPreviewData | null>(null);
  const [failed, setFailed] = useState(false);
  const [exporting, setExporting] = useState<'pdf' | 'xlsx' | null>(null);

  const fetchReport = useCallback(async () => {
    const data = await projectsApi.panelCompletionReport(projectCode, frameId);
    setReport(data);
  }, [projectCode, frameId]);

  useEffect(() => {
    fetchReport().catch(() => setFailed(true));
  }, [fetchReport]);

  useReadOnlyPoll(fetchReport, 6000);

  const exportPdf = async () => {
    setExporting('pdf');
    try {
      const blob = await projectsApi.frameReportPdf(projectCode, frameId);
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = buildPanelReportFilename({ projectCode, panelName, ext: 'pdf' });
      anchor.click();
      URL.revokeObjectURL(url);
    } catch {
      /* optional export */
    } finally {
      setExporting(null);
    }
  };

  const exportXlsx = async () => {
    setExporting('xlsx');
    try {
      const blob = await supervisorApi.panelReportXlsx(projectCode, frameId);
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = buildPanelReportFilename({ projectCode, panelName, ext: 'xlsx' });
      anchor.click();
      URL.revokeObjectURL(url);
    } catch {
      /* optional export */
    } finally {
      setExporting(null);
    }
  };

  return (
    <Modal
      title="Project Completion Report"
      onClose={onClose}
      size="xl"
      footer={(
        <>
          {showExport && (
            <>
              <button onClick={exportPdf} disabled={!!exporting || !report} className="btn-secondary" type="button">
                <Download size={16} />
                <span>{exporting === 'pdf' ? 'Exporting…' : 'Export PDF'}</span>
              </button>
              <button onClick={exportXlsx} disabled={!!exporting || !report} className="btn-secondary" type="button">
                <Download size={16} />
                <span>{exporting === 'xlsx' ? 'Exporting…' : 'Export XLSX'}</span>
              </button>
            </>
          )}
          {onSubmit ? (
            <>
              <button onClick={onClose} className="btn-secondary" type="button" disabled={submitting}>Cancel</button>
              <button
                onClick={() => void onSubmit()}
                disabled={submitting || !report}
                className="btn-primary"
                type="button"
              >
                {submitting ? 'Submitting…' : 'Submit Report'}
              </button>
            </>
          ) : (
            <button onClick={onClose} className="btn-primary" type="button">Close</button>
          )}
        </>
      )}
    >
      {!report && !failed && (
        <div className="empty-state"><p className="empty-text">Loading report…</p></div>
      )}
      {failed && !report && (
        <div className="form-error">Could not load report data.</div>
      )}

      {report && (
        <>
          <PanelCompletionReportPreview data={report} />
          <div className="pcr-live-hint">
            Live preview · refreshes every 6s · assignment #{assignmentId}
          </div>
        </>
      )}
    </Modal>
  );
}
