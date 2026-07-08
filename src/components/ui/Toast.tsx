import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { TriangleAlert, CheckCircle } from './icons';

export type ToastTone = 'warn' | 'success';

/**
 * Small auto-dismissing toast (bottom-right). Reuses the wire-toast design
 * system classes. Render conditionally and clear state via onDismiss.
 */
export default function Toast({
  message,
  tone = 'warn',
  duration = 2600,
  onDismiss,
}: {
  message: string;
  tone?: ToastTone;
  duration?: number;
  onDismiss: () => void;
}) {
  useEffect(() => {
    const id = setTimeout(onDismiss, duration);
    return () => clearTimeout(id);
  }, [onDismiss, duration]);

  // Portal to <body> so the fixed-position toast anchors to the viewport, not to a
  // transformed/overflow-clipped ancestor (e.g. the animated .nav-tab-panel).
  const node = (
    <div className="wire-toast-wrap" aria-live="polite">
      <div
        className={`wire-toast ${tone === 'warn' ? 'warn' : ''}`}
        role="status"
      >
        <span className="wire-toast-icon">
          {tone === 'warn'
            ? <TriangleAlert size={14} strokeWidth={2} />
            : <CheckCircle size={14} strokeWidth={2} />}
        </span>
        <div className="wire-toast-title self-center">{message}</div>
      </div>
    </div>
  );

  return typeof document !== 'undefined' ? createPortal(node, document.body) : node;
}
