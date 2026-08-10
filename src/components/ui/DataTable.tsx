/**
 * DataTable — shared enterprise data grid primitive.
 *
 * Features: sticky header, 3-state column sort, resizable columns,
 * column-visibility menu, global search, bulk row selection, pagination,
 * CSV export, row actions, loading skeleton, empty state. Fully tokenized
 * (consumes the MD3 --color-* vars) and Material-Symbols icons only.
 *
 * The component is intentionally presentational + self-contained: pass it
 * `columns` + `rows` and it manages sort/search/select/paginate internally.
 * Selection and row-click are surfaced via callbacks.
 */
import {
  useMemo, useState, useRef, useEffect, useCallback, type ReactNode,
} from 'react';
import {
  Search, ChevronUp, ChevronDown, ArrowDownUp, ChevronLeft, ChevronRight,
  Columns3, Download, Check, Loader, X,
} from './icons';

export interface DataTableColumn<T> {
  /** Stable unique key (used for sort state, visibility, widths). */
  key: string;
  /** Column header label. */
  header: string;
  /** Cell renderer. Defaults to String(value) via `accessor`. */
  render?: (row: T, index: number) => ReactNode;
  /** Raw value accessor — used for sort, search and CSV export fallbacks. */
  accessor?: (row: T) => string | number | null | undefined;
  /** Override sort comparison value. Falls back to `accessor`. */
  sortValue?: (row: T) => string | number;
  /** Override CSV export value. Falls back to `accessor`. */
  exportValue?: (row: T) => string | number;
  sortable?: boolean;
  align?: 'left' | 'center' | 'right';
  /** Initial px width. Enables fixed-layout resizing when set. */
  width?: number;
  minWidth?: number;
  /** Whether the column can be hidden via the column menu (default true). */
  hideable?: boolean;
  defaultHidden?: boolean;
}

export interface DataTableProps<T> {
  columns: DataTableColumn<T>[];
  rows: T[];
  rowKey: (row: T) => string | number;

  /** Toolbar title (optional). */
  title?: ReactNode;
  /** Extra toolbar content on the right (e.g. a "New" button). */
  toolbar?: ReactNode;

  loading?: boolean;
  emptyMessage?: string;
  emptyIcon?: ReactNode;

  searchable?: boolean;
  searchPlaceholder?: string;

  selectable?: boolean;
  onSelectionChange?: (rows: T[]) => void;
  /** Rendered in the bulk-action bar when rows are selected. */
  bulkActions?: (rows: T[]) => ReactNode;

  columnToggle?: boolean;
  resizable?: boolean;
  stickyHeader?: boolean;

  pagination?: boolean;
  pageSize?: number;

  exportable?: boolean;
  exportFileName?: string;

  onRowClick?: (row: T) => void;
  rowActions?: (row: T) => ReactNode;

  /** Persist column visibility + widths + page size under this key. */
  storageKey?: string;
  /** Compact row height. */
  dense?: boolean;
  className?: string;
  /** Max body height before internal scroll (with sticky header). */
  maxBodyHeight?: number | string;
}

type SortState = { key: string; dir: 'asc' | 'desc' } | null;

function readStore(key?: string): any {
  if (!key) return null;
  try { return JSON.parse(localStorage.getItem(`dt:${key}`) || 'null'); }
  catch { return null; }
}
function writeStore(key: string | undefined, value: any) {
  if (!key) return;
  try { localStorage.setItem(`dt:${key}`, JSON.stringify(value)); } catch { /* quota */ }
}

function cellText(col: DataTableColumn<any>, row: any): string {
  const v = col.exportValue?.(row) ?? col.accessor?.(row);
  return v == null ? '' : String(v);
}

