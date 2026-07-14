import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { projectsApi, supervisorApi } from '../../../services/api';
import type { FramePanel } from '../../../components/assignment/ProjectPanelSelect';
import type { Project, ProjectState } from '../../../types';
import Modal from '../../../components/Modal';
import { InputField, ComboField } from '../../../components/ui/TabletFields';
import { useAppDialog } from '../../../components/AppDialogProvider';
import { usePermissions } from '../../../hooks/usePermissions';
import { useDwesRefresh, type RefreshOptions } from '../../../hooks/useDwesRefresh';
import { Pencil, Trash2, Plus, Building2, Tag, Zap, MapPin, Calendar, Hash, FolderKanban, Users, FileDown, FileSpreadsheet, FileText, ChevronDown, LayoutGrid, UserCog } from '../../../components/ui/icons';
import { UploadFrameModal } from './FramesTab';
import { TeamManagementModal } from './UsersTab';
import PanelWiringViewModal from '../../../components/supervisor/PanelWiringViewModal';
import PanelGaDrawingModal from '../../../components/ui/PanelGaDrawingModal';
import DuplicatePanelWarning from '../../../components/supervisor/DuplicatePanelWarning';
import DeletePanelConfirmModal from '../../../components/supervisor/DeletePanelConfirmModal';
import DocumentAvailabilityBadge from '../../../components/supervisor/DocumentAvailabilityBadge';
import { useProjectPanelDocumentStatus } from '../../../hooks/useProjectPanelDocumentStatus';
import type { DocumentStatus } from '../../../utils/documentAvailability';
import Toast, { type ToastTone } from '../../../components/ui/Toast';
import { buildProjectPanelSelectList, compactPanelKey } from '../../../utils/panelDuplicates';
import { usePanelDuplicateGuard } from '../../../hooks/usePanelDuplicateGuard';
import { emitFramesChanged, onFramesChanged } from '../../../utils/projectFramesEvents';
import { emitDocumentsChanged, onDocumentsChanged } from '../../../utils/projectDocumentsEvents';
import {
  PROJECT_DELETE_CONFIRM_BUTTON,
  PROJECT_DELETE_CONFIRM_LABEL,
  PROJECT_DELETE_MODAL_TITLE,
  PROJECT_DELETE_WARNING,
} from '../../../constants/projectDeletion';
import {
  buildProjectReferenceTitle,
  encodeProjectMeta,
  decodeProjectMeta,
  mergeProjectDescription,
  projectSelectLabel,
  resolveProjectCardDetails,
  compactPanelDisplayName,
} from '../../../utils/projectDisplay';
import { buildPanelReportFilename } from '../../../utils/reportFilename';
import { useProjectSelectionStore } from '../../../store/useProjectSelectionStore';
import { useAuthStore } from '../../../store/useAuthStore';
import type { TechnicianWorkflowSection } from '../../../components/supervisor/TechnicianWorkflowModal';
import { useLatestRequest } from '../../../hooks/useLatestRequest';

export interface ProjectsTabProps {
  onOpenTechnicianWorkflow?: (opts: {
    section?: TechnicianWorkflowSection;
    projectCode: string;
    panelId: string;
    projectName: string;
    panelName: string;
    cableCount?: number;
  }) => void;
}

const CLIENTS = ['DEWA', 'SEWA', 'ADDC', 'TRANSCO', 'ENOWA', 'HITACHI', 'ABB', 'SIEMENS', 'GE', 'SCHNEIDER', 'ALSTOM'];
const VOLTAGES = ['400KV', '220KV', '132KV', '115KV', '69KV', '33KV', '13.8KV', '11KV', '6.6KV'];
const REGIONS = ['UAE', 'KSA', 'QAT', 'KWT', 'OMN', 'BHR'];
const YEARS = ['2024', '2025', '2026', '2027'];
const LOCATION_REGION_PRESETS = [
  'DUBAI / UAE', 'ABU_DHABI / UAE', 'SHARJAH / UAE', 'FUJAIRAH / UAE',
  'RIYADH / KSA', 'JEDDAH / KSA', 'NEOM / KSA', 'DOHA / QAT', 'KUWAIT / KWT', 'MUSCAT / OMN', 'MANAMA / BHR',
];
const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const MONTH_YEAR_PRESETS = MONTH_NAMES.flatMap(m => YEARS.map(y => `${m} ${y}`));
const STATES: ProjectState[] = ['not_started', 'active', 'stopped', 'pending', 'completed', 'in_review', 'submitted_to_director'];

interface CreateForm {
  displayName: string;
  client: string;
  locationRegion: string;
  monthYear: string;
  seq: string;
}

const emptyForm: CreateForm = { displayName: '', client: '', locationRegion: '', monthYear: 'July 2026', seq: '001' };

interface PanelDraft {
  key: string;
  name: string;
  panelType: string;
  voltageLevel: string;
  systemType: string;
}

