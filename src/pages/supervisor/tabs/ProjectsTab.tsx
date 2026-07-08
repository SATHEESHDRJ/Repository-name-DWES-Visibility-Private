import { useState, useEffect, useCallback, useRef } from 'react';
import { projectsApi } from '../../../services/api';
import type { Project, ProjectState } from '../../../types';
import Modal from '../../../components/Modal';
import { InputField, SelectField, ComboField } from '../../../components/ui/TabletFields';
import { useAppDialog } from '../../../components/AppDialogProvider';
import { usePermissions } from '../../../hooks/usePermissions';
import { useReadOnlyPoll } from '../../../hooks/useReadOnlyPoll';
import { Pencil, Trash2, Plus, Building2, Tag, Zap, MapPin, Calendar, Hash, FolderKanban, Users, FileDown, FileSpreadsheet, FileText, ChevronDown, LayoutGrid } from '../../../components/ui/icons';
import { UploadFrameModal } from './FramesTab';
import { TeamManagementModal } from './UsersTab';
import PdfDrawingUploadModal from '../../../components/supervisor/PdfDrawingUploadModal';
import Toast, { type ToastTone } from '../../../components/ui/Toast';
import { useProjectSelectionStore } from '../../../store/useProjectSelectionStore';
import { useAuthStore } from '../../../store/useAuthStore';

const CLIENTS = ['DEWA', 'SEWA', 'ADDC', 'TRANSCO', 'ENOWA', 'HITACHI', 'ABB', 'SIEMENS', 'GE', 'SCHNEIDER', 'ALSTOM'];
const VOLTAGES = ['400KV', '220KV', '132KV', '115KV', '69KV', '33KV', '13.8KV', '11KV', '6.6KV'];
// REGION and LOCATION are SEPARATE segments in VOLTAGE_REGION_LOCATION_YEAR_SEQ
const REGIONS = ['UAE', 'KSA', 'QAT', 'KWT', 'OMN', 'BHR'];
const LOCATIONS = ['DUBAI', 'ABU_DHABI', 'SHARJAH', 'FUJAIRAH', 'RIYADH', 'JEDDAH', 'NEOM', 'DOHA', 'KUWAIT', 'MUSCAT', 'MANAMA'];
const YEARS = ['2024', '2025', '2026', '2027'];
const STATES: ProjectState[] = ['not_started', 'active', 'stopped', 'pending', 'completed', 'in_review', 'submitted_to_director'];

interface CreateForm {
  displayName: string;  // merged Project / Substation Name → stored in `name` column
  client: string;
  voltage: string;
  region: string;
  location: string;
  year: string;
  seq: string;
}

interface PanelDraft {
  key: string;
  name: string;
  type: string;
}

function newPanelDraft(): PanelDraft {
  return { key: `panel_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`, name: '', type: '' };
}

function apiErrorMessage(err: unknown, fallback: string): string {
  const raw = (err as { response?: { data?: { message?: unknown } } })?.response?.data?.message;
  if (Array.isArray(raw)) return raw.map(String).join('. ');
  if (typeof raw === 'string' && raw.trim()) return raw;
  return fallback;
}

