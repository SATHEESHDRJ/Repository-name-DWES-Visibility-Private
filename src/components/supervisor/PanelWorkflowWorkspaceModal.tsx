import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import Modal from '../Modal';
import { DashboardIcon } from '../ui/DashboardIcon';
import { DwesLoadingCenter } from '../ui/DwesLoadingIndicator';
import {
  Activity,
  AlertTriangle,
  ArrowLeftRight,
  CheckCircle2,
  Clock,
  FolderOpen,
  Plus,
  User,
  UserPlus,
  Users,
} from '../ui/icons';
import PanelAssignmentModal from './PanelAssignmentModal';
import type { TechnicianWorkflowSection } from './PanelAssignmentModal';
import { panelWorkflowApi, supervisorApi, usersApi } from '../../services/api';
import { emitWorkflowChanged } from '../../utils/dwesRefreshEvents';
import WorkflowPlanTab from './workflow/WorkflowPlanTab';
import WorkflowDependenciesTab from './workflow/WorkflowDependenciesTab';
import WorkflowTimeTab from './workflow/WorkflowTimeTab';
import WorkflowHistoryTab from './workflow/WorkflowHistoryTab';
import {
  formatPersonLabel,
  formatTs,
  stageStatusTone,
  type PanelWorkflowRow,
  type WorkflowTabId,
} from './workflow/workflowTypes';
import type { PanelActivityData } from '../../types';

export type { TechnicianWorkflowSection };

export interface PanelWorkflowWorkspaceModalProps {
  onClose: () => void;
  initialSection?: TechnicianWorkflowSection;
  projectCode: string;
  panelId: string;
  projectName: string;
  panelName: string;
  cableCount?: number;
}

const TABS: Array<{ id: WorkflowTabId; label: string; icon: ReactNode }> = [
  { id: 'plan', label: 'Workflow Plan', icon: <FolderKanbanIcon /> },
  { id: 'assignments', label: 'Assignments', icon: <Users size={15} /> },
  { id: 'time', label: 'Time & Productivity', icon: <Clock size={15} /> },
  { id: 'dependencies', label: 'Dependencies', icon: <ArrowLeftRight size={15} /> },
  { id: 'progress', label: 'Actual Progress', icon: <Activity size={15} /> },
  { id: 'delays', label: 'Delays & Alerts', icon: <AlertTriangle size={15} /> },
  { id: 'history', label: 'History', icon: <Clock size={15} /> },
];

function FolderKanbanIcon() {
  return <FolderOpen size={15} />;
}

function messageFrom(error: unknown): string {
  return (error as { response?: { data?: { message?: string } } })?.response?.data?.message
    || 'Panel Workflow could not be loaded.';
}

function technicalDetails(error: unknown): string {
  const res = (error as { response?: { status?: number; data?: { message?: string; error?: string; statusCode?: number } } })?.response;
  if (!res) return String((error as Error)?.message || error || '');
  const msg = res.data?.message || res.data?.error || '';
  return [res.status || res.data?.statusCode, msg].filter(Boolean).join(' — ');
}

