import { useCallback, useEffect, useMemo, useState } from 'react';
import Modal from '../Modal';
import { supervisorApi, techApi, usersApi } from '../../services/api';
import { emitFramesChanged } from '../../utils/projectFramesEvents';
import { emitWorkflowChanged } from '../../utils/dwesRefreshEvents';
import { useDwesRefresh } from '../../hooks/useDwesRefresh';
import Toast, { type ToastTone } from '../ui/Toast';
import {
  CHANGEOVER_REASONS,
  type ChangeoverReason,
} from '../assignment/MidChangeoverModal';
import {
  buildTechResources,
  isActiveAssignment,
  type AssignmentRow,
  type TechResource,
  type TechResourceStatus,
  type TechUser,
} from '../../utils/assignmentCenterUtils';
import {
  ArrowLeftRight,
  Info,
  TriangleAlert,
  UserPlus,
  Users,
} from '../ui/icons';

/** Kept for drop-in compatibility with the previous Smart Assignment Center entry point. */
export type TechnicianWorkflowSection = 'assign' | 'deassign' | 'changeover';

export interface TechnicianWorkflowModalProps {
  onClose: () => void;
  /** Accepted for backward compatibility; the compact modal has no tabs. */
  initialSection?: TechnicianWorkflowSection;
  projectCode: string;
  panelId: string;
  projectName: string;
  panelName: string;
  cableCount?: number;
}

type PanelState = 'unassigned' | 'assigned' | 'started';

const STATUS_DOT: Record<TechResourceStatus, string> = {
  available: 'bg-emerald-500',
  working: 'bg-blue-500',
  on_break: 'bg-amber-500',
  material_delay: 'bg-orange-500',
  qa_qc: 'bg-violet-500',
  offline: 'bg-slate-400',
};

function techEngagementLabel(assigned: number, active: number): string {
  const total = assigned + active;
  if (total === 0) return 'Free — no active panels';
  const base = `${total} active panel${total > 1 ? 's' : ''}`;
  return active > 0 ? `${base} · ${active} in progress` : base;
}

