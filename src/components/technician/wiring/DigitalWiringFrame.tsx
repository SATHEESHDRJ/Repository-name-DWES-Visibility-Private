import { memo, useCallback, useMemo, useState } from 'react';
import { Columns3, X } from '../../ui/icons';
import type { Cable } from '../../../types';
import {
  DEFAULT_CABLE_STATUS,
  cableMissingFields,
  cableStatusChip,
  displayValue,
  parseLengthMeters,
  wireColorHex,
  type ExtendedCableStatus,
} from './wiring-utils';

interface RowProps {
  cable: Cable;
  index: number;
  st: ExtendedCableStatus;
  maxLen: number;
  blinkAlert: boolean;
  isActive?: boolean;
  primary?: boolean;
  onSelectRow?: (idx: number) => void;
}

const DwRow = memo(function DwRow({
  cable, index, st, maxLen, blinkAlert, isActive, primary, onSelectRow,
}: RowProps) {
  const missing = cableMissingFields(cable);
  const chip = cableStatusChip(st);
  const { hex, hex2 } = wireColorHex(cable.color);
  const lenM = parseLengthMeters(cable.length);
  const barPct = lenM && maxLen > 0 ? Math.max(8, Math.round((lenM / maxLen) * 100)) : 40;
  const pathRef = cable.ref || cable.path?.split('->')[0] || '—';

  return (
    <tr
      className={`dwf-row${st.src && st.dst ? ' done' : ''}${st.issue ? ' issue' : ''}${isActive ? ' dwf-row--active' : ''}${primary ? ' dwf-row--primary' : ''}`}
      data-dwf-row={index}
      onClick={onSelectRow ? () => onSelectRow(index) : undefined}
      style={onSelectRow ? { cursor: 'pointer' } : undefined}
    >
      <td className="dwf-td-no" data-label="No.">
        <button
          type="button"
          className="dwf-no-btn"
          onClick={e => { e.stopPropagation(); onSelectRow?.(index); }}
          title={`Go to serial ${cable.sno ?? index + 1}`}
        >
          {cable.sno ?? index + 1}
        </button>
      </td>
      <td className="dwf-td-ferrule" data-label="Ferrule">
        {missing.includes('ferrule')
          ? <span className="dwf-missing">missing</span>
          : cable.ferrule}
      </td>
      <td className="dwf-td-mono" data-label="Source">
        {missing.includes('source')
          ? <span className="dwf-missing">missing</span>
          : displayValue(cable.source)}
      </td>
      <td className="dwf-td-mono" data-label="Destination">
        {missing.includes('destination')
          ? <span className="dwf-missing">missing</span>
          : displayValue(cable.destination)}
      </td>
      <td className="dwf-td-path" data-label="Visual Path">
        <div className="dwf-path-ref">{pathRef}</div>
        <div className="dwf-path-track">
          <span
            className="dwf-path-bar"
            style={{
              width: `${barPct}%`,
              background: hex2
                ? `linear-gradient(90deg, ${hex} 0%, ${hex} 50%, ${hex2} 50%, ${hex2} 100%)`
                : hex,
            }}
          />
          {cable.length && <span className="dwf-path-len">{cable.length}</span>}
        </div>
      </td>
      <td className="dwf-td-color" data-label="Color">
        <span className="dwf-swatch" style={{ background: hex }} />
        {displayValue(cable.color)}
      </td>
      <td className="dwf-td-mono" data-label="Size">{displayValue(cable.size)}</td>
      <td className="dwf-td-mono" data-label="Length">{displayValue(cable.length)}</td>
      <td className="dwf-td-status" data-label="Status">
        <span className={`dwf-status-chip ${chip.tone}${blinkAlert ? ' blink' : ''}`}>{chip.label}</span>
      </td>
    </tr>
  );
});

interface Props {
  cables: Cable[];
  status: Record<string, ExtendedCableStatus>;
  canWire: boolean;
  alertRows?: Set<string>;
  activeIndex?: number;
  onActiveIndexChange?: (idx: number) => void;
  onSkipNext?: () => void;
  onSourceOpen?: () => void;
  onDestinationOpen?: () => void;
  confirming?: boolean;
}

