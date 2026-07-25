import Modal from '../Modal';
import { PenTool } from '../ui/icons';

interface Props {
  panelName: string;
  projectLabel: string;
  onClose: () => void;
}

/** Lightweight GA View stub used where the full panel GA modal is not mounted. */
export default function GaDrawingViewModal({ panelName, projectLabel, onClose }: Props) {
  return (
    <Modal title="GA View" icon={<PenTool />} onClose={onClose} size="lg">
      <div className="flex flex-col items-center justify-center gap-3 py-10 px-4 text-center">
        <p className="text-sm text-slate-600">
          <span className="font-semibold text-slate-800">{panelName}</span>
          {' · '}
          {projectLabel}
        </p>
        <p className="text-[15px] font-medium text-slate-700">
          No GA drawing is available for this panel
        </p>
      </div>
    </Modal>
  );
}
