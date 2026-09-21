import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Search, X } from '../ui/icons';

interface Props {
  open: boolean;
  options: string[];
  value: string;
  onApply: (equipment: string) => void;
  onClear: () => void;
  onClose: () => void;
}

/** Centred equipment filter modal for the Technician dashboard (no native select). */
export default function EquipmentFilterPopup({
  open,
  options,
  value,
  onApply,
  onClear,
  onClose,
}: Props) {
  const panelRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const [search, setSearch] = useState('');
  const [draft, setDraft] = useState(value);

  useEffect(() => {
    if (!open) return;
    setSearch('');
    setDraft(value);
    const t = window.setTimeout(() => searchRef.current?.focus(), 0);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.clearTimeout(t);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, value]);

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

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return options;
    return options.filter(item => item.toLowerCase().includes(needle));
  }, [options, search]);

  if (!open) return null;

  return createPortal(
    <div className="tech-equip-filter-root" role="presentation">
      <button
        type="button"
        className="tech-equip-filter-backdrop"
        aria-label="Close equipment filter"
        onClick={onClose}
      />
      <div
        ref={panelRef}
        className="tech-equip-filter-popup tech-equip-filter-popup--modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="tech-equip-filter-title"
      >
        <div className="tech-equip-filter-popup__head">
          <h3 id="tech-equip-filter-title" className="tech-equip-filter-popup__title">
            Filter by Equipment
          </h3>
          <button
            type="button"
            className="tech-equip-filter-popup__close"
            onClick={onClose}
            aria-label="Close equipment filter"
            title="Close"
          >
            <X size={16} aria-hidden />
          </button>
        </div>

        <label className="tech-equip-filter-popup__search">
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

        <div className="tech-equip-filter-popup__list" role="listbox" aria-label="Equipment list">
          <button
            type="button"
            role="option"
            aria-selected={draft === ''}
            className={`tech-equip-filter-popup__option${draft === '' ? ' is-selected' : ''}`}
            onClick={() => setDraft('')}
          >
            <span>All Equipment</span>
            {draft === '' ? <span className="tech-equip-filter-popup__check" aria-hidden>✓</span> : null}
          </button>
          {filtered.map(item => (
            <button
              key={item}
              type="button"
              role="option"
              aria-selected={draft === item}
              className={`tech-equip-filter-popup__option${draft === item ? ' is-selected' : ''}`}
              onClick={() => setDraft(item)}
              title={item}
            >
              <span className="tech-equip-filter-popup__option-text">{item}</span>
              {draft === item ? <span className="tech-equip-filter-popup__check" aria-hidden>✓</span> : null}
            </button>
          ))}
          {filtered.length === 0 && (
            <p className="tech-equip-filter-popup__empty" role="status">No equipment match this search.</p>
          )}
        </div>

        <div className="tech-equip-filter-popup__footer">
          <button
            type="button"
            className="btn-secondary btn-sm"
            onClick={() => {
              setDraft('');
              onClear();
              onClose();
            }}
          >
            Clear Filter
          </button>
          <button
            type="button"
            className="btn-primary btn-sm"
            onClick={() => {
              onApply(draft.trim());
              onClose();
            }}
          >
            Apply
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
