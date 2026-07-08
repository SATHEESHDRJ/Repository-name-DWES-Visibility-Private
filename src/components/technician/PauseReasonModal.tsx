import { useState } from 'react';
import { X } from '../ui/icons';

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
    <div className="pause-modal-backdrop" role="presentation" onClick={() => !busy && onClose()}>
      <div
        className="pause-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="pause-modal-title"
        onClick={e => e.stopPropagation()}
      >
        <header className="pause-modal-head">
          <h2 id="pause-modal-title" className="pause-modal-title">Pause wiring</h2>
          <button type="button" className="pause-modal-close" onClick={onClose} disabled={busy} aria-label="Close">
            <X size={18} />
          </button>
        </header>

        <div className="pause-modal-body">
          <p className="pause-modal-kicker">Select reason</p>
          <div className="pause-reason-chips">
            {PAUSE_REASONS.map(r => (
              <button
                key={r}
                type="button"
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
              className="pause-modal-other-input"
              placeholder="Enter reason (audited)"
              value={customReason}
              onChange={e => setCustomReason(e.target.value)}
              autoFocus
            />
          )}
          <p className="pause-modal-note">Pause time is excluded from total working time.</p>
        </div>

        <footer className="pause-modal-foot">
          <button type="button" className="btn-secondary pause-modal-cancel" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button
            type="button"
            className="btn-warning pause-modal-confirm"
            onClick={() => resolved && onConfirm(resolved)}
            disabled={busy || !resolved}
          >
            {busy ? 'Pausing…' : 'Pause'}
          </button>
        </footer>
      </div>
    </div>
  );
}
