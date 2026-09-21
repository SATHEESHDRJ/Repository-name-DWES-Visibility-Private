import { useEffect, useState } from 'react';
import { liveTbAnalysisApi } from '../../services/api';

const STATUS_LABELS: Record<string, string> = {
  READY_FOR_LIVE_TB: 'READY FOR LIVE TB',
  ANALYSIS_IN_PROGRESS: 'ANALYSIS IN PROGRESS',
  SUPERVISOR_VERIFICATION_REQUIRED: 'SUPERVISOR VERIFICATION REQUIRED',
  SCHEDULE_DRAWING_MISMATCH: 'SCHEDULE–DRAWING MISMATCH',
  TECHNICAL_FAILURE: 'TECHNICAL FAILURE',
};

const STATUS_TONE: Record<string, string> = {
  READY_FOR_LIVE_TB: 'ok',
  ANALYSIS_IN_PROGRESS: 'progress',
  SUPERVISOR_VERIFICATION_REQUIRED: 'warn',
  SCHEDULE_DRAWING_MISMATCH: 'warn',
  TECHNICAL_FAILURE: 'danger',
};

type Props = {
  projectCode: string;
  frameId: string;
  /** Compact strip for assignment / workflow surfaces. */
  compact?: boolean;
  className?: string;
};

/**
 * Single Supervisor-facing LIVE TB panel status (exactly one of five).
 * Does not mutate wiring or GA files.
 */
export default function LiveTbPanelStatusStrip({
  projectCode,
  frameId,
  compact = false,
  className = '',
}: Props) {
  const [status, setStatus] = useState<string>('');
  const [failedStage, setFailedStage] = useState<string>('none');
  const [usable, setUsable] = useState<number>(0);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!projectCode || !frameId) {
      setStatus('');
      return;
    }
    let active = true;
    void liveTbAnalysisApi
      .panelStatus(projectCode, frameId)
      .then((p: any) => {
        if (!active) return;
        setStatus(String(p?.panel_status || ''));
        setFailedStage(String(p?.failed_stage || 'none'));
        setUsable(Number(p?.usable_tb_groups || 0));
        setError('');
      })
      .catch((err: any) => {
        if (!active) return;
        setError(err?.response?.data?.message || err?.message || 'Unable to load LIVE TB status');
        setStatus('');
      });
    return () => {
      active = false;
    };
  }, [projectCode, frameId]);

  if (!projectCode || !frameId) return null;

  const label = STATUS_LABELS[status] || (status ? status.replace(/_/g, ' ') : '—');
  const tone = STATUS_TONE[status] || 'idle';

  return (
    <div
      className={`live-tb-status-strip live-tb-status-strip--${tone}${compact ? ' live-tb-status-strip--compact' : ''} ${className}`.trim()}
      role="status"
      aria-label="LIVE TB panel status"
    >
      <div className="live-tb-status-strip__label">LIVE TB</div>
      <div className="live-tb-status-strip__value">{error || label}</div>
      {!compact && !error && status ? (
        <div className="live-tb-status-strip__meta">
          {status === 'TECHNICAL_FAILURE' ? (
            <span>Failed stage: {failedStage}</span>
          ) : (
            <span>Usable TB groups: {usable}</span>
          )}
        </div>
      ) : null}
    </div>
  );
}
