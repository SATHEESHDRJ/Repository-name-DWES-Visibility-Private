import { useEffect } from 'react';

interface ModalProps {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  width?: number;
  footer?: React.ReactNode;
}

export default function Modal({ title, onClose, children, width = 560, footer }: ModalProps) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      className="dwes-modal-backdrop"
      onClick={event => { if (event.target === event.currentTarget) onClose(); }}
    >
      <div className={`dwes-modal dwes-modal-width-${width}`}>
        <div className="dwes-modal-header">
          <h2 className="dwes-modal-title">{title}</h2>
          <button className="dwes-modal-close" onClick={onClose} type="button">x</button>
        </div>
        <div className="dwes-modal-body">
          {children}
        </div>
        {footer && (
          <div className="dwes-modal-footer">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
