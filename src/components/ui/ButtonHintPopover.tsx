import { useCallback, useEffect, useLayoutEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { TriangleAlert } from './icons';

export type ButtonHintTone = 'warn';

type Position = { top: number; left: number; placement: 'right' | 'left' | 'bottom' | 'top' };

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
    const margin = 8;
    const estWidth = Math.min(280, window.innerWidth - margin * 2);
    const estHeight = 56;
    const spaceRight = window.innerWidth - margin - (rect.right + gap);
    const spaceLeft = rect.left - gap - margin;

    if (spaceRight >= Math.min(estWidth, 180)) {
      setPos({
        top: Math.min(
          Math.max(rect.top + rect.height / 2, margin + estHeight / 2),
          window.innerHeight - margin - estHeight / 2,
        ),
        left: rect.right + gap,
        placement: 'right',
      });
      return;
    }

    if (spaceLeft >= Math.min(estWidth, 180)) {
      setPos({
        top: Math.min(
          Math.max(rect.top + rect.height / 2, margin + estHeight / 2),
          window.innerHeight - margin - estHeight / 2,
        ),
        left: rect.left - gap,
        placement: 'left',
      });
      return;
    }

    const belowTop = rect.bottom + gap;
    const fitsBelow = belowTop + estHeight <= window.innerHeight - margin;
    const top = fitsBelow
      ? belowTop
      : Math.max(margin, rect.top - gap - estHeight);
    const centerX = rect.left + rect.width / 2;
    const clampedLeft = Math.min(
      Math.max(centerX, margin + estWidth / 2),
      window.innerWidth - margin - estWidth / 2,
    );
    setPos({
      top,
      left: clampedLeft,
      placement: fitsBelow ? 'bottom' : 'top',
    });
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

  useEffect(() => {
    if (!anchorEl || !message) return;
    const onPointerDown = (event: MouseEvent | TouchEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      if (anchorEl.contains(target)) return;
      const popover = document.querySelector('.button-hint-popover-wrap');
      if (popover && popover.contains(target)) return;
      onDismiss();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onDismiss();
    };
    // Defer so the opening click does not immediately dismiss.
    const timer = window.setTimeout(() => {
      document.addEventListener('mousedown', onPointerDown);
      document.addEventListener('touchstart', onPointerDown);
      document.addEventListener('keydown', onKeyDown);
    }, 0);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('touchstart', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [anchorEl, message, onDismiss]);

  if (!anchorEl || !message || !pos) return null;

  const transform =
    pos.placement === 'right' || pos.placement === 'left'
      ? `translateY(-50%)${pos.placement === 'left' ? ' translateX(-100%)' : ''}`
      : 'translateX(-50%)';

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
