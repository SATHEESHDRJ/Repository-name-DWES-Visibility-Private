import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import {
  WIRING_SYSTEM_FIELDS,
  fieldKeyForHeader,
  isMonoWiringField,
  updateWiringMapping,
} from '../../constants/wiringSystemFields';

export type WiringColumnFilter = 'all' | 'selected' | 'required' | 'unselected';
export type WiringGridVariant = 'inline' | 'fullview';

export interface WiringSchedulePreview {
  cable_count: number;
  mapped_columns: number;
  unmatched_headers: string[];
  validation: {
    total: number;
    ok_count: number;
    error_count: number;
    issues: Record<number, Record<string, string>>;
  };
}

interface WiringScheduleMappingGridProps {
  headers: string[];
  rows: string[][];
  mapping: Record<string, string>;
  includedHeaders: Record<string, boolean>;
  onMappingChange: (mapping: Record<string, string>) => void;
  onToggleHeader: (header: string, checked: boolean) => void;
  onToggleAll: (checked: boolean) => void;
  searchQuery: string;
  columnFilter: WiringColumnFilter;
  preview: WiringSchedulePreview | null;
  variant?: WiringGridVariant;
  columnWidths?: Record<string, number>;
  onColumnResize?: (header: string, width: number) => void;
  frozenColumns?: number;
  /** Read-only review — disables checkboxes and mapping edits */
  readOnly?: boolean;
}

const DEFAULT_COL_WIDTH = 128;
const MIN_COL_WIDTH = 56;
const MAX_COL_WIDTH = 520;
const IDX_COL_WIDTH = 44;

function isHeaderIncluded(includedHeaders: Record<string, boolean>, header: string): boolean {
  return includedHeaders[header] !== false;
}

function headerColumnState(
  header: string,
  mapping: Record<string, string>,
  included: boolean,
): 'unselected' | 'required' | 'mapped' | 'idle' {
  if (!included) return 'unselected';
  const fk = fieldKeyForHeader(mapping, header);
  if (!fk) return 'idle';
  const field = WIRING_SYSTEM_FIELDS.find(f => f.key === fk);
  if (field?.required) return 'required';
  return 'mapped';
}

function WuCheckbox({
  checked,
  indeterminate = false,
  disabled = false,
  onChange,
  title,
  ariaLabel,
}: {
  checked: boolean;
  indeterminate?: boolean;
  disabled?: boolean;
  onChange: (checked: boolean) => void;
  title?: string;
  ariaLabel: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (inputRef.current) inputRef.current.indeterminate = indeterminate;
  }, [indeterminate, checked]);

  return (
    <label className={`wu-check${disabled ? ' wu-check--disabled' : ''}`} title={title}>
      <input
        ref={inputRef}
        type="checkbox"
        className="wu-check-native"
        checked={checked}
        disabled={disabled}
        onChange={e => onChange(e.target.checked)}
        aria-label={ariaLabel}
      />
      <span className="wu-check-box" aria-hidden />
    </label>
  );
}

