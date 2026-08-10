import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { X } from '../../ui/icons';
import type { Cable } from '../../../types';

export interface CorrectableFieldOption {
  field: string;
  label: string;
}

interface Props {
  open: boolean;
  projectCode: string;
  panelName: string;
  wireNumber: string | number;
  cable: Cable & { dest_ferrule?: string };
  technicianName: string;
  fields: CorrectableFieldOption[];
  mapping?: Record<string, string>;
  busy?: boolean;
  onClose: () => void;
  onSave: (payload: { field: string; corrected_value: string; reason: string }) => Promise<void> | void;
}

function readField(cable: Cable & { dest_ferrule?: string }, field: string, mapping: Record<string, string>): string {
  if (field === 'dest_ferrule') {
    if (cable.dest_ferrule?.trim()) return cable.dest_ferrule.trim();
    const raw = cable._raw || {};
    for (const [header, value] of Object.entries(raw)) {
      const key = header.toUpperCase().replace(/[^A-Z0-9]/g, '');
      if ((key === 'IECFERRB' || key === 'FERRB' || key.endsWith('FERRB')) && String(value).trim()) {
        return String(value).trim();
      }
    }
    return '';
  }
  const direct = (cable as any)[field];
  if (direct != null && String(direct).trim()) return String(direct).trim();
  const mapped = mapping[field];
  if (mapped && cable._raw?.[mapped] != null) return String(cable._raw[mapped]).trim();
  return '';
}

export default function WireCorrectionModal({
  open,
  projectCode,
  panelName,
  wireNumber,
  cable,
  technicianName,
  fields,
  mapping = {},
  busy = false,
  onClose,
  onSave,
}: Props) {
  const [field, setField] = useState(fields[0]?.field || 'color');
  const [corrected, setCorrected] = useState('');
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);

  const existing = useMemo(
    () => readField(cable, field, mapping),
    [cable, field, mapping],
  );

  useEffect(() => {
    if (!open) return;
    setField(fields[0]?.field || 'color');
    setReason('');
    setError(null);
  }, [open, fields, cable]);

  useEffect(() => {
    if (!open) return;
    setCorrected(existing);
  }, [open, existing, field]);

  if (!open) return null;

  const fieldLabel = fields.find(f => f.field === field)?.label || field;
  const nowLabel = new Date().toLocaleString();

  const submit = async () => {
    const next = corrected.trim();
    const why = reason.trim();
    if (next === existing.trim()) {
      setError('Corrected value must differ from the existing value.');
      return;
    }
    setError(null);
    await onSave({ field, corrected_value: next, reason: why });
  };

  return createPortal(
    <div className="swm-modal-root" role="presentation">
      <button type="button" className="swm-modal-backdrop" aria-label="Close" onClick={() => !busy && onClose()} />
      <div
        className="swm-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="wire-correction-title"
      >
        <header className="swm-modal__header">
          <h2 id="wire-correction-title">Correction / Edit</h2>
          <button type="button" className="swm-modal__close" onClick={() => !busy && onClose()} disabled={busy} aria-label="Cancel">
            <X size={18} />
          </button>
        </header>

        <div className="swm-modal__body">
          <div className="swm-modal__meta">
            <div><span>Project</span><strong>{projectCode}</strong></div>
            <div><span>Panel</span><strong>{panelName}</strong></div>
            <div><span>Wire number</span><strong>{wireNumber}</strong></div>
            <div><span>Technician</span><strong>{technicianName}</strong></div>
            <div><span>Date / time</span><strong>{nowLabel}</strong></div>
          </div>

          <label className="swm-modal__field">
            <span>Parameter being corrected</span>
            <select
              className="form-select"
              value={field}
              disabled={busy}
              onChange={e => setField(e.target.value)}
            >
              {fields.map(opt => (
                <option key={opt.field} value={opt.field}>{opt.label}</option>
              ))}
            </select>
          </label>

          <label className="swm-modal__field">
            <span>Existing value ({fieldLabel})</span>
            <input className="form-input" value={existing} readOnly />
          </label>

          <label className="swm-modal__field">
            <span>Corrected value</span>
            <input
              className="form-input"
              value={corrected}
              disabled={busy}
              onChange={e => setCorrected(e.target.value)}
              autoFocus
            />
          </label>

          <label className="swm-modal__field">
            <span>Correction reason / comment</span>
            <textarea
              className="form-input"
              rows={3}
              value={reason}
              disabled={busy}
              onChange={e => setReason(e.target.value)}
              placeholder="Optional — explain why this value is corrected"
            />
          </label>

          {error && <p className="swm-modal__error" role="alert">{error}</p>}
        </div>

        <footer className="swm-modal__footer">
          <button type="button" className="btn-secondary" onClick={onClose} disabled={busy}>
            CANCEL
          </button>
          <button type="button" className="btn-primary" onClick={() => { void submit(); }} disabled={busy}>
            SAVE CORRECTION
          </button>
        </footer>
      </div>
    </div>,
    document.body,
  );
}