export default function PanelWorkflowWorkspaceModal({
  onClose,
  initialSection,
  projectCode,
  panelId,
  projectName,
  panelName,
  cableCount = 0,
}: PanelWorkflowWorkspaceModalProps) {
  const [tab, setTab] = useState<WorkflowTabId>(
    initialSection === 'assign' ? 'assignments' : 'plan',
  );
  const [workflow, setWorkflow] = useState<PanelWorkflowRow | null>(null);
  const [history, setHistory] = useState<any[]>([]);
  const [templates, setTemplates] = useState<Array<{ id: number; code: string; name: string }>>([]);
  const [activity, setActivity] = useState<PanelActivityData | null>(null);
  const [technicians, setTechnicians] = useState<any[]>([]);
  const [stageAssignUserId, setStageAssignUserId] = useState('');
  const [stageAssignStageId, setStageAssignStageId] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [errorDetail, setErrorDetail] = useState('');
  const [stageEditDirty, setStageEditDirty] = useState(false);
  const [stageConfirmOpen, setStageConfirmOpen] = useState(false);
  const [stageConfirmError, setStageConfirmError] = useState('');
  const [forceAssignConfirm, setForceAssignConfirm] = useState<'reassign' | 'midchange' | null>(null);
  const [syncingLabels, setSyncingLabels] = useState(false);
  const syncAttemptedRef = useRef<number | null>(null);
  const isDev = Boolean(import.meta.env?.DEV);
  const resolvedWires = Number(cableCount || activity?.cables_total || 0);
  const scheduleReady = resolvedWires > 0;
  const displayProject = projectName || projectCode;
  const displayPanel = panelName || panelId;
  const modalSubtitle = `${displayProject} · ${projectCode} · ${displayPanel}`;

  const load = useCallback(async () => {
    setError('');
    setErrorDetail('');
    try {
      const ensured = await panelWorkflowApi.ensure({
        project_code: projectCode,
        frame_id: panelId,
        panel_name: panelName,
      }) as PanelWorkflowRow;
      const [hist, tpls, act, techs] = await Promise.all([
        panelWorkflowApi.history(ensured.id),
        panelWorkflowApi.listTemplates(),
        supervisorApi.panelActivity(projectCode, panelId).catch(() => null),
        usersApi.technicians().catch(() => []),
      ]);
      setWorkflow(ensured);
      setHistory(Array.isArray(hist) ? hist : []);
      setTemplates(Array.isArray(tpls) ? tpls : []);
      setActivity((act && typeof act === 'object') ? act as PanelActivityData : null);
      setTechnicians(Array.isArray(techs) ? techs : []);
    } catch (e) {
      setError('Panel Workflow could not be loaded.');
      setErrorDetail(technicalDetails(e) || messageFrom(e));
    }
  }, [panelId, panelName, projectCode]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    load().finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [load]);

  const refresh = async () => {
    setBusy(true);
    try {
      await load();
    } finally {
      setBusy(false);
    }
  };

  const wiringCompletion = useMemo(() => {
    if (!activity) return null;
    const pct = Number(activity.completion_percentage);
    return Number.isFinite(pct) ? pct : null;
  }, [activity]);

  const workflowCompletion = useMemo(() => {
    if (!workflow?.stages?.length) return 0;
    const mandatory = workflow.stages.filter(s => s.enabled && s.mandatory);
    if (!mandatory.length) return 0;
    const done = mandatory.filter(s => {
      const st = String(s.status || '').toUpperCase();
      return st === 'COMPLETED' || st === 'APPROVED';
    }).length;
    return Math.round((done / mandatory.length) * 100);
  }, [workflow]);

  const delayBadge = useMemo(() => {
    if (!workflow) return null;
    const delayedStages = (workflow.stages || []).filter(s =>
      (s.delay_minutes != null && s.delay_minutes > 0)
      || String(s.status || '').toUpperCase() === 'DELAYED'
      || !!s.delay_reason,
    );
    if (delayedStages.length) {
      return { tone: 'warn', label: `${delayedStages.length} stage delay(s)` };
    }
    if (workflow.target_completion_at) {
      const target = new Date(workflow.target_completion_at).getTime();
      if (!Number.isNaN(target) && Date.now() > target && String(workflow.status).toUpperCase() !== 'COMPLETED') {
        return { tone: 'warn', label: 'Past target date' };
      }
    }
    return { tone: 'ok', label: 'On plan' };
  }, [workflow]);

  const currentStageName = useMemo(() => {
    const stages = [...(workflow?.stages || [])].sort((a, b) => a.sequence - b.sequence);
    const current = stages.find(s => {
      const st = String(s.status || '').toUpperCase();
      return s.enabled && (st === 'IN_PROGRESS' || st === 'READY');
    }) || stages.find(s => s.enabled && String(s.status).toUpperCase() === 'PLANNED');
    return current?.name || '—';
  }, [workflow]);

  const techCount = useMemo(() => {
    const wiring = (workflow?.stages || []).find(s => s.stage_key === 'WIRING');
    return Math.max(1, wiring?.assignees?.length || (activity?.technician?.id ? 1 : 0) || 1);
  }, [activity, workflow]);

  const wiringStage = useMemo(
    () => (workflow?.stages || []).find(s => String(s.stage_key).toUpperCase() === 'WIRING') || null,
    [workflow],
  );
  const panelWiringProj = workflow?.panel_wiring_assignment ?? null;
  const panelWiringAssigned = Boolean(
    panelWiringProj
    || activity?.technician
    || activity?.assigned
    || (activity?.status && ['assigned', 'in_progress', 'paused', 'started'].includes(String(activity.status).toLowerCase())),
  );
  const panelWiringTechId = panelWiringProj?.technician_id
    ?? activity?.technician?.id
    ?? null;
  const panelWiringTechLabel = panelWiringProj?.technician_name
    || formatPersonLabel(activity?.technician ?? activity?.completed_by ?? null);
  const wiringWorkflowAssigned = Boolean(wiringStage?.assignees?.length);
  const wiringWorkflowTechId = wiringStage?.assignees?.[0]?.user_id ?? null;
  const wiringWorkflowTechLabel = (() => {
    if (panelWiringProj?.synced_with_wiring_stage && panelWiringProj.technician_name) {
      return panelWiringProj.technician_name;
    }
    const first = wiringStage?.assignees?.[0];
    if (!first) return '—';
    const match = technicians.find((t: any) => t.id === first.user_id);
    return match?.full_name || match?.username || `User #${first.user_id}`;
  })();
  const labelsSynced = Boolean(
    panelWiringProj?.synced_with_wiring_stage
    || (panelWiringTechId != null && wiringWorkflowTechId != null && panelWiringTechId === wiringWorkflowTechId)
    || (!panelWiringAssigned && !wiringWorkflowAssigned),
  );
  const unifiedTechLabel = panelWiringAssigned
    ? (panelWiringTechLabel || wiringWorkflowTechLabel)
    : (wiringWorkflowAssigned ? wiringWorkflowTechLabel : 'Unassigned');
  const canReassign = Boolean(
    panelWiringProj?.can_reassign
    ?? activity?.can_reassign
    ?? (panelWiringAssigned
      && String(panelWiringProj?.status || activity?.status || '').toLowerCase() === 'assigned'
      && !(panelWiringProj?.started_at || activity?.wiring_started_at || activity?.has_started)),
  );
  const canMidChange = Boolean(
    panelWiringProj?.can_mid_change
    ?? activity?.can_mid_change
    ?? (panelWiringAssigned && (
      ['in_progress', 'paused'].includes(String(panelWiringProj?.status || activity?.status || '').toLowerCase())
      || Boolean(panelWiringProj?.started_at || activity?.wiring_started_at || activity?.has_started)
    )),
  );

  useEffect(() => {
    if (!workflow || labelsSynced || !panelWiringAssigned) {
      setSyncingLabels(false);
      return;
    }
    if (syncAttemptedRef.current === workflow.id) return;
    syncAttemptedRef.current = workflow.id;
    setSyncingLabels(true);
    const t = window.setTimeout(() => {
      void load().finally(() => setSyncingLabels(false));
    }, 600);
    return () => window.clearTimeout(t);
  }, [workflow, labelsSynced, panelWiringAssigned, load]);

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const result = await fn();
      await load();
      return result;
    } catch (e) {
      setError(messageFrom(e));
      throw e;
    } finally {
      setBusy(false);
    }
  };

  const selectedStageTech = technicians.find((t: any) => String(t.id) === String(stageAssignUserId));
  const selectedStageTechLabel = selectedStageTech?.full_name
    || selectedStageTech?.username
    || (stageAssignUserId ? `Tech #${stageAssignUserId}` : '—');

  const executeStageAssign = async () => {
    if (!stageAssignStageId || !stageAssignUserId) return;
    try {
      const result: any = await run(() => panelWorkflowApi.assignStage(Number(stageAssignStageId), {
        user_id: Number(stageAssignUserId),
        role_hint: 'stage',
      }));
      if (result?.message) setNotice(String(result.message));
      emitWorkflowChanged({ scope: 'assignment', projectCode, frameId: panelId });
      setStageAssignUserId('');
      setStageConfirmOpen(false);
      setStageConfirmError('');
    } catch (e) {
      setStageConfirmError(messageFrom(e));
    }
  };

  const assignToStage = async () => {
    if (!stageAssignStageId || !stageAssignUserId) return;
    const stage = (workflow?.stages || []).find(s => String(s.id) === String(stageAssignStageId));
    const isWiring = String(stage?.stage_key || '').toUpperCase() === 'WIRING';
    const selectedId = Number(stageAssignUserId);

    if (isWiring && panelWiringAssigned && panelWiringTechId != null && selectedId !== panelWiringTechId) {
      if (canReassign) {
        setForceAssignConfirm('reassign');
        setNotice('Panel wiring is assigned but not started — use Reassign to change the technician.');
        return;
      }
      if (canMidChange) {
        setForceAssignConfirm('midchange');
        setNotice('Wiring has started — use Mid Change to transfer active work.');
        return;
      }
      setError('This panel already has an active wiring technician. Use Reassign or Mid Change.');
      return;
    }

    if (isWiring && !panelWiringAssigned) {
      if (!scheduleReady) {
        setError('Upload the panel wiring schedule before assigning a technician.');
        return;
      }
      setStageConfirmError('');
      setStageConfirmOpen(true);
      return;
    }

    await executeStageAssign();
  };

  return (
    <>
    <Modal
      title="Panel Workflow"
      subtitle={modalSubtitle}
      icon={<DashboardIcon name="projects" size={18} />}
      onClose={onClose}
      size="xl"
      bodyClassName="pw-workspace-body"
      closeOnBackdrop={!busy && !stageConfirmOpen}
      closeOnEscape={!busy && !stageConfirmOpen}
      footer={(
        <div className="pw-footer">
          <div className="pw-footer-note">
            <CheckCircle2 size={16} className="pw-footer-note__icon" aria-hidden />
            <span>
              {stageEditDirty
                ? 'Unsaved stage changes'
                : (tab === 'assignments'
                  ? 'Assignment changes apply only after you confirm'
                  : 'All changes are saved automatically')}
            </span>
          </div>
          <div className="pw-footer__actions">
            {!loading && error && !workflow && (
              <button type="button" className="btn-primary" onClick={() => { setLoading(true); load().finally(() => setLoading(false)); }} disabled={busy || loading}>
                Retry
              </button>
            )}
            <button type="button" className="btn-secondary" onClick={onClose} disabled={busy}>Close</button>
          </div>
        </div>
      )}
    >
      {loading && <DwesLoadingCenter label="Loading panel workflow…" size="sm" />}
      {!loading && error && !workflow && (
        <div className="form-error" role="alert">
          <div>{error}</div>
          {isDev && errorDetail ? <div className="muted" style={{ marginTop: 8, fontSize: 12 }}>{errorDetail}</div> : null}
        </div>
      )}

      {!loading && workflow && (
        <div className="pw-workspace">
          <header className="pw-header" aria-label="Workflow summary">
            <div className="pw-summary-strip" aria-label="Workflow summary">
              <div className={`pw-summary-strip__item${scheduleReady ? ' pw-summary-strip__item--ok' : ' pw-summary-strip__item--warn'}`}>
                <span>Wiring schedule</span>
                <strong>{scheduleReady ? `${resolvedWires} wires` : 'Not uploaded'}</strong>
              </div>
              <div className="pw-summary-strip__item">
                <span>Current stage</span>
                <strong className="pw-summary-strip__stage" title={currentStageName}>
                  {currentStageName}
                  <span className="pw-status-pill pw-status-pill--inline" data-tone={stageStatusTone(workflow.status)}>
                    {String(workflow.status || '').replace(/_/g, ' ')}
                  </span>
                </strong>
              </div>
              <div className="pw-summary-strip__item">
                <span>Wiring progress</span>
                <strong>{wiringCompletion != null ? `${wiringCompletion}%` : '—'}</strong>
              </div>
              <div className="pw-summary-strip__item">
                <span>Overall workflow</span>
                <strong>{workflowCompletion}%</strong>
              </div>
              <div className="pw-summary-strip__item">
                <span>Delay</span>
                <strong className="pw-status-pill" data-tone={delayBadge?.tone || 'idle'}>
                  {delayBadge?.label || '—'}
                </strong>
              </div>
              <div className="pw-summary-strip__item">
                <span>Forecast completion</span>
                <strong>{formatTs(workflow.forecast_completion_at)}</strong>
              </div>
            </div>
          </header>

          <nav className="pw-tabs" aria-label="Workflow sections">
            {TABS.map(item => (
              <button
                key={item.id}
                type="button"
                className={`pw-tab${tab === item.id ? ' is-active' : ''}`}
                onClick={() => setTab(item.id)}
              >
                <span className="pw-tab__icon" aria-hidden>{item.icon}</span>
                <span className="pw-tab__label">{item.label}</span>
              </button>
            ))}
          </nav>

          {error && <div className="form-error pw-tab-error">{error}</div>}

          <div className="pw-tab-panel">
            {tab === 'plan' && (
              <WorkflowPlanTab
                workflow={workflow}
                busy={busy}
                totalWires={resolvedWires}
                technicians={technicians}
                onRefresh={refresh}
                onStageEditDirtyChange={setStageEditDirty}
                onUpdateStage={async (stageId, body) => {
                  setBusy(true);
                  try {
                    await panelWorkflowApi.updateStage(stageId, body);
                  } finally {
                    setBusy(false);
                  }
                }}
                onAddStage={async body => {
                  setBusy(true);
                  try {
                    return await panelWorkflowApi.addStage(workflow.id, body) as { id: number };
                  } finally {
                    setBusy(false);
                  }
                }}
                onAddDependency={async body => {
                  setBusy(true);
                  try {
                    await panelWorkflowApi.addDependency(workflow.id, body);
                  } finally {
                    setBusy(false);
                  }
                }}
                onOpenTimeTab={() => setTab('time')}
                templates={templates}
              />
            )}

            {tab === 'assignments' && (
              <div className="pw-assignments">
                <section className="pw-assignments__wiring">
                  <h3 className="pw-section-title">Panel wiring assignment</h3>
                  <p className="pw-section-note muted">
                    Controls who receives the Digital Wiring Schedule. This uses the existing panel assignment workflow.
                  </p>
                  <div className="pw-assign-status" role="status">
                    <div>
                      <span className="pw-assign-status__label">Panel Assignment</span>
                      <strong>
                        {syncingLabels
                          ? 'Syncing…'
                          : (panelWiringAssigned ? `Assigned · ${unifiedTechLabel}` : 'Not Assigned')}
                      </strong>
                    </div>
                    <div>
                      <span className="pw-assign-status__label">Workflow Wiring Assignment</span>
                      <strong>
                        {syncingLabels
                          ? 'Syncing…'
                          : (wiringWorkflowAssigned || panelWiringAssigned
                            ? `Assigned · ${unifiedTechLabel}`
                            : 'Not Assigned')}
                      </strong>
                    </div>
                    {!labelsSynced && !syncingLabels && wiringWorkflowAssigned && !panelWiringAssigned && (
                      <p className="pw-assign-sync-note muted m-0" role="status">
                        Wiring stage has an assignee. Creating or linking the panel wiring assignment will align both labels.
                      </p>
                    )}
                  </div>
                  <div className="pw-assign-actions">
                    {canReassign && (
                      <button
                        type="button"
                        className="btn-secondary"
                        disabled={busy}
                        onClick={() => setForceAssignConfirm('reassign')}
                      >
                        <User size={15} aria-hidden /> Reassign Technician
                      </button>
                    )}
                    {canMidChange && (
                      <button
                        type="button"
                        className="btn-secondary"
                        disabled={busy}
                        onClick={() => setForceAssignConfirm('midchange')}
                      >
                        <ArrowLeftRight size={15} aria-hidden /> Start Mid Change
                      </button>
                    )}
                  </div>
                  <PanelAssignmentModal
                    embedded
                    onClose={onClose}
                    projectCode={projectCode}
                    panelId={panelId}
                    projectName={projectName}
                    panelName={panelName}
                    cableCount={resolvedWires}
                    activity={activity}
                    forceConfirm={forceAssignConfirm}
                    onForceConfirmConsumed={() => setForceAssignConfirm(null)}
                    onAssigned={() => { void refresh(); }}
                  />
                  {canMidChange && (
                    <div className="pw-midchange" role="note">
                      <strong>Mid Change</strong>
                      <p>
                        Wiring has started. Mid Change transfers the panel to another technician while preserving
                        completed wires and audit history.
                      </p>
                    </div>
                  )}
                  {canReassign && (
                    <div className="pw-midchange" role="note">
                      <strong>Reassign</strong>
                      <p>
                        Wiring has not started. Reassign replaces the technician on this virgin assignment without Mid Change.
                      </p>
                    </div>
                  )}
                </section>
                <section className="pw-assignments__stages">
                  <h3 className="pw-section-title">Stage-scoped assignees</h3>
                  <p className="pw-section-note muted">
                    Controls responsibility for Workflow stages. Non-wiring stages do not provide Digital Wiring Schedule access.
                    Assigning the Wiring stage also creates or links the panel wiring assignment when the panel is free.
                  </p>
                  {notice ? (
                    <div className="pw-action-note is-ok" role="status">{notice}</div>
                  ) : null}
                  <div className="pw-assign-controls">
                    <label className="pw-field pw-field--stage">
                      <span>Stage</span>
                      <select
                        value={stageAssignStageId}
                        onChange={e => setStageAssignStageId(e.target.value)}
                        disabled={busy}
                      >
                        <option value="">Select stage…</option>
                        {(workflow.stages || []).filter(s => s.enabled).map(s => (
                          <option key={s.id} value={s.id}>{s.name}</option>
                        ))}
                      </select>
                    </label>
                    <label className="pw-field pw-field--tech">
                      <span>Technician</span>
                      <select
                        value={stageAssignUserId}
                        onChange={e => setStageAssignUserId(e.target.value)}
                        disabled={busy}
                      >
                        <option value="">Select technician…</option>
                        {technicians.map((t: any) => (
                          <option key={t.id} value={t.id}>
                            {t.full_name || t.username || `Tech #${t.id}`}
                          </option>
                        ))}
                      </select>
                    </label>
                    <button
                      type="button"
                      className="btn-primary pw-assign-btn"
                      disabled={busy || !stageAssignStageId || !stageAssignUserId}
                      onClick={() => { void assignToStage(); }}
                    >
                      <Plus size={15} aria-hidden /> Assign to stage
                    </button>
                  </div>
                  <ul className="pw-assignee-list">
                    {(workflow.stages || []).flatMap(stage =>
                      (stage.assignees || []).map(a => (
                        <li key={a.id}>
                          <span>
                            <strong>{stage.name}</strong>
                            {' · '}
                            {technicians.find((t: any) => t.id === a.user_id)?.full_name
                              || technicians.find((t: any) => t.id === a.user_id)?.username
                              || `User #${a.user_id}`}
                          </span>
                          <button
                            type="button"
                            className="btn-ghost"
                            disabled={busy}
                            onClick={() => run(() => panelWorkflowApi.removeAssignee(a.id))}
                          >
                            Remove
                          </button>
                        </li>
                      )),
                    )}
                    {(workflow.stages || []).every(s => !(s.assignees || []).length) && (
                      <li className="pw-empty">No stage assignees yet.</li>
                    )}
                  </ul>
                </section>
              </div>
            )}

            {tab === 'time' && (
              <WorkflowTimeTab
                projectCode={projectCode}
                frameId={panelId}
                totalWires={resolvedWires}
                technicianCount={techCount}
                efficiencyFactor={workflow.efficiency_factor != null ? Number(workflow.efficiency_factor) : 1}
                busy={busy}
              />
            )}

            {tab === 'dependencies' && (
              <WorkflowDependenciesTab
                workflow={workflow}
                busy={busy}
                onRefresh={refresh}
                onAddDependency={async body => {
                  setBusy(true);
                  try {
                    await panelWorkflowApi.addDependency(workflow.id, body);
                  } finally {
                    setBusy(false);
                  }
                }}
                onRemoveDependency={async depId => {
                  setBusy(true);
                  try {
                    await panelWorkflowApi.removeDependency(depId);
                  } finally {
                    setBusy(false);
                  }
                }}
              />
            )}

            {tab === 'progress' && (
              <ActualProgressPanel
                workflow={workflow}
                activity={activity}
                wiringCompletion={wiringCompletion}
                workflowCompletion={workflowCompletion}
              />
            )}

            {tab === 'delays' && (
              <div className="pw-delays">
                <h3 className="pw-section-title">Delays & alerts</h3>
                <div className="pw-banner-info" role="note">
                  Alerts are planning/management only — they never punish or modify technician records.
                </div>
                <ul className="pw-delay-list">
                  {(workflow.stages || [])
                    .filter(s => s.delay_reason || (s.delay_minutes != null && s.delay_minutes > 0) || String(s.status).toUpperCase() === 'DELAYED')
                    .map(s => (
                      <li key={s.id}>
                        <strong>{s.name}</strong>
                        <span className="pw-status-pill" data-tone="warn">
                          {s.delay_minutes != null ? `${s.delay_minutes} min` : 'DELAYED'}
                        </span>
                        <p>{s.delay_reason || 'No reason recorded yet.'}</p>
                      </li>
                    ))}
                  {(workflow.stages || []).every(s =>
                    !s.delay_reason && !(s.delay_minutes != null && s.delay_minutes > 0)
                    && String(s.status).toUpperCase() !== 'DELAYED',
                  ) && (
                    <li className="pw-empty">No stage delays recorded yet.</li>
                  )}
                </ul>
              </div>
            )}

            {tab === 'history' && (
              <WorkflowHistoryTab
                history={history}
                workflow={workflow}
                projectName={displayProject}
                panelName={displayPanel}
                users={technicians}
              />
            )}
          </div>
        </div>
      )}
    </Modal>
    {stageConfirmOpen && (
      <Modal
        title="Confirm Technician Assignment"
        icon={<UserPlus />}
        onClose={() => {
          if (busy) return;
          setStageConfirmOpen(false);
          setStageConfirmError('');
        }}
        size="form"
        closeOnBackdrop={!busy}
        closeOnEscape={!busy}
        footer={(
          <>
            <button
              type="button"
              className="btn-secondary"
              disabled={busy}
              onClick={() => {
                setStageConfirmOpen(false);
                setStageConfirmError('');
              }}
            >
              Cancel
            </button>
            <button
              type="button"
              className="btn-primary disabled:cursor-not-allowed disabled:opacity-40"
              disabled={busy}
              onClick={() => { void executeStageAssign(); }}
            >
              {busy ? 'Assigning…' : 'Confirm Assignment'}
            </button>
          </>
        )}
      >
        <div className="assign-confirm-shell">
          <dl className="assign-confirm-grid">
            <div><dt>Project</dt><dd>{displayProject}</dd></div>
            <div><dt>Panel</dt><dd>{displayPanel}</dd></div>
            <div><dt>Stage</dt><dd>Wiring</dd></div>
            <div><dt>Wire count</dt><dd>{resolvedWires}</dd></div>
            <div><dt>Selected technician</dt><dd>{selectedStageTechLabel}</dd></div>
            <div><dt>Current</dt><dd>Unassigned</dd></div>
          </dl>
          {stageConfirmError && <div className="form-error" role="alert">{stageConfirmError}</div>}
        </div>
      </Modal>
    )}
    </>
  );
}