export default function DigitalWiringFrame({
  cables, status, canWire, alertRows, activeIndex = 0, onActiveIndexChange,
  onSkipNext, onSourceOpen, onDestinationOpen, confirming = false,
}: Props) {
  const [fullViewOpen, setFullViewOpen] = useState(false);

  const getStatus = useCallback(
    (idx: number) => status[String(idx)] || DEFAULT_CABLE_STATUS,
    [status],
  );

  const maxLen = useMemo(() => {
    const lens = cables.map(c => parseLengthMeters(c.length)).filter((v): v is number => v != null && v > 0);
    return lens.length ? Math.max(...lens) : 0;
  }, [cables]);

  const goPrev = () => onActiveIndexChange?.(Math.max(0, activeIndex - 1));
  const activeCable = cables[activeIndex];
  const activeSt = getStatus(activeIndex);
  const activeEntry = activeIndex >= 0 && activeIndex < cables.length
    ? { cable: cables[activeIndex], index: activeIndex, st: activeSt }
    : null;

  const jumpToCable = (idx: number) => {
    onActiveIndexChange?.(idx);
    setFullViewOpen(false);
  };

  if (fullViewOpen) {
    return (
      <div className="dwf-shell dwf-shell--full-schedule">
        <div className="dwf-full-header">
          <div className="dwf-full-header-text">
            <h3 className="dwf-full-title">Full Wiring Schedule</h3>
            <p className="dwf-full-sub">Reference view — scroll to inspect the complete wiring sheet.</p>
          </div>
          <button
            type="button"
            className="dwf-full-close"
            onClick={() => setFullViewOpen(false)}
            aria-label="Close full wiring view"
          >
            <X size={16} />
            <span>Close</span>
          </button>
        </div>
        <div className="dwf-table-wrap dwf-table-wrap--full">
          <table className="dwf-table dwf-table--schedule">
            <thead>
              <tr>
                <th className="dwf-th-no">No.</th>
                <th>Ferrule</th>
                <th>Source</th>
                <th>Destination</th>
                <th className="dwf-th-path">Visual Path</th>
                <th>Color</th>
                <th>Size</th>
                <th>Length</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {cables.map((cable, index) => (
                <DwRow
                  key={index}
                  cable={cable}
                  index={index}
                  st={getStatus(index)}
                  maxLen={maxLen}
                  blinkAlert={alertRows?.has(String(index)) ?? false}
                  isActive={index === activeIndex}
                  onSelectRow={jumpToCable}
                />
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  return (
    <div className="dwf-shell dwf-shell--tablet-opt dwf-shell--single-exec">
      <div className="dwf-exec-toolbar">
        <button
          type="button"
          className="dwf-full-view-btn"
          onClick={() => setFullViewOpen(true)}
          aria-label="Open full wiring schedule"
        >
          <Columns3 size={16} />
          <span>Full Wiring View</span>
        </button>
        <span className="dwf-exec-count">{cables.length} cables</span>
      </div>

      <div className="dwf-seq-nav dwf-seq-nav--compact">
        <button type="button" className="btn-secondary dwf-seq-btn dwf-seq-btn--compact" disabled={activeIndex <= 0} onClick={goPrev}>
          Previous
        </button>
        <span className="dwf-seq-label dwf-seq-label--compact">
          <strong>{activeCable?.sno ?? activeIndex + 1}</strong>
          <span className="dwf-seq-of"> / {cables.length}</span>
        </span>
        <button
          type="button"
          className="btn-primary dwf-seq-btn dwf-seq-btn--compact dwf-seq-btn--skip"
          disabled={activeIndex >= cables.length - 1 || !canWire || confirming}
          onClick={onSkipNext}
        >
          Skip (Next)
        </button>
      </div>

      <div className="dwf-table-wrap dwf-table-wrap--single dwf-table-wrap--primary">
        <table className="dwf-table dwf-table--primary">
          <thead>
            <tr>
              <th className="dwf-th-no">No.</th>
              <th>Ferrule</th>
              <th>Source</th>
              <th>Destination</th>
              <th className="dwf-th-path">Visual Path</th>
              <th>Color</th>
              <th>Size</th>
              <th>Length</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {activeEntry && (
              <DwRow
                key={activeEntry.index}
                cable={activeEntry.cable}
                index={activeEntry.index}
                st={activeEntry.st}
                maxLen={maxLen}
                blinkAlert={alertRows?.has(String(activeEntry.index)) ?? false}
                isActive
                primary
              />
            )}
          </tbody>
        </table>
      </div>

      {activeEntry && (
        <div className="dwf-focus-panel dwf-workspace-sticky-footer dwf-open-actions">
          <div className="dwf-open-actions-grid">
            <button
              type="button"
              className="dwf-open-btn dwf-open-btn--source"
              disabled={!canWire || confirming}
              onClick={onSourceOpen}
              title="Source end still open — destination wired"
            >
              <span className="dwf-open-btn-label">Source Open</span>
              <span className="dwf-open-btn-hint">Dest wired</span>
            </button>
            <button
              type="button"
              className="dwf-open-btn dwf-open-btn--dest"
              disabled={!canWire || confirming}
              onClick={onDestinationOpen}
              title="Destination end still open — source wired"
            >
              <span className="dwf-open-btn-label">Destination Open</span>
              <span className="dwf-open-btn-hint">Source wired</span>
            </button>
          </div>
          <p className="dwf-open-hint">
            Skip (Next) marks both ends complete. Use Open buttons when only one end is wired.
          </p>
        </div>
      )}
    </div>
  );
}
