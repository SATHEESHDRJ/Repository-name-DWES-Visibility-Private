import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X } from './ui/icons';

interface ModalProps {
  title: string;
  /** Optional muted context line under the title. */
  subtitle?: string;
  /** Optional leading icon shown in a tinted chip beside the title. */
  icon?: ReactNode;
  /** Semantic colour of the title-icon chip. Defaults to primary (blue). */
  iconTone?: 'primary' | 'danger' | 'warning' | 'success';
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
  /** Keeps the established User Management presentation isolated from shared dialog polish. */
  typography?: 'standard' | 'user-management';
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

const FOCUSABLE_SELECTOR = [
  'button:not([disabled])',
  '[href]',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(', ');

export default function Modal({
  title,
  subtitle,
  icon,
  iconTone = 'primary',
  onClose,
  children,
  footer,
  size = 'default',
  bodyClassName,
  closeOnBackdrop = true,
  closeOnEscape = true,
  headerAction,
  typography = 'standard',
}: ModalProps) {
  const openedAt = useRef(Date.now());
  const onCloseRef = useRef(onClose);
  const closeOnBackdropRef = useRef(closeOnBackdrop);
  const closeOnEscapeRef = useRef(closeOnEscape);
  const boxRef = useRef<HTMLDivElement | null>(null);
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
    const previouslyFocused = document.activeElement as HTMLElement | null;

    const focusables = () => {
      const el = boxRef.current;
      if (!el) return [] as HTMLElement[];
      return Array.from(el.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR))
        .filter(node => !node.hasAttribute('disabled') && node.getClientRects().length > 0);
    };

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && closeOnEscapeRef.current) {
        onCloseRef.current();
        return;
      }
      if (e.key !== 'Tab') return;
      const nodes = focusables();
      if (nodes.length === 0) return;
      const first = nodes[0];
      const last = nodes[nodes.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    window.addEventListener('keydown', onKey);

    const focusTimer = window.setTimeout(() => {
      const nodes = focusables();
      const preferred = nodes.find(n =>
        n.classList.contains('btn-primary')
        || n.classList.contains('btn-danger')
        || n.classList.contains('btn-warning')
        || n.hasAttribute('autofocus'),
      ) || nodes.find(n => n.tagName === 'INPUT' || n.tagName === 'TEXTAREA' || n.tagName === 'SELECT')
        || nodes[0];
      preferred?.focus();
    }, 0);

    return () => {
      window.clearTimeout(focusTimer);
      window.removeEventListener('keydown', onKey);
      modalStackDepth = Math.max(0, modalStackDepth - 1);
      if (modalStackDepth === 0) {
        document.body.style.overflow = prevOverflow;
      }
      previouslyFocused?.focus?.();
      void level;
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
      <div
        ref={boxRef}
        className={`${boxClass} glass-modal-shell modal-typography${typography === 'user-management' ? ' modal-typography--user-management' : ''}`}
        onClick={e => e.stopPropagation()}
      >
        <div className="modal-header">
          <div className="modal-header-lead">
            {icon ? (
              <span className={`modal-title-icon modal-title-icon--${iconTone}`} aria-hidden="true">
                {icon}
              </span>
            ) : null}
            <div className="modal-header-text">
              <h2 id="modal-title" className="modal-title" title={title}>{title}</h2>
              {subtitle ? <p className="modal-subtitle" title={subtitle}>{subtitle}</p> : null}
            </div>
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
