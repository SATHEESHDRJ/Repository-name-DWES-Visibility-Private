import { useEffect, useRef, useState, useCallback } from 'react';
import { projectsApi, uploadApi, supervisorApi } from '../../../services/api';
import type { Project } from '../../../types';
import Modal from '../../../components/Modal';
import { usePermissions } from '../../../hooks/usePermissions';
import { useReadOnlyPoll } from '../../../hooks/useReadOnlyPoll';
import VerificationModal from '../../../components/ui/VerificationModal';
import ProjectPanelSelect from '../../../components/assignment/ProjectPanelSelect';
import AssignTechnicianModal from '../../../components/assignment/AssignTechnicianModal';
import { isVerifiedFrame } from '../../../components/assignment/frameUtils';
import {
  Upload, FileSpreadsheet, CheckCircle, TriangleAlert, ArrowRight, ArrowLeft,
  Star,
} from '../../../components/ui/icons';
import UnifiedUploadModal from '../../../components/supervisor/UnifiedUploadModal';

const SYSTEM_FIELDS = [
  { key: 'sno',              label: 'S.No',                            required: false },
  { key: 'panel',            label: 'Panel Name',                      required: false },
  { key: 'ferrule',          label: 'Ferrule *',                       required: true  },
  { key: 'path',             label: 'Path (SRC/DST or SRC→DST)',       required: false, hint: 'Auto-derives Source & Destination when mapped' },
  { key: 'source',           label: 'Source (dev:term)',                required: false, hint: 'Optional if Path or Ferrule derives it' },
  { key: 'destination',      label: 'Destination (dev:term)',           required: false, hint: 'Optional if Path or Ferrule derives it' },
  { key: 'source_device',    label: 'Source Device',                   required: false },
  { key: 'source_terminal',  label: 'Source Terminal',                  required: false },
  { key: 'dest_device',      label: 'Dest Device',                     required: false },
  { key: 'dest_terminal',    label: 'Dest Terminal',                    required: false },
  { key: 'color',            label: 'Wire Color',                      required: false },
  { key: 'size',             label: 'Wire Size',                       required: false },
  { key: 'length',           label: 'Length',                          required: false },
  { key: 'sign',             label: 'Sign/Polarity',                   required: false },
  { key: 'rack',             label: 'Rack',                            required: false },
  { key: 'ref',              label: 'Ref',                             required: false },
  { key: 'remarks',          label: 'Remarks',                         required: false },
];

type UploadStep = 'file' | 'sheet' | 'mapping' | 'validate';

