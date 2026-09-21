import { useState } from 'react';
import Modal from '../../Modal';
import CableVisualPath from './CableVisualPath';
import type { Cable } from '../../../types';
import {
  getCrimpingEnd,
  type ExtendedCableStatus,
} from './wiring-utils';
import { techApi } from '../../../services/api';

interface Props {
  open: boolean;
  assignmentId: number;
  cableIndex: number;
  cable: Cable | null | undefined;
  status: ExtendedCableStatus;
  panelName?: string;
  isRework?: boolean;
  busy?: boolean;
  onBusy?: (busy: boolean) => void;
  onClose: () => void;
  onPrepared: (res: {
    crimping: any;
    wiring_locked: boolean;
    changed: boolean;
  }) => void;
  onError?: (message: string) => void;
}

function cell(v: string | null | undefined): string {
  if (v == null || String(v).trim() === '') return 'NOT AVAILABLE';
  return String(v);
}

/**
 * Whole-wire preparation confirmation — one CONFIRM for cut + strip + crimp.
 */
export default function PrepareWireDrawer({
  open,
  assignmentId,
  cableIndex,
  cable,
  status,
  panelName,
  isRework = false,
  busy = false,
  onBusy,
  onClose,
  onPrepared,
  onError,
}: Props) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  const src = getCrimpingEnd(status, 'source') as any;
  const dst = getCrimpingEnd(status, 'destination') as any;
  const openEnd = status.openEnd ? String(status.openEnd) : null;
  const history = [
    ...(Array.isArray(src.reworkHistory) ? src.reworkHistory.map((h: any) => ({ ...h, end: 'SOURCE' as const })) : []),
    ...(Array.isArray(dst.reworkHistory) ? dst.reworkHistory.map((h: any) => ({ ...h, end: 'DESTINATION' as const })) : []),
  ].sort((a, b) => String(a.setAt || '').localeCompare(String(b.setAt || '')));

  const latestRework = [...history].reverse().find((h) => !/Re-prepared/i.test(String(h.reason || '')));

  const confirm = async () => {
    if (saving || busy) return;
    setSaving(true);
    setError(null);
    onBusy?.(true);
    try {
      const res = await techApi.prepareWire(assignmentId, cableIndex, {
        expected_sno: cable?.sno,
        expected_ferrule: cable?.ferrule,
      });
      onPrepared({
        crimping: res?.crimping,
        wiring_locked: Boolean(res?.wiring_locked),
        changed: Boolean(res?.changed),
      });
      onClose();
    } catch (err: any) {
      const data = err?.response?.data;
      const msg = typeof data?.message === 'string'
        ? data.message
        : (typeof data?.message?.message === 'string' ? data.message.message : null)
          || 'Could not prepare wire. Try again.';
      setError(msg);
      onError?.(msg);
    } finally {
      setSaving(false);
      onBusy?.(false);
    }
  };

  return (
    <Modal
      title={isRework ? 'RE-PREPARE WIRE' : 'PREPARE WIRE'}
      onClose={saving ? (() => undefined) : onClose}
      size="wide"
    >
      <div className="prepare-wire-drawer" data-testid="prepare-wire-drawer">
        <p className="text-[13px] text-muted mb-3">
          Confirm you have cut this wire to the scheduled length, stripped every applicable end,
          and crimped every applicable ferrule/lug.
        </p>

        {isRework && latestRework ? (
          <div className="prepare-wire-drawer__rework mb-3 p-3 rounded-lg border border-amber-300 bg-amber-50 text-[13px]" role="status">
            <strong>REWORK REQUIRED</strong>
            <div>Reason: {latestRework.reason || '—'}</div>
            <div>
              Raised by: {latestRework.setBy ?? '—'}
              {latestRework.role ? ` (${latestRework.role})` : ''}
              {' · '}
              {latestRework.setAt ? new Date(latestRework.setAt).toLocaleString() : '—'}
            </div>
            <div>Affected: {latestRework.end} {String(latestRework.operation || '').toUpperCase()}</div>
          </div>
        ) : null}

        <div className="prepare-wire-drawer__grid grid gap-2 text-[13px] mb-3">
          <div><strong>S.No.</strong> {cell(cable?.sno != null ? String(cable.sno) : String(cableIndex + 1))}</div>
          <div><strong>Wire / Sign</strong> {cell(cable?.ferrule)} · {cell(cable?.sign)}</div>
          <div><strong>Panel</strong> {cell(panelName || cable?.panel)}</div>
          <div><strong>Open End</strong> {openEnd === 'source' ? 'OPEN SOURCE' : openEnd === 'destination' ? 'OPEN DESTINATION' : openEnd === 'both' ? 'OPEN BOTH' : 'None'}</div>
          <div>
            <strong className="text-red-700">SOURCE</strong>{' '}
            {cell(cable?.source_device)} · Term {cell(cable?.source_terminal)} · Side {cell(cable?.source)}
            · Ferrule {cell((cable as any)?.source_ferrule_type)} {cell((cable as any)?.source_ferrule_marking)}
          </div>
          <div>
            <strong className="text-blue-700">DESTINATION</strong>{' '}
            {cell(cable?.dest_device)} · Term {cell(cable?.dest_terminal)} · Side {cell(cable?.destination)}
            · Ferrule {cell((cable as any)?.dest_ferrule_type)} {cell((cable as any)?.dest_ferrule_marking)}
          </div>
          <div><strong>Colour / Size / Length</strong> {cell(cable?.color)} · {cell(cable?.size)} · {cell(cable?.length)}</div>
          <div><strong>Reference</strong> {cell(cable?.ref)} · <strong>Remarks</strong> {cell(cable?.remarks)}</div>
        </div>

        {cable ? (
          <div className="mb-4">
            <CableVisualPath cable={cable} cableIndex={cableIndex} />
          </div>
        ) : null}

        {history.length > 0 ? (
          <div className="mb-3">
            <h4 className="text-[12px] font-semibold uppercase tracking-wide text-muted m-0 mb-1">Rework / re-prep history</h4>
            <ul className="list-none p-0 m-0 space-y-1 text-[12px]">
              {history.map((h, i) => (
                <li key={`${h.setAt}-${i}`} className="bg-slate-50 rounded px-2 py-1">
                  {h.end} {String(h.operation || '').toUpperCase()} · {h.reason}
                  {' · '}by {h.setBy}{h.role ? ` (${h.role})` : ''}
                  {' · '}{h.setAt ? new Date(h.setAt).toLocaleString() : '—'}
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {error ? (
          <p className="text-red-600 text-[13px] mb-2" role="alert">{error}</p>
        ) : null}

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="btn-primary prepare-wire-drawer__confirm"
            style={{ minHeight: 48, minWidth: 200 }}
            disabled={saving || busy}
            onClick={() => { void confirm(); }}
          >
            {saving ? 'Saving…' : (error ? 'Retry — CONFIRM WIRE PREPARED' : 'CONFIRM WIRE PREPARED')}
          </button>
          <button
            type="button"
            className="btn-secondary"
            style={{ minHeight: 48 }}
            disabled={saving}
            onClick={onClose}
          >
            Cancel
          </button>
        </div>
      </div>
    </Modal>
  );
}
