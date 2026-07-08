import { useState, useEffect, useRef } from 'react';
import { projectsApi, uploadApi } from '../../../services/api';
import type { Project } from '../../../types';
import Modal from '../../../components/Modal';
import { usePermissions } from '../../../hooks/usePermissions';
import { Upload, Trash2, FileText, FileImage, PenTool, Paperclip, Map, CheckCircle, CheckCircle2, ExternalLink, TriangleAlert, ShieldAlert } from '../../../components/ui/icons';

export default function DrawingsTab() {
  const perms = usePermissions();
  const [projects, setProjects] = useState<Project[]>([]);
  const [selProject, setSelProject] = useState('');
  const [drawings, setDrawings] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [showUpload, setShowUpload] = useState(false);
  const [viewing, setViewing] = useState<string | null>(null);
  const [drawingToDelete, setDrawingToDelete] = useState<any>(null);

  useEffect(() => {
    projectsApi.list().then(d => { setProjects(d); if (d.length) setSelProject(d[0].code); });
  }, []);

  const loadDrawings = () => {
    if (!selProject) return;
    setLoading(true);
    projectsApi.drawings(selProject).then(d => { setDrawings(d); setLoading(false); }).catch(() => setLoading(false));
  };
  useEffect(loadDrawings, [selProject]);

  const handleView = async (d: any) => {
    setViewing(d.id);
    try {
      const blob = await projectsApi.drawingFile(selProject, d.id);
      const url = URL.createObjectURL(blob);
      const ext = (d.original_name as string).split('.').pop()?.toLowerCase();
      if (['dwg', 'dxf'].includes(ext || '')) {
        const a = document.createElement('a');
        a.href = url; a.download = d.original_name; a.click();
      } else {
        window.open(url, '_blank');
      }
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch {
      // ignore — backend returns 403 if not authorized
    } finally {
      setViewing(null);
    }
  };

  const handleDelete = (d: any) => { setDrawingToDelete(d); };

  const formatSize = (bytes: number) => {
    if (bytes > 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
    return `${(bytes / 1024).toFixed(0)} KB`;
  };

  const extIcon = (name: string) => {
    const ext = name.split('.').pop()?.toLowerCase();
    if (ext === 'pdf') return <FileText size={20} className="text-red-500" />;
    if (['png', 'jpg', 'jpeg', 'svg', 'bmp', 'tiff', 'tif'].includes(ext || '')) return <FileImage size={20} className="text-blue-500" />;
    if (['dwg', 'dxf'].includes(ext || '')) return <PenTool size={20} className="text-purple-500" />;
    return <Paperclip size={20} className="text-slate-400" />;
  };

  return (
    <div>
      <div className="toolbar">
        <select value={selProject} onChange={e => setSelProject(e.target.value)} className="form-select" data-layout="grow" aria-label="Select project">
          {projects.map(p => <option key={p.code} value={p.code}>{p.name}</option>)}
        </select>
        {perms.canManageProjects && (
          <button onClick={() => setShowUpload(true)} disabled={!selProject}
            className="btn-primary" type="button">
            <Upload size={18} />
            <span>Upload Drawing</span>
          </button>
        )}
      </div>

      {loading && <div className="empty-state"><p className="empty-text">Loading drawings...</p></div>}

      {!loading && drawings.length === 0 && (
        <div className="empty-state history-empty-state">
          <div className="history-empty-icon"><Map size={32} /></div>
          No drawings uploaded for this project. GA drawings and schematics can be uploaded here.
        </div>
      )}

      <div className="drawings-grid">
        {drawings.map(d => (
          <div key={d.id} className="drawing-card">
            <div className="drawing-head">
              <span className="drawing-icon">{extIcon(d.original_name)}</span>
              <div className="drawing-main">
                <div className="drawing-name" title={d.original_name}>{d.original_name}</div>
                <div className="drawing-meta">
                  {d.size ? formatSize(d.size) : '—'} · {new Date(d.uploaded_at).toLocaleDateString()}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <button
                title="View / Download"
                onClick={() => handleView(d)}
                disabled={viewing === d.id}
                className="flex items-center justify-center w-[36px] h-[36px] text-slate-400 rounded-[8px] bg-white border border-[#E2E8F0] hover:border-blue-300 hover:text-blue-600 hover:bg-blue-50 transition-colors disabled:opacity-50"
                type="button"
              >
                <ExternalLink size={16} strokeWidth={1.5} />
              </button>
              {perms.canManageProjects && (
                <button
                  title="Delete Drawing"
                  onClick={() => handleDelete(d)}
                  className="flex items-center justify-center w-[36px] h-[36px] text-slate-400 rounded-[8px] bg-white border border-[#E2E8F0] hover:border-red-200 hover:text-red-600 hover:bg-red-50 transition-colors"
                  type="button"
                >
                  <Trash2 size={16} strokeWidth={1.5} />
                </button>
              )}
            </div>
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
      {drawingToDelete && (
        <DrawingDeleteModal
          drawing={drawingToDelete}
          projectCode={selProject}
          onClose={() => setDrawingToDelete(null)}
          onDeleted={() => { setDrawingToDelete(null); loadDrawings(); }}
        />
      )}
    </div>
  );
}

export function UploadDrawingModal({ projectCode, onClose, onUploaded }: {
  projectCode: string; onClose: () => void; onUploaded: () => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  // dupInfo: null = no dup, 'same' = dup in this project, 'other' = dup in another project
  const [dupInfo, setDupInfo] = useState<{ kind: 'same' | 'other'; file_name: string; project_code: string; uploaded_at: string } | null>(null);
  const [dupChoice, setDupChoice] = useState<'replace' | 'keep' | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const hashFile = async (f: File) => {
    const buf = await f.arrayBuffer();
    const hash = await crypto.subtle.digest('SHA-256', buf);
    return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
  };

  const onFileSelect = async (f: File) => {
    setFile(f);
    setError('');
    setDupInfo(null);
    setDupChoice(null);
    try {
      const hash = await hashFile(f);
      // Scoped check: only look in THIS project first
      const result = await uploadApi.checkHash(hash, f.name, 'drawing', projectCode);
      if (result.duplicate) {
        setDupInfo({ kind: 'same', file_name: result.file_name, project_code: result.project_code, uploaded_at: result.uploaded_at });
        return;
      }
      // Also check globally in case it's in another project (informational only)
      const global = await uploadApi.checkHash(hash, f.name, 'drawing');
      if (global.duplicate) {
        setDupInfo({ kind: 'other', file_name: global.file_name, project_code: global.project_code, uploaded_at: global.uploaded_at });
      }
    } catch {
      // ignore dup-check errors
    }
  };

  const handleUpload = async () => {
    if (!file) { setError('Select a file'); return; }
    // Same-project dup: user must explicitly choose Replace
    if (dupInfo?.kind === 'same' && dupChoice !== 'replace') {
      setError('Choose "Replace" or "Keep existing" before uploading.');
      return;
    }
    setUploading(true); setError('');
    try {
      const fd = new FormData();
      fd.append('file', file);
      await uploadApi.drawing(projectCode, fd);
      setDone(true); onUploaded();
    } catch (e: any) { setError(e?.response?.data?.message || 'Upload failed'); }
    finally { setUploading(false); }
  };

  const canUpload = !!file && !uploading && (dupInfo?.kind !== 'same' || dupChoice === 'replace');

  return (
    <Modal title="Upload Drawing" onClose={onClose}
      footer={!done ? (
        <>
          <button onClick={onClose} className="btn-secondary" type="button">Cancel</button>
          <button onClick={handleUpload} disabled={!canUpload} className="btn-primary" type="button">
            {uploading ? 'Uploading…' : dupChoice === 'replace' ? 'Replace & Upload' : 'Upload'}
          </button>
        </>
      ) : (
        <button onClick={onClose} className="btn-primary" type="button">Done</button>
      )}>
      {!done ? (
        <>
          <div
            onClick={() => fileRef.current?.click()}
            onDragOver={e => e.preventDefault()}
            onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) onFileSelect(f); }}
            className="drawing-dropzone"
          >
            <div className="drawing-dropzone-icon"><Map size={32} /></div>
            <div className={`drawing-dropzone-copy ${file ? 'has-file' : ''}`}>
              {file ? file.name : 'Click or drag-drop PDF, DWG, DXF, PNG, JPG, SVG'}
            </div>
            <div className="drawing-meta mt-1">.pdf .dwg .dxf .png .jpg .svg · max 50 MB</div>
            <input ref={fileRef} type="file" accept=".pdf,.dwg,.dxf,.png,.jpg,.jpeg,.svg,.bmp,.tiff,.tif"
              className="drawing-hidden-input" aria-label="Select drawing file"
              onChange={e => { const f = e.target.files?.[0]; if (f) onFileSelect(f); }} />
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
                <button
                  type="button"
                  onClick={() => setDupChoice('replace')}
                  className="flex-1 h-10 rounded-lg bg-blue-600 text-white text-[13px] font-semibold hover:bg-blue-700 transition-colors"
                >
                  Replace (re-upload)
                </button>
                <button
                  type="button"
                  onClick={() => setDupChoice('keep')}
                  className="flex-1 h-10 rounded-lg bg-white border border-slate-200 text-slate-700 text-[13px] font-semibold hover:bg-slate-50 transition-colors"
                >
                  Keep existing
                </button>
              </div>
            </div>
          )}

          {dupInfo?.kind === 'same' && dupChoice === 'keep' && (
            <div className="mt-3 p-3 rounded-xl bg-slate-50 border border-slate-200 text-[13px] text-slate-600 flex items-center gap-2">
              <CheckCircle size={16} className="text-green-500 shrink-0" />
              Keeping existing drawing — no changes made.
              <button type="button" onClick={() => setDupChoice(null)} className="ml-auto text-[12px] text-blue-600 hover:underline">Change</button>
            </div>
          )}

          {dupInfo?.kind === 'same' && dupChoice === 'replace' && (
            <div className="mt-3 p-3 rounded-xl bg-blue-50 border border-blue-200 text-[13px] text-blue-700 flex items-center gap-2">
              <TriangleAlert size={16} className="shrink-0" />
              Will re-upload "{dupInfo.file_name}" — click "Replace &amp; Upload" to confirm.
              <button type="button" onClick={() => setDupChoice(null)} className="ml-auto text-[12px] text-slate-500 hover:underline">Change</button>
            </div>
          )}

          {dupInfo?.kind === 'other' && (
            <div className="assignment-warning flex items-center gap-1 mt-3">
              <TriangleAlert size={16} className="shrink-0" />
              This file was also used in project <strong>{dupInfo.project_code}</strong> — you can still upload it here.
            </div>
          )}

          {error && <div className="form-error mt-2">{error}</div>}
        </>
      ) : (
        <div className="assignment-success-wrap">
          <div className="assignment-success-icon"><CheckCircle size={48} className="text-green-500" /></div>
          <div className="assignment-success-title">Drawing uploaded successfully!</div>
        </div>
      )}
    </Modal>
  );
}

// ── Drawing Delete Modal (backup-first + type-to-confirm) ─────────────────────

export function DrawingDeleteModal({ drawing, projectCode, onClose, onDeleted }: {
  drawing: any; projectCode: string; onClose: () => void; onDeleted: () => void;
}) {
  const PHRASE = `DELETE DRAWING ${(drawing.original_name || '').trim()}`;
  const [typed, setTyped] = useState('');
  const [error, setError] = useState('');
  const [result, setResult] = useState<any>(null);
  const [deleting, setDeleting] = useState(false);
  const [precheck, setPrecheck] = useState<any>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setTimeout(() => inputRef.current?.focus(), 80);
    projectsApi.deleteDrawingPrecheck(projectCode, drawing.id)
      .then(setPrecheck)
      .catch(() => {});
  }, [projectCode, drawing.id]);

  const close = () => { if (!deleting) onClose(); };

  const handleConfirm = async () => {
    if (typed.trim() !== PHRASE) return;
    setDeleting(true);
    setError('');
    try {
      const r = await projectsApi.deleteDrawingGuarded(projectCode, drawing.id, typed);
      if (r?.error) { setError(r.error); return; }
      setResult(r);
      onDeleted();
    } catch (e: any) {
      setError(e?.response?.data?.message || e?.message || 'Failed to delete drawing');
    } finally {
      setDeleting(false);
    }
  };

  const formatSize = (bytes: number) =>
    bytes > 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${(bytes / 1024).toFixed(0)} KB`;

  return (
    <div className="modal-overlay z-[210]" onClick={close}>
      <div className="modal-box overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="px-6 pt-6 pb-4 border-b border-red-200 bg-red-50">
          <div className="flex items-center gap-2 mb-1">
            <ShieldAlert size={18} className="text-red-700" />
            <span className="text-[15px] font-bold text-red-900">Confirm: Delete Drawing</span>
          </div>
          <div className="text-[12px] text-red-700">This is permanent and cannot be undone.</div>
        </div>

        <div className="p-6 overflow-y-auto min-h-0">
          {!result ? (
            <>
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 mb-4 text-[13px] text-slate-700">
                <div className="font-semibold text-slate-800 mb-2">The following will be permanently deleted:</div>
                <ul className="space-y-1">
                  <li>• Drawing file: <strong>{drawing.original_name}</strong></li>
                  {(precheck?.size ?? drawing.size) && (
                    <li>• Size: {formatSize(precheck?.size ?? drawing.size)}</li>
                  )}
                </ul>
                <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-[12px] text-amber-800 font-medium flex items-start gap-2">
                  <TriangleAlert size={14} className="shrink-0 mt-0.5 text-amber-600" />
                  This drawing file will be permanently removed — technicians and supervisors will no longer be able to view it.
                </div>
                <div className="mt-3 text-[12px] text-emerald-700 flex items-start gap-1.5">
                  <CheckCircle2 size={14} className="shrink-0 mt-0.5" />
                  pg_dump of WiringSchemeDB + drawing file archived to <strong>uploads/backups/</strong> before deletion.
                </div>
              </div>

              <div className="mb-4">
                <label className="form-label mb-1">
                  Type{' '}
                  <code className="text-red-700 font-bold bg-red-50 px-1.5 py-0.5 rounded text-[13px]">{PHRASE}</code>{' '}
                  to confirm
                </label>
                <input
                  ref={inputRef}
                  type="text"
                  value={typed}
                  onChange={e => {
                    const v = e.target.value;
                    if (import.meta.env.DEV) console.log('[delete-drawing] typed:', JSON.stringify(v), 'match:', v.trim() === PHRASE);
                    setTyped(v);
                    setError('');
                  }}
                  placeholder={PHRASE}
                  className="w-full h-12 px-3 border border-slate-200 rounded-xl text-[14px] font-mono focus:border-red-400 focus:ring-2 focus:ring-red-100 outline-none"
                  onKeyDown={e => { if (e.key === 'Enter' && typed.trim() === PHRASE) handleConfirm(); }}
                  disabled={deleting}
                />
              </div>

              {error && <div className="form-error mb-3">{error}</div>}

              <div className="flex gap-3">
                <button type="button" onClick={close} disabled={deleting}
                  className="flex-1 h-[56px] rounded-xl border border-slate-200 bg-white text-slate-700 font-semibold text-[14px] hover:bg-slate-50 transition-colors disabled:opacity-50">
                  Cancel
                </button>
                <button type="button" onClick={handleConfirm} disabled={deleting || typed.trim() !== PHRASE}
                  className="flex-1 h-[56px] rounded-xl bg-red-700 text-white font-bold text-[14px] hover:bg-red-800 transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2">
                  {deleting ? (
                    <><span className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />Deleting…</>
                  ) : (
                    <><Trash2 size={16} />Delete Drawing</>
                  )}
                </button>
              </div>
            </>
          ) : (
            <div className="text-center">
              <CheckCircle2 size={48} className="text-green-500 mx-auto mb-3" />
              <div className="text-[16px] font-bold text-slate-800 mb-2">Drawing deleted</div>
              <div className="text-[13px] text-slate-600 mb-4">{result.message}</div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-left text-[12px] text-slate-600 mb-4 space-y-1">
                <div className="text-green-700 font-medium break-all">Backup: {result.backup?.dump}</div>
              </div>
              <button type="button" onClick={onClose}
                className="h-11 px-8 rounded-xl bg-slate-800 text-white font-semibold text-[14px] hover:bg-slate-900 transition-colors">
                Close
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
