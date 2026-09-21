import { useEffect, useState } from 'react';
import { Info } from '../../ui/icons';
import { panelWorkflowApi } from '../../../services/api';
import type { ProductivityDefaults, WiringEstimate } from './workflowTypes';
import { wireTimeGuidanceText } from './workflowTypes';

type Props = {
  projectCode: string;
  frameId: string;
  totalWires: number;
  technicianCount: number;
  efficiencyFactor: number | null;
  busy: boolean;
};

const FIELD_META: Array<{ key: keyof ProductivityDefaults; label: string; hint?: string }> = [
  { key: 'regular_hours_per_day', label: 'Regular working hours / day', hint: 'Default 10' },
  { key: 'productive_hours_per_shift', label: 'Productive hours / shift', hint: 'Default 10' },
  { key: 'target_wires_per_day', label: 'Target wires / day', hint: 'Default 220' },
  { key: 'target_wires_per_hour', label: 'Target wires / hour', hint: 'Default 22' },
  { key: 'standard_minutes_per_wire', label: 'Standard minutes / wire' },
  { key: 'wire_delay_warning_minutes', label: 'Wire-delay warning (minutes)', hint: 'Default 15' },
  { key: 'break_duration_minutes', label: 'Short break duration (minutes)' },
  { key: 'lunch_duration_minutes', label: 'Lunch duration (minutes)' },
  { key: 'allowed_overtime_minutes', label: 'Allowed overtime (minutes)' },
];

export default function WorkflowTimeTab({
  projectCode,
  frameId,
  totalWires,
  technicianCount,
  efficiencyFactor,
  busy,
}: Props) {
  const [defaults, setDefaults] = useState<ProductivityDefaults | null>(null);
  const [estimate, setEstimate] = useState<WiringEstimate | null>(null);
  const [techCount, setTechCount] = useState(technicianCount);
  const [efficiency, setEfficiency] = useState(efficiencyFactor ?? 1);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);

  const load = async () => {
    setError('');
    try {
      const [d, e] = await Promise.all([
        panelWorkflowApi.productivityDefaults(projectCode) as Promise<ProductivityDefaults>,
        panelWorkflowApi.estimate({
          project_code: projectCode,
          frame_id: frameId,
          total_wires: totalWires,
          technician_count: Math.max(1, techCount),
          efficiency_factor: efficiency,
        }) as Promise<WiringEstimate>,
      ]);
      setDefaults(d);
      setEstimate(e);
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Could not load productivity settings.');
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reload when panel wire/tech context changes
  }, [projectCode, frameId, totalWires]);

  useEffect(() => {
    setTechCount(technicianCount);
  }, [technicianCount]);

  const refreshEstimate = async () => {
    try {
      const e = await panelWorkflowApi.estimate({
        project_code: projectCode,
        frame_id: frameId,
        total_wires: totalWires,
        technician_count: Math.max(1, techCount),
        efficiency_factor: efficiency,
        target_wires_per_hour: defaults?.target_wires_per_hour,
        productive_hours_per_day: defaults?.productive_hours_per_shift,
      }) as WiringEstimate;
      setEstimate(e);
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Could not recalculate estimate.');
    }
  };

  const saveDefaults = async () => {
    if (!defaults) return;
    setSaving(true);
    setSaved(false);
    setError('');
    try {
      const next = await panelWorkflowApi.putProductivityDefaults({
        project_code: projectCode,
        regular_hours_per_day: defaults.regular_hours_per_day,
        productive_hours_per_shift: defaults.productive_hours_per_shift,
        target_wires_per_day: defaults.target_wires_per_day,
        target_wires_per_hour: defaults.target_wires_per_hour,
        standard_minutes_per_wire: defaults.standard_minutes_per_wire,
        wire_delay_warning_minutes: defaults.wire_delay_warning_minutes,
        break_duration_minutes: defaults.break_duration_minutes,
        lunch_duration_minutes: defaults.lunch_duration_minutes,
        allowed_overtime_minutes: defaults.allowed_overtime_minutes,
      }) as ProductivityDefaults;
      setDefaults(next);
      setSaved(true);
      await refreshEstimate();
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Could not save planning values.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="pw-time">
      <h3 className="pw-section-title">Time &amp; productivity</h3>
      <p className="pw-time-guidance">
        <button type="button" className="pw-wire-guidance-btn pw-wire-guidance-btn--inline" title={wireTimeGuidanceText()} aria-label="Wire-time guidance">
          <Info size={16} aria-hidden />
          Wire-time guidance
        </button>
      </p>
      <div className="pw-banner-info" role="note">
        Configurable planning values — not permanent business rules. Estimate never overwrites actual wiring data.
      </div>

      <section className="pw-estimate-card" aria-label="Wiring time estimate">
        <h3>Automatic wiring-time estimate</h3>
        <div className="pw-kpi-grid">
          <div><span>Total wires</span><strong>{totalWires}</strong></div>
          <div><span>Target wires/hour</span><strong>{estimate?.target_wires_per_hour ?? '—'}</strong></div>
          <div>
            <span>Planned technicians</span>
            <input
              type="number"
              min={1}
              value={techCount}
              onChange={e => setTechCount(Math.max(1, Number(e.target.value) || 1))}
              disabled={busy}
            />
          </div>
          <div>
            <span>Efficiency factor</span>
            <input
              type="number"
              min={0.1}
              step={0.05}
              value={efficiency}
              onChange={e => setEfficiency(Number(e.target.value) || 1)}
              disabled={busy}
            />
          </div>
          <div><span>Estimated hours</span><strong>{estimate?.estimated_hours ?? '—'}</strong></div>
          <div><span>Estimated working days</span><strong>{estimate?.estimated_working_days ?? '—'}</strong></div>
        </div>
        <div className="pw-inline">
          <button type="button" className="btn-secondary" disabled={busy} onClick={refreshEstimate}>Recalculate</button>
        </div>
        {estimate?.formula && <p className="pw-muted">{estimate.formula}</p>}
        <div className="pw-vs-grid">
          <div>
            <h4>Estimated (planning)</h4>
            <p>{estimate?.estimated_hours ?? '—'} hours / {estimate?.estimated_working_days ?? '—'} days</p>
          </div>
          <div>
            <h4>Actual (execution)</h4>
            <p>Available in Phase W4 from wiring activity — not overwritten here.</p>
          </div>
        </div>
      </section>

      <section className="pw-defaults" aria-label="Productivity defaults">
        <h3>Supervisor productivity configuration</h3>
        <div className="pw-form-grid">
          {FIELD_META.map(field => (
            <label key={field.key} className="pw-field">
              <span>{field.label}{field.hint ? ` · ${field.hint}` : ''}</span>
              <input
                type="number"
                disabled={!defaults || busy || saving}
                value={defaults?.[field.key] == null ? '' : Number(defaults[field.key])}
                onChange={e => {
                  if (!defaults) return;
                  const raw = e.target.value;
                  setDefaults({
                    ...defaults,
                    [field.key]: raw === '' ? null : Number(raw),
                  } as ProductivityDefaults);
                }}
              />
            </label>
          ))}
        </div>
        <div className="pw-inline">
          <button type="button" className="btn-primary" disabled={!defaults || busy || saving} onClick={saveDefaults}>
            {saving ? 'Saving…' : 'Save planning values'}
          </button>
          {saved && <span className="pw-ok">Saved for this project scope.</span>}
        </div>
      </section>

      {error && <div className="form-error">{error}</div>}
    </div>
  );
}
