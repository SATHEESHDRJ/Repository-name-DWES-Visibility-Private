import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { projectsApi, uploadApi, supervisorApi } from '../../../services/api';
import type { Project } from '../../../types';
import Modal from '../../../components/Modal';
import { useAppDialog } from '../../../components/AppDialogProvider';
import { usePermissions } from '../../../hooks/usePermissions';
import { useDwesRefresh } from '../../../hooks/useDwesRefresh';
import ProjectPanelSelect from '../../../components/assignment/ProjectPanelSelect';
import AssignTechnicianModal from '../../../components/assignment/AssignTechnicianModal';
import {
  Upload, FileSpreadsheet, CheckCircle, TriangleAlert, ArrowRight, ArrowLeft,
  Star, Search, Maximize,
} from '../../../components/ui/icons';
import PanelFileMetadataBar from '../../../components/supervisor/PanelFileMetadataBar';
import {
  type PanelFileMetadata,
  type PanelFilePopupMode,
  frameHasWiringSchedule,
} from '../../../components/supervisor/panelFilePopup';
import UploadTargetHeader from '../../../components/supervisor/UploadTargetHeader';
import DuplicatePanelWarning from '../../../components/supervisor/DuplicatePanelWarning';
import UnifiedUploadModal from '../../../components/supervisor/UnifiedUploadModal';
import WiringScheduleMappingGrid from '../../../components/supervisor/WiringScheduleMappingGrid';
import { WIRING_SYSTEM_FIELDS, buildAutoWiringMapping, fieldKeyForHeader } from '../../../constants/wiringSystemFields';
import { assertNoDuplicatePanels } from '../../../utils/panelDuplicates';
import { onFramesChanged, emitFramesChanged } from '../../../utils/projectFramesEvents';
import { emitDocumentsChanged } from '../../../utils/projectDocumentsEvents';

type UploadStep = 'file' | 'sheet' | 'mapping';

function frameReady(frame: { cable_count?: number }): boolean {
  return (frame.cable_count ?? 0) > 0;
}

interface FramesTabProps { projectCode?: string }

