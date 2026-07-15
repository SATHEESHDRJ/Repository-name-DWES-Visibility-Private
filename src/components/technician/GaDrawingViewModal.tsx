import Modal from '../Modal';
import { PenTool } from '../ui/icons';

interface Props {
  panelName: string;
  projectLabel: string;
  onClose: () => void;
}

/** Stub GA 3D/2D drawing viewer — detailed layout in a later prompt. */
export default function GaDrawingViewModal({ panelName, projectLabel, onClose }: Props) {
  return (
    <Modal title="GA 3D/2D Drawing View" icon={<PenTool />} onClose={onClose} size="lg">
      <div className="flex flex-col items-center justify-center gap-3 py-10 px-4 text-center">
        <p className="text-sm text-slate-600">
          <span className="font-semibold text-slate-800">{panelName}</span>
          {' · '}
          {projectLabel}
        </p>
        <p className="text-[15px] font-medium text-slate-700">
          GA 3D/2D drawing viewer — layout to be defined
        </p>
      </div>
    </Modal>
  );
}