/** Local guard so one bad Actual Progress value cannot crash the full app shell. */
function ActualProgressPanel({
  workflow,
  activity,
  wiringCompletion,
  workflowCompletion,
}: {
  workflow: PanelWorkflowRow;
  activity: PanelActivityData | null;
  wiringCompletion: number | null;
  workflowCompletion: number;
}) {
  try {
    const stages = workflow.stages || [];
    const hasStageActuals = stages.some(s =>
      s.actual_start_at
      || s.actual_finish_at
      || (Number(s.progress_pct) || 0) > 0
      || ['IN_PROGRESS', 'COMPLETED', 'APPROVED', 'READY'].includes(String(s.status || '').toUpperCase()),
    );
    const hasWiringActivity = Boolean(
      activity
      && (activity.has_started
        || activity.is_completed
        || (activity.cables_completed ?? 0) > 0
        || activity.technician
        || activity.assigned),
    );
    const showEmpty = !hasStageActuals && !hasWiringActivity;

    const statusLabel = activity?.status_label
      || (activity?.status ? String(activity.status).replace(/_/g, ' ') : '—');
    const technicianLabel = formatPersonLabel(
      activity?.technician
      ?? activity?.completed_by
      ?? null,
      'Unassigned',
    );
    const completedByLabel = activity?.completed_by
      ? formatPersonLabel(activity.completed_by)
      : null;

    return (
      <div className="pw-progress">
        <h3 className="pw-section-title">Actual wiring snapshot</h3>
        <p className="pw-muted">
          Read-only from existing technician execution data. Stage actuals fill in as work progresses.
        </p>

        {showEmpty ? (
          <p className="pw-empty" role="status">
            No actual workflow progress has been recorded for this panel yet.
          </p>
        ) : (
          <div className="pw-kpi-grid">
            <div>
              <span>Technician</span>
              <strong title={technicianLabel}>{technicianLabel}</strong>
            </div>
            <div>
              <span>Assignment status</span>
              <strong>{statusLabel}</strong>
            </div>
            <div>
              <span>Wires completed</span>
              <strong>{activity?.cables_completed ?? '—'}</strong>
            </div>
            <div>
              <span>Remaining</span>
              <strong>{activity?.cables_remaining ?? '—'}</strong>
            </div>
            <div>
              <span>Wiring progress</span>
              <strong>
                {wiringCompletion != null
                  ? `${wiringCompletion}%`
                  : (activity?.completion_percentage != null
                    ? `${activity.completion_percentage}%`
                    : '—')}
              </strong>
            </div>
            <div>
              <span>Pause reason</span>
              <strong>{activity?.pause_reason?.trim() || '—'}</strong>
            </div>
            <div>
              <span>Work state</span>
              <strong>{activity?.work_state_label || '—'}</strong>
            </div>
            <div>
              <span>Overall workflow</span>
              <strong>{workflowCompletion}%</strong>
            </div>
            {completedByLabel && (
              <div>
                <span>Completed by</span>
                <strong>{completedByLabel}</strong>
              </div>
            )}
          </div>
        )}

        <table className="pw-table">
          <thead>
            <tr>
              <th>Stage</th>
              <th>Status</th>
              <th>Progress</th>
              <th>Actual start</th>
              <th>Actual finish</th>
            </tr>
          </thead>
          <tbody>
            {stages.length === 0 ? (
              <tr>
                <td colSpan={5} className="pw-empty">No workflow stages defined.</td>
              </tr>
            ) : stages.map(s => (
              <tr key={s.id}>
                <td>{s.name}</td>
                <td>{String(s.status || 'NOT_PLANNED').replace(/_/g, ' ')}</td>
                <td>{Number(s.progress_pct) || 0}%</td>
                <td>{formatTs(s.actual_start_at)}</td>
                <td>{formatTs(s.actual_finish_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  } catch (err) {
    return (
      <div className="pw-progress form-error" role="alert">
        Actual Progress could not be displayed.
        <div className="muted" style={{ marginTop: 8, fontSize: 12 }}>
          {err instanceof Error ? err.message : 'Unexpected render error'}
        </div>
      </div>
    );
  }
}
