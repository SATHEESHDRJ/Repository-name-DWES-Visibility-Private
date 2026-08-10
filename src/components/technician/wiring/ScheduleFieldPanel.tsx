import { useMemo, useState } from 'react';
import { ChevronDown, ChevronUp, Columns3, LayoutGrid } from '../../ui/icons';
import type { Cable } from '../../../types';
import { getCellValue, scheduleRowCells, normalizeCable } from './wiring-utils';
import type { ColumnPrefs } from './column-prefs';
import { drawerHeaders, gridHeaders } from './column-prefs';

interface Props {
  cable: Cable & { _raw?: Record<string, string> };
  mapping: Record<string, string>;
  excelHeaders: string[];
  prefs: ColumnPrefs;
  onOpenColumnPrefs: () => void;
  /** Row index for sparse / padded cable lists. */
  cableIndex?: number;
}

export default function ScheduleFieldPanel({
  cable, mapping, excelHeaders, prefs, onOpenColumnPrefs, cableIndex = 0,
}: Props) {
  const [drawerOpen, setDrawerOpen] = useState(false);

  const row = useMemo(
    () => normalizeCable(cable, cableIndex, mapping),
    [cable, cableIndex, mapping],
  );

  const pinnedCells = prefs.pinned.map(header => ({
    header,
    value: getCellValue(row, header, mapping),
  }));

  const gridCols = gridHeaders(excelHeaders, prefs);
  const displayCols = gridCols.length > 0 ? gridCols : excelHeaders;
  const gridCells = scheduleRowCells(row, mapping, displayCols);

  const extraCols = drawerHeaders(excelHeaders, prefs);
  const extraCells = extraCols.length
    ? scheduleRowCells(row, mapping, extraCols)
    : [];

  const hasDrawer = extraCells.length > 0;

  return (
    <div className="ws-schedule-card">
      {pinnedCells.length > 0 && (
        <div className="ws-pinned-fields">
          {pinnedCells.map(({ header, value }) => (
            <div key={header} className="ws-pinned-chip">
              <span className="ws-pinned-label">{header}</span>
              <span className="ws-pinned-value">{value || '—'}</span>
            </div>
          ))}
        </div>
      )}

      <div className="ws-schedule-head">
        <LayoutGrid size={14} />
        <span>Schedule data</span>
        <span className="ws-schedule-count">{gridCells.length} visible · {excelHeaders.length} total</span>
        <button type="button" className="ws-col-prefs-btn" onClick={onOpenColumnPrefs}>
          <Columns3 size={14} /> Columns
        </button>
      </div>

      {gridCells.length > 0 ? (
        <div className="ws-schedule-grid">
          {gridCells.map(({ header, value }) => (
            <div key={header} className="ws-schedule-cell">
              <div className="ws-schedule-h">{header}</div>
              <div className="ws-schedule-v">{value || '—'}</div>
            </div>
          ))}
        </div>
      ) : excelHeaders.length === 0 ? (
        <p className="text-[12px] text-slate-400 px-3 py-2">No schedule columns in frame metadata — ask supervisor to re-upload the wiring schedule.</p>
      ) : (
        <p className="text-[12px] text-slate-400 px-3 py-2">All columns hidden — open Columns to show fields or use the drawer below.</p>
      )}

      {hasDrawer && (
        <div className="ws-schedule-drawer">
          <button
            type="button"
            className="ws-drawer-toggle"
            onClick={() => setDrawerOpen(v => !v)}
          >
            {drawerOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            {drawerOpen ? 'Hide' : 'More fields'} ({extraCells.length} hidden columns)
          </button>
          {drawerOpen && (
            <div className="ws-schedule-grid ws-drawer-grid">
              {extraCells.map(({ header, value }) => (
                <div key={header} className="ws-schedule-cell">
                  <div className="ws-schedule-h">{header}</div>
                  <div className="ws-schedule-v">{value || '—'}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
