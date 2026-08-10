import Modal from '../../Modal';
import { InternalLoop } from '../../ui/icons';

/** Reserved field groups for a future Supervisor-configured looping phase (empty until approved). */
const RESERVED_SECTIONS = [
  { id: 'source', label: 'Source Device / Terminal' },
  { id: 'destination', label: 'Destination Device / Terminal' },
  { id: 'loop', label: 'Loop Number' },
  { id: 'colour', label: 'Wire Colour' },
  { id: 'size', label: 'Wire Size' },
  { id: 'remarks', label: 'Remarks' },
  { id: 'approval', label: 'Supervisor Approval' },
] as const;

interface Props {
  open: boolean;
  onClose: () => void;
}

/**
 * Read-only placeholder for Internal Device Looping.
 * No sample terminals, wiring records, or supervisor data in this phase.
 */
export default function InternalDeviceLoopingModal({ open, onClose }: Props) {
  if (!open) return null;

  return (
    <Modal
      title="Internal Device Looping"
      subtitle="Same-panel terminal-to-terminal looping"
      icon={<InternalLoop size={18} />}
      iconTone="primary"
      size="default"
      onClose={onClose}
      footer={(
        <button type="button" className="btn-primary" onClick={onClose}>
          Close
        </button>
      )}
    >
      <div className="idl-modal" data-testid="internal-device-looping-modal">
        <div className="idl-modal__notice" role="status">
          <p className="idl-modal__notice-text">
            Internal Device Looping data is not linked yet. Looping details will be configured
            later by the Production Supervisor and shown here when available.
          </p>
          <span className="idl-modal__status-badge">NOT CONFIGURED</span>
        </div>

        <div className="idl-modal__sections" aria-label="Reserved looping fields">
          {RESERVED_SECTIONS.map(section => (
            <div key={section.id} className="idl-modal__section">
              <div className="idl-modal__section-label">{section.label}</div>
              <div className="idl-modal__section-empty" aria-hidden>
                —
              </div>
            </div>
          ))}
        </div>
      </div>
    </Modal>
  );
}
