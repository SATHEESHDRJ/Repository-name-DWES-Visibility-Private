import { useState, useEffect } from 'react';
import { projectsApi } from '../../../services/api';
import type { Project, ProjectState } from '../../../types';
import Modal from '../../../components/Modal';
import ProjectInfoCard from '../../../components/ui/ProjectInfoCard';
import { InputField, SelectField } from '../../../components/ui/TabletFields';
import { useAppDialog } from '../../../components/AppDialogProvider';

const CLIENTS = ['DEWA', 'SEWA', 'ADDC', 'TRANSCO', 'ENOWA', 'HITACHI', 'ABB', 'SIEMENS', 'GE', 'SCHNEIDER', 'ALSTOM'];
const TYPES = ['SAS', 'PCP', 'RELAY', 'SCADA', 'BAY', 'GIS', 'MOBILE_SUBSTATION', 'PROTECTION', 'DISTRIBUTION'];
const VOLTAGES = ['400KV', '220KV', '132KV', '115KV', '69KV', '33KV', '13.8KV', '11KV', '6.6KV'];
const LOCATIONS = ['UAE_DUBAI', 'UAE_ABU_DHABI', 'UAE_SHARJAH', 'KSA_RIYADH', 'KSA_JEDDAH', 'KSA_NEOM', 'QAT_DOHA', 'KWT_KUWAIT', 'UAE_FUJAIRAH'];
const YEARS = ['2024', '2025', '2026', '2027'];
const STATES: ProjectState[] = ['not_started', 'active', 'stopped', 'pending', 'completed', 'in_review', 'submitted_to_director'];

interface CreateForm {
  client: string;
  type: string;
  voltage: string;
  location: string;
  year: string;
  seq: string;
  name: string;
  description: string;
}

