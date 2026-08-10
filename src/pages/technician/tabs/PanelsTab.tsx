import { useEffect, useMemo, useState } from 'react';
import { DashboardIcon } from '../../../components/ui/DashboardIcon';
import WorkspaceSectionHeading from '../../../components/ui/WorkspaceSectionHeading';
import FieldGrid from '../../../components/ui/FieldGrid';
import type { WorkspaceInfoEmphasis } from '../../../components/ui/WorkspaceInfoMatrix';
import SubmitReportConfirmModal from '../../../components/technician/SubmitReportConfirmModal';
import DeleteConfirmModal, { type DeleteScopeId } from '../../../components/ui/DeleteConfirmModal';
import { techApi } from '../../../services/api';
import { emitWorkflowChanged } from '../../../utils/dwesRefreshEvents';
import { onFramesChanged } from '../../../utils/projectFramesEvents';
import { assignmentMatchesDeletion } from '../../../utils/entityConsistency';
import {
  NO_PANEL_WORK_ASSIGNED_COPY,
  NO_PANEL_WORK_ASSIGNED_TITLE,
} from '../../../constants/twinMessaging';

interface PanelsTabProps {
  panels: any[];
  loading?: boolean;
  onRefresh: () => void;
  selectedPanel: any | null;
  onSelectPanel: (panel: any) => void;
}

/** Active assignment row from live `myPanels` data (same rules as the dashboard). */
export function resolveActiveAssignment(panels: any[], selectedPanel: any | null) {
  if (!panels.length) return null;
  const isWorkable = (p: any) => {
    const st = String(p?.status ?? '').toLowerCase().replace(/[\s_-]+/g, '');
    return st === 'assigned' || st === 'inprogress' || st === 'paused' || st === 'started';
  };
  if (selectedPanel && isWorkable(selectedPanel)) {
    const match = panels.find(panel => panel.id === selectedPanel.id);
    if (match && isWorkable(match)) return match;
  }
  const active = panels.find(isWorkable);
  if (active) return active;
  return selectedPanel ?? panels[0] ?? null;
}

/** Embed Digital Wiring Schedule automatically for workable assignment states. */
export function shouldEmbedDigitalWiringSchedule(panel: any | null): boolean {
  if (!panel) return false;
  const st = String(panel.status ?? '').toLowerCase().replace(/[\s_-]+/g, '');
  return st === 'assigned' || st === 'inprogress' || st === 'paused' || st === 'started';
}

export function TechnicianMidChangeBanner({
  saving,
  onResume,
}: {
  saving: boolean;
  onResume: (assignmentId: number) => void;
}) {
  const [midChangeRequests, setMidChangeRequests] = useState<any[]>([]);

  useEffect(() => {
    const refresh = () => {
      techApi.midChangeRequests()
        .then(rows => setMidChangeRequests(Array.isArray(rows) ? rows : []))
        .catch(() => {});
    };
    refresh();
    const timer = window.setInterval(refresh, 12_000);
    return () => window.clearInterval(timer);
  }, []);

  const incomingMidChange = midChangeRequests.find(request => request.direction === 'incoming');
  if (!incomingMidChange) return null;

  return (
    <div className="tech-midchange-notice mb-4" role="status">
      <DashboardIcon name="mid_change" size={16} className="shrink-0" />
      <span className="min-w-0 flex-1">
        <strong>Mid Change panel assigned</strong> — {incomingMidChange.initiator_name} transferred{' '}
        <strong>{incomingMidChange.target?.panel_name || 'a panel'}</strong> to you.
      </span>
      <button
        type="button"
        className="btn-primary shrink-0"
        disabled={saving}
        onClick={() => onResume(incomingMidChange.target.id)}
      >
        {saving ? 'Resuming…' : 'Resume Wiring'}
      </button>
    </div>
  );
}


const NO_PANEL_WORK_TITLE = NO_PANEL_WORK_ASSIGNED_TITLE;
const NO_PANEL_WORK_COPY = NO_PANEL_WORK_ASSIGNED_COPY;

