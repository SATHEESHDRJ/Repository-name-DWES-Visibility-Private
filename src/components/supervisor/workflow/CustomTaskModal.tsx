import { useEffect, useState } from 'react';
import Modal from '../../Modal';
import type { WorkflowStageRow } from './workflowTypes';

type Props = {
  open: boolean;
  busy: boolean;
  stages: WorkflowStageRow[];
  onClose: () => void;
  onSubmit: (payload: {
    name: string;
    mandatory: boolean;
    planned_duration_value?: number | null;
    duration_unit?: string | null;
    remarks?: string | null;
    prerequisite_stage_id?: number | null;
  }) => Promise<void>;
};

export default function CustomTaskModal({
  open,
  busy,
  stages,
  onClose,
  onSubmit,
}: Props) {
  const [name, setName] = useState('');
  const [durationValue, setDurationValue] = useState<number | string>('');
  const [durationUnit, setDurationUnit] = useState('hours');
  const [prereqId, setPrereqId] = useState('');
  const [remarks, setRemarks] = useState('');
  const [mandatory, setMandatory] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    setName('');
    setDurationValue('');
    setDurationUnit('hours');
    setPrereqId('');
    setRemarks('');
    setMandatory(false);
    setError('');
  }, [open]);

  if (!open) return null;

  const submit = async () => {
    const trimmed = name.trim();
    if (!trimmed) {
      setError('Task name is required.');
      return;
    }
    setError('');
    try {
      await onSubmit({
        name: trimmed,
        mandatory,
        planned_duration_value: durationValue === '' ? null : Number(durationValue),
        duration_unit: durationValue === '' ? null : durationUnit,
        remarks: remarks.trim() || null,
        prerequisite_stage_id: prereqId ? Number(prereqId) : null,
      });
      onClose();
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { message?: string } } })?.response?.data?.message;
      setError(msg || 'Could not add task.');
    }
  };

  return (
    <Modal
      title="Add custom task"
      onClose={onClose}
      size="form"
      closeOnBackdrop={!busy}
      closeOnEscape={!busy}
      footer={(
        <div className="pw-custom-task-modal__footer">
          <button type="button" className="btn-secondary" onClick={onClose} disabled={busy}>Cancel</button>
          <button type="button" className="btn-primary" onClick={() => { void submit(); }} disabled={busy || !name.trim()}>
            Add Task
          </button>
        </div>
      )}
    >
      <div className="pw-custom-task-modal">
        {error ? <div className="form-error">{error}</div> : null}
        <label className="pw-field pw-field--full">
          <span>Task name</span>
          <input
            value={name}
            onChange={e => setName(e.target.value)}
            disabled={busy}
            placeholder="e.g. Additional rework"
            autoFocus
          />
        </label>
        <div className="pw-form-grid pw-form-grid--compact">
          <label className="pw-field">
            <span>Planned duration</span>
            <input
              type="number"
              min={0}
              step="0.1"
              value={durationValue}
              disabled={busy}
              onChange={e => setDurationValue(e.target.value === '' ? '' : Number(e.target.value))}
            />
          </label>
          <label className="pw-field">
            <span>Duration unit</span>
            <select value={durationUnit} disabled={busy} onChange={e => setDurationUnit(e.target.value)}>
              <option value="minutes">Minutes</option>
              <option value="hours">Hours</option>
              <option value="days">Working days</option>
            </select>
          </label>
        </div>
        <label className="pw-field pw-field--full">
          <span>Dependency (prerequisite stage)</span>
          <select value={prereqId} disabled={busy} onChange={e => setPrereqId(e.target.value)}>
            <option value="">None</option>
            {stages.filter(s => s.enabled).map(s => (
              <option key={s.id} value={s.id}>{s.sequence}. {s.name}</option>
            ))}
          </select>
        </label>
        <label className="pw-field pw-field--full">
          <span>Remarks</span>
          <textarea rows={2} value={remarks} disabled={busy} onChange={e => setRemarks(e.target.value)} />
        </label>
        <label className="pw-field pw-field--checkbox">
          <input type="checkbox" checked={mandatory} disabled={busy} onChange={e => setMandatory(e.target.checked)} />
          <span>Mandatory stage</span>
        </label>
      </div>
    </Modal>
  );
}
