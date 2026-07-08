import { useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, ShieldAlert, Trash2 } from '../../../components/ui/icons';
import Modal from '../../../components/Modal';
import { adminApi, projectsApi } from '../../../services/api';

interface Precheck {
  project: { code: string; name: string; state: string };
  counts: {
    frames: number;
    drawings: number;
    assignments: number;
    inspections: number;
    file_hashes: number;
    audit_logs: number;
  };
  delete_warning: string;
}

export default function DeleteProjectTab() {
  const [projects, setProjects] = useState<any[]>([]);
  const [selCode, setSelCode] = useState('');
  const [precheck, setPrecheck] = useState<Precheck | null>(null);
  const [precheckErr, setPrecheckErr] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [confirmCode, setConfirmCode] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    projectsApi.list()
      .then(d => {
        setProjects(d);
        if (d.length) setSelCode(d[0].code);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!selCode) {
      setPrecheck(null);
      return;
    }
    setPrecheckErr('');
    setPrecheck(null);
    adminApi.hardDeletePrecheck(selCode)
      .then(d => { if (d.error) setPrecheckErr(d.error); else setPrecheck(d); })
      .catch(() => setPrecheckErr('Could not load project details'));
  }, [selCode]);

  const openModal = () => {
    setConfirmCode('');
    setError('');
    setResult(null);
    setShowModal(true);
  };

  const closeModal = () => {
    if (deleting) return;
    setShowModal(false);
    setConfirmCode('');
    setError('');
    setResult(null);
  };

  const refreshProjects = () => {
    projectsApi.list()
      .then(d => {
        setProjects(d);
        if (d.length && !d.some((p: { code: string }) => p.code === selCode)) {
          setSelCode(d[0].code);
        }
      })
      .catch(() => {});
  };

  const handleDelete = async () => {
    if (!selCode || confirmCode.trim() !== selCode.trim()) return;
    setDeleting(true);
    setError('');
    try {
      const r = await adminApi.hardDelete(selCode, confirmCode);
      if (r.error) {
        setError(r.error);
        setDeleting(false);
        return;
      }
      setResult(r);
      refreshProjects();
    } catch (e: any) {
      setError(e?.response?.data?.message || e?.message || 'Delete failed');
    } finally {
      setDeleting(false);
    }
  };

  const counts = precheck?.counts;

  return (
    <div className="rounded-2xl border border-red-200 bg-white shadow-sm overflow-hidden">
      <div className="px-6 py-4 border-b border-red-200 bg-red-50 flex items-center gap-3">
        <Trash2 size={20} className="text-red-700 shrink-0" />
        <div>
          <div className="text-[14px] font-bold text-red-900">Permanently Delete Project</div>
          <div className="text-[12px] text-red-700 mt-0.5">
            System Admin only. Removes the project row, all related database records, and the entire
            uploads folder. No backup is created and there is no restore path within DWES.
          </div>
        </div>
      </div>

      <div className="p-6">
        {projects.length === 0 ? (
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-[13px] text-slate-500 text-center">
            No active projects to delete.
          </div>
        ) : (
          <>
            <div className="mb-5">
              <label className="form-label mb-1">Select project</label>
              <select
                value={selCode}
                onChange={e => setSelCode(e.target.value)}
                className="form-select"
                aria-label="Select project to delete"
              >
                {projects.map(p => (
                  <option key={p.code} value={p.code}>{p.name} ({p.code})</option>
                ))}
              </select>
            </div>

            {precheckErr && <div className="form-error mb-4">{precheckErr}</div>}

            {precheck && counts && (
              <>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-4">
                  {[
                    { label: 'Frames', value: counts.frames },
                    { label: 'Drawings', value: counts.drawings },
                    { label: 'Assignments', value: counts.assignments },
                    { label: 'Inspections', value: counts.inspections },
                    { label: 'Hash records', value: counts.file_hashes },
                    { label: 'Audit entries', value: counts.audit_logs },
                  ].map(item => (
                    <div
                      key={item.label}
                      className={`rounded-xl p-3 border text-center ${
                        item.value > 0 ? 'border-red-200 bg-red-50' : 'border-slate-100 bg-slate-50'
                      }`}
                    >
                      <div className={`text-[22px] font-bold leading-none ${
                        item.value > 0 ? 'text-red-700' : 'text-slate-400'
                      }`}>
                        {item.value}
                      </div>
                      <div className="text-[11px] text-slate-500 mt-1">{item.label}</div>
                    </div>
                  ))}
                </div>

                <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-[12px] text-red-800 font-medium flex items-start gap-2 mb-4">
                  <ShieldAlert size={14} className="shrink-0 mt-0.5 text-red-600" />
                  {precheck.delete_warning}
                </div>

                <button
                  type="button"
                  onClick={openModal}
                  className="w-full h-[56px] rounded-2xl bg-red-700 text-white font-bold text-[15px] hover:bg-red-800 active:scale-[0.98] transition-all flex items-center justify-center gap-2 shadow-sm"
                >
                  <Trash2 size={20} />
                  Permanently Delete: {precheck.project.name}
                </button>
              </>
            )}
          </>
        )}
      </div>

      {showModal && precheck && (
        <Modal
          title="Confirm Permanent Delete"
          onClose={closeModal}
          size="lg"
          footer={result ? undefined : (
            <div className="flex gap-3 w-full">
              <button
                type="button"
                onClick={closeModal}
                disabled={deleting}
                className="flex-1 h-[56px] rounded-xl border border-slate-200 bg-white text-slate-700 font-semibold text-[14px] hover:bg-slate-50 transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDelete}
                disabled={deleting || confirmCode.trim() !== selCode.trim()}
                className="flex-1 h-[56px] rounded-xl bg-red-700 text-white font-bold text-[14px] hover:bg-red-800 transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {deleting ? (
                  <>
                    <span className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                    Deleting…
                  </>
                ) : (
                  <>
                    <Trash2 size={16} />
                    Permanently Delete
                  </>
                )}
              </button>
            </div>
          )}
        >
          {!result ? (
            <>
              <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 mb-4 flex items-start gap-2">
                <AlertTriangle size={16} className="text-red-700 shrink-0 mt-0.5" />
                <div className="text-[12px] text-red-700">
                  This permanently deletes <strong>{precheck.project.name}</strong> ({selCode}) from the
                  database and disk. No backup is created. This cannot be undone within DWES.
                </div>
              </div>

              <div className="flex flex-col gap-1.5 mb-4">
                <label className="text-[12px] font-medium text-slate-700">
                  Type <span className="font-mono font-bold text-red-700">{selCode}</span> to confirm
                </label>
                <input
                  type="text"
                  value={confirmCode}
                  onChange={e => { setConfirmCode(e.target.value); setError(''); }}
                  placeholder={selCode}
                  autoFocus
                  disabled={deleting}
                  className="w-full h-12 px-3 text-[14px] font-mono border-[1.5px] border-slate-200 rounded-xl focus:border-red-400 focus:ring-[3px] focus:ring-red-400/12 outline-none"
                />
              </div>

              {error && <div className="form-error">{error}</div>}
            </>
          ) : (
            <div className="text-center">
              <CheckCircle2 size={48} className="text-green-500 mx-auto mb-3" />
              <div className="text-[16px] font-bold text-slate-800 mb-2">Project permanently deleted</div>
              <div className="text-[13px] text-slate-600 mb-4">{result.message}</div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-left text-[12px] text-slate-600 mb-4 space-y-1">
                <div>
                  Deleted: {result.deleted.assignments} assignments, {result.deleted.inspections} inspections,{' '}
                  {result.deleted.file_hashes} hash records, {result.deleted.audit_logs} audit entries
                </div>
                <div>
                  Disk: uploads/{selCode}/ {result.deleted.folder_removed ? 'removed' : 'was not present'}
                </div>
              </div>
              <button
                type="button"
                onClick={closeModal}
                className="h-11 px-8 rounded-xl bg-slate-800 text-white font-semibold text-[14px] hover:bg-slate-900 transition-colors"
              >
                Close
              </button>
            </div>
          )}
        </Modal>
      )}
    </div>
  );
}
