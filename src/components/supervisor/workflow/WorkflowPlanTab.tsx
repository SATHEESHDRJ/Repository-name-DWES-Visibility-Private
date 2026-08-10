import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Info, Pencil, Plus } from '../../ui/icons';
import { panelWorkflowApi } from '../../../services/api';
import DirectorUpgradePreviewModal, {
  type DirectorUpgradePreview,
} from './DirectorUpgradePreviewModal';
import PlanningSettingsMenu from './PlanningSettingsMenu';
import CustomTaskModal from './CustomTaskModal';
import {
  actualDurationMinutes,
  formatDurationMinutes,
  formatPlannedDuration,
  stageBadgeLabelShort,
  stageListSubtitle,
  stageStatusTone,
  wireTimeGuidanceText,
  type PanelWorkflowRow,
  type WiringEstimate,
  type WorkflowStageRow,
} from './workflowTypes';

type TechnicianRow = { id: number; full_name?: string; username?: string };

type Props = {
  workflow: PanelWorkflowRow;
  busy: boolean;
  totalWires?: number;
  technicians?: TechnicianRow[];
  onRefresh: () => Promise<void>;
  onUpdateStage: (stageId: number, body: Record<string, unknown>) => Promise<void>;
  onAddStage: (body: Record<string, unknown>) => Promise<{ id: number } | void>;
  onAddDependency?: (body: { stage_id: number; prerequisite_stage_id: number }) => Promise<void>;
  onOpenTimeTab?: () => void;
  onStageEditDirtyChange?: (dirty: boolean) => void;
  templates: Array<{ id: number; code: string; name: string }>;
};

const NOTES_MAX = 500;
const DIRECTOR_VERSION = 'DIRECTOR_WA1_V1';

type EditSnapshot = {
  notes: string;
  durationValue: number | string;
  durationUnit: string;
};

function techName(technicians: TechnicianRow[], userId: number): string {
  const t = technicians.find(x => x.id === userId);
  return t?.full_name || t?.username || `User #${userId}`;
}

function stageDependenciesLabel(
  workflow: PanelWorkflowRow,
  stageId: number,
): string {
  const deps = (workflow.stage_deps || []).filter(d => d.stage_id === stageId);
  if (!deps.length) return '—';
  const stages = workflow.stages || [];
  return deps
    .map(d => stages.find(s => s.id === d.prerequisite_stage_id)?.name || `#${d.prerequisite_stage_id}`)
    .join(', ');
}

function needsSupervisorAction(stage: WorkflowStageRow): 'confirm' | 'duration' | null {
  const missing = stage.planned_duration_value == null || stage.planned_duration_value === '';
  if (!missing) return null;
  if (stage.confirmation_required) return 'confirm';
  if (stage.supervisor_input_required) return 'duration';
  return null;
}

