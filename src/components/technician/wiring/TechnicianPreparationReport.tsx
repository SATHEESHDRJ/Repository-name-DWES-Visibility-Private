/**
 * Back-compat wrapper — status-focused callers can still import this name.
 * Prefer TechnicianCrimpingReport for the complete engineering report.
 */
import TechnicianCrimpingReport from './TechnicianCrimpingReport';
import type { Cable } from '../../../types';
import type { ExtendedCableStatus } from './wiring-utils';

interface Props {
  assignmentId?: number;
  panelName: string;
  projectCode: string;
  technicianName?: string;
  cables: Cable[];
  status: Record<string, ExtendedCableStatus>;
  activeIndex: number;
  onSelectWire?: (index: number) => void;
}

export default function TechnicianPreparationReport({
  assignmentId = 0,
  panelName,
  projectCode,
  technicianName,
  cables,
  status,
  activeIndex,
  onSelectWire,
}: Props) {
  return (
    <TechnicianCrimpingReport
      assignmentId={assignmentId}
      panelName={panelName}
      projectCode={projectCode}
      technicianName={technicianName}
      cables={cables}
      status={status}
      activeIndex={activeIndex}
      onSelectWire={onSelectWire}
    />
  );
}
