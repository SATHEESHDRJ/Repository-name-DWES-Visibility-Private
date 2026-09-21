import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { Cable } from '../../../types';
import { Search, X } from '../../ui/icons';
import {
  buildEquipmentWiringStatusSummary,
  collectScheduleEquipment,
  type EquipmentWiringOverallStatus,
  type ExtendedCableStatus,
} from './wiring-utils';

function displayOverallStatus(status: EquipmentWiringOverallStatus): string {
  switch (status) {
    case 'NOT STARTED':
      return 'Not Started';
    case 'IN PROGRESS':
      return 'In Progress';
    case 'ATTENTION REQUIRED':
      return 'Attention Required';
    case 'COMPLETED':
      return 'Completed';
    case 'COMPLETED WITH OPEN ENDS':
      return 'Completed with Open Ends';
    default:
      return status;
  }
}

function statusPillModifier(status: EquipmentWiringOverallStatus): string {
  switch (status) {
    case 'NOT STARTED':
      return 'not-started';
    case 'IN PROGRESS':
      return 'in-progress';
    case 'ATTENTION REQUIRED':
      return 'attention';
    case 'COMPLETED':
      return 'completed';
    case 'COMPLETED WITH OPEN ENDS':
      return 'completed-open';
    default:
      return 'not-started';
  }
}

interface Props {
  open: boolean;
  cables: Cable[];
  status: Record<string, ExtendedCableStatus>;
  equipmentQuery: string;
  onApplyFilter: (equipment: string) => void;
  onClearFilter: () => void;
  onClose: () => void;
}

/** Searchable per-equipment live status popup for the current Project/Panel schedule. */
export default function EquipmentStatusModal({
  open,
  cables,
  status,
  equipmentQuery,
  onApplyFilter,
  onClearFilter,
  onClose,
}: Props) {
  const panelRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const [search, setSearch] = useState('');
  const [draft, setDraft] = useState(equipmentQuery.trim());

  const equipmentList = useMemo(() => collectScheduleEquipment(cables), [cables]);

  const rows = useMemo(
    () => equipmentList.map(name => ({
      name,
      summary: buildEquipmentWiringStatusSummary(cables, status, name),
    })),
    [equipmentList, cables, status],
  );

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return rows;
    return rows.filter(row => row.name.toLowerCase().includes(needle));
  }, [rows, search]);

  useEffect(() => {
    if (!open) return;
    setSearch('');
    setDraft(equipmentQuery.trim());
    const t = window.setTimeout(() => searchRef.current?.focus(), 0);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.clearTimeout(t);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, equipmentQuery]);

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

  if (!open) return null;

  const activeFilter = equipmentQuery.trim();
  const draftInList = !!draft && equipmentList.some(item => item === draft);
  const applyDisabled = !draftInList;

  return createPortal(
    <div className="tech-equip-status-root" role="presentation">
      <button
        type="button"
        className="tech-equip-status-backdrop"
        aria-label="Close equipment status"
        onClick={onClose}
      />
      <div
        ref={panelRef}
        className="tech-equip-status-popup"
        role="dialog"
        aria-modal="true"
        aria-labelledby="tech-equip-status-title"
      >
        <div className="tech-equip-status-popup__head">
          <div className="tech-equip-status-popup__title-row">
            <h3 id="tech-equip-status-title" className="tech-equip-status-popup__title">
              Equipment Status
            </h3>
            <span className="tech-equip-status-popup__live" aria-label="Live status">
              <span className="tech-equip-status-popup__live-dot" aria-hidden />
              LIVE
            </span>
          </div>
          <button
            type="button"
            className="tech-equip-status-popup__close"
            onClick={onClose}
            aria-label="Close equipment status"
            title="Close"
          >
            <X size={16} aria-hidden />
          </button>
        </div>

        <label className="tech-equip-status-popup__search">
          <Search size={14} aria-hidden />
          <input
            ref={searchRef}
            type="search"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search equipment…"
            aria-label="Search equipment"
          />
        </label>

        <div className="tech-equip-status-popup__table-wrap">
          {equipmentList.length === 0 ? (
            <p className="tech-equip-status-popup__empty" role="status">
              No equipment found in this Digital Wiring Schedule.
            </p>
          ) : filtered.length === 0 ? (
            <p className="tech-equip-status-popup__empty" role="status">
              No equipment match this search.
            </p>
          ) : (
            <table className="tech-equip-status-popup__table">
              <thead>
                <tr>
                  <th scope="col">Equipment Name</th>
                  <th scope="col">Total Wires</th>
                  <th scope="col">Finished</th>
                  <th scope="col">Pending</th>
                  <th scope="col">Skipped</th>
                  <th scope="col">Open Source</th>
                  <th scope="col">Open Destination</th>
                  <th scope="col">Corrected</th>
                  <th scope="col">Progress %</th>
                  <th scope="col">Overall Status</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(row => {
                  const isActiveFilter = activeFilter.toLowerCase() === row.name.toLowerCase();
                  const isDraft = draft === row.name;
                  const statusMod = statusPillModifier(row.summary.overallStatus);
                  return (
                    <tr
                      key={row.name}
                      className={[
                        isDraft ? 'is-draft' : '',
                        isActiveFilter ? 'is-active-filter' : '',
                      ].filter(Boolean).join(' ')}
                      onClick={() => setDraft(row.name)}
                      onKeyDown={e => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          setDraft(row.name);
                        }
                      }}
                      tabIndex={0}
                      aria-selected={isDraft}
                    >
                      <td className="tech-equip-status-popup__name" title={row.name}>{row.name}</td>
                      <td>{row.summary.total}</td>
                      <td>{row.summary.finished}</td>
                      <td>{row.summary.pending}</td>
                      <td>{row.summary.skipped}</td>
                      <td>{row.summary.openSource}</td>
                      <td>{row.summary.openDestination}</td>
                      <td>{row.summary.corrected}</td>
                      <td>
                        <span className="tech-equip-status-popup__progress">
                          {row.summary.progressPct}%
                        </span>
                      </td>
                      <td>
                        <span
                          className={`tech-equip-status-pill tech-equip-status-pill--${statusMod}`}
                          title={displayOverallStatus(row.summary.overallStatus)}
                        >
                          <span className="tech-equip-status-pill__dot" aria-hidden />
                          {displayOverallStatus(row.summary.overallStatus)}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        <div className="tech-equip-status-popup__footer">
          <button
            type="button"
            className="btn-secondary btn-sm"
            onClick={() => {
              setDraft('');
              onClearFilter();
              onClose();
            }}
          >
            Clear Filter
          </button>
          <button
            type="button"
            className="btn-primary btn-sm"
            disabled={applyDisabled}
            onClick={() => {
              if (!draftInList) return;
              onApplyFilter(draft);
              onClose();
            }}
          >
            Apply as Filter
          </button>
          <button type="button" className="btn-secondary btn-sm" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
