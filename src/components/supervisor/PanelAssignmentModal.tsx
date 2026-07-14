import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Modal from '../Modal';
import { projectsApi, supervisorApi, techApi, usersApi } from '../../services/api';
import { emitFramesChanged } from '../../utils/projectFramesEvents';
import { emitWorkflowChanged } from '../../utils/dwesRefreshEvents';
import { useDwesRefresh } from '../../hooks/useDwesRefresh';
import { useAppDialog } from '../AppDialogProvider';
import Toast, { type ToastTone } from '../ui/Toast';
import {
  CHANGEOVER_REASONS,
  type ChangeoverReason,
} from '../assignment/MidChangeoverModal';
import type { FramePanel } from '../assignment/ProjectPanelSelect';
import {
  buildTechResources,
  isActiveAssignment,
  type AssignmentRow,
  type TechResource,
  type TechUser,
} from '../../utils/assignmentCenterUtils';
import {
  ArrowLeftRight,
  Cable,
  Check,
  Info,
  Lock,
  Search,
  TriangleAlert,
  UserMinus,
  UserPlus,
  Users,
} from '../ui/icons';
import { useLatestRequest } from '../../hooks/useLatestRequest';

/** Kept for drop-in compatibility with the previous Smart Assignment Center entry point. */
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

type PanelWorkflowStatus = 'available' | 'assigned' | 'working' | 'completed' | 'changed-over';

interface PanelContext {
  panel: FramePanel;
  current: AssignmentRow | null;
  latest: AssignmentRow | null;
  status: PanelWorkflowStatus;
  total: number;
  completed: number;
  remaining: number;
  percent: number;
  hasWork: boolean;
  started: boolean;
  canAssign: boolean;
  canRemove: boolean;
  canChangeover: boolean;
  technicianName: string;
}

const PANEL_STATUS_META: Record<PanelWorkflowStatus, { label: string; className: string }> = {
  available: { label: 'Available', className: 'pa-status--available' },
  assigned: { label: 'Assigned', className: 'pa-status--assigned' },
  working: { label: 'Working', className: 'pa-status--working' },
  completed: { label: 'Completed', className: 'pa-status--completed' },
  'changed-over': { label: 'Changed Over', className: 'pa-status--changed' },
};

function rowTime(row: AssignmentRow): number {
  const raw = row.completed_at || row.started_at || row.assigned_at;
  const parsed = raw ? new Date(raw).getTime() : 0;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : row.id;
}

function errorMessage(error: unknown): string {
  return (error as { response?: { data?: { message?: string } } })?.response?.data?.message
    || 'Action failed. Please try again.';
}

function engagementLabel(assigned: number, working: number): string {
  if (assigned + working === 0) return 'Free — no active panels';
  const parts: string[] = [];
  if (assigned > 0) parts.push(`${assigned} assigned`);
  if (working > 0) parts.push(`${working} working`);
  return parts.join(' · ');
}

function technicianStatusLabel(status: TechResource['status']): string {
  if (status === 'available') return 'Available';
  if (status === 'assigned') return 'Assigned';
  return 'Working';
}

