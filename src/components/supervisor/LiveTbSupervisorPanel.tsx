import { useCallback, useEffect, useState } from 'react';
import { liveTbAnalysisApi } from '../../services/api';

type Props = {
  projectCode: string;
  frameId: string;
  panelName?: string;
};

const STATUS_LABELS: Record<string, string> = {
  READY_FOR_LIVE_TB: 'Ready for LIVE TB',
  ANALYSIS_IN_PROGRESS: 'Analysis in progress',
  SUPERVISOR_VERIFICATION_REQUIRED: 'Supervisor verification required',
  SCHEDULE_DRAWING_MISMATCH: 'Schedule–drawing mismatch',
  TECHNICAL_FAILURE: 'Technical failure',
};

/**
 * Supervisor LIVE TB verification + debug console.
 * No wiring mutations; never edits original GA bytes.
 */
export default function LiveTbSupervisorPanel({ projectCode, frameId, panelName }: Props) {
  const [panel, setPanel] = useState<any>(null);
  const [gates, setGates] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const refresh = useCallback(async () => {
    if (!projectCode || !frameId) return;
    setError('');
    try {
      const [p, g] = await Promise.all([
        liveTbAnalysisApi.panelStatus(projectCode, frameId),
        liveTbAnalysisApi.gates(projectCode, frameId).catch(() => null),
      ]);
      setPanel(p);
      setGates(g);
    } catch (err: any) {
      setError(err?.response?.data?.message || err?.message || 'Failed to load LIVE TB status');
    }
  }, [projectCode, frameId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const pending: any[] = Array.isArray(panel?.pending_candidates) ? panel.pending_candidates : [];
  const status = String(panel?.panel_status || '');

  const onRetry = async () => {
    setBusy(true);
    setMessage('');
    try {
      await liveTbAnalysisApi.run(projectCode, frameId);
      setMessage('Analysis re-queued.');
      await refresh();
    } catch (err: any) {
      setError(err?.response?.data?.message || err?.message || 'Retry failed');
    } finally {
      setBusy(false);
    }
  };

  const onVerify = async (c: any, action: 'confirm' | 'reject' | 'not_in_ga') => {
    setBusy(true);
    setMessage('');
    try {
      if (action === 'confirm') {
        const g = c?.geometry;
        if (
          !g
          || !Number.isFinite(Number(g.x))
          || !Number.isFinite(Number(g.y))
          || !Number.isFinite(Number(g.width))
          || !Number.isFinite(Number(g.height))
        ) {
          setError('Confirm requires candidate geometry from analysis — coordinates are not invented.');
          setBusy(false);
          return;
        }
      }
      await liveTbAnalysisApi.verify(projectCode, frameId, {
        action,
        tb_number: c.tb_number,
        page_number: c.page_number || 1,
        terminal_group: c.terminal_group,
        ...(action === 'confirm' ? { geometry: c.geometry } : {}),
      });
      setMessage(`${action} applied for ${c.tb_number}`);
      await refresh();
    } catch (err: any) {
      setError(err?.response?.data?.message || err?.message || 'Verify failed');
    } finally {
      setBusy(false);
    }
  };

  const onExport = async () => {
    try {
      const blob = await liveTbAnalysisApi.debugExport(projectCode, frameId);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `live-tb-debug-${projectCode}-${frameId}.ndjson`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err: any) {
      setError(err?.response?.data?.message || err?.message || 'Export failed');
    }
  };

  if (!projectCode || !frameId) {
    return (
      <div className="p-4 text-sm text-slate-600">
        Select a project and panel to manage LIVE TB analysis.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 p-4 min-w-0">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">LIVE TB Analysis</h2>
          <p className="text-sm text-slate-600">
            {panelName || frameId} · {projectCode}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" className="btn btn-secondary text-sm" disabled={busy} onClick={() => void refresh()}>
            Refresh
          </button>
          <button type="button" className="btn btn-secondary text-sm" disabled={busy} onClick={() => void onRetry()}>
            Retry Analysis
          </button>
          <button type="button" className="btn btn-secondary text-sm" onClick={() => void onExport()}>
            Export NDJSON
          </button>
        </div>
      </div>

      {error ? <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</div> : null}
      {message ? <div className="rounded border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{message}</div> : null}

      <div className="rounded border border-slate-200 bg-white px-4 py-3">
        <div className="text-xs font-bold uppercase tracking-wide text-slate-500">Panel status</div>
        <div className="mt-1 text-base font-semibold text-slate-900">
          {STATUS_LABELS[status] || status || '—'}
        </div>
        <div className="mt-2 grid gap-1 text-sm text-slate-700 sm:grid-cols-2">
          <div>Failed stage: <code>{panel?.failed_stage || 'none'}</code></div>
          <div>Usable TB groups: {panel?.usable_tb_groups ?? 0}</div>
          <div>Analysis: <code>{panel?.analysis_status || '—'}</code></div>
          <div>Checksum: <code>{String(panel?.drawing_checksum || '').slice(0, 16) || '—'}</code></div>
          <div>Retries: {panel?.retry_count ?? 0}</div>
          <div>Last error: <code>{String(panel?.last_error || '—').slice(0, 80)}</code></div>
        </div>
        {status === 'TECHNICAL_FAILURE' ? (
          <div className="mt-3 rounded border border-red-200 bg-red-50 p-3">
            <div className="text-sm font-semibold text-red-900">
              Automatic TB-location analysis could not be completed for this drawing.
            </div>
            <p className="mt-1 text-xs text-red-800">
              Stage <code>{panel?.failed_stage || 'unknown'}</code>
              {' · '}retries {panel?.retry_count ?? 0}
            </p>
            {panel?.failure_reason ? (
              <pre className="mt-2 max-h-40 overflow-auto rounded bg-white/80 p-2 text-xs text-slate-800 whitespace-pre-wrap">
                {String(panel.failure_reason)}
              </pre>
            ) : null}
            <button
              type="button"
              className="btn btn-primary text-sm mt-3"
              disabled={busy}
              onClick={() => void onRetry()}
            >
              Retry Analysis
            </button>
          </div>
        ) : null}
        {panel?.worker_health ? (
          <pre className="mt-3 max-h-32 overflow-auto rounded bg-slate-50 p-2 text-xs text-slate-700">
            {JSON.stringify(panel.worker_health, null, 2)}
          </pre>
        ) : null}
      </div>

      {status === 'SUPERVISOR_VERIFICATION_REQUIRED' || pending.length > 0 ? (
        <div className="rounded border border-amber-200 bg-amber-50/40 px-4 py-3">
          <div className="text-sm font-semibold text-amber-950">Candidates needing verification</div>
          {pending.length === 0 ? (
            <p className="mt-2 text-sm text-slate-600">No pending candidates in the latest run summary.</p>
          ) : (
            <ul className="mt-3 flex flex-col gap-3">
              {pending.map((c, idx) => (
                <li key={`${c.tb_number}-${idx}`} className="rounded border border-slate-200 bg-white p-3">
                  <div className="font-medium text-slate-900">
                    Expected TB: {c.tb_number} · page {c.page_number || 1} · {c.confidence || 'MEDIUM'}
                  </div>
                  <div className="text-xs text-slate-600 mt-1">
                    Terminal: {c.terminal_group || (c.evidence?.schedule?.terminal) || '—'}
                  </div>
                  {c.evidence ? (
                    <ul className="mt-2 grid gap-1 text-xs text-slate-700 sm:grid-cols-2">
                      <li>OCR evidence: {c.evidence?.tesseract?.matched || c.evidence?.paddleocr?.matched ? '✓' : '—'}</li>
                      <li>LocateAnything text: {c.evidence?.locate_text?.matched ? '✓' : '—'}</li>
                      <li>LocateAnything physical group: {c.evidence?.locate_physical_group?.matched ? '✓' : '—'}</li>
                      <li>OpenCV strip: {c.evidence?.opencv_strip?.matched ? '✓' : '—'}</li>
                      <li>View: {c.evidence?.view?.view_name || c.view_name || '—'}</li>
                      <li>Region: {c.evidence?.view?.region || '—'}</li>
                    </ul>
                  ) : null}
                  <div className="text-xs text-slate-600 mt-1">
                    {(c.reasons || []).join('; ') || c.detection_method || ''}
                  </div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <button type="button" className="btn btn-primary text-xs" disabled={busy} onClick={() => void onVerify(c, 'confirm')}>
                      Confirm
                    </button>
                    <button type="button" className="btn btn-secondary text-xs" disabled={busy} onClick={() => void onVerify(c, 'reject')}>
                      Reject
                    </button>
                    <button type="button" className="btn btn-secondary text-xs" disabled={busy} onClick={() => void onVerify(c, 'not_in_ga')}>
                      Not in GA / Select correct group
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}

      {gates?.gates ? (
        <div className="rounded border border-slate-200 bg-white px-4 py-3">
          <div className="text-sm font-semibold text-slate-900">Nine-gate diagnostic</div>
          <ul className="mt-2 grid gap-1 text-sm sm:grid-cols-2">
            {gates.gates.map((g: any) => (
              <li key={g.gate} className="flex justify-between gap-2 border-b border-slate-100 py-1">
                <span className="font-mono text-xs text-slate-700">{g.gate}</span>
                <span className={
                  g.state === 'PASS' ? 'text-emerald-700 font-semibold'
                    : g.state === 'FAIL' ? 'text-red-700 font-semibold'
                      : 'text-amber-700 font-semibold'
                }>
                  {g.state}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
