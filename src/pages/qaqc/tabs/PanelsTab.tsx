import { useState, useEffect, useCallback } from 'react';
import { qaqcApi } from '../../../services/api';
import { useDwesRefresh } from '../../../hooks/useDwesRefresh';
import ProjectInfoCard from '../../../components/ui/ProjectInfoCard';
import { RefreshCw, ClipboardCheck } from '../../../components/ui/icons';

interface PanelsTabProps {
  onSelectPanel: (panel: any) => void;
}

export default function PanelsTab({ onSelectPanel }: PanelsTabProps) {
  const [panels, setPanels] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'ready' | 'all'>('ready');

  const load = useCallback((options?: { silent?: boolean }) => {
    if (!options?.silent) setLoading(true);
    const request = filter === 'ready' ? qaqcApi.readyPanels() : qaqcApi.allCompleted();
    request.then(data => {
      setPanels(data);
      if (!options?.silent) setLoading(false);
    }).catch(() => {
      if (!options?.silent) setLoading(false);
    });
  }, [filter]);

  useEffect(() => {
    load();
  }, [load]);

  useDwesRefresh(() => load({ silent: true }), { listenFrames: false });

  if (loading) return <div className="empty-state"><p className="empty-text">Loading panels...</p></div>;

  return (
    <div>
      <div className="toolbar">
        <div className="table-actions">
          {(['ready', 'all'] as const).map(mode => (
            <button
              key={mode}
              className={`tab-btn ${filter === mode ? 'active' : ''}`}
              onClick={() => setFilter(mode)}
              type="button"
            >
              {mode === 'ready' ? 'Ready for QC' : 'All Completed'}
            </button>
          ))}
        </div>
        <button className="btn-secondary" onClick={() => load()} type="button">
          <RefreshCw size={16} />
          <span>Refresh</span>
        </button>
      </div>

      {panels.length === 0 && (
        <div className="empty-state">
          <p className="text-base font-semibold text-slate-700">No panels available</p>
          <p className="empty-text">
            {filter === 'ready' ? 'Panels appear here when ready for quality inspection.' : 'No completed panels found yet.'}
          </p>
        </div>
      )}

      <div className="proj-mini-grid">
        {panels.map(panel => (
          <ProjectInfoCard
            key={panel.id}
            title={panel.panel_display_name || panel.panel_name}
            subtitle={`${panel.project_code} · Technician: ${panel.technician_name || '--'}`}
            statusLabel={panel.already_inspected ? (panel.inspection_result || 'inspected') : 'pending'}
            actions={(
              <button className="proj-mini-action" onClick={() => onSelectPanel(panel)} type="button">
                <ClipboardCheck size={12} />
                <span>{panel.already_inspected ? 'Re-inspect' : 'Inspect'}</span>
              </button>
            )}
            fields={[
              { label: 'Client', value: panel.client || '--' },
              { label: 'Progress', value: `${panel.kpi ?? 0}%` },
              { label: 'Cables', value: panel.cables_total ?? 0 },
            ]}
          />
        ))}
      </div>
    </div>
  );
}


