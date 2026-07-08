import { useCallback, useEffect, useLayoutEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { TriangleAlert } from './icons';

export type ButtonHintTone = 'warn';

type Position = { top: number; left: number; placement: 'right' | 'bottom' };

/**
 * Lightweight anchored hint beside a button. Auto-dismisses; portaled to avoid
 * overflow clipping. Warning styling matches design-system amber tokens.
 */
export default function ButtonHintPopover({
  anchorEl,
  message,
  tone = 'warn',
  duration = 3200,
  onDismiss,
}: {
  anchorEl: HTMLElement | null;
  message: string;
  tone?: ButtonHintTone;
  duration?: number;
  onDismiss: () => void;
}) {
  const [pos, setPos] = useState<Position | null>(null);

  const updatePos = useCallback(() => {
    if (!anchorEl) {
      setPos(null);
      return;
    }
    const rect = anchorEl.getBoundingClientRect();
    const gap = 8;
    const estWidth = 220;
    const estHeight = 36;
    const fitsRight = rect.right + gap + estWidth <= window.innerWidth - 8;

    if (fitsRight) {
      setPos({
        top: rect.top + rect.height / 2,
        left: rect.right + gap,
        placement: 'right',
      });
      return;
    }

    setPos({
      top: rect.bottom + gap,
      left: rect.left + rect.width / 2,
      placement: 'bottom',
    });

    // Keep below placement if it would clip off the bottom edge.
    if (rect.bottom + gap + estHeight > window.innerHeight - 8) {
      setPos({
        top: Math.max(8, rect.top - gap - estHeight),
        left: rect.left + rect.width / 2,
        placement: 'bottom',
      });
    }
  }, [anchorEl]);

  useLayoutEffect(() => {
    updatePos();
    window.addEventListener('scroll', updatePos, true);
    window.addEventListener('resize', updatePos);
    return () => {
      window.removeEventListener('scroll', updatePos, true);
      window.removeEventListener('resize', updatePos);
    };
  }, [updatePos]);

  useEffect(() => {
    if (!anchorEl || !message) return;
    const id = setTimeout(onDismiss, duration);
    return () => clearTimeout(id);
  }, [anchorEl, message, duration, onDismiss]);

  if (!anchorEl || !message || !pos) return null;

  const transform = pos.placement === 'right' ? 'translateY(-50%)' : 'translateX(-50%)';

  return createPortal(
    <div
      className="button-hint-popover-wrap"
      style={{ top: pos.top, left: pos.left, transform }}
      role="alert"
      aria-live="polite"
    >
      <div className={`button-hint-popover ${tone}`}>
        <span className="button-hint-popover-icon" aria-hidden>
          <TriangleAlert size={14} strokeWidth={2} />
        </span>
        <span className="button-hint-popover-text">{message}</span>
      </div>
    </div>,
    document.body,
  );
}
