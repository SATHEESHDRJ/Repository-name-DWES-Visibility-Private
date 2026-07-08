import { useEffect, useState } from 'react';
import Modal from '../Modal';
import { supervisorApi, usersApi } from '../../services/api';
import type { Project } from '../../types';
import ProjectPanelSelect, { type FramePanel } from './ProjectPanelSelect';
import { ArrowRight, CheckCircle, Info, TriangleAlert } from '../ui/icons';

export const CHANGEOVER_REASONS = [
  'Shift Change',
  'Leave',
  'Emergency',
  'Technical Support',
  'Workload Balancing',
  'Other',
] as const;

export type ChangeoverReason = (typeof CHANGEOVER_REASONS)[number];

export interface ChangeoverAssignment {
  id: number;
  project_code: string;
  frame_id: string;
  panel_name?: string;
  status?: string;
  technician_id: number;
  technician_name: string;
  completed_cables?: number;
  remaining_cables?: number;
  cables_total?: number;
  pause_reason?: string;
}

export interface MidChangeoverModalProps {
  onClose: () => void;
  onComplete: () => void;
  /** Called after successful changeover (e.g. show toast) */
  onSuccess?: (message: string) => void;
  projects?: Project[];
  initialProjectCode?: string;
  initialPanelId?: string;
  /** Pre-loaded assignment when opened from a card */
  initialAssignment?: ChangeoverAssignment | null;
  lockSelection?: boolean;
}

