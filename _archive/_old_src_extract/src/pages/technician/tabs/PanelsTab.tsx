import { useEffect, useRef, useState } from 'react';
import { PauseCircle, Play, Send, TimerReset, Wrench } from 'lucide-react';
import Badge from '../../../components/Badge';
import Modal from '../../../components/Modal';
import { useAppDialog } from '../../../components/AppDialogProvider';
import { techApi } from '../../../services/api';

const PAUSE_REASONS = ['Lunch Break', 'Material Delay', 'Equipment Issue', 'Supervisor Request', 'Mid-Changeover', 'Other'];

interface PanelsTabProps {
  onSelectPanel: (panel: any) => void;
  activePanel: any | null;
}

function DualRing({ srcPct, dstPct, size = 84 }: { srcPct: number; dstPct: number; size?: number }) {
  const outerRadius = (size / 2) - 6;
  const innerRadius = (size / 2) - 16;
  const outerCirc = 2 * Math.PI * outerRadius;
  const innerCirc = 2 * Math.PI * innerRadius;

  return (
    <svg width={size} height={size} className="dual-ring-svg">
      <circle cx={size / 2} cy={size / 2} r={outerRadius} fill="none" stroke="rgba(159, 177, 195, 0.28)" strokeWidth={6} />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={outerRadius}
        fill="none"
        stroke="var(--status-source)"
        strokeWidth={6}
        strokeDasharray={`${(srcPct / 100) * outerCirc} ${outerCirc}`}
        strokeLinecap="round"
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
      />
      <circle cx={size / 2} cy={size / 2} r={innerRadius} fill="none" stroke="rgba(159, 177, 195, 0.18)" strokeWidth={5} />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={innerRadius}
        fill="none"
        stroke="var(--status-destination)"
        strokeWidth={5}
        strokeDasharray={`${(dstPct / 100) * innerCirc} ${innerCirc}`}
        strokeLinecap="round"
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
      />
      <text x={size / 2} y={size / 2 - 2} textAnchor="middle" fontSize={12} fontWeight={700} fill="var(--text-soft)">
        Avg
      </text>
      <text x={size / 2} y={size / 2 + 16} textAnchor="middle" fontSize={18} fontWeight={800} fill="var(--text)">
        {Math.round((srcPct + dstPct) / 2)}%
      </text>
    </svg>
  );
}

function Timer({ startedAt, totalSecs, running }: { startedAt: string | null; totalSecs: number; running: boolean }) {
  const [elapsed, setElapsed] = useState(totalSecs);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (running && startedAt) {
      const sessionStart = new Date(startedAt).getTime();
      const update = () => setElapsed(totalSecs + Math.floor((Date.now() - sessionStart) / 1000));
      update();
      timerRef.current = setInterval(update, 1000);
    } else {
      setElapsed(totalSecs);
    }

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [running, startedAt, totalSecs]);

  const hours = Math.floor(elapsed / 3600);
  const minutes = Math.floor((elapsed % 3600) / 60);
  const seconds = elapsed % 60;
  const format = (value: number) => value.toString().padStart(2, '0');

  return (
    <span
      className="info-pill"
      data-tone={running ? 'source' : 'pending'}
      data-variant="mono"
    >
      {hours > 0 ? `${format(hours)}:` : ''}{format(minutes)}:{format(seconds)}
    </span>
  );
}

