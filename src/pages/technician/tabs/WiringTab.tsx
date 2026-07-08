import WiringWorkstation from '../../../components/technician/wiring/WiringWorkstation';

interface WiringTabProps {
  panel: any;
  onPanelUpdate: () => void;
  onExit?: () => void;
}

/** Technician wiring — embedded execution workspace inside the dashboard shell. */
export default function WiringTab({ panel, onPanelUpdate, onExit }: WiringTabProps) {
  if (!panel) {
    return (
      <div className="empty-state">
        <p className="text-base font-semibold text-slate-700">No panel selected</p>
        <p className="empty-text">Select a panel from the list to begin wiring.</p>
      </div>
    );
  }

  return (
    <WiringWorkstation
      panel={panel}
      onPanelUpdate={onPanelUpdate}
      onExit={onExit}
    />
  );
}
