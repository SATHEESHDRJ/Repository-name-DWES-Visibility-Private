import { useMemo, useState } from 'react';
import type { PanelWorkflowRow } from './workflowTypes';

type Props = {
  workflow: PanelWorkflowRow;
  busy: boolean;
  onRefresh: () => Promise<void>;
  onAddDependency: (body: { stage_id: number; prerequisite_stage_id: number }) => Promise<void>;
  onRemoveDependency: (depId: number) => Promise<void>;
};

export default function WorkflowDependenciesTab({
  workflow,
  busy,
  onRefresh,
  onAddDependency,
  onRemoveDependency,
}: Props) {
  const stages = useMemo(
    () => [...(workflow.stages || [])].filter(s => s.enabled).sort((a, b) => a.sequence - b.sequence),
    [workflow.stages],
  );
  const deps = workflow.stage_deps || [];
  const [stageId, setStageId] = useState('');
  const [prereqId, setPrereqId] = useState('');
  const [error, setError] = useState('');

  const nameOf = (id: number) => stages.find(s => s.id === id)?.name || `#${id}`;

  const add = async () => {
    if (!stageId || !prereqId) return;
    setError('');
    try {
      await onAddDependency({
        stage_id: Number(stageId),
        prerequisite_stage_id: Number(prereqId),
      });
      setStageId('');
      setPrereqId('');
      await onRefresh();
    } catch (e: any) {
      setError(e?.response?.data?.message || 'Could not add dependency.');
    }
  };

  return (
    <div className="pw-deps">
      <h3 className="pw-section-title">Dependencies</h3>
      <p className="pw-planning-note">
        Recommended flow: Panel Assembly → Wiring → QA/QC Pending Punch Points → HV Shorting → HV Reconnection → FAT Punch Clearance → Packing Punch Clearance → Packing → Panel Completion.
        Enforcement of start blockers is Phase W3.
      </p>

      <div className="pw-dep-diagram" aria-label="Dependency diagram">
        {stages.map((stage, i) => (
          <div key={stage.id} className="pw-dep-node-wrap">
            {i > 0 && <span className="pw-dep-arrow" aria-hidden>→</span>}
            <div className="pw-dep-node">
              <span className="pw-dep-node__seq">{stage.sequence}</span>
              <strong>{stage.name}</strong>
            </div>
          </div>
        ))}
      </div>

      <ul className="pw-dep-list">
        {deps.length === 0 && <li className="pw-empty">No explicit dependencies recorded.</li>}
        {deps.map(dep => (
          <li key={dep.id}>
            <span><strong>{nameOf(dep.prerequisite_stage_id)}</strong> → <strong>{nameOf(dep.stage_id)}</strong></span>
            <button
              type="button"
              className="btn-ghost"
              disabled={busy}
              onClick={async () => {
                await onRemoveDependency(dep.id);
                await onRefresh();
              }}
            >
              Remove
            </button>
          </li>
        ))}
      </ul>

      <div className="pw-form-grid pw-form-grid--compact">
        <label className="pw-field">
          <span>Prerequisite</span>
          <select value={prereqId} onChange={e => setPrereqId(e.target.value)} disabled={busy}>
            <option value="">Select…</option>
            {stages.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </label>
        <label className="pw-field">
          <span>Dependent stage</span>
          <select value={stageId} onChange={e => setStageId(e.target.value)} disabled={busy}>
            <option value="">Select…</option>
            {stages.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </label>
        <div className="pw-inline">
          <button type="button" className="btn-primary" disabled={busy || !stageId || !prereqId} onClick={add}>
            Add dependency
          </button>
        </div>
      </div>
      {error && <div className="form-error">{error}</div>}
    </div>
  );
}
