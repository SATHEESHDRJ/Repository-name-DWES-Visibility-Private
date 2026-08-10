import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Search, X } from '../ui/icons';
import {
  formatSkipDateTime,
  type SkippedWireRow,
} from './wiring/wiring-utils';

export type SkippedListFilter = 'all' | 'pending' | 'later_finished';

interface Props {
  open: boolean;
  rows: SkippedWireRow[];
  onOpenWire: (index: number) => void;
  onClear: () => void;
  onClose: () => void;
}

function rowSearchText(row: SkippedWireRow): string {
  return [
    row.wireNumber,
    row.sourceEquipment,
    row.sourceTerminal,
    row.destinationEquipment,
    row.destinationTerminal,
    row.skippedBy,
    row.skipReason,
    row.statusLabel,
    formatSkipDateTime(row.skippedAt),
  ].map(v => String(v ?? '')).join(' ').toLowerCase();
}

/** Centred skipped-wire list for the Technician dashboard sidebar filter. */
export default function SkippedWireFilterPopup({
  open,
  rows,
  onOpenWire,
  onClear,
  onClose,
}: Props) {
  const searchRef = useRef<HTMLInputElement>(null);
  const [search, setSearch] = useState('');
  const [listFilter, setListFilter] = useState<SkippedListFilter>('all');
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);

  useEffect(() => {
    if (!open) return;
    setSearch('');
    setListFilter('all');
    setSelectedIndex(null);
    const t = window.setTimeout(() => searchRef.current?.focus(), 0);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.clearTimeout(t);
      document.body.style.overflow = prevOverflow;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  useEffect(() => {
    if (selectedIndex == null) return;
    if (!rows.some(r => r.index === selectedIndex)) {
      setSelectedIndex(null);
    }
  }, [rows, selectedIndex]);

  const filtered = useMemo(() => {
    let list = rows;
    if (listFilter === 'pending') {
      list = list.filter(r => r.kind === 'pending');
    } else if (listFilter === 'later_finished') {
      list = list.filter(r => r.kind === 'later_finished');
    }
    const needle = search.trim().toLowerCase();
    if (!needle) return list;
    return list.filter(r => rowSearchText(r).includes(needle));
  }, [rows, listFilter, search]);

  const pendingCount = useMemo(() => rows.filter(r => r.kind === 'pending').length, [rows]);
  const laterCount = useMemo(() => rows.filter(r => r.kind === 'later_finished').length, [rows]);

  if (!open) return null;

  const canOpen = selectedIndex != null && rows.some(r => r.index === selectedIndex);

  return createPortal(
    <div className="tech-skipped-filter-root" role="presentation">
      <button
        type="button"
        className="tech-skipped-filter-backdrop"
        aria-label="Close skipped wire filter"
        onClick={onClose}
      />
      <div
        className="tech-skipped-filter-popup"
        role="dialog"
        aria-modal="true"
        aria-labelledby="tech-skipped-filter-title"
      >
        <div className="tech-skipped-filter-popup__head">
          <div className="tech-skipped-filter-popup__head-text">
            <h3 id="tech-skipped-filter-title" className="tech-skipped-filter-popup__title">
              Skipped Wire Filter
            </h3>
            <p className="tech-skipped-filter-popup__sub">
              Skipped wires in this Digital Wiring Schedule
            </p>
          </div>
          <button
            type="button"
            className="tech-skipped-filter-popup__close"
            onClick={onClose}
            aria-label="Close skipped wire filter"
            title="Close"
          >
            <X size={16} aria-hidden />
          </button>
        </div>

        <label className="tech-skipped-filter-popup__search">
          <Search size={14} aria-hidden />
          <input
            ref={searchRef}
            type="search"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search wire, equipment, reason…"
            aria-label="Search skipped wires"
          />
        </label>

        <div className="tech-skipped-filter-popup__tabs" role="tablist" aria-label="Skipped wire filters">
          <button
            type="button"
            role="tab"
            aria-selected={listFilter === 'all'}
            className={`tech-skipped-filter-popup__tab${listFilter === 'all' ? ' is-active' : ''}`}
            onClick={() => setListFilter('all')}
          >
            All Skipped ({rows.length})
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={listFilter === 'pending'}
            className={`tech-skipped-filter-popup__tab${listFilter === 'pending' ? ' is-active' : ''}`}
            onClick={() => setListFilter('pending')}
          >
            Pending Skipped ({pendingCount})
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={listFilter === 'later_finished'}
            className={`tech-skipped-filter-popup__tab${listFilter === 'later_finished' ? ' is-active' : ''}`}
            onClick={() => setListFilter('later_finished')}
          >
            Later Finished ({laterCount})
          </button>
        </div>

        <div className="tech-skipped-filter-popup__table-wrap">
          {rows.length === 0 ? (
            <p className="tech-skipped-filter-popup__empty" role="status">
              No skipped wires found in this Digital Wiring Schedule.
            </p>
          ) : filtered.length === 0 ? (
            <p className="tech-skipped-filter-popup__empty" role="status">
              No skipped wires match this search or filter.
            </p>
          ) : (
            <table className="tech-skipped-filter-popup__table">
              <thead>
                <tr>
                  <th scope="col">Wire</th>
                  <th scope="col">Source Equip.</th>
                  <th scope="col">Src Term.</th>
                  <th scope="col">Dest Equip.</th>
                  <th scope="col">Dst Term.</th>
                  <th scope="col">Skipped</th>
                  <th scope="col">Skipped by</th>
                  <th scope="col">Reason</th>
                  <th scope="col">Status</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(row => {
                  const selected = selectedIndex === row.index;
                  return (
                    <tr
                      key={row.index}
                      className={selected ? 'is-selected' : undefined}
                      onClick={() => setSelectedIndex(row.index)}
                      onDoubleClick={() => {
                        setSelectedIndex(row.index);
                        onOpenWire(row.index);
                      }}
                      aria-selected={selected}
                    >
                      <td>{row.wireNumber}</td>
                      <td title={row.sourceEquipment}>{row.sourceEquipment}</td>
                      <td title={row.sourceTerminal}>{row.sourceTerminal}</td>
                      <td title={row.destinationEquipment}>{row.destinationEquipment}</td>
                      <td title={row.destinationTerminal}>{row.destinationTerminal}</td>
                      <td title={formatSkipDateTime(row.skippedAt)}>{formatSkipDateTime(row.skippedAt)}</td>
                      <td title={row.skippedBy}>{row.skippedBy}</td>
                      <td title={row.skipReason}>{row.skipReason}</td>
                      <td>
                        <span
                          className={`tech-skipped-filter-popup__status tech-skipped-filter-popup__status--${row.kind}`}
                        >
                          {row.statusLabel}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        <div className="tech-skipped-filter-popup__footer">
          <button
            type="button"
            className="btn-secondary btn-sm"
            onClick={() => {
              setSelectedIndex(null);
              onClear();
            }}
          >
            Clear Filter
          </button>
          <button type="button" className="btn-secondary btn-sm" onClick={onClose}>
            Close
          </button>
          <button
            type="button"
            className="btn-primary btn-sm"
            disabled={!canOpen}
            onClick={() => {
              if (selectedIndex == null) return;
              onOpenWire(selectedIndex);
            }}
          >
            Open Wire
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
