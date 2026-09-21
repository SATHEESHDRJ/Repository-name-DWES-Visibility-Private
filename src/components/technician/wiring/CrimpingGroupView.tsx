import { useMemo, useState } from 'react';
import type { Cable } from '../../../types';
import {
  buildPreparationGroups,
  isReadyForWiring,
  type ExtendedCableStatus,
} from './wiring-utils';
import { techApi } from '../../../services/api';

type BulkStage = 'cut' | 'strip' | 'crimp' | 'prepare';

interface Props {
  assignmentId: number;
  projectCode: string;
  cables: Cable[];
  status: Record<string, ExtendedCableStatus>;
  canEdit: boolean;
  saving: boolean;
  /** Kept for module routing; whole-wire prepare replaces per-end bulk. */
  operationsMode?: 'strip' | 'crimp' | 'both';
  onStatusPatch: (next: Record<string, ExtendedCableStatus>) => void;
  onSelectWire: (index: number) => void;
  onBusy: (busy: boolean) => void;
  onToast: (msg: string) => void;
  onWorkflow: () => void;
}

/**
 * Group View — groups by sourceEquipment → destinationEquipment.
 * V2: staged actions (CUT / STRIP / CRIMP) per selected set + PREPARE SELECTED compat.
 */
export default function CrimpingGroupView({
  assignmentId,
  cables,
  status,
  canEdit,
  saving,
  onStatusPatch,
  onSelectWire,
  onBusy,
  onToast,
  onWorkflow,
}: Props) {
  const groups = useMemo(() => buildPreparationGroups(cables, status, true), [cables, status]);
  const [activeGroupKey, setActiveGroupKey] = useState<string>(() => groups[0]?.key || 'UNGROUPED');
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [bulkMsg, setBulkMsg] = useState<string | null>(null);

  const activeGroup = groups.find(g => g.key === activeGroupKey) || groups[0];
  const indexes = activeGroup?.indexes || [];

  const toggle = (idx: number) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  };

  const selectGroup = () => setSelected(new Set(indexes));
  const clearSel = () => setSelected(new Set());

  const allSelectedCutComplete = useMemo(() => {
    if (selected.size === 0) return false;
    return [...selected].every(idx => {
      const st = status[String(idx)];
      return st?.crimping?.cut?.status === 'COMPLETED';
    });
  }, [selected, status]);

  const allSelectedStripComplete = useMemo(() => {
    if (selected.size === 0) return false;
    return [...selected].every(idx => {
      const st = status[String(idx)];
      return st?.crimping?.wireStrip?.status === 'COMPLETED';
    });
  }, [selected, status]);

  const bulkStageAction = async (stage: BulkStage) => {
    if (!canEdit || saving || selected.size === 0) return;
    const picks = [...selected];
    let okCount = 0;
    let failCount = 0;
    const failedWires: string[] = [];
    const label = stage === 'cut' ? 'Cut' : stage === 'strip' ? 'Strip' : stage === 'crimp' ? 'Crimp' : 'Prepare';
    onBusy(true);
    setBulkMsg(`${label}ing ${picks.length} selected wire(s)…`);
    try {
      const next = { ...status };
      for (const idx of picks) {
        const st = next[String(idx)] || status[String(idx)];
        const note = String(st?.note || '');
        if (/\[SKIPPED\b/i.test(note)) {
          failCount += 1;
          failedWires.push(`Wire ${idx + 1}: skipped`);
          continue;
        }
        if (!st?.crimping?.required) {
          failCount += 1;
          failedWires.push(`Wire ${idx + 1}: not required`);
          continue;
        }
        try {
          const cable = cables[idx];
          const opts = { expected_sno: cable?.sno, expected_ferrule: cable?.ferrule };
          let res: any;
          if (stage === 'cut') {
            res = await techApi.cutWire(assignmentId, idx, { planned_length: cable?.length, ...opts });
          } else if (stage === 'strip') {
            res = await techApi.stripWire(assignmentId, idx, opts);
          } else if (stage === 'crimp') {
            res = await techApi.crimpWire(assignmentId, idx, opts);
          } else {
            res = await techApi.prepareWire(assignmentId, idx, opts);
          }
          const prev = next[String(idx)] || { src: false, dst: false, note: '' };
          next[String(idx)] = { ...prev, crimping: res?.crimping || prev.crimping };
          okCount += 1;
        } catch (err: any) {
          failCount += 1;
          const msg = err?.response?.data?.message;
          failedWires.push(`Wire ${idx + 1}: ${typeof msg === 'string' ? msg : 'failed'}`);
        }
      }
      onStatusPatch(next);
      onWorkflow();
      setBulkMsg(
        `${okCount} successful, ${failCount} failed`
        + (failedWires.length ? `. Failed: ${failedWires.slice(0, 5).join('; ')}${failedWires.length > 5 ? '…' : ''}` : ''),
      );
      if (okCount === 0 && failedWires[0]) onToast(failedWires[0]);
    } finally {
      onBusy(false);
    }
  };

  return (
    <div className="crimp-group-view" data-testid="crimping-group-view">
      <div className="crimp-group-toolbar">
        <label className="crimp-group-select">
          <span className="sr-only">Equipment group</span>
          <select
            value={activeGroup?.key || ''}
            onChange={(e) => {
              setActiveGroupKey(e.target.value);
              setSelected(new Set());
              setBulkMsg(null);
            }}
          >
            {groups.map(g => (
              <option key={g.key} value={g.key}>
                {g.label} ({g.indexes.length})
              </option>
            ))}
          </select>
        </label>
        <span className="text-muted text-[12px]">{indexes.length} wires</span>
        <button type="button" className="btn-secondary btn-sm" onClick={selectGroup} disabled={saving}>Select Group</button>
        <button type="button" className="btn-secondary btn-sm" onClick={clearSel} disabled={saving}>Clear</button>
      </div>

      {bulkMsg ? <p className="crimp-group-bulk-msg" role="status">{bulkMsg}</p> : null}

      <div className="crimp-group-actions">
        <button type="button" className="dwf-action-btn dwf-action-btn--prepare-wire" style={{ minHeight: 44 }} disabled={!canEdit || saving || selected.size === 0} onClick={() => { void bulkStageAction('cut'); }}>
          CUT SELECTED
        </button>
        <button type="button" className="dwf-action-btn dwf-action-btn--prepare-wire" style={{ minHeight: 44 }} disabled={!canEdit || saving || selected.size === 0 || !allSelectedCutComplete} onClick={() => { void bulkStageAction('strip'); }} title={!allSelectedCutComplete ? 'All selected wires must be cut first' : undefined}>
          STRIP SELECTED
        </button>
        <button type="button" className="dwf-action-btn dwf-action-btn--prepare-wire" style={{ minHeight: 44 }} disabled={!canEdit || saving || selected.size === 0 || !allSelectedStripComplete} onClick={() => { void bulkStageAction('crimp'); }} title={!allSelectedStripComplete ? 'All selected wires must be stripped first' : undefined}>
          CRIMP SELECTED
        </button>
        <button type="button" className="dwf-action-btn dwf-action-btn--prepare-wire" style={{ minHeight: 44, opacity: 0.55, fontSize: '0.8em' }} disabled={!canEdit || saving || selected.size === 0} onClick={() => { void bulkStageAction('prepare'); }} title="Legacy / rework compat only">
          PREPARE SELECTED (compat)
        </button>
      </div>

      <div className="crimp-group-table-wrap">
        <table className="crimp-group-table">
          <thead>
            <tr>
              <th scope="col" />
              <th scope="col">WIRE</th>
              <th scope="col">CUT</th>
              <th scope="col">STRIPPED</th>
              <th scope="col">CRIMPED</th>
              <th scope="col">READY</th>
            </tr>
          </thead>
          <tbody>
            {indexes.map(idx => {
              const st = status[String(idx)];
              const ready = isReadyForWiring(st);
              const cutOk = st?.crimping?.cut?.status === 'COMPLETED';
              const stripOk = st?.crimping?.wireStrip?.status === 'COMPLETED';
              const crimpOk = st?.crimping?.wireCrimp?.status === 'COMPLETED';
              return (
                <tr key={idx}>
                  <td>
                    <input
                      type="checkbox"
                      checked={selected.has(idx)}
                      onChange={() => toggle(idx)}
                      disabled={saving}
                      aria-label={`Select wire ${idx + 1}`}
                    />
                  </td>
                  <td>
                    <button type="button" className="crimp-group-wire-link" onClick={() => onSelectWire(idx)}>
                      {cables[idx]?.sno ?? idx + 1}
                    </button>
                  </td>
                  <td>{cutOk ? 'YES' : 'NO'}</td>
                  <td>{stripOk ? 'YES' : 'NO'}</td>
                  <td>{crimpOk ? 'YES' : 'NO'}</td>
                  <td>{ready ? 'YES' : 'NO'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