export default function PanelsTab({ onSelectPanel, activePanel }: PanelsTabProps) {
  const dialog = useAppDialog();
  const [panels, setPanels] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showPause, setShowPause] = useState<any>(null);
  const [pauseReason, setPauseReason] = useState(PAUSE_REASONS[0]);
  const [customReason, setCustomReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const load = () => {
    setLoading(true);
    techApi.myPanels()
      .then(data => {
        setPanels(data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  };

  useEffect(load, []);

  const inProgress = panels.find(panel => panel.status === 'in_progress');

  const handleStart = async (panel: any) => {
    setSaving(true);
    setError('');
    try {
      await techApi.start(panel.id);
      load();
    } catch (apiError: any) {
      setError(apiError?.response?.data?.message || 'Could not start');
    } finally {
      setSaving(false);
    }
  };

  const handleResume = async (panel: any) => {
    setSaving(true);
    setError('');
    try {
      await techApi.resume(panel.id);
      load();
    } catch (apiError: any) {
      setError(apiError?.response?.data?.message || 'Could not resume');
    } finally {
      setSaving(false);
    }
  };

  const handlePauseOpen = (panel: any) => {
    setShowPause(panel);
    setPauseReason(PAUSE_REASONS[0]);
    setCustomReason('');
    setError('');
  };

  const confirmPause = async () => {
    const reason = pauseReason === 'Other' ? customReason : pauseReason;
    if (!reason.trim()) {
      setError('Enter a reason');
      return;
    }

    setSaving(true);
    setError('');
    const elapsed = showPause.total_wiring_seconds + (
      showPause.status === 'in_progress' && showPause.started_at
        ? Math.floor((Date.now() - new Date(showPause.started_at).getTime()) / 1000)
        : 0
    );

    try {
      await techApi.pause(showPause.id, elapsed, reason);
      setShowPause(null);
      load();
    } catch (apiError: any) {
      setError(apiError?.response?.data?.message || 'Could not pause');
    } finally {
      setSaving(false);
    }
  };

  const handleComplete = async (panel: any) => {
    const ok = await dialog.confirm({
      title: 'Mark Wiring Complete',
      message: 'You can still edit cables before submitting the report. Continue?',
      tone: 'save',
      confirmText: 'Complete',
    });
    if (!ok) return;
    setSaving(true);
    try {
      await techApi.complete(panel.id);
      load();
    } catch {
      // keep current behavior
    } finally {
      setSaving(false);
    }
  };

  const handleMarkReady = async () => {
    await techApi.markReady().catch(() => {});
    load();
  };

  if (loading) {
    return <div className="dwes-empty-state"><div className="dwes-empty-copy">Loading panels</div></div>;
  }

  if (panels.length === 0) {
    return (
      <div className="dwes-empty-state">
        <div className="dwes-empty-title">No panels assigned</div>
        <div className="dwes-empty-copy">
          A supervisor must assign and approve a panel before you can start.
        </div>
        <button className="dwes-button dwes-button-primary" onClick={handleMarkReady} type="button">
          <Send size={18} />
          <span>Mark Myself Ready for Assignment</span>
        </button>
      </div>
    );
  }

  return (
    <div>
      {error && <div className="dwes-error mb-sm">{error}</div>}

      {inProgress && (
        <div className="tech-strip mb-md" data-tone="warning">
          Active panel <strong>{inProgress.panel_name}</strong>. Open Wiring to continue the live session.
        </div>
      )}

      <div className="tech-panel-list">
        {panels.map(panel => {
          const srcPct = panel.cables_total > 0 ? Math.round((panel.cables_src_done / panel.cables_total) * 100) : 0;
          const dstPct = panel.cables_total > 0 ? Math.round((panel.cables_dst_done / panel.cables_total) * 100) : 0;
          const isActive = activePanel?.id === panel.id;
          const approved = panel.supervisor_approved;

          return (
            <article key={panel.id} className={`panel-card ${isActive ? 'is-active' : ''}`}>
              <div className="panel-card-grid">
                <div className="panel-card-main">
                  <DualRing srcPct={srcPct} dstPct={dstPct} />

                  <div className="content-grow-min">
                    <div className="panel-title">{panel.panel_name}</div>
                    <div className="panel-code">{panel.project_code}</div>
                    <div className="panel-meta-row">
                      <span className="info-pill" data-tone="source">Source {panel.cables_src_done}/{panel.cables_total}</span>
                      <span className="info-pill" data-tone="destination">Destination {panel.cables_dst_done}/{panel.cables_total}</span>
                      {panel.status === 'in_progress' && (
                        <Timer startedAt={panel.started_at} totalSecs={panel.total_wiring_seconds} running />
                      )}
                      {panel.status !== 'in_progress' && panel.total_wiring_seconds > 0 && (
                        <Timer startedAt={null} totalSecs={panel.total_wiring_seconds} running={false} />
                      )}
                      {!approved && panel.status === 'assigned' && (
                        <span className="info-pill" data-tone="pending">Awaiting supervisor approval</span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="panel-card-actions">
                  <Badge label={panel.status} />

                  {panel.status === 'assigned' && approved && (
                    <button
                      className="dwes-button dwes-button-success"
                      onClick={() => handleStart(panel)}
                      disabled={!!inProgress || saving}
                      type="button"
                    >
                      <Play size={18} />
                      <span>Start</span>
                    </button>
                  )}

                  {panel.status === 'in_progress' && (
                    <>
                      <button className="dwes-button dwes-button-progress" onClick={() => onSelectPanel(panel)} type="button">
                        <Wrench size={18} />
                        <span>Open Wiring</span>
                      </button>
                      <button className="dwes-button dwes-button-warning" onClick={() => handlePauseOpen(panel)} type="button">
                        <PauseCircle size={18} />
                        <span>Pause</span>
                      </button>
                      <button className="dwes-button dwes-button-neutral" onClick={() => handleComplete(panel)} type="button">
                        <TimerReset size={18} />
                        <span>Complete</span>
                      </button>
                    </>
                  )}

                  {panel.status === 'paused' && (
                    <button
                      className="dwes-button dwes-button-progress"
                      onClick={() => handleResume(panel)}
                      disabled={!!inProgress || saving}
                      type="button"
                    >
                      <Play size={18} />
                      <span>Resume</span>
                    </button>
                  )}

                  {panel.status === 'completed' && !panel.report_submitted && (
                    <button className="dwes-button dwes-button-primary" onClick={() => onSelectPanel(panel)} type="button">
                      <Send size={18} />
                      <span>Submit Report</span>
                    </button>
                  )}
                </div>
              </div>
            </article>
          );
        })}
      </div>

      <div className="center-row mt-md">
        <button className="dwes-button dwes-button-success" onClick={handleMarkReady} type="button">
          <Send size={18} />
          <span>Mark Ready for Next Assignment</span>
        </button>
      </div>

      {showPause && (
        <Modal
          title="Pause Wiring"
          onClose={() => setShowPause(null)}
          footer={(
            <>
              <button className="dwes-button dwes-button-neutral" onClick={() => setShowPause(null)} type="button">
                Cancel
              </button>
              <button className="dwes-button dwes-button-warning" onClick={confirmPause} disabled={saving} type="button">
                {saving ? 'Pausing' : 'Confirm Pause'}
              </button>
            </>
          )}
        >
          <div className="modal-section modal-section-spaced">
            <div className="dwes-label">Panel</div>
            <div className="panel-title mt-xs">{showPause.panel_name}</div>
          </div>

          <label className="dwes-label label-block mb-sm">Reason</label>
          <div className="radio-list">
            {PAUSE_REASONS.map(reason => (
              <label key={reason} className={`radio-card ${pauseReason === reason ? 'is-active' : ''}`}>
                <input type="radio" checked={pauseReason === reason} onChange={() => setPauseReason(reason)} />
                <span>{reason}</span>
              </label>
            ))}
          </div>

          {pauseReason === 'Other' && (
            <div className="note-block">
              <textarea
                value={customReason}
                onChange={event => setCustomReason(event.target.value)}
                rows={3}
                placeholder="Describe the reason"
                className="dwes-textarea"
              />
            </div>
          )}

          {error && <div className="dwes-error mt-md">{error}</div>}
        </Modal>
      )}
    </div>
  );
}