function newPanelDraft(seed?: Partial<Omit<PanelDraft, 'key'>>): PanelDraft {
  return {
    key: `panel_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    name: '',
    panelType: '',
    voltageLevel: '',
    systemType: '',
    ...seed,
  };
}

function panelNameTypeLabel(panel: Pick<PanelDraft, 'name' | 'panelType'>): string {
  const name = panel.name.trim();
  const type = panel.panelType.trim();
  if (name && type) return `${name} / ${type}`;
  return name || type;
}

function parseLocationRegion(raw: string): { location: string; region: string } {
  const s = raw.trim();
  if (!s) return { location: '', region: '' };
  const slashParts = s.split(/\s*\/\s*/).map(p => p.trim()).filter(Boolean);
  if (slashParts.length >= 2) {
    return { location: slashParts[0], region: slashParts[slashParts.length - 1] };
  }
  const commaParts = s.split(/\s*,\s*/).map(p => p.trim()).filter(Boolean);
  if (commaParts.length >= 2) {
    return { location: commaParts[0], region: commaParts[commaParts.length - 1] };
  }
  const upper = s.toUpperCase();
  for (const r of REGIONS) {
    if (upper === r || upper.endsWith(` ${r}`)) {
      const loc = s.slice(0, s.toUpperCase().lastIndexOf(r)).replace(/[,\-/]\s*$/, '').trim();
      return { location: loc || s, region: r };
    }
  }
  for (const r of REGIONS) {
    if (upper.includes(r)) {
      return {
        location: s.replace(new RegExp(r, 'i'), '').replace(/[,\-/]\s*$/, '').trim() || s,
        region: r,
      };
    }
  }
  return { location: s, region: '' };
}

function parseMonthYear(raw: string): { month: string; year: string } {
  const s = raw.trim();
  if (!s) return { month: '', year: '' };
  const yearMatch = s.match(/\b(20\d{2})\b/);
  const year = yearMatch ? yearMatch[1] : '';
  let month = s;
  if (yearMatch) {
    month = s.replace(yearMatch[0], '').replace(/^[\s,\-/]+|[\s,\-/]+$/g, '').trim();
  }
  return { month: month || s, year };
}

function displayPanelMeta(value: string | null | undefined, fallback?: string): string {
  const v = typeof value === 'string' ? value.trim() : '';
  if (v) return v;
  const fb = fallback?.trim();
  if (fb) return fb;
  return 'Not set';
}

function panelVoltageDisplay(panel: FramePanel, projectCode: string): string {
  return displayPanelMeta(
    panel.voltage_level as string | null | undefined,
    projectCode.split('_')[0] || undefined,
  );
}

function apiErrorMessage(err: unknown, fallback: string): string {
  const raw = (err as { response?: { data?: { message?: unknown } } })?.response?.data?.message;
  if (Array.isArray(raw)) return raw.map(String).join('. ');
  if (typeof raw === 'string' && raw.trim()) return raw;
  return fallback;
}

function panelMetaValue(value?: string | null): string {
  return displayPanelMeta(value);
}

function panelDraftToApiPayload(p: PanelDraft) {
  return {
    name: p.name.trim(),
    ...(p.panelType.trim() ? { type: p.panelType.trim() } : {}),
    voltage_level: p.voltageLevel.trim(),
    ...(p.systemType.trim() ? { system_type: p.systemType.trim() } : {}),
  };
}

export default function ProjectsTab({ onOpenTechnicianWorkflow }: ProjectsTabProps = {}) {
  const dialog = useAppDialog();
  const perms = usePermissions();
  // Currently active project for this session (shown in the header pill) — used to
  // visually emphasize its row in the list. Selecting a row makes it the active project.
  const { user } = useAuthStore();
  const sessionCode = useProjectSelectionStore(s => s.selectedProject?.code ?? null);
  const setSessionProject = useProjectSelectionStore(s => s.setProjectForUser);
  const clearSessionProject = useProjectSelectionStore(s => s.clearProjectForUser);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [showEdit, setShowEdit] = useState<Project | null>(null);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [selectedPanelId, setSelectedPanelId] = useState('');
  const [projectPanels, setProjectPanels] = useState<FramePanel[]>([]);
  const [loadingPanels, setLoadingPanels] = useState(false);
  const [showWiringUpload, setShowWiringUpload] = useState(false);
  const [showWiringView, setShowWiringView] = useState(false);
  const [showGaDrawingView, setShowGaDrawingView] = useState(false);
  const [confirmReupload, setConfirmReupload] = useState(false);
  const [reportMenuOpen, setReportMenuOpen] = useState(false);
  const reportMenuRef = useRef<HTMLDivElement>(null);
  const [editMenuOpen, setEditMenuOpen] = useState(false);
  const editMenuRef = useRef<HTMLDivElement>(null);
  const [toast, setToast] = useState<{ message: string; tone: ToastTone } | null>(null);
  const [generatingReport, setGeneratingReport] = useState(false);
  const [showTeam, setShowTeam] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [showEditPanel, setShowEditPanel] = useState<FramePanel | null>(null);
  const [showAddPanel, setShowAddPanel] = useState(false);
  const [deletingPanelId, setDeletingPanelId] = useState<string | null>(null);
  const [deletePanelTarget, setDeletePanelTarget] = useState<FramePanel | null>(null);
  const [deleteProjectTarget, setDeleteProjectTarget] = useState<Project | null>(null);
  const [deleteProjectConfirmed, setDeleteProjectConfirmed] = useState(false);
  const [duplicateBannerDismissed, setDuplicateBannerDismissed] = useState(false);
  const createModalScrollRef = useRef<HTMLFormElement>(null);
  const [form, setForm] = useState<CreateForm>(emptyForm);
  // Panels are added deliberately through the Add Panel overlay — never pre-seeded.
  const [panels, setPanels] = useState<PanelDraft[]>([]);
  const [panelDraft, setPanelDraft] = useState<PanelDraft | null>(null);
  const [numberingCheck, setNumberingCheck] = useState<{ code: string; available: boolean; reason?: string } | null>(null);
  const projectRequests = useLatestRequest();
  const panelRequests = useLatestRequest();
  const numberingRequests = useLatestRequest();

  const resetCreateForm = useCallback(() => {
    setForm(emptyForm);
    setPanels([]);
    setPanelDraft(null);
    setNumberingCheck(null);
    setSubmitted(false);
    setError('');
  }, []);

  const closeCreateModal = useCallback(() => {
    if (saving) return;
    setShowCreate(false);
    resetCreateForm();
  }, [saving, resetCreateForm]);

  /**
   * A silent refresh (server event, fallback poll, tab focus) swaps the project list in
   * place: no spinner, no blanked list, and the selected project/panel is kept. Only an
   * explicit load shows the loading state and resets the selection.
   */
  const load = useCallback(async (options?: RefreshOptions) => {
    const silent = options?.silent === true;
    const request = projectRequests.begin();
    if (!silent) {
      panelRequests.cancel();
      setLoading(true);
      setSelectedProject(null);
      setProjectPanels([]);
      setSelectedPanelId('');
      setLoadingPanels(false);
    }
    try {
      const data = await projectsApi.list(request.signal) as Project[];
      if (!projectRequests.isLatest(request.id)) return;
      setProjects(data);
    } catch (requestError: any) {
      // A failed silent refresh keeps the last good data on screen.
      if (!silent && requestError?.code !== 'ERR_CANCELED' && projectRequests.isLatest(request.id)) {
        setProjects([]);
      }
      return;
    } finally {
      if (!silent && projectRequests.isLatest(request.id)) setLoading(false);
    }
  }, [panelRequests, projectRequests]);

  const reloadProjectPanels = useCallback((projectCode: string, options?: { silent?: boolean }) => {
    const request = panelRequests.begin();
    if (!options?.silent) setLoadingPanels(true);
    return projectsApi.frames(projectCode, request.signal)
      .then(data => {
        if (!panelRequests.isLatest(request.id)) return;
        const list = data as FramePanel[];
        setProjectPanels(list);
        setSelectedPanelId(prev => {
          if (prev && list.some(p => p.id === prev)) return prev;
          return list[0]?.id ?? '';
        });
      })
      .catch((requestError: any) => {
        if (requestError?.code === 'ERR_CANCELED' || !panelRequests.isLatest(request.id)) return;
        setProjectPanels([]);
        setSelectedPanelId('');
      })
      .finally(() => {
        if (!options?.silent && panelRequests.isLatest(request.id)) setLoadingPanels(false);
      });
  }, [panelRequests]);

  useEffect(() => { void load(); }, [load]);
  useDwesRefresh(load);

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
    if (!editMenuOpen) return;
    const close = (e: MouseEvent) => {
      if (editMenuRef.current && !editMenuRef.current.contains(e.target as Node)) {
        setEditMenuOpen(false);
      }
    };
    const onEscape = (e: KeyboardEvent) => { if (e.key === 'Escape') setEditMenuOpen(false); };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', onEscape);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', onEscape);
    };
  }, [editMenuOpen]);

  useEffect(() => {
    setDuplicateBannerDismissed(false);
    setEditMenuOpen(false);
  }, [selectedProject?.code, selectedPanelId]);

  useEffect(() => onFramesChanged((detail) => {
    if (detail.action === 'deleted') {
      projectRequests.cancel();
      panelRequests.cancel();
    }
    if (detail.action === 'deleted' && (detail.entity ?? (detail.frameId ? 'panel' : 'project')) === 'project') {
      setProjects(current => current.filter(project => project.code !== detail.projectCode));
      if (selectedProject?.code === detail.projectCode) {
        setSelectedProject(null);
        setProjectPanels([]);
        setSelectedPanelId('');
        if (user?.id) clearSessionProject(user.id);
      }
    }
    if (selectedProject?.code && detail.projectCode === selectedProject.code) {
      setDuplicateBannerDismissed(false);
      if (detail.action === 'deleted' && detail.frameId) {
        setProjectPanels(current => current.filter(panel => panel.id !== detail.frameId));
        setSelectedPanelId(current => current === detail.frameId ? '' : current);
        setShowWiringView(false);
        setShowGaDrawingView(false);
      } else if (detail.action !== 'deleted') {
        // A panel added or edited elsewhere (another supervisor, another device) must
        // appear here without a reload — swap the panel list in place, keeping selection.
        void reloadProjectPanels(selectedProject.code, { silent: true });
      }
    }
  }), [clearSessionProject, panelRequests, projectRequests, reloadProjectPanels, selectedProject?.code, user?.id]);

  useEffect(() => {
    if (!selectedProject?.code) return;
    return onDocumentsChanged((detail) => {
      if (detail.projectCode !== selectedProject.code) return;
      if (detail.kind === 'drawing' && detail.action === 'deleted') {
        setShowGaDrawingView(false);
      }
      if (detail.kind === 'wiring' || detail.kind === 'both') {
        void reloadProjectPanels(selectedProject.code, { silent: true });
      }
    });
  }, [selectedProject?.code, reloadProjectPanels]);

  const handleDismissDuplicateWarning = useCallback(() => {
    setDuplicateBannerDismissed(true);
    if (selectedProject?.code) {
      void reloadProjectPanels(selectedProject.code);
    }
  }, [selectedProject?.code, reloadProjectPanels]);

  useEffect(() => {
    if (loading) return;
    const current = selectedProject
      ? projects.find((project: Project) => project.code === selectedProject.code)
      : null;
    const sessionMatch = sessionCode
      ? projects.find((project: Project) => project.code === sessionCode)
      : null;
    const match = current ?? sessionMatch ?? projects[0] ?? null;
    if (!match) {
      if (selectedProject) setSelectedProject(null);
      if (user?.id) clearSessionProject(user.id);
      return;
    }
    // Same project, fresh object from a silent refetch: adopt the new metadata in place.
    // Resetting the panel list here would blank the dropdown and drop the user's panel.
    if (selectedProject?.code === match.code) {
      if (selectedProject !== match) setSelectedProject(match);
      return;
    }
    setLoadingPanels(true);
    setProjectPanels([]);
    setSelectedPanelId('');
    setSelectedProject(match);
    if (user?.id) {
      setSessionProject({
        code: match.code,
        name: match.name,
        client: match.client,
        project_state: match.project_state,
        is_active: match.is_active,
      }, user.id);
    }
  }, [clearSessionProject, loading, projects, selectedProject, sessionCode, setSessionProject, user?.id]);

  useEffect(() => {
    if (!selectedProject?.code) {
      setProjectPanels([]);
      setSelectedPanelId('');
      setLoadingPanels(false);
      return;
    }
    void reloadProjectPanels(selectedProject.code);
  }, [selectedProject?.code, reloadProjectPanels]);

  const activePanelOptions = useMemo(
    () => buildProjectPanelSelectList(projectPanels),
    [projectPanels],
  );

  useEffect(() => {
    if (!selectedPanelId || projectPanels.length === 0) return;
    if (projectPanels.some(p => p.id === selectedPanelId)) return;
    setSelectedPanelId('');
  }, [selectedPanelId, projectPanels]);

  // Normalize a code segment: uppercase, strip everything but A-Z0-9 (no spaces / separators).
  // "Al Quoz" -> "ALQUOZ", "132 kV" -> "132KV". Keeps the "_" segment structure intact.
  const norm = (s: string) => s.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');

  const { location, region } = parseLocationRegion(form.locationRegion);
  const { year: parsedYear } = parseMonthYear(form.monthYear);

  const primaryPanel = panels[0];
  const codeVoltage = norm(primaryPanel?.voltageLevel ?? '');

  // Project code = VOLTAGE_REGION_LOCATION_YEAR_SEQ (seq zero-padded to 3)
  const seqDigits = (form.seq || '').replace(/\D/g, '');
  const seq3 = seqDigits ? seqDigits.padStart(3, '0').slice(-3) : '';
  const codeSegs = [codeVoltage, norm(region), norm(location), norm(parsedYear), seq3];
  const computedCode = codeSegs.join('_');
  const codeComplete = codeSegs.every(Boolean);
  const panelsValid = panels.length > 0 && panels.every(p => !!p.name.trim() && !!norm(p.voltageLevel));
  // Project details must be valid before any panel can be added (project-first workflow).
  const projectDetailsReady = !!form.displayName.trim() && !!form.client.trim();
  const numberingTaken = numberingCheck?.code === computedCode && !numberingCheck.available;
  const canCreate = codeComplete && projectDetailsReady && panelsValid && !numberingTaken;

  const generatedName = primaryPanel
    ? buildProjectReferenceTitle(
        form.displayName,
        form.client,
        panelNameTypeLabel(primaryPanel),
        primaryPanel.voltageLevel,
        form.locationRegion,
        form.monthYear,
      )
    : '';

  // Per-field validation errors — only shown after first submit attempt
  const fe = submitted ? {
    displayName: !form.displayName.trim() ? 'Required' : '',
    client: !form.client.trim() ? 'Required' : '',
    locationRegion: !norm(location) || !norm(region) ? 'Use format: Location / Region' : '',
    monthYear: !norm(parsedYear) ? 'Include a year (e.g. July 2026)' : '',
    seq: !seq3
      ? 'Required (digits only)'
      : numberingTaken
        ? numberingCheck?.reason ?? 'This project numbering is already used'
        : '',
    panels: panels.length === 0 ? 'Add at least one panel' : '',
  } : {
    displayName: '', client: '', locationRegion: '', monthYear: '',
    seq: numberingTaken ? numberingCheck?.reason ?? 'This project numbering is already used' : '',
    panels: '',
  };

  const validationHint = submitted && !canCreate
    ? (() => {
        const missing: string[] = [];
        if (!form.displayName.trim()) missing.push('project / substation name');
        if (!form.client.trim()) missing.push('client');
        if (panels.length === 0) missing.push('at least one panel');
        if (!norm(location) || !norm(region)) missing.push('location / region');
        if (!norm(parsedYear)) missing.push('month / year');
        if (!seq3) missing.push('project numbering');
        if (numberingTaken) missing.push('a unique project numbering');
        return missing.length
          ? `Complete required fields: ${missing.join(', ')}.`
          : 'Complete all required fields before creating.';
      })()
    : '';

  // Project numbering must be unique across active, deleted, and tombstoned projects.
  // The backend stays authoritative on create; this only surfaces the clash early.
  useEffect(() => {
    if (!showCreate || !codeComplete) {
      setNumberingCheck(null);
      return;
    }
    const timer = setTimeout(async () => {
      const request = numberingRequests.begin();
      try {
        const result = await projectsApi.codeAvailable(computedCode, request.signal);
        if (numberingRequests.isLatest(request.id)) setNumberingCheck(result);
      } catch {
        if (numberingRequests.isLatest(request.id)) setNumberingCheck(null);
      }
    }, 350);
    return () => clearTimeout(timer);
  }, [showCreate, codeComplete, computedCode, numberingRequests]);

  const openCreateModal = () => {
    resetCreateForm();
    setShowCreate(true);
  };

  /** Open the Add Panel overlay — new draft, or an existing pending panel for editing. */
  const openPanelOverlay = (existing?: PanelDraft) => {
    setPanelDraft(existing ?? newPanelDraft({ voltageLevel: panels[0]?.voltageLevel ?? '' }));
  };

  /** Confirm the overlay: replaces the pending panel when editing, appends when new. */
  const commitPanelDraft = (draft: PanelDraft) => {
    setPanels(prev => prev.some(p => p.key === draft.key)
      ? prev.map(p => (p.key === draft.key ? draft : p))
      : [...prev, draft]);
    setPanelDraft(null);
  };

  // Removing a pending panel only affects this unsaved form — never a saved project.
  const removePendingPanel = (key: string) => setPanels(prev => prev.filter(p => p.key !== key));

  const handleProjectDropdownChange = (code: string) => {
    if (!code) {
      setSelectedProject(null);
      setSelectedPanelId('');
      setProjectPanels([]);
      setLoadingPanels(false);
      return;
    }
    if (selectedProject?.code === code) return;
    const project = projects.find(p => p.code === code);
    if (!project) return;
    setLoadingPanels(true);
    setProjectPanels([]);
    setSelectedProject(project);
    setSelectedPanelId('');
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
    if (!selectedProject || !selectedPanelId || generatingReport) return;
    setGeneratingReport(true);
    setReportMenuOpen(false);
    const panelName = projectPanels.find(p => p.id === selectedPanelId)?.panel_name ?? 'Panel';
    try {
      const isPdf = format === 'pdf';
      const blob: Blob = isPdf
        ? await projectsApi.reportPdf(selectedProject.code, selectedPanelId)
        : await supervisorApi.panelReportXlsx(selectedProject.code, selectedPanelId);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = buildPanelReportFilename({
        projectCode: selectedProject.code,
        panelName,
        ext: isPdf ? 'pdf' : 'xlsx',
      });
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
      const projectName = form.displayName.trim();
      const created = await projectsApi.create({
        code: computedCode,
        client: form.client.trim(),
        name: projectName,
        description: encodeProjectMeta({
          locationRegion: form.locationRegion.trim(),
          monthYear: form.monthYear.trim(),
        }),
        sequence: parseInt(seq3, 10) || 1,
        panels: panels.map(panelDraftToApiPayload),
      });
      setProjects(prev => [...prev, created]);
      emitFramesChanged({ projectCode: created.code, action: 'created' });
      setSelectedProject(created);
      setSelectedPanelId('');
      setLoadingPanels(true);
      setProjectPanels([]);
      if (user?.id) {
        setSessionProject({
          code: created.code,
          name: created.name,
          client: created.client,
          project_state: created.project_state,
          is_active: created.is_active,
        }, user.id);
      }
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
        setError(`Code ${computedCode} already exists — project numbering auto-updated to ${nextSeq}. Review the preview and click Create again.`);
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

  const handleDelete = (project: Project) => {
    setDeleteProjectTarget(project);
    setDeleteProjectConfirmed(false);
  };

  const handlePermanentDeleteConfirm = async () => {
    if (!deleteProjectTarget || !deleteProjectConfirmed) return;
    const project = deleteProjectTarget;
    setDeleting(true);
    try {
      await projectsApi.remove(project.code);
      const remaining = projects.filter(item => item.code !== project.code);
      const nextProject = remaining[0] ?? null;
      setProjects(remaining);
      emitFramesChanged({ projectCode: project.code, entity: 'project', action: 'deleted' });
      if (selectedProject?.code === project.code) {
        setSelectedProject(nextProject);
        setSelectedPanelId('');
        setProjectPanels([]);
        if (user?.id) {
          if (nextProject) {
            setSessionProject({
              code: nextProject.code,
              name: nextProject.name,
              client: nextProject.client,
              project_state: nextProject.project_state,
              is_active: nextProject.is_active,
            }, user.id);
          } else {
            clearSessionProject(user.id);
          }
        }
      }
      await load();
      setDeleteProjectTarget(null);
      setDeleteProjectConfirmed(false);
      setToast({ message: 'Project permanently deleted.', tone: 'success' });
    } catch (e: any) {
      await dialog.alert({
        title: 'Delete Failed',
        message: e?.response?.data?.message || 'Could not permanently delete project. Please try again.',
        tone: 'error',
      });
    } finally {
      setDeleting(false);
    }
  };

  const handleDeletePanel = (panel: FramePanel) => {
    if (!selectedProject) return;
    setDeletingPanelId(panel.id);
    setDeletePanelTarget(panel);
  };

  const handlePanelDeleted = async (panelId: string) => {
    if (!selectedProject) return;
    const panel = projectPanels.find(p => p.id === panelId);
    const remainingPanels = projectPanels.filter(item => item.id !== panelId);
    setProjectPanels(remainingPanels);
    setSelectedPanelId(prev => (prev === panelId ? (remainingPanels[0]?.id ?? '') : prev));
    setShowWiringView(false);
    setShowGaDrawingView(false);
    setReportMenuOpen(false);
    emitFramesChanged({ projectCode: selectedProject.code, frameId: panelId, entity: 'panel', action: 'deleted' });
    await reloadProjectPanels(selectedProject.code);
    closeDeletePanelModal();
    setToast({
      message: panel ? `Panel "${panel.panel_name}" deleted.` : 'Panel deleted.',
      tone: 'success',
    });
  };

  const closeDeletePanelModal = () => {
    setDeletePanelTarget(null);
    setDeletingPanelId(null);
  };

  const selectedPanel = projectPanels.find(p => p.id === selectedPanelId)
    ?? activePanelOptions.find(p => p.id === selectedPanelId);
  const {
    drawing: drawingDoc,
    wiring: wiringDoc,
    refresh,
  } = useProjectPanelDocumentStatus(selectedProject?.code, selectedPanelId || undefined);
  const drawingReady = drawingDoc.availability === 'available' && !!drawingDoc.drawing;
  const drawingLoading = drawingDoc.availability === 'loading';
  const wiringReady = wiringDoc.availability === 'available';
  const wiringLoading = wiringDoc.availability === 'loading';
  const projectDetails = selectedProject ? resolveProjectCardDetails(selectedProject) : null;
  const {
    duplicateKeys,
    blocked: duplicateBlocked,
    actionGated,
    reportGated,
  } = usePanelDuplicateGuard(
    projectPanels,
    selectedPanelId,
    selectedPanel?.panel_name,
    duplicateBannerDismissed,
  );
  const gateHint = loading
    ? 'Loading projects from the database…'
    : !selectedProject
    ? 'Select a project and panel to enable wiring upload, drawing upload, and reports.'
    : loadingPanels
      ? 'Loading panels for this project…'
      : projectPanels.length === 0
        ? 'No Panels Available — add a panel when creating or editing the project.'
        : !selectedPanelId
          ? 'Select a panel to enable wiring upload, drawing upload, and reports.'
          : duplicateBlocked && !duplicateBannerDismissed
            ? 'Resolve duplicate panel names before wiring upload, drawing upload, reports, or workflow.'
            : '';

  return (
    <div className="flex flex-col gap-4 min-w-0">
      <div className="pj-project-select-row">
        <div className="pj-project-select-field">
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
            <option value="">{loading ? 'Loading projects…' : projects.length === 0 ? 'No Project Available' : 'Select a project…'}</option>
            {projects.map(p => (
              <option key={p.code} value={p.code}>
                {projectSelectLabel(p)}
              </option>
            ))}
          </select>
        </div>
        <div className="pj-project-select-field">
          <label htmlFor="pj-active-panel" className="text-[12px] font-semibold uppercase tracking-wide text-slate-500">
            Active panel
          </label>
          <select
            id="pj-active-panel"
            className="pj-panel-select"
            value={selectedPanelId}
            onChange={e => setSelectedPanelId(e.target.value)}
            disabled={!selectedProject || loadingPanels || activePanelOptions.length === 0}
            aria-busy={loadingPanels}
          >
            <option value="">
              {loadingPanels ? 'Loading panels…' : activePanelOptions.length === 0 ? 'No Panels Available' : 'Select a panel…'}
            </option>
            {activePanelOptions.map(panel => (
              <option key={panel.id} value={panel.id}>
                {compactPanelDisplayName(panel.panel_name)}
              </option>
            ))}
          </select>
        </div>
        {gateHint && (
          <p className="pj-action-hint">{gateHint}</p>
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
              onClick={() => {
                setDuplicateBannerDismissed(false);
                setShowWiringUpload(true);
              }}
              disabled={!actionGated}
              className="pj-btn-primary pj-action-btn"
              title={actionGated ? `Wiring schedule for ${selectedPanel!.panel_name}` : gateHint || 'Select a project and panel first'}
            >
              <FileSpreadsheet size={16} strokeWidth={1.5} />
              <span>Wiring Upload</span>
            </button>
          )}

          {perms.canManageProjects && onOpenTechnicianWorkflow && (
            <button
              type="button"
              onClick={() => onOpenTechnicianWorkflow({
                section: 'assign',
                projectCode: selectedProject!.code,
                panelId: selectedPanelId,
                projectName: selectedProject!.name,
                panelName: selectedPanel!.panel_name,
                cableCount: selectedPanel!.cable_count,
              })}
              disabled={!actionGated}
              className="pj-btn-primary pj-action-btn"
              title={actionGated ? `Workflow for ${selectedPanel!.panel_name}` : gateHint || 'Select a project and panel first'}
            >
              <UserCog size={16} strokeWidth={1.5} />
              <span>Workflow</span>
            </button>
          )}

          {perms.canManageProjects && (
            <button
              type="button"
              onClick={() => {
                setDuplicateBannerDismissed(false);
                setShowGaDrawingView(true);
              }}
              disabled={!actionGated}
              className="pj-btn-primary pj-action-btn"
              title={actionGated ? `Upload drawing for ${selectedPanel!.panel_name}` : gateHint || 'Select a project and panel first'}
            >
              <FileText size={16} strokeWidth={1.5} />
              <span>Drawing</span>
            </button>
          )}

          {perms.canManageProjects && (
            <div className="pj-action-block pj-action-block--menu" ref={reportMenuRef}>
              <button
                type="button"
                onClick={() => reportGated && setReportMenuOpen(o => !o)}
                disabled={!reportGated || generatingReport}
                className="pj-btn-primary pj-action-btn w-full"
                aria-expanded={reportMenuOpen}
                aria-haspopup="menu"
                title={reportGated ? 'Export panel reports' : gateHint || 'Select a project and panel first'}
              >
                <FileDown size={16} strokeWidth={1.5} />
                <span>{generatingReport ? 'Generating…' : 'Reports'}</span>
                <ChevronDown size={14} strokeWidth={1.5} className={`ml-auto shrink-0 transition-transform ${reportMenuOpen ? 'rotate-180' : ''}`} />
              </button>
              {reportMenuOpen && reportGated && (
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
              <span>Users</span>
            </button>
          )}
        </div>
      </section>

      {selectedProject && duplicateKeys.size > 0 && !duplicateBannerDismissed && (
        <DuplicatePanelWarning
          panels={projectPanels}
          selectedPanelId={selectedPanelId}
          onDismiss={handleDismissDuplicateWarning}
          onEditPanel={panelId => {
            const panel = projectPanels.find(p => p.id === panelId);
            if (panel) setShowEditPanel(panel);
          }}
          onSelectPanel={setSelectedPanelId}
        />
      )}

      {selectedProject && projectDetails && (
        <section className="pj-project-info-card" aria-label="Project and panel information">
          <div className="pj-project-info-card-header">
            <div className="pj-project-info-card-project min-w-0 flex-1">
              <div className="pj-project-info-card-title-row">
                <h3 className="pj-project-info-card-heading">Project information</h3>
                {sessionCode === selectedProject.code && (
                  <span className="pj-selected-badge">Active</span>
                )}
              </div>
            </div>
            {perms.canManageProjects && (
              <div className="pj-project-info-card-actions-wrap">
                <div className="pj-doc-status-row" aria-label="Document availability">
                  <DocumentAvailabilityBadge label="Drawing" status={drawingDoc} />
                  <DocumentAvailabilityBadge label="Wiring Schedule" status={wiringDoc} />
                </div>
                <div className="pj-project-info-card-actions" role="group" aria-label="Project actions">
                  <button
                    type="button"
                    className="pj-info-action pj-info-action--secondary"
                    onClick={() => setShowAddPanel(true)}
                    title="Add a new panel to this project"
                  >
                    <Plus size={16} strokeWidth={1.75} aria-hidden />
                    <span>Add Panel</span>
                  </button>
                  <button
                    type="button"
                    className={`pj-info-action pj-info-action--wiring${wiringLoading ? ' btn--loading' : ''}${!wiringReady && !wiringLoading ? ' pj-info-action--unavailable' : ''}`}
                    onClick={() => {
                      if (wiringDoc.availability === 'error') {
                        setToast({ message: wiringDoc.message ?? 'Failed to open wiring schedule.', tone: 'warn' });
                        return;
                      }
                      if (wiringReady) setShowWiringView(true);
                    }}
                    disabled={!wiringReady || wiringLoading}
                    aria-busy={wiringLoading || undefined}
                    title={
                      wiringLoading
                        ? 'Checking wiring schedule…'
                        : wiringDoc.availability === 'error'
                          ? wiringDoc.message ?? 'Wiring schedule check failed'
                          : wiringDoc.availability === 'missing' && wiringDoc.message === 'Select a panel first'
                            ? 'Select a panel first'
                            : !wiringReady
                              ? 'No Wiring Schedule Uploaded'
                              : `Open Digital Wiring View for ${selectedPanel?.panel_name ?? 'panel'} (read-only)`
                    }
                  >
                    {wiringLoading ? <span className="btn-spinner" aria-hidden /> : <LayoutGrid size={16} strokeWidth={1.75} aria-hidden />}
                    <span>Digital Wiring View</span>
                  </button>
                  <button
                    type="button"
                    className={`pj-info-action pj-info-action--drawing${drawingLoading ? ' btn--loading' : ''}`}
                    onClick={() => {
                      if (drawingDoc.availability === 'error') {
                        setToast({ message: drawingDoc.message ?? 'Failed to open drawing.', tone: 'warn' });
                        return;
                      }
                      setShowGaDrawingView(true);
                    }}
                    disabled={!selectedPanel || drawingLoading}
                    aria-busy={drawingLoading || undefined}
                    title={
                      drawingLoading
                        ? 'Checking drawings…'
                        : !selectedPanel
                          ? 'Select a panel first'
                          : drawingReady
                            ? `2D drawing and 3D model for ${selectedPanel.panel_name}`
                            : `Upload or view drawings for ${selectedPanel.panel_name}`
                    }
                  >
                    {drawingLoading ? <span className="btn-spinner" aria-hidden /> : <FileText size={16} strokeWidth={1.75} aria-hidden />}
                    <span>Drawing View</span>
                  </button>

                  <div className="pj-info-action-menu" ref={editMenuRef}>
                    <button
                      type="button"
                      className="pj-info-action pj-info-action--edit"
                      onClick={() => setEditMenuOpen(open => !open)}
                      disabled={deleting || deletingPanelId !== null}
                      aria-expanded={editMenuOpen}
                      aria-haspopup="menu"
                      title="Edit project and panels, or delete this project"
                    >
                      {(deleting || deletingPanelId !== null)
                        ? <span className="btn-spinner" aria-hidden />
                        : <Pencil size={16} strokeWidth={1.75} aria-hidden />}
                      <span>Edit</span>
                      <ChevronDown
                        size={14}
                        strokeWidth={2}
                        aria-hidden
                        className={`pj-info-action-caret${editMenuOpen ? ' is-open' : ''}`}
                      />
                    </button>

                    {editMenuOpen && (
                      <div className="pj-toolbar-dropdown pj-edit-menu" role="menu" aria-label="Project management">
                        <span className="pj-edit-menu-label">Project</span>
                        <button
                          type="button"
                          role="menuitem"
                          className="pj-toolbar-dropdown-item"
                          onClick={() => { setEditMenuOpen(false); setShowEdit(selectedProject); }}
                        >
                          <FolderKanban size={16} strokeWidth={1.5} className="shrink-0 text-slate-500" />
                          <span>Edit project information</span>
                        </button>

                        <span className="pj-edit-menu-label">Panel</span>
                        <button
                          type="button"
                          role="menuitem"
                          className="pj-toolbar-dropdown-item"
                          disabled={!selectedPanel}
                          onClick={() => {
                            if (!selectedPanel) return;
                            setEditMenuOpen(false);
                            setShowEditPanel(selectedPanel);
                          }}
                          title={selectedPanel ? undefined : 'Select a panel first'}
                        >
                          <LayoutGrid size={16} strokeWidth={1.5} className="shrink-0 text-slate-500" />
                          <span>Edit panel information</span>
                        </button>
                        <button
                          type="button"
                          role="menuitem"
                          className="pj-toolbar-dropdown-item pj-toolbar-dropdown-item--danger"
                          disabled={!selectedPanel || deletingPanelId !== null}
                          onClick={() => {
                            if (!selectedPanel) return;
                            setEditMenuOpen(false);
                            handleDeletePanel(selectedPanel);
                          }}
                          title={selectedPanel ? 'Remove this panel' : 'Select a panel first'}
                        >
                          <Trash2 size={16} strokeWidth={1.5} className="shrink-0" />
                          <span>Remove panel</span>
                        </button>

                        <div className="pj-edit-menu-divider" aria-hidden />
                        <button
                          type="button"
                          role="menuitem"
                          className="pj-toolbar-dropdown-item pj-toolbar-dropdown-item--danger"
                          disabled={deleting}
                          onClick={() => { setEditMenuOpen(false); handleDelete(selectedProject); }}
                          title="Permanently delete this project and all of its data"
                        >
                          <Trash2 size={16} strokeWidth={1.5} className="shrink-0" />
                          <span>Delete Project Permanently</span>
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="pj-project-info-details-grid">
            <div className="pj-project-info-field">
              <p className="pj-project-info-label">Project / Substation</p>
              <p className="pj-project-info-value" title={projectDetails.substationName}>
                {projectDetails.substationName}
              </p>
            </div>
            <div className="pj-project-info-field">
              <p className="pj-project-info-label">Client</p>
              <p className="pj-project-info-value">{projectDetails.client}</p>
            </div>
            <div className="pj-project-info-field">
              <p className="pj-project-info-label">Location / Region</p>
              <p className="pj-project-info-value">{projectDetails.locationRegion}</p>
            </div>
            <div className="pj-project-info-field">
              <p className="pj-project-info-label">Month / Year</p>
              <p className="pj-project-info-value">{projectDetails.monthYear}</p>
            </div>
            <div className="pj-project-info-field">
              <p className="pj-project-info-label">Project code</p>
              <p className="pj-project-info-value pj-project-info-code" title={projectDetails.projectCode}>
                {projectDetails.projectCode}
              </p>
            </div>
            <div className="pj-project-info-field">
              <p className="pj-project-info-label">Project numbering</p>
              <p className="pj-project-info-value">{projectDetails.projectNumbering}</p>
            </div>
            <div className="pj-project-info-field">
              <p className="pj-project-info-label">Status</p>
              <p className="pj-project-info-value">
                <span
                  data-state={selectedProject.project_state}
                  className="pj-state-badge inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase"
                >
                  {projectDetails.statusLabel}
                </span>
              </p>
            </div>
            <div className="pj-project-info-field">
              <p className="pj-project-info-label">Panels</p>
              <p className="pj-project-info-value">
                {loadingPanels ? '…' : projectPanels.length}
              </p>
            </div>
          </div>

          <div className="pj-project-info-card-divider" aria-hidden />

          <p className="pj-project-info-section-title">Selected panel</p>

          {loadingPanels ? (
            <p className="pj-project-info-empty">Loading panels…</p>
          ) : !selectedPanel ? (
            <div className="pj-project-info-empty">
              {projectPanels.length === 0 ? (
                <>
                  No Panels Available
                  <p className="pj-project-info-empty-hint">
                    Project &ldquo;{projectDetails.substationName}&rdquo; remains active. Add a panel to continue.
                  </p>
                </>
              ) : (
                <>
                  Select a panel
                  <p className="pj-project-info-empty-hint">
                    Choose a panel from Active panel above to view panel details and enable uploads.
                  </p>
                </>
              )}
            </div>
          ) : (
            <div className="pj-project-info-grid">
              <div className="pj-project-info-field">
                <p className="pj-project-info-label">Panel name</p>
                <p className="pj-project-info-value" title={selectedPanel.panel_name}>
                  {compactPanelDisplayName(selectedPanel.panel_name)}
                </p>
              </div>
              <div className="pj-project-info-field">
                <p className="pj-project-info-label">Panel type</p>
                <p className="pj-project-info-value">
                  {panelMetaValue(selectedPanel.panel_type as string | null | undefined)}
                </p>
              </div>
              <div className="pj-project-info-field">
                <p className="pj-project-info-label">Voltage level</p>
                <p className="pj-project-info-value">
                  {panelVoltageDisplay(selectedPanel, selectedProject.code)}
                </p>
              </div>
              <div className="pj-project-info-field">
                <p className="pj-project-info-label">System type</p>
                <p className="pj-project-info-value">
                  {panelMetaValue(selectedPanel.system_type as string | null | undefined)}
                </p>
              </div>
            </div>
          )}

          {selectedPanel && perms.canManageProjects && (
            <WiringScheduleStatus
              status={wiringDoc}
              onUpload={() => {
                setDuplicateBannerDismissed(false);
                setShowWiringUpload(true);
              }}
              onReupload={() => setConfirmReupload(true)}
              disabled={!actionGated}
              disabledHint={gateHint}
            />
          )}
        </section>
      )}

      {showTeam && <TeamManagementModal onClose={() => setShowTeam(false)} />}

      {showWiringUpload && selectedProject && selectedPanelId && (
        <UploadFrameModal
          projectCode={selectedProject.code}
          projectName={selectedProject.name}
          targetFrameId={selectedPanelId}
          targetPanelName={selectedPanel?.panel_name}
          existingCableCount={selectedPanel?.cable_count ?? 0}
          siblingPanels={projectPanels}
          onEditPanel={panelId => {
            const panel = projectPanels.find(p => p.id === panelId);
            if (panel) {
              setShowWiringUpload(false);
              setShowEditPanel(panel);
            }
          }}
          onSelectPanel={setSelectedPanelId}
          onClose={() => setShowWiringUpload(false)}
          onUploaded={() => {
            setToast({ message: `Wiring schedule uploaded for ${selectedPanel?.panel_name ?? 'panel'}.`, tone: 'success' });
            emitFramesChanged({ projectCode: selectedProject.code, frameId: selectedPanelId, action: 'updated' });
            emitDocumentsChanged({
              projectCode: selectedProject.code,
              frameId: selectedPanelId,
              kind: 'wiring',
              action: 'uploaded',
            });
            refresh({ drawing: false, wiring: true, showLoading: false });
            reloadProjectPanels(selectedProject.code);
          }}
        />
      )}

      {confirmReupload && selectedProject && selectedPanel && (
        <Modal
          title="Replace Wiring Schedule"
          size="default"
          onClose={() => setConfirmReupload(false)}
          footer={(
            <div className="flex items-center justify-end gap-3 w-full">
              <button type="button" className="btn-secondary" onClick={() => setConfirmReupload(false)}>
                Cancel
              </button>
              <button
                type="button"
                className="btn-primary"
                onClick={() => {
                  setConfirmReupload(false);
                  setDuplicateBannerDismissed(false);
                  setShowWiringUpload(true);
                }}
              >
                <FileSpreadsheet size={16} strokeWidth={1.5} />
                Continue to Upload
              </button>
            </div>
          )}
        >
          <div className="flex flex-col gap-3">
            <p className="text-[13px] text-slate-700">
              The wiring schedule for <strong>{selectedProject.name}</strong> ·{' '}
              <strong>{compactPanelDisplayName(selectedPanel.panel_name)}</strong> will be replaced.
            </p>
            {wiringDoc.fileName && (
              <p className="text-[13px] text-slate-500">
                Current file: <span className="font-medium text-slate-700">{wiringDoc.fileName}</span>
              </p>
            )}
            <p className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-[12px] text-blue-800">
              The existing schedule stays in place until the new file passes validation and you confirm
              the upload. If validation or upload fails, nothing is changed.
            </p>
          </div>
        </Modal>
      )}

      {showWiringView && selectedProject && selectedPanelId && selectedPanel && (
        <PanelWiringViewModal
          projectCode={selectedProject.code}
          frameId={selectedPanelId}
          panelLabel={selectedPanel.panel_name}
          onClose={() => setShowWiringView(false)}
        />
      )}

      {showGaDrawingView && selectedProject && selectedPanelId && selectedPanel && (
        <PanelGaDrawingModal
          projectCode={selectedProject.code}
          frameId={selectedPanelId}
          panelName={selectedPanel.panel_name}
          projectName={selectedProject.name}
          onClose={() => setShowGaDrawingView(false)}
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
          size="wide"
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
            className="pj-create-project-form"
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

            <section className="pj-create-section">
              <h3 className="pj-create-section-title">Project details</h3>

              <div className="pj-create-grid-2">
                <InputField
                  label="Project / Substation Name *"
                  icon={<FolderKanban size={18} strokeWidth={1.5} />}
                  value={form.displayName}
                  onChange={value => setForm(s => ({ ...s, displayName: value }))}
                  placeholder="e.g. CPR — 132/11kV Al Quoz Main"
                  error={fe.displayName}
                />
                <ComboField
                  label="Client *"
                  icon={<Building2 size={18} strokeWidth={1.5} />}
                  value={form.client}
                  onChange={value => setForm(s => ({ ...s, client: value }))}
                  options={CLIENTS}
                  placeholder="Pick or type a client"
                  error={fe.client}
                />
              </div>

              <div className="pj-create-panels-block">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h4 className="text-[12px] font-bold uppercase tracking-[0.06em] text-slate-600 m-0">
                      Panels
                      <span className="ml-2 font-medium normal-case tracking-normal text-slate-400">
                        {panels.length} {panels.length === 1 ? 'panel' : 'panels'}
                      </span>
                    </h4>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      {projectDetailsReady
                        ? 'Add each panel of this project. Panel 1 voltage is used in the project identifier.'
                        : 'Enter the Project / Substation Name and Client to start adding panels.'}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => openPanelOverlay()}
                    className="pj-btn-secondary shrink-0"
                    disabled={!projectDetailsReady}
                    title={projectDetailsReady ? 'Add a panel to this project' : 'Enter the project name and client first'}
                  >
                    <Plus size={14} strokeWidth={1.5} />
                    Add Panel
                  </button>
                </div>

                {fe.panels && (
                  <p className="text-[12px] font-medium text-amber-700">{fe.panels}</p>
                )}

                {panels.length === 0 ? (
                  <p className="pj-panel-list-empty">
                    No panels added yet. At least one panel is required to create the project.
                  </p>
                ) : (
                  <ul className="pj-panel-list">
                    {panels.map((panel, idx) => (
                      <li key={panel.key} className="pj-panel-list-row">
                        <span className="pj-panel-list-index">{idx + 1}</span>
                        <span className="pj-panel-list-copy">
                          <strong title={panel.name}>{panel.name}</strong>
                          <span>
                            {[panel.panelType.trim() || 'No type', panel.voltageLevel.trim()]
                              .filter(Boolean)
                              .join(' · ')}
                          </span>
                        </span>
                        <span className="pj-panel-list-actions">
                          <button
                            type="button"
                            onClick={() => openPanelOverlay(panel)}
                            title={`Edit ${panel.name}`}
                            aria-label={`Edit panel ${panel.name}`}
                          >
                            <Pencil size={14} strokeWidth={1.75} />
                          </button>
                          <button
                            type="button"
                            className="is-danger"
                            onClick={() => removePendingPanel(panel.key)}
                            title={`Remove ${panel.name}`}
                            aria-label={`Remove panel ${panel.name}`}
                          >
                            <Trash2 size={14} strokeWidth={1.75} />
                          </button>
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div className="pj-create-grid-2">
                <ComboField
                  label="Location / Region *"
                  icon={<MapPin size={18} strokeWidth={1.5} />}
                  value={form.locationRegion}
                  onChange={value => setForm(s => ({ ...s, locationRegion: value }))}
                  options={LOCATION_REGION_PRESETS}
                  placeholder="DUBAI / UAE"
                  error={fe.locationRegion}
                />
                <ComboField
                  label="Month / Year *"
                  icon={<Calendar size={18} strokeWidth={1.5} />}
                  value={form.monthYear}
                  onChange={value => setForm(s => ({ ...s, monthYear: value }))}
                  options={MONTH_YEAR_PRESETS}
                  placeholder="July 2026"
                  error={fe.monthYear}
                />
              </div>

              <div className="pj-create-grid-2">
                <InputField
                  label="Project Numbering *"
                  icon={<Hash size={18} strokeWidth={1.5} />}
                  value={form.seq}
                  onChange={value => setForm(s => ({ ...s, seq: value }))}
                  placeholder="001"
                  error={fe.seq}
                />
                {codeComplete && numberingCheck?.code === computedCode && numberingCheck.available && (
                  <p className="pj-numbering-ok" role="status">
                    Project numbering {seq3} is available.
                  </p>
                )}
              </div>
            </section>

            <section className="pj-create-section pj-create-previews">
              <div className="pj-create-preview-block">
                <span className="pj-create-preview-label">Final project name</span>
                <div
                  className={`pj-create-preview-value ${generatedName ? 'pj-create-preview-value--ready' : ''}`}
                  title={generatedName || 'Complete the fields above to preview the final project name'}
                >
                  {generatedName || (
                    <span className="text-slate-400 italic font-normal text-[12px]">
                      Complete the project details and add a panel to preview the final project name.
                    </span>
                  )}
                </div>
              </div>
            </section>
          </form>
        </Modal>
      )}

      {panelDraft && (
        <PanelDraftOverlay
          draft={panelDraft}
          isEditing={panels.some(p => p.key === panelDraft.key)}
          siblingNames={panels.filter(p => p.key !== panelDraft.key).map(p => p.name)}
          onCancel={() => setPanelDraft(null)}
          onConfirm={commitPanelDraft}
        />
      )}

      {showEdit && <EditProjectModal project={showEdit} onClose={() => setShowEdit(null)} onSaved={handleEditSaved} />}
      {showAddPanel && selectedProject && (
        <AddPanelModal
          projectCode={selectedProject.code}
          siblingPanels={projectPanels}
          onClose={() => setShowAddPanel(false)}
          onSaved={(panelId) => {
            emitFramesChanged({ projectCode: selectedProject.code, frameId: panelId, action: 'created' });
            reloadProjectPanels(selectedProject.code).then(() => setSelectedPanelId(panelId));
            setShowAddPanel(false);
            setToast({ message: 'Panel added.', tone: 'success' });
          }}
        />
      )}
      {showEditPanel && selectedProject && (
        <EditPanelModal
          projectCode={selectedProject.code}
          panel={showEditPanel}
          siblingPanels={projectPanels}
          onClose={() => setShowEditPanel(null)}
          onSaved={() => {
            const savedId = showEditPanel.id;
            emitFramesChanged({ projectCode: selectedProject.code, frameId: savedId, action: 'updated' });
            reloadProjectPanels(selectedProject.code).then(() => setSelectedPanelId(savedId));
            setShowEditPanel(null);
            setToast({ message: 'Panel updated.', tone: 'success' });
          }}
        />
      )}
      {deletePanelTarget && selectedProject && (
        <DeletePanelConfirmModal
          panel={deletePanelTarget}
          project={selectedProject}
          onClose={closeDeletePanelModal}
          onDeleted={handlePanelDeleted}
        />
      )}
      {deleteProjectTarget && (
        <Modal
          title={PROJECT_DELETE_MODAL_TITLE}
          onClose={() => {
            if (deleting) return;
            setDeleteProjectTarget(null);
            setDeleteProjectConfirmed(false);
          }}
          size="default"
          closeOnBackdrop={!deleting}
          closeOnEscape={!deleting}
          footer={(
            <div className="flex gap-2">
              <button
                type="button"
                className="btn-secondary flex-1"
                onClick={() => {
                  if (deleting) return;
                  setDeleteProjectTarget(null);
                  setDeleteProjectConfirmed(false);
                }}
                disabled={deleting}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn-danger flex-1"
                onClick={() => void handlePermanentDeleteConfirm()}
                disabled={deleting || !deleteProjectConfirmed}
              >
                {deleting ? 'Deleting…' : PROJECT_DELETE_CONFIRM_BUTTON}
              </button>
            </div>
          )}
        >
          <div className="flex flex-col gap-4">
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-3 text-[13px] text-red-800">
              {PROJECT_DELETE_WARNING}
            </div>
            <label className="flex items-start gap-2 text-[13px] text-slate-700">
              <input
                type="checkbox"
                className="mt-0.5"
                checked={deleteProjectConfirmed}
                disabled={deleting}
                onChange={e => setDeleteProjectConfirmed(e.target.checked)}
              />
              <span>{PROJECT_DELETE_CONFIRM_LABEL}</span>
            </label>
          </div>
        </Modal>
      )}
    </div>
  );
}

/**
 * Small Add / Edit Panel overlay for the New Project flow. Deliberately limited to
 * Panel Name, Panel Type, and Voltage Level — System Type is set later, on the panel.
 */
function PanelDraftOverlay({
  draft,
  isEditing,
  siblingNames,
  onCancel,
  onConfirm,
}: {
  draft: PanelDraft;
  isEditing: boolean;
  siblingNames: string[];
  onCancel: () => void;
  onConfirm: (draft: PanelDraft) => void;
}) {
  const [panel, setPanel] = useState<PanelDraft>(draft);
  const [submitted, setSubmitted] = useState(false);

  const normVoltage = panel.voltageLevel.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  const duplicate = (() => {
    const key = compactPanelKey(panel.name);
    return !!key && siblingNames.some(name => compactPanelKey(name) === key);
  })();
  const valid = !!panel.name.trim() && !!normVoltage && !duplicate;

  const errors = submitted
    ? {
        name: !panel.name.trim() ? 'Required' : duplicate ? 'This project already has a panel with this name' : '',
        voltageLevel: !normVoltage ? 'Required' : '',
      }
    : { name: duplicate ? 'This project already has a panel with this name' : '', voltageLevel: '' };

  const handleConfirm = () => {
    setSubmitted(true);
    if (!valid) return;
    onConfirm({ ...panel, name: panel.name.trim() });
  };

  return (
    <Modal
      title={isEditing ? 'Edit Panel' : 'Add Panel'}
      subtitle="Panel name, type, and voltage level"
      size="sm"
      onClose={onCancel}
      footer={(
        <div className="flex items-center justify-end gap-3 w-full">
          <button type="button" className="btn-secondary" onClick={onCancel}>Cancel</button>
          <button type="button" className="btn-primary" onClick={handleConfirm} disabled={submitted && !valid}>
            {isEditing ? 'Save Panel' : 'Add Panel'}
          </button>
        </div>
      )}
    >
      <div className="flex flex-col gap-4">
        <InputField
          label="Panel name *"
          icon={<LayoutGrid size={18} strokeWidth={1.5} />}
          value={panel.name}
          onChange={value => setPanel(prev => ({ ...prev, name: value }))}
          placeholder="e.g. =H001, Bay 1 Protection"
          error={errors.name}
        />
        <InputField
          label="Panel type"
          icon={<Tag size={18} strokeWidth={1.5} />}
          value={panel.panelType}
          onChange={value => setPanel(prev => ({ ...prev, panelType: value }))}
          placeholder="e.g. PROTECTION, CONTROL"
        />
        <ComboField
          label="Voltage level *"
          icon={<Zap size={18} strokeWidth={1.5} />}
          value={panel.voltageLevel}
          onChange={value => setPanel(prev => ({ ...prev, voltageLevel: value }))}
          options={VOLTAGES}
          placeholder="132KV"
          error={errors.voltageLevel}
        />
        <p className="text-[11px] text-slate-400">
          Special characters (including =) are allowed in panel names.
        </p>
      </div>
    </Modal>
  );
}

function formatUploadDate(iso?: string): string {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

/**
 * Compact post-upload wiring-schedule status. The full Excel preview belongs to the
 * upload-and-verify flow only — never to the Project Information card.
 */
function WiringScheduleStatus({
  status,
  onUpload,
  onReupload,
  disabled,
  disabledHint,
}: {
  status: DocumentStatus;
  onUpload: () => void;
  onReupload: () => void;
  disabled: boolean;
  disabledHint?: string;
}) {
  const uploaded = status.availability === 'available';
  const loading = status.availability === 'loading';
  const uploadedAt = formatUploadDate(status.uploadedAt);

  return (
    <div className="pj-wiring-status" aria-label="Wiring schedule status">
      <span className={`pj-wiring-status-dot pj-wiring-status-dot--${status.availability}`} aria-hidden />
      <div className="pj-wiring-status-copy">
        <p className="pj-wiring-status-title">
          {loading
            ? 'Checking wiring schedule…'
            : uploaded
              ? 'Wiring schedule uploaded'
              : status.availability === 'error'
                ? status.message ?? 'Wiring schedule check failed'
                : 'No wiring schedule uploaded'}
        </p>
        {uploaded && (
          <p className="pj-wiring-status-meta">
            {status.fileName && <span title={status.fileName}>{status.fileName}</span>}
            {typeof status.cableCount === 'number' && <span>{status.cableCount} cables</span>}
            {uploadedAt && <span>Uploaded {uploadedAt}</span>}
          </p>
        )}
      </div>
      <button
        type="button"
        className="pj-wiring-status-action"
        onClick={uploaded ? onReupload : onUpload}
        disabled={disabled || loading}
        title={disabled ? disabledHint || 'Select a project and panel first' : undefined}
      >
        <FileSpreadsheet size={14} strokeWidth={1.75} aria-hidden />
        <span>{uploaded ? 'Re-upload Wiring Schedule' : 'Upload Wiring Schedule'}</span>
      </button>
    </div>
  );
}

function PanelDraftFields({
  index,
  panel,
  errors,
  onChange,
  onRemove,
}: {
  index: number;
  panel: PanelDraft;
  errors: { name: string; voltageLevel: string };
  onChange: (patch: Partial<Omit<PanelDraft, 'key'>>) => void;
  onRemove?: () => void;
}) {
  return (
    <div className="pj-panel-draft-card">
      <div className="flex items-center justify-between gap-2 mb-2">
        <span className="text-[12px] font-semibold text-slate-700">Panel {index + 1}</span>
        {onRemove && (
          <button
            type="button"
            onClick={onRemove}
            className="pj-btn-danger-ghost shrink-0"
            title={`Remove panel ${index + 1}`}
            aria-label={`Remove panel ${index + 1}`}
          >
            <Trash2 size={14} strokeWidth={1.5} />
          </button>
        )}
      </div>
      <div className="pj-create-grid-2">
        <InputField
          label="Panel name *"
          icon={<LayoutGrid size={16} strokeWidth={1.5} />}
          value={panel.name}
          onChange={value => onChange({ name: value })}
          placeholder="e.g. =H001, Bay 1 Protection"
          error={errors.name}
        />
        <InputField
          label="Panel type"
          icon={<Tag size={16} strokeWidth={1.5} />}
          value={panel.panelType}
          onChange={value => onChange({ panelType: value })}
          placeholder="e.g. PROTECTION, CONTROL"
        />
        <ComboField
          label="Voltage level *"
          icon={<Zap size={16} strokeWidth={1.5} />}
          value={panel.voltageLevel}
          onChange={value => onChange({ voltageLevel: value })}
          options={VOLTAGES}
          placeholder="132KV"
          error={errors.voltageLevel}
        />
        <InputField
          label="System type"
          icon={<LayoutGrid size={16} strokeWidth={1.5} />}
          value={panel.systemType}
          onChange={value => onChange({ systemType: value })}
          placeholder="e.g. SAS, SCADA, LCC"
        />
      </div>
      {index === 0 && (
        <p className="text-[11px] text-slate-400 mt-1">
          Special characters (including =) are allowed in panel names.
        </p>
      )}
    </div>
  );
}

function AddPanelModal({
  projectCode,
  siblingPanels,
  onClose,
  onSaved,
}: {
  projectCode: string;
  siblingPanels: FramePanel[];
  onClose: () => void;
  onSaved: (panelId: string) => void;
}) {
  const [panel, setPanel] = useState<PanelDraft>(() => newPanelDraft({
    voltageLevel: projectCode.split('_')[0] || '',
  }));
  const [submitted, setSubmitted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const norm = (s: string) => s.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  const wouldDuplicate = (() => {
    const next = compactPanelKey(panel.name);
    if (!next) return false;
    return siblingPanels.some(p => compactPanelKey(p.panel_name) === next);
  })();

  const errors = submitted ? {
    name: !panel.name.trim() ? 'Required' : wouldDuplicate ? 'Duplicate panel name' : '',
    voltageLevel: !norm(panel.voltageLevel) ? 'Required' : '',
  } : { name: '', voltageLevel: '' };

  const canSave = !!panel.name.trim() && !!norm(panel.voltageLevel) && !wouldDuplicate;

  const handleSave = async () => {
    setSubmitted(true);
    if (!canSave) return;
    setSaving(true);
    setError('');
    try {
      const created = await projectsApi.createPanel(projectCode, panelDraftToApiPayload(panel));
      onSaved(String(created.id));
    } catch (apiError: unknown) {
      setError(apiErrorMessage(apiError, 'Failed to add panel.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      title="Add Panel"
      size="wide"
      onClose={onClose}
      closeOnEscape={!saving}
      footer={(
        <div className="flex items-center justify-end gap-3 w-full">
          <button className="btn-secondary" onClick={onClose} type="button" disabled={saving}>
            Cancel
          </button>
          <button className="btn-primary" onClick={handleSave} disabled={saving} type="button">
            {saving ? 'Adding…' : 'Add Panel'}
          </button>
        </div>
      )}
    >
      <div className="flex flex-col gap-4">
        <PanelDraftFields
          index={0}
          panel={panel}
          errors={errors}
          onChange={patch => setPanel(prev => ({ ...prev, ...patch }))}
        />
        {error && (
          <div className="p-3 bg-red-50 text-red-600 text-[13px] font-medium rounded-[10px] border border-red-200">
            {error}
          </div>
        )}
      </div>
    </Modal>
  );
}

function EditPanelModal({
  projectCode,
  panel,
  siblingPanels,
  onClose,
  onSaved,
}: {
  projectCode: string;
  panel: FramePanel;
  siblingPanels: FramePanel[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(panel.panel_name);
  const [panelType, setPanelType] = useState(String(panel.panel_type ?? ''));
  const [voltageLevel, setVoltageLevel] = useState(
    String(panel.voltage_level ?? projectCode.split('_')[0] ?? ''),
  );
  const [systemType, setSystemType] = useState(String(panel.system_type ?? ''));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const wouldDuplicate = (() => {
    const next = compactPanelKey(name);
    if (!next) return false;
    return siblingPanels.some(
      p => p.id !== panel.id && compactPanelKey(p.panel_name) === next,
    );
  })();

  const handleSave = async () => {
    const trimmed = name.trim();
    if (!trimmed) {
      setError('Panel name is required.');
      return;
    }
    if (wouldDuplicate) {
      setError('Duplicate Panel Name Detected — choose a unique name for this project.');
      return;
    }
    if (!voltageLevel.trim()) {
      setError('Voltage level is required.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      await projectsApi.patchPanel(projectCode, panel.id, {
        panel_name: trimmed,
        panel_type: panelType.trim(),
        voltage_level: voltageLevel.trim(),
        system_type: systemType.trim(),
      });
      onSaved();
    } catch (apiError: unknown) {
      setError(apiErrorMessage(apiError, 'Failed to save panel.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      title="Edit Panel"
      onClose={onClose}
      footer={(
        <div className="flex items-center justify-end gap-3 w-full">
          <button className="btn-secondary" onClick={onClose} type="button" disabled={saving}>
            Cancel
          </button>
          <button className="btn-primary" onClick={handleSave} disabled={saving || wouldDuplicate} type="button">
            {saving ? 'Saving…' : 'Save Changes'}
          </button>
        </div>
      )}
    >
      <div className="flex flex-col gap-4">
        <InputField
          label="Panel name *"
          icon={<LayoutGrid size={18} strokeWidth={1.5} />}
          value={name}
          onChange={setName}
          error={wouldDuplicate ? 'Duplicate Panel Name Detected' : ''}
        />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <InputField
            label="Panel type"
            icon={<Tag size={18} strokeWidth={1.5} />}
            value={panelType}
            onChange={setPanelType}
            placeholder="e.g. PROTECTION, CONTROL"
          />
          <ComboField
            label="Voltage level *"
            icon={<Zap size={18} strokeWidth={1.5} />}
            value={voltageLevel}
            onChange={setVoltageLevel}
            options={VOLTAGES}
            placeholder="132KV"
          />
          <InputField
            label="System type"
            icon={<LayoutGrid size={18} strokeWidth={1.5} />}
            value={systemType}
            onChange={setSystemType}
            placeholder="e.g. SAS, SCADA, LCC"
          />
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

function EditProjectModal({ project, onClose, onSaved }: { project: Project; onClose: () => void; onSaved: (updated: Project) => void }) {
  const initialDetails = resolveProjectCardDetails(project);
  const { meta, userNotes } = decodeProjectMeta(project.description);
  const [name, setName] = useState(initialDetails.substationName);
  const [description, setDescription] = useState(userNotes);
  const [state, setState] = useState<ProjectState>(project.project_state);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleSave = async () => {
    setSaving(true);
    setError('');
    try {
      let updated: Project = await projectsApi.update(project.code, {
        name: name.trim(),
        description: mergeProjectDescription(meta, description),
      });
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

        <InputField label="Project / Substation Name" icon={<FolderKanban size={18} strokeWidth={1.5} />} value={name} onChange={setName} />

        <div className="form-group">
          <label className="form-label">Client</label>
          <input value={project.client} title="Client" readOnly className="form-input bg-slate-50 text-slate-500 cursor-not-allowed" disabled />
        </div>

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