export default function FramesTab({ projectCode: propCode }: FramesTabProps = {}) {
  const perms = usePermissions();
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProject, setSelectedProject] = useState(propCode || '');
  const [selectedPanelId, setSelectedPanelId] = useState('');
  const [frames, setFrames] = useState<any[]>([]);
  const [assignments, setAssignments] = useState<any[]>([]);
  const [, setLoading] = useState(false);
  const [showScheduleUpload, setShowScheduleUpload] = useState(false);
  const [showUnifiedUpload, setShowUnifiedUpload] = useState(false);
  const [showAssign, setShowAssign] = useState<any | null>(null);

  // Sync if parent changes the controlled project
  useEffect(() => {
    if (propCode) setSelectedProject(propCode);
  }, [propCode]);

  useEffect(() => {
    if (propCode) return;
    projectsApi.list().then(data => {
      setProjects(data);
    });
  }, [propCode]);

  useEffect(() => {
    if (!selectedProject) return;
    setLoading(true);
    Promise.all([
      projectsApi.frames(selectedProject),
      supervisorApi.allPanels().catch(() => []),
    ]).then(([fr, all]) => {
      setFrames(fr);
      setAssignments(all.filter((a: any) => a.project_code === selectedProject));
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [selectedProject]);

  // Already swaps frames/assignments in place and keeps the last good data on failure.
  const loadFrames = useCallback(() => {
    if (!selectedProject) return;
    Promise.all([
      projectsApi.frames(selectedProject),
      supervisorApi.allPanels().catch(() => []),
    ]).then(([fr, all]) => {
      setFrames(fr);
      setAssignments(all.filter((a: any) => a.project_code === selectedProject));
    }).catch(() => {});
  }, [selectedProject]);

  useDwesRefresh(loadFrames);

  useEffect(() => {
    return onFramesChanged((detail) => {
      if (!selectedProject || detail.projectCode !== selectedProject) return;
      if (detail.action === 'deleted' && detail.frameId) {
        setFrames(prev => prev.filter(f => f.id !== detail.frameId));
        setAssignments(prev => prev.filter(a => a.frame_id !== detail.frameId));
        setSelectedPanelId(prev => (prev === detail.frameId ? '' : prev));
      }
    });
  }, [selectedProject]);

  const handleScheduleUploaded = (frameId: string) => {
    emitFramesChanged({ projectCode: selectedProject, frameId, action: 'updated' });
    emitDocumentsChanged({
      projectCode: selectedProject,
      frameId,
      kind: 'wiring',
      action: 'uploaded',
    });
    loadFrames();
    setShowScheduleUpload(false);
    setShowAssign({ id: frameId });
  };

  const handleProjectChange = (code: string) => {
    setSelectedProject(code);
    setSelectedPanelId('');
  };

  const displayedFrames = selectedPanelId
    ? frames.filter(f => f.id === selectedPanelId)
    : frames;

  return (
    <div className={propCode ? 'flex flex-col min-w-0' : undefined}>
      <div className={`toolbar flex items-center flex-wrap gap-2 gap-y-2 pb-3 ${propCode ? 'px-5 pt-4 shrink-0' : ''}`}>
        {!propCode && (
          <ProjectPanelSelect
            projects={projects}
            selectedProjectCode={selectedProject}
            selectedPanelId={selectedPanelId}
            onProjectChange={handleProjectChange}
            onPanelChange={setSelectedPanelId}
            allowAllPanels
            className="flex-1 min-w-0"
          />
        )}
        {perms.canManageProjects && (
          <>
            <button
              type="button"
              onClick={() => setShowUnifiedUpload(true)}
              disabled={!selectedProject}
              className="pj-btn-primary shadow-sm"
            >
              <Upload size={18} strokeWidth={1.5} />
              <span>Upload</span>
            </button>
            <button
              type="button"
              onClick={() => setShowScheduleUpload(true)}
              disabled={!selectedProject}
              className="pj-btn-secondary"
            >
              <FileSpreadsheet size={18} strokeWidth={1.5} />
              <span>Upload Schedule</span>
            </button>
          </>
        )}
      </div>

      {/* ── Frames table ── */}
      <div className={propCode ? 'flex flex-col min-w-0' : 'pj-surface flex flex-col mt-5 min-w-0'}>
        <div className="overflow-x-auto">
          <table className="pj-table w-full text-left border-collapse min-w-[540px]">
            <thead className="sticky top-0 z-10">
              <tr>
                <th className="font-bold text-slate-500 uppercase">Frame / Panel</th>
                <th className="font-bold text-slate-500 uppercase">File Source</th>
                <th className="font-bold text-slate-500 uppercase w-[120px]">Uploaded</th>
                <th className="font-bold text-slate-500 uppercase w-[240px]">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#F1F5F9]">
              {displayedFrames.length === 0 ? (
                <tr>
                  <td colSpan={4} className="text-center py-16 text-slate-500">
                    <div className="flex flex-col items-center gap-2">
                      <FileSpreadsheet size={32} className="text-slate-400 mb-2" strokeWidth={1} />
                      <div className="text-[14px] font-medium text-slate-600">No panels yet for this project.</div>
                      <p className="text-[13px] text-slate-500 max-w-sm text-center">
                        Use <strong className="text-slate-700">Upload Schedule</strong> to add a wiring schedule (.xlsx), or <strong className="text-slate-700">Upload</strong> for PDF documents and director reports.
                      </p>
                    </div>
                  </td>
                </tr>
              ) : (
                displayedFrames.map(frame => {
                  const asgn = assignments.find(a => a.frame_id === frame.id);
                  const ready = frameReady(frame);

                  let pillClass = ready ? 'frame-status-verified' : 'frame-status-none';
                  let pillLabel = ready ? 'Ready' : 'No schedule';
                  if (asgn) {
                    const m: Record<string, [string, string]> = {
                      assigned:    ['frame-status-assigned',   'Assigned'],
                      in_progress: ['frame-status-inprogress', 'In Progress'],
                      paused:      ['frame-status-paused',     'Paused'],
                      completed:   ['frame-status-completed',  'Completed'],
                    };
                    [pillClass, pillLabel] = m[asgn.status] ?? [pillClass, pillLabel];
                  }

                  return (
                    <tr key={frame.id}>
                      <td>
                        <span className="font-bold text-slate-900">{frame.panel_name}</span>
                      </td>
                      <td>
                        <div className="flex flex-col justify-center">
                          <span className="text-[13px] font-medium text-slate-700 truncate max-w-[220px]" title={frame.original_filename}>{frame.original_filename}</span>
                          <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">{frame.cable_count} cables</span>
                        </div>
                      </td>
                      <td className="font-medium text-slate-500 whitespace-nowrap">
                        {new Date(frame.uploaded_at).toLocaleDateString()}
                      </td>

                      {/* Status: pill + contextual info */}
                      <td>
                        {asgn ? (
                          <div className="flex flex-col gap-0.5">
                            <span className={`frame-status-pill ${pillClass}`}>{pillLabel}</span>
                            <span className="text-[11px] text-slate-500 truncate max-w-[200px]" title={asgn.technician_name}>
                              {asgn.technician_name}
                            </span>
                          </div>
                        ) : (
                          <div className="flex items-center gap-2">
                            <span className={`frame-status-pill ${pillClass}`}>{pillLabel}</span>
                            {ready && (
                              <button
                                onClick={() => setShowAssign(frame)}
                                className="text-[11px] font-semibold text-green-600 hover:text-green-800 transition-colors whitespace-nowrap underline-offset-2 hover:underline"
                                type="button"
                                title="Assign to a technician"
                              >
                                Assign →
                              </button>
                            )}
                          </div>
                        )}
                      </td>

                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Modals ── */}
      {showScheduleUpload && (
        <UploadFrameModal
          projectCode={selectedProject}
          onClose={() => setShowScheduleUpload(false)}
          onUploaded={handleScheduleUploaded}
        />
      )}
      {showUnifiedUpload && (
        <UnifiedUploadModal
          projectCode={selectedProject}
          onClose={() => setShowUnifiedUpload(false)}
          onUpdated={loadFrames}
        />
      )}
      {showAssign && (
        <AssignTechnicianModal
          projects={projects}
          initialProjectCode={selectedProject}
          initialPanelId={showAssign.id}
          lockSelection
          onClose={() => setShowAssign(null)}
          onAssigned={() => { setShowAssign(null); loadFrames(); }}
        />
      )}
    </div>
  );
}

// ── Upload Frame Modal ────────────────────────────────────────────────────────

export function UploadFrameModal({
  projectCode,
  projectName,
  targetFrameId,
  targetPanelName,
  existingCableCount = 0,
  startInReplaceMode = false,
  siblingPanels = [],
  onEditPanel,
  onSelectPanel,
  onClose,
  onUploaded,
}: {
  projectCode: string;
  projectName?: string;
  targetFrameId?: string;
  targetPanelName?: string;
  /** When > 0, modal opens with View / Replace choice instead of upload-only. */
  existingCableCount?: number;
  /** Parent has already shown the replacement warning and wants the file picker directly. */
  startInReplaceMode?: boolean;
  /** All panels in the project — used for duplicate-name detection. */
  siblingPanels?: { id?: string; panel_name: string }[];
  onEditPanel?: (panelId: string) => void;
  onSelectPanel?: (panelId: string) => void;
  onClose: () => void;
  onUploaded: (frameId: string) => void;
}) {
  const dialog = useAppDialog();
  const [mode, setMode] = useState<PanelFilePopupMode>('loading');
  const [metadata, setMetadata] = useState<PanelFileMetadata | null>(null);
  const [step, setStep] = useState<UploadStep>('file');
  const [file, setFile] = useState<File | null>(null);
  const [dupInfo, setDupInfo] = useState<{ kind: 'same' | 'other'; file_name: string; project_code: string; uploaded_at: string } | null>(null);
  const [dupChoice, setDupChoice] = useState<'replace' | 'keep' | null>(null);
  const [sheets, setSheets] = useState<any[]>([]);
  const [bestSheet, setBestSheet] = useState('');
  const [selSheet, setSelSheet] = useState('');
  const [headers, setHeaders] = useState<string[]>([]);
  const [sampleRows, setSampleRows] = useState<any[][]>([]);
  const [dataRowCount, setDataRowCount] = useState(0);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [includedHeaders, setIncludedHeaders] = useState<Record<string, boolean>>({});
  const [headerRow, setHeaderRow] = useState(0);
  const [preview, setPreview] = useState<{
    cable_count: number;
    mapped_columns: number;
    unmatched_headers: string[];
    validation: { total: number; ok_count: number; error_count: number; issues: Record<number, Record<string, string>> };
    sample_cables: Array<Record<string, string>>;
  } | null>(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [columnFilter, setColumnFilter] = useState<'all' | 'selected' | 'required' | 'unselected'>('all');
  const [fullViewOpen, setFullViewOpen] = useState(false);
  const [replacementConfirmed, setReplacementConfirmed] = useState(startInReplaceMode);
  const [columnWidths, setColumnWidths] = useState<Record<string, number>>({});
  const fileRef = useRef<HTMLInputElement>(null);

  const resolveFrameOnOpen = useCallback(async () => {
    if (!targetFrameId) {
      setMode(existingCableCount > 0 ? 'populated' : 'empty');
      return;
    }
    setMode('loading');
    try {
      const frame = await projectsApi.frame(projectCode, targetFrameId);
      const present = frameHasWiringSchedule(frame) || existingCableCount > 0;
      if (present) {
        const name = String(frame.original_filename || 'Wiring schedule.xlsx');
        setMetadata({
          fileName: name,
          fileType: /\.xls$/i.test(name) && !/xlsx/i.test(name) ? 'Excel (.xls)' : 'Excel (.xlsx)',
          uploadedAt: frame.uploaded_at ? String(frame.uploaded_at) : undefined,
          sheetName: frame.sheet_name ? String(frame.sheet_name) : undefined,
        });
        setMode(startInReplaceMode ? 'replacing' : 'populated');
      } else {
        setMetadata(null);
        setMode('empty');
      }
    } catch {
      setMode(existingCableCount > 0 ? (startInReplaceMode ? 'replacing' : 'populated') : 'empty');
    }
  }, [projectCode, targetFrameId, existingCableCount, startInReplaceMode]);

  useEffect(() => {
    void resolveFrameOnOpen();
  }, [resolveFrameOnOpen]);

  const duplicateGuard = assertNoDuplicatePanels(
    siblingPanels,
    targetFrameId,
    targetPanelName,
  );
  const duplicateBlocked = duplicateGuard.blocked;
  const duplicateBlockMessage = duplicateGuard.message;

  const panelListForWarning = siblingPanels.map((p, i) => ({
    id: p.id ?? String(i),
    panel_name: p.panel_name,
    cable_count: 'cable_count' in p ? (p as { cable_count?: number }).cable_count : undefined,
    original_filename: 'original_filename' in p ? (p as { original_filename?: string }).original_filename : undefined,
  }));

  const finishUploadPopulated = useCallback(async (frameId: string) => {
    onUploaded(frameId);
    onClose();
  }, [onClose, onUploaded]);

  const handleColumnResize = useCallback((header: string, width: number) => {
    setColumnWidths(prev => ({ ...prev, [header]: width }));
  }, []);

  const appendTargetFrame = (formData: FormData) => {
    if (targetFrameId) formData.append('frame_id', targetFrameId);
    return formData;
  };

  const confirmReplaceSchedule = async (): Promise<boolean> => {
    let progressWarning = '';
    if (targetFrameId) {
      try {
        const prog = await supervisorApi.frameProgress(projectCode, targetFrameId);
        const assignments = Array.isArray(prog?.assignments) ? prog.assignments : [];
        const hasExecution = assignments.some((a: {
          status?: string;
          cables_src_done?: number;
          cables_dst_done?: number;
        }) => {
          const done = (a.cables_src_done ?? 0) + (a.cables_dst_done ?? 0);
          return done > 0 || ['in_progress', 'paused', 'completed'].includes(a.status || '');
        });
        if (hasExecution) {
          progressWarning =
            '\n\nTechnician execution progress exists on this panel. Replacing the schedule may orphan cable completion data.';
        }
      } catch {
        /* non-blocking */
      }
    }

    return dialog.confirm({
      title: 'Replace wiring schedule?',
      message:
        `This will replace the current wiring schedule for panel ${targetPanelName || 'this panel'}.${progressWarning}\n\nThe current schedule and Excel file will be archived to uploads/backups/ before overwrite. Continue?`,
      tone: 'warning',
      confirmText: 'Replace Upload',
    });
  };

  const hashFile = async (selectedFile: File) => {
    const buffer = await selectedFile.arrayBuffer();
    const hash = await crypto.subtle.digest('SHA-256', buffer);
    return Array.from(new Uint8Array(hash)).map(byte => byte.toString(16).padStart(2, '0')).join('');
  };

  const onFileSelect = async (selectedFile: File) => {
    setError('');
    setDupInfo(null);
    setDupChoice(null);
    if (!/\.(xlsx|xls)$/i.test(selectedFile.name)) {
      setError('Only Excel files (.xlsx, .xls) are allowed.');
      return;
    }
    if (selectedFile.size > 50 * 1024 * 1024) {
      setError('File is too large — max 50 MB.');
      return;
    }
    setFile(selectedFile);
    const hash = await hashFile(selectedFile);
    try {
      // Scoped check: look in THIS project first
      const result = await uploadApi.checkHash(hash, selectedFile.name, 'wiring_schedule', projectCode);
      if (result.duplicate) {
        setDupInfo({ kind: 'same', file_name: result.file_name, project_code: result.project_code, uploaded_at: result.uploaded_at });
        return;
      }
      // Global check for informational cross-project notice
      const global = await uploadApi.checkHash(hash, selectedFile.name, 'wiring_schedule');
      if (global.duplicate) {
        setDupInfo({ kind: 'other', file_name: global.file_name, project_code: global.project_code, uploaded_at: global.uploaded_at });
      }
    } catch {
      // ignore duplicate check errors
    }
  };

  const readHeaders = async () => {
    if (!file) return;
    setUploading(true);
    setError('');
    try {
      const formData = new FormData();
      formData.append('file', file);
      const result = await uploadApi.readHeaders(projectCode, formData);
      setSheets(result.sheets);
      setBestSheet(result.best_sheet);
      setSelSheet(result.best_sheet);
      const best = result.sheets.find((sheet: any) => sheet.name === result.best_sheet);
      setHeaders(best?.headers || []);
      setSampleRows(best?.sample_rows || []);
      setDataRowCount(best?.data_row_count ?? best?.sample_rows?.length ?? 0);
      setHeaderRow(best?.header_row ?? 0);
      setStep('sheet');
      if (result.best_sheet && best) {
        selectSheet(result.best_sheet, result.sheets);
      }
    } catch (apiError: any) {
      setError(apiError?.response?.data?.message || 'Failed to read file');
    } finally {
      setUploading(false);
    }
  };

  const buildAutoMapping = buildAutoWiringMapping;

  const selectSheet = (name: string, sheetList = sheets) => {
    setSelSheet(name);
    const selected = sheetList.find(sheet => sheet.name === name);
    const hdrs: string[] = selected?.headers || [];
    const rows: any[][] = selected?.sample_rows || [];
    setHeaders(hdrs);
    setSampleRows(rows);
    setDataRowCount(selected?.data_row_count ?? rows.length);
    setHeaderRow(selected?.header_row ?? 0);
    setMapping(buildAutoMapping(hdrs, rows));
    setIncludedHeaders(Object.fromEntries(hdrs.map(h => [h, true])));
    setPreview(null);
    setSearchQuery('');
    setColumnFilter('all');
    setStep('mapping');
  };

  const runPreview = async () => {
    const missing = WIRING_SYSTEM_FIELDS.filter(field => field.required && !effectiveMapping[field.key]).map(field => field.label);
    if (missing.length) {
      setError(`Map required fields: ${missing.join(', ')}`);
      return;
    }
    const hasDerivation = effectiveMapping['source'] || effectiveMapping['destination'] || effectiveMapping['path'] ||
      effectiveMapping['source_device'] || effectiveMapping['dest_device'];
    if (!hasDerivation) {
      setError('Map at least Source, Destination, Path, or Source/Dest Device so cables can be located.');
      return;
    }
    if (!file) return;

    setUploading(true);
    setError('');
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('sheet_name', selSheet);
      formData.append('mapping', JSON.stringify(effectiveMapping));
      formData.append('header_row', String(headerRow));
      const result = await uploadApi.previewMapped(projectCode, formData);
      if (result.cable_count === 0) {
        setError('No cables parsed — check your column mapping and sheet selection');
        return;
      }
      // Preview is always a separate verification step. Even a clean workbook must
      // remain on screen until the supervisor explicitly chooses Import.
      setPreview(result);
      if (result.validation.error_count > 0) {
        setColumnFilter('all');
      }
    } catch (apiError: any) {
      setError(apiError?.response?.data?.message || 'Preview failed');
    } finally {
      setUploading(false);
    }
  };

  const handleImport = async () => {
    if (!file || duplicateBlocked) return;
    if ((mode === 'populated' || mode === 'replacing') && targetFrameId && !replacementConfirmed) {
      const ok = await confirmReplaceSchedule();
      if (!ok) return;
      setReplacementConfirmed(true);
    }

    setUploading(true);
    setError('');
    setProgress(0);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('sheet_name', selSheet);
      formData.append('mapping', JSON.stringify(effectiveMapping));
      formData.append('header_row', String(headerRow));
      const result = await uploadApi.uploadMapped(projectCode, appendTargetFrame(formData), setProgress);
      await finishUploadPopulated(result.id);
    } catch (apiError: any) {
      setError(apiError?.response?.data?.message || 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  const activeHeaders = useMemo(
    () => headers.filter(h => includedHeaders[h] !== false),
    [headers, includedHeaders],
  );
  const effectiveMapping = useMemo(
    () => Object.fromEntries(Object.entries(mapping).filter(([, header]) => includedHeaders[header] !== false)),
    [mapping, includedHeaders],
  );
  const requiredDone = WIRING_SYSTEM_FIELDS.filter(field => field.required).every(field => !!effectiveMapping[field.key]);
  const includedCount = activeHeaders.length;
  const mappedCount = Object.values(effectiveMapping).filter(Boolean).length;

  const toggleHeaderIncluded = (header: string, nextChecked: boolean) => {
    setIncludedHeaders(prev => ({ ...prev, [header]: nextChecked }));
    if (!nextChecked) {
      setMapping(prev => {
        const next = { ...prev };
        Object.keys(next).forEach(key => {
          if (next[key] === header) delete next[key];
        });
        return next;
      });
    }
    setPreview(null);
    setError('');
  };

  const toggleAllHeaders = (checked: boolean) => {
    setIncludedHeaders(Object.fromEntries(headers.map(h => [h, checked])));
    if (!checked) {
      setMapping({});
    }
    setPreview(null);
    setError('');
  };

  const requiredHeaderCount = useMemo(() => {
    return headers.filter(h => {
      const fk = Object.keys(effectiveMapping).find(k => effectiveMapping[k] === h);
      const field = fk ? WIRING_SYSTEM_FIELDS.find(f => f.key === fk) : null;
      return field?.required;
    }).length;
  }, [headers, effectiveMapping]);

  const unselectedCount = headers.length - includedCount;

  const visibleColumnCount = useMemo(() => {
    return headers.filter(header => {
      const included = includedHeaders[header] !== false;
      const fk = fieldKeyForHeader(mapping, header);
      const field = fk ? WIRING_SYSTEM_FIELDS.find(f => f.key === fk) : null;
      switch (columnFilter) {
        case 'selected':
          return included;
        case 'unselected':
          return !included;
        case 'required':
          return !!field?.required;
        default:
          return true;
      }
    }).length;
  }, [headers, includedHeaders, mapping, columnFilter]);
  const displayRowCount = preview?.cable_count ?? dataRowCount;

  const wiringGridProps = {
    headers,
    rows: sampleRows,
    mapping,
    includedHeaders,
    onMappingChange: (m: Record<string, string>) => { setMapping(m); setPreview(null); setError(''); },
    onToggleHeader: toggleHeaderIncluded,
    onToggleAll: toggleAllHeaders,
    searchQuery,
    columnFilter,
    preview,
    columnWidths,
    onColumnResize: handleColumnResize,
    frozenColumns: 1 as const,
  };

  const inMappingUpload = (mode === 'empty' || mode === 'replacing') && step === 'mapping';
  const showUploadedStatus = mode === 'populated' && step === 'file';

  const modalTitle = showUploadedStatus
    ? 'Wiring Schedule Uploaded'
    : mode === 'replacing' && step === 'file'
      ? 'Replace Wiring Schedule'
      : inMappingUpload && fullViewOpen
        ? 'Wiring schedule — full view'
        : step === 'mapping'
          ? 'Excel Wiring Upload'
          : 'Wiring Upload';

  const handleModalClose = () => {
    if (inMappingUpload && fullViewOpen) {
      setFullViewOpen(false);
      return;
    }
    onClose();
  };

  const startReplaceUpload = async () => {
    if (duplicateBlocked) return;
    if (!(await confirmReplaceSchedule())) return;
    setReplacementConfirmed(true);
    setMode('replacing');
    setStep('file');
    setFile(null);
    setError('');
    setPreview(null);
  };

  const fullViewBar = (
    <>
      <div className="wu-fullview-bar">
        <div className="wu-chips" role="list" aria-label="Worksheet summary">
          <span className="wu-chip wu-chip--sheet" role="listitem">{selSheet}</span>
          <span className="wu-chip" role="listitem">{displayRowCount} rows</span>
          <span className="wu-chip" role="listitem">{headers.length} columns</span>
          <span className="wu-chip wu-chip--accent" role="listitem">{includedCount} selected</span>
          <span className="wu-chip wu-chip--accent" role="listitem">{mappedCount} mapped</span>
        </div>
        <div className="wu-fullview-actions">
          <div className="wu-search">
            <Search size={15} strokeWidth={1.75} className="wu-search-icon" aria-hidden />
            <input
              type="search"
              className="wu-input wu-input--compact"
              placeholder="Search rows…"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              aria-label="Search worksheet rows"
            />
          </div>
          <button
            type="button"
            className="btn-secondary wu-expand-btn wu-expand-btn--compact"
            onClick={() => setFullViewOpen(false)}
          >
            <span>Exit full view</span>
          </button>
        </div>
      </div>

      {preview && (
        <div className={`wu-banner wu-banner--compact ${preview.validation.error_count ? 'wu-banner--warn' : 'wu-banner--ok'}`} role="status">
          <div className="wu-banner-icon">
            {preview.validation.error_count
              ? <TriangleAlert size={16} strokeWidth={1.75} />
              : <CheckCircle size={16} strokeWidth={1.75} />}
          </div>
          <div className="wu-banner-body">
            <p className="wu-banner-title">
              {preview.cable_count} cable{preview.cable_count === 1 ? '' : 's'} parsed
              {preview.validation.error_count
                ? ` · ${preview.validation.error_count} issue(s) highlighted`
                : ' · validated'}
            </p>
          </div>
        </div>
      )}

      <WiringScheduleMappingGrid {...wiringGridProps} variant="fullview" />
    </>
  );

  return (
    <>
    <Modal
      title={modalTitle}
      icon={<FileSpreadsheet />}
      onClose={handleModalClose}
      size={
        inMappingUpload ? 'fullscreen' : 'lg'
      }
      bodyClassName={
        inMappingUpload ? 'modal-body-flush' : undefined
      }
      closeOnBackdrop={
        !fullViewOpen || !inMappingUpload
      }
      footer={
        mode === 'loading' ? (
          <button onClick={onClose} className="btn-secondary" type="button">Cancel</button>
        ) : showUploadedStatus ? (
          <>
            <button
              type="button"
              className="btn-secondary"
              onClick={() => void startReplaceUpload()}
              disabled={duplicateBlocked}
              title={duplicateBlocked ? duplicateBlockMessage : undefined}
            >
              <Upload size={16} strokeWidth={1.5} />
              <span>Re-upload Wiring Schedule</span>
            </button>
            <button type="button" className="btn-secondary" onClick={onClose}>Close</button>
          </>
        ) : (mode === 'empty' || mode === 'replacing') && step === 'file' ? (
          <>
            {mode === 'replacing' && (
              <button type="button" className="btn-secondary" onClick={() => { setReplacementConfirmed(false); setMode('populated'); setStep('file'); }}>Cancel replace</button>
            )}
            <button onClick={onClose} className="btn-secondary" type="button">Cancel</button>
            <button
              onClick={readHeaders}
              disabled={!file || uploading || duplicateBlocked || (dupInfo?.kind === 'same' && dupChoice !== 'replace')}
              className="btn-primary"
              type="button"
            >
              <span>{uploading ? 'Reading...' : 'Next'}</span>
              {!uploading && <ArrowRight size={16} />}
            </button>
          </>
        ) : step === 'mapping' && !fullViewOpen ? (
          <>
            <button onClick={() => { setPreview(null); setFullViewOpen(false); setStep('sheet'); }} className="btn-secondary" type="button" disabled={uploading}>
              <ArrowLeft size={16} />
              <span>Back</span>
            </button>
            <button onClick={onClose} className="btn-secondary" type="button" disabled={uploading}>Cancel</button>
            {preview ? (
              <button
                onClick={handleImport}
                disabled={uploading || preview.cable_count === 0 || duplicateBlocked}
                className="btn-primary"
                type="button"
              >
                {uploading
                  ? `Importing… ${progress}%`
                  : preview.validation.error_count
                    ? `Import anyway (${preview.validation.error_count} issue${preview.validation.error_count === 1 ? '' : 's'})`
                    : `Import ${preview.cable_count} cables`}
              </button>
            ) : (
              <button onClick={runPreview} disabled={!requiredDone || uploading || duplicateBlocked} className="btn-primary" type="button">
                {uploading ? 'Validating…' : 'Validate & Preview'}
              </button>
            )}
          </>
        ) : undefined
      }
    >
      {mode === 'loading' ? (
        <div className="flex items-center justify-center py-12 text-slate-500 text-[13px]">
          Checking for existing wiring schedule…
        </div>
      ) : !targetFrameId && !targetPanelName ? (
        <div className="flex flex-col items-center justify-center py-12 gap-2 text-slate-500 text-[13px]">
          <TriangleAlert size={24} className="text-amber-500" />
          <p>Select a panel before uploading a wiring schedule.</p>
        </div>
      ) : showUploadedStatus ? (
        <div className="panel-file-popup flex flex-col gap-4">
          {(targetPanelName && projectName) && (
            <div className="px-4 pt-4">
              <UploadTargetHeader
                projectName={projectName}
                projectCode={projectCode}
                panelName={targetPanelName}
                panelId={targetFrameId}
                kind="wiring"
              />
            </div>
          )}
          {!duplicateBlocked && metadata && (
            <div className="px-4"><PanelFileMetadataBar metadata={metadata} /></div>
          )}
          {duplicateBlocked && (
            <div className="px-4">
              <DuplicatePanelWarning
                panels={panelListForWarning}
                selectedPanelId={targetFrameId}
                onEditPanel={onEditPanel}
                onSelectPanel={onSelectPanel}
              />
            </div>
          )}
          {!duplicateBlocked && (
            <div className="mx-4 mb-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-[13px] text-emerald-800" role="status">
              The wiring schedule is saved for this panel. Use Re-upload Wiring Schedule only when a replacement is required.
            </div>
          )}
        </div>
      ) : step === 'mapping' && !fullViewOpen ? (
        <div className="wu-workspace">
          {(targetPanelName && projectName) && (
            <div className="wu-target-wrap">
              <UploadTargetHeader
                projectName={projectName}
                projectCode={projectCode}
                panelName={targetPanelName}
                panelId={targetFrameId}
                kind="wiring"
              />
            </div>
          )}
          <DuplicatePanelWarning
            panels={panelListForWarning}
            selectedPanelId={targetFrameId}
            onEditPanel={onEditPanel}
            onSelectPanel={onSelectPanel}
          />

          <div className="wu-toolbar">
            <div className="wu-toolbar-controls">
              <div className="wu-search">
                <Search size={15} strokeWidth={1.75} className="wu-search-icon" aria-hidden />
                <input
                  type="search"
                  className="wu-input"
                  placeholder="Search worksheet…"
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  aria-label="Search worksheet rows"
                />
              </div>
              {/* Column filter hidden from UI — re-enable by removing wu-filter--hidden */}
              <div className="wu-filter wu-filter--hidden" aria-hidden>
                <select
                  className="wu-select"
                  value={columnFilter}
                  onChange={e => setColumnFilter(e.target.value as 'all' | 'selected' | 'required' | 'unselected')}
                  aria-label="Filter columns"
                  tabIndex={-1}
                >
                  <option value="all">All columns</option>
                  <option value="selected">Selected columns</option>
                  <option value="required">Required columns</option>
                  <option value="unselected" disabled={unselectedCount === 0}>Unselected columns</option>
                </select>
              </div>
              <button
                type="button"
                className="btn-secondary wu-expand-btn"
                onClick={() => setFullViewOpen(true)}
                title="Open full-screen preview"
                aria-label="Open full-screen wiring schedule preview"
              >
                <Maximize size={16} strokeWidth={1.75} aria-hidden />
                <span>Full view</span>
              </button>
            </div>
            <div className="wu-chips" role="list" aria-label="Worksheet summary">
              <span className="wu-chip wu-chip--sheet" role="listitem">{selSheet}</span>
              <span className="wu-chip" role="listitem">{displayRowCount} rows</span>
              <span className="wu-chip" role="listitem">{headers.length} columns</span>
              <span className="wu-chip wu-chip--accent" role="listitem">{includedCount} selected</span>
              <span className="wu-chip wu-chip--accent" role="listitem">{mappedCount} mapped</span>
              {requiredHeaderCount > 0 && (
                <span className="wu-chip wu-chip--required" role="listitem">{requiredHeaderCount} required</span>
              )}
            </div>
          </div>

          {headers.length > 0 && visibleColumnCount === 0 && (
            <div className="wu-hint" role="status">
              <TriangleAlert size={14} strokeWidth={1.75} aria-hidden />
              No columns match the current filter — try &ldquo;All columns&rdquo; or adjust selection.
            </div>
          )}

          {preview && (
            <div className={`wu-banner ${preview.validation.error_count ? 'wu-banner--warn' : 'wu-banner--ok'}`} role="status">
              <div className="wu-banner-icon">
                {preview.validation.error_count
                  ? <TriangleAlert size={18} strokeWidth={1.75} />
                  : <CheckCircle size={18} strokeWidth={1.75} />}
              </div>
              <div className="wu-banner-body">
                <p className="wu-banner-title">
                  {preview.cable_count} cable{preview.cable_count === 1 ? '' : 's'} parsed from &ldquo;{selSheet}&rdquo;
                </p>
                <p className="wu-banner-sub">
                  {preview.mapped_columns} columns mapped
                  {preview.unmatched_headers.length > 0 && ` · ${preview.unmatched_headers.length} Excel column(s) skipped`}
                  {preview.validation.error_count
                    ? ` · ${preview.validation.error_count} field issue(s) in ${Object.keys(preview.validation.issues).length} row(s) — highlighted below`
                    : ' · all rows validated — ready to import'}
                </p>
              </div>
              {preview.validation.error_count > 0 && (
                <button
                  type="button"
                  className="wu-banner-action"
                  onClick={() => { setPreview(null); setColumnFilter('all'); }}
                >
                  Re-map columns
                </button>
              )}
            </div>
          )}

          {headers.length > 0 && (
            <WiringScheduleMappingGrid {...wiringGridProps} />
          )}

          <div className="wu-legends" role="list" aria-label="Field mapping status">
            {WIRING_SYSTEM_FIELDS.filter(f => f.required).map(f => (
              <span
                key={f.key}
                role="listitem"
                className={`wu-chip ${effectiveMapping[f.key] ? 'wu-chip--ok' : 'wu-chip--danger'}`}
              >
                {effectiveMapping[f.key] ? <CheckCircle size={12} strokeWidth={2} /> : <TriangleAlert size={12} strokeWidth={2} />}
                {f.label}
                {effectiveMapping[f.key]
                  ? <span className="wu-chip-meta">← {effectiveMapping[f.key]}</span>
                  : <span className="wu-chip-meta">(required)</span>}
              </span>
            ))}
            {!effectiveMapping.source && !effectiveMapping.destination && !effectiveMapping.path && !effectiveMapping.source_device && !effectiveMapping.dest_device && (
              <span className="wu-chip wu-chip--warn" role="listitem">
                <TriangleAlert size={12} strokeWidth={2} />
                Map Source, Destination, Path, or Source Device
              </span>
            )}
          </div>

          {uploading && (
            <div className="wu-progress">
              <div className="wu-progress-track">
                <div className="wu-progress-fill" style={{ width: `${progress}%` }} />
              </div>
              <span className="wu-progress-label">{progress}% uploaded</span>
            </div>
          )}

          {error && <div className="form-error wu-error">{error}</div>}
        </div>
      ) : step === 'mapping' && fullViewOpen ? (
        <div className="wu-workspace wu-fullview">
          {fullViewBar}
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {targetPanelName && projectName && (
            <UploadTargetHeader
              projectName={projectName}
              projectCode={projectCode}
              panelName={targetPanelName}
              panelId={targetFrameId}
              kind="wiring"
            />
          )}
          <DuplicatePanelWarning
            panels={panelListForWarning}
            selectedPanelId={targetFrameId}
            onEditPanel={onEditPanel}
            onSelectPanel={onSelectPanel}
          />

          {step === 'file' && (
            <div>
              {!targetPanelName && (
              <p className="text-[13px] text-slate-600 leading-relaxed mb-4">
                Upload a wiring schedule for{' '}
                <span className="font-semibold text-slate-800">{projectName || projectCode}</span>
                {projectName && <span className="font-mono text-[12px] text-slate-400"> · {projectCode}</span>}
              </p>
              )}
              <div
                onClick={() => fileRef.current?.click()}
                onDragOver={event => event.preventDefault()}
                onDrop={event => { event.preventDefault(); const selectedFile = event.dataTransfer.files[0]; if (selectedFile) onFileSelect(selectedFile); }}
                className="drawing-dropzone"
              >
                <div className="drawing-dropzone-icon"><FileSpreadsheet size={32} /></div>
                <div className={`drawing-dropzone-copy ${file ? 'has-file' : ''}`}>
                  {file ? file.name : 'Click or drag-drop an Excel file (.xlsx)'}
                </div>
                <div className="drawing-meta">.xlsx, .xls - max 50MB</div>
                <input ref={fileRef} type="file" accept=".xlsx,.xls" className="drawing-hidden-input" aria-label="Select wiring schedule Excel file" onChange={event => { const selectedFile = event.target.files?.[0]; if (selectedFile) onFileSelect(selectedFile); }} />
              </div>

              {dupInfo?.kind === 'same' && dupChoice === null && (
                <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-4">
                  <div className="flex items-start gap-2 mb-3">
                    <TriangleAlert size={16} className="shrink-0 text-amber-600 mt-0.5" />
                    <div>
                      <div className="text-[13px] font-semibold text-amber-800">This file already exists in this project</div>
                      <div className="text-[12px] text-amber-700 mt-0.5">
                        &ldquo;{dupInfo.file_name}&rdquo; was uploaded on {new Date(dupInfo.uploaded_at).toLocaleDateString()}
                      </div>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button type="button" onClick={() => setDupChoice('replace')}
                      className="flex-1 h-10 rounded-lg bg-blue-600 text-white text-[13px] font-semibold hover:bg-blue-700 transition-colors">
                      Re-upload (create new version)
                    </button>
                    <button type="button" onClick={() => setDupChoice('keep')}
                      className="flex-1 h-10 rounded-lg bg-[var(--t-surface-white)] border border-slate-200 text-slate-700 text-[13px] font-semibold hover:bg-slate-50 transition-colors">
                      Cancel
                    </button>
                  </div>
                </div>
              )}

              {dupInfo?.kind === 'same' && dupChoice === 'replace' && (
                <div className="mt-3 p-3 rounded-xl bg-blue-50 border border-blue-200 text-[13px] text-blue-700 flex items-center gap-2">
                  <TriangleAlert size={16} className="shrink-0" />
                  Will create a new version alongside the existing one — click Next to continue.
                  <button type="button" onClick={() => setDupChoice(null)} className="ml-auto text-[12px] text-slate-500 hover:underline">Change</button>
                </div>
              )}

              {dupInfo?.kind === 'other' && (
                <div className="assignment-warning mt-3 flex items-center gap-1">
                  <TriangleAlert size={16} /> This file was also used in project <strong className="ml-1">{dupInfo.project_code}</strong> — you can still upload it here.
                </div>
              )}
            </div>
          )}

          {step === 'sheet' && (
            <div>
              <div className="review-sub mb-4">Select the sheet containing your wiring schedule. Auto-scored best match is highlighted.</div>
              <div className="stack-grid-sm">
                {sheets.map(sheet => (
                  <button key={sheet.name} onClick={() => selectSheet(sheet.name)} className={`frame-sheet-item ${sheet.name === bestSheet ? 'is-best' : ''}`} type="button">
                    <div>
                      <span className="frame-title">{sheet.name}</span>
                      {sheet.name === bestSheet && <span className="frame-best-mark flex items-center gap-1"><Star size={12} /> Best match</span>}
                    </div>
                    <div className="frame-sub">Score: {sheet.score} · {sheet.headers.length} cols</div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {error && <div className="form-error mt-2">{error}</div>}
        </div>
      )}
    </Modal>
    </>
  );
}
