import { CheckCircle2, ClipboardCheck, PlayCircle } from '../ui/icons';
import Modal from '../Modal';

interface Props {
  panel: {
    id: number;
    panel_name: string;
    project_name?: string;
    project_code: string;
    cables_total?: number;
  };
  technicianName: string;
  onClose: () => void;
  onAcknowledge: () => void;
  busy?: boolean;
}

export default function AssignmentAcknowledgmentModal({
  panel,
  technicianName,
  onClose,
  onAcknowledge,
  busy = false,
}: Props) {
  return (
    <Modal
      title="Assignment Acknowledgment"
      subtitle="Please review and acknowledge before starting"
      icon={<ClipboardCheck />}
      onClose={() => !busy && onClose()}
      size="lg"
      footer={(
        <>
          <button type="button" className="btn-secondary" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button type="button" className="btn-primary" onClick={onAcknowledge} disabled={busy}>
            <PlayCircle size={16} />
            {busy ? 'Starting…' : 'Acknowledge & Start'}
          </button>
        </>
      )}
    >
      <div className="flex flex-col items-center text-center gap-2 mb-4">
        <CheckCircle2 size={40} className="text-green-500" aria-hidden="true" />
      </div>

      <div className="grid grid-cols-2 gap-3">
        {[
          { label: 'PANEL', value: panel.panel_name },
          { label: 'PROJECT', value: panel.project_name || panel.project_code },
          { label: 'TOTAL CABLES', value: `${panel.cables_total ?? 0} cables` },
          { label: 'ASSIGNED TO', value: technicianName },
        ].map(tile => (
          <div key={tile.label} className="tc-ack-tile rounded-lg border border-slate-200 bg-slate-50 p-3 text-left">
            <div className="text-[10px] font-bold uppercase tracking-wide text-slate-500 mb-1">{tile.label}</div>
            <div className="text-[14px] font-semibold text-slate-800 break-words">{tile.value}</div>
          </div>
        ))}
      </div>
    </Modal>
  );
}
