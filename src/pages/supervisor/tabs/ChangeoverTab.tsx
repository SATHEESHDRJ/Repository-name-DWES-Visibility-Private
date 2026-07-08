import { useEffect, useState } from 'react';
import { supervisorApi } from '../../../services/api';
import type { Project } from '../../../types';
import Badge from '../../../components/Badge';
import MidChangeoverModal, { type ChangeoverAssignment } from '../../../components/assignment/MidChangeoverModal';
import Toast from '../../../components/ui/Toast';
import { ArrowLeftRight, ArrowRight, Plus } from '../../../components/ui/icons';

interface ChangeoverTabProps {
  projects: Project[];
  projectCode: string;
  panelId: string;
}

export default function ChangeoverTab({ projects, projectCode, panelId }: ChangeoverTabProps) {
  const [eligible, setEligible] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [selectedPanel, setSelectedPanel] = useState<ChangeoverAssignment | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const load = () => {
    setLoading(true);
    supervisorApi.pendingChangeovers()
      .then(setEligible)
      .catch(() => setEligible([]))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const filtered = eligible.filter(panel => {
    if (projectCode && panel.project_code !== projectCode) return false;
    if (panelId && panel.frame_id !== panelId) return false;
    return true;
  });

  const openFromCard = (panel: any) => {
    setSelectedPanel({
      id: panel.id,
      project_code: panel.project_code,
      frame_id: panel.frame_id,
      panel_name: panel.panel_name,
      status: panel.status,
      technician_id: panel.technician_id,
      technician_name: panel.technician_name,
      completed_cables: panel.completed_cables,
      remaining_cables: panel.remaining_cables,
      cables_total: panel.total_cables ?? panel.cables_total,
      pause_reason: panel.pause_reason,
    });
    setShowModal(true);
  };

  const openInitiate = () => {
    setSelectedPanel(null);
    setShowModal(true);
  };

  if (loading) {
    return <div className="empty-state"><p className="empty-text">Loading changeover data…</p></div>;
  }

  return (
    <div>
      <div className="toolbar">
        <div className="form-label">
          {filtered.length} eligible panel{filtered.length !== 1 ? 's' : ''} (in progress or paused)
        </div>
        <div className="flex items-center gap-2">
          <button onClick={load} className="btn-sm" type="button">Refresh</button>
          <button onClick={openInitiate} className="btn-primary" type="button">
            <Plus size={16} />
            <span>Initiate Mid-Changeover</span>
          </button>
        </div>
      </div>

      {!projectCode && (
        <div className="assignment-info-callout mb-4 flex items-start gap-1">
          <ArrowLeftRight size={16} className="mt-0.5 shrink-0" />
          <span>Select a project above to filter eligible panels, or use Initiate Mid-Changeover to pick project and panel.</span>
        </div>
      )}

      {projectCode && filtered.length === 0 && (
        <div className="empty-state">
          <p className="empty-text">
            {panelId
              ? 'No in-progress or paused panels for the selected panel.'
              : 'No eligible panels for this project. Use Initiate Mid-Changeover to select another panel.'}
          </p>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 mt-4">
        {filtered.map(panel => (
          <div key={panel.id} className="h-[120px] bg-white border border-[#E2E8F0] rounded-[12px] p-4 flex flex-col justify-between shadow-sm hover:bg-blue-50 hover:border-blue-200 transition-colors">
            <div className="flex items-start justify-between">
              <div className="flex flex-col min-w-0 pr-2">
                <span className="text-[14px] font-bold text-slate-900 truncate" title={panel.panel_name}>{panel.panel_name}</span>
                <span className="text-[12px] font-medium text-slate-500 truncate mt-0.5">
                  {panel.technician_name} · {panel.project_code}
                </span>
                {panel.pause_reason && (
                  <span className="text-[11px] font-medium text-red-600 truncate mt-1 bg-red-50 px-1.5 py-0.5 rounded w-fit">&quot;{panel.pause_reason}&quot;</span>
                )}
              </div>
              <div className="flex flex-col items-end flex-shrink-0">
                <span className="text-[18px] font-bold text-slate-800 leading-none">{panel.completed_cables ?? 0}/{panel.total_cables ?? panel.cables_total ?? 0}</span>
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Done</span>
              </div>
            </div>

            <div className="flex items-center justify-between">
              <Badge label={panel.status} />
              <button
                onClick={() => openFromCard(panel)}
                className="flex items-center justify-center h-[36px] px-3 bg-blue-600 text-white rounded-[8px] hover:bg-blue-700 transition-colors text-[13px] font-bold"
                type="button"
              >
                <span>Mid-Changeover</span>
                <ArrowRight size={16} strokeWidth={2} className="ml-1" />
              </button>
            </div>
          </div>
        ))}
      </div>

      {showModal && (
        <MidChangeoverModal
          projects={projects}
          initialProjectCode={selectedPanel?.project_code ?? projectCode}
          initialPanelId={selectedPanel?.frame_id ?? panelId}
          initialAssignment={selectedPanel}
          lockSelection={Boolean(selectedPanel)}
          onClose={() => { setShowModal(false); setSelectedPanel(null); }}
          onComplete={load}
          onSuccess={msg => setToast(msg)}
        />
      )}

      {toast && (
        <Toast message={toast} tone="success" onDismiss={() => setToast(null)} />
      )}
    </div>
  );
}
