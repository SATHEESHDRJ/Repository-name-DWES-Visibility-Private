import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { projectsApi, supervisorApi } from '../../../services/api';
import type { FramePanel } from '../../../components/assignment/ProjectPanelSelect';
import type { Project, ProjectState } from '../../../types';
import Modal from '../../../components/Modal';
import { InputField, ComboField } from '../../../components/ui/TabletFields';
import { useAppDialog } from '../../../components/AppDialogProvider';
import { usePermissions } from '../../../hooks/usePermissions';
import { useDwesRefresh } from '../../../hooks/useDwesRefresh';
import { Pencil, Trash2, Plus, Building2, Tag, Zap, MapPin, Calendar, Hash, FolderKanban, Users, FileDown, FileSpreadsheet, FileText, ChevronDown, LayoutGrid, UserCog } from '../../../components/ui/icons';
import { UploadFrameModal } from './FramesTab';
import { TeamManagementModal } from './UsersTab';
import PdfDrawingUploadModal from '../../../components/supervisor/PdfDrawingUploadModal';
import PanelDrawingViewModal from '../../../components/supervisor/PanelDrawingViewModal';
import PanelWiringViewModal from '../../../components/supervisor/PanelWiringViewModal';
import DuplicatePanelWarning from '../../../components/supervisor/DuplicatePanelWarning';
import DeletePanelConfirmModal from '../../../components/supervisor/DeletePanelConfirmModal';
import DocumentAvailabilityBadge from '../../../components/supervisor/DocumentAvailabilityBadge';
import { useProjectPanelDocumentStatus } from '../../../hooks/useProjectPanelDocumentStatus';
import Toast, { type ToastTone } from '../../../components/ui/Toast';
import ButtonHintPopover from '../../../components/ui/ButtonHintPopover';
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
  const [showDrawingPicker, setShowDrawingPicker] = useState(false);
  const [drawingUploadType, setDrawingUploadType] = useState<'pdf' | 'dwg' | null>(null);
  const [showDrawingView, setShowDrawingView] = useState(false);
  const [showWiringView, setShowWiringView] = useState(false);
  const [reportMenuOpen, setReportMenuOpen] = useState(false);
  const reportMenuRef = useRef<HTMLDivElement>(null);
  const gaUploadBtnRef = useRef<HTMLButtonElement>(null);
  const [gaUploadHint, setGaUploadHint] = useState<string | null>(null);
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
  const emptyForm: CreateForm = { displayName: '', client: '', locationRegion: '', monthYear: 'July 2026', seq: '001' };
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

  const reloadProjectPanels = useCallback((projectCode: string, options?: { silent?: boolean }) => {
    if (!options?.silent) setLoadingPanels(true);
    return projectsApi.frames(projectCode)
      .then(data => {
        const list = data as FramePanel[];
        setProjectPanels(list);
        setSelectedPanelId(prev => {
          if (prev && list.some(p => p.id === prev)) return prev;
          if (list.length === 1) return list[0].id;
          return '';
        });
      })
      .catch(() => {
        setProjectPanels([]);
        setSelectedPanelId('');
      })
      .finally(() => {
        if (!options?.silent) setLoadingPanels(false);
      });
  }, []);

  useEffect(() => { load(); }, [load]);
  useDwesRefresh(() => {
    pollProjects();
    if (selectedProject?.code) reloadProjectPanels(selectedProject.code, { silent: true });
  });

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
    setDuplicateBannerDismissed(false);
  }, [selectedProject?.code, selectedPanelId]);

  useEffect(() => {
    if (!selectedProject?.code) return;
    return onFramesChanged((detail) => {
      if (detail.projectCode === selectedProject.code) {
        setDuplicateBannerDismissed(false);
      }
    });
  }, [selectedProject?.code]);

  useEffect(() => {
    if (!selectedProject?.code) return;
    return onDocumentsChanged((detail) => {
      if (detail.projectCode !== selectedProject.code) return;
      if (detail.kind === 'drawing' && detail.action === 'deleted') {
        setShowDrawingView(false);
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
    if (!projects.length || !sessionCode || selectedProject) return;
    const match = projects.find((p: Project) => p.code === sessionCode);
    if (!match) return;
    setLoadingPanels(true);
    setProjectPanels([]);
    setSelectedPanelId('');
    setSelectedProject(match);
  }, [projects, sessionCode, selectedProject]);

  useEffect(() => {
    if (!selectedProject?.code) {
      setProjectPanels([]);
      setSelectedPanelId('');
      setLoadingPanels(false);
      return;
    }
    let cancelled = false;
    setLoadingPanels(true);
    projectsApi.frames(selectedProject.code)
      .then(data => {
        if (cancelled) return;
        const list = data as FramePanel[];
        setProjectPanels(list);
        setSelectedPanelId(prev => {
          if (prev && list.some(p => p.id === prev)) return prev;
          if (list.length === 1) return list[0].id;
          return '';
        });
      })
      .catch(() => {
        if (!cancelled) setProjectPanels([]);
      })
      .finally(() => {
        if (!cancelled) setLoadingPanels(false);
      });
    return () => { cancelled = true; };
  }, [selectedProject?.code]);

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
  const canCreate = codeComplete && !!form.displayName.trim() && panelsValid;

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
    locationRegion: !norm(location) || !norm(region) ? 'Use format: Location / Region' : '',
    monthYear: !norm(parsedYear) ? 'Include a year (e.g. July 2026)' : '',
    seq: !seq3 ? 'Required (digits only)' : '',
    panels: panels.length === 0
      ? 'Add at least one panel'
      : panels.some(p => !p.name.trim() || !norm(p.voltageLevel))
        ? 'Each panel needs a name and voltage level'
        : '',
  } : { displayName: '', locationRegion: '', monthYear: '', seq: '', panels: '' };

  const panelFieldErrors = submitted
    ? panels.map(p => ({
        name: !p.name.trim() ? 'Required' : '',
        voltageLevel: !norm(p.voltageLevel) ? 'Required' : '',
      }))
    : panels.map(() => ({ name: '', voltageLevel: '' }));

  const validationHint = submitted && !canCreate
    ? (() => {
        const missing: string[] = [];
        if (!form.displayName.trim()) missing.push('project / substation name');
        if (!panelsValid) missing.push('panel name and voltage for each panel');
        if (!codeVoltage) missing.push('voltage level (panel 1 — used in project code)');
        if (!norm(location) || !norm(region)) missing.push('location / region');
        if (!norm(parsedYear)) missing.push('month / year');
        if (!seq3) missing.push('project numbering');
        return missing.length
          ? `Complete required fields: ${missing.join(', ')}.`
          : 'Complete all required fields before creating.';
      })()
    : '';

  const openCreateModal = () => {
    resetCreateForm();
    setShowCreate(true);
  };

  const addPanel = () => setPanels(prev => [...prev, newPanelDraft({ voltageLevel: prev[0]?.voltageLevel ?? '' })]);
  const removePanel = (key: string) => {
    setPanels(prev => (prev.length <= 1 ? prev : prev.filter(p => p.key !== key)));
  };
  const updatePanel = (key: string, patch: Partial<Omit<PanelDraft, 'key'>>) => {
    setPanels(prev => prev.map(p => (p.key === key ? { ...p, ...patch } : p)));
  };

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
      setProjects(prev => prev.filter(p => p.code !== project.code));
      emitFramesChanged({ projectCode: project.code, action: 'deleted' });
      setSelectedProject(prev => (prev?.code === project.code ? null : prev));
      if (selectedProject?.code === project.code) setSelectedPanelId('');
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
    setProjectPanels(prev => prev.filter(p => p.id !== panelId));
    setSelectedPanelId(prev => (prev === panelId ? '' : prev));
    emitFramesChanged({ projectCode: selectedProject.code, frameId: panelId, action: 'deleted' });
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
  const gaUploadSelectionReady = Boolean(
    selectedProject && selectedPanelId && !loadingPanels && projectPanels.length > 0,
  );
  const gaUploadDisabled = gaUploadSelectionReady && !actionGated;
  const gateHint = !selectedProject
    ? 'Select a project and panel to enable wiring upload, GA upload, and reports.'
    : loadingPanels
      ? 'Loading panels for this project…'
      : projectPanels.length === 0
        ? 'No Panels Available — add a panel when creating or editing the project.'
        : !selectedPanelId
          ? 'Select a panel to enable wiring upload, GA upload, and reports.'
          : duplicateBlocked && !duplicateBannerDismissed
            ? 'Resolve duplicate panel names before wiring upload, GA upload, reports, or workflow.'
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
            <option value="">Select a project…</option>
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
              ref={gaUploadBtnRef}
              type="button"
              onClick={() => {
                if (!gaUploadSelectionReady) {
                  setGaUploadHint(
                    gateHint
                      || (!selectedProject
                        ? 'Select a project first.'
                        : !selectedPanelId
                          ? 'Select a panel first.'
                          : 'Select a project and panel first.'),
                  );
                  return;
                }
                setDuplicateBannerDismissed(false);
                setShowDrawingPicker(true);
              }}
              disabled={gaUploadDisabled}
              className="pj-btn-primary pj-action-btn"
              title={actionGated ? `Upload GA drawing for ${selectedPanel!.panel_name}` : gateHint || 'Select a project and panel first'}
            >
              <FileText size={16} strokeWidth={1.5} />
              <span>GA Upload</span>
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
                  <DocumentAvailabilityBadge label="GA Drawing" status={drawingDoc} />
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
                  className={`pj-info-action pj-info-action--drawing${drawingLoading ? ' btn--loading' : ''}${!drawingReady && !drawingLoading ? ' pj-info-action--unavailable' : ''}`}
                  onClick={() => {
                    if (drawingDoc.availability === 'error') {
                      setToast({ message: drawingDoc.message ?? 'Failed to open GA drawing.', tone: 'warn' });
                      return;
                    }
                    if (drawingReady) setShowDrawingView(true);
                  }}
                  disabled={!drawingReady || drawingLoading}
                  aria-busy={drawingLoading || undefined}
                  title={
                    drawingLoading
                      ? 'Checking GA drawings…'
                      : drawingDoc.availability === 'error'
                        ? drawingDoc.message ?? 'GA drawing check failed'
                        : drawingReady
                          ? `View GA drawing: ${drawingDoc.drawing!.original_name}`
                          : 'No GA Drawing Uploaded'
                  }
                >
                  {drawingLoading ? <span className="btn-spinner" aria-hidden /> : <FileText size={16} strokeWidth={1.75} aria-hidden />}
                  <span>GA View</span>
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
                            : `Open Digital Wiring Monitor for ${selectedPanel?.panel_name ?? 'panel'} (read-only)`
                  }
                >
                  {wiringLoading ? <span className="btn-spinner" aria-hidden /> : <LayoutGrid size={16} strokeWidth={1.75} aria-hidden />}
                  <span>Digital Wiring Monitor</span>
                </button>
                <button
                  type="button"
                  className="pj-info-action pj-info-action--secondary"
                  onClick={() => {
                    if (selectedPanel) setShowEditPanel(selectedPanel);
                    else setShowEdit(selectedProject);
                  }}
                  disabled={!selectedPanel && loadingPanels}
                  title={selectedPanel ? 'Edit panel details' : 'Edit project'}
                >
                  <Pencil size={16} strokeWidth={1.75} aria-hidden />
                  <span>{selectedPanel ? 'Edit' : 'Edit Project'}</span>
                </button>
                <button
                  type="button"
                  disabled={deleting || deletingPanelId !== null || (!selectedPanel && loadingPanels)}
                  className={`pj-info-action pj-info-action--danger${(deleting || deletingPanelId !== null) ? ' btn--loading' : ''}`}
                  onClick={() => {
                    if (selectedPanel) handleDeletePanel(selectedPanel);
                    else handleDelete(selectedProject);
                  }}
                  title={selectedPanel ? 'Delete selected panel' : 'Remove project'}
                >
                  {(deleting || deletingPanelId !== null) ? <span className="btn-spinner" aria-hidden /> : <Trash2 size={16} strokeWidth={1.75} aria-hidden />}
                  <span>{selectedPanel ? 'Delete' : 'Remove'}</span>
                </button>
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
        </section>
      )}

      {showTeam && <TeamManagementModal onClose={() => setShowTeam(false)} />}

      {showDrawingPicker && selectedProject && (
        <Modal
          title="GA Upload"
          onClose={() => setShowDrawingPicker(false)}
          size="sm"
          footer={(
            <button type="button" className="btn-secondary" onClick={() => setShowDrawingPicker(false)}>
              Cancel
            </button>
          )}
        >
          <p className="text-[13px] text-slate-600 mb-4">
            Choose the GA drawing file type for <strong>{selectedPanel?.panel_name ?? selectedProject.name}</strong>
            {selectedPanel ? ` (${selectedProject.name})` : ''}.
          </p>
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              className="flex flex-col items-center gap-2 p-4 rounded-xl border border-slate-200 hover:border-blue-400 hover:bg-blue-50 transition-colors min-h-12"
              onClick={() => { setShowDrawingPicker(false); setDrawingUploadType('pdf'); }}
            >
              <FileText size={24} className="text-red-500" />
              <span className="text-[13px] font-semibold">PDF</span>
            </button>
            <button
              type="button"
              className="flex flex-col items-center gap-2 p-4 rounded-xl border border-slate-200 hover:border-blue-400 hover:bg-blue-50 transition-colors min-h-12"
              onClick={() => { setShowDrawingPicker(false); setDrawingUploadType('dwg'); }}
            >
              <FileText size={24} className="text-blue-600" />
              <span className="text-[13px] font-semibold">DWG</span>
            </button>
          </div>
        </Modal>
      )}

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

      {drawingUploadType && selectedProject && selectedPanelId && (
        <PdfDrawingUploadModal
          projectCode={selectedProject.code}
          projectName={selectedProject.name}
          panelName={selectedPanel?.panel_name}
          panelId={selectedPanelId}
          siblingPanels={projectPanels}
          onEditPanel={panelId => {
            const panel = projectPanels.find(p => p.id === panelId);
            if (panel) {
              setDrawingUploadType(null);
              setShowEditPanel(panel);
            }
          }}
          onSelectPanel={setSelectedPanelId}
          fileType={drawingUploadType}
          onClose={() => setDrawingUploadType(null)}
          onUploaded={() => {
            setToast({ message: `${drawingUploadType.toUpperCase()} GA drawing uploaded.`, tone: 'success' });
            if (selectedProject) {
              emitDocumentsChanged({
                projectCode: selectedProject.code,
                frameId: selectedPanelId,
                kind: 'drawing',
                action: 'uploaded',
              });
              refresh({ drawing: true, wiring: false, showLoading: false });
            }
          }}
        />
      )}

      {showDrawingView && selectedProject && drawingDoc.drawing && (
        <PanelDrawingViewModal
          projectCode={selectedProject.code}
          drawing={drawingDoc.drawing}
          panelLabel={selectedPanel?.panel_name ?? selectedProject.name}
          canDownload={perms.canManageProjects}
          onClose={() => setShowDrawingView(false)}
        />
      )}

      {showWiringView && selectedProject && selectedPanelId && selectedPanel && (
        <PanelWiringViewModal
          projectCode={selectedProject.code}
          frameId={selectedPanelId}
          panelLabel={selectedPanel.panel_name}
          onClose={() => setShowWiringView(false)}
        />
      )}

      {gaUploadHint && (
        <ButtonHintPopover
          anchorEl={gaUploadBtnRef.current}
          message={gaUploadHint}
          onDismiss={() => setGaUploadHint(null)}
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
                  label="Client"
                  icon={<Building2 size={18} strokeWidth={1.5} />}
                  value={form.client}
                  onChange={value => setForm(s => ({ ...s, client: value }))}
                  options={CLIENTS}
                  placeholder="Pick or type a client"
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
                      Each panel has its own name, type, voltage, and system type. Panel 1 voltage is used in the project code.
                    </p>
                  </div>
                  <button type="button" onClick={addPanel} className="pj-btn-secondary shrink-0">
                    <Plus size={14} strokeWidth={1.5} />
                    Add Panel
                  </button>
                </div>

                {fe.panels && (
                  <p className="text-[12px] font-medium text-amber-700">{fe.panels}</p>
                )}

                <div className="flex flex-col gap-3">
                  {panels.map((panel, idx) => (
                    <PanelDraftFields
                      key={panel.key}
                      index={idx}
                      panel={panel}
                      errors={panelFieldErrors[idx]}
                      onChange={patch => updatePanel(panel.key, patch)}
                      onRemove={panels.length > 1 ? () => removePanel(panel.key) : undefined}
                    />
                  ))}
                </div>
              </div>

              <div className="pj-create-grid-2">
                <ComboField
                  label="Location / Region"
                  icon={<MapPin size={18} strokeWidth={1.5} />}
                  value={form.locationRegion}
                  onChange={value => setForm(s => ({ ...s, locationRegion: value }))}
                  options={LOCATION_REGION_PRESETS}
                  placeholder="DUBAI / UAE"
                  error={fe.locationRegion}
                />
                <ComboField
                  label="Month / Year"
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
              </div>
            </section>

            <section className="pj-create-section pj-create-previews">
              <div className="pj-create-preview-block">
                <span className="pj-create-preview-label">Reference title (for reports &amp; exports)</span>
                <div
                  className={`pj-create-preview-value ${generatedName ? 'pj-create-preview-value--ready' : ''}`}
                  title={generatedName || 'Fill fields to preview'}
                >
                  {generatedName || (
                    <span className="text-slate-400 italic font-normal text-[12px]">
                      Stored on the card as separate labeled fields — not one long dashed line.
                    </span>
                  )}
                </div>
              </div>

              <div className="pj-create-preview-block">
                <span className="pj-create-preview-label">Project code</span>
                <div
                  className={`pj-create-preview-value font-mono text-[13px] ${
                    codeComplete ? 'pj-create-preview-value--code' : ''
                  }`}
                >
                  {codeComplete ? (
                    <span className="font-semibold">{computedCode}</span>
                  ) : (
                    [
                      { seg: codeVoltage, label: 'VOLT' },
                      { seg: norm(region), label: 'REG' },
                      { seg: norm(location), label: 'LOC' },
                      { seg: norm(parsedYear), label: 'YEAR' },
                      { seg: seq3, label: 'NUM' },
                    ].map((item, i) => (
                      <span key={i} className="inline-flex items-center">
                        {i > 0 && <span className="text-slate-300 select-none mx-0.5">_</span>}
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
