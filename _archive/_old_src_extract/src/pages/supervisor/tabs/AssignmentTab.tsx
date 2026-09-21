import { useState, useEffect, useCallback } from 'react';
import { projectsApi, supervisorApi, usersApi, techApi } from '../../../services/api';
import type { Project } from '../../../types';
import Badge from '../../../components/Badge';
import Modal from '../../../components/Modal';
import { useAppDialog } from '../../../components/AppDialogProvider';

export default function AssignmentTab() {
  const dialog = useAppDialog();
  const [projects, setProjects] = useState<Project[]>([]);
  const [selProject, setSelProject] = useState('');
  const [frames, setFrames] = useState<any[]>([]);
  const [assignments, setAssignments] = useState<any[]>([]);
  const [showAssign, setShowAssign] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    projectsApi.list().then(d => { setProjects(d); if (d.length) setSelProject(d[0].code); });
  }, []);

  const loadData = useCallback(() => {
    if (!selProject) return;
    setLoading(true);
    Promise.all([
      projectsApi.frames(selProject),
      supervisorApi.allPanels(),
    ]).then(([fr, all]) => {
      setFrames(fr.filter((f: any) => f.compare_status === 'validated'));
      setAssignments(all.filter((a: any) => a.project_code === selProject));
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [selProject]);

  useEffect(() => { loadData(); }, [loadData]);

  const handleDeassign = async (id: number) => {
    const ok = await dialog.confirm({
      title: 'Remove Assignment',
      message: 'Remove this assignment from the technician?',
      tone: 'delete',
      confirmText: 'Remove',
    });
    if (!ok) return;
    await techApi.delete(id).catch(() => {});
    loadData();
  };

  return (
    <div>
      <div className="table-toolbar">
        <select value={selProject} onChange={e => setSelProject(e.target.value)} className="dwes-select" data-layout="grow">
          {projects.map(p => <option key={p.code} value={p.code}>{p.name}</option>)}
        </select>
        <button onClick={() => setShowAssign(true)} disabled={frames.length === 0}
          className="dwes-button dwes-button-primary" type="button">
          + Assign Technician
        </button>
      </div>

      {frames.length === 0 && !loading && (
        <div className="assignment-warning mb-md">
          ⚠ No validated frames for this project. Upload and validate a wiring schedule first.
        </div>
      )}

      {loading && <div className="dwes-empty-state"><div className="dwes-empty-copy">Loading...</div></div>}

      {assignments.length === 0 && !loading && (
        <div className="dwes-empty-state">
          No assignments yet for this project.
        </div>
      )}

      <div className="stack-grid-sm">
        {assignments.map(a => (
          <div key={a.id} className="assignment-card">
            <div className="assignment-main">
              <div className="assignment-title">{a.panel_display_name || a.panel_name}</div>
              <div className="assignment-sub mt-xxs">
                {a.technician_name} · Assigned {new Date(a.assigned_at).toLocaleDateString()}
              </div>
            </div>
            <div className="assignment-kpi">
              <div className="assignment-kpi-value">{a.kpi ?? 0}%</div>
              <div className="assignment-kpi-label">KPI</div>
            </div>
            <div className="touch-action-row">
              <Badge label={a.status} />
              {!a.supervisor_approved && a.status === 'assigned' && <Badge label="Pending Approval" />}
            </div>
            {a.status === 'assigned' && (
              <button onClick={() => handleDeassign(a.id)} className="button-compact" type="button">
                Remove
              </button>
            )}
          </div>
        ))}
      </div>

      {showAssign && (
        <AssignModal projectCode={selProject} frames={frames} onClose={() => setShowAssign(false)} onAssigned={loadData} />
      )}
    </div>
  );
}

function AssignModal({ projectCode, frames, onClose, onAssigned }: { projectCode: string; frames: any[]; onClose: () => void; onAssigned: () => void }) {
  const [techs, setTechs] = useState<any[]>([]);
  const [selFrame, setSelFrame] = useState(frames[0]?.id || '');
  const [selTech, setSelTech] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<any>(null);

  useEffect(() => { usersApi.technicians().then(setTechs); }, []);

  const handleAssign = async () => {
    if (!selFrame || !selTech) { setError('Select a frame and technician'); return; }
    setSaving(true); setError('');
    try {
      const r = await supervisorApi.assignFrame({ project_code: projectCode, frame_id: selFrame, technician_id: parseInt(selTech) });
      setResult(r);
      onAssigned();
    } catch (e: any) { setError(e?.response?.data?.message || 'Assignment failed'); }
    finally { setSaving(false); }
  };

  return (
    <Modal title="Assign Technician" onClose={onClose}
      footer={!result ? (
        <>
          <button onClick={onClose} className="dwes-button dwes-button-neutral" type="button">Cancel</button>
          <button onClick={handleAssign} disabled={saving} className="dwes-button dwes-button-primary" type="button">{saving ? 'Assigning…' : 'Assign'}</button>
        </>
      ) : (
        <button onClick={onClose} className="dwes-button dwes-button-primary" type="button">Done</button>
      )}>
      {!result ? (
        <>
          <div className="mb-md">
            <label className="dwes-label mb-xxs">Frame / Panel</label>
            <select value={selFrame} onChange={e => setSelFrame(e.target.value)} className="dwes-select">
              {frames.map(f => <option key={f.id} value={f.id}>{f.panel_name} ({f.cable_count} cables)</option>)}
            </select>
          </div>
          <div className="mb-md">
            <label className="dwes-label mb-xxs">Technician</label>
            <select value={selTech} onChange={e => setSelTech(e.target.value)} className="dwes-select">
              <option value="">-- select technician --</option>
              {techs.map(t => <option key={t.id} value={t.id}>{t.full_name} ({t.employee_id})</option>)}
            </select>
          </div>
          <div className="assignment-info-callout">
            ℹ The technician must be approved by a Production Supervisor before they can start wiring.
          </div>
          {error && <div className="dwes-error mt-sm">{error}</div>}
        </>
      ) : (
        <div className="assignment-success-wrap">
          <div className="assignment-success-icon">✅</div>
          <div className="assignment-success-title">Technician assigned successfully!</div>
          <div className="assignment-success-copy mt-sm">
            {result.technician?.full_name} → {result.frame?.panel_name}
          </div>
          <div className="assignment-success-note mt-sm">Pending supervisor approval before technician can start.</div>
        </div>
      )}
    </Modal>
  );
}


