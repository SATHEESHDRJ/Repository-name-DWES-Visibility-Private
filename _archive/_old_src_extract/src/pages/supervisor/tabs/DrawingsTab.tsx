import { useState, useEffect, useRef } from 'react';
import { projectsApi, uploadApi } from '../../../services/api';
import type { Project } from '../../../types';
import Modal from '../../../components/Modal';
import { useAppDialog } from '../../../components/AppDialogProvider';

export default function DrawingsTab() {
  const dialog = useAppDialog();
  const [projects, setProjects] = useState<Project[]>([]);
  const [selProject, setSelProject] = useState('');
  const [drawings, setDrawings] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [showUpload, setShowUpload] = useState(false);

  useEffect(() => {
    projectsApi.list().then(d => { setProjects(d); if (d.length) setSelProject(d[0].code); });
  }, []);

  const loadDrawings = () => {
    if (!selProject) return;
    setLoading(true);
    projectsApi.drawings(selProject).then(d => { setDrawings(d); setLoading(false); }).catch(() => setLoading(false));
  };
  useEffect(loadDrawings, [selProject]);

  const handleDelete = async (file: string) => {
    const ok = await dialog.confirm({
      title: 'Delete Drawing',
      message: `Delete drawing "${file}"?`,
      tone: 'delete',
      confirmText: 'Delete Drawing',
    });
    if (!ok) return;
    await projectsApi.deleteDrawing(selProject, file).catch(() => {});
    loadDrawings();
  };

  const formatSize = (bytes: number) => {
    if (bytes > 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
    return `${(bytes / 1024).toFixed(0)} KB`;
  };

  const extIcon = (name: string) => {
    const ext = name.split('.').pop()?.toLowerCase();
    if (ext === 'pdf') return '📄';
    if (['png','jpg','jpeg','svg','bmp','tiff','tif'].includes(ext || '')) return '🖼️';
    if (['dwg','dxf'].includes(ext || '')) return '📐';
    return '📎';
  };

  return (
    <div>
      <div className="table-toolbar">
        <select value={selProject} onChange={e => setSelProject(e.target.value)} className="dwes-select" data-layout="grow">
          {projects.map(p => <option key={p.code} value={p.code}>{p.name}</option>)}
        </select>
        <button onClick={() => setShowUpload(true)} disabled={!selProject}
          className="dwes-button dwes-button-primary" type="button">
          + Upload Drawing
        </button>
      </div>

      {loading && <div className="dwes-empty-state"><div className="dwes-empty-copy">Loading drawings...</div></div>}

      {!loading && drawings.length === 0 && (
        <div className="dwes-empty-state history-empty-state">
          <div className="history-empty-icon">🗺️</div>
          No drawings uploaded for this project. GA drawings and schematics can be uploaded here.
        </div>
      )}

      <div className="drawings-grid">
        {drawings.map(d => (
          <div key={d.file_name} className="drawing-card">
            <div className="drawing-head">
              <span className="drawing-icon">{extIcon(d.file_name)}</span>
              <div className="drawing-main">
                <div className="drawing-name">
                  {d.file_name}
                </div>
                <div className="drawing-meta mt-xxs">
                  {d.size ? formatSize(d.size) : '—'} · {new Date(d.uploaded_at).toLocaleDateString()}
                </div>
              </div>
            </div>
            {d.drawing_type && (
              <div className="drawing-type-pill">
                {d.drawing_type}
              </div>
            )}
            <button onClick={() => handleDelete(d.file_name)} className="button-compact drawing-delete-btn" type="button">
              Delete
            </button>
          </div>
        ))}
      </div>

      {showUpload && (
        <UploadDrawingModal
          projectCode={selProject}
          onClose={() => setShowUpload(false)}
          onUploaded={loadDrawings}
        />
      )}
    </div>
  );
}

function UploadDrawingModal({ projectCode, onClose, onUploaded }: { projectCode: string; onClose: () => void; onUploaded: () => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [drawingType, setDrawingType] = useState('GA_DRAWING');
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleUpload = async () => {
    if (!file) { setError('Select a file'); return; }
    setUploading(true); setError('');
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('drawing_type', drawingType);
      await uploadApi.drawing(projectCode, fd);
      setDone(true); onUploaded();
    } catch (e: any) { setError(e?.response?.data?.message || 'Upload failed'); }
    finally { setUploading(false); }
  };

  const DRAWING_TYPES = ['GA_DRAWING', 'SCHEMATIC', 'WIRING_DIAGRAM', 'LAYOUT', 'SLD', 'PANEL_LAYOUT', 'CABLE_SCHEDULE', 'OTHER'];

  return (
    <Modal title="Upload Drawing" onClose={onClose}
      footer={!done ? (
        <>
          <button onClick={onClose} className="dwes-button dwes-button-neutral" type="button">Cancel</button>
          <button onClick={handleUpload} disabled={!file || uploading} className="dwes-button dwes-button-primary" type="button">
            {uploading ? 'Uploading…' : 'Upload'}
          </button>
        </>
      ) : (
        <button onClick={onClose} className="dwes-button dwes-button-primary" type="button">Done</button>
      )}>
      {!done ? (
        <>
          <div
            onClick={() => fileRef.current?.click()}
            onDragOver={e => e.preventDefault()}
            onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) setFile(f); }}
            className="drawing-dropzone">
            <div className="drawing-dropzone-icon">🗺️</div>
            <div className={`drawing-dropzone-copy ${file ? 'has-file' : ''}`}>
              {file ? file.name : 'Click or drag-drop PDF, DWG, DXF, PNG, JPG, SVG'}
            </div>
            <input ref={fileRef} type="file" accept=".pdf,.dwg,.dxf,.png,.jpg,.jpeg,.svg,.bmp,.tiff,.tif" className="drawing-hidden-input"
              onChange={e => { const f = e.target.files?.[0]; if (f) setFile(f); }} />
          </div>
          <div>
            <label className="dwes-label mb-xxs">Drawing Type</label>
            <select value={drawingType} onChange={e => setDrawingType(e.target.value)} className="dwes-select">
              {DRAWING_TYPES.map(t => <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>)}
            </select>
          </div>
          {error && <div className="dwes-error mt-sm">{error}</div>}
        </>
      ) : (
        <div className="assignment-success-wrap">
          <div className="assignment-success-icon">✅</div>
          <div className="assignment-success-title">Drawing uploaded successfully!</div>
        </div>
      )}
    </Modal>
  );
}
