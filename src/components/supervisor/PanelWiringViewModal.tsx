import Modal from '../Modal';
import DigitalWiringMonitor from './digital-wiring-monitor/DigitalWiringMonitor';

interface Props {
  projectCode: string;
  frameId: string;
  panelLabel: string;
  onClose: () => void;
}

/**
 * Fullscreen Digital Wiring View for Production Supervisors — read-only
 * wiring schedule grid, cable inspector, and execution summary dashboard.
 */
export default function PanelWiringViewModal({
  projectCode,
  frameId,
  panelLabel,
  onClose,
}: Props) {
  return (
    <Modal
      title="Digital Wiring View"
      subtitle={`${panelLabel} · Read-only supervisor view`}
      onClose={onClose}
      size="fullscreen"
      bodyClassName="modal-body-flush"
      footer={(
        <button type="button" className="btn-primary" onClick={onClose}>Close</button>
      )}
    >
      <DigitalWiringMonitor
        projectCode={projectCode}
        frameId={frameId}
        panelLabel={panelLabel}
      />
    </Modal>
  );
}