function csvEscape(s: string): string {
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function DataTable<T>({
  columns,
  rows,
  rowKey,
  title,
  toolbar,
  loading = false,
  emptyMessage = 'No records found.',
  emptyIcon,
  searchable = true,
  searchPlaceholder = 'Search…',
  selectable = false,
  onSelectionChange,
  bulkActions,
  columnToggle = true,
  resizable = true,
  stickyHeader = true,
  pagination = true,
  pageSize: pageSizeProp = 25,
  exportable = false,
  exportFileName = 'export.csv',
  onRowClick,
  rowActions,
  storageKey,
  dense = false,
  className = '',
  maxBodyHeight,
}: DataTableProps<T>) {
  const persisted = useMemo(() => readStore(storageKey), [storageKey]);

  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<SortState>(null);
  const [page, setPage] = useState(0);
  const [pageSize] = useState<number>(persisted?.pageSize ?? pageSizeProp);
  const [selected, setSelected] = useState<Set<string | number>>(new Set());
  const [menuOpen, setMenuOpen] = useState(false);

  const [hidden, setHidden] = useState<Set<string>>(
    () => new Set<string>(persisted?.hidden ?? columns.filter(c => c.defaultHidden).map(c => c.key)),
  );
  const [widths, setWidths] = useState<Record<string, number>>(
    () => persisted?.widths ?? {},
  );

  const menuRef = useRef<HTMLDivElement>(null);

  // Persist prefs
  useEffect(() => {
    writeStore(storageKey, { hidden: [...hidden], widths, pageSize });
  }, [storageKey, hidden, widths, pageSize]);

  // Surface selection to parent
  useEffect(() => {
    if (!onSelectionChange) return;
    const map = new Map(rows.map(r => [rowKey(r), r]));
    onSelectionChange([...selected].map(k => map.get(k)).filter(Boolean) as T[]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, rows]);

  // Close column menu on outside click / Esc
  useEffect(() => {
    if (!menuOpen) return;
    const onDown = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setMenuOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [menuOpen]);

  const visibleCols = useMemo(
    () => columns.filter(c => !hidden.has(c.key)),
    [columns, hidden],
  );

  // ── Filter ──
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(row =>
      columns.some(col => {
        const v = col.accessor?.(row);
        return v != null && String(v).toLowerCase().includes(q);
      }),
    );
  }, [rows, columns, query]);

  // ── Sort ──
  const sorted = useMemo(() => {
    if (!sort) return filtered;
    const col = columns.find(c => c.key === sort.key);
    if (!col) return filtered;
    const val = (row: T) => col.sortValue?.(row) ?? col.accessor?.(row) ?? '';
    const dir = sort.dir === 'asc' ? 1 : -1;
    return [...filtered].sort((a, b) => {
      const av = val(a), bv = val(b);
      if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * dir;
      return String(av).localeCompare(String(bv), undefined, { numeric: true }) * dir;
    });
  }, [filtered, sort, columns]);

  // ── Paginate ──
  const total = sorted.length;
  const pageCount = pagination ? Math.max(1, Math.ceil(total / pageSize)) : 1;
  const safePage = Math.min(page, pageCount - 1);
  const paged = useMemo(() => {
    if (!pagination) return sorted;
    const start = safePage * pageSize;
    return sorted.slice(start, start + pageSize);
  }, [sorted, pagination, safePage, pageSize]);

  useEffect(() => { if (page > pageCount - 1) setPage(0); }, [pageCount, page]);
  // Reset to first page when the query changes
  useEffect(() => { setPage(0); }, [query]);

  // ── Selection ──
  const pageKeys = useMemo(() => paged.map(rowKey), [paged, rowKey]);
  const allOnPageSelected = pageKeys.length > 0 && pageKeys.every(k => selected.has(k));
  const someOnPageSelected = pageKeys.some(k => selected.has(k));

  const toggleAllOnPage = useCallback(() => {
    setSelected(prev => {
      const next = new Set(prev);
      if (allOnPageSelected) pageKeys.forEach(k => next.delete(k));
      else pageKeys.forEach(k => next.add(k));
      return next;
    });
  }, [allOnPageSelected, pageKeys]);

  const toggleRow = useCallback((k: string | number) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k); else next.add(k);
      return next;
    });
  }, []);

  const clearSelection = useCallback(() => setSelected(new Set()), []);

  // ── Sort handler ──
  const onSortClick = (col: DataTableColumn<T>) => {
    if (col.sortable === false) return;
    setSort(prev => {
      if (!prev || prev.key !== col.key) return { key: col.key, dir: 'asc' };
      if (prev.dir === 'asc') return { key: col.key, dir: 'desc' };
      return null; // third click clears
    });
  };

  // ── Column resize ──
  const resizeCol = (key: string, startX: number, startW: number) => {
    const onMove = (e: MouseEvent) => {
      const col = columns.find(c => c.key === key);
      const min = col?.minWidth ?? 64;
      setWidths(w => ({ ...w, [key]: Math.max(min, startW + (e.clientX - startX)) }));
    };
    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      document.body.style.userSelect = '';
    };
    document.body.style.userSelect = 'none';
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  };

  const hasFixedWidths = resizable && (Object.keys(widths).length > 0 || columns.some(c => c.width));

  // ── CSV export ──
  const exportCsv = () => {
    const cols = visibleCols;
    const header = cols.map(c => csvEscape(c.header)).join(',');
    const body = sorted.map(row => cols.map(c => csvEscape(cellText(c, row))).join(',')).join('\n');
    const blob = new Blob([`${header}\n${body}`], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = exportFileName;
    a.click();
    URL.revokeObjectURL(url);
  };

  const colWidth = (c: DataTableColumn<T>) => widths[c.key] ?? c.width;
  const selectedRows = useMemo(() => {
    const map = new Map(rows.map(r => [rowKey(r), r]));
    return [...selected].map(k => map.get(k)).filter(Boolean) as T[];
  }, [selected, rows, rowKey]);

  const showToolbar = title || toolbar || searchable || columnToggle || exportable;

  return (
    <div className={`dt-root ${className}`}>
      {showToolbar && (
        <div className="dt-toolbar">
          {title && <div className="dt-title">{title}</div>}
          {searchable && (
            <div className="dt-search">
              <Search size={16} className="dt-search-icon" />
              <input
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder={searchPlaceholder}
                aria-label="Search table"
                className="dt-search-input"
              />
              {query && (
                <button type="button" className="dt-search-clear" onClick={() => setQuery('')} aria-label="Clear search">
                  <X size={14} />
                </button>
              )}
            </div>
          )}
          <div className="dt-toolbar-actions">
            {toolbar}
            {exportable && (
              <button type="button" className="dt-btn" onClick={exportCsv} title="Export CSV">
                <Download size={16} />
                <span className="dt-btn-label">Export</span>
              </button>
            )}
            {columnToggle && (
              <div className="dt-menu-anchor" ref={menuRef}>
                <button
                  type="button"
                  className={`dt-btn ${menuOpen ? 'is-active' : ''}`}
                  onClick={() => setMenuOpen(o => !o)}
                  aria-haspopup="true"
                  aria-expanded={menuOpen}
                  title="Columns"
                >
                  <Columns3 size={16} />
                  <span className="dt-btn-label">Columns</span>
                </button>
                {menuOpen && (
                  <div className="dt-menu" role="menu">
                    <div className="dt-menu-head">Toggle columns</div>
                    {columns.map(col => {
                      const canHide = col.hideable !== false;
                      const isVisible = !hidden.has(col.key);
                      return (
                        <button
                          key={col.key}
                          type="button"
                          role="menuitemcheckbox"
                          aria-checked={isVisible}
                          disabled={!canHide}
                          className="dt-menu-item"
                          onClick={() => {
                            if (!canHide) return;
                            setHidden(h => {
                              const next = new Set(h);
                              if (next.has(col.key)) next.delete(col.key); else next.add(col.key);
                              return next;
                            });
                          }}
                        >
                          <span className={`dt-check ${isVisible ? 'is-on' : ''}`}>
                            {isVisible && <Check size={12} />}
                          </span>
                          <span className="dt-menu-label">{col.header}</span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Bulk-selection action bar */}
      {selectable && selected.size > 0 && (
        <div className="dt-selbar">
          <span className="dt-selbar-count">{selected.size} selected</span>
          <div className="dt-selbar-actions">
            {bulkActions?.(selectedRows)}
            <button type="button" className="dt-btn dt-btn-ghost" onClick={clearSelection}>
              <X size={16} /> Clear
            </button>
          </div>
        </div>
      )}

      <div
        className={`dt-scroll ${stickyHeader ? 'is-sticky' : ''}`}
        style={maxBodyHeight ? { maxHeight: typeof maxBodyHeight === 'number' ? `${maxBodyHeight}px` : maxBodyHeight } : undefined}
      >
        <table className={`dt-table ${dense ? 'is-dense' : ''}`} style={hasFixedWidths ? { tableLayout: 'fixed' } : undefined}>
          <colgroup>
            {selectable && <col style={{ width: 44 }} />}
            {visibleCols.map(c => <col key={c.key} style={colWidth(c) ? { width: colWidth(c) } : undefined} />)}
            {rowActions && <col style={{ width: 1 }} />}
          </colgroup>
          <thead>
            <tr>
              {selectable && (
                <th className="dt-th dt-th-check">
                  <button
                    type="button"
                    className={`dt-check ${allOnPageSelected ? 'is-on' : someOnPageSelected ? 'is-partial' : ''}`}
                    onClick={toggleAllOnPage}
                    aria-label={allOnPageSelected ? 'Deselect all' : 'Select all'}
                  >
                    {allOnPageSelected ? <Check size={12} /> : someOnPageSelected ? <span className="dt-dash" /> : null}
                  </button>
                </th>
              )}
              {visibleCols.map(col => {
                const active = sort?.key === col.key;
                const sortable = col.sortable !== false;
                return (
                  <th
                    key={col.key}
                    className={`dt-th ${sortable ? 'is-sortable' : ''} ${active ? 'is-sorted' : ''} dt-al-${col.align ?? 'left'}`}
                    onClick={sortable ? () => onSortClick(col) : undefined}
                    aria-sort={active ? (sort!.dir === 'asc' ? 'ascending' : 'descending') : undefined}
                  >
                    <span className="dt-th-inner">
                      <span className="dt-th-label">{col.header}</span>
                      {sortable && (
                        <span className="dt-sort-ic">
                          {active
                            ? (sort!.dir === 'asc' ? <ChevronUp size={14} /> : <ChevronDown size={14} />)
                            : <ArrowDownUp size={14} className="dt-sort-idle" />}
                        </span>
                      )}
                    </span>
                    {resizable && (
                      <span
                        className="dt-resize"
                        onMouseDown={e => {
                          e.stopPropagation();
                          const th = (e.currentTarget.parentElement as HTMLElement);
                          resizeCol(col.key, e.clientX, colWidth(col) ?? th.offsetWidth);
                        }}
                        onClick={e => e.stopPropagation()}
                        role="separator"
                        aria-label={`Resize ${col.header}`}
                      />
                    )}
                  </th>
                );
              })}
              {rowActions && <th className="dt-th dt-th-actions" aria-label="Actions" />}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              Array.from({ length: 6 }).map((_, i) => (
                <tr key={`sk-${i}`} className="dt-row">
                  {selectable && <td className="dt-td"><span className="dt-skel dt-skel-check" /></td>}
                  {visibleCols.map(c => <td key={c.key} className="dt-td"><span className="dt-skel" /></td>)}
                  {rowActions && <td className="dt-td"><span className="dt-skel dt-skel-btn" /></td>}
                </tr>
              ))
            ) : paged.length === 0 ? (
              <tr>
                <td className="dt-empty" colSpan={visibleCols.length + (selectable ? 1 : 0) + (rowActions ? 1 : 0)}>
                  <div className="dt-empty-inner">
                    {emptyIcon ?? <Search size={32} className="dt-empty-icon" />}
                    <span>{emptyMessage}</span>
                  </div>
                </td>
              </tr>
            ) : (
              paged.map((row, idx) => {
                const k = rowKey(row);
                const isSel = selected.has(k);
                return (
                  <tr
                    key={k}
                    className={`dt-row ${onRowClick ? 'is-clickable' : ''} ${isSel ? 'is-selected' : ''}`}
                    onClick={onRowClick ? () => onRowClick(row) : undefined}
                  >
                    {selectable && (
                      <td className="dt-td dt-td-check" onClick={e => e.stopPropagation()}>
                        <button
                          type="button"
                          className={`dt-check ${isSel ? 'is-on' : ''}`}
                          onClick={() => toggleRow(k)}
                          aria-label={isSel ? 'Deselect row' : 'Select row'}
                        >
                          {isSel && <Check size={12} />}
                        </button>
                      </td>
                    )}
                    {visibleCols.map(col => (
                      <td key={col.key} className={`dt-td dt-al-${col.align ?? 'left'}`}>
                        {col.render ? col.render(row, idx) : String(col.accessor?.(row) ?? '')}
                      </td>
                    ))}
                    {rowActions && (
                      <td className="dt-td dt-td-actions" onClick={e => e.stopPropagation()}>
                        {rowActions(row)}
                      </td>
                    )}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Footer: range + pagination */}
      {(pagination || exportable) && !loading && (
        <div className="dt-footer">
          <span className="dt-range">
            {total === 0
              ? '0 records'
              : `${safePage * pageSize + 1}–${Math.min((safePage + 1) * pageSize, total)} of ${total}`}
          </span>
          {pagination && pageCount > 1 && (
            <div className="dt-pager">
              <button type="button" className="dt-page-btn" disabled={safePage === 0} onClick={() => setPage(p => p - 1)} aria-label="Previous page">
                <ChevronLeft size={16} />
              </button>
              <span className="dt-page-info">Page {safePage + 1} of {pageCount}</span>
              <button type="button" className="dt-page-btn" disabled={safePage >= pageCount - 1} onClick={() => setPage(p => p + 1)} aria-label="Next page">
                <ChevronRight size={16} />
              </button>
            </div>
          )}
        </div>
      )}

      {loading && (
        <div className="dt-loading-note"><Loader size={14} /> Loading…</div>
      )}
    </div>
  );
}

export default DataTable;
