import { memo, useCallback, useMemo, useRef } from 'react';
import { ChevronDown, ChevronUp } from '../../ui/icons';
import type { Cable } from '../../../types';
import { getCellValue, wireColorHex } from '../../technician/wiring/wiring-utils';
import { fieldKeyForHeader } from '../../../constants/wiringSystemFields';
import type { SortState } from './monitorUtils';

const COL_WIDTH: Record<string, number> = {
  __idx: 44,
};
const DEFAULT_COL_W = 112;

function colWidth(header: string): number {
  return COL_WIDTH[header] ?? DEFAULT_COL_W;
}

interface RowProps {
  cable: Cable;
  index: number;
  displayNo: number;
  excelHeaders: string[];
  mapping: Record<string, string>;
  selected: boolean;
  zebra: boolean;
  onSelect: (index: number) => void;
}

const MonitorRow = memo(function MonitorRow({
  cable,
  index,
  displayNo,
  excelHeaders,
  mapping,
  selected,
  zebra,
  onSelect,
}: RowProps) {
  const rowClass = [
    'wsg-row',
    zebra ? 'zebra' : '',
    selected ? 'selected' : '',
  ].filter(Boolean).join(' ');

  let frozenLeftOffset = colWidth('__idx');

  return (
    <div
      className={rowClass}
      role="row"
      aria-selected={selected}
      onClick={() => onSelect(index)}
    >
      <div
        className="wsg-cell sno frozen-l"
        style={{ width: colWidth('__idx'), left: 0 }}
        role="cell"
      >
        <span className="wsg-sno-btn">{displayNo}</span>
      </div>
      {excelHeaders.map((header, hi) => {
        const isFrozen = hi === 0;
        const w = colWidth(header);
        const style: React.CSSProperties = isFrozen
          ? { width: w, left: frozenLeftOffset }
          : { width: w };
        if (isFrozen) frozenLeftOffset += w;
        const fk = fieldKeyForHeader(mapping, header);
        const optional = fk && !['sno', 'ferrule', 'source', 'destination', 'color', 'size'].includes(fk);
        const value = getCellValue(cable, header, mapping);
        const isColor = fk === 'color';
        const { hex } = isColor ? wireColorHex(value) : { hex: undefined };
        return (
          <div
            key={header}
            className={`wsg-cell data${isFrozen ? ' frozen-l' : ''}${optional ? ' wsg-col-optional' : ''}${fk === 'ferrule' ? ' ferrule' : ''}`}
            style={style}
            role="cell"
            title={value}
          >
            {isColor && hex && <span className="wsg-swatch" style={{ background: hex }} />}
            {value || <span className="wsg-dim">—</span>}
          </div>
        );
      })}
    </div>
  );
});

interface Props {
  cables: Cable[];
  excelHeaders: string[];
  mapping: Record<string, string>;
  visibleIndices: number[];
  selectedIndex: number | null;
  onSelect: (index: number) => void;
  sort: SortState | null;
  onSort: (key: string) => void;
}

export default function WiringScheduleMonitorGrid({
  cables,
  excelHeaders,
  mapping,
  visibleIndices,
  selectedIndex,
  onSelect,
  sort,
  onSort,
}: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);

  const frozenLeftOffset = colWidth('__idx');

  const headerCells = useMemo(() => {
    let leftOffset = frozenLeftOffset;
    return excelHeaders.map((header, hi) => {
      const isFrozen = hi === 0;
      const w = colWidth(header);
      const style: React.CSSProperties = isFrozen
        ? { width: w, left: leftOffset }
        : { width: w };
      if (isFrozen) leftOffset += w;
      const fk = fieldKeyForHeader(mapping, header);
      const optional = fk && !['sno', 'ferrule', 'source', 'destination', 'color', 'size'].includes(fk);
      const active = sort?.key === header;
      return (
        <button
          key={header}
          type="button"
          className={`wsg-hcell sortable${isFrozen ? ' frozen-l' : ''}${optional ? ' wsg-col-optional' : ''}${fk === 'source' || fk === 'source_device' ? ' src' : ''}${fk === 'destination' || fk === 'dest_device' ? ' dst' : ''}${fk === 'path' ? ' path' : ''}`}
          style={style}
          onClick={() => onSort(header)}
          aria-sort={active ? (sort!.dir === 'asc' ? 'ascending' : 'descending') : 'none'}
        >
          <span className="truncate">{header}</span>
          {active ? (sort!.dir === 'asc' ? <ChevronUp size={12} /> : <ChevronDown size={12} />) : null}
        </button>
      );
    });
  }, [excelHeaders, mapping, sort, onSort, frozenLeftOffset]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (!visibleIndices.length) return;
    const pos = selectedIndex != null ? visibleIndices.indexOf(selectedIndex) : -1;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      const next = visibleIndices[Math.min(pos + 1, visibleIndices.length - 1)] ?? visibleIndices[0];
      onSelect(next);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      const prev = visibleIndices[Math.max(pos - 1, 0)];
      onSelect(prev);
    }
  }, [visibleIndices, selectedIndex, onSelect]);

  if (!cables.length) {
    return (
      <div className="wsg-empty-hero">
        <p className="wsg-empty-title">No wiring schedule rows</p>
        <p className="wsg-empty-sub">Upload a wiring schedule for this panel to populate the monitor grid.</p>
      </div>
    );
  }

  if (!visibleIndices.length) {
    return (
      <div className="wsg-nomatch">
        <p className="wsg-nomatch-title">No rows match the current filters</p>
        <p className="wsg-empty-sub">Clear search or filters to see the full schedule.</p>
      </div>
    );
  }

  return (
    <div
      ref={scrollRef}
      className="wsg-grid-scroll"
      tabIndex={0}
      role="grid"
      aria-rowcount={visibleIndices.length}
      aria-colcount={excelHeaders.length + 1}
      onKeyDown={handleKeyDown}
    >
      <div className="wsg-hrow" role="row">
        <button
          type="button"
          className="wsg-hcell sortable frozen-l sno"
          style={{ width: colWidth('__idx'), left: 0 }}
          onClick={() => onSort('__idx')}
          aria-sort={sort?.key === '__idx' ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}
        >
          #
          {sort?.key === '__idx' ? (sort.dir === 'asc' ? <ChevronUp size={12} /> : <ChevronDown size={12} />) : null}
        </button>
        {headerCells}
      </div>
      {visibleIndices.map((index, displayIdx) => (
        <MonitorRow
          key={index}
          cable={cables[index]}
          index={index}
          displayNo={displayIdx + 1}
          excelHeaders={excelHeaders}
          mapping={mapping}
          selected={selectedIndex === index}
          zebra={displayIdx % 2 === 1}
          onSelect={onSelect}
        />
      ))}
    </div>
  );
}