export default function WiringScheduleMappingGrid({
  headers,
  rows,
  mapping,
  includedHeaders,
  onMappingChange,
  onToggleHeader,
  onToggleAll,
  searchQuery,
  columnFilter,
  preview,
  variant = 'inline',
  columnWidths,
  onColumnResize,
  frozenColumns = 1,
  readOnly = false,
}: WiringScheduleMappingGridProps) {
  const isFullview = variant === 'fullview';
  const q = searchQuery.trim().toLowerCase();

  const [resizing, setResizing] = useState<{
    header: string;
    startX: number;
    startWidth: number;
  } | null>(null);

  const getColWidth = useCallback(
    (header: string) => columnWidths?.[header] ?? DEFAULT_COL_WIDTH,
    [columnWidths],
  );

  const colStyle = useCallback(
    (header: string): CSSProperties | undefined => {
      if (!isFullview) return undefined;
      const w = getColWidth(header);
      return { width: w, minWidth: w, maxWidth: w };
    },
    [isFullview, getColWidth],
  );

  const idxStyle: CSSProperties = {
    width: IDX_COL_WIDTH,
    minWidth: IDX_COL_WIDTH,
    maxWidth: IDX_COL_WIDTH,
  };

  const frozenClass = frozenColumns > 0 ? 'wu-grid-frozen' : '';

  useEffect(() => {
    if (!resizing || !onColumnResize) return;
    const onMove = (e: MouseEvent) => {
      const delta = e.clientX - resizing.startX;
      const next = Math.min(MAX_COL_WIDTH, Math.max(MIN_COL_WIDTH, resizing.startWidth + delta));
      onColumnResize(resizing.header, next);
    };
    const onUp = () => setResizing(null);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, [resizing, onColumnResize]);

  const startResize = (header: string, e: React.MouseEvent) => {
    if (!onColumnResize) return;
    e.preventDefault();
    e.stopPropagation();
    setResizing({ header, startX: e.clientX, startWidth: getColWidth(header) });
  };

  const visibleHeaders = useMemo(() => {
    return headers.filter(header => {
      const included = isHeaderIncluded(includedHeaders, header);
      const fk = fieldKeyForHeader(mapping, header);
      const field = fk ? WIRING_SYSTEM_FIELDS.find(f => f.key === fk) : null;
      switch (columnFilter) {
        case 'selected':
          return included;
        case 'unselected':
          return !included;
        case 'required':
          return !!field?.required;
        default:
          return true;
      }
    });
  }, [headers, includedHeaders, mapping, columnFilter]);

  const visibleRows = useMemo(() => {
    let list = rows.map((row, idx) => ({ row, idx }));
    if (q) {
      list = list.filter(({ row }) =>
        row.some(cell => String(cell ?? '').toLowerCase().includes(q)),
      );
    }
    return list;
  }, [rows, q]);

  const headerIndex = useMemo(() => {
    const m = new Map<string, number>();
    headers.forEach((h, i) => m.set(h, i));
    return m;
  }, [headers]);

  const allIncluded = headers.length > 0 && headers.every(h => isHeaderIncluded(includedHeaders, h));
  const someIncluded = headers.some(h => isHeaderIncluded(includedHeaders, h));
  const masterIndeterminate = someIncluded && !allIncluded;

  const wrapClass = [
    isFullview ? 'wu-grid-wrap wu-grid-wrap--fullview' : 'wu-grid-wrap',
    readOnly ? 'wu-grid-wrap--readonly' : '',
  ].filter(Boolean).join(' ');
  const tableClass = isFullview
    ? 'wu-grid-table wu-grid-table--fullview mapping-table'
    : 'wu-grid-table mapping-table';

  return (
    <div className={wrapClass} role="region" aria-label="Wiring schedule worksheet">
      <table className={tableClass}>
        <colgroup>
          <col style={idxStyle} />
          {visibleHeaders.map(header => (
            <col key={`col-${header}`} style={colStyle(header)} />
          ))}
        </colgroup>
        <thead>
          <tr className="wu-grid-row-check">
            <th className={`wu-grid-th-idx ${frozenClass}`} scope="col" style={idxStyle}>
              <WuCheckbox
                checked={allIncluded}
                indeterminate={masterIndeterminate}
                disabled={readOnly}
                onChange={checked => { if (!readOnly) onToggleAll(checked); }}
                title={readOnly ? 'Read-only' : allIncluded ? 'Unselect all columns' : 'Select all columns'}
                ariaLabel="Select all columns"
              />
            </th>
            {visibleHeaders.map(header => {
              const included = isHeaderIncluded(includedHeaders, header);
              const state = headerColumnState(header, mapping, included);
              return (
                <th
                  key={`chk-${header}`}
                  scope="col"
                  className={`wu-grid-th-check wu-col--${state}`}
                  style={colStyle(header)}
                >
                  <WuCheckbox
                    checked={included}
                    disabled={readOnly}
                    onChange={next => { if (!readOnly) onToggleHeader(header, next); }}
                    title={readOnly ? 'Read-only' : included ? `Exclude ${header}` : `Include ${header}`}
                    ariaLabel={`Include column ${header}`}
                  />
                </th>
              );
            })}
          </tr>
          <tr className="wu-grid-row-header">
            <th className={`wu-grid-th-idx ${frozenClass}`} scope="col" style={idxStyle}>#</th>
            {visibleHeaders.map(header => {
              const included = isHeaderIncluded(includedHeaders, header);
              const state = headerColumnState(header, mapping, included);
              return (
                <th
                  key={header}
                  className={`wu-grid-th-header wu-col--${state}`}
                  scope="col"
                  title={header}
                  style={colStyle(header)}
                >
                  <span className="wu-grid-header-text">{header}</span>
                  {isFullview && onColumnResize && (
                    <span
                      className={`wu-col-resize${resizing?.header === header ? ' is-active' : ''}`}
                      role="separator"
                      aria-orientation="vertical"
                      aria-label={`Resize column ${header}`}
                      onMouseDown={e => startResize(header, e)}
                    />
                  )}
                </th>
              );
            })}
          </tr>
          <tr className="wu-grid-row-map">
            <th className={`wu-grid-th-idx ${frozenClass}`} scope="col" style={idxStyle} aria-hidden>
              <span className="wu-grid-map-icon">↕</span>
            </th>
            {visibleHeaders.map(header => {
              const included = isHeaderIncluded(includedHeaders, header);
              const fk = fieldKeyForHeader(mapping, header);
              const field = fk ? WIRING_SYSTEM_FIELDS.find(f => f.key === fk) : null;
              const state = headerColumnState(header, mapping, included);
              const mapState = !included
                ? 'skip'
                : field?.required
                  ? 'required'
                  : fk
                    ? 'mapped'
                    : 'idle';
              return (
                <th key={`map-${header}`} scope="col" className={`wu-col--${state}`} style={colStyle(header)}>
                  <select
                    className={`wu-map-select wu-map-select--${mapState}`}
                    value={fk || ''}
                    disabled={!included || readOnly}
                    onChange={e => { if (!readOnly) onMappingChange(updateWiringMapping(mapping, header, e.target.value)); }}
                    aria-label={`Map column ${header}`}
                    aria-readonly={readOnly || undefined}
                  >
                    <option value="">— skip —</option>
                    {WIRING_SYSTEM_FIELDS.map(sf => (
                      <option
                        key={sf.key}
                        value={sf.key}
                        disabled={!!mapping[sf.key] && mapping[sf.key] !== header}
                      >
                        {sf.label}{sf.required ? ' ★' : ''}
                      </option>
                    ))}
                  </select>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {visibleRows.length === 0 ? (
            <tr>
              <td colSpan={visibleHeaders.length + 1} className="wu-grid-empty">
                No rows match the current search.
              </td>
            </tr>
          ) : visibleRows.map(({ row, idx }) => {
            const rowIssues = preview?.validation.issues[idx];
            const hasError = !!rowIssues && Object.keys(rowIssues).length > 0;
            return (
              <tr key={idx} className={hasError ? 'wu-grid-row-error' : undefined}>
                <td className={`wu-grid-td wu-grid-td-idx ${frozenClass}`} style={idxStyle}>{idx + 1}</td>
                {visibleHeaders.map(header => {
                  const ci = headerIndex.get(header) ?? 0;
                  const included = isHeaderIncluded(includedHeaders, header);
                  const fk = fieldKeyForHeader(mapping, header);
                  const val = String(row[ci] ?? '');
                  const issueMsg = rowIssues && fk ? rowIssues[fk] : undefined;
                  const state = headerColumnState(header, mapping, included);
                  return (
                    <td
                      key={`${idx}-${header}`}
                      className={`wu-grid-td wu-col--${state} ${isMonoWiringField(fk) ? 'wu-grid-td-mono' : ''} ${issueMsg ? 'wu-grid-td-issue' : ''} ${!included ? 'wu-grid-td-off' : !fk ? 'wu-grid-td-skip' : ''}`}
                      style={colStyle(header)}
                      title={issueMsg ? `${val} — ${issueMsg}` : val || undefined}
                    >
                      {val || <span className="wu-grid-empty-cell">—</span>}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
