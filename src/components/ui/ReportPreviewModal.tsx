import { useCallback, useEffect, useState } from 'react';
import Modal from '../Modal';
import PanelCompletionReportPreview, { type PanelCompletionReportPreviewData } from './PanelCompletionReportPreview';
import { projectsApi, supervisorApi } from '../../services/api';
import { buildPanelReportFilename } from '../../utils/reportFilename';
import { useDwesRefresh, type RefreshOptions } from '../../hooks/useDwesRefresh';
import { DWES_REPORT_PREVIEW_POLL_MS } from '../../constants/refreshIntervals';
import { Download, FileText } from './icons';
import { useLatestRequest } from '../../hooks/useLatestRequest';
import { onFramesChanged } from '../../utils/projectFramesEvents';

interface ReportPreviewModalProps {
  /** Absent when the panel has no assignment yet — the report still renders. */
  assignmentId?: number | null;
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
  const requests = useLatestRequest();

  // A silent refresh swaps the report content in place — the open preview never blanks.
  const fetchReport = useCallback(async (options?: RefreshOptions) => {
    const silent = options?.silent === true;
    const request = requests.begin();
    if (!silent) {
      setReport(null);
      setFailed(false);
    }
    try {
      const data = await projectsApi.panelCompletionReport(projectCode, frameId, request.signal);
      if (requests.isLatest(request.id)) setReport(data);
    } catch (error: any) {
      if (!silent && error?.code !== 'ERR_CANCELED' && requests.isLatest(request.id)) setFailed(true);
    }
  }, [frameId, projectCode, requests]);

  useEffect(() => {
    void fetchReport();
  }, [fetchReport]);

  useDwesRefresh(fetchReport, { pollMs: DWES_REPORT_PREVIEW_POLL_MS });

  useEffect(() => onFramesChanged(detail => {
    if (detail.action === 'deleted'
      && detail.projectCode === projectCode
      && (!detail.frameId || detail.frameId === frameId)) {
      requests.cancel();
      onClose();
    }
  }), [frameId, onClose, projectCode, requests]);

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
      // The production process decides the document: progress while wiring is in
      // flight, completion only once the panel is fully wired and approved.
      title={report?.reportTitle ?? 'Panel Report'}
      subtitle={`${panelName} · Read-only`}
      icon={<FileText />}
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
            Read-only live preview · refreshes as work is recorded
            {assignmentId ? ` · assignment #${assignmentId}` : ''}
          </div>
        </>
      )}
    </Modal>
  );
}
