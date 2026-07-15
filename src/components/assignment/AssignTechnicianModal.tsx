import { useEffect, useState } from 'react';
import Modal from '../Modal';
import { projectsApi, supervisorApi, usersApi } from '../../services/api';
import type { Project } from '../../types';
import ProjectPanelSelect, { type FramePanel } from './ProjectPanelSelect';
import { ArrowRight, CheckCircle, TriangleAlert, UserPlus, User, Check } from '../ui/icons';
import { emitWorkflowChanged } from '../../utils/dwesRefreshEvents';

export interface AssignTechnicianModalProps {
  onClose: () => void;
  onAssigned: () => void;
  initialProjectCode?: string;
  initialPanelId?: string;
  lockSelection?: boolean;
  projects?: Project[];
  panelsRefreshKey?: number;
}

function panelReady(panel: FramePanel | undefined): boolean {
  return Boolean(panel && (panel.cable_count ?? 0) > 0);
}

export default function AssignTechnicianModal({
  onClose,
  onAssigned,
  initialProjectCode = '',
  initialPanelId = '',
  lockSelection = false,
  projects: projectsProp,
  panelsRefreshKey = 0,
}: AssignTechnicianModalProps) {
  const [projects, setProjects] = useState<Project[]>(projectsProp ?? []);
  const [projectCode, setProjectCode] = useState(initialProjectCode);
  const [panelId, setPanelId] = useState(initialPanelId);
  const [panels, setPanels] = useState<FramePanel[]>([]);
  const [techs, setTechs] = useState<any[]>([]);
  const [selTech, setSelTech] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<any>(null);

  useEffect(() => {
    if (projectsProp) {
      setProjects(projectsProp);
      return;
    }
    projectsApi.list().then(setProjects).catch(() => {});
  }, [projectsProp]);

  useEffect(() => {
    setProjectCode(initialProjectCode);
    setPanelId(initialPanelId);
  }, [initialProjectCode, initialPanelId]);

  useEffect(() => {
    usersApi.technicians().then(setTechs).catch(() => {});
  }, []);

  useEffect(() => {
    if (!lockSelection || !initialProjectCode || !initialPanelId) return;
    projectsApi.frames(initialProjectCode)
      .then(data => setPanels(data as FramePanel[]))
      .catch(() => {});
  }, [lockSelection, initialProjectCode, initialPanelId, panelsRefreshKey]);

  const selectedPanel = panels.find(f => f.id === panelId);
  const scheduleReady = panelReady(selectedPanel);
  const canAssign = Boolean(projectCode && panelId && scheduleReady && selTech);

  const handleAssign = async () => {
    if (!projectCode || !panelId) {
      setError('Select a project and panel first');
      return;
    }
    if (!scheduleReady) {
      setError('Upload a wiring schedule for this panel first');
      return;
    }
    if (!selTech) {
      setError('Select a technician');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const r = await supervisorApi.assignFrame({
        project_code: projectCode,
        frame_id: panelId,
        technician_id: parseInt(selTech, 10),
      });
      setResult(r);
      emitWorkflowChanged({ scope: 'assignment', projectCode, frameId: panelId });
      onAssigned();
    } catch (e: any) {
      setError(e?.response?.data?.message || 'Assignment failed');
    } finally {
      setSaving(false);
    }
  };

  const lockedPanelName = lockSelection
    ? selectedPanel?.panel_name ?? initialPanelId
    : null;

  return (
    <Modal
      title="Assign Technician to Panel"
      icon={<UserPlus />}
      onClose={onClose}
      footer={!result ? (
        <>
          <button onClick={onClose} className="btn-secondary" type="button">Cancel</button>
          <button
            onClick={handleAssign}
            disabled={saving || !canAssign}
            className="btn-primary disabled:opacity-40 disabled:cursor-not-allowed"
            type="button"
          >
            <UserPlus size={16} />
            {saving ? 'Assigning…' : 'Assign'}
          </button>
        </>
      ) : (
        <button onClick={onClose} className="btn-primary" type="button">
          <Check size={16} />
          Done
        </button>
      )}
    >
      {!result ? (
        <>
          {lockSelection ? (
            <div className="mb-4 p-3 bg-emerald-50 border border-emerald-200 rounded-[10px]">
              <div className="text-[11px] font-bold uppercase tracking-wide text-emerald-600 mb-1">Panel</div>
              <div className="text-[13px] font-semibold text-emerald-800 break-words" title={lockedPanelName ?? undefined}>
                {lockedPanelName}
              </div>
              <div className="text-[11px] text-emerald-600 mt-0.5">Project: {projectCode}</div>
            </div>
          ) : (
            <>
              {panels.length === 0 && projectCode && (
                <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 flex items-start gap-2">
                  <TriangleAlert size={16} className="text-amber-600 mt-0.5 shrink-0" />
                  <div className="text-[13px] text-amber-800">
                    No panels uploaded for this project. Upload a wiring schedule first.
                  </div>
                </div>
              )}

              <ProjectPanelSelect
                projects={projects}
                selectedProjectCode={projectCode}
                selectedPanelId={panelId}
                onProjectChange={setProjectCode}
                onPanelChange={id => { setPanelId(id); setError(''); setSelTech(''); }}
                layout="stack"
                className="mb-4"
                onPanelsLoaded={setPanels}
                refreshKey={panelsRefreshKey}
              />

              {selectedPanel && !scheduleReady && (
                <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 flex items-start gap-2">
                  <TriangleAlert size={16} className="text-amber-600 mt-0.5 shrink-0" />
                  <p className="text-[13px] text-amber-800">
                    This panel has no imported cables yet — complete Excel Wiring Upload first.
                  </p>
                </div>
              )}
            </>
          )}

          <div className={`mb-4 transition-opacity duration-200 ${scheduleReady && panelId ? 'opacity-100' : 'opacity-50 pointer-events-none'}`}>
            <label className="form-label mb-1">Technician</label>
            <div className="field-with-icon">
              <span className="field-lead-icon"><User size={18} /></span>
              <select
                value={selTech}
                onChange={e => { setSelTech(e.target.value); setError(''); }}
                disabled={!scheduleReady || !panelId}
                className="form-select disabled:cursor-not-allowed"
                aria-label="Select technician"
              >
                <option value="">Select technician…</option>
                {techs.map(t => (
                  <option key={t.id} value={t.id}>
                    {t.full_name} · @{t.username}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {error && <div className="form-error">{error}</div>}
        </>
      ) : (
        <div className="flex flex-col items-center gap-3 py-4 text-center">
          <CheckCircle size={40} className="text-green-500" />
          <p className="text-[15px] font-semibold text-slate-800">Technician assigned</p>
          <p className="text-[13px] text-slate-600 break-words">
            {result?.technician?.full_name} can start wiring on {lockedPanelName || selectedPanel?.panel_name}.
          </p>
          <ArrowRight size={16} className="text-slate-500" aria-hidden="true" />
        </div>
      )}
    </Modal>
  );
}
