import { useCallback, useEffect, useMemo, useState } from 'react';
import Modal from '../Modal';
import { useAppDialog } from '../AppDialogProvider';
import { projectsApi, supervisorApi, techApi, usersApi } from '../../services/api';
import { emitFramesChanged } from '../../utils/projectFramesEvents';
import Toast from '../ui/Toast';
import {
  CHANGEOVER_REASONS,
  type ChangeoverAssignment,
  type ChangeoverReason,
} from '../assignment/MidChangeoverModal';
import DuplicatePanelWarning from './DuplicatePanelWarning';
import { usePanelDuplicateGuard } from '../../hooks/usePanelDuplicateGuard';
import {
  ArrowLeftRight, ArrowRight, RefreshCw,
  TriangleAlert, UserMinus, UserPlus, Building2, LayoutGrid,
} from '../ui/icons';

export type TechnicianWorkflowSection = 'assign' | 'deassign' | 'changeover';

export interface TechnicianWorkflowModalProps {
  onClose: () => void;
  initialSection?: TechnicianWorkflowSection;
  projectCode: string;
  panelId: string;
  projectName: string;
  panelName: string;
  cableCount?: number;
}

const SECTIONS: { key: TechnicianWorkflowSection; label: string; icon: typeof UserPlus }[] = [
  { key: 'assign', label: 'Assign', icon: UserPlus },
  { key: 'deassign', label: 'De-assign', icon: UserMinus },
  { key: 'changeover', label: 'Mid Changeover', icon: ArrowLeftRight },
];

type WorkflowStatus = 'unassigned' | 'assigned' | 'in_progress' | 'paused' | 'completed' | 'changeover';

const STATUS_META: Record<WorkflowStatus, { label: string; chip: string }> = {
  unassigned: { label: 'Unassigned', chip: 'twf-status--idle' },
  assigned: { label: 'Assigned', chip: 'twf-status--assigned' },
  in_progress: { label: 'In Progress', chip: 'twf-status--progress' },
  paused: { label: 'Paused', chip: 'twf-status--paused' },
  completed: { label: 'Completed', chip: 'twf-status--done' },
  changeover: { label: 'Changeover Eligible', chip: 'twf-status--changeover' },
};

function resolveWorkflowStatus(
  assignment: any | null,
  changeoverEligible: boolean,
): WorkflowStatus {
  if (!assignment) return 'unassigned';
  if (changeoverEligible && (assignment.status === 'in_progress' || assignment.status === 'paused')) {
    return 'changeover';
  }
  const s = String(assignment.status || 'assigned');
  if (s === 'in_progress') return 'in_progress';
  if (s === 'paused') return 'paused';
  if (s === 'completed') return 'completed';
  return 'assigned';
}

function toChangeoverAssignment(row: any): ChangeoverAssignment {
  return {
    id: row.id,
    project_code: row.project_code,
    frame_id: row.frame_id,
    panel_name: row.panel_name,
    status: row.status,
    technician_id: row.technician_id,
    technician_name: row.technician_name,
    completed_cables: row.completed_cables,
    remaining_cables: row.remaining_cables,
    cables_total: row.total_cables ?? row.cables_total,
    pause_reason: row.pause_reason,
  };
}

