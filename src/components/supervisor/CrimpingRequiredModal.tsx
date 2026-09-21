import { useCallback, useEffect, useMemo, useState } from 'react';
import Modal from '../Modal';
import { DwesLoadingIndicator } from '../ui/DwesLoadingIndicator';
import { supervisorApi } from '../../services/api';

interface WireRow {
  cable_index: number;
  required: boolean;
  overall: string;
  wiring_src: boolean;
  wiring_dst: boolean;
  openEnd: string | null;
  legacyWiringCompleted?: boolean;
}

interface Props {
  assignmentId: number;
  panelName: string;
  onClose: () => void;
  onSaved?: () => void;
}

/**
 * Supervisor multi-select: mark wires Crimping Required (or clear).
 * Uses assignment-scoped API — no WiringSchemeDB DDL.
 */
export default function CrimpingRequiredModal({
  assignmentId,
  panelName,
  onClose,
  onSaved,
}: Props) {
  const [wires, setWires] = useState<WireRow[]>([]);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [kpi, setKpi] = useState<{ required?: number; completed?: number; percent?: number } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await supervisorApi.crimpingSummary(assignmentId);
      const list: WireRow[] = Array.isArray(data?.wires) ? data.wires : [];
      setWires(list);
      setKpi(data?.kpi ?? null);
      setSelected(new Set(list.filter(w => w.required).map(w => w.cable_index)));
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Could not load crimping summary.');
    } finally {
      setLoading(false);
    }
  }, [assignmentId]);

  useEffect(() => { void load(); }, [load]);

  const unfinishedIndexes = useMemo(
    () => wires.filter(w => !(w.wiring_src && w.wiring_dst)).map(w => w.cable_index),
    [wires],
  );

  const toggle = (idx: number) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  };

  const selectAllUnfinished = () => setSelected(new Set(unfinishedIndexes));
  const clearAll = () => setSelected(new Set());

  const apply = async () => {
    setSaving(true);
    setError(null);
    try {
      const currentlyRequired = new Set(wires.filter(w => w.required).map(w => w.cable_index));
      const toRequire = [...selected].filter(i => !currentlyRequired.has(i));
      const toClear = [...currentlyRequired].filter(i => !selected.has(i));
      if (toRequire.length) {
        await supervisorApi.setCrimpingRequired(assignmentId, toRequire, true);
      }
      if (toClear.length) {
        await supervisorApi.setCrimpingRequired(assignmentId, toClear, false);
      }
      onSaved?.();
      await load();
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Could not update Crimping Required.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      title="Crimping Required"
      subtitle={panelName}
      onClose={onClose}
      size="lg"
      footer={(
        <>
          <button type="button" className="btn-secondary" onClick={onClose} disabled={saving}>Close</button>
          <button type="button" className="btn-primary" onClick={() => { void apply(); }} disabled={saving || loading}>
            {saving ? 'Saving…' : 'Apply Selection'}
          </button>
        </>
      )}
    >
      {loading ? (
        <div className="py-6 flex justify-center">
          <DwesLoadingIndicator label="Loading wires…" size="sm" />
        </div>
      ) : (
        <div className="crimp-req-modal">
          {error ? <p className="form-error mb-2">{error}</p> : null}
          <p className="text-muted text-[12px] mb-2">
            Selected wires must complete Crimping before Wiring FINISHED on that wire.
            Already-finished wires stay selectable but are grandfathered when first required.
            {kpi ? ` · Required ${kpi.required ?? 0} · Done ${kpi.completed ?? 0} · ${kpi.percent ?? 0}%` : ''}
          </p>
          <div className="flex flex-wrap gap-2 mb-3">
            <button type="button" className="btn-secondary btn-sm" onClick={selectAllUnfinished} disabled={saving}>
              Select unfinished
            </button>
            <button type="button" className="btn-secondary btn-sm" onClick={clearAll} disabled={saving}>
              Clear all
            </button>
            <span className="text-muted text-[12px] self-center">
              {selected.size} selected / {wires.length} wires
            </span>
          </div>
          <div className="crimp-req-table-wrap" role="region" aria-label="Wire crimping required selection">
            <table className="crimp-req-table">
              <thead>
                <tr>
                  <th scope="col">Req</th>
                  <th scope="col">#</th>
                  <th scope="col">Wiring</th>
                  <th scope="col">Open</th>
                  <th scope="col">Crimp</th>
                </tr>
              </thead>
              <tbody>
                {wires.map(w => {
                  const wiringDone = w.wiring_src && w.wiring_dst;
                  return (
                    <tr key={w.cable_index} className={selected.has(w.cable_index) ? 'is-selected' : ''}>
                      <td>
                        <input
                          type="checkbox"
                          checked={selected.has(w.cable_index)}
                          onChange={() => toggle(w.cable_index)}
                          disabled={saving}
                          aria-label={`Crimping required for wire ${w.cable_index + 1}`}
                        />
                      </td>
                      <td className="tabular-nums">{w.cable_index + 1}</td>
                      <td>{wiringDone ? 'Done' : w.wiring_src || w.wiring_dst ? 'Partial' : 'Pending'}</td>
                      <td>{w.openEnd || '—'}</td>
                      <td>{w.required ? w.overall : 'Not required'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </Modal>
  );
}
