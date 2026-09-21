import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import Modal from '../Modal';
import { projectsApi, supervisorApi, usersApi } from '../../services/api';
import { emitWorkflowChanged } from '../../utils/dwesRefreshEvents';
import type { FramePanel } from '../assignment/ProjectPanelSelect';
import TechnicianSelect from '../assignment/TechnicianSelect';
import type { AssignmentRow, TechUser } from '../../utils/assignmentCenterUtils';
import type { PanelActivityData } from '../../types';
import { ArrowLeftRight, CheckCircle, TriangleAlert, UserPlus, User } from '../ui/icons';
import { DwesLoadingCenter } from '../ui/DwesLoadingIndicator';
import LiveTbPanelStatusStrip from './LiveTbPanelStatusStrip';
import { useAppDialog } from '../AppDialogProvider';

/** Kept for compatibility with callers; supervisor workflow now performs initial assignment only. */
export type TechnicianWorkflowSection = 'assign' | 'deassign' | 'changeover';

export interface TechnicianWorkflowModalProps {
  onClose: () => void;
  initialSection?: TechnicianWorkflowSection;
  projectCode: string;
  panelId: string;
  projectName: string;
  panelName: string;
  cableCount?: number;
  /** When true, render assign UI without its own Modal shell (Workflow Assignments tab). */
  embedded?: boolean;
  /** Called after a successful assign in embedded mode so the parent can refresh. */
  onAssigned?: () => void;
  /** Optional panelActivity / lifecycle projection from parent (prefer when available). */
  activity?: PanelActivityData | null;
  /** Open a specific confirmation flow from the parent (e.g. Assignments tab CTA). */
  forceConfirm?: 'reassign' | 'midchange' | null;
  onForceConfirmConsumed?: () => void;
}

type TechnicianOption = TechUser & {
  availability_status?: 'AVAILABLE' | 'ASSIGNED';
};

function messageFrom(error: unknown): string {
  return (error as { response?: { data?: { message?: string } } })?.response?.data?.message
    || 'The technician could not be assigned. Please refresh and try again.';
}