export default function PanelAssignmentModal({
  onClose,
  projectCode,
  panelId,
  panelName,
  cableCount,
}: TechnicianWorkflowModalProps) {
  const [techUsers, setTechUsers] = useState<TechUser[]>([]);
  const [allAssignments, setAllAssignments] = useState<AssignmentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [selectedTechId, setSelectedTechId] = useState<number | null>(null);
  const [changeoverReason, setChangeoverReason] = useState<ChangeoverReason | ''>('');
  const [changeoverNotes, setChangeoverNotes] = useState('');
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [toast, setToast] = useState<{ message: string; tone: ToastTone } | null>(null);

  const loadContext = useCallback(async () => {
    const [techs, panels] = await Promise.all([
      usersApi.technicians().catch(() => []),
      supervisorApi.allPanels().catch(() => []),
    ]);
    setTechUsers(Array.isArray(techs) ? (techs as TechUser[]) : []);
    setAllAssignments(Array.isArray(panels) ? (panels as AssignmentRow[]) : []);
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    loadContext().finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [loadContext]);

  useDwesRefresh(loadContext, { pollMs: 12_000, listenFrames: true, listenWorkflow: true });

  const techResources = useMemo(
    () => buildTechResources(techUsers, allAssignments, projectCode),
    [techUsers, allAssignments, projectCode],
  );

  const engagementByTech = useMemo(() => {
    const map = new Map<number, { assigned: number; active: number }>();
    for (const a of allAssignments) {
      if (!isActiveAssignment(a)) continue;
      const e = map.get(a.technician_id) ?? { assigned: 0, active: 0 };
      if (String(a.status) === 'assigned') e.assigned += 1;
      else e.active += 1;
      map.set(a.technician_id, e);
    }
    return map;
  }, [allAssignments]);

  const currentAssignment = useMemo(() => {
    const rows = allAssignments.filter(
      a => a.project_code === projectCode
        && a.frame_id === panelId
        && !a.changeover_locked
        && isActiveAssignment(a),
    );
    if (!rows.length) return null;
    for (const s of ['in_progress', 'assigned', 'paused']) {
      const match = rows.find(a => String(a.status) === s);
      if (match) return match;
    }
    return rows[0];
  }, [allAssignments, projectCode, panelId]);

  const started = currentAssignment
    ? (currentAssignment.started_at != null || String(currentAssignment.status) !== 'assigned')
    : false;

  const panelState: PanelState = !currentAssignment
    ? 'unassigned'
    : started ? 'started' : 'assigned';

  const scheduleReady = (cableCount ?? 0) > 0;
  const currentTechName = currentAssignment?.technician_name
    || techUsers.find(t => t.id === currentAssignment?.technician_id)?.full_name
    || 'Technician';
  const currentKpi = Number(currentAssignment?.kpi ?? 0);

  // The technician the current panel is assigned to (hidden from the pick list when relevant).
  const currentTechId = currentAssignment?.technician_id ?? null;

  const reasonValid = changeoverReason !== ''
    && (changeoverReason !== 'Other' || changeoverNotes.trim().length > 0);
  const canAssign = panelState === 'unassigned' && scheduleReady && selectedTechId != null;
  const canChangeover = panelState === 'started' && selectedTechId != null && reasonValid;

  const showToast = (message: string, tone: ToastTone = 'success') => setToast({ message, tone });

  const runAction = async (fn: () => Promise<void>, successMsg: string) => {
    setBusy(true);
    setError('');
    try {
      await fn();
      emitFramesChanged({ projectCode, frameId: panelId, action: 'updated' });
      emitWorkflowChanged({ scope: 'assignment', projectCode, frameId: panelId });
      await loadContext();
      setSelectedTechId(null);
      setConfirmRemove(false);
      showToast(successMsg, 'success');
    } catch (e) {
      const msg = (e as { response?: { data?: { message?: string } } })?.response?.data?.message
        || 'Action failed. Please try again.';
      setError(msg);
    } finally {
      setBusy(false);
    }
  };

  const handleAssign = () => {
    if (selectedTechId == null) return;
    const tech = techResources.find(t => t.id === selectedTechId);
    void runAction(
      () => supervisorApi.assignFrame({ project_code: projectCode, frame_id: panelId, technician_id: selectedTechId }),
      `Panel assigned to ${tech?.full_name ?? 'technician'}`,
    );
  };

  const handleRemove = () => {
    if (!currentAssignment) return;
    void runAction(
      () => techApi.delete(currentAssignment.id),
      'Assignment removed',
    );
  };

  const handleChangeover = () => {
    if (!currentAssignment || selectedTechId == null || !reasonValid) return;
    const tech = techResources.find(t => t.id === selectedTechId);
    void runAction(
      () => supervisorApi.midChangeover({
        old_assignment_id: currentAssignment.id,
        new_technician_id: selectedTechId,
        changeover_reason: changeoverReason,
        reason_notes: changeoverNotes.trim() || undefined,
      }),
      `Changed over to ${tech?.full_name ?? 'new technician'}`,
    );
  };

  // Which techs are selectable in the list: everyone when unassigned; everyone except the
  // current tech when doing a changeover; none when simply assigned-not-started.
  const selectable = panelState === 'unassigned'
    || (panelState === 'started');
  const rowIsSelectable = (t: TechResource) =>
    selectable && !(panelState === 'started' && t.id === currentTechId);

  const banner = (() => {
    if (panelState === 'unassigned') {
      return (
        <div className="flex items-start gap-2 rounded-[10px] border border-slate-200 bg-slate-50 px-3 py-2.5">
          <UserPlus size={16} className="mt-0.5 shrink-0 text-slate-500" />
          <div className="text-[13px] text-slate-700">
            <span className="font-semibold">Unassigned.</span> Select a technician below to assign this panel.
          </div>
        </div>
      );
    }
    if (panelState === 'assigned') {
      return (
        <div className="flex items-start gap-2 rounded-[10px] border border-blue-200 bg-blue-50 px-3 py-2.5">
          <Users size={16} className="mt-0.5 shrink-0 text-blue-600" />
          <div className="text-[13px] text-blue-900">
            Assigned to <span className="font-semibold">{currentTechName}</span> — not started yet.
            You can remove this assignment until work begins.
          </div>
        </div>
      );
    }
    return (
      <div className="flex items-start gap-2 rounded-[10px] border border-emerald-200 bg-emerald-50 px-3 py-2.5">
        <ArrowLeftRight size={16} className="mt-0.5 shrink-0 text-emerald-600" />
        <div className="text-[13px] text-emerald-900">
          In progress with <span className="font-semibold">{currentTechName}</span> ({currentKpi}% wired).
          Work has started — you can only hand over to another technician.
        </div>
      </div>
    );
  })();

  return (
    <Modal
      title="Panel Assignment"
      subtitle={`${projectCode} · ${panelName}${scheduleReady ? ` · ${cableCount} cables` : ''}`}
      onClose={onClose}
      size="lg"
      footer={
        panelState === 'unassigned' ? (
          <>
            <button onClick={onClose} className="btn-secondary" type="button">Close</button>
            <button
              onClick={handleAssign}
              disabled={busy || !canAssign}
              className="btn-primary disabled:opacity-40 disabled:cursor-not-allowed"
              type="button"
            >
              {busy ? 'Assigning…' : 'Assign panel'}
            </button>
          </>
        ) : panelState === 'assigned' ? (
          <>
            <button onClick={onClose} className="btn-secondary" type="button">Close</button>
            {confirmRemove ? (
              <button
                onClick={handleRemove}
                disabled={busy}
                className="btn-danger disabled:opacity-40 disabled:cursor-not-allowed"
                type="button"
              >
                {busy ? 'Removing…' : 'Confirm remove'}
              </button>
            ) : (
              <button onClick={() => setConfirmRemove(true)} className="btn-danger" type="button">
                Remove assignment
              </button>
            )}
          </>
        ) : (
          <>
            <button onClick={onClose} className="btn-secondary" type="button">Close</button>
            <button
              onClick={handleChangeover}
              disabled={busy || !canChangeover}
              className="btn-primary disabled:opacity-40 disabled:cursor-not-allowed"
              type="button"
            >
              {busy ? 'Processing…' : 'Confirm changeover'}
            </button>
          </>
        )
      }
    >
      <div className="flex flex-col gap-4">
        {banner}

        {!scheduleReady && panelState === 'unassigned' && (
          <div className="flex items-start gap-2 rounded-[10px] border border-amber-200 bg-amber-50 px-3 py-2.5">
            <TriangleAlert size={16} className="mt-0.5 shrink-0 text-amber-600" />
            <div className="text-[13px] text-amber-800">
              This panel has no imported cables yet — complete the wiring upload before assigning.
            </div>
          </div>
        )}

        {panelState === 'started' && (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="form-label mb-1">Changeover reason <span className="text-red-500">*</span></label>
              <select
                value={changeoverReason}
                onChange={e => { setChangeoverReason(e.target.value as ChangeoverReason | ''); setError(''); }}
                className="form-select"
                aria-label="Changeover reason"
              >
                <option value="">Select reason…</option>
                {CHANGEOVER_REASONS.map(r => (
                  <option key={r} value={r}>{r}</option>
                ))}
              </select>
            </div>
            {(changeoverReason === 'Other' || changeoverNotes) && (
              <div>
                <label className="form-label mb-1">
                  Details {changeoverReason === 'Other' && <span className="text-red-500">*</span>}
                </label>
                <input
                  type="text"
                  value={changeoverNotes}
                  onChange={e => { setChangeoverNotes(e.target.value); setError(''); }}
                  placeholder={changeoverReason === 'Other' ? 'Describe the reason…' : 'Optional notes…'}
                  className="form-input w-full"
                />
              </div>
            )}
          </div>
        )}

        <div>
          <div className="mb-1.5 flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wide text-slate-500">
              {panelState === 'started' ? 'Hand over to' : 'Technicians'}
            </span>
            {selectable && (
              <span className="text-[11px] text-slate-400">
                {panelState === 'started' ? 'Pick a replacement' : 'Pick one to assign'}
              </span>
            )}
          </div>

          {loading ? (
            <p className="py-6 text-center text-[13px] text-slate-400">Loading technicians…</p>
          ) : techResources.length === 0 ? (
            <p className="py-6 text-center text-[13px] text-slate-400">No active technicians found.</p>
          ) : (
            <ul className="flex max-h-[46vh] flex-col gap-1.5 overflow-y-auto pr-1">
              {techResources.map(t => {
                const eng = engagementByTech.get(t.id) ?? { assigned: 0, active: 0 };
                const isCurrent = t.id === currentTechId;
                const canPick = rowIsSelectable(t);
                const isSelected = selectedTechId === t.id;
                return (
                  <li key={t.id}>
                    <button
                      type="button"
                      disabled={!canPick}
                      onClick={() => canPick && setSelectedTechId(isSelected ? null : t.id)}
                      className={[
                        'flex w-full items-center gap-3 rounded-[10px] border px-3 py-2 text-left transition-colors',
                        isSelected
                          ? 'border-blue-400 bg-blue-50 ring-1 ring-blue-300'
                          : 'border-slate-200 bg-white',
                        canPick ? 'hover:border-slate-300 hover:bg-slate-50 cursor-pointer' : 'cursor-default',
                        !canPick && !isCurrent ? 'opacity-70' : '',
                      ].join(' ')}
                    >
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-100 text-[12px] font-bold text-slate-600">
                        {t.initials}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-2">
                          <span className="truncate text-[13px] font-semibold text-slate-900">{t.full_name}</span>
                          {isCurrent && (
                            <span className="rounded-full bg-slate-200 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-600">
                              Current
                            </span>
                          )}
                        </span>
                        <span className="truncate text-[11px] text-slate-500">
                          {techEngagementLabel(eng.assigned, eng.active)}
                        </span>
                      </span>
                      <span className="flex shrink-0 items-center gap-1.5">
                        <span className={`h-2 w-2 rounded-full ${STATUS_DOT[t.status]}`} aria-hidden />
                        <span className="text-[11px] font-medium text-slate-600">{t.statusLabel}</span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {panelState === 'started' && (
          <div className="assignment-info-callout flex items-start gap-1.5">
            <Info size={15} className="mt-0.5 shrink-0" />
            <span>The previous technician&apos;s completed cables and history are preserved and transferred to the new technician.</span>
          </div>
        )}

        {error && <div className="form-error">{error}</div>}
      </div>

      {toast && (
        <Toast message={toast.message} tone={toast.tone} onDismiss={() => setToast(null)} />
      )}
    </Modal>
  );
}
