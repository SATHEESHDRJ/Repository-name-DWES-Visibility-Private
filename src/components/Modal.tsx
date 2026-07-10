import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X } from './ui/icons';

interface ModalProps {
  title: string;
  /** Optional muted context line under the title. */
  subtitle?: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  size?: 'sm' | 'default' | 'lg' | 'form' | 'wide' | 'xl' | 'team' | 'fullscreen';
  /** Optional extra classes on modal-body (e.g. flush grid layouts). */
  bodyClassName?: string;
  /** When false, backdrop clicks do not call onClose (avoids native select/datalist dismiss). Default true. */
  closeOnBackdrop?: boolean;
  /** When false, Escape does not call onClose. Default true. */
  closeOnEscape?: boolean;
  /** Optional action button in header (e.g., fullscreen toggle) */
  headerAction?: ReactNode;
}

const MODAL_ROOT_ID = 'modal-root';
let modalStackDepth = 0;

function getModalRoot(): HTMLElement | null {
  if (typeof document === 'undefined') return null;
  let root = document.getElementById(MODAL_ROOT_ID);
  if (!root) {
    root = document.createElement('div');
    root.id = MODAL_ROOT_ID;
    document.body.appendChild(root);
  }
  return root;
}

export default function Modal({
  title,
  subtitle,
  onClose,
  children,
  footer,
  size = 'default',
  bodyClassName,
  closeOnBackdrop = true,
  closeOnEscape = true,
  headerAction,
}: ModalProps) {
  const openedAt = useRef(Date.now());
  const onCloseRef = useRef(onClose);
  const closeOnBackdropRef = useRef(closeOnBackdrop);
  const closeOnEscapeRef = useRef(closeOnEscape);
  const [stackLevel, setStackLevel] = useState(0);

  onCloseRef.current = onClose;
  closeOnBackdropRef.current = closeOnBackdrop;
  closeOnEscapeRef.current = closeOnEscape;

  useEffect(() => {
    modalStackDepth += 1;
    const level = modalStackDepth;
    setStackLevel(level);

    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && closeOnEscapeRef.current) onCloseRef.current();
    };
    window.addEventListener('keydown', onKey);

    return () => {
      window.removeEventListener('keydown', onKey);
      modalStackDepth = Math.max(0, modalStackDepth - 1);
      if (modalStackDepth === 0) {
        document.body.style.overflow = prevOverflow;
      }
    };
  }, []);

  const boxClass = size === 'fullscreen' ? 'modal-box-fullscreen'
    : size === 'team' ? 'modal-box-team'
    : size === 'xl' ? 'modal-box-xl'
    : size === 'wide' ? 'modal-box-wide'
    : size === 'form' ? 'modal-box-form'
    : size === 'lg' ? 'modal-box-lg'
    : size === 'sm' ? 'modal-box-sm'
    : 'modal-box';

  const handleOverlayClick = () => {
    if (!closeOnBackdropRef.current) return;
    if (Date.now() - openedAt.current < 350) return;
    onCloseRef.current();
  };

  const overlay = (
    <div
      className="modal-overlay"
      style={{ zIndex: 200 + stackLevel * 10 }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-title"
      onMouseDown={e => {
        if (e.target === e.currentTarget) e.preventDefault();
      }}
      onClick={e => {
        if (e.target === e.currentTarget) handleOverlayClick();
      }}
    >
      <div className={`${boxClass} glass-modal-shell`} onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-header-text">
            <h2 id="modal-title" className="modal-title" title={title}>{title}</h2>
            {subtitle ? <p className="modal-subtitle" title={subtitle}>{subtitle}</p> : null}
          </div>
          <div className="modal-header-actions">
            {headerAction}
            <button
              onClick={() => onCloseRef.current()}
              className="modal-close-btn"
              type="button"
              aria-label="Close"
            >
              <X size={18} strokeWidth={1.75} />
            </button>
          </div>
        </div>
        <div className={bodyClassName ? `modal-body ${bodyClassName}` : 'modal-body'}>
          {children}
        </div>
        {footer && (
          <div className="modal-footer">
            {footer}
          </div>
        )}
      </div>
    </div>
  );

  const root = getModalRoot();
  if (!root) return null;
  return createPortal(overlay, root);
}
