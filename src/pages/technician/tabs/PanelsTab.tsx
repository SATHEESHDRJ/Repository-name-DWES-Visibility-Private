import { useMemo, useState, type CSSProperties } from 'react';
import { ArrowLeftRight, Cable, ClipboardCheck, FileText, LayoutGrid, Trash2 } from '../../../components/ui/icons';
import PanelGaDrawingModal from '../../../components/ui/PanelGaDrawingModal';
import SubmitReportConfirmModal from '../../../components/technician/SubmitReportConfirmModal';
import TechnicianMidChangeModal from '../../../components/technician/TechnicianMidChangeModal';
import DeleteConfirmModal, { type DeleteScopeId } from '../../../components/ui/DeleteConfirmModal';
import { techApi } from '../../../services/api';
import { emitWorkflowChanged } from '../../../utils/dwesRefreshEvents';

interface PanelsTabProps {
  panels: any[];
  loading?: boolean;
  onRefresh: () => void;
  selectedPanel: any | null;
  onSelectPanel: (panel: any) => void;
  onOpenDigitalWiring: (panel: any) => void;
}

const AWAITING_ASSIGNMENT = 'Awaiting supervisor assignment.';

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
  const srcPct = total > 0 ? Math.round((panel.cables_src_done / total) * 100) : 0;
  const dstPct = total > 0 ? Math.round((panel.cables_dst_done / total) * 100) : 0;
  const kpiPct = panel.kpi ?? (total > 0 ? Math.round((pairsDone / total) * 100) : 0);
  return { srcPct, dstPct, kpiPct, pairsDone, total };
}

