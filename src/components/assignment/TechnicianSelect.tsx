import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, User } from '../ui/icons';

export interface TechnicianSelectOption {
  id: number;
  /** Display name (falls back to username at call sites). */
  name: string;
  username?: string;
  /** Holds active panel work — shown but not selectable. */
  assigned: boolean;
}

interface TechnicianSelectProps {
  options: TechnicianSelectOption[];
  /** Selected technician id as a string; '' = none. */
  value: string;
  onChange: (id: string) => void;
  disabled?: boolean;
  placeholder?: string;
  /** Render the complete list in-place so only its rows scroll inside a modal. */
  inlineList?: boolean;
}

/**
 * Custom technician dropdown for dialogs. A native <select> popup is drawn by
 * the OS — it can open upward and escape the modal, and its rows cannot show
 * badges. This listbox always opens DOWNWARD inside the dialog, scrolls
 * internally when long, and shows name + @username + an availability dot per
 * technician (green = available, amber = assigned/disabled).
 */
export default function TechnicianSelect({
  options,
  value,
  onChange,
  disabled = false,
  placeholder = 'Select an available technician…',
  inlineList = false,
}: TechnicianSelectProps) {
  const [open, setOpen] = useState(false);
  const [activeId, setActiveId] = useState<number | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // Available first (selectable at a glance), assigned after — both visible.
  const sorted = useMemo(() => {
    const byName = (a: TechnicianSelectOption, b: TechnicianSelectOption) =>
      a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' });
    return [
      ...options.filter(option => !option.assigned).sort(byName),
      ...options.filter(option => option.assigned).sort(byName),
    ];
  }, [options]);

  const selectable = useMemo(() => sorted.filter(option => !option.assigned), [sorted]);
  const selected = options.find(option => String(option.id) === value) ?? null;

  const close = () => { setOpen(false); setActiveId(null); };
  const openMenu = () => {
    if (disabled) return;
    setOpen(true);
    setActiveId(selected && !selected.assigned ? selected.id : (selectable[0]?.id ?? null));
  };

  // Close on outside click.
  useEffect(() => {
    if (!open) return;
    const onDown = (event: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) close();
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  // Keep the freshly opened menu visible inside the scrolling modal body.
  useEffect(() => {
    if (!open) return;
    requestAnimationFrame(() => {
      menuRef.current?.scrollIntoView({ block: 'nearest' });
      menuRef.current?.querySelector('.is-active')?.scrollIntoView({ block: 'nearest' });
    });
  }, [open]);

  // Keep the keyboard-active row visible while navigating.
  useEffect(() => {
    if (!open || activeId == null) return;
    menuRef.current?.querySelector('.is-active')?.scrollIntoView({ block: 'nearest' });
  }, [open, activeId]);

  const moveActive = (direction: 1 | -1) => {
    if (selectable.length === 0) return;
    const index = selectable.findIndex(option => option.id === activeId);
    const next = index === -1
      ? (direction === 1 ? 0 : selectable.length - 1)
      : Math.min(selectable.length - 1, Math.max(0, index + direction));
    setActiveId(selectable[next].id);
  };

  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (disabled) return;
    if (!open) {
      if (['Enter', ' ', 'ArrowDown', 'ArrowUp'].includes(event.key)) {
        event.preventDefault();
        openMenu();
      }
      return;
    }
    // Escape closes only the menu — not the surrounding modal.
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(); return; }
    if (event.key === 'ArrowDown') { event.preventDefault(); moveActive(1); return; }
    if (event.key === 'ArrowUp') { event.preventDefault(); moveActive(-1); return; }
    if (event.key === 'Home') { event.preventDefault(); setActiveId(selectable[0]?.id ?? null); return; }
    if (event.key === 'End') { event.preventDefault(); setActiveId(selectable[selectable.length - 1]?.id ?? null); return; }
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      const target = selectable.find(option => option.id === activeId);
      if (target) { onChange(String(target.id)); close(); }
      return;
    }
    if (event.key === 'Tab') close();
  };

  const optionList = (
    <div
      className={`tech-select-menu${inlineList ? ' is-inline' : ''}`}
      ref={menuRef}
      role="listbox"
      aria-label="Technicians"
    >
      {sorted.length === 0 ? (
        <div className="tech-select-empty">No technicians found.</div>
      ) : sorted.map(option => {
        const isSelected = String(option.id) === value;
        const isActive = option.id === activeId;
        const optionDisabled = disabled || option.assigned;
        return (
          <button
            key={option.id}
            type="button"
            role="option"
            aria-selected={isSelected}
            aria-disabled={optionDisabled || undefined}
            disabled={optionDisabled}
            className={
              `tech-select-option${option.assigned ? ' is-disabled' : ''}`
              + `${isActive ? ' is-active' : ''}${isSelected ? ' is-selected' : ''}`
            }
            onMouseEnter={() => { if (!optionDisabled) setActiveId(option.id); }}
            onClick={() => { if (!optionDisabled) { onChange(String(option.id)); close(); } }}
            tabIndex={inlineList && !optionDisabled ? 0 : -1}
          >
            <span className="tech-select-copy">
              <strong title={option.name}>{option.name}</strong>
              {option.username && <small title={`@${option.username}`}>@{option.username}</small>}
            </span>
            <span className={`tech-select-status ${option.assigned ? 'is-assigned' : 'is-available'}`}>
              <span className="tech-select-dot" aria-hidden="true" />
              {option.assigned ? 'Assigned' : 'Available'}
            </span>
          </button>
        );
      })}
    </div>
  );

  if (inlineList) {
    return (
      <div className="tech-select tech-select--inline" ref={rootRef}>
        {optionList}
      </div>
    );
  }

  return (
    <div className="tech-select" ref={rootRef} onKeyDown={handleKeyDown}>
      <button
        type="button"
        className={`tech-select-trigger${open ? ' is-open' : ''}`}
        onClick={() => (open ? close() : openMenu())}
        disabled={disabled}
        role="combobox"
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-label="Select an available technician"
      >
        <span className="tech-select-lead" aria-hidden="true"><User size={18} /></span>
        {selected ? (
          <span className="tech-select-value">
            <span
              className={`tech-select-dot ${selected.assigned ? 'is-assigned' : 'is-available'}`}
              aria-hidden="true"
            />
            <strong title={selected.name}>{selected.name}</strong>
            {selected.username && <small title={`@${selected.username}`}>@{selected.username}</small>}
          </span>
        ) : (
          <span className="tech-select-placeholder">{placeholder}</span>
        )}
        <ChevronDown size={16} className={`tech-select-chevron${open ? ' is-open' : ''}`} aria-hidden="true" />
      </button>

      {open && optionList}
    </div>
  );
}
