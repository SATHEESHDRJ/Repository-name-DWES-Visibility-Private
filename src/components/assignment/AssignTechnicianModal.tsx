import { useEffect, useState } from 'react';
import Modal from '../Modal';
import { projectsApi, supervisorApi, usersApi } from '../../services/api';
import type { Project } from '../../types';
import ProjectPanelSelect, { type FramePanel } from './ProjectPanelSelect';
import { isVerifiedFrame } from './frameUtils';
import { ArrowRight, CheckCircle, Info, TriangleAlert } from '../ui/icons';

export interface AssignTechnicianModalProps {
  onClose: () => void;
  onAssigned: () => void;
  /** Pre-selected project (e.g. from parent toolbar or frame row) */
  initialProjectCode?: string;
  /** Pre-selected panel / frame id */
  initialPanelId?: string;
  /** When set, project & panel dropdowns are read-only summaries */
  lockSelection?: boolean;
  projects?: Project[];
  /** Open verification flow (Operations toolbar / shared VerificationModal) */
  onOpenVerify?: () => void;
  /** Increment after verify so panel status reloads */
  panelsRefreshKey?: number;
}

export default function AssignTechnicianModal({
  onClose,
  onAssigned,
  initialProjectCode = '',
  initialPanelId = '',
  lockSelection = false,
  projects: projectsProp,
  onOpenVerify,
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
  }, [lockSelection, initialProjectCode, initialPanelId]);

  const selectedPanel = panels.find(f => f.id === panelId);
  const selectedVerified = isVerifiedFrame(selectedPanel);

  const canSelectTech = lockSelection
    ? Boolean(projectCode && panelId)
    : Boolean(projectCode && panelId && selectedVerified);
  const canAssign = canSelectTech && Boolean(selTech);

  const handleAssign = async () => {
    if (!projectCode || !panelId) {
      setError('Select a project and panel first');
      return;
    }
    if (!selTech) {
      setError('Select a technician');
      return;
    }
    if (!lockSelection && !selectedVerified) {
      setError('Verify this frame first before assigning');
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
      onClose={onClose}
      footer={!result ? (
        <>
          <button onClick={onClose} className="btn-secondary" type="button">Cancel</button>
          <button
            onClick={handleAssign}
            disabled={saving || !canAssign}
            title={!selectedVerified && panelId ? 'Verify this frame first' : undefined}
            className="btn-primary disabled:opacity-40 disabled:cursor-not-allowed"
            type="button"
          >
            {saving ? 'Assigning…' : 'Assign'}
          </button>
        </>
      ) : (
        <button onClick={onClose} className="btn-primary" type="button">Done</button>
      )}
    >
      {!result ? (
        <>
          {lockSelection ? (
            <div className="mb-4 p-3 bg-emerald-50 border border-emerald-200 rounded-[10px]">
              <div className="text-[11px] font-bold uppercase tracking-wide text-emerald-600 mb-1">Panel</div>
              <div className="text-[13px] font-semibold text-emerald-800">{lockedPanelName}</div>
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
                groupByVerification
                layout="stack"
                className="mb-4"
                onPanelsLoaded={setPanels}
                refreshKey={panelsRefreshKey}
              />

              {selectedPanel && !selectedVerified && (
                <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 flex items-start gap-3">
                  <TriangleAlert size={16} className="text-red-600 mt-0.5 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="text-[13px] leading-snug text-red-800">
                      This panel is still in Draft. Use <strong>Verify</strong> in the Operations toolbar
                      {onOpenVerify ? ' or the button below' : ''}, then click{' '}
                      <strong>Confirm &amp; Verify</strong> before assigning.
                    </p>
                    {onOpenVerify && (
                      <button
                        type="button"
                        onClick={onOpenVerify}
                        className="mt-2 inline-flex items-center gap-1.5 h-9 px-3 rounded-lg bg-red-600 text-white text-[12px] font-semibold hover:bg-red-700 transition-colors"
                      >
                        Verify panel
                      </button>
                    )}
                  </div>
                </div>
              )}
            </>
          )}

          <div
            className={`mb-4 transition-opacity duration-200 ${canSelectTech ? 'opacity-100' : 'opacity-50 pointer-events-none'}`}
          >
            <label className="form-label mb-1">Technician</label>
            <select
              value={selTech}
              onChange={e => { setSelTech(e.target.value); setError(''); }}
              disabled={!canSelectTech}
              className="form-select disabled:cursor-not-allowed"
              aria-label="Select technician"
            >
              <option value="">Select technician…</option>
              {techs.map(t => (
                <option key={t.id} value={t.id}>
                  {t.full_name} · @{t.username}{t.employee_id ? ` · ${t.employee_id}` : ''}
                </option>
              ))}
            </select>
          </div>

          {canSelectTech && (
            <div className="assignment-info-callout flex items-start gap-1">
              <Info size={16} className="mt-0.5 shrink-0" />
              <span>The technician can start wiring immediately after assignment.</span>
            </div>
          )}

          {error && <div className="form-error mt-2">{error}</div>}
        </>
      ) : (
        <div className="assignment-success-wrap">
          <div className="assignment-success-icon"><CheckCircle size={48} className="text-green-500" /></div>
          <div className="assignment-success-title">Technician assigned successfully!</div>
          <div className="assignment-success-copy mt-3 flex items-center justify-center gap-1">
            {result.technician?.full_name} <ArrowRight size={14} className="text-slate-400" /> {result.frame?.panel_name}
          </div>
          <div className="assignment-success-note mt-3">The technician can now start wiring immediately.</div>
        </div>
      )}
    </Modal>
  );
}