export default function PanelsTab({
  panels,
  loading = false,
  onRefresh,
  selectedPanel,
  onSelectPanel,
  onOpenDigitalWiring,
}: PanelsTabProps) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [submitPanel, setSubmitPanel] = useState<any | null>(null);
  const [hideTarget, setHideTarget] = useState<any | null>(null);
  const [gaOpen, setGaOpen] = useState(false);
  const [midChangeOpen, setMidChangeOpen] = useState(false);

  const hasAssignment = panels.length > 0;
  const headerPanel = selectedPanel;

  const gaTarget = useMemo(() => headerPanel || null, [headerPanel]);

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

  const handleDeleteCompleted = (panel: any) => {
    setHideTarget(panel);
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
    return <div className="empty-state"><p className="empty-text">Loading panels…</p></div>;
  }

  return (
    <div>
      {error && <div className="form-error mb-2">{error}</div>}

      <div className="tech-dash-actions mb-4" role="group" aria-label="Panel actions">
        <button
          type="button"
          className="btn-primary tech-dash-action-btn"
          disabled={!panels.some(panel => panel.status === 'in_progress')}
          title={panels.some(panel => panel.status === 'in_progress')
            ? 'Request or confirm an interchange with another active technician'
            : 'Start a panel before using Mid Change'}
          onClick={() => setMidChangeOpen(true)}
        >
          <ArrowLeftRight size={16} />
          Mid Change
        </button>
        <button
          type="button"
          className="btn-secondary tech-dash-action-btn"
          disabled={!hasAssignment}
          title={hasAssignment ? 'Open digital wiring for the selected panel' : AWAITING_ASSIGNMENT}
          aria-label={hasAssignment ? 'Digital Wiring Monitor' : AWAITING_ASSIGNMENT}
          onClick={() => {
            const panel = headerPanel ?? panels[0];
            if (panel) onOpenDigitalWiring(panel);
          }}
        >
          <Cable size={16} />
          Digital Wiring Monitor
        </button>
        <button
          type="button"
          className="btn-secondary tech-dash-action-btn"
          disabled={!hasAssignment || !gaTarget}
          title={!hasAssignment ? AWAITING_ASSIGNMENT : !gaTarget ? 'Select a panel first' : 'Open the selected panel drawing viewer'}
          aria-label={!hasAssignment ? AWAITING_ASSIGNMENT : '3D GA / 2D Drawing View'}
          onClick={() => gaTarget && setGaOpen(true)}
        >
          <FileText size={16} />
          3D GA / 2D Drawing View
        </button>
      </div>

      {!hasAssignment && (
        <div className="empty-state mb-4">
          <p className="text-base font-semibold text-slate-700">No panels assigned</p>
          <p className="empty-text">A supervisor must assign a panel before you can start wiring.</p>
        </div>
      )}

      {hasAssignment && (
        <>
          <div className="flex items-center gap-2 mb-4">
            <LayoutGrid size={18} className="text-orange-500" />
            <h2 className="text-[15px] font-bold text-slate-800">My Assigned Panels</h2>
          </div>

          <ul className="tech-panel-list" role="list">
            {panels.map(panel => {
              const { kpiPct, pairsDone, total } = panelProgress(panel);
              const isSelected = selectedPanel?.id === panel.id;
              const st = panel.status;
              const projectLabel = panel.project_name || panel.project_code;
              const status = statusLabel(st);
              const allCablesDone = total > 0
                && (panel.cables_src_done || 0) >= total
                && (panel.cables_dst_done || 0) >= total;

              return (
                <li
                  key={panel.id}
                  className={`tech-panel-card${isSelected ? ' tech-panel-card--active' : ''} tech-panel-card--${status.tone}`}
                  style={{ '--panel-progress': `${kpiPct}%` } as CSSProperties}
                >
                  <button
                    type="button"
                    className="tech-panel-card-select"
                    onClick={() => onSelectPanel(panel)}
                    aria-pressed={isSelected}
                  >
                    <div className="tech-panel-card-main min-w-0 text-left w-full">
                      <div className="flex flex-wrap items-center gap-2 mb-1.5">
                        <span className="tech-panel-card-name">{panel.panel_name}</span>
                        <span className={`tech-panel-status tech-panel-status--${status.tone}`}>
                          {status.label}
                        </span>
                      </div>
                      <p className="tech-panel-card-project truncate">{projectLabel}</p>
                      <div className="tech-panel-card-progress-row">
                        <div className="tech-panel-card-bar">
                          <div
                            className={`tech-panel-card-bar-fill${allCablesDone ? ' is-done' : ''}`}
                            style={{ width: `${kpiPct}%` }}
                          />
                        </div>
                        <span className="tech-panel-card-pct tabular-nums">{kpiPct}%</span>
                      </div>
                      <p className="tech-panel-card-counts">
                        {pairsDone}/{total} cables complete
                        {' · '}
                        {panel.cables_src_done}/{total} src · {panel.cables_dst_done}/{total} dst
                      </p>
                    </div>
                  </button>

                  <div className="tech-panel-card-actions">
                    {st === 'in_progress' && (
                      <button
                        type="button"
                        className="btn-secondary tech-panel-entry-btn"
                        onClick={() => confirmComplete(panel)}
                        disabled={saving || !allCablesDone}
                        title={allCablesDone ? 'Submit completion report' : 'Complete all cables first'}
                      >
                        <ClipboardCheck size={16} />
                        Complete project
                      </button>
                    )}
                    {st === 'completed' && (
                      <>
                        {panel.report_submitted ? (
                          <span className="tech-panel-report-sent">
                            <ClipboardCheck size={14} /> Report sent
                          </span>
                        ) : (
                          <button
                            type="button"
                            className="btn-secondary tech-panel-entry-btn"
                            onClick={() => setSubmitPanel(panel)}
                            disabled={saving}
                          >
                            <FileText size={16} />
                            Report
                          </button>
                        )}
                        <button
                          type="button"
                          className="btn-secondary tech-panel-entry-btn text-red-700 border-red-200"
                          onClick={() => handleDeleteCompleted(panel)}
                          disabled={saving}
                        >
                          <Trash2 size={14} />
                          Delete
                        </button>
                      </>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </>
      )}

      {submitPanel && (
        <SubmitReportConfirmModal
          panelName={submitPanel.panel_name}
          onClose={() => !saving && setSubmitPanel(null)}
          onSubmit={confirmSubmitReport}
          submitting={saving}
        />
      )}

      {gaOpen && gaTarget && (
        <PanelGaDrawingModal
          projectCode={gaTarget.project_code}
          frameId={gaTarget.frame_id}
          panelName={gaTarget.panel_name}
          projectName={gaTarget.project_name || gaTarget.project_code}
          onClose={() => setGaOpen(false)}
        />
      )}

      {midChangeOpen && (
        <TechnicianMidChangeModal
          onClose={() => setMidChangeOpen(false)}
          onChanged={() => {
            onRefresh();
          }}
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