export default function MidChangeoverModal({
  onClose,
  onComplete,
  onSuccess,
  projects: projectsProp = [],
  initialProjectCode = '',
  initialPanelId = '',
  initialAssignment = null,
  lockSelection = false,
}: MidChangeoverModalProps) {
  const [projectCode, setProjectCode] = useState(initialProjectCode);
  const [panelId, setPanelId] = useState(initialPanelId);
  const [panels, setPanels] = useState<FramePanel[]>([]);
  const [assignment, setAssignment] = useState<ChangeoverAssignment | null>(initialAssignment);
  const [loadingAssignment, setLoadingAssignment] = useState(false);
  const [techs, setTechs] = useState<any[]>([]);
  const [selTech, setSelTech] = useState('');
  const [reason, setReason] = useState<ChangeoverReason | ''>('');
  const [reasonNotes, setReasonNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<any>(null);

  useEffect(() => {
    usersApi.technicians()
      .then(list => setTechs((list || []).filter((t: any) => t.is_active !== false)))
      .catch(() => {});
  }, []);

  useEffect(() => {
    setProjectCode(initialProjectCode);
    setPanelId(initialPanelId);
    if (initialAssignment) setAssignment(initialAssignment);
  }, [initialProjectCode, initialPanelId, initialAssignment]);

  useEffect(() => {
    if (!projectCode || !panelId) {
      if (!initialAssignment) setAssignment(null);
      return;
    }

    let cancelled = false;
    setLoadingAssignment(true);
    supervisorApi.changeoverCandidate(projectCode, panelId)
      .then(data => {
        if (cancelled) return;
        if (data) {
          setAssignment({
            ...data,
            ...(initialAssignment && lockSelection
              ? { id: initialAssignment.id, technician_id: initialAssignment.technician_id, technician_name: initialAssignment.technician_name }
              : {}),
          });
        } else if (!initialAssignment) {
          setAssignment(null);
        }
      })
      .catch(() => {
        if (!cancelled && !initialAssignment) setAssignment(null);
      })
      .finally(() => {
        if (!cancelled) setLoadingAssignment(false);
      });

    return () => { cancelled = true; };
  }, [projectCode, panelId, initialAssignment, lockSelection]);

  const projectName = projectsProp.find(p => p.code === projectCode)?.name ?? projectCode;
  const panelName = assignment?.panel_name
    ?? panels.find(p => p.id === panelId)?.panel_name
    ?? panelId;

  const availableTechs = techs.filter(t => t.id !== assignment?.technician_id);
  const canSelectTech = Boolean(assignment);
  const reasonValid = reason !== '' && (reason !== 'Other' || reasonNotes.trim().length > 0);
  const canConfirm = canSelectTech && Boolean(selTech) && reasonValid;

  const handleConfirm = async () => {
    if (!assignment) {
      setError('Select a project and panel with an active assignment');
      return;
    }
    if (!selTech) {
      setError('Select a replacement technician');
      return;
    }
    if (!reason) {
      setError('Select a changeover reason');
      return;
    }
    if (reason === 'Other' && !reasonNotes.trim()) {
      setError('Enter details for "Other" reason');
      return;
    }

    setSaving(true);
    setError('');
    try {
      const res = await supervisorApi.midChangeover({
        old_assignment_id: assignment.id,
        new_technician_id: parseInt(selTech, 10),
        changeover_reason: reason,
        reason_notes: reasonNotes.trim() || undefined,
      });
      setResult(res);
      onComplete();
      onSuccess?.(`Changeover complete — ${res.new_tech} assigned to ${res.panel_name || panelName}`);
    } catch (e: any) {
      setError(e?.response?.data?.message || 'Changeover failed');
    } finally {
      setSaving(false);
    }
  };

  const lockedSummary = lockSelection && assignment;

  return (
    <Modal
      title="Mid-Changeover Technician"
      onClose={onClose}
      footer={!result ? (
        <>
          <button onClick={onClose} className="btn-secondary" type="button">Cancel</button>
          <button
            onClick={handleConfirm}
            disabled={saving || !canConfirm}
            className="btn-primary disabled:opacity-40 disabled:cursor-not-allowed"
            type="button"
          >
            {saving ? 'Processing…' : 'Confirm Changeover'}
          </button>
        </>
      ) : (
        <button onClick={onClose} className="btn-primary" type="button">Done</button>
      )}
    >
      {!result ? (
        <>
          {lockedSummary ? (
            <div className="mb-4 p-3 bg-emerald-50 border border-emerald-200 rounded-[10px]">
              <div className="text-[11px] font-bold uppercase tracking-wide text-emerald-600 mb-1">Panel</div>
              <div className="text-[13px] font-semibold text-emerald-800">{panelName}</div>
              <div className="text-[11px] text-emerald-600 mt-0.5">Project: {projectName}</div>
            </div>
          ) : (
            <ProjectPanelSelect
              projects={projectsProp}
              selectedProjectCode={projectCode}
              selectedPanelId={panelId}
              onProjectChange={code => { setProjectCode(code); setError(''); setSelTech(''); }}
              onPanelChange={id => { setPanelId(id); setError(''); setSelTech(''); }}
              layout="stack"
              className="mb-4"
              onPanelsLoaded={setPanels}
            />
          )}

          {loadingAssignment && (
            <p className="text-[12px] text-slate-500 mb-4">Loading assignment…</p>
          )}

          {!loadingAssignment && projectCode && panelId && !assignment && (
            <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 flex items-start gap-2">
              <TriangleAlert size={16} className="text-amber-600 mt-0.5 shrink-0" />
              <div className="text-[13px] text-amber-800">
                No in-progress or paused assignment found for this panel.
              </div>
            </div>
          )}

          {assignment && (
            <>
              <div className="mb-4 p-3 bg-slate-50 border border-[#E2E8F0] rounded-[10px]">
                <div className="text-[11px] font-bold uppercase tracking-wide text-slate-500 mb-2">Current Technician</div>
                <div className="text-[14px] font-semibold text-slate-900">{assignment.technician_name}</div>
                {assignment.pause_reason && (
                  <div className="text-[11px] text-red-600 mt-1">Paused: {assignment.pause_reason}</div>
                )}
              </div>

              <div className="mb-4 grid grid-cols-2 gap-3">
                <div className="p-3 bg-white border border-[#E2E8F0] rounded-[10px]">
                  <div className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Completed Cables</div>
                  <div className="text-[20px] font-bold text-emerald-600 mt-1">{assignment.completed_cables ?? 0}</div>
                </div>
                <div className="p-3 bg-white border border-[#E2E8F0] rounded-[10px]">
                  <div className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Remaining Cables</div>
                  <div className="text-[20px] font-bold text-amber-600 mt-1">{assignment.remaining_cables ?? 0}</div>
                </div>
              </div>

              <div
                className={`mb-4 transition-opacity duration-200 ${canSelectTech ? 'opacity-100' : 'opacity-50 pointer-events-none'}`}
              >
                <label className="form-label mb-1">New Technician</label>
                <select
                  value={selTech}
                  onChange={e => { setSelTech(e.target.value); setError(''); }}
                  disabled={!canSelectTech}
                  className="form-select disabled:cursor-not-allowed"
                  aria-label="Select replacement technician"
                >
                  <option value="">Select replacement technician…</option>
                  {availableTechs.map(t => (
                    <option key={t.id} value={t.id}>{t.full_name} ({t.employee_id})</option>
                  ))}
                </select>
              </div>

              <div className="mb-4">
                <label className="form-label mb-1">Changeover Reason <span className="text-red-500">*</span></label>
                <select
                  value={reason}
                  onChange={e => { setReason(e.target.value as ChangeoverReason | ''); setError(''); }}
                  className="form-select"
                  aria-label="Changeover reason"
                >
                  <option value="">Select reason…</option>
                  {CHANGEOVER_REASONS.map(r => (
                    <option key={r} value={r}>{r}</option>
                  ))}
                </select>
              </div>

              {(reason === 'Other' || reasonNotes) && (
                <div className="mb-4">
                  <label className="form-label mb-1">
                    Additional Details {reason === 'Other' && <span className="text-red-500">*</span>}
                  </label>
                  <textarea
                    value={reasonNotes}
                    onChange={e => { setReasonNotes(e.target.value); setError(''); }}
                    rows={2}
                    placeholder={reason === 'Other' ? 'Describe the changeover reason…' : 'Optional notes…'}
                    className="w-full text-[14px] border border-[#E2E8F0] rounded-[10px] bg-slate-50 focus:bg-white focus:border-[#2563EB] focus:ring-[3px] focus:ring-[#2563EB]/12 outline-none transition-all placeholder-slate-400 p-3 resize-none"
                  />
                </div>
              )}

              <div className="assignment-info-callout flex items-start gap-1">
                <Info size={16} className="mt-0.5 shrink-0" />
                <span>Previous technician&apos;s work history is preserved. Remaining cables transfer to the new technician.</span>
              </div>
            </>
          )}

          {error && <div className="form-error mt-2">{error}</div>}
        </>
      ) : (
        <div className="assignment-success-wrap">
          <div className="assignment-success-icon"><CheckCircle size={48} className="text-green-500" /></div>
          <div className="assignment-success-title">Changeover complete!</div>
          <div className="assignment-success-copy mt-3 flex items-center justify-center gap-1 flex-wrap">
            {result.old_tech} <ArrowRight size={14} className="text-slate-400" /> {result.new_tech}
          </div>
          <div className="assignment-success-note mt-2">
            {result.completed_cables ?? 0} completed · {result.remaining_cables ?? 0} remaining cables transferred
          </div>
          {result.new_otp && (
            <div className="text-[12px] font-mono bg-slate-50 border border-slate-200 rounded-lg p-3 mt-3 text-left w-full">
              OTP for new tech: <strong>{result.new_otp}</strong>
              {result.new_qr && <> · QR: <strong>{result.new_qr}</strong></>}
            </div>
          )}
          {result.technician_whatsapp && result.new_otp && (
            <a
              href={`https://wa.me/${String(result.technician_whatsapp).replace(/\D/g, '')}?text=${encodeURIComponent(`Mid-Changeover: You have been assigned panel ${result.panel_name || panelName}. Reference: ${result.new_otp || ''}${result.new_qr ? ` | QR: ${result.new_qr}` : ''}. Open DWES to acknowledge and start wiring.`)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center gap-2 mt-3 h-10 px-4 rounded-lg bg-[#25D366] text-white text-[13px] font-bold"
            >
              Notify via WhatsApp
            </a>
          )}
        </div>
      )}
    </Modal>
  );
}