export default function PanelAssignmentModal({
  onClose,
  initialSection,
  projectCode,
  panelId,
  projectName,
}: TechnicianWorkflowModalProps) {
  const dialog = useAppDialog();
  const initialised = useRef(false);
  const [techUsers, setTechUsers] = useState<TechUser[]>([]);
  const [allAssignments, setAllAssignments] = useState<AssignmentRow[]>([]);
  const [panels, setPanels] = useState<FramePanel[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [busyPanelId, setBusyPanelId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [selectedPanelIds, setSelectedPanelIds] = useState<Set<string>>(new Set());
  const [selectedTechId, setSelectedTechId] = useState<number | null>(null);
  const [changeoverPanelId, setChangeoverPanelId] = useState<string | null>(null);
  const [changeoverReason, setChangeoverReason] = useState<ChangeoverReason | ''>('');
  const [changeoverNotes, setChangeoverNotes] = useState('');
  const [panelQuery, setPanelQuery] = useState('');
  const [techQuery, setTechQuery] = useState('');
  const [toast, setToast] = useState<{ message: string; tone: ToastTone } | null>(null);
  const requests = useLatestRequest();

  const loadContext = useCallback(async () => {
    const request = requests.begin();
    setLoading(true);
    setPanels([]);
    setAllAssignments([]);
    try {
      const [techs, assignments, projectPanels] = await Promise.all([
        usersApi.technicians().catch(() => []),
        supervisorApi.allPanels(request.signal),
        projectsApi.frames(projectCode, request.signal),
      ]);
      if (!requests.isLatest(request.id)) return;
      const nextPanels = Array.isArray(projectPanels) ? (projectPanels as FramePanel[]) : [];
      setTechUsers(Array.isArray(techs) ? (techs as TechUser[]) : []);
      setAllAssignments(Array.isArray(assignments) ? (assignments as AssignmentRow[]) : []);
      setPanels(nextPanels);
      setSelectedPanelIds(current => new Set([...current].filter(id => nextPanels.some(panel => panel.id === id))));
      if (!nextPanels.some(panel => panel.id === panelId)) onClose();
    } catch (requestError: any) {
      if (requestError?.code === 'ERR_CANCELED' || !requests.isLatest(request.id)) return;
      setPanels([]);
      setAllAssignments([]);
      if (requestError?.response?.status === 404) onClose();
    } finally {
      if (requests.isLatest(request.id)) setLoading(false);
    }
  }, [onClose, panelId, projectCode, requests]);

  useEffect(() => {
    void loadContext();
  }, [loadContext]);

  useDwesRefresh(loadContext, { pollMs: 12_000, listenFrames: true, listenWorkflow: true });

  const techResources = useMemo(
    () => buildTechResources(techUsers, allAssignments, projectCode),
    [techUsers, allAssignments, projectCode],
  );

  const engagementByTech = useMemo(() => {
    const map = new Map<number, { assigned: number; working: number }>();
    for (const assignment of allAssignments) {
      if (!isActiveAssignment(assignment) || assignment.changeover_locked) continue;
      const current = map.get(assignment.technician_id) ?? { assigned: 0, working: 0 };
      if (String(assignment.status) === 'assigned' && assignment.handover_from_id == null) current.assigned += 1;
      else current.working += 1;
      map.set(assignment.technician_id, current);
    }
    return map;
  }, [allAssignments]);

  const panelContexts = useMemo<PanelContext[]>(() => panels.map(panel => {
    const history = allAssignments
      .filter(row => row.project_code === projectCode && row.frame_id === panel.id)
      .sort((a, b) => rowTime(b) - rowTime(a));
    const active = history.filter(row => !row.changeover_locked && isActiveAssignment(row));
    const current = active.find(row => String(row.status) === 'in_progress')
      ?? active.find(row => String(row.status) === 'paused')
      ?? active.find(row => String(row.status) === 'assigned')
      ?? null;
    const latest = current ?? history[0] ?? null;
    const total = Math.max(0, Number(current?.cables_total ?? latest?.cables_total ?? panel.cable_count ?? 0));
    const fallbackCompleted = String(latest?.status) === 'completed'
      ? total
      : Math.min(Number(latest?.cables_src_done ?? 0), Number(latest?.cables_dst_done ?? 0));
    const completed = Math.max(0, Math.min(total, Number(latest?.cables_completed ?? fallbackCompleted)));
    const remaining = Math.max(0, Number(latest?.cables_remaining ?? total - completed));
    const hasWork = Boolean(
      current?.has_recorded_work
      || (current?.cables_src_done ?? 0) > 0
      || (current?.cables_dst_done ?? 0) > 0,
    );
    const started = Boolean(
      current
      && (
        current.started_at != null
        || current.handover_from_id != null
        || String(current.status) !== 'assigned'
        || hasWork
      ),
    );

    let status: PanelWorkflowStatus = 'available';
    if (current) {
      if (String(current.status) === 'in_progress' || String(current.status) === 'paused' || (hasWork && current.handover_from_id == null)) {
        status = 'working';
      } else if (current.handover_from_id != null) {
        status = 'changed-over';
      } else {
        status = 'assigned';
      }
    } else if (String(latest?.status) === 'completed') {
      status = 'completed';
    } else if (latest?.changeover_locked || latest?.handover_to_id != null) {
      status = 'changed-over';
    }

    const technicianName = current?.technician_name
      || latest?.technician_name
      || techUsers.find(tech => tech.id === (current?.technician_id ?? latest?.technician_id))?.full_name
      || '';

    return {
      panel,
      current,
      latest,
      status,
      total,
      completed,
      remaining,
      percent: total > 0 ? Math.round((completed / total) * 100) : 0,
      hasWork,
      started,
      canAssign: !current && status === 'available' && total > 0,
      canRemove: Boolean(
        current
        && String(current.status) === 'assigned'
        && !started
        && current.handover_from_id == null
        && !current.changeover_locked,
      ),
      canChangeover: Boolean(current && started && !current.changeover_locked),
      technicianName,
    };
  }), [allAssignments, panels, projectCode, techUsers]);

  const contextByPanel = useMemo(
    () => new Map(panelContexts.map(context => [context.panel.id, context])),
    [panelContexts],
  );
  const availablePanels = useMemo(
    () => panelContexts.filter(context => context.canAssign),
    [panelContexts],
  );
  const changeoverTarget = changeoverPanelId ? contextByPanel.get(changeoverPanelId) ?? null : null;

  useEffect(() => {
    if (loading || initialised.current || panelContexts.length === 0) return;
    const initial = contextByPanel.get(panelId);
    if (initialSection === 'changeover' && initial?.canChangeover) {
      setChangeoverPanelId(panelId);
    } else if (initial?.canAssign) {
      setSelectedPanelIds(new Set([panelId]));
    }
    initialised.current = true;
  }, [contextByPanel, initialSection, loading, panelContexts.length, panelId]);

  useEffect(() => {
    const assignableIds = new Set(availablePanels.map(context => context.panel.id));
    setSelectedPanelIds(previous => {
      const next = new Set([...previous].filter(id => assignableIds.has(id)));
      if (next.size === previous.size && [...next].every(id => previous.has(id))) return previous;
      return next;
    });
  }, [availablePanels]);

  const selectedContexts = useMemo(
    () => panelContexts.filter(context => selectedPanelIds.has(context.panel.id)),
    [panelContexts, selectedPanelIds],
  );
  const selectedCableCount = selectedContexts.reduce((sum, context) => sum + context.total, 0);
  const availableTechCount = techResources.filter(tech => tech.status === 'available').length;
  const selectedTech = techResources.find(tech => tech.id === selectedTechId) ?? null;
  const reasonValid = changeoverReason !== ''
    && (changeoverReason !== 'Other' || changeoverNotes.trim().length > 0);
  const canAssign = selectedContexts.length > 0 && selectedTech?.status === 'available';
  const canConfirmChangeover = Boolean(
    changeoverTarget?.canChangeover
    && selectedTech?.status === 'available'
    && selectedTech.id !== changeoverTarget.current?.technician_id
    && reasonValid,
  );

  const filteredPanels = useMemo(() => {
    const query = panelQuery.trim().toLowerCase();
    if (!query) return panelContexts;
    return panelContexts.filter(context => (
      context.panel.panel_name.toLowerCase().includes(query)
      || context.panel.id.toLowerCase().includes(query)
    ));
  }, [panelContexts, panelQuery]);

  const filteredTechnicians = useMemo(() => {
    const query = techQuery.trim().toLowerCase();
    if (!query) return techResources;
    return techResources.filter(tech => (
      tech.full_name.toLowerCase().includes(query)
      || tech.employee_id.toLowerCase().includes(query)
      || tech.username.toLowerCase().includes(query)
    ));
  }, [techQuery, techResources]);

  const publishPanelChange = (frameId: string) => {
    emitFramesChanged({ projectCode, frameId, action: 'updated' });
    emitWorkflowChanged({ scope: 'assignment', projectCode, frameId });
  };

  const togglePanel = (context: PanelContext) => {
    if (!context.canAssign || busy) return;
    setError('');
    setSelectedPanelIds(previous => {
      const next = new Set(previous);
      if (next.has(context.panel.id)) next.delete(context.panel.id);
      else next.add(context.panel.id);
      return next;
    });
  };

  const toggleAllAvailable = () => {
    if (busy || availablePanels.length === 0) return;
    const allSelected = availablePanels.every(context => selectedPanelIds.has(context.panel.id));
    setSelectedPanelIds(allSelected
      ? new Set()
      : new Set(availablePanels.map(context => context.panel.id)));
  };

  const handleAssign = async () => {
    if (!canAssign || !selectedTech) return;
    const confirmed = await dialog.confirm({
      title: 'Confirm Panel Assignment',
      tone: 'info',
      confirmText: selectedContexts.length === 1 ? 'Assign Panel' : `Assign ${selectedContexts.length} Panels`,
      message: `Assign ${selectedTech.full_name} to ${selectedContexts.length} selected panel${selectedContexts.length === 1 ? '' : 's'} (${selectedCableCount} assigned cables)? Each panel will remain an independent assignment.`,
    });
    if (!confirmed) return;

    setBusy(true);
    setError('');
    const results = await Promise.allSettled(selectedContexts.map(context => supervisorApi.assignFrame({
      project_code: projectCode,
      frame_id: context.panel.id,
      technician_id: selectedTech.id,
    })));
    const successfulIds = results
      .map((result, index) => result.status === 'fulfilled' ? selectedContexts[index].panel.id : null)
      .filter((id): id is string => Boolean(id));
    const failures = results.filter(result => result.status === 'rejected') as PromiseRejectedResult[];
    successfulIds.forEach(publishPanelChange);
    await loadContext();
    setBusy(false);
    setSelectedTechId(null);
    setSelectedPanelIds(previous => new Set([...previous].filter(id => !successfulIds.includes(id))));

    if (successfulIds.length > 0) {
      setToast({
        tone: 'success',
        message: `${successfulIds.length} panel assignment${successfulIds.length === 1 ? '' : 's'} confirmed for ${selectedTech.full_name}.`,
      });
    }
    if (failures.length > 0) {
      setError(`${failures.length} panel assignment${failures.length === 1 ? '' : 's'} could not be completed. ${errorMessage(failures[0].reason)}`);
    }
  };

  const handleRemove = async (context: PanelContext) => {
    if (!context.current || !context.canRemove) {
      setError('Remove Assignment is unavailable because work has already started. Use Mid Changeover.');
      return;
    }
    const confirmed = await dialog.confirm({
      title: 'Remove Panel Assignment',
      tone: 'delete',
      confirmText: 'Remove Assignment',
      message: `Remove ${context.technicianName} from ${context.panel.panel_name}? This is allowed only because no Start action or cable work has been recorded.`,
    });
    if (!confirmed) return;

    setBusyPanelId(context.panel.id);
    setError('');
    try {
      await techApi.delete(context.current.id);
      publishPanelChange(context.panel.id);
      await loadContext();
      setToast({ tone: 'success', message: `Assignment removed from ${context.panel.panel_name}.` });
    } catch (actionError) {
      setError(errorMessage(actionError));
    } finally {
      setBusyPanelId(null);
    }
  };

  const beginChangeover = (context: PanelContext) => {
    if (!context.canChangeover) {
      setError('Mid Changeover becomes available only after the technician starts work.');
      return;
    }
    setChangeoverPanelId(context.panel.id);
    setSelectedTechId(null);
    setChangeoverReason('');
    setChangeoverNotes('');
    setError('');
  };

  const cancelChangeover = () => {
    setChangeoverPanelId(null);
    setSelectedTechId(null);
    setChangeoverReason('');
    setChangeoverNotes('');
    setError('');
  };

  const handleChangeover = async () => {
    if (!canConfirmChangeover || !changeoverTarget?.current || !selectedTech || !changeoverReason) return;
    const confirmed = await dialog.confirm({
      title: 'Confirm Mid Changeover',
      tone: 'warning',
      confirmText: 'Confirm Changeover',
      message: `Hand over ${changeoverTarget.panel.panel_name} from ${changeoverTarget.technicianName} to ${selectedTech.full_name}? ${changeoverTarget.completed} completed cables will be preserved and only ${changeoverTarget.remaining} remaining cables will transfer. This action creates a permanent audit record.`,
    });
    if (!confirmed) return;

    setBusy(true);
    setError('');
    try {
      await supervisorApi.midChangeover({
        old_assignment_id: changeoverTarget.current.id,
        new_technician_id: selectedTech.id,
        changeover_reason: changeoverReason,
        reason_notes: changeoverNotes.trim() || undefined,
      });
      publishPanelChange(changeoverTarget.panel.id);
      await loadContext();
      setToast({
        tone: 'success',
        message: `${changeoverTarget.panel.panel_name} changed over to ${selectedTech.full_name}. Completed work was preserved.`,
      });
      cancelChangeover();
    } catch (actionError) {
      setError(errorMessage(actionError));
    } finally {
      setBusy(false);
    }
  };

  const footer = changeoverTarget ? (
    <>
      <button onClick={cancelChangeover} className="btn-secondary" type="button" disabled={busy}>
        Back to panels
      </button>
      <button
        onClick={handleChangeover}
        className="btn-primary disabled:cursor-not-allowed disabled:opacity-40"
        type="button"
        disabled={busy || !canConfirmChangeover}
        title={!canConfirmChangeover ? 'Select an available replacement and a changeover reason.' : undefined}
      >
        <ArrowLeftRight size={17} />
        {busy ? 'Processing…' : 'Confirm Mid Changeover'}
      </button>
    </>
  ) : (
    <>
      <button onClick={onClose} className="btn-secondary" type="button" disabled={busy}>Close</button>
      <button
        onClick={handleAssign}
        className="btn-primary disabled:cursor-not-allowed disabled:opacity-40"
        type="button"
        disabled={busy || !canAssign}
        title={!canAssign ? 'Select one or more available panels and an available technician.' : undefined}
      >
        <UserPlus size={17} />
        {busy ? 'Assigning…' : `Assign ${selectedContexts.length || ''} Panel${selectedContexts.length === 1 ? '' : 's'}`}
      </button>
    </>
  );

  return (
    <Modal
      title="Workflow / Panel Assignment"
      subtitle={`${projectName || projectCode} · Production Supervisor controls`}
      onClose={onClose}
      size="xl"
      bodyClassName="panel-assignment-modal-body"
      closeOnBackdrop={!busy && !busyPanelId}
      closeOnEscape={!busy && !busyPanelId}
      footer={footer}
    >
      <div className="pa-shell">
        <section className="pa-project-summary" aria-label="Active project assignment summary">
          <div className="pa-project-copy">
            <span className="pa-kicker">Active project</span>
            <strong title={projectName || projectCode}>{projectName || projectCode}</strong>
            <span title={projectCode}>{projectCode}</span>
          </div>
          <span className="pa-project-state"><span />Active</span>
          <div className="pa-summary-stat"><strong>{panelContexts.length}</strong><span>Panels</span></div>
          <div className="pa-summary-stat"><strong>{selectedCableCount}</strong><span>Selected cables</span></div>
          <div className="pa-summary-stat"><strong>{availableTechCount}</strong><span>Available techs</span></div>
        </section>

        {changeoverTarget && (
          <section className="pa-changeover-summary" aria-label="Mid changeover transfer summary">
            <div className="pa-changeover-heading">
              <span className="pa-icon-box"><ArrowLeftRight size={18} /></span>
              <div>
                <span className="pa-kicker">Mid Changeover</span>
                <strong>{changeoverTarget.panel.panel_name}</strong>
                <span>Outgoing technician: {changeoverTarget.technicianName}</span>
              </div>
            </div>
            <div className="pa-transfer-count"><strong>{changeoverTarget.completed}</strong><span>Completed preserved</span></div>
            <div className="pa-transfer-arrow">→</div>
            <div className="pa-transfer-count pa-transfer-count--remaining"><strong>{changeoverTarget.remaining}</strong><span>Remaining transferred</span></div>
          </section>
        )}

        {error && (
          <div className="pa-error" role="alert">
            <TriangleAlert size={17} />
            <span>{error}</span>
          </div>
        )}

        <div className="pa-layout">
          <section className="pa-section" aria-labelledby="pa-panels-title">
            <header className="pa-section-header">
              <div>
                <span className="pa-step">1</span>
                <div>
                  <h3 id="pa-panels-title">Select panels</h3>
                  <p>{availablePanels.length} ready for assignment · each managed independently</p>
                </div>
              </div>
              {!changeoverTarget && availablePanels.length > 0 && (
                <button type="button" className="pa-text-button" onClick={toggleAllAvailable} disabled={busy}>
                  {availablePanels.every(context => selectedPanelIds.has(context.panel.id)) ? 'Clear all' : 'Select all ready'}
                </button>
              )}
            </header>

            <label className="pa-search">
              <Search size={17} />
              <input
                value={panelQuery}
                onChange={event => setPanelQuery(event.target.value)}
                placeholder="Search panels"
                aria-label="Search panels"
              />
            </label>

            <div className="pa-panel-list">
              {loading ? (
                <p className="pa-empty">Loading project panels…</p>
              ) : filteredPanels.length === 0 ? (
                <p className="pa-empty">No panels match this search.</p>
              ) : filteredPanels.map(context => {
                const selected = selectedPanelIds.has(context.panel.id);
                const statusMeta = PANEL_STATUS_META[context.status];
                const actionBusy = busyPanelId === context.panel.id;
                return (
                  <article
                    key={context.panel.id}
                    className={`pa-panel-card${selected ? ' is-selected' : ''}${changeoverPanelId === context.panel.id ? ' is-changeover' : ''}`}
                  >
                    <button
                      type="button"
                      className="pa-panel-main"
                      onClick={() => togglePanel(context)}
                      disabled={!context.canAssign || busy || Boolean(changeoverTarget)}
                      aria-pressed={selected}
                      title={!context.canAssign && context.total === 0
                        ? 'Upload a wiring schedule before assigning this panel.'
                        : !context.canAssign ? `Panel is ${statusMeta.label.toLowerCase()}.` : 'Select panel for assignment'}
                    >
                      <span className={`pa-checkbox${selected ? ' is-checked' : ''}`} aria-hidden="true">
                        {selected && <Check size={14} />}
                      </span>
                      <span className="pa-panel-copy">
                        <span className="pa-panel-title-row">
                          <strong title={context.panel.panel_name}>{context.panel.panel_name}</strong>
                          <span className={`pa-status ${statusMeta.className}`}><span />{statusMeta.label}</span>
                        </span>
                        <span className="pa-panel-id" title={context.panel.id}>{context.panel.id}</span>
                        <span className="pa-panel-meta">
                          <span><Cable size={14} />{context.total} assigned cables</span>
                          {context.technicianName && <span><Users size={14} />{context.technicianName}</span>}
                        </span>
                        <span className="pa-progress-row">
                          <span className="pa-progress-track"><span style={{ width: `${context.percent}%` }} /></span>
                          <span>{context.completed}/{context.total} · {context.percent}%</span>
                        </span>
                      </span>
                    </button>

                    <div className="pa-panel-actions">
                      {context.canRemove && (
                        <button
                          type="button"
                          className="pa-action pa-action--danger"
                          onClick={() => void handleRemove(context)}
                          disabled={actionBusy || busy}
                        >
                          <UserMinus size={15} />
                          {actionBusy ? 'Removing…' : 'Remove Assignment'}
                        </button>
                      )}
                      {context.canChangeover && (
                        <button
                          type="button"
                          className="pa-action pa-action--primary"
                          onClick={() => beginChangeover(context)}
                          disabled={busy || Boolean(busyPanelId)}
                        >
                          <ArrowLeftRight size={15} />Mid Changeover
                        </button>
                      )}
                      {!context.canRemove && !context.canChangeover && (
                        <span className="pa-action-note">
                          {context.status === 'completed'
                            ? <><Check size={14} />Work complete · history retained</>
                            : context.total === 0
                              ? <><TriangleAlert size={14} />Wiring schedule required</>
                              : <><Info size={14} />Select to assign</>}
                        </span>
                      )}
                      {context.canRemove && <span className="pa-lock-note">Available until work starts</span>}
                      {context.canChangeover && <span className="pa-lock-note"><Lock size={13} />Removal locked after start</span>}
                    </div>
                  </article>
                );
              })}
            </div>
          </section>

          <section className="pa-section" aria-labelledby="pa-tech-title">
            <header className="pa-section-header">
              <div>
                <span className="pa-step">2</span>
                <div>
                  <h3 id="pa-tech-title">{changeoverTarget ? 'Choose replacement' : 'Choose technician'}</h3>
                  <p>Only available technicians can be selected</p>
                </div>
              </div>
            </header>

            {changeoverTarget && (
              <div className="pa-changeover-fields">
                <label>
                  <span>Changeover reason <b>*</b></span>
                  <select
                    className="form-select"
                    value={changeoverReason}
                    onChange={event => { setChangeoverReason(event.target.value as ChangeoverReason | ''); setError(''); }}
                  >
                    <option value="">Select reason…</option>
                    {CHANGEOVER_REASONS.map(reason => <option key={reason} value={reason}>{reason}</option>)}
                  </select>
                </label>
                <label>
                  <span>Supervisor notes {changeoverReason === 'Other' && <b>*</b>}</span>
                  <input
                    className="form-input"
                    value={changeoverNotes}
                    onChange={event => { setChangeoverNotes(event.target.value); setError(''); }}
                    placeholder={changeoverReason === 'Other' ? 'Reason details required' : 'Optional confirmation note'}
                  />
                </label>
              </div>
            )}

            <label className="pa-search">
              <Search size={17} />
              <input
                value={techQuery}
                onChange={event => setTechQuery(event.target.value)}
                placeholder="Search technicians"
                aria-label="Search technicians"
              />
            </label>

            <div className="pa-tech-list">
              {loading ? (
                <p className="pa-empty">Loading technician availability…</p>
              ) : filteredTechnicians.length === 0 ? (
                <p className="pa-empty">No technicians match this search.</p>
              ) : filteredTechnicians.map(tech => {
                const engagement = engagementByTech.get(tech.id) ?? { assigned: 0, working: 0 };
                const isOutgoing = tech.id === changeoverTarget?.current?.technician_id;
                const selectable = tech.status === 'available' && !isOutgoing && !busy;
                const selected = selectedTechId === tech.id;
                return (
                  <button
                    key={tech.id}
                    type="button"
                    className={`pa-tech-card${selected ? ' is-selected' : ''}`}
                    onClick={() => selectable && setSelectedTechId(selected ? null : tech.id)}
                    disabled={!selectable}
                    title={isOutgoing
                      ? 'The outgoing technician cannot replace themselves.'
                      : tech.status !== 'available' ? 'This technician already has active panel work.' : undefined}
                  >
                    <span className="pa-avatar">{tech.initials}</span>
                    <span className="pa-tech-copy">
                      <span><strong>{tech.full_name}</strong>{tech.employee_id && <small>{tech.employee_id}</small>}</span>
                      <small>{isOutgoing ? 'Outgoing technician' : engagementLabel(engagement.assigned, engagement.working)}</small>
                    </span>
                    <span className={`pa-tech-status pa-tech-status--${tech.status}`}>
                      <span />{technicianStatusLabel(tech.status)}
                    </span>
                  </button>
                );
              })}
            </div>

            <div className="pa-selection-summary">
              {changeoverTarget ? (
                <>
                  <ArrowLeftRight size={16} />
                  <span>{selectedTech
                    ? `${selectedTech.full_name} will receive ${changeoverTarget.remaining} remaining cables.`
                    : 'Select an available replacement technician.'}</span>
                </>
              ) : (
                <>
                  <UserPlus size={16} />
                  <span>{selectedTech
                    ? `${selectedTech.full_name} selected for ${selectedContexts.length} panel${selectedContexts.length === 1 ? '' : 's'}.`
                    : 'Select one available technician for the chosen panels.'}</span>
                </>
              )}
            </div>
          </section>
        </div>

        <div className="pa-history-note">
          <Info size={16} />
          <span>Assignments are supervisor-controlled. After Start or the first cable update, removal is locked; Mid Changeover preserves completed work and the full outgoing/incoming audit history.</span>
        </div>
      </div>

      {toast && <Toast message={toast.message} tone={toast.tone} onDismiss={() => setToast(null)} />}
    </Modal>
  );
}