function isVerified(frame: any) {
  return isVerifiedFrame(frame);
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
  const [showVerify, setShowVerify] = useState<string | null>(null);
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

  useReadOnlyPoll(loadFrames, 4000);

  const handleScheduleUploaded = (frameId: string) => {
    loadFrames();
    setShowScheduleUpload(false);
    setShowVerify(frameId);
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
                  const verified = isVerified(frame);

                  // Pill CSS class and label based on assignment state
                  let pillClass = verified ? 'frame-status-verified' : 'frame-status-none';
                  let pillLabel = verified ? 'Verified' : 'Draft';
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
                          <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide">{frame.cable_count} cables</span>
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
                            <span className="text-[11px] text-slate-400 truncate max-w-[200px]" title={asgn.technician_name}>
                              {asgn.technician_name}
                            </span>
                          </div>
                        ) : (
                          <div className="flex items-center gap-2">
                            <span className={`frame-status-pill ${pillClass}`}>{pillLabel}</span>
                            {!verified ? (
                              <button
                                onClick={() => setShowVerify(frame.id)}
                                className="text-[11px] font-semibold text-blue-500 hover:text-blue-700 transition-colors whitespace-nowrap underline-offset-2 hover:underline"
                                type="button"
                                title="Verify this frame before assigning to a technician"
                              >
                                Verify →
                              </button>
                            ) : (
                              <>
                                <button
                                  onClick={() => setShowAssign(frame)}
                                  className="text-[11px] font-semibold text-green-600 hover:text-green-800 transition-colors whitespace-nowrap underline-offset-2 hover:underline"
                                  type="button"
                                  title="Assign to a technician"
                                >
                                  Assign →
                                </button>
                                <button
                                  onClick={() => setShowVerify(frame.id)}
                                  className="text-[11px] font-semibold text-slate-400 hover:text-slate-600 transition-colors whitespace-nowrap"
                                  type="button"
                                  title="Re-open verification"
                                >
                                  Re-verify →
                                </button>
                              </>
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
      {showVerify && (
        <VerificationModal
          projectCode={selectedProject}
          frameId={showVerify}
          onClose={() => setShowVerify(null)}
          onVerified={() => { setShowVerify(null); loadFrames(); }}
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

export function UploadFrameModal({ projectCode, projectName, onClose, onUploaded }: { projectCode: string; projectName?: string; onClose: () => void; onUploaded: (frameId: string) => void }) {
  const [step, setStep] = useState<UploadStep>('file');
  const [file, setFile] = useState<File | null>(null);
  const [dupInfo, setDupInfo] = useState<{ kind: 'same' | 'other'; file_name: string; project_code: string; uploaded_at: string } | null>(null);
  const [dupChoice, setDupChoice] = useState<'replace' | 'keep' | null>(null);
  const [sheets, setSheets] = useState<any[]>([]);
  const [bestSheet, setBestSheet] = useState('');
  const [selSheet, setSelSheet] = useState('');
  const [headers, setHeaders] = useState<string[]>([]);
  const [sampleRows, setSampleRows] = useState<any[][]>([]);
  const [mapping, setMapping] = useState<Record<string, string>>({});
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
  const fileRef = useRef<HTMLInputElement>(null);

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

  const buildAutoMapping = (hdrs: string[], sample: any[][]) => {
    const auto: Record<string, string> = {};
    for (const field of SYSTEM_FIELDS) {
      const match = hdrs.find((header: string) => {
        const hl = header.toLowerCase();
        if (field.key === 'sno') return hl === 's.no' || hl === 's.no.' || hl === 'sno' || hl === 'sl.no' || hl === 'sl no';
        if (field.key === 'ferrule') {
          if (hl.includes('pnl') || hl.includes('panel')) return false;
          return hl.includes('ferrule')
            || hl === 'iec_ferr_a' || (hl.includes('ferr') && !hl.endsWith('_b'))
            || hl === 'wire no' || hl === 'wire no.' || hl === 'wire number' || hl === 'cable no' || hl === 'cable no.';
        }
        if (field.key === 'source') return hl === 'source' || hl === 'from';
        if (field.key === 'destination') return hl === 'destination' || hl === 'to' || hl === 'dest';
        if (field.key === 'color') return hl.includes('color') || hl.includes('colour');
        if (field.key === 'size') return (hl.includes('size') || hl.includes('sq')) && !hl.includes('source');
        if (field.key === 'length') return hl.includes('length') || hl.includes('len(') || hl.includes('length(');
        if (field.key === 'ref') return hl === 'ref' || hl.includes('refrnce') || hl.includes('reference');
        if (field.key === 'remarks') return hl.includes('remark');
        if (field.key === 'sign') return hl.includes('sign') || hl === 'sign mark';
        if (field.key === 'rack') return hl === 'rack';
        if (field.key === 'panel') return (hl.includes('panel') && !hl.includes('layout')) || hl.includes('pnlno') || hl === 'pnl no' || hl === 'pnl_no';
        if (field.key === 'source_device') return hl.includes('src_dev') || hl === 'dev_tblk_a' || hl === 'dev_a';
        if (field.key === 'source_terminal') return hl === 'term_a' || hl === 'src_term' || hl === 'terminal_a';
        if (field.key === 'dest_device') return hl.includes('dst_dev') || hl === 'dev_tblk_b' || hl === 'dev_b';
        if (field.key === 'dest_terminal') return hl === 'term_b' || hl === 'dst_term' || hl === 'terminal_b';
        return false;
      });
      if (match) auto[field.key] = match;
    }

    if (!auto['path'] && !auto['source'] && !auto['destination']) {
      const pathCol = hdrs.find((_header, hidx) => {
        const sampleVal = String(sample[0]?.[hidx] ?? '');
        return sampleVal.includes('/') && sampleVal.length > 3;
      });
      if (pathCol) auto['path'] = pathCol;
    }
    return auto;
  };

  const selectSheet = (name: string, sheetList = sheets) => {
    setSelSheet(name);
    const selected = sheetList.find(sheet => sheet.name === name);
    const hdrs: string[] = selected?.headers || [];
    const rows: any[][] = selected?.sample_rows || [];
    setHeaders(hdrs);
    setSampleRows(rows);
    setHeaderRow(selected?.header_row ?? 0);
    setMapping(buildAutoMapping(hdrs, rows));
    setPreview(null);
    setStep('mapping');
  };

  const runPreview = async () => {
    const missing = SYSTEM_FIELDS.filter(field => field.required && !mapping[field.key]).map(field => field.label.replace(' *', ''));
    if (missing.length) {
      setError(`Map required fields: ${missing.join(', ')}`);
      return;
    }
    const hasDerivation = mapping['source'] || mapping['destination'] || mapping['path'] ||
      mapping['source_device'] || mapping['dest_device'];
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
      formData.append('mapping', JSON.stringify(mapping));
      formData.append('header_row', String(headerRow));
      const result = await uploadApi.previewMapped(projectCode, formData);
      if (result.cable_count === 0) {
        setError('No cables parsed — check your column mapping and sheet selection');
        return;
      }
      if (result.validation.error_count === 0) {
        setPreview(result);
        setProgress(0);
        const uploadData = new FormData();
        uploadData.append('file', file);
        uploadData.append('sheet_name', selSheet);
        uploadData.append('mapping', JSON.stringify(mapping));
        uploadData.append('header_row', String(headerRow));
        const uploaded = await uploadApi.uploadMapped(projectCode, uploadData, setProgress);
        onUploaded(uploaded.id);
        return;
      }
      setPreview(result);
      setStep('validate');
    } catch (apiError: any) {
      setError(apiError?.response?.data?.message || 'Preview failed');
    } finally {
      setUploading(false);
    }
  };

  const handleImport = async () => {
    if (!file) return;

    setUploading(true);
    setError('');
    setProgress(0);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('sheet_name', selSheet);
      formData.append('mapping', JSON.stringify(mapping));
      formData.append('header_row', String(headerRow));
      const result = await uploadApi.uploadMapped(projectCode, formData, setProgress);
      onUploaded(result.id);
    } catch (apiError: any) {
      setError(apiError?.response?.data?.message || 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  const requiredDone = SYSTEM_FIELDS.filter(field => field.required).every(field => !!mapping[field.key]);

  return (
    <Modal
      title="Upload Wiring Schedule"
      onClose={onClose}
      size={step === 'mapping' || step === 'validate' ? 'xl' : 'lg'}
      footer={step === 'file' ? (
        <>
          <button onClick={onClose} className="btn-secondary" type="button">Cancel</button>
          <button
            onClick={readHeaders}
            disabled={!file || uploading || dupInfo?.kind === 'same' && dupChoice !== 'replace'}
            className="btn-primary"
            type="button"
          >
            <span>{uploading ? 'Reading...' : 'Next'}</span>
            {!uploading && <ArrowRight size={16} />}
          </button>
        </>
      ) : step === 'mapping' ? (
        <>
          <button onClick={() => setStep('sheet')} className="btn-secondary" type="button" disabled={uploading}>
            <ArrowLeft size={16} />
            <span>Back</span>
          </button>
          <button onClick={onClose} className="btn-secondary" type="button" disabled={uploading}>Cancel</button>
          <button onClick={runPreview} disabled={!requiredDone || uploading} className="btn-primary" type="button">
            {uploading ? 'Parsing…' : 'Review & Import'}
          </button>
        </>
      ) : step === 'validate' ? (
        <>
          <button onClick={() => setStep('mapping')} className="btn-secondary" type="button" disabled={uploading}>
            <ArrowLeft size={16} />
            <span>Back</span>
          </button>
          <button onClick={onClose} className="btn-secondary" type="button" disabled={uploading}>Cancel</button>
          <button
            onClick={handleImport}
            disabled={uploading || !preview || preview.cable_count === 0}
            className="btn-primary"
            type="button"
          >
            {uploading
              ? `Uploading… ${progress}%`
              : preview?.validation.error_count
                ? `Import anyway (${preview.validation.error_count} issue${preview.validation.error_count === 1 ? '' : 's'})`
                : `Import ${preview?.cable_count ?? 0} cables`}
          </button>
        </>
      ) : undefined}
    >
      {step === 'file' && (
        <div>
          <p className="text-[13px] text-slate-600 leading-relaxed mb-4">
            Upload a wiring schedule for{' '}
            <span className="font-semibold text-slate-800">{projectName || projectCode}</span>
            {projectName && <span className="font-mono text-[12px] text-slate-400"> · {projectCode}</span>}
          </p>
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
                    "{dupInfo.file_name}" was uploaded on {new Date(dupInfo.uploaded_at).toLocaleDateString()}
                  </div>
                </div>
              </div>
              <div className="flex gap-2">
                <button type="button" onClick={() => setDupChoice('replace')}
                  className="flex-1 h-10 rounded-lg bg-blue-600 text-white text-[13px] font-semibold hover:bg-blue-700 transition-colors">
                  Re-upload (create new version)
                </button>
                <button type="button" onClick={() => setDupChoice('keep')}
                  className="flex-1 h-10 rounded-lg bg-white border border-slate-200 text-slate-700 text-[13px] font-semibold hover:bg-slate-50 transition-colors">
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

      {step === 'mapping' && (
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <p className="text-[13px] text-slate-600">
              Select a system field under each column. Dark green = required mapped. Blue = optional mapped.
            </p>
            {sampleRows.length > 0 && (
              <span className="text-[11px] text-slate-400 shrink-0 font-medium">{sampleRows.length} preview rows</span>
            )}
          </div>

          {headers.length > 0 && (
            <div className="mapping-table-wrap">
              <table className="mapping-table">
                <thead>
                  <tr className="mapping-col-header-row">
                    <th className="th-idx">#</th>
                    {headers.map(h => {
                      const fk = Object.keys(mapping).find(k => mapping[k] === h);
                      const f = SYSTEM_FIELDS.find(sf => sf.key === fk);
                      return (
                        <th key={h} className={f?.required ? 'col-required' : f ? 'col-mapped' : ''}>
                          <span className="block truncate max-w-[140px]" title={h}>{h}</span>
                        </th>
                      );
                    })}
                  </tr>
                  <tr className="mapping-field-header-row">
                    <th className="th-idx">→</th>
                    {headers.map(h => {
                      const fk = Object.keys(mapping).find(k => mapping[k] === h);
                      const f = SYSTEM_FIELDS.find(sf => sf.key === fk);
                      return (
                        <th key={h}>
                          <select
                            className={`mapping-select${f?.required ? ' sel-required' : f ? ' sel-mapped' : ''}`}
                            value={fk || ''}
                            onChange={e => {
                              const newKey = e.target.value;
                              setMapping(prev => {
                                const next = { ...prev };
                                for (const k of Object.keys(next)) { if (next[k] === h) delete next[k]; }
                                if (newKey) next[newKey] = h;
                                return next;
                              });
                            }}
                            aria-label={`Map column "${h}"`}
                          >
                            <option value="">— skip —</option>
                            {SYSTEM_FIELDS.map(sf => (
                              <option
                                key={sf.key}
                                value={sf.key}
                                disabled={!!mapping[sf.key] && mapping[sf.key] !== h}
                              >
                                {sf.label.replace(' *', '')}{sf.required ? ' ★' : ''}
                              </option>
                            ))}
                          </select>
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody>
                  {sampleRows.map((row, ri) => (
                    <tr key={ri}>
                      <td className="mapping-td td-idx">{ri + 1}</td>
                      {headers.map((h, ci) => {
                        const fk = Object.keys(mapping).find(k => mapping[k] === h);
                        const mono = fk && ['ferrule','source','destination','path','source_device','dest_device','source_terminal','dest_terminal'].includes(fk);
                        const val = String(row[ci] ?? '');
                        return (
                          <td key={ci} className={`mapping-td${mono ? ' td-mono' : ''}`} title={val || undefined}>
                            {val || <span className="text-slate-300 select-none">—</span>}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="flex flex-wrap gap-1.5 pt-0.5">
            {SYSTEM_FIELDS.filter(f => f.required).map(f => (
              <span key={f.key} className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2.5 py-0.5 rounded-full ${mapping[f.key] ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600'}`}>
                {mapping[f.key] ? <CheckCircle size={12} /> : '!'}
                {f.label.replace(' *', '')}
                {mapping[f.key] ? <span className="font-normal opacity-75">← {mapping[f.key]}</span> : <span className="font-normal">(not mapped)</span>}
              </span>
            ))}
            {!mapping['source'] && !mapping['destination'] && !mapping['path'] && !mapping['source_device'] && !mapping['dest_device'] && (
              <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2.5 py-0.5 rounded-full bg-amber-100 text-amber-700">
                ! Map at least one of: Source, Destination, Path, or Source Device
              </span>
            )}
          </div>

          {uploading && (
            <div className="flex flex-col gap-1.5 pt-2">
              <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
                <div
                  className="h-full rounded-full bg-blue-500 transition-[width] duration-200"
                  style={{ width: `${progress}%` }}
                />
              </div>
              <span className="text-[11.5px] text-slate-500 tabular-nums">{progress}% uploaded</span>
            </div>
          )}
        </div>
      )}

      {step === 'validate' && preview && (
        <div className="flex flex-col gap-4">
          <div className={`rounded-xl border p-4 ${preview.validation.error_count ? 'border-amber-200 bg-amber-50' : 'border-green-200 bg-green-50'}`}>
            <div className="flex items-start gap-2">
              {preview.validation.error_count
                ? <TriangleAlert size={18} className="shrink-0 text-amber-600 mt-0.5" />
                : <CheckCircle size={18} className="shrink-0 text-green-600 mt-0.5" />}
              <div>
                <div className={`text-[14px] font-bold ${preview.validation.error_count ? 'text-amber-900' : 'text-green-900'}`}>
                  {preview.cable_count} cable{preview.cable_count === 1 ? '' : 's'} parsed from “{selSheet}”
                </div>
                <div className={`text-[12px] mt-1 ${preview.validation.error_count ? 'text-amber-800' : 'text-green-800'}`}>
                  {preview.mapped_columns} columns mapped
                  {preview.unmatched_headers.length > 0 && ` · ${preview.unmatched_headers.length} Excel column(s) kept unmapped`}
                  {preview.validation.error_count
                    ? ` · ${preview.validation.error_count} field issue(s) across ${Object.keys(preview.validation.issues).length} row(s)`
                    : ' · all rows have ferrule, source, and destination'}
                </div>
              </div>
            </div>
          </div>

          {preview.validation.error_count > 0 && (
            <div className="rounded-xl border border-amber-100 bg-white overflow-hidden">
              <div className="px-3 py-2 text-[12px] font-semibold text-amber-800 bg-amber-50 border-b border-amber-100">
                Rows with missing fields (first 10)
              </div>
              <ul className="divide-y divide-slate-100 max-h-[160px] overflow-y-auto text-[12px]">
                {Object.entries(preview.validation.issues).slice(0, 10).map(([rowIdx, fields]) => (
                  <li key={rowIdx} className="px-3 py-2 text-slate-700">
                    Row {Number(rowIdx) + 1}: {Object.entries(fields).map(([f, msg]) => `${f} — ${msg}`).join('; ')}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {preview.sample_cables.length > 0 && (
            <div>
              <div className="text-[12px] font-semibold text-slate-600 mb-2">Sample parsed cables</div>
              <div className="mapping-table-wrap">
                <table className="mapping-table text-[12px]">
                  <thead>
                    <tr>
                      {['ferrule', 'source', 'destination', 'path', 'color', 'size', 'length'].map(col => (
                        <th key={col} className="capitalize">{col}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {preview.sample_cables.map((c, i) => (
                      <tr key={i}>
                        {['ferrule', 'source', 'destination', 'path', 'color', 'size', 'length'].map(col => (
                          <td key={col} className="mapping-td td-mono">{c[col] || '—'}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {uploading && (
            <div className="flex flex-col gap-1.5 pt-2">
              <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
                <div
                  className="h-full rounded-full bg-blue-500 transition-[width] duration-200"
                  style={{ width: `${progress}%` }}
                />
              </div>
              <span className="text-[11.5px] text-slate-500 tabular-nums">{progress}% uploaded</span>
            </div>
          )}
        </div>
      )}

      {error && <div className="form-error mt-2">{error}</div>}
    </Modal>
  );
}