export default function WorkflowPlanTab({
  workflow,
  busy,
  totalWires = 0,
  technicians = [],
  onRefresh,
  onUpdateStage,
  onAddStage,
  onAddDependency,
  onOpenTimeTab,
  onStageEditDirtyChange,
  templates: _templates,
}: Props) {
  const stages = useMemo(() => {
    const list = [...(workflow.stages || [])];
    list.sort((a, b) => {
      const aLeg = a.is_legacy ? 1 : 0;
      const bLeg = b.is_legacy ? 1 : 0;
      if (aLeg !== bLeg) return aLeg - bLeg;
      return a.sequence - b.sequence;
    });
    return list;
  }, [workflow.stages]);

  const directorApplied = workflow.planning_template_version === DIRECTOR_VERSION;
  const versionChip = directorApplied ? 'Director Planning Template v1' : 'Legacy';
  const hasWiringStage = stages.some(s => s.stage_key === 'WIRING');

  const currentStage = stages.find(s => {
    const st = String(s.status || '').toUpperCase();
    return s.enabled && (st === 'IN_PROGRESS' || st === 'READY');
  }) || stages.find(s => s.enabled && String(s.status).toUpperCase() === 'PLANNED');

  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [notes, setNotes] = useState('');
  const [durationValue, setDurationValue] = useState<number | string>('');
  const [durationUnit, setDurationUnit] = useState('hours');
  const [editMode, setEditMode] = useState(false);
  const [editSnapshot, setEditSnapshot] = useState<EditSnapshot | null>(null);
  const [error, setError] = useState('');
  const [estimate, setEstimate] = useState<WiringEstimate | null>(null);
  const [savingNotes, setSavingNotes] = useState(false);
  const [upgradeOpen, setUpgradeOpen] = useState(false);
  const [upgradePreview, setUpgradePreview] = useState<DirectorUpgradePreview | null>(null);
  const [upgradeBusy, setUpgradeBusy] = useState(false);
  const [upgradeError, setUpgradeError] = useState('');
  const [customOpen, setCustomOpen] = useState(false);
  const upgradeBusyRef = useRef(false);
  const durationInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!stages.length) {
      setSelectedId(null);
      return;
    }
    setSelectedId(prev => {
      if (prev != null && stages.some(s => s.id === prev)) return prev;
      return currentStage?.id ?? stages[0].id;
    });
  }, [stages, currentStage?.id]);

  const selected = stages.find(s => s.id === selectedId) || null;

  useEffect(() => {
    if (!selected) {
      setNotes('');
      setDurationValue('');
      setDurationUnit('hours');
      setEditMode(false);
      setEditSnapshot(null);
      return;
    }
    setNotes(selected.remarks || '');
    setDurationValue(selected.planned_duration_value ?? '');
    setDurationUnit(selected.duration_unit || 'hours');
    setEditMode(false);
    setEditSnapshot(null);
  }, [selected?.id, selected?.remarks, selected?.planned_duration_value, selected?.duration_unit]);

  const isDirty = useMemo(() => {
    if (!editMode || !editSnapshot) return false;
    return notes !== editSnapshot.notes
      || String(durationValue) !== String(editSnapshot.durationValue)
      || durationUnit !== editSnapshot.durationUnit;
  }, [editMode, editSnapshot, notes, durationValue, durationUnit]);

  useEffect(() => {
    onStageEditDirtyChange?.(isDirty);
  }, [isDirty, onStageEditDirtyChange]);

  useEffect(() => () => {
    onStageEditDirtyChange?.(false);
  }, [onStageEditDirtyChange]);

  useEffect(() => {
    let active = true;
    panelWorkflowApi.estimate({
      project_code: workflow.project_code,
      frame_id: workflow.frame_id,
      total_wires: totalWires,
      technician_count: 1,
    }).then((data: WiringEstimate) => {
      if (active) setEstimate(data);
    }).catch(() => {
      if (active) setEstimate(null);
    });
    return () => { active = false; };
  }, [workflow.project_code, workflow.frame_id, totalWires]);

  const isWiring = selected?.stage_key === 'WIRING';
  const actualMins = selected ? actualDurationMinutes(selected) : null;
  const plannedMins = selected?.planned_duration_minutes != null
    ? Number(selected.planned_duration_minutes)
    : null;
  const varianceMins = actualMins != null && plannedMins != null
    ? actualMins - plannedMins
    : null;

  const directorHours = estimate?.director_wiring_planned_hours ?? 11;
  const calculatedHours = estimate?.estimated_hours ?? null;
  const supervisorWiringHours = selected?.stage_key === 'WIRING' && selected.planned_duration_minutes != null
    ? Math.round((Number(selected.planned_duration_minutes) / 60) * 100) / 100
    : (selected?.planned_duration_value != null ? Number(selected.planned_duration_value) : null);
  const exceedsPlanned = isWiring
    && calculatedHours != null
    && supervisorWiringHours != null
    && calculatedHours > supervisorWiringHours;

  const selectStage = (stage: WorkflowStageRow) => {
    setSelectedId(stage.id);
    setError('');
    setEditMode(false);
    setEditSnapshot(null);
  };

  const enterEditMode = () => {
    setEditSnapshot({
      notes,
      durationValue,
      durationUnit,
    });
    setEditMode(true);
    window.setTimeout(() => durationInputRef.current?.focus(), 0);
  };

  const cancelEdit = () => {
    if (editSnapshot) {
      setNotes(editSnapshot.notes);
      setDurationValue(editSnapshot.durationValue);
      setDurationUnit(editSnapshot.durationUnit);
    }
    setEditMode(false);
    setEditSnapshot(null);
  };

  const saveNotesAndDuration = async () => {
    if (!selected) return;
    setSavingNotes(true);
    setError('');
    try {
      await onUpdateStage(selected.id, {
        remarks: notes.slice(0, NOTES_MAX),
        planned_duration_value: durationValue === '' || durationValue == null
          ? null
          : Number(durationValue),
        duration_unit: durationUnit || null,
      });
      await onRefresh();
      setEditMode(false);
      setEditSnapshot(null);
    } catch (e: unknown) {
      setError((e as { response?: { data?: { message?: string } } })?.response?.data?.message || 'Could not save stage.');
    } finally {
      setSavingNotes(false);
    }
  };

  const submitCustomTask = useCallback(async (payload: {
    name: string;
    mandatory: boolean;
    planned_duration_value?: number | null;
    duration_unit?: string | null;
    remarks?: string | null;
    prerequisite_stage_id?: number | null;
  }) => {
    const key = `CUSTOM_${payload.name.toUpperCase().replace(/[^A-Z0-9]+/g, '_').slice(0, 40)}`;
    const created = await onAddStage({
      stage_key: key,
      name: payload.name,
      mandatory: payload.mandatory,
    });
    const stageId = created && typeof created === 'object' && 'id' in created
      ? Number((created as { id: number }).id)
      : null;
    if (stageId != null) {
      const hasDuration = payload.planned_duration_value != null && payload.duration_unit;
      const hasRemarks = payload.remarks != null && payload.remarks !== '';
      if (hasDuration || hasRemarks) {
        await onUpdateStage(stageId, {
          ...(hasDuration ? {
            planned_duration_value: payload.planned_duration_value,
            duration_unit: payload.duration_unit,
          } : {}),
          ...(hasRemarks ? { remarks: payload.remarks } : {}),
        });
      }
      if (payload.prerequisite_stage_id != null && onAddDependency) {
        await onAddDependency({
          stage_id: stageId,
          prerequisite_stage_id: payload.prerequisite_stage_id,
        });
      }
    }
    await onRefresh();
  }, [onAddDependency, onAddStage, onRefresh, onUpdateStage]);

  const openDirectorUpgrade = async () => {
    setError('');
    setUpgradeError('');
    setUpgradeBusy(true);
    try {
      const preview = await panelWorkflowApi.directorUpgradePreview(workflow.id);
      setUpgradePreview(preview);
      setUpgradeOpen(true);
    } catch (e: unknown) {
      setError((e as { response?: { data?: { message?: string } } })?.response?.data?.message || 'Could not load Director upgrade preview.');
    } finally {
      setUpgradeBusy(false);
    }
  };

  const confirmDirectorUpgrade = async (archiveKeys: string[]) => {
    if (upgradeBusyRef.current) return;
    upgradeBusyRef.current = true;
    setUpgradeBusy(true);
    setUpgradeError('');
    try {
      await panelWorkflowApi.directorUpgrade(workflow.id, {
        archive_unused_legacy_keys: archiveKeys,
      });
      setUpgradeOpen(false);
      setUpgradePreview(null);
      await onRefresh();
    } catch (e: unknown) {
      setUpgradeError((e as { response?: { data?: { message?: string } } })?.response?.data?.message || 'Director upgrade failed.');
    } finally {
      upgradeBusyRef.current = false;
      setUpgradeBusy(false);
    }
  };

  const supervisorAction = selected ? needsSupervisorAction(selected) : null;
  const assigneeLabel = selected?.assignees?.length
    ? selected.assignees.map(a => techName(technicians, a.user_id)).join(', ')
    : 'Unassigned';

  const wireGuidance = wireTimeGuidanceText();

  return (
    <div className="pw-plan">
      <div className="pw-plan-toolbar">
        <PlanningSettingsMenu
          templateLabel={versionChip}
          directorApplied={directorApplied}
          busy={busy}
          upgradeBusy={upgradeBusy}
          onApplyDirector={() => { void openDirectorUpgrade(); }}
          onEditPlanning={() => onOpenTimeTab?.()}
          onViewUpgradePreview={() => { void openDirectorUpgrade(); }}
        />
      </div>

      {error && <div className="form-error">{error}</div>}

      <div className="pw-plan-layout">
        <aside className="pw-stage-list" aria-label="Workflow stages">
          <div className="pw-stage-list__head">
            <h3 className="pw-section-title">Workflow Stages</h3>
            {hasWiringStage ? (
              <button
                type="button"
                className="pw-wire-guidance-btn"
                title={wireGuidance}
                aria-label="Wire-time guidance"
              >
                <Info size={16} aria-hidden />
                <span className="pw-wire-guidance-btn__label">Wire-time guidance</span>
              </button>
            ) : null}
          </div>
          <ol className="pw-stage-list__items">
            {stages.map(stage => {
              const isCurrent = currentStage?.id === stage.id;
              const isSelected = selected?.id === stage.id;
              return (
                <li key={stage.id}>
                  <button
                    type="button"
                    className={`pw-stage-row${!stage.enabled ? ' is-disabled' : ''}${isSelected ? ' is-selected' : ''}${isCurrent ? ' is-current' : ''}${stage.is_legacy ? ' is-legacy' : ''}`}
                    onClick={() => selectStage(stage)}
                  >
                    <span className="pw-stage-row__seq">{stage.sequence}</span>
                    <span className="pw-stage-row__body">
                      <strong className="pw-stage-row__name">{stage.name}</strong>
                      <span className="pw-stage-row__duration">{stageListSubtitle(stage, estimate)}</span>
                    </span>
                    <span className="pw-status-pill pw-status-pill--compact" data-tone={stage.is_legacy ? 'warn' : stageStatusTone(stage.status)}>
                      {stageBadgeLabelShort(stage, isCurrent)}
                    </span>
                  </button>
                </li>
              );
            })}
          </ol>
          <button
            type="button"
            className="btn-secondary pw-add-custom-task-btn"
            disabled={busy}
            onClick={() => setCustomOpen(true)}
          >
            <Plus size={16} aria-hidden /> Add Custom Task
          </button>
        </aside>

        <section
          className={`pw-stage-detail${editMode ? ' pw-stage-detail--edit' : ' pw-stage-detail--view'}`}
          aria-label="Selected stage details"
        >
          {!selected ? (
            <p className="pw-empty">Select a stage to view planning details.</p>
          ) : (
            <>
              <header className="pw-stage-detail__head">
                <h3 className="pw-section-title">Selected Stage: {selected.name}</h3>
                {!editMode ? (
                  <button type="button" className="btn-secondary pw-edit-stage-btn" disabled={busy} onClick={enterEditMode}>
                    <Pencil size={15} aria-hidden /> Edit Stage
                  </button>
                ) : null}
              </header>

              {supervisorAction && !editMode ? (
                <div className="pw-input-action-card">
                  <p>
                    {supervisorAction === 'confirm'
                      ? `${selected.name} and duration require confirmation.`
                      : `${selected.name} duration is not configured.`}
                  </p>
                  <button
                    type="button"
                    className="btn-primary"
                    disabled={busy}
                    onClick={enterEditMode}
                  >
                    {supervisorAction === 'confirm' ? 'Confirm Stage' : 'Enter Duration'}
                  </button>
                </div>
              ) : null}

              {!editMode ? (
                <>
                  <div className="pw-stage-metrics pw-stage-metrics--compact">
                    <div>
                      <span>Planned duration</span>
                      <strong>{formatPlannedDuration(selected)}</strong>
                    </div>
                    {actualMins != null ? (
                      <div>
                        <span>Actual duration</span>
                        <strong>{formatDurationMinutes(actualMins)}</strong>
                      </div>
                    ) : null}
                    {varianceMins != null ? (
                      <div>
                        <span>Variance</span>
                        <strong>
                          {`${varianceMins > 0 ? '+' : ''}${formatDurationMinutes(Math.abs(varianceMins))}${varianceMins > 0 ? ' over' : varianceMins < 0 ? ' under' : ''}`}
                        </strong>
                      </div>
                    ) : null}
                    <div>
                      <span>Progress</span>
                      <strong>{Number(selected.progress_pct) || 0}%</strong>
                    </div>
                    <div>
                      <span>Status</span>
                      <strong className="pw-status-pill" data-tone={stageStatusTone(selected.status)}>
                        {stageBadgeLabelShort(selected, currentStage?.id === selected.id)}
                      </strong>
                    </div>
                    {isWiring ? (
                      <>
                        <div>
                          <span>Total wires</span>
                          <strong>{totalWires || '—'}</strong>
                        </div>
                        <div>
                          <span>Target</span>
                          <strong>{estimate?.target_wires_per_hour ?? 22} wires/hour</strong>
                        </div>
                        <div>
                          <span>Calculated estimate</span>
                          <strong>{calculatedHours != null ? `${calculatedHours} h` : '—'}</strong>
                        </div>
                        <div>
                          <span>Director planned</span>
                          <strong>{directorHours} h</strong>
                        </div>
                      </>
                    ) : null}
                  </div>

                  {actualMins == null && varianceMins == null ? (
                    <p className="pw-muted">Actual duration and variance will appear after this stage starts.</p>
                  ) : null}

                  <dl className="pw-detail-facts">
                    <div><dt>Assigned</dt><dd>{assigneeLabel}</dd></div>
                    <div><dt>Dependency</dt><dd>{stageDependenciesLabel(workflow, selected.id)}</dd></div>
                    <div><dt>Supervisor notes</dt><dd>{selected.remarks?.trim() || '—'}</dd></div>
                  </dl>

                  <div className="pw-stage-detail__chips">
                    {selected.confirmation_required ? <span className="pw-chip">Confirmation</span> : null}
                    {selected.supervisor_input_required ? <span className="pw-chip">Input required</span> : null}
                    {!selected.mandatory ? <span className="pw-chip">Optional</span> : null}
                    {selected.is_legacy ? <span className="pw-chip pw-chip--warn">Legacy</span> : null}
                    {selected.terminology_unconfirmed ? <span className="pw-chip">Terminology TBC</span> : null}
                  </div>

                  {exceedsPlanned ? (
                    <p className="pw-banner-warn" role="status">
                      Calculated wiring effort exceeds the current planned duration.
                    </p>
                  ) : null}
                </>
              ) : (
                <>
                  <div className="pw-form-grid pw-form-grid--compact">
                    <label className="pw-field">
                      <span>Planned duration</span>
                      <input
                        ref={durationInputRef}
                        type="number"
                        min={0}
                        step="0.1"
                        value={durationValue}
                        disabled={busy || savingNotes}
                        onChange={e => setDurationValue(e.target.value === '' ? '' : Number(e.target.value))}
                        placeholder={selected.confirmation_required ? 'To be confirmed' : '0'}
                      />
                    </label>
                    <label className="pw-field">
                      <span>Duration unit</span>
                      <select
                        value={durationUnit}
                        disabled={busy || savingNotes}
                        onChange={e => setDurationUnit(e.target.value)}
                      >
                        <option value="minutes">Minutes</option>
                        <option value="hours">Hours</option>
                        <option value="days">Working days</option>
                      </select>
                    </label>
                  </div>

                  <label className="pw-field pw-field--full">
                    <span>Supervisor Notes ({notes.length}/{NOTES_MAX})</span>
                    <textarea
                      rows={3}
                      maxLength={NOTES_MAX}
                      value={notes}
                      disabled={busy || savingNotes}
                      onChange={e => setNotes(e.target.value.slice(0, NOTES_MAX))}
                      placeholder="Notes for this stage…"
                    />
                  </label>

                  <div className="pw-stage-actions">
                    <button
                      type="button"
                      className="btn-primary"
                      disabled={busy || savingNotes}
                      onClick={() => { void saveNotesAndDuration(); }}
                    >
                      {savingNotes ? 'Saving…' : 'Save Stage'}
                    </button>
                    <button
                      type="button"
                      className="btn-secondary"
                      disabled={busy || savingNotes}
                      onClick={cancelEdit}
                    >
                      Cancel Edit
                    </button>
                  </div>
                </>
              )}
            </>
          )}
        </section>
      </div>

      <CustomTaskModal
        open={customOpen}
        busy={busy}
        stages={stages}
        onClose={() => setCustomOpen(false)}
        onSubmit={submitCustomTask}
      />

      <DirectorUpgradePreviewModal
        open={upgradeOpen}
        preview={upgradePreview}
        busy={upgradeBusy}
        error={upgradeError}
        onClose={() => {
          if (upgradeBusy) return;
          setUpgradeOpen(false);
          setUpgradePreview(null);
          setUpgradeError('');
        }}
        onConfirm={confirmDirectorUpgrade}
      />
    </div>
  );
}
