import { useEffect, useRef, useState } from 'react';
import { projectsApi, uploadApi } from '../../../services/api';
import type { Project } from '../../../types';
import Badge from '../../../components/Badge';
import Modal from '../../../components/Modal';
import { useAppDialog } from '../../../components/AppDialogProvider';

const SYSTEM_FIELDS = [
  { key: 'sno', label: 'S.No', required: false },
  { key: 'ferrule', label: 'Ferrule', required: true },
  { key: 'source', label: 'Source (dev:term)', required: true },
  { key: 'destination', label: 'Destination (dev:term)', required: true },
  { key: 'color', label: 'Wire Color', required: false },
  { key: 'size', label: 'Wire Size', required: false },
  { key: 'length', label: 'Length', required: false },
  { key: 'sign', label: 'Sign/Polarity', required: false },
  { key: 'rack', label: 'Rack', required: false },
  { key: 'ref', label: 'Ref', required: false },
  { key: 'remarks', label: 'Remarks', required: false },
];

type UploadStep = 'file' | 'sheet' | 'mapping' | 'done';

export default function FramesTab() {
  const dialog = useAppDialog();
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProject, setSelectedProject] = useState('');
  const [frames, setFrames] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [showUpload, setShowUpload] = useState(false);
  const [showDetail, setShowDetail] = useState<any>(null);

  useEffect(() => {
    projectsApi.list().then(data => {
      setProjects(data);
      if (data.length > 0) setSelectedProject(data[0].code);
    });
  }, []);

  useEffect(() => {
    if (!selectedProject) return;
    setLoading(true);
    projectsApi.frames(selectedProject).then(data => {
      setFrames(data);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [selectedProject]);

  const loadFrames = () => {
    if (!selectedProject) return;
    projectsApi.frames(selectedProject).then(setFrames);
  };

  const handleVerify = async (frameId: string) => {
    await projectsApi.compareVerify(selectedProject, frameId);
    loadFrames();
  };

  const handleSubmit = async (frameId: string) => {
    await projectsApi.compareSubmit(selectedProject, frameId);
    loadFrames();
  };

  const handleDelete = async (frameId: string) => {
    const ok = await dialog.confirm({
      title: 'Delete Frame',
      message: 'This also removes all assignments linked to this frame.',
      tone: 'delete',
      confirmText: 'Delete Frame',
    });
    if (!ok) return;
    await projectsApi.deleteFrame(selectedProject, frameId);
    loadFrames();
  };

  return (
    <div>
      <div className="table-toolbar">
        <select value={selectedProject} onChange={event => setSelectedProject(event.target.value)} className="dwes-select" data-layout="grow">
          {projects.map(project => <option key={project.code} value={project.code}>{project.name}</option>)}
        </select>
        <button onClick={() => setShowUpload(true)} disabled={!selectedProject} className="dwes-button dwes-button-primary" type="button">
          + Upload Wiring Schedule
        </button>
      </div>

      {loading && <div className="dwes-empty-state"><div className="dwes-empty-copy">Loading frames...</div></div>}
      {!loading && frames.length === 0 && <div className="dwes-empty-state"><div className="dwes-empty-copy">No frames uploaded yet for this project. Upload a wiring schedule to get started.</div></div>}

      <div className="stack-grid">
        {frames.map(frame => (
          <div key={frame.id} className="frame-card">
            <div className="frame-main">
              <div className="frame-title">{frame.panel_name}</div>
              <div className="frame-sub mt-xxs">{frame.original_filename} · {frame.cable_count} cables · {new Date(frame.uploaded_at).toLocaleDateString()}</div>
            </div>
            <Badge label={frame.compare_status} />
            <div className="touch-action-row">
              <button onClick={() => setShowDetail(frame)} className="button-compact" type="button">View Cables</button>
              {frame.compare_status === 'none' && <button onClick={() => handleVerify(frame.id)} className="button-compact" type="button">Verify</button>}
              {frame.compare_status === 'verified' && <button onClick={() => handleSubmit(frame.id)} className="button-compact" type="button">Validate</button>}
              <button onClick={() => handleDelete(frame.id)} className="button-compact drawing-delete-btn" type="button">Delete</button>
            </div>
          </div>
        ))}
      </div>

      {showUpload && <UploadFrameModal projectCode={selectedProject} onClose={() => setShowUpload(false)} onUploaded={loadFrames} />}
      {showDetail && <FrameDetailModal frame={showDetail} projectCode={selectedProject} onClose={() => setShowDetail(null)} />}
    </div>
  );
}

function UploadFrameModal({ projectCode, onClose, onUploaded }: { projectCode: string; onClose: () => void; onUploaded: () => void }) {
  const [step, setStep] = useState<UploadStep>('file');
  const [file, setFile] = useState<File | null>(null);
  const [dupWarning, setDupWarning] = useState('');
  const [sheets, setSheets] = useState<any[]>([]);
  const [bestSheet, setBestSheet] = useState('');
  const [selSheet, setSelSheet] = useState('');
  const [headers, setHeaders] = useState<string[]>([]);
  const [sampleRows, setSampleRows] = useState<any[][]>([]);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const hashFile = async (selectedFile: File) => {
    const buffer = await selectedFile.arrayBuffer();
    const hash = await crypto.subtle.digest('SHA-256', buffer);
    return Array.from(new Uint8Array(hash)).map(byte => byte.toString(16).padStart(2, '0')).join('');
  };

  const onFileSelect = async (selectedFile: File) => {
    setFile(selectedFile);
    setError('');
    setDupWarning('');
    const hash = await hashFile(selectedFile);
    try {
      const result = await uploadApi.checkHash(hash, selectedFile.name, 'wiring_schedule');
      if (result.duplicate) {
        setDupWarning(`Duplicate: "${result.file_name}" already uploaded to ${result.project_code} on ${new Date(result.uploaded_at).toLocaleDateString()}`);
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
      setStep('sheet');
    } catch (apiError: any) {
      setError(apiError?.response?.data?.message || 'Failed to read file');
    } finally {
      setUploading(false);
    }
  };

  const selectSheet = (name: string) => {
    setSelSheet(name);
    const selected = sheets.find(sheet => sheet.name === name);
    setHeaders(selected?.headers || []);
    setSampleRows(selected?.sample_rows || []);

    const auto: Record<string, string> = {};
    for (const field of SYSTEM_FIELDS) {
      const match = selected?.headers.find((header: string) =>
        header.toLowerCase().includes(field.key) ||
        (field.key === 'sno' && header.toLowerCase().includes('s.no')) ||
        (field.key === 'source' && (header.toLowerCase() === 'source' || header.toLowerCase() === 'from')) ||
        (field.key === 'destination' && (header.toLowerCase() === 'destination' || header.toLowerCase() === 'to')) ||
        (field.key === 'ferrule' && header.toLowerCase().includes('ferrule')),
      );
      if (match) auto[field.key] = match;
    }

    setMapping(auto);
    setStep('mapping');
  };

  const handleImport = async () => {
    const missing = SYSTEM_FIELDS.filter(field => field.required && !mapping[field.key]).map(field => field.label);
    if (missing.length) {
      setError(`Map required fields: ${missing.join(', ')}`);
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
      await uploadApi.uploadMapped(projectCode, formData);
      onUploaded();
      setStep('done');
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
      width={700}
      footer={step === 'file' ? (
        <>
          <button onClick={onClose} className="dwes-button dwes-button-neutral" type="button">Cancel</button>
          <button onClick={readHeaders} disabled={!file || uploading} className="dwes-button dwes-button-primary" type="button">{uploading ? 'Reading...' : 'Next →'}</button>
        </>
      ) : step === 'mapping' ? (
        <>
          <button onClick={() => setStep('sheet')} className="dwes-button dwes-button-neutral" type="button">← Back</button>
          <button onClick={handleImport} disabled={!requiredDone || uploading} className="dwes-button dwes-button-primary" type="button">{uploading ? 'Importing...' : 'Import Cables'}</button>
        </>
      ) : step === 'done' ? (
        <button onClick={onClose} className="dwes-button dwes-button-primary" type="button">Done</button>
      ) : undefined}
    >
      {step === 'file' && (
        <div>
          <div
            onClick={() => fileRef.current?.click()}
            onDragOver={event => event.preventDefault()}
            onDrop={event => { event.preventDefault(); const selectedFile = event.dataTransfer.files[0]; if (selectedFile) onFileSelect(selectedFile); }}
            className="drawing-dropzone"
          >
            <div className="drawing-dropzone-icon">📊</div>
            <div className={`drawing-dropzone-copy ${file ? 'has-file' : ''}`}>
              {file ? file.name : 'Click or drag-drop an Excel file (.xlsx)'}
            </div>
            <div className="drawing-meta">.xlsx, .xls - max 50MB</div>
            <input ref={fileRef} type="file" accept=".xlsx,.xls" className="drawing-hidden-input" onChange={event => { const selectedFile = event.target.files?.[0]; if (selectedFile) onFileSelect(selectedFile); }} />
          </div>
          {dupWarning && <div className="assignment-warning mt-sm">⚠ {dupWarning}</div>}
        </div>
      )}

      {step === 'sheet' && (
        <div>
          <div className="review-sub mb-md">Select the sheet containing your wiring schedule. Auto-scored best match is highlighted.</div>
          <div className="stack-grid-sm">
            {sheets.map(sheet => (
              <button key={sheet.name} onClick={() => selectSheet(sheet.name)} className={`frame-sheet-item ${sheet.name === bestSheet ? 'is-best' : ''}`} type="button">
                <div>
                  <span className="frame-title">{sheet.name}</span>
                  {sheet.name === bestSheet && <span className="frame-best-mark">★ Best match</span>}
                </div>
                <div className="frame-sub">Score: {sheet.score} · {sheet.headers.length} cols</div>
              </button>
            ))}
          </div>
        </div>
      )}

      {step === 'mapping' && (
        <div>
          <div className="review-sub mb-md">Map your Excel columns to system fields. Required fields: Ferrule, Source, Destination.</div>

          {sampleRows.length > 0 && (
            <div className="dwes-table-wrap mb-md">
              <table className="dwes-table">
                <thead>
                  <tr>{headers.map(header => <th key={header}>{header}</th>)}</tr>
                </thead>
                <tbody>
                  {sampleRows.map((row, index) => (
                    <tr key={index}>{headers.map((_, colIndex) => <td key={colIndex}>{String(row[colIndex] ?? '')}</td>)}</tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="form-grid-2">
            {SYSTEM_FIELDS.map(field => (
              <div key={field.key}>
                <label className={`dwes-label mb-xxs ${field.required && !mapping[field.key] ? 'field-required-missing' : ''}`}>{field.label}{field.required ? ' *' : ''}</label>
                <select value={mapping[field.key] || ''} onChange={event => setMapping(prev => ({ ...prev, [field.key]: event.target.value }))} className="dwes-select">
                  <option value="">-- skip --</option>
                  {headers.map(header => <option key={header} value={header}>{header}</option>)}
                </select>
              </div>
            ))}
          </div>
        </div>
      )}

      {step === 'done' && (
        <div className="assignment-success-wrap">
          <div className="assignment-success-icon">✅</div>
          <div className="assignment-success-title">Frame uploaded successfully!</div>
          <div className="assignment-success-copy mt-sm">Use "Verify" then "Validate" to unlock technician assignment.</div>
        </div>
      )}

      {error && <div className="dwes-error mt-sm">{error}</div>}
    </Modal>
  );
}

function FrameDetailModal({ frame, projectCode, onClose }: { frame: any; projectCode: string; onClose: () => void }) {
  const [cables, setCables] = useState<any[]>([]);

  useEffect(() => {
    projectsApi.frame(projectCode, frame.id).then(data => setCables(data.cables || []));
  }, [frame.id, projectCode]);

  return (
    <Modal title={`Cables - ${frame.panel_name}`} onClose={onClose} width={900}>
      <div className="review-sub mb-md">{cables.length} cables · {frame.compare_status} · {frame.original_filename}</div>
      <div className="dwes-table-wrap">
        <table className="dwes-table">
          <thead>
            <tr>
              {['#', 'Ferrule', 'Source', 'Destination', 'Color', 'Size', 'Length', 'Ref'].map(header => <th key={header}>{header}</th>)}
            </tr>
          </thead>
          <tbody>
            {cables.map((cable, index) => (
              <tr key={index}>
                <td>{cable.sno}</td>
                <td className="table-cell-mono">{cable.ferrule}</td>
                <td>{cable.source}</td>
                <td>{cable.destination}</td>
                <td>{cable.color}</td>
                <td>{cable.size}</td>
                <td>{cable.length}</td>
                <td>{cable.ref}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Modal>
  );
}