function statusLabel(st: string): { label: string; tone: 'done' | 'progress' | 'idle' } {
  if (st === 'completed') return { label: 'Completed', tone: 'done' };
  if (st === 'in_progress') return { label: 'In Progress', tone: 'progress' };
  if (st === 'paused') return { label: 'Paused', tone: 'progress' };
  if (st === 'assigned') return { label: 'Not Started', tone: 'idle' };
  return { label: st.replace(/_/g, ' '), tone: 'idle' };
}

function panelProgress(panel: any) {
  const total = panel.cables_total || 0;
  const pairsDone = total > 0
    ? Math.min(total, Math.floor(((panel.cables_src_done || 0) + (panel.cables_dst_done || 0)) / 2))
    : 0;
  const kpiPct = panel.kpi ?? (total > 0 ? Math.round((pairsDone / total) * 100) : 0);
  return { kpiPct, pairsDone, total };
}

function formatAssignDateTime(value?: string | null): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat(undefined, {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  }).format(date);
}

/**
 * Current Assignment — single authoritative card for the active panel.
 * Project + panel names are the primary hierarchy; essential details follow.
 */
function CurrentAssignmentCard({
  panel,
  saving,
  onComplete,
  onSubmitReport,
  onHideCompleted,
}: {
  panel: any;
  saving: boolean;
  onComplete: (panel: any) => void;
  onSubmitReport: (panel: any) => void;
  onHideCompleted: (panel: any) => void;
}) {
  const status = statusLabel(panel.status ?? '');
  const { kpiPct, pairsDone, total } = panelProgress(panel);
  const remaining = Math.max(0, total - pairsDone);
  const isMidChange = Boolean(panel.handover_from_id);
  const allCablesDone = total > 0
    && (panel.cables_src_done || 0) >= total
    && (panel.cables_dst_done || 0) >= total;
  const st = panel.status;
  const projectName = panel.project_name || panel.project_code || '—';
  const panelName = panel.panel_name || '—';

  const fields: Array<{
    label: string;
    value: string | number;
    emphasis?: WorkspaceInfoEmphasis;
    hide?: boolean;
  }> = [
    { label: 'Panel type', value: panel.panel_type || '', hide: !panel.panel_type },
    { label: 'Voltage', value: panel.voltage_level || '', hide: !panel.voltage_level },
    { label: 'Client', value: panel.project_client || '', hide: !panel.project_client },
    { label: 'Assigned', value: formatAssignDateTime(panel.assigned_at), emphasis: 'meta' as const },
    { label: 'Completed', value: String(pairsDone), hide: total <= 0 },
    { label: 'Remaining', value: String(remaining), hide: total <= 0 },
    { label: 'Total cables', value: String(total), hide: total <= 0 },
    { label: 'Progress', value: `${kpiPct}%`, emphasis: 'primary' as const, hide: total <= 0 },
    { label: 'State', value: status.label },
  ].filter(f => !f.hide);

  return (
    <section className="tech-assignment-card mb-4" aria-label="Current assignment">
      <WorkspaceSectionHeading
        variant="secondary"
        title="Current Assignment"
        subtitle="Active panel details and live progress."
        icon={<DashboardIcon name="assignment" size={16} />}
        actions={(
          <div className="tech-assignment-badges">
            {isMidChange && (
              <span className="tech-assignment-midchange" title="This panel was transferred to you via Mid Change">
                <DashboardIcon name="mid_change" size={12} /> Mid Change
              </span>
            )}
            <span className={`tech-panel-status tech-panel-status--${status.tone}`}>{status.label}</span>
          </div>
        )}
      />

      <div className="tech-assignment-hero">
        <p className="tech-assignment-hero-project dw-wim-title-primary" title={projectName}>{projectName}</p>
        <p className="tech-assignment-hero-panel dw-wim-title-secondary" title={panelName}>{panelName}</p>
      </div>

      <FieldGrid
        columns={4}
        fields={fields.map(f => ({
          label: f.label,
          value: f.value,
          emphasis: f.emphasis,
          title: String(f.value ?? ''),
        }))}
      />

      <div className="tech-assignment-progress-row">
        <div className="tech-panel-card-bar">
          <div
            className={`tech-panel-card-bar-fill${allCablesDone ? ' is-done' : ''}`}
            style={{ width: `${kpiPct}%` }}
          />
        </div>
        <span className="tech-panel-card-pct tabular-nums dw-wim-value dw-wim-value--primary">{kpiPct}%</span>
      </div>

      {panel.status === 'paused' && panel.pause_reason && (
        <p className="tech-assignment-pause">Paused — {panel.pause_reason}</p>
      )}

      {(st === 'in_progress' || st === 'completed') && (
        <div className="tech-assignment-actions">
          {st === 'in_progress' && (
            <button
              type="button"
              className="btn-secondary tech-panel-entry-btn"
              onClick={() => onComplete(panel)}
              disabled={saving || !allCablesDone}
              title={allCablesDone ? 'Submit completion report' : 'Complete all cables first'}
            >
              <DashboardIcon name="complete" size={16} />
              Complete project
            </button>
          )}
          {st === 'completed' && (
            <>
              {panel.report_submitted ? (
                <span className="tech-panel-report-sent">
                  <DashboardIcon name="complete" size={14} /> Report sent
                </span>
              ) : (
                <button
                  type="button"
                  className="btn-secondary tech-panel-entry-btn dwes-report-action-btn"
                  onClick={() => onSubmitReport(panel)}
                  disabled={saving}
                >
                  <DashboardIcon name="history" size={16} />
                  View Report
                </button>
              )}
              <button
                type="button"
                className="btn-secondary tech-panel-entry-btn text-red-700 border-red-200"
                onClick={() => onHideCompleted(panel)}
                disabled={saving}
              >
                <DashboardIcon name="delete" size={14} />
                Delete
              </button>
            </>
          )}
        </div>
      )}
    </section>
  );
}