function formatAssignmentTime(value: string | Date | null | undefined): string {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return new Intl.DateTimeFormat(undefined, {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(d);
}

function statusDisplayLabel(status: string | null | undefined): { label: string; tone: string } {
  switch (status) {
    case 'in_progress': return { label: 'In Progress', tone: 'progress' };
    case 'paused': return { label: 'Paused', tone: 'paused' };
    case 'assigned': return { label: 'Assigned', tone: 'assigned' };
    case 'completed': return { label: 'Completed', tone: 'done' };
    default: return { label: String(status || 'Unknown').replace(/_/g, ' '), tone: 'idle' };
  }
}

export default function PanelAssignmentModal({
  onClose,
  projectCode,
  panelId,
  projectName,
  panelName,
  cableCount = 0,
  embedded = false,
  onAssigned,
  activity: activityProp = null,
  forceConfirm = null,
  onForceConfirmConsumed,
}: TechnicianWorkflowModalProps) {
  const dialog = useAppDialog();
  const [technicians, setTechnicians] = useState<TechnicianOption[]>([]);
  const [assignments, setAssignments] = useState<AssignmentRow[]>([]);
  const [panel, setPanel] = useState<FramePanel | null>(null);
  const [activityLocal, setActivityLocal] = useState<PanelActivityData | null>(null);
  const [selectedTechnicianId, setSelectedTechnicianId] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [assignedName, setAssignedName] = useState('');
  const confirmOpenRef = useRef(false);

  const reload = useCallback(async () => {
    const [techRows, assignmentRows, panels, act] = await Promise.all([
      usersApi.technicians(),
      supervisorApi.allPanels(),
      projectsApi.frames(projectCode),
      supervisorApi.panelActivity(projectCode, panelId).catch(() => null),
    ]);
    setTechnicians(Array.isArray(techRows) ? techRows : []);
    setAssignments(Array.isArray(assignmentRows) ? assignmentRows : []);
    const panelRows = Array.isArray(panels) ? panels as FramePanel[] : [];
    setPanel(panelRows.find(item => item.id === panelId) ?? null);
    setActivityLocal((act && typeof act === 'object') ? act as PanelActivityData : null);
  }, [panelId, projectCode]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    reload().catch(loadError => {
      if (active) setError(messageFrom(loadError));
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, [reload]);

  const activity = activityProp ?? activityLocal;

  const activeAssignments = useMemo(
    () => assignments.filter(assignment => (
      ['assigned', 'in_progress', 'paused'].includes(String(assignment.status || ''))
      && !assignment.changeover_locked
    )),
    [assignments],
  );
  const panelAssignment = activeAssignments.find(assignment => (
    assignment.project_code === projectCode && assignment.frame_id === panelId
  ));
  const assignedTechnicianIds = useMemo(
    () => new Set(activeAssignments.map(assignment => assignment.technician_id)),
    [activeAssignments],
  );
  const selectedTechnician = technicians.find(technician => String(technician.id) === selectedTechnicianId);
  const availableTechnicianCount = technicians.filter(technician => (
    !assignedTechnicianIds.has(technician.id) && technician.availability_status !== 'ASSIGNED'
  )).length;
  const assignedTechnicianCount = technicians.length - availableTechnicianCount;
  const resolvedPanelName = panel?.panel_name || panelName || panelId;
  const resolvedCableCount = Number(panel?.cable_count ?? cableCount ?? activity?.cables_total ?? 0);
  const scheduleReady = resolvedCableCount > 0;
  const canAssign = Boolean(
    selectedTechnician
    && !assignedTechnicianIds.has(selectedTechnician.id)
    && !panelAssignment
    && scheduleReady,
  );

  const assignedTech = panelAssignment
    ? technicians.find(t => t.id === panelAssignment.technician_id) ?? null
    : null;
  const assignedTechName = activity?.technician?.name
    || assignedTech?.full_name
    || panelAssignment?.technician_name
    || (panelAssignment ? `Tech #${panelAssignment.technician_id}` : '—');
  const assignedTechUsername = activity?.technician?.username || assignedTech?.username || '';
  const assignmentStatus = statusDisplayLabel(panelAssignment?.status || activity?.status);
  const statusRaw = String(panelAssignment?.status || activity?.status || '').toLowerCase();
  const startedAt = panelAssignment?.started_at ?? activity?.wiring_started_at ?? null;

  const canReassign = Boolean(
    activity?.can_reassign
    ?? (statusRaw === 'assigned' && !startedAt),
  );
  const canMidChange = Boolean(
    activity?.can_mid_change
    ?? (['in_progress', 'paused'].includes(statusRaw) || Boolean(startedAt)),
  );
  const notStarted = canReassign || (statusRaw === 'assigned' && !startedAt);
  const inProgress = canMidChange
    || ['in_progress', 'paused'].includes(statusRaw)
    || Boolean(startedAt);

  const progressPct = activity?.completion_percentage;

  const techOptions = useMemo(() => {
    const candidates = technicians.filter(t => (
      t.id !== panelAssignment?.technician_id
      && t.availability_status !== 'ASSIGNED'
      && !assignedTechnicianIds.has(t.id)
    ));
    const list = candidates.length
      ? candidates
      : technicians.filter(t => t.id !== panelAssignment?.technician_id);
    return list.map(t => ({
      value: String(t.id),
      label: t.full_name || t.username || `Tech #${t.id}`,
    }));
  }, [assignedTechnicianIds, panelAssignment?.technician_id, technicians]);

  const openAssignConfirm = async () => {
    if (!canAssign || !selectedTechnician) return;
    setError('');
    const techName = selectedTechnician.full_name || selectedTechnician.username || `Tech #${selectedTechnician.id}`;
    const ok = await dialog.confirmAsync(
      {
        title: 'Confirm Technician Assignment',
        message: 'Assign the selected technician to this panel for wiring execution.',
        tone: 'warning',
        confirmText: 'Confirm Assignment',
        consequence: 'The technician will receive this panel as their authorised assignment. Wiring can start after acknowledgement.',
        actionSummary: `Assign ${techName} to ${resolvedPanelName}.`,
        comparison: {
          current: [
            { label: 'Technician', value: 'Unassigned' },
            { label: 'Panel', value: resolvedPanelName },
            { label: 'Project', value: projectName || projectCode },
          ],
          proposed: [
            { label: 'Technician', value: techName },
            { label: 'Panel', value: resolvedPanelName },
            { label: 'Wire count', value: String(resolvedCableCount) },
          ],
        },
        entity: [
          { label: 'Project', value: projectName || projectCode, kind: 'project' },
          { label: 'Panel', value: resolvedPanelName, kind: 'panel' },
          { label: 'Technician', value: techName, kind: 'user' },
        ],
      },
      async () => {
        await supervisorApi.assignFrame({
          project_code: projectCode,
          frame_id: panelId,
          technician_id: selectedTechnician.id,
        });
        setAssignedName(techName);
        emitWorkflowChanged({ scope: 'assignment', projectCode, frameId: panelId });
        await reload().catch(() => {});
        onAssigned?.();
      },
    );
    if (!ok) return;
  };

  const openReassignConfirm = useCallback(async () => {
    if (!panelAssignment || confirmOpenRef.current) return;
    confirmOpenRef.current = true;
    setError('');
    try {
      await dialog.confirmAsync(
        {
          title: 'Confirm Panel Reassignment',
          message: 'Reassign this panel to another technician before wiring starts.',
          tone: 'warning',
          confirmText: 'Confirm Reassignment',
          consequence: 'The current technician loses this panel. The receiving technician becomes the authorised assignee. Wiring history remains empty because work has not started.',
          actionSummary: `Reassign ${resolvedPanelName} from ${assignedTechName}.`,
          comparison: {
            current: [
              { label: 'Technician', value: assignedTechName },
              { label: 'Panel', value: resolvedPanelName },
              { label: 'Status', value: 'Wiring Not Started' },
              { label: 'Wire count', value: String(resolvedCableCount) },
            ],
            proposed: [
              { label: 'Technician', value: 'Selected below' },
              { label: 'Panel', value: resolvedPanelName },
              { label: 'Status', value: 'Assigned' },
            ],
          },
          entity: [
            { label: 'Project', value: projectName || projectCode, kind: 'project' },
            { label: 'Panel', value: resolvedPanelName, kind: 'panel' },
            { label: 'Current technician', value: assignedTechName, kind: 'user' },
          ],
          formFields: [
            {
              name: 'technicianId',
              type: 'select',
              label: 'Receiving technician',
              required: true,
              placeholder: 'Select technician…',
              options: techOptions,
            },
            {
              name: 'reason',
              type: 'textarea',
              label: 'Reason',
              required: true,
              placeholder: 'Why is this panel being reassigned?',
              rows: 3,
            },
          ],
        },
        async (values) => {
          const newTechId = Number(values?.technicianId);
          const reason = (values?.reason || '').trim();
          if (!newTechId || !reason) {
            throw new Error('Receiving technician and reason are required.');
          }
          await supervisorApi.reassignBeforeStart({
            assignment_id: panelAssignment.id,
            new_technician_id: newTechId,
            reason,
          });
          emitWorkflowChanged({ scope: 'assignment', projectCode, frameId: panelId });
          await reload().catch(() => {});
          onAssigned?.();
        },
      );
    } finally {
      confirmOpenRef.current = false;
    }
  }, [
    assignedTechName,
    dialog,
    onAssigned,
    panelAssignment,
    panelId,
    projectCode,
    projectName,
    reload,
    resolvedCableCount,
    resolvedPanelName,
    techOptions,
  ]);

  const openMidChangeConfirm = useCallback(async () => {
    if (!panelAssignment || confirmOpenRef.current) return;
    confirmOpenRef.current = true;
    setError('');
    const completed = activity?.cables_completed ?? 0;
    const remaining = activity?.cables_remaining ?? Math.max(0, resolvedCableCount - completed);
    try {
      await dialog.confirmAsync(
        {
          title: 'Confirm Mid Change',
          message: 'Transfer active wiring work to another technician while preserving completed wires and audit history.',
          tone: 'warning',
          confirmText: 'Confirm Mid Change',
          consequence: 'This closes the current technician\'s active work on this panel and opens a Mid Change transfer. Completed wires and audit history are preserved.',
          actionSummary: `Mid Change ${resolvedPanelName} from ${assignedTechName}.`,
          comparison: {
            current: [
              { label: 'Technician', value: assignedTechName },
              { label: 'Panel', value: resolvedPanelName },
              { label: 'Completed / remaining', value: `${completed} / ${remaining} wires` },
              { label: 'Progress', value: progressPct != null ? `${progressPct}%` : assignmentStatus.label },
              { label: 'Wiring status', value: assignmentStatus.label },
            ],
            proposed: [
              { label: 'Technician', value: 'Selected below' },
              { label: 'Panel', value: resolvedPanelName },
              { label: 'Preserved work', value: `${completed} completed wires` },
            ],
          },
          entity: [
            { label: 'Project', value: projectName || projectCode, kind: 'project' },
            { label: 'Panel', value: resolvedPanelName, kind: 'panel' },
            { label: 'Current technician', value: assignedTechName, kind: 'user' },
          ],
          formFields: [
            {
              name: 'technicianId',
              type: 'select',
              label: 'Receiving technician',
              required: true,
              placeholder: 'Select technician…',
              options: techOptions,
            },
            {
              name: 'reason',
              type: 'textarea',
              label: 'Reason',
              required: true,
              placeholder: 'Why is Mid Change required?',
              rows: 3,
            },
          ],
        },
        async (values) => {
          const newTechId = Number(values?.technicianId);
          const reason = (values?.reason || '').trim();
          if (!newTechId || !reason) {
            throw new Error('Receiving technician and reason are required.');
          }
          await supervisorApi.midChangeover({
            old_assignment_id: panelAssignment.id,
            new_technician_id: newTechId,
            changeover_reason: 'Other',
            reason_notes: reason,
          });
          emitWorkflowChanged({ scope: 'assignment', projectCode, frameId: panelId });
          await reload().catch(() => {});
          onAssigned?.();
        },
      );
    } finally {
      confirmOpenRef.current = false;
    }
  }, [
    activity?.cables_completed,
    activity?.cables_remaining,
    assignedTechName,
    assignmentStatus.label,
    dialog,
    onAssigned,
    panelAssignment,
    panelId,
    progressPct,
    projectCode,
    projectName,
    reload,
    resolvedCableCount,
    resolvedPanelName,
    techOptions,
  ]);

  useEffect(() => {
    if (!forceConfirm || loading || !panelAssignment || confirmOpenRef.current) return;
    onForceConfirmConsumed?.();
    if (forceConfirm === 'reassign') void openReassignConfirm();
    if (forceConfirm === 'midchange') void openMidChangeConfirm();
  }, [
    forceConfirm,
    loading,
    onForceConfirmConsumed,
    openMidChangeConfirm,
    openReassignConfirm,
    panelAssignment,
  ]);

  const wrap = (title: string, body: ReactNode, footer: ReactNode, size: 'form' | 'lg' = 'lg') => {
    if (embedded) {
      return (
        <div className="pw-embed-assign">
          <div className="pw-embed-assign__head">
            <h3>{title}</h3>
            <p>{projectName || projectCode} · {resolvedPanelName}</p>
          </div>
          {body}
          <div className="pw-embed-assign__footer">{footer}</div>
        </div>
      );
    }
    return (
      <Modal
        title={title}
        subtitle={`${projectName || projectCode} · ${resolvedPanelName}`}
        icon={panelAssignment ? <User /> : <UserPlus />}
        onClose={onClose}
        size={size}
        bodyClassName={panelAssignment ? undefined : 'assign-technician-modal-body'}
        footer={footer}
      >
        {body}
      </Modal>
    );
  };

  if (!loading && panelAssignment) {
    return wrap(
      'Panel Already Assigned',
      (
        <div className="assign-already-shell">
          <section className="assign-technician-context" aria-label="Selected project and panel">
            <div className="assign-technician-context-item">
              <span className="assign-technician-context-label">Project Name</span>
              <strong className="assign-technician-context-value" title={projectName || projectCode}>
                {projectName || projectCode}
              </strong>
              <span className="assign-technician-context-meta" title={projectCode}>{projectCode}</span>
            </div>
            <div className="assign-technician-context-item">
              <span className="assign-technician-context-label">Panel Name</span>
              <strong className="assign-technician-context-value" title={resolvedPanelName}>
                {resolvedPanelName}
              </strong>
              <span className="assign-technician-context-meta">{resolvedCableCount} assigned cables</span>
            </div>
          </section>

          <div className="assign-already-card">
            <div className="assign-already-card-header">
              <div className="assign-already-card-heading">
                <span className="assign-already-pulse-wrap">
                  <span className="assign-already-pulse" data-tone={assignmentStatus.tone} />
                </span>
                <span className="assign-already-status-badge" data-tone={assignmentStatus.tone}>
                  {assignmentStatus.label}
                </span>
              </div>
              <span className="assign-already-panel-badge">{resolvedPanelName}</span>
            </div>

            <div className="assign-already-tech-row">
              <div className="assign-already-avatar" aria-hidden="true">
                <User size={22} />
              </div>
              <div className="assign-already-tech-info">
                <strong className="assign-already-tech-name">{assignedTechName}</strong>
                {assignedTechUsername && (
                  <span className="assign-already-tech-username">@{assignedTechUsername}</span>
                )}
              </div>
            </div>

            <div className="assign-already-meta-grid">
              <div className="assign-already-meta">
                <span className="assign-already-meta-label">Assigned</span>
                <strong>{formatAssignmentTime(panelAssignment.assigned_at || activity?.assigned_at)}</strong>
              </div>
              <div className="assign-already-meta">
                <span className="assign-already-meta-label">Wiring started</span>
                <strong>{startedAt ? formatAssignmentTime(startedAt) : 'Not Started'}</strong>
              </div>
              <div className="assign-already-meta">
                <span className="assign-already-meta-label">Work status</span>
                <strong>
                  {assignmentStatus.label}
                  {panelAssignment.pause_reason || activity?.pause_reason
                    ? ` — ${panelAssignment.pause_reason || activity?.pause_reason}`
                    : ''}
                </strong>
              </div>
              {progressPct != null && (
                <div className="assign-already-meta">
                  <span className="assign-already-meta-label">Progress</span>
                  <strong>{progressPct}%</strong>
                </div>
              )}
            </div>
          </div>

          {(notStarted || inProgress) && (
            <div className="assign-already-midchange-notice" role="note">
              <ArrowLeftRight size={18} className="shrink-0" />
              <div>
                <strong>{notStarted ? 'Reassign before wiring starts' : 'Transfer active wiring work'}</strong>
                <p>
                  {notStarted
                    ? 'This panel has not started. You can reassign to another technician without Mid Change.'
                    : 'Wiring has started. Use Mid Change to transfer the panel while preserving completed work and audit history.'}
                </p>
              </div>
            </div>
          )}
        </div>
      ),
      (
        <>
          {!embedded && (
            <button type="button" className="btn-secondary" onClick={onClose}>Close</button>
          )}
          {notStarted && (
            <button
              type="button"
              className="btn-primary"
              onClick={() => { void openReassignConfirm(); }}
            >
              <User size={17} />
              Reassign Technician
            </button>
          )}
          {inProgress && !notStarted && (
            <button
              type="button"
              className="btn-primary"
              onClick={() => { void openMidChangeConfirm(); }}
            >
              <ArrowLeftRight size={17} />
              Start Mid Change
            </button>
          )}
          {embedded && !notStarted && !inProgress && (
            <span className="pw-embed-assign__hint">Assignment is locked for this panel state.</span>
          )}
        </>
      ),
      'form',
    );
  }

  return wrap(
    'Assign Technician',
    (
      <div className="assign-technician-shell">
        {!embedded && (
          <section className="assign-technician-context" aria-label="Selected project and panel">
            <div className="assign-technician-context-item">
              <span className="assign-technician-context-label">Project Name</span>
              <strong className="assign-technician-context-value" title={projectName || projectCode}>
                {projectName || projectCode}
              </strong>
              <span className="assign-technician-context-meta" title={projectCode}>{projectCode}</span>
            </div>
            <div className="assign-technician-context-item">
              <span className="assign-technician-context-label">Panel Name</span>
              <strong className="assign-technician-context-value" title={resolvedPanelName}>
                {resolvedPanelName}
              </strong>
              <span className="assign-technician-context-meta">{resolvedCableCount} assigned cables</span>
            </div>
          </section>
        )}

        {loading && (
          <DwesLoadingCenter label="Loading technician availability…" className="assign-technician-loading" size="sm" />
        )}

        {!loading && (
          <LiveTbPanelStatusStrip
            projectCode={projectCode}
            frameId={panelId}
            className="assign-live-tb-status"
          />
        )}

        {!loading && !scheduleReady && (
          <div className="assign-technician-notice" role="status">
            <TriangleAlert size={16} className="mt-0.5 shrink-0" />
            <span>Upload the panel wiring schedule before assigning a technician.</span>
          </div>
        )}

        {!assignedName && (
          <section className="assign-technician-picker" aria-labelledby="assign-technician-list-heading">
            <div className="assign-technician-picker-header">
              <div>
                <h3 id="assign-technician-list-heading">Technicians</h3>
                <p>Select one available technician for this panel.</p>
              </div>
              <div className="assign-technician-counts" aria-label="Technician availability summary">
                <span className="is-available"><i aria-hidden="true" />{availableTechnicianCount} available</span>
                <span className="is-assigned"><i aria-hidden="true" />{assignedTechnicianCount} assigned</span>
              </div>
            </div>
            <TechnicianSelect
              options={technicians.map(technician => ({
                id: technician.id,
                name: technician.full_name || technician.username || `Tech #${technician.id}`,
                username: technician.username,
                assigned: assignedTechnicianIds.has(technician.id)
                  || technician.availability_status === 'ASSIGNED',
              }))}
              value={selectedTechnicianId}
              onChange={id => { setSelectedTechnicianId(id); setError(''); }}
              disabled={loading || !scheduleReady}
              inlineList
            />
          </section>
        )}

        {assignedName && (
          <div className="assign-technician-success">
            <CheckCircle size={18} className="mt-0.5 shrink-0" />
            <div>
              <strong>{assignedName}</strong>
              <span>was assigned to {resolvedPanelName}. The panel is now available on the technician dashboard.</span>
            </div>
          </div>
        )}

        {error && <div className="form-error">{error}</div>}
      </div>
    ),
    assignedName ? (
      embedded
        ? <span className="pw-embed-assign__hint">Assignment saved.</span>
        : <button type="button" className="btn-secondary" onClick={onClose}>Close</button>
    ) : (
      <>
        {!embedded && (
          <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
        )}
        <button
          type="button"
          className="btn-primary disabled:cursor-not-allowed disabled:opacity-40"
          onClick={openAssignConfirm}
          disabled={!canAssign}
        >
          <UserPlus size={17} />
          Assign Technician
        </button>
      </>
    ),
  );
}