export default function TechnicianWorkflowModal({
  onClose,
  initialSection = 'assign',
  projectCode,
  panelId,
  projectName,
  panelName,
  cableCount = 0,
}: TechnicianWorkflowModalProps) {
  const dialog = useAppDialog();
  const [section, setSection] = useState<TechnicianWorkflowSection>(initialSection);
  const [toast, setToast] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const [frameCableCount, setFrameCableCount] = useState(cableCount);
  const [projectPanels, setProjectPanels] = useState<{ id: string; panel_name: string }[]>([]);
  const [assignment, setAssignment] = useState<any | null>(null);
  const [changeoverRow, setChangeoverRow] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);

  const [techs, setTechs] = useState<any[]>([]);
  const [selTech, setSelTech] = useState('');
  const [assignSaving, setAssignSaving] = useState(false);
  const [assignError, setAssignError] = useState('');

  const [changeoverTech, setChangeoverTech] = useState('');
  const [changeoverReason, setChangeoverReason] = useState<ChangeoverReason | ''>('');
  const [changeoverNotes, setChangeoverNotes] = useState('');
  const [changeoverSaving, setChangeoverSaving] = useState(false);
  const [changeoverError, setChangeoverError] = useState('');

  useEffect(() => { setSection(initialSection); }, [initialSection]);

  useEffect(() => {
    usersApi.technicians()
      .then(list => setTechs((list || []).filter((t: any) => t.is_active !== false)))
      .catch(() => {});
  }, []);

  const loadContext = useCallback(() => {
    setLoading(true);
    Promise.all([
      projectsApi.frames(projectCode).catch(() => []),
      supervisorApi.allPanels().catch(() => []),
      supervisorApi.pendingChangeovers().catch(() => []),
    ]).then(([frames, allPanels, changeovers]) => {
      setProjectPanels((frames as any[]).map(f => ({ id: f.id, panel_name: f.panel_name })));
      const frame = (frames as any[]).find(f => f.id === panelId);
      if (frame?.cable_count != null) setFrameCableCount(frame.cable_count);

      const panelAssignment = (allPanels as any[]).find(
        a => a.project_code === projectCode && a.frame_id === panelId,
      );
      setAssignment(panelAssignment ?? null);

      const co = (changeovers as any[]).find(
        p => p.project_code === projectCode && p.frame_id === panelId,
      );
      setChangeoverRow(co ?? null);
    }).finally(() => setLoading(false));
  }, [projectCode, panelId]);

  useEffect(() => { loadContext(); }, [loadContext, refreshKey]);

  const scheduleReady = frameCableCount > 0;
  const duplicateGuard = usePanelDuplicateGuard(projectPanels, panelId, panelName);
  const workflowBlocked = duplicateGuard.blocked;
  const changeoverEligible = Boolean(changeoverRow);
  const workflowStatus = resolveWorkflowStatus(assignment, changeoverEligible);
  const statusMeta = STATUS_META[workflowStatus];
  const canAssign = !assignment && scheduleReady && !workflowBlocked;
  const canDeassign = assignment?.status === 'assigned' && !workflowBlocked;
  const canChangeover = changeoverEligible && changeoverRow && !workflowBlocked;

  const changeoverTarget = useMemo(
    () => (changeoverRow ? toChangeoverAssignment(changeoverRow) : null),
    [changeoverRow],
  );

  useEffect(() => {
    if (section === 'changeover' && changeoverTarget) {
      setChangeoverTech('');
      setChangeoverReason('');
      setChangeoverNotes('');
      setChangeoverError('');
    }
  }, [section, changeoverTarget]);

  const bumpRefresh = () => setRefreshKey(k => k + 1);

  const handleAssign = async () => {
    if (!selTech || !canAssign) return;
    setAssignSaving(true);
    setAssignError('');
    try {
      await supervisorApi.assignFrame({
        project_code: projectCode,
        frame_id: panelId,
        technician_id: parseInt(selTech, 10),
      });
      setSelTech('');
      setToast('Technician assigned');
      emitFramesChanged({ projectCode, frameId: panelId, action: 'updated' });
      bumpRefresh();
      setSection('deassign');
    } catch (e: any) {
      setAssignError(e?.response?.data?.message || 'Assignment failed');
    } finally {
      setAssignSaving(false);
    }
  };

  const handleDeassign = async () => {
    if (!assignment?.id || !canDeassign) return;
    const ok = await dialog.confirm({
      title: 'De-assign technician',
      message: `Remove ${assignment.technician_name} from ${panelName}?`,
      tone: 'delete',
      confirmText: 'De-assign',
    });
    if (!ok) return;
    await techApi.delete(assignment.id).catch(() => {});
    setToast('Assignment removed');
    emitFramesChanged({ projectCode, frameId: panelId, action: 'updated' });
    bumpRefresh();
    setSection('assign');
  };

  const handleChangeover = async () => {
    if (!changeoverTarget || !changeoverTech || !changeoverReason) {
      setChangeoverError('Select replacement technician and reason');
      return;
    }
    setChangeoverSaving(true);
    setChangeoverError('');
    try {
      await supervisorApi.midChangeover({
        old_assignment_id: changeoverTarget.id,
        new_technician_id: parseInt(changeoverTech, 10),
        changeover_reason: changeoverReason,
        reason_notes: changeoverNotes.trim() || undefined,
      });
      setToast('Mid-changeover completed');
      emitFramesChanged({ projectCode, frameId: panelId, action: 'updated' });
      bumpRefresh();
      setSection('deassign');
    } catch (e: any) {
      setChangeoverError(e?.response?.data?.message || 'Changeover failed');
    } finally {
      setChangeoverSaving(false);
    }
  };

  return (
    <Modal
      title="Technician Workflow"
      subtitle={`${panelName} · ${projectCode}`}
      onClose={onClose}
      size="lg"
      bodyClassName="modal-body-flush"
    >
      <div className="tech-workflow tech-workflow--premium tech-workflow--scoped">
        <div className="tech-workflow-top">
          <div className="tech-workflow-segments" role="tablist" aria-label="Workflow actions">
            {SECTIONS.map(({ key, label, icon: Icon }) => (
              <button
                key={key}
                type="button"
                role="tab"
                aria-selected={section === key}
                className={`tech-workflow-segment ${section === key ? 'is-active' : ''}`}
                onClick={() => setSection(key)}
              >
                <Icon size={16} strokeWidth={1.5} />
                <span>{label}</span>
              </button>
            ))}
          </div>
          <button type="button" className="twf-refresh-btn" onClick={bumpRefresh} title="Refresh status">
            <RefreshCw size={15} />
          </button>
        </div>

        <PanelContextCard
          loading={loading}
          projectName={projectName}
          projectCode={projectCode}
          panelName={panelName}
          cableCount={frameCableCount}
          assignment={assignment}
          statusMeta={statusMeta}
          workflowStatus={workflowStatus}
        />

        {workflowBlocked && (
          <DuplicatePanelWarning
            panels={projectPanels}
            selectedPanelId={panelId}
            className="mx-4 mb-2"
          />
        )}

        <div className="tech-workflow-content">
          {section === 'assign' && (
            <div className="tech-workflow-pane tech-workflow-pane--compact">
              {!scheduleReady && !workflowBlocked && (
                <div className="tech-workflow-hint is-warn">
                  <TriangleAlert size={15} className="shrink-0" />
                  <span>Upload a wiring schedule for this panel before assigning a technician.</span>
                </div>
              )}
              {workflowBlocked && (
                <div className="tech-workflow-hint is-warn">
                  <TriangleAlert size={15} className="shrink-0" />
                  <span>{duplicateGuard.message}</span>
                </div>
              )}
              {assignment && !workflowBlocked && (
                <div className="tech-workflow-hint is-info">
                  <span>
                    Panel is assigned to <strong>{assignment.technician_name}</strong>.
                    De-assign first to reassign, or use Mid Changeover if work is in progress.
                  </span>
                </div>
              )}
              {canAssign && (
                <>
                  <label className="tech-workflow-field" htmlFor="twf-tech">
                    <span className="tech-workflow-field-label">Technician</span>
                    <select
                      id="twf-tech"
                      className="form-select"
                      value={selTech}
                      onChange={e => { setSelTech(e.target.value); setAssignError(''); }}
                    >
                      <option value="">Select technician…</option>
                      {techs.map(t => (
                        <option key={t.id} value={t.id}>
                          {t.full_name} · @{t.username}
                        </option>
                      ))}
                    </select>
                  </label>
                  {assignError && <div className="form-error">{assignError}</div>}
                  <div className="tech-workflow-pane-actions">
                    <button
                      type="button"
                      className="btn-primary"
                      disabled={!selTech || assignSaving}
                      onClick={() => void handleAssign()}
                    >
                      {assignSaving ? 'Assigning…' : 'Assign technician'}
                    </button>
                  </div>
                </>
              )}
            </div>
          )}

          {section === 'deassign' && (
            <div className="tech-workflow-pane tech-workflow-pane--compact">
              {!assignment && (
                <p className="tech-workflow-empty">No technician assigned to this panel.</p>
              )}
              {assignment && (
                <article className="twf-assignment-card">
                  <div className="twf-assignment-top">
                    <div className="min-w-0">
                      <div className="twf-assignment-tech">{assignment.technician_name}</div>
                      <div className="twf-assignment-sub">@{assignment.technician_username || 'technician'}</div>
                    </div>
                    <span className={`twf-status-badge ${statusMeta.chip}`}>{statusMeta.label}</span>
                  </div>
                  {(assignment.cables_total ?? 0) > 0 && (
                    <>
                      <progress className="ops-assignment-progress twf-progress" value={assignment.kpi ?? 0} max={100} />
                      <div className="twf-assignment-metrics">
                        <span>{assignment.kpi ?? 0}% complete</span>
                        <span>{assignment.cables_src_done ?? 0}/{assignment.cables_total} src</span>
                        <span>{assignment.cables_dst_done ?? 0}/{assignment.cables_total} dst</span>
                      </div>
                    </>
                  )}
                  {canDeassign ? (
                    <button type="button" className="twf-deassign-btn" onClick={() => void handleDeassign()}>
                      <UserMinus size={15} />
                      De-assign technician
                    </button>
                  ) : (
                    <p className="twf-hint-inline">
                      De-assign is only available while status is <strong>Assigned</strong> (before wiring starts).
                    </p>
                  )}
                </article>
              )}
            </div>
          )}

          {section === 'changeover' && (
            <div className="tech-workflow-pane tech-workflow-pane--compact">
              {!canChangeover && (
                <p className="tech-workflow-empty">
                  This panel is not eligible for mid-changeover. Panel must be in progress or paused with partial work.
                </p>
              )}
              {canChangeover && changeoverTarget && (
                <>
                  <div className="tech-workflow-handoff-summary">
                    <div className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Current technician</div>
                    <div className="font-semibold text-slate-900">{changeoverTarget.technician_name}</div>
                    <ArrowRight size={12} className="text-slate-400 my-1" />
                    <div className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Progress</div>
                    <div className="text-[13px] font-semibold text-slate-800">
                      {changeoverTarget.completed_cables ?? 0}/{changeoverTarget.cables_total ?? 0} cables done
                    </div>
                  </div>

                  <label className="tech-workflow-field" htmlFor="twf-new-tech">
                    <span className="tech-workflow-field-label">Replacement technician</span>
                    <select
                      id="twf-new-tech"
                      className="form-select"
                      value={changeoverTech}
                      onChange={e => setChangeoverTech(e.target.value)}
                    >
                      <option value="">Select…</option>
                      {techs.filter(t => t.id !== changeoverTarget.technician_id).map(t => (
                        <option key={t.id} value={t.id}>{t.full_name}</option>
                      ))}
                    </select>
                  </label>

                  <label className="tech-workflow-field" htmlFor="twf-reason">
                    <span className="tech-workflow-field-label">Reason</span>
                    <select
                      id="twf-reason"
                      className="form-select"
                      value={changeoverReason}
                      onChange={e => setChangeoverReason(e.target.value as ChangeoverReason)}
                    >
                      <option value="">Select reason…</option>
                      {CHANGEOVER_REASONS.map(r => (
                        <option key={r} value={r}>{r}</option>
                      ))}
                    </select>
                  </label>

                  <label className="tech-workflow-field" htmlFor="twf-notes">
                    <span className="tech-workflow-field-label">Notes (optional)</span>
                    <textarea
                      id="twf-notes"
                      className="form-textarea"
                      rows={2}
                      value={changeoverNotes}
                      onChange={e => setChangeoverNotes(e.target.value)}
                      placeholder="Audit context…"
                    />
                  </label>

                  {changeoverError && <div className="form-error">{changeoverError}</div>}

                  <div className="tech-workflow-pane-actions">
                    <button
                      type="button"
                      className="btn-primary"
                      disabled={changeoverSaving || !changeoverTech || !changeoverReason}
                      onClick={() => void handleChangeover()}
                    >
                      {changeoverSaving ? 'Processing…' : 'Confirm changeover'}
                    </button>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {toast && (
        <Toast message={toast} tone="success" onDismiss={() => setToast(null)} />
      )}
    </Modal>
  );
}

function PanelContextCard({
  loading,
  projectName,
  projectCode,
  panelName,
  cableCount,
  assignment,
  statusMeta,
  workflowStatus,
}: {
  loading: boolean;
  projectName: string;
  projectCode: string;
  panelName: string;
  cableCount: number;
  assignment: any | null;
  statusMeta: { label: string; chip: string };
  workflowStatus: WorkflowStatus;
}) {
  return (
    <div className="twf-context-card">
      <div className="twf-context-row">
        <Building2 size={16} className="twf-context-icon shrink-0" />
        <div className="min-w-0 flex-1">
          <div className="twf-context-project" title={projectName}>{projectName}</div>
          <div className="twf-context-code">{projectCode}</div>
        </div>
        <span className={`twf-status-badge ${statusMeta.chip}`}>
          {loading ? '…' : statusMeta.label}
        </span>
      </div>
      <div className="twf-context-row twf-context-row--panel">
        <LayoutGrid size={15} className="twf-context-icon shrink-0" />
        <div className="min-w-0 flex-1">
          <div className="twf-context-panel">{panelName}</div>
          <div className="twf-context-meta">
            {cableCount > 0 ? `${cableCount} cables` : 'No schedule'}
            {assignment?.technician_name && (
              <> · <span className="font-medium text-slate-700">{assignment.technician_name}</span></>
            )}
          </div>
        </div>
        {assignment && (assignment.kpi ?? 0) > 0 && workflowStatus !== 'unassigned' && (
          <span className="twf-kpi-chip">{assignment.kpi}%</span>
        )}
      </div>
    </div>
  );
}
