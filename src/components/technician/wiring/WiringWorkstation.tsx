import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  AlertTriangle, ArrowLeft, CheckCircle2, LayoutPanelTop, Maximize, PauseCircle, Play,
} from '../../ui/icons';
import { techApi } from '../../../services/api';
import { useAppDialog } from '../../AppDialogProvider';
import { useReadOnlyPoll } from '../../../hooks/useReadOnlyPoll';
import { DWES_WIRING_SYNC_MS } from '../../../constants/refreshIntervals';
import { emitWorkflowChanged } from '../../../utils/dwesRefreshEvents';
import Toast from '../../ui/Toast';
import PauseReasonModal from '../PauseReasonModal';
import AssignmentAcknowledgmentModal from '../AssignmentAcknowledgmentModal';
import { useAuthStore } from '../../../store/useAuthStore';
import { useLiveWiringStore } from '../../../store/useLiveWiringStore';
import DigitalWiringFrame from './DigitalWiringFrame';
import type { Cable } from '../../../types';
import {
  DEFAULT_CABLE_STATUS, ensureCableList, findNextPending, type ExtendedCableStatus,
} from './wiring-utils';

const SYNC_INTERVAL_MS = DWES_WIRING_SYNC_MS;
/** One end checked for longer than this → status chip blinks as an alert (§9). */
const PARTIAL_ALERT_MS = 120_000;

