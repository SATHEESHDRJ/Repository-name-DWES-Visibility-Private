import { useState, useEffect, useCallback } from 'react';
import { qaqcApi } from '../../../services/api';
import ProjectInfoCard from '../../../components/ui/ProjectInfoCard';

interface PanelsTabProps {
  onSelectPanel: (panel: any) => void;
}

export default function PanelsTab({ onSelectPanel }: PanelsTabProps) {
  const [panels, setPanels] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'ready' | 'all'>('ready');

  const load = useCallback(() => {
    setLoading(true);
    const request = filter === 'ready' ? qaqcApi.readyPanels() : qaqcApi.allCompleted();
    request.then(data => {
      setPanels(data);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [filter]);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) return <div className="dwes-empty-state"><div className="dwes-empty-copy">Loading panels...</div></div>;

  return (
    <div>
      <div className="table-toolbar">
        <div className="touch-action-row">
          {(['ready', 'all'] as const).map(mode => (
            <button
              key={mode}
              className={`button-compact ${filter === mode ? 'is-active' : ''}`}
              onClick={() => setFilter(mode)}
              type="button"
            >
              {mode === 'ready' ? 'Ready for QC' : 'All Completed'}
            </button>
          ))}
        </div>
        <button className="dwes-button dwes-button-neutral" onClick={load} type="button">Refresh</button>
      </div>

      {panels.length === 0 && (
        <div className="dwes-empty-state">
          <div className="dwes-empty-title">No panels available</div>
          <div className="dwes-empty-copy">
            {filter === 'ready' ? 'Panels appear here when ready for quality inspection.' : 'No completed panels found yet.'}
          </div>
        </div>
      )}

      <div className="stack-grid">
        {panels.map(panel => (
          <ProjectInfoCard
            key={panel.id}
            title={panel.panel_display_name || panel.panel_name}
            subtitle={`${panel.project_code} · Technician: ${panel.technician_name || '--'}`}
            statusLabel={panel.already_inspected ? (panel.inspection_result || 'inspected') : 'pending'}
            actions={(
              <button className="dwes-button dwes-button-primary" onClick={() => onSelectPanel(panel)} type="button">
                {panel.already_inspected ? 'Re-inspect' : 'Inspect'}
              </button>
            )}
            fields={[
              { label: 'Client', value: panel.client || '--' },
              { label: 'Voltage Level', value: panel.voltage_level || '--' },
              { label: 'Panel Name', value: panel.panel_display_name || panel.panel_name },
              { label: 'Progress', value: `${panel.kpi ?? 0}%` },
              { label: 'Assigned Technician', value: panel.technician_name || '--' },
              { label: 'Due Date', value: panel.due_date ? new Date(panel.due_date).toLocaleDateString() : '--' },
              { label: 'Last Updated', value: panel.updated_at ? new Date(panel.updated_at).toLocaleString() : '--' },
              { label: 'Cables', value: panel.cables_total ?? 0 },
            ]}
          />
        ))}
      </div>
    </div>
  );
}