export default function ProjectsTab() {
  const dialog = useAppDialog();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [showEdit, setShowEdit] = useState<Project | null>(null);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<CreateForm>({ client: '', type: '', voltage: '', location: '', year: '2026', seq: '001', name: '', description: '' });

  const load = () => {
    setLoading(true);
    projectsApi.list().then(data => {
      setProjects(data);
      setLoading(false);
    }).catch(() => setLoading(false));
  };

  useEffect(load, []);

  const computedCode = [form.client, form.type, form.voltage, form.location, form.year, form.seq].filter(Boolean).join('_');

  const handleCreate = async () => {
    if (!computedCode || !form.name) {
      setError('Fill all code fields and project name.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      await projectsApi.create({ code: computedCode, client: form.client, name: form.name, description: form.description });
      setShowCreate(false);
      setForm({ client: '', type: '', voltage: '', location: '', year: '2026', seq: '001', name: '', description: '' });
      load();
    } catch (apiError: any) {
      setError(apiError?.response?.data?.message || 'Failed to create project');
    } finally {
      setSaving(false);
    }
  };

  const handleStateChange = async (code: string, state: ProjectState) => {
    await projectsApi.setState(code, state).catch(() => {});
    load();
  };

  const handleDelete = async (code: string) => {
    const ok = await dialog.confirm({
      title: 'Delete Project',
      message: `Delete project ${code}? This also deletes all frames and assignments.`,
      tone: 'delete',
      confirmText: 'Delete Project',
    });
    if (!ok) return;
    await projectsApi.remove(code).catch(() => {});
    load();
  };

  if (loading) return <div className="dwes-empty-state"><div className="dwes-empty-copy">Loading projects...</div></div>;

  return (
    <div>
      <div className="table-toolbar">
        <div className="dwes-label">{projects.length} project{projects.length !== 1 ? 's' : ''}</div>
        <button className="dwes-button dwes-button-primary" onClick={() => setShowCreate(true)} type="button">New Project</button>
      </div>

      {projects.length === 0 && (
        <div className="dwes-empty-state">
          <div className="dwes-empty-title">No projects yet</div>
          <div className="dwes-empty-copy">Create your first project to start scheduling frames and assignments.</div>
        </div>
      )}

      <div className="stack-grid">
        {projects.map(project => (
          <ProjectInfoCard
            key={project.code}
            title={project.name}
            subtitle={project.code}
            statusLabel={project.project_state}
            actions={(
              <div className="touch-action-row">
                <button className="button-compact" onClick={() => setShowEdit(project)} type="button">Edit</button>
                <button className="button-compact" onClick={() => handleDelete(project.code)} type="button">Delete</button>
              </div>
            )}
            fields={[
              { label: 'Project Name', value: project.name },
              { label: 'Client', value: project.client },
              { label: 'Voltage Level', value: form.voltage || project.code.split('_')[2] || '--' },
              { label: 'Panel Name', value: '--' },
              { label: 'Status', value: project.project_state.replace(/_/g, ' ') },
              { label: 'Progress', value: '--' },
              { label: 'Assigned Technician', value: project.assigned_technicians || '--' },
              { label: 'Due Date', value: '--' },
              { label: 'Last Updated', value: project.created_at ? new Date(project.created_at).toLocaleString() : '--' },
            ]}
          />
        ))}
      </div>

      {showCreate && (
        <Modal
          title="New Project"
          onClose={() => { setShowCreate(false); setError(''); }}
          width={680}
          footer={(
            <>
              <button className="dwes-button dwes-button-neutral" onClick={() => setShowCreate(false)} type="button">Cancel</button>
              <button className="dwes-button dwes-button-primary" onClick={handleCreate} disabled={saving} type="button">
                {saving ? 'Creating...' : 'Create Project'}
              </button>
            </>
          )}
        >
          <div className="modal-section modal-section-compact">
            <div className="dwes-label">Project Code</div>
            <div className="project-card-title mt-xs">{computedCode || 'CODE_WILL_APPEAR_HERE'}</div>
          </div>

          <div className="form-grid-2 mt-sm">
            <SelectField label="Client" value={form.client} onChange={value => setForm(state => ({ ...state, client: value }))} options={CLIENTS} />
            <SelectField label="Type" value={form.type} onChange={value => setForm(state => ({ ...state, type: value }))} options={TYPES} />
            <SelectField label="Voltage" value={form.voltage} onChange={value => setForm(state => ({ ...state, voltage: value }))} options={VOLTAGES} />
            <SelectField label="Location" value={form.location} onChange={value => setForm(state => ({ ...state, location: value }))} options={LOCATIONS} />
            <SelectField label="Year" value={form.year} onChange={value => setForm(state => ({ ...state, year: value }))} options={YEARS} />
            <InputField label="Sequence" value={form.seq} onChange={value => setForm(state => ({ ...state, seq: value }))} placeholder="001" />
          </div>

          <div className="mt-sm">
            <InputField label="Project Name *" value={form.name} onChange={value => setForm(state => ({ ...state, name: value }))} placeholder="Project title" />
          </div>

          <div className="dwes-input-group mt-sm">
            <label className="dwes-label">Description</label>
            <textarea
              value={form.description}
              onChange={event => setForm(state => ({ ...state, description: event.target.value }))}
              rows={3}
              className="dwes-textarea"
              placeholder="Optional project description"
            />
          </div>

          {error && <div className="dwes-error mt-sm">{error}</div>}
        </Modal>
      )}

      {showEdit && <EditProjectModal project={showEdit} onClose={() => setShowEdit(null)} onSaved={load} onStateChange={handleStateChange} />}
    </div>
  );
}

function EditProjectModal({ project, onClose, onSaved, onStateChange }: { project: Project; onClose: () => void; onSaved: () => void; onStateChange: (code: string, state: ProjectState) => void }) {
  const [name, setName] = useState(project.name);
  const [description, setDescription] = useState(project.description || '');
  const [state, setState] = useState<ProjectState>(project.project_state);
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    await projectsApi.update(project.code, { name, description }).catch(() => {});
    if (state !== project.project_state) {
      await onStateChange(project.code, state);
    }
    setSaving(false);
    onSaved();
    onClose();
  };

  return (
    <Modal
      title="Edit Project"
      onClose={onClose}
      footer={(
        <>
          <button className="dwes-button dwes-button-neutral" onClick={onClose} type="button">Cancel</button>
          <button className="dwes-button dwes-button-primary" onClick={handleSave} disabled={saving} type="button">{saving ? 'Saving...' : 'Save'}</button>
        </>
      )}
    >
      <div className="dwes-input-group">
        <label className="dwes-label">Project Code</label>
        <input value={project.code} className="dwes-input" disabled />
      </div>
      <div className="mt-sm">
        <InputField label="Project Name" value={name} onChange={setName} />
      </div>
      <div className="dwes-input-group mt-sm">
        <label className="dwes-label">State</label>
        <select value={state} onChange={event => setState(event.target.value as ProjectState)} className="dwes-select">
          {STATES.map(item => <option key={item} value={item}>{item.replace(/_/g, ' ')}</option>)}
        </select>
      </div>
      <div className="dwes-input-group mt-sm">
        <label className="dwes-label">Description</label>
        <textarea value={description} onChange={event => setDescription(event.target.value)} rows={3} className="dwes-textarea" />
      </div>
    </Modal>
  );
}
