import { useState, useEffect, useMemo } from 'react';
import Modal from '../Modal';
import { PauseCircle, MessageCircle, ArrowLeftRight, User, Check, Search } from '../ui/icons';
import { techApi } from '../../services/api';

/** Structured pause reasons (reference MOD-PAUSE §10) — "Other" requires free text. */
export const PAUSE_REASONS = [
  'Mid-changeover (shift handoff)',
  'Material delay',
  'Tea break (≤15 min)',
  'Lunch break',
  'Other',
] as const;

interface TargetTechnician {
  technician_id: number;
  technician_name: string;
  technician_username: string;
  is_me: boolean;
  has_assignment: boolean;
  assignment: {
    id: number;
    project_code: string;
    project_name: string;
    frame_id: string;
    panel_name: string;
    status: string;
  } | null;
}

interface Props {
  assignmentId?: number;
  onClose: () => void;
  onConfirm: (reason: string) => void;
  onMidChange?: (targetTechnicianId: number, reason: string) => void;
  busy?: boolean;
}

export default function PauseReasonModal({
  assignmentId, onClose, onConfirm, onMidChange, busy = false,
}: Props) {
  const [reason, setReason] = useState<string>(PAUSE_REASONS[2]);
  const [customReason, setCustomReason] = useState('');
  
  // Mid Change flow states
  const [step, setStep] = useState<'reason' | 'picker' | 'confirm'>('reason');
  const [targets, setTargets] = useState<TargetTechnician[]>([]);
  const [loadingTargets, setLoadingTargets] = useState(false);
  const [search, setSearch] = useState('');
  const [selectedTargetId, setSelectedTargetId] = useState<number | null>(null);
  const [midChangeReason, setMidChangeReason] = useState('');

  const isMidChange = reason === 'Mid-changeover (shift handoff)';
  const resolved = reason === 'Other' ? customReason.trim() : reason;

  useEffect(() => {
    if (isMidChange && targets.length === 0 && assignmentId) {
      setLoadingTargets(true);
      techApi.midChangeTargets().then(data => {
        setTargets(data);
      }).finally(() => {
        setLoadingTargets(false);
      });
    }
  }, [isMidChange, targets.length, assignmentId]);

  const filteredTargets = useMemo(() => {
    const s = search.toLowerCase();
    return targets.filter(t => !t.is_me && (
      t.technician_name.toLowerCase().includes(s) || 
      t.technician_username?.toLowerCase().includes(s)
    ));
  }, [targets, search]);

  const handleNext = () => {
    if (isMidChange) {
      setStep('picker');
    } else {
      if (resolved) onConfirm(resolved);
    }
  };

  const handlePickerNext = () => {
    if (selectedTargetId) setStep('confirm');
  };

  const handleConfirmMidChange = () => {
    if (selectedTargetId && onMidChange) {
      onMidChange(selectedTargetId, midChangeReason.trim() || 'Mid-changeover');
    }
  };

  const selectedTarget = targets.find(t => t.technician_id === selectedTargetId);
  const me = targets.find(t => t.is_me);

  if (step === 'confirm' && selectedTarget && me) {
    const isInterchange = selectedTarget.has_assignment;
    return (
      <Modal
        title={isInterchange ? 'Confirm Interchange' : 'Confirm Direct Transfer'}
        subtitle="Review the changes before completing this action."
        icon={<ArrowLeftRight />}
        iconTone="primary"
        size="form"
        onClose={onClose}
        closeOnBackdrop={!busy}
        closeOnEscape={!busy}
        footer={(
          <>
            <button type="button" className="btn-secondary" onClick={() => setStep('picker')} disabled={busy}>
              Back
            </button>
            <button
              type="button"
              className="btn-primary"
              onClick={handleConfirmMidChange}
              disabled={busy || !midChangeReason.trim()}
            >
              <Check size={16} />
              {busy ? 'Processing…' : (isInterchange ? 'Execute Interchange' : 'Transfer Panel')}
            </button>
          </>
        )}
      >
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
              <span className="block text-[11px] font-bold uppercase text-slate-500 mb-1">Your New Assignment</span>
              {isInterchange ? (
                <>
                  <strong className="block whitespace-normal break-words text-[13px] leading-5 text-slate-900">{selectedTarget.assignment?.panel_name}</strong>
                  <span className="block break-all text-[11px] text-slate-500">{selectedTarget.assignment?.project_code}</span>
                </>
              ) : (
                <span className="block text-[13px] text-slate-500 italic">None (You will be unassigned)</span>
              )}
            </div>
            <div className="rounded-lg border border-blue-200 bg-blue-50 p-3">
              <span className="block text-[11px] font-bold uppercase text-blue-600 mb-1">{selectedTarget.technician_name}'s New Assignment</span>
              <strong className="block whitespace-normal break-words text-[13px] leading-5 text-slate-900">{me.assignment?.panel_name || 'Your panel'}</strong>
              <span className="block break-all text-[11px] text-slate-500">{me.assignment?.project_code}</span>
            </div>
          </div>
          
          <label className="block">
            <span className="form-label mb-1">Reason for Mid Change (Required)</span>
            <textarea
              className="form-input min-h-[72px] w-full resize-y"
              value={midChangeReason}
              onChange={e => setMidChangeReason(e.target.value)}
              placeholder="Briefly explain why this transfer or interchange is happening."
              disabled={busy}
            />
          </label>
        </div>
      </Modal>
    );
  }

  if (step === 'picker') {
    return (
      <Modal
        title="Select Receiving Technician"
        subtitle="Choose a technician to transfer your panel to."
        icon={<User />}
        iconTone="primary"
        size="form"
        onClose={onClose}
        closeOnBackdrop={!busy}
        closeOnEscape={!busy}
        footer={(
          <>
            <button type="button" className="btn-secondary" onClick={() => setStep('reason')} disabled={busy}>
              Back
            </button>
            <button
              type="button"
              className="btn-primary"
              onClick={handlePickerNext}
              disabled={busy || !selectedTargetId}
            >
              Review Details
            </button>
          </>
        )}
      >
        <div className="space-y-3">
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
              <Search size={16} />
            </span>
            <input 
              className="form-input w-full pl-9" 
              placeholder="Search by name or username..." 
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
          
          <div className="max-h-[300px] overflow-y-auto rounded-lg border border-slate-200 bg-white">
            {loadingTargets ? (
              <div className="p-4 text-center text-[13px] text-slate-500">Loading technicians...</div>
            ) : filteredTargets.length === 0 ? (
              <div className="p-4 text-center text-[13px] text-slate-500">No technicians found.</div>
            ) : (
              <div className="divide-y divide-slate-100">
                {filteredTargets.map(t => {
                  const isSelected = selectedTargetId === t.technician_id;
                  return (
                    <button
                      key={t.technician_id}
                      type="button"
                      className={`w-full text-left p-3 flex items-start justify-between transition-colors ${
                        isSelected ? 'bg-blue-50' : 'hover:bg-slate-50'
                      }`}
                      onClick={() => setSelectedTargetId(t.technician_id)}
                    >
                      <div>
                        <div className="flex items-center gap-2">
                          <strong className="text-[14px] text-slate-900">{t.technician_name}</strong>
                          <span className="text-[12px] text-slate-500">@{t.technician_username}</span>
                        </div>
                        {t.has_assignment ? (
                          <div className="mt-1 text-[12px] text-slate-600">
                            Working on: <span className="font-semibold">{t.assignment?.panel_name}</span> ({t.assignment?.project_name})
                            <span className="ml-2 inline-block px-1.5 py-0.5 rounded text-[10px] font-medium bg-amber-100 text-amber-800">
                              Interchange
                            </span>
                          </div>
                        ) : (
                          <div className="mt-1 text-[12px] text-emerald-600 font-medium">
                            Available for transfer
                          </div>
                        )}
                      </div>
                      {isSelected && <Check size={18} className="text-blue-600 mt-1" />}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </Modal>
    );
  }

  return (
    <Modal
      title="Pause wiring"
      subtitle="Select reason — pause time is excluded from total working time."
      icon={<PauseCircle />}
      iconTone="warning"
      size="sm"
      onClose={onClose}
      closeOnBackdrop={!busy}
      closeOnEscape={!busy}
      footer={(
        <>
          <button type="button" className="btn-secondary" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button
            type="button"
            className={isMidChange ? "btn-primary" : "btn-warning"}
            onClick={handleNext}
            disabled={busy || !resolved}
          >
            {isMidChange ? (
              <>Continue to Mid Change &rarr;</>
            ) : (
              <>
                <PauseCircle size={16} />
                {busy ? 'Pausing…' : 'Pause'}
              </>
            )}
          </button>
        </>
      )}
    >
      <div className="pause-modal-content">
        <p className="pause-modal-kicker">Reason</p>
        <div className="pause-reason-chips" role="listbox" aria-label="Pause reason">
          {PAUSE_REASONS.map(r => (
            <button
              key={r}
              type="button"
              role="option"
              aria-selected={reason === r}
              className={`pause-reason-chip${reason === r ? ' is-selected' : ''}`}
              onClick={() => setReason(r)}
              disabled={busy}
            >
              {r}
            </button>
          ))}
        </div>
        {reason === 'Other' && (
          <div className="field-with-icon">
            <span className="field-lead-icon"><MessageCircle size={18} /></span>
            <input
              className="pause-modal-other-input form-input"
              placeholder="Enter reason (audited)"
              value={customReason}
              onChange={e => setCustomReason(e.target.value)}
              autoFocus
            />
          </div>
        )}
      </div>
    </Modal>
  );
}
