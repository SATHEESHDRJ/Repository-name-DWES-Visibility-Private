import { useEffect, useRef, useState } from 'react';
import { ChevronDown, Settings } from '../../ui/icons';

type Props = {
  templateLabel: string;
  directorApplied: boolean;
  busy: boolean;
  upgradeBusy: boolean;
  onApplyDirector: () => void;
  onEditPlanning: () => void;
  onViewUpgradePreview: () => void;
};

export default function PlanningSettingsMenu({
  templateLabel,
  directorApplied,
  busy,
  upgradeBusy,
  onApplyDirector,
  onEditPlanning,
  onViewUpgradePreview,
}: Props) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    window.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div className="pw-plan-toolbar__settings" ref={rootRef}>
      {directorApplied ? (
        <span className="pw-director-applied-badge">Director Template v1 Applied</span>
      ) : null}
      <button
        type="button"
        className="btn-secondary pw-plan-toolbar__settings-btn"
        disabled={busy}
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => setOpen(v => !v)}
      >
        <Settings size={16} aria-hidden />
        Planning Settings
        <ChevronDown size={14} aria-hidden />
      </button>
      {open ? (
        <div className="pw-settings-menu" role="menu">
          <p className="pw-settings-menu__meta">Current template: {templateLabel}</p>
          {!directorApplied ? (
            <button
              type="button"
              role="menuitem"
              className="pw-settings-menu__item"
              disabled={busy || upgradeBusy}
              onClick={() => { setOpen(false); onApplyDirector(); }}
            >
              Apply Director Defaults
            </button>
          ) : null}
          <button
            type="button"
            role="menuitem"
            className="pw-settings-menu__item"
            disabled={busy}
            onClick={() => { setOpen(false); onEditPlanning(); }}
          >
            Edit Planning Defaults
          </button>
          <button
            type="button"
            role="menuitem"
            className="pw-settings-menu__item"
            disabled={busy || upgradeBusy}
            onClick={() => { setOpen(false); onViewUpgradePreview(); }}
          >
            View upgrade preview
          </button>
        </div>
      ) : null}
    </div>
  );
}