export default function ProjectsTab() {
  const dialog = useAppDialog();
  const perms = usePermissions();
  // Currently active project for this session (shown in the header pill) — used to
  // visually emphasize its row in the list. Selecting a row makes it the active project.
  const { user } = useAuthStore();
  const sessionCode = useProjectSelectionStore(s => s.selectedProject?.code ?? null);
  const setSessionProject = useProjectSelectionStore(s => s.setProjectForUser);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [showEdit, setShowEdit] = useState<Project | null>(null);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [showWiringUpload, setShowWiringUpload] = useState(false);
  const [showDrawingPicker, setShowDrawingPicker] = useState(false);
  const [drawingUploadType, setDrawingUploadType] = useState<'pdf' | 'dwg' | null>(null);
  const [reportMenuOpen, setReportMenuOpen] = useState(false);
  const reportMenuRef = useRef<HTMLDivElement>(null);
  const [toast, setToast] = useState<{ message: string; tone: ToastTone } | null>(null);
  const [generatingReport, setGeneratingReport] = useState(false);
  const [showTeam, setShowTeam] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const createModalScrollRef = useRef<HTMLFormElement>(null);
  const emptyForm: CreateForm = { displayName: '', client: '', voltage: '', region: '', location: '', year: '2026', seq: '001' };
  const [form, setForm] = useState<CreateForm>(emptyForm);
  const [panels, setPanels] = useState<PanelDraft[]>([newPanelDraft()]);

  const resetCreateForm = () => {
    setForm(emptyForm);
    setPanels([newPanelDraft()]);
    setSubmitted(false);
    setError('');
  };

  const closeCreateModal = useCallback(() => {
    if (saving) return;
    setShowCreate(false);
    resetCreateForm();
  }, [saving]);

  const load = useCallback(() => {
    setLoading(true);
    projectsApi.list().then(data => {
      setProjects(data);
      setLoading(false);
      setSelectedProject(prev => {
        if (!prev) return prev;
        return data.find((p: Project) => p.code === prev.code) ?? null;
      });
    }).catch(() => setLoading(false));
  }, []);

  const pollProjects = useCallback(() => {
    projectsApi.list().then(data => {
      setProjects(data);
    }).catch(() => {});
  }, []);

  useEffect(() => { load(); }, [load]);
  useReadOnlyPoll(pollProjects, 4000);

  useEffect(() => {
    if (!reportMenuOpen) return;
    const close = (e: MouseEvent) => {
      if (reportMenuRef.current && !reportMenuRef.current.contains(e.target as Node)) {
        setReportMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [reportMenuOpen]);

  useEffect(() => {
    if (!projects.length || !sessionCode) return;
    setSelectedProject(prev => {
      if (prev) return prev;
      return projects.find((p: Project) => p.code === sessionCode) ?? null;
    });
  }, [projects, sessionCode]);

  // Normalize a code segment: uppercase, strip everything but A-Z0-9 (no spaces / separators).
  // "Al Quoz" -> "ALQUOZ", "132 kV" -> "132KV". Keeps the "_" segment structure intact.
  const norm = (s: string) => s.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');

  // Project code = VOLTAGE_REGION_LOCATION_YEAR_SEQ (seq zero-padded to 3)
  const seqDigits = (form.seq || '').replace(/\D/g, '');
  const seq3 = seqDigits ? seqDigits.padStart(3, '0').slice(-3) : '';
  const codeSegs = [norm(form.voltage), norm(form.region), norm(form.location), norm(form.year), seq3];
  const computedCode = codeSegs.join('_');
  const codeComplete = codeSegs.every(Boolean);
  const panelsValid = panels.length > 0 && panels.every(p => !!p.name.trim());
  const canCreate = codeComplete && !!form.displayName.trim() && !!form.client.trim() && panelsValid;

  // Per-field validation errors — only shown after first submit attempt
  const fe = submitted ? {
    displayName: !form.displayName.trim() ? 'Required' : '',
    client:   !form.client.trim()    ? 'Required' : '',
    voltage:  !norm(form.voltage)    ? 'Required' : '',
    region:   !norm(form.region)     ? 'Required' : '',
    location: !norm(form.location)   ? 'Required' : '',
    year:     !norm(form.year)       ? 'Required' : '',
    seq:      !seq3                  ? 'Required (digits only)' : '',
    panels: panels.length === 0
      ? 'Add at least one panel'
      : panels.some(p => !p.name.trim())
        ? 'Each panel needs a name'
        : '',
  } : { displayName:'', client:'', voltage:'', region:'', location:'', year:'', seq:'', panels:'' };

  const panelFieldErrors = submitted
    ? panels.map(p => (!p.name.trim() ? 'Required' : ''))
    : panels.map(() => '');

  const validationHint = submitted && !canCreate
    ? (() => {
        const missing: string[] = [];
        if (!form.displayName.trim()) missing.push('project name');
        if (!panelsValid) missing.push('at least one panel name');
        if (!form.client.trim()) missing.push('client');
        if (!norm(form.voltage)) missing.push('voltage');
        if (!norm(form.region)) missing.push('region');
        if (!norm(form.location)) missing.push('location');
        if (!norm(form.year)) missing.push('year');
        if (!seq3) missing.push('sequence');
        return missing.length
          ? `Complete required fields: ${missing.join(', ')}.`
          : 'Complete all required fields before creating.';
      })()
    : '';

  const openCreateModal = () => {
    resetCreateForm();
    setShowCreate(true);
  };

  const addPanel = () => setPanels(prev => [...prev, newPanelDraft()]);
  const removePanel = (key: string) => {
    setPanels(prev => (prev.length <= 1 ? prev : prev.filter(p => p.key !== key)));
  };
  const updatePanel = (key: string, patch: Partial<Omit<PanelDraft, 'key'>>) => {
    setPanels(prev => prev.map(p => (p.key === key ? { ...p, ...patch } : p)));
  };

  const handleProjectDropdownChange = (code: string) => {
    if (!code) {
      setSelectedProject(null);
      return;
    }
    const project = projects.find(p => p.code === code);
    if (!project) return;
    setSelectedProject(project);
    if (user?.id) {
      setSessionProject({
        code: project.code,
        name: project.name,
        client: project.client,
        project_state: project.project_state,
        is_active: project.is_active,
      }, user.id);
    }
  };

  const downloadReport = async (format: 'pdf' | 'excel') => {
    if (!selectedProject || generatingReport) return;
    setGeneratingReport(true);
    setReportMenuOpen(false);
    try {
      const isPdf = format === 'pdf';
      const blob: Blob = isPdf
        ? await projectsApi.reportPdf(selectedProject.code)
        : await projectsApi.reportXlsx(selectedProject.code);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Report_${selectedProject.name.replace(/\s+/g, '_')}.${isPdf ? 'pdf' : 'xlsx'}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 5000);
      setToast({ message: `${isPdf ? 'PDF' : 'Excel'} report downloaded.`, tone: 'success' });
    } catch (e: any) {
      await dialog.alert({
        title: 'Report Error',
        message: e?.response?.data?.message || 'Could not generate the report. Please try again.',
        tone: 'error',
      });
    } finally {
      setGeneratingReport(false);
    }
  };

  const handleCreate = async (event?: React.FormEvent) => {
    event?.preventDefault();
    setSubmitted(true);
    setError('');
    if (!canCreate) {
      const body = createModalScrollRef.current?.closest('.modal-body');
      (body ?? createModalScrollRef.current)?.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    setSaving(true);
    try {
      const created = await projectsApi.create({
        code: computedCode,
        client: form.client.trim(),
        name: form.displayName.trim(),
        sequence: parseInt(seq3, 10) || 1,
        panels: panels.map(p => ({
          name: p.name.trim(),
          ...(p.type.trim() ? { type: p.type.trim() } : {}),
        })),
      });
      setProjects(prev => [...prev, created]);   // reflect immediately, no full reload
      setShowCreate(false);
      resetCreateForm();
      setToast({ message: `Project "${created.name}" created (${created.code}).`, tone: 'success' });
    } catch (apiError: unknown) {
      if ((apiError as { response?: { status?: number } })?.response?.status === 409) {
        // Duplicate code: find the next free sequence from the loaded projects list
        // so we can auto-bump the Sequence field and let the user retry immediately.
        // The server's duplicate check remains authoritative; this is convenience only.
        const prefix4 = codeSegs.slice(0, 4).join('_');  // VOLTAGE_REGION_LOCATION_YEAR
        const usedSeqs = projects
          .map(p => {
            const parts = p.code.split('_');
            if (parts.length < 5) return null;
            const pPrefix = parts.slice(0, 4).join('_');
            return pPrefix === prefix4 ? parseInt(parts[4] || '0', 10) : null;
          })
          .filter((n): n is number => n !== null && !Number.isNaN(n));
        const maxSeq = usedSeqs.length > 0 ? Math.max(...usedSeqs) : parseInt(seq3, 10) || 1;
        const nextSeq = String(maxSeq + 1).padStart(3, '0');
        setError(`Code ${computedCode} already exists — sequence auto-updated to ${nextSeq}. Review the preview and click Create again.`);
        setForm(s => ({ ...s, seq: nextSeq }));
      } else {
        setError(apiErrorMessage(apiError, 'Failed to create project. Check your connection and try again.'));
      }
    } finally {
      setSaving(false);
    }
  };

  // Edit saved: update the row in place (no refetch / no spinner flicker)
  const handleEditSaved = (updated: Project) => {
    setProjects(prev => prev.map(p => (p.code === updated.code ? updated : p)));
  };

  const handleDelete = async (project: Project) => {
    const confirmed = await dialog.confirm({
      title: 'Remove Project from List',
      message: `Remove "${project.name}" (${project.code}) from the active project list? Wiring history, assignments, and files are preserved. A System Administrator can permanently delete the project if needed.`,
      tone: 'warning',
      confirmText: 'Remove',
      cancelText: 'Cancel',
    });
    if (!confirmed) return;

    setDeleting(true);
    try {
      await projectsApi.remove(project.code);
      setProjects(prev => prev.filter(p => p.code !== project.code));
      setSelectedProject(prev => (prev?.code === project.code ? null : prev));
      setToast({ message: 'Project removed from list.', tone: 'success' });
    } catch (e: any) {
      await dialog.alert({
        title: 'Remove Failed',
        message: e?.response?.data?.message || 'Could not remove project. Please try again.',
        tone: 'error',
      });
    } finally {
      setDeleting(false);
    }
  };

  const projectGated = Boolean(selectedProject);

  return (
    <div className="flex flex-col gap-4 min-w-0">
      <div className="pj-project-select-row">
        <label htmlFor="pj-active-project" className="text-[12px] font-semibold uppercase tracking-wide text-slate-500">
          Active project
        </label>
        <select
          id="pj-active-project"
          className="pj-project-select"
          value={selectedProject?.code ?? ''}
          onChange={e => handleProjectDropdownChange(e.target.value)}
          disabled={loading}
        >
          <option value="">Select a project…</option>
          {projects.map(p => (
            <option key={p.code} value={p.code}>
              {p.name} · {p.client}
            </option>
          ))}
        </select>
        {!projectGated && (
          <p className="pj-action-hint">Select a project to enable wiring upload, drawing upload, and reports.</p>
        )}
      </div>

      <section className="pj-actions-toolbar" aria-label="Project actions">
        <div className="pj-actions-grid">
          {perms.canManageProjects && (
            <button className="pj-btn-primary pj-action-btn" onClick={openCreateModal} type="button">
              <Plus size={16} strokeWidth={1.5} />
              <span>New Project</span>
            </button>
          )}

          {perms.canManageProjects && (
            <button
              type="button"
              onClick={() => setShowWiringUpload(true)}
              disabled={!projectGated}
              className="pj-btn-primary pj-action-btn"
              title={projectGated ? `Upload wiring schedule for ${selectedProject!.name}` : 'Select a project first'}
            >
              <FileSpreadsheet size={16} strokeWidth={1.5} />
              <span>Excel Wiring Upload</span>
            </button>
          )}

          {perms.canManageProjects && (
            <button
              type="button"
              onClick={() => setShowDrawingPicker(true)}
              disabled={!projectGated}
              className="pj-btn-primary pj-action-btn"
              title={projectGated ? `Upload drawing for ${selectedProject!.name}` : 'Select a project first'}
            >
              <FileText size={16} strokeWidth={1.5} />
              <span>Drawing Upload</span>
            </button>
          )}

          {perms.canManageProjects && (
            <div className="pj-action-block pj-action-block--menu" ref={reportMenuRef}>
              <button
                type="button"
                onClick={() => projectGated && setReportMenuOpen(o => !o)}
                disabled={!projectGated || generatingReport}
                className="pj-btn-primary pj-action-btn w-full"
                aria-expanded={reportMenuOpen}
                aria-haspopup="menu"
                title={projectGated ? 'Export project report' : 'Select a project first'}
              >
                <FileDown size={16} strokeWidth={1.5} />
                <span>{generatingReport ? 'Generating…' : 'Report'}</span>
                <ChevronDown size={14} strokeWidth={1.5} className={`ml-auto shrink-0 transition-transform ${reportMenuOpen ? 'rotate-180' : ''}`} />
              </button>
              {reportMenuOpen && projectGated && (
                <div className="pj-toolbar-dropdown" role="menu" aria-label="Report format">
                  <button
                    type="button"
                    role="menuitem"
                    className="pj-toolbar-dropdown-item"
                    onClick={() => downloadReport('pdf')}
                  >
                    <FileText size={16} strokeWidth={1.5} className="text-red-500 shrink-0" />
                    <span>Non-editable PDF</span>
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    className="pj-toolbar-dropdown-item"
                    onClick={() => downloadReport('excel')}
                  >
                    <FileSpreadsheet size={16} strokeWidth={1.5} className="text-green-600 shrink-0" />
                    <span>Excel</span>
                  </button>
                </div>
              )}
            </div>
          )}

          {perms.canManageTeamTechnicians && (
            <button type="button" onClick={() => setShowTeam(true)} className="pj-btn-primary pj-action-btn">
              <Users size={16} strokeWidth={1.5} />
              <span>User Management</span>
            </button>
          )}
        </div>
      </section>

      <div className="flex flex-col min-w-0">
      <div className="pj-surface flex flex-col min-w-0 rounded-xl border border-[#E2E8F0]">
        <div className="overflow-x-auto">
          <table className="pj-table w-full text-left border-collapse min-w-[720px]">
            <thead className="sticky top-0 bg-white z-10 border-b border-[#D5DBE3]">
              <tr>
                <th className="font-bold text-slate-500 uppercase">Name</th>
                <th className="font-bold text-slate-500 uppercase w-[150px]">Client</th>
                <th className="font-bold text-slate-500 uppercase w-[130px]">State</th>
                <th className="font-bold text-slate-500 uppercase w-[130px]">Created</th>
                <th className="font-bold text-slate-500 uppercase w-[160px] text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={5} className="text-center py-12 text-slate-500">
                    Loading projects...
                  </td>
                </tr>
              ) : projects.length === 0 ? (
                <tr>
                  <td colSpan={5} className="text-center py-12 text-slate-500">
                    <div className="flex flex-col items-center gap-3">
                      <FolderKanban size={40} className="text-slate-400" strokeWidth={1} />
                      <div className="text-[14px]">No projects yet. Create your first project to start.</div>
                    </div>
                  </td>
                </tr>
              ) : (
                projects.map(project => {
                  const isPicked = selectedProject?.code === project.code;
                  return (
                  <tr
                    key={project.code}
                    className={`transition-colors cursor-pointer ${
                      isPicked ? 'bg-blue-50/80' : 'hover:bg-slate-50/70'
                    }`}
                    aria-current={isPicked ? 'true' : undefined}
                    onClick={() => handleProjectDropdownChange(project.code)}
                  >
                    <td className={`font-medium text-slate-800 truncate ${isPicked ? 'shadow-[inset_3px_0_0_#2563eb]' : ''}`}>
                      <span className="inline-flex items-center gap-2 min-w-0">
                        <span className="truncate" title={project.name}>{project.name}</span>
                        {isPicked && (
                          <span className="shrink-0 text-[10px] font-bold uppercase tracking-wide text-blue-700 bg-blue-100 border border-blue-200 px-1.5 py-0.5 rounded">
                            Selected
                          </span>
                        )}
                      </span>
                    </td>
                    <td className="text-slate-700 truncate">{project.client}</td>
                    <td>
                      <span data-state={project.project_state} className="pj-state-badge inline-flex items-center justify-center px-2.5 py-0.5 rounded-full text-[11px] font-bold uppercase tracking-wide">
                        {project.project_state.replace(/_/g, ' ')}
                      </span>
                    </td>
                    <td className="text-slate-500">
                      {project.created_at ? new Date(project.created_at).toLocaleDateString() : '--'}
                    </td>
                    <td onClick={e => e.stopPropagation()}>
                      <div className="flex items-center justify-end gap-2">
                        {perms.canManageProjects ? (
                          <>
                            <button
                              type="button"
                              className="pj-btn-secondary min-w-[90px]"
                              onClick={() => setShowEdit(project)}
                            >
                              <Pencil size={16} strokeWidth={1.5} />
                              <span>Edit</span>
                            </button>
                            <button
                              type="button"
                              disabled={deleting}
                              className="pj-btn-danger-ghost min-w-[90px] disabled:opacity-50"
                              onClick={() => handleDelete(project)}
                            >
                              <Trash2 size={16} strokeWidth={1.5} />
                              <span>Remove</span>
                            </button>
                          </>
                        ) : (
                          <span className="text-[13px] text-slate-400">View only</span>
                        )}
                      </div>
                    </td>
                  </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
      </div>

      {showTeam && <TeamManagementModal onClose={() => setShowTeam(false)} />}

      {showDrawingPicker && selectedProject && (
        <Modal
          title="Drawing Upload"
          onClose={() => setShowDrawingPicker(false)}
          size="sm"
          footer={(
            <button type="button" className="btn-secondary" onClick={() => setShowDrawingPicker(false)}>
              Cancel
            </button>
          )}
        >
          <p className="text-[13px] text-slate-600 mb-4">Choose the drawing file type for <strong>{selectedProject.name}</strong>.</p>
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              className="flex flex-col items-center gap-2 p-4 rounded-xl border border-slate-200 hover:border-blue-400 hover:bg-blue-50 transition-colors min-h-[48px]"
              onClick={() => { setShowDrawingPicker(false); setDrawingUploadType('pdf'); }}
            >
              <FileText size={24} className="text-red-500" />
              <span className="text-[13px] font-semibold">PDF</span>
            </button>
            <button
              type="button"
              className="flex flex-col items-center gap-2 p-4 rounded-xl border border-slate-200 hover:border-blue-400 hover:bg-blue-50 transition-colors min-h-[48px]"
              onClick={() => { setShowDrawingPicker(false); setDrawingUploadType('dwg'); }}
            >
              <FileText size={24} className="text-blue-600" />
              <span className="text-[13px] font-semibold">DWG</span>
            </button>
          </div>
        </Modal>
      )}

      {showWiringUpload && selectedProject && (
        <UploadFrameModal
          projectCode={selectedProject.code}
          projectName={selectedProject.name}
          onClose={() => setShowWiringUpload(false)}
          onUploaded={() => {
            setShowWiringUpload(false);
            setToast({ message: 'Wiring schedule uploaded — verify it in Frames.', tone: 'success' });
          }}
        />
      )}

      {drawingUploadType && selectedProject && (
        <PdfDrawingUploadModal
          projectCode={selectedProject.code}
          projectName={selectedProject.name}
          fileType={drawingUploadType}
          onClose={() => setDrawingUploadType(null)}
          onUploaded={() => setToast({ message: `${drawingUploadType.toUpperCase()} drawing uploaded.`, tone: 'success' })}
        />
      )}

      {toast && (
        <Toast
          message={toast.message}
          tone={toast.tone}
          onDismiss={() => setToast(null)}
        />
      )}

      {showCreate && (
        <Modal
          title="New Project"
          size="form"
          onClose={closeCreateModal}
          closeOnBackdrop={false}
          closeOnEscape={!saving}
          footer={(
            <>
              <button
                type="button"
                className="btn-secondary"
                onClick={closeCreateModal}
                disabled={saving}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
                disabled={saving}
                form="create-project-form"
              >
                {saving ? 'Creating…' : 'Create Project'}
              </button>
            </>
          )}
        >
          <form
            id="create-project-form"
            className="flex flex-col gap-6"
            ref={createModalScrollRef}
            onSubmit={handleCreate}
            noValidate
          >
            {(validationHint || error) && (
              <div className="flex flex-col gap-2">
                {validationHint && (
                  <p className="text-[13px] font-medium text-amber-800 bg-amber-50 border border-amber-200 rounded-[10px] px-3 py-2">
                    {validationHint}
                  </p>
                )}
                {error && (
                  <div className="p-3 bg-red-50 text-red-600 text-[13px] font-medium rounded-[10px] border border-red-200">
                    {error}
                  </div>
                )}
              </div>
            )}

            <section className="flex flex-col gap-4">
              <h3 className="text-[12px] font-bold uppercase tracking-[0.08em] text-slate-500">
                Project Information
              </h3>

              <InputField
                label="Project / Substation Name *"
                icon={<FolderKanban size={18} strokeWidth={1.5} />}
                value={form.displayName}
                onChange={value => setForm(s => ({ ...s, displayName: value }))}
                placeholder="e.g. CPR — 132/11kV Al Quoz Main"
                error={fe.displayName}
              />

              <div className="flex flex-col gap-4 pt-2 border-t border-slate-200">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex flex-col gap-0.5">
                    <h3 className="text-[12px] font-bold uppercase tracking-[0.08em] text-slate-500">
                      Panels
                      <span className="ml-2 font-medium normal-case tracking-normal text-slate-400">
                        {panels.length} {panels.length === 1 ? 'panel' : 'panels'}
                      </span>
                    </h3>
                    <span className="text-[11px] text-slate-400">
                      Name and type for each panel in this project.
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={addPanel}
                    className="pj-btn-secondary shrink-0"
                  >
                    <Plus size={14} strokeWidth={1.5} />
                    Add Panel
                  </button>
                </div>

                {fe.panels && (
                  <p className="text-[12px] font-medium text-amber-700">{fe.panels}</p>
                )}

                <div className="flex flex-col gap-2.5">
                  {panels.map((panel, idx) => (
                    <div key={panel.key} className="flex items-start gap-2">
                      <div className="flex-1 min-w-0 grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <InputField
                          label={panels.length > 1 ? `Panel ${idx + 1} name *` : 'Panel name *'}
                          icon={<LayoutGrid size={16} strokeWidth={1.5} />}
                          value={panel.name}
                          onChange={value => updatePanel(panel.key, { name: value })}
                          placeholder="e.g. Bay 1 Protection Panel"
                          error={panelFieldErrors[idx]}
                        />
                        <InputField
                          label={panels.length > 1 ? `Panel ${idx + 1} type` : 'Panel type'}
                          icon={<Tag size={16} strokeWidth={1.5} />}
                          value={panel.type}
                          onChange={value => updatePanel(panel.key, { type: value })}
                          placeholder="e.g. PROTECTION, CONTROL, =Bay-1"
                        />
                      </div>
                      {panels.length > 1 && (
                        <button
                          type="button"
                          onClick={() => removePanel(panel.key)}
                          className="pj-btn-danger-ghost mt-6 shrink-0"
                          title="Remove panel"
                          aria-label={`Remove panel ${idx + 1}`}
                        >
                          <Trash2 size={16} strokeWidth={1.5} />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              <ComboField
                label="Client *"
                icon={<Building2 size={18} strokeWidth={1.5} />}
                value={form.client}
                onChange={value => setForm(s => ({ ...s, client: value }))}
                options={CLIENTS}
                placeholder="Pick or type a client"
                error={fe.client}
              />

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <ComboField
                  label="Voltage *"
                  icon={<Zap size={18} strokeWidth={1.5} />}
                  value={form.voltage}
                  onChange={value => setForm(s => ({ ...s, voltage: value }))}
                  options={VOLTAGES}
                  placeholder="132KV"
                  error={fe.voltage}
                />
                <ComboField
                  label="Region *"
                  icon={<MapPin size={18} strokeWidth={1.5} />}
                  value={form.region}
                  onChange={value => setForm(s => ({ ...s, region: value }))}
                  options={REGIONS}
                  placeholder="UAE"
                  error={fe.region}
                />
                <ComboField
                  label="Location *"
                  icon={<MapPin size={18} strokeWidth={1.5} />}
                  value={form.location}
                  onChange={value => setForm(s => ({ ...s, location: value }))}
                  options={LOCATIONS}
                  placeholder="DUBAI"
                  error={fe.location}
                />
                <SelectField
                  label="Year *"
                  icon={<Calendar size={18} strokeWidth={1.5} />}
                  value={form.year}
                  onChange={value => setForm(s => ({ ...s, year: value }))}
                  options={YEARS}
                  error={fe.year}
                />
                <InputField
                  label="Sequence *"
                  icon={<Hash size={18} strokeWidth={1.5} />}
                  value={form.seq}
                  onChange={value => setForm(s => ({ ...s, seq: value }))}
                  placeholder="001"
                  error={fe.seq}
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-slate-400">
                  Project code
                </span>
                <div
                  className={`w-full px-4 py-2.5 rounded-[10px] border font-mono text-[13px] flex flex-wrap items-center gap-0 min-h-[44px] ${
                    codeComplete ? 'bg-blue-50/80 border-blue-200 text-blue-800' : 'bg-slate-50 border-slate-200'
                  }`}
                >
                  {codeComplete ? (
                    <span className="font-semibold">{computedCode}</span>
                  ) : (
                    [
                      { seg: norm(form.voltage), label: 'VOLT' },
                      { seg: norm(form.region), label: 'REG' },
                      { seg: norm(form.location), label: 'LOC' },
                      { seg: norm(form.year), label: 'YEAR' },
                      { seg: seq3, label: 'SEQ' },
                    ].map((item, i) => (
                      <span key={i} className="flex items-center">
                        {i > 0 && <span className="text-slate-300 select-none">_</span>}
                        {item.seg
                          ? <span className="font-semibold text-slate-700">{item.seg}</span>
                          : <span className="text-slate-400 italic font-normal text-[12px]">{item.label}</span>
                        }
                      </span>
                    ))
                  )}
                </div>
              </div>
            </section>
          </form>
        </Modal>
      )}

      {showEdit && <EditProjectModal project={showEdit} onClose={() => setShowEdit(null)} onSaved={handleEditSaved} />}
    </div>
  );
}

function EditProjectModal({ project, onClose, onSaved }: { project: Project; onClose: () => void; onSaved: (updated: Project) => void }) {
  const [name, setName] = useState(project.name);
  const [description, setDescription] = useState(project.description || '');
  const [state, setState] = useState<ProjectState>(project.project_state);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleSave = async () => {
    setSaving(true);
    setError('');
    try {
      // Save name/description, then state (separate endpoint) only if it changed.
      let updated: Project = await projectsApi.update(project.code, { name, description });
      if (state !== project.project_state) {
        updated = await projectsApi.setState(project.code, state);
      }
      onSaved(updated);   // update the row in the list live — no full reload
      onClose();
    } catch (apiError: any) {
      setError(apiError?.response?.data?.message || 'Failed to save changes. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      title="Edit Project"
      onClose={onClose}
      footer={(
        <div className="flex items-center justify-end gap-3 w-full">
          <button className="btn-secondary" onClick={onClose} type="button">
            Cancel
          </button>
          <button className="btn-primary" onClick={handleSave} disabled={saving} type="button">
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      )}
    >
      <div className="flex flex-col gap-4">
        <div className="form-group">
          <label className="form-label">Project Code</label>
          <input value={project.code} title="Project Code" readOnly className="form-input font-mono bg-slate-50 text-slate-500 cursor-not-allowed" disabled />
        </div>

        <InputField label="Project Name" icon={<FolderKanban size={18} strokeWidth={1.5} />} value={name} onChange={setName} />

        <div className="form-group">
          <label className="form-label">State</label>
          <select title="Project state" value={state} onChange={event => setState(event.target.value as ProjectState)} className="form-select">
            {STATES.map(item => <option key={item} value={item}>{item.replace(/_/g, ' ')}</option>)}
          </select>
        </div>

        <div className="form-group">
          <label className="form-label">Description</label>
          <textarea value={description} onChange={event => setDescription(event.target.value)} rows={3} title="Description" placeholder="Optional project description" className="form-textarea" />
        </div>

        {error && (
          <div className="p-3 bg-red-50 text-red-600 text-[13px] font-medium rounded-[10px] border border-red-200">
            {error}
          </div>
        )}
      </div>
    </Modal>
  );
}
