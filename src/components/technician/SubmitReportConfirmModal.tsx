import { useState } from 'react';
import { CheckCircle2 } from '../ui/icons';
import Modal from '../Modal';

interface Props {
  panelName: string;
  onClose: () => void;
  /** Optional review notes are forwarded with the submission (audited). */
  onSubmit: (notes: string) => void;
  submitting?: boolean;
}

export default function SubmitReportConfirmModal({
  panelName,
  onClose,
  onSubmit,
  submitting = false,
}: Props) {
  const [notes, setNotes] = useState('');

  return (
    <Modal
      title="Submit Report"
      onClose={() => !submitting && onClose()}
      size="sm"
      footer={(
        <>
          <button type="button" className="btn-secondary" onClick={onClose} disabled={submitting}>
            Cancel
          </button>
          <button type="button" className="btn-primary" onClick={() => onSubmit(notes.trim())} disabled={submitting}>
            {submitting ? 'Submitting…' : 'Submit Report'}
          </button>
        </>
      )}
    >
      <div className="flex flex-col items-center text-center gap-2 mb-3">
        <CheckCircle2 size={36} className="text-green-500" aria-hidden="true" />
      </div>
      <p className="text-[14px] text-slate-700 text-center mb-2 break-words">
        Submit completion report for <strong title={panelName}>{panelName}</strong> to your supervisor?
      </p>
      <p className="text-[13px] text-slate-500 text-center mb-4">
        Submission is <strong>final</strong> for you — any further changes require a
        supervisor rework request. Timestamps and working time are locked on submit.
      </p>
      <label className="form-label mb-1" htmlFor="submit-review-notes">Review notes (optional)</label>
      <textarea
        id="submit-review-notes"
        className="input-field w-full min-h-[72px] resize-y"
        placeholder="Anything the supervisor should know before review…"
        value={notes}
        maxLength={500}
        onChange={e => setNotes(e.target.value)}
        disabled={submitting}
      />
    </Modal>
  );
}
