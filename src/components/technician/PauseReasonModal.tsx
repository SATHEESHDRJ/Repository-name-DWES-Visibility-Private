import { useState } from 'react';
import Modal from '../Modal';

/** Structured pause reasons (reference MOD-PAUSE §10) — "Other" requires free text. */
export const PAUSE_REASONS = [
  'Mid-changeover (shift handoff)',
  'Material delay',
  'Tea break (≤15 min)',
  'Lunch break',
  'Other',
] as const;

interface Props {
  onClose: () => void;
  onConfirm: (reason: string) => void;
  busy?: boolean;
}

export default function PauseReasonModal({
  onClose, onConfirm, busy = false,
}: Props) {
  const [reason, setReason] = useState<string>(PAUSE_REASONS[2]);
  const [customReason, setCustomReason] = useState('');

  const resolved = reason === 'Other' ? customReason.trim() : reason;

  return (
    <Modal
      title="Pause wiring"
      subtitle="Select reason — pause time is excluded from total working time."
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
            className="btn-warning"
            onClick={() => resolved && onConfirm(resolved)}
            disabled={busy || !resolved}
          >
            {busy ? 'Pausing…' : 'Pause'}
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
          <input
            className="pause-modal-other-input form-input"
            placeholder="Enter reason (audited)"
            value={customReason}
            onChange={e => setCustomReason(e.target.value)}
            autoFocus
          />
        )}
      </div>
    </Modal>
  );
}