function LiveElapsed({ startedAt, totalSecs }: { startedAt: string | null; totalSecs: number }) {
  const [elapsed, setElapsed] = useState(totalSecs);
  useEffect(() => {
    if (!startedAt) { setElapsed(totalSecs); return; }
    const base = new Date(startedAt).getTime();
    const tick = () => setElapsed(totalSecs + Math.floor((Date.now() - base) / 1000));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [startedAt, totalSecs]);
  const h = Math.floor(elapsed / 3600);
  const m = Math.floor((elapsed % 3600) / 60);
  const s = elapsed % 60;
  const pad = (n: number) => n.toString().padStart(2, '0');
  return <span className="dwf-pill dwf-pill-timer">{h > 0 ? `${h}:` : ''}{pad(m)}:{pad(s)}</span>;
}

interface Props {
  panel: any;
  onPanelUpdate: () => void;
  onExit?: () => void;
}

export default function WiringWorkstation({ panel, onPanelUpdate, onExit }: Props) {
  const dialog = useAppDialog();
  const { user } = useAuthStore();
  const setLiveFromPanel = useLiveWiringStore(s => s.setFromPanel);
  const [detail, setDetail] = useState<any>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [status, setStatus] = useState<Record<string, ExtendedCableStatus>>({});
  const [saving, setSaving] = useState(false);
  const [showPause, setShowPause] = useState(false);
  const [showAck, setShowAck] = useState(false);
  const [tabletMode, setTabletMode] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [activeIdx, setActiveIdx] = useState(0);
  const workspaceRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    document.documentElement.classList.toggle('dwf-tablet-active', tabletMode);
    return () => document.documentElement.classList.remove('dwf-tablet-active');
  }, [tabletMode]);

  useEffect(() => {
    if (!onExit || tabletMode) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || showPause || showAck) return;
      e.preventDefault();
      onExit();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onExit, tabletMode, showPause, showAck]);

  useEffect(() => {
    if (tabletMode || !detail) return;
    const root = workspaceRef.current;
    const focusable = root?.querySelector<HTMLElement>(
      'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
    );
    focusable?.focus();
  }, [detail, tabletMode, panel?.id]);

  const load = useCallback((reset = true) => {
    if (!panel) return;
    setLoadError(null);
    techApi.myAssignmentDetail(panel.id).then(data => {
      setDetail(data);
      const next: Record<string, ExtendedCableStatus> = {};
      Object.entries(data.assignment.cable_status || {}).forEach(([k, v]: [string, any]) => {
        next[k] = { src: !!v.src, dst: !!v.dst, note: v.note || '', issue: !!v.issue };
      });
      setStatus(next);
      if (!reset) return;
    }).catch((e: any) => {
      const httpStatus = e?.response?.status;
      const msg = e?.response?.data?.message;
      setLoadError(httpStatus
        ? `HTTP ${httpStatus}${msg ? ` — ${msg}` : ''}`
        : 'Network error — backend unreachable');
    });
  }, [panel?.id]);

  useEffect(() => { load(true); }, [load]);

  const syncProgress = useCallback(() => {
    if (!panel) return;
    techApi.myAssignmentDetail(panel.id).then(data => {
      setDetail(data);
      const next: Record<string, ExtendedCableStatus> = {};
      Object.entries(data.assignment.cable_status || {}).forEach(([k, v]: [string, any]) => {
        next[k] = { src: !!v.src, dst: !!v.dst, note: v.note || '', issue: !!v.issue };
      });
      setStatus(next);
    }).catch(() => {});
  }, [panel?.id]);

  useReadOnlyPoll(syncProgress, SYNC_INTERVAL_MS);

  const partialSince = useRef<Record<string, number>>({});
  const [alertTick, setAlertTick] = useState(0);
  useEffect(() => {
    const now = Date.now();
    const map = partialSince.current;
    Object.entries(status).forEach(([k, s]) => {
      const partial = (s.src || s.dst) && !(s.src && s.dst);
      if (partial && !map[k]) map[k] = now;
      if (!partial && map[k]) delete map[k];
    });
  }, [status]);
  useEffect(() => {
    const id = setInterval(() => setAlertTick(t => t + 1), 10_000);
    return () => clearInterval(id);
  }, []);
  const alertRows = useMemo(() => {
    void alertTick;
    const now = Date.now();
    const set = new Set<string>();
    Object.entries(partialSince.current).forEach(([k, since]) => {
      if (now - since >= PARTIAL_ALERT_MS) set.add(k);
    });
    return set;
  }, [alertTick, status]);

  const mapping: Record<string, string> = detail?.frame?.mapping || {};
  const expectedTotal = Math.max(
    detail?.frame?.cables?.length ?? 0,
    detail?.frame?.cable_count ?? 0,
    detail?.assignment?.cables_total ?? 0,
  );
  const cables: Cable[] = useMemo(
    () => ensureCableList(detail?.frame?.cables, expectedTotal, mapping),
    [detail?.frame?.cables, expectedTotal, mapping],
  );
  const total = cables.length;
  const srcDone = Object.values(status).filter(s => s.src).length;
  const dstDone = Object.values(status).filter(s => s.dst).length;
  const donePairs = Object.values(status).filter(s => s.src && s.dst).length;
  const kpi = total > 0 ? Math.round(((srcDone + dstDone) / (total * 2)) * 100) : 0;
  const allDone = total > 0 && donePairs === total;
  const canWire = ['assigned', 'in_progress'].includes(panel?.status ?? '');
  const isPaused = panel?.status === 'paused';

  useEffect(() => {
    if (total <= 0) return;
    const pending = findNextPending(-1, total, status);
    setActiveIdx(pending ?? 0);
  }, [panel?.id, total]);

  const doCableAction = async (
    action: 'complete' | 'src_only' | 'dst_only',
    advance = true,
  ) => {
    if (!canWire || isPaused || saving) return;
    setSaving(true);
    const key = String(activeIdx);
    const prev = status[key] ?? DEFAULT_CABLE_STATUS;
    const next = { ...prev };
    if (action === 'complete') { next.src = true; next.dst = true; }
    if (action === 'src_only') next.src = true;
    if (action === 'dst_only') next.dst = true;
    const updated = { ...status, [key]: next };
    setStatus(updated);
    try {
      await techApi.cableAction(panel.id, activeIdx, action);
      emitWorkflowChanged({ scope: 'wiring', projectCode: panel.project_code, frameId: panel.id });
      onPanelUpdate();
      if (advance && activeIdx < total - 1) {
        setActiveIdx(activeIdx + 1);
      }
    } catch {
      setStatus(m => ({ ...m, [key]: prev }));
    } finally {
      setSaving(false);
    }
  };

  const handleStart = async () => {
    setSaving(true);
    try {
      await techApi.start(panel.id);
      emitWorkflowChanged({ scope: 'wiring', projectCode: panel.project_code, frameId: panel.id });
      setLiveFromPanel({
        status: 'in_progress',
        project_name: panel.project_name,
        project_code: panel.project_code,
        panel_name: panel.panel_name,
      });
      onPanelUpdate();
      load(false);
    } catch { /* show via parent refresh */ }
    finally { setSaving(false); }
  };

  const handleResume = async () => {
    const ok = await dialog.confirm({
      title: 'Resume wiring',
      message: `Resume wiring on ${panel.panel_name}?`,
      tone: 'save',
      confirmText: 'Resume',
    });
    if (!ok) return;
    setSaving(true);
    try {
      await techApi.resume(panel.id);
      emitWorkflowChanged({ scope: 'wiring', projectCode: panel.project_code, frameId: panel.id });
      onPanelUpdate();
    } catch { /* stay */ }
    finally { setSaving(false); }
  };

  const handleComplete = async () => {
    const ok = await dialog.confirm({
      title: 'Mark Frame Complete',
      message: `All ${total} cables done on ${panel.panel_name}. Mark as completed?`,
      tone: 'save',
      confirmText: 'Mark Complete',
    });
    if (!ok) return;
    setSaving(true);
    try {
      await techApi.complete(panel.id);
      emitWorkflowChanged({ scope: 'wiring', projectCode: panel.project_code, frameId: panel.id });
      onPanelUpdate();
      onExit?.();
    } catch { /* retry */ }
    finally { setSaving(false); }
  };

  const confirmPause = async (reason: string) => {
    const elapsed = (panel.total_wiring_seconds || 0) + (
      panel.status === 'in_progress' && panel.started_at
        ? Math.floor((Date.now() - new Date(panel.started_at).getTime()) / 1000)
        : 0
    );
    setSaving(true);
    try {
      await techApi.pause(panel.id, elapsed, reason);
      emitWorkflowChanged({ scope: 'wiring', projectCode: panel.project_code, frameId: panel.id });
      onPanelUpdate();
      setShowPause(false);
      onExit?.();
    } catch { /* stay */ }
    finally { setSaving(false); }
  };

  if (!detail) {
    return (
      <div className="dwf-workspace wiring-workstation dwf-workspace--loading" aria-busy={!loadError}>
        {loadError ? (
          <div className="dwf-workspace-state">
            <AlertTriangle size={32} className="text-red-500" />
            <p className="dwf-workspace-state-title">Could not load wiring schedule</p>
            <p className="dwf-workspace-state-detail">{loadError}</p>
            <div className="dwf-workspace-state-actions">
              <button type="button" className="btn-primary" onClick={() => load(true)}>Retry</button>
              <button type="button" className="btn-secondary" onClick={() => onExit?.()}>Back to panels</button>
            </div>
          </div>
        ) : (
          <div className="dwf-workspace-state">
            <div className="dwf-workspace-skeleton" aria-hidden="true">
              <div className="dwf-workspace-skel-bar" />
              {Array.from({ length: 4 }, (_, i) => <div key={i} className="dwf-workspace-skel-row" />)}
            </div>
            <p className="dwf-workspace-state-detail">Loading wiring schedule…</p>
          </div>
        )}
      </div>
    );
  }

  if (!detail.frame && (detail.assignment?.cables_total ?? 0) > 0) {
    return (
      <div className="dwf-workspace wiring-workstation dwf-workspace--loading">
        <div className="dwf-workspace-state">
          <AlertTriangle size={32} className="text-amber-500" />
          <p className="dwf-workspace-state-title">Wiring schedule file missing</p>
          <button type="button" className="btn-primary" onClick={() => onExit?.()}>Back to panels</button>
        </div>
      </div>
    );
  }

  const workspace = (
    <div
      ref={workspaceRef}
      className={`dwf-workspace wiring-workstation${tabletMode ? ' dwf-workspace--tablet-fullscreen' : ''}`}
      role="dialog"
      aria-modal={tabletMode ? 'true' : undefined}
      aria-label={`Digital Wiring View — ${panel.panel_name}`}
      data-testid="digital-wiring-workspace"
    >
      <header className={`dwf-workspace-header${tabletMode ? ' dwf-workspace-header--tablet' : ''}`}>
        <div className="dwf-workspace-header-main">
          {!tabletMode && (
            <button
              type="button"
              className="dwf-workspace-back"
              onClick={() => onExit?.()}
              aria-label="Back to panels"
            >
              <ArrowLeft size={18} />
              <span>Panels</span>
            </button>
          )}
          <div className="dwf-workspace-identity">
            <div className="dwf-workspace-kicker">Digital Wiring Execution</div>
            <div className="dwf-workspace-title">{panel.panel_name}</div>
            <div className="dwf-workspace-sub">
              {panel.project_name || panel.project_code}
              {panel.project_client ? ` · ${panel.project_client}` : ''}
            </div>
          </div>
        </div>
        <div className="dwf-workspace-metrics">
          <span className="dwf-pill dwf-pill-ok">{donePairs}/{total} complete</span>
          <span className="dwf-pill dwf-pill-kpi">{kpi}% progress</span>
          {panel.status === 'in_progress' && panel.started_at && (
            <LiveElapsed startedAt={panel.started_at} totalSecs={panel.total_wiring_seconds || 0} />
          )}
          {tabletMode ? (
            <button
              type="button"
              className="dwf-tablet-toggle dwf-tablet-toggle--exit"
              onClick={() => setTabletMode(false)}
              aria-label="Return to web view"
            >
              <LayoutPanelTop size={16} />
              <span>Return to Web View</span>
            </button>
          ) : (
            <button
              type="button"
              className="dwf-tablet-toggle"
              onClick={() => setTabletMode(true)}
              aria-label="Open tablet view"
            >
              <Maximize size={16} />
              <span>Tablet View</span>
            </button>
          )}
        </div>
      </header>

      <div className="dwf-workspace-progress" role="progressbar" aria-valuenow={kpi} aria-valuemin={0} aria-valuemax={100}>
        <div className="dwf-workspace-progress-fill" style={{ width: `${kpi}%` }} />
      </div>

      {isPaused && (
        <div className="ws-pause-banner">
          <PauseCircle size={16} />
          <span className="ws-pause-text">Paused{panel.pause_reason ? ` — ${panel.pause_reason}` : ''}</span>
          <button type="button" className="ws-pause-resume" onClick={handleResume} disabled={saving}>
            <Play size={14} /> Resume
          </button>
        </div>
      )}

      <div className={`dwf-action-bar${tabletMode ? ' dwf-action-bar--compact' : ''}`}>
        {panel.status === 'assigned' && (
          <button type="button" className="dwf-action-btn start" onClick={() => setShowAck(true)} disabled={saving}>
            <Play size={16} /> Start wiring
          </button>
        )}
        {panel.status === 'in_progress' && (
          <>
            <button type="button" className="dwf-action-btn pause" onClick={() => setShowPause(true)} disabled={saving}>
              <PauseCircle size={16} /> Pause
            </button>
            <button
              type="button"
              className="dwf-action-btn complete"
              onClick={handleComplete}
              disabled={saving || !allDone}
              title={allDone ? 'Mark frame complete' : 'Complete all cables first'}
            >
              <CheckCircle2 size={16} /> Complete project
            </button>
          </>
        )}
        <span className="dwf-action-meta">{srcDone}/{total} source · {dstDone}/{total} destination</span>
      </div>

      <div className="dwf-workspace-body">
        <DigitalWiringFrame
          cables={cables}
          status={status}
          canWire={canWire && !isPaused}
          alertRows={alertRows}
          activeIndex={activeIdx}
          onActiveIndexChange={setActiveIdx}
          onSkipNext={() => doCableAction('complete')}
          onSourceOpen={() => doCableAction('dst_only')}
          onDestinationOpen={() => doCableAction('src_only')}
          confirming={saving}
        />
      </div>

      {showPause && createPortal(
        <PauseReasonModal
          assignmentId={panel.id}
          onClose={() => !saving && setShowPause(false)}
          onConfirm={confirmPause}
          onMidChange={async (targetTechnicianId, reason) => {
            setSaving(true);
            try {
              await techApi.executeMidChange(panel.id, targetTechnicianId, reason);
              emitWorkflowChanged({ scope: 'wiring', projectCode: panel.project_code, frameId: panel.id });
              onPanelUpdate();
              setShowPause(false);
              onExit?.();
            } catch (e: any) {
              setToast(e?.response?.data?.message || 'Mid change failed');
            } finally {
              setSaving(false);
            }
          }}
          busy={saving}
        />,
        document.body,
      )}

      {showAck && (
        <AssignmentAcknowledgmentModal
          panel={panel}
          technicianName={user?.full_name || 'Technician'}
          onClose={() => !saving && setShowAck(false)}
          onAcknowledge={async () => {
            await handleStart();
            setShowAck(false);
          }}
          busy={saving}
        />
      )}

      {toast && (
        <Toast message={toast} tone="success" onDismiss={() => setToast(null)} />
      )}
    </div>
  );

  if (tabletMode) {
    return createPortal(
      <div className="dwf-tablet-root" role="dialog" aria-modal="true" aria-label="Tablet wiring view">
        {workspace}
      </div>,
      document.body,
    );
  }

  return workspace;
}
