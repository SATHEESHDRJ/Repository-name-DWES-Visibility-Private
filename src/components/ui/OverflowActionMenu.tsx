import { useEffect, useRef, useState } from 'react';
import { Icon } from './Icon';

interface OverflowAction {
  id: string;
  label: string;
  onClick: () => void;
  destructive?: boolean;
  disabled?: boolean;
}

interface OverflowActionMenuProps {
  actions: OverflowAction[];
  ariaLabel?: string;
}

export default function OverflowActionMenu({
  actions,
  ariaLabel = 'More actions',
}: OverflowActionMenuProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;

    const onClickAway = (event: MouseEvent) => {
      const root = rootRef.current;
      if (!root) return;
      if (event.target instanceof Node && !root.contains(event.target)) {
        setOpen(false);
      }
    };

    const onEsc = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };

    document.addEventListener('mousedown', onClickAway);
    document.addEventListener('keydown', onEsc);

    return () => {
      document.removeEventListener('mousedown', onClickAway);
      document.removeEventListener('keydown', onEsc);
    };
  }, [open]);

  return (
    <div className="ops-overflow" ref={rootRef}>
      <button
        type="button"
        className="ops-icon-btn"
        aria-label={ariaLabel}
        onClick={() => setOpen(v => !v)}
      >
        <Icon name="more_horiz" size={18} />
      </button>

      {open && (
        <div className="ops-overflow-menu" role="menu" aria-label={ariaLabel}>
          {actions.map(action => (
            <button
              key={action.id}
              type="button"
              role="menuitem"
              className={`ops-overflow-item${action.destructive ? ' danger' : ''}`}
              disabled={action.disabled}
              onClick={() => {
                setOpen(false);
                action.onClick();
              }}
            >
              {action.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
