import Modal from '../Modal';
import DigitalWiringMonitor from './digital-wiring-monitor/DigitalWiringMonitor';

interface Props {
  projectCode: string;
  projectName?: string;
  frameId: string;
  panelLabel: string;
  panelType?: string;
  voltageLevel?: string;
  onClose: () => void;
}

/**
 * Fullscreen Digital Wiring View for Production Supervisors — a strictly read-only
 * view of the complete converted wiring schedule. Review only: no editing, no
 * per-wire drill-down, and a single Close action.
 */
export default function PanelWiringViewModal({
  projectCode,
  projectName,
  frameId,
  panelLabel,
  panelType,
  voltageLevel,
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
        projectName={projectName}
        frameId={frameId}
        panelLabel={panelLabel}
        panelType={panelType}
        voltageLevel={voltageLevel}
      />
    </Modal>
  );
}