export default function PanelsTab({
  panels,
  loading = false,
  onRefresh,
  selectedPanel,
}: PanelsTabProps) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [submitPanel, setSubmitPanel] = useState<any | null>(null);
  const [hideTarget, setHideTarget] = useState<any | null>(null);

  /** Active assignment only — must exist in the current server-backed panels list. */
  const activeAssignment = useMemo(
    () => resolveActiveAssignment(panels, selectedPanel),
    [panels, selectedPanel],
  );
  const hasAssignment = Boolean(activeAssignment);

  useEffect(() => onFramesChanged(detail => {
    if (detail.action !== 'deleted') return;
    const target = activeAssignment;
    if (target && assignmentMatchesDeletion(target, detail)) {
      setSubmitPanel(null);
      setHideTarget(null);
    }
  }), [activeAssignment]);

  const confirmComplete = async (panel: any) => {
    setSaving(true);
    setError('');
    try {
      if (panel.status === 'in_progress') {
        await techApi.complete(panel.id);
        emitWorkflowChanged({ scope: 'wiring', projectCode: panel.project_code, frameId: panel.id });
        onRefresh();
      }
      setSubmitPanel({ ...panel, status: 'completed' });
    } catch (e: any) {
      setError(e?.response?.data?.message || 'Could not complete panel');
    } finally {
      setSaving(false);
    }
  };

  const handleResumeMidChange = async (assignmentId: number) => {
    setSaving(true);
    setError('');
    try {
      await techApi.start(assignmentId);
      onRefresh();
    } catch (e: any) {
      setError(e?.response?.data?.message || 'Could not resume mid change assignment');
    } finally {
      setSaving(false);
    }
  };

  const confirmSubmitReport = async (notes: string) => {
    if (!submitPanel) return;
    setSaving(true);
    setError('');
    try {
      await techApi.submitReport(submitPanel.id, notes);
      emitWorkflowChanged({ scope: 'general', projectCode: submitPanel.project_code, frameId: submitPanel.id });
      setSubmitPanel(null);
      onRefresh();
    } catch (e: any) {
      setError(e?.response?.data?.message || 'Could not submit report');
    } finally {
      setSaving(false);
    }
  };

  const confirmHideCompleted = async (_scope: DeleteScopeId) => {
    if (!hideTarget) return;
    setSaving(true);
    setError('');
    try {
      await techApi.hide(hideTarget.id);
      setHideTarget(null);
      onRefresh();
    } catch (e: any) {
      setError(e?.response?.data?.message || 'Could not delete record');
    } finally {
      setSaving(false);
    }
  };

  if (loading && panels.length === 0) {
    return (
      <div className="tech-no-assignment" role="status" aria-busy="true">
        <p className="tech-no-assignment-title">{NO_PANEL_WORK_TITLE}</p>
        <p className="tech-no-assignment-copy">Checking for active assignments…</p>
      </div>
    );
  }

  return (
    <div>
      {error && <div className="form-error mb-2">{error}</div>}

      {/* Mid Change is initiated from the Pause popup inside the wiring workstation.
          This strip surfaces incoming Mid Change transfers so the receiving technician can resume. */}
      <TechnicianMidChangeBanner saving={saving} onResume={handleResumeMidChange} />

      {hasAssignment && activeAssignment ? (
        <CurrentAssignmentCard
          panel={activeAssignment}
          saving={saving}
          onComplete={confirmComplete}
          onSubmitReport={setSubmitPanel}
          onHideCompleted={setHideTarget}
        />
      ) : (
        <div className="tech-no-assignment" role="status">
          <p className="tech-no-assignment-title">{NO_PANEL_WORK_TITLE}</p>
          <p className="tech-no-assignment-copy">{NO_PANEL_WORK_COPY}</p>
        </div>
      )}

      {submitPanel && (
        <SubmitReportConfirmModal
          panelName={submitPanel.panel_name}
          onClose={() => !saving && setSubmitPanel(null)}
          onSubmit={confirmSubmitReport}
          submitting={saving}
        />
      )}

      {hideTarget && (
        <DeleteConfirmModal
          title="Remove from dashboard"
          subtitle="Hides the completed card — wiring progress stays."
          resourceKind="completed_record"
          itemLabel={hideTarget.panel_name}
          parentProject={{
            code: hideTarget.project_code || '—',
            name: hideTarget.project_name || hideTarget.project_code || '—',
          }}
          sections={[
            {
              id: 'removed',
              title: 'Removed from your list',
              icon: 'users',
              badge: 'UI only',
              items: [
                `Completed card for “${hideTarget.panel_name}”`,
                'No longer shown on your technician dashboard',
              ],
            },
            {
              id: 'retained',
              title: 'Preserved in the system',
              icon: 'shield',
              badge: 'kept',
              items: [
                'Wiring progress and cable completion data',
                'Supervisor / QA records for this panel',
              ],
            },
          ]}
          scopes={[
            {
              id: 'item_only',
              label: 'Hide selected completed card only',
              description: 'Does not delete panel wiring history or project files.',
            },
          ]}
          defaultScope="item_only"
          backup={{
            status: 'skipped',
            note: 'This only hides the card from your list — no database wipe or file backup.',
          }}
          irreversible={false}
          warningTitle="Not a permanent data delete"
          warningText={`Remove “${hideTarget.panel_name}” from your dashboard? Wiring progress is kept in the system.`}
          confirmCheckboxLabel={`I understand this only hides “${hideTarget.panel_name}” from my list.`}
          confirmButtonLabel="Remove from List"
          deleting={saving}
          error={error}
          onClose={() => { if (!saving) setHideTarget(null); }}
          onConfirm={confirmHideCompleted}
        />
      )}
    </div>
  );
}
