import PanelGaDrawingModal from './PanelGaDrawingModal';

interface CableDigitalTwinModalProps {
  projectCode: string;
  frameId: string;
  panelName: string;
  projectName: string;
  /**
   * The technician's assignment id. When provided, the twin follows the
   * assignment's current (next pending) schedule cable and enables the
   * Report Mapping Issue action. Without it the twin still opens with the
   * panel's route classification, but has no per-cable context.
   */
  assignmentId?: number;
  /** Kept for API compatibility with callers that track the active cable ref. */
  activeCableRef?: string | number;
  onClose: () => void;
}

/**
 * Cable Digital Twin — dedicated entry point for the cable-specific twin viewer.
 *
 * Thin wrapper that delegates to the shared secure drawing/model viewer in twin
 * mode (single implementation, no duplicate asset loading or route logic):
 *  - primary mode for technicians: Operational 2D Twin (+ Revisions);
 *    Approved 2D is supervisor-only via the classic drawing viewer;
 *  - Flat 3D / Engineering 3D surfaces stay behind `VITE_ENABLE_PANEL_3D` and
 *    appear only when the corresponding approved asset actually exists;
 *  - one explicit route classification (Approved Exact Route → Visualization
 *    Unavailable) computed from real assets — calculated or partial data is never
 *    presented as an approved route;
 *  - controlled "Not Yet Configured" fallback with Report Mapping Issue when no
 *    approved drawing or geometry exists;
 *  - all file access goes through the authenticated API client and existing
 *    project/panel authorization — no direct URLs.
 */
export default function CableDigitalTwinModal({
  projectCode,
  frameId,
  panelName,
  projectName,
  assignmentId,
  onClose,
}: CableDigitalTwinModalProps) {
  return (
    <PanelGaDrawingModal
      projectCode={projectCode}
      frameId={frameId}
      panelName={panelName}
      projectName={projectName}
      twinAssignmentId={assignmentId}
      onClose={onClose}
    />
  );
}
