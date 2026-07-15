import { useCallback, useEffect, useMemo, useState } from 'react';
import Modal from '../../../components/Modal';
import { Trash2, FolderKanban } from '../../../components/ui/icons';
import { adminApi, projectsApi } from '../../../services/api';
import {
  PROJECT_DELETE_CONFIRM_BUTTON,
  PROJECT_DELETE_CONFIRM_LABEL,
  PROJECT_DELETE_MODAL_TITLE,
  PROJECT_DELETE_WARNING,
} from '../../../constants/projectDeletion';
import { emitFramesChanged, onFramesChanged } from '../../../utils/projectFramesEvents';
import { useDwesRefresh, type RefreshOptions } from '../../../hooks/useDwesRefresh';
import { useLatestRequest } from '../../../hooks/useLatestRequest';

export default function DeleteProjectTab() {
  const [projects, setProjects] = useState<Array<{ code: string; name: string }>>([]);
  const [selCode, setSelCode] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(true);
  const requests = useLatestRequest();

  const selectedProject = useMemo(
    () => projects.find(p => p.code === selCode) ?? null,
    [projects, selCode],
  );

  const refreshProjects = useCallback((deletedCode?: string, options?: RefreshOptions) => {
    const silent = options?.silent === true;
    const request = requests.begin();
    if (!silent) setLoading(true);
    return projectsApi.list(request.signal)
      .then((rows) => {
        if (!requests.isLatest(request.id)) return;
        const normalized: Array<{ code: string; name: string }> = rows.map((r: { code: string; name: string }) => ({
          code: r.code,
          name: r.name,
        }));
        setProjects(normalized);

        if (normalized.length === 0) {
          setSelCode('');
          return;
        }

        if (deletedCode && selCode === deletedCode) {
          setSelCode(normalized[0].code);
          return;
        }

        if (!normalized.some((p: { code: string }) => p.code === selCode)) {
          setSelCode(normalized[0].code);
        }
      })
      .catch((requestError: any) => {
        if (silent || requestError?.code === 'ERR_CANCELED' || !requests.isLatest(request.id)) return;
        setProjects([]);
      })
      .finally(() => {
        if (!silent && requests.isLatest(request.id)) setLoading(false);
      });
  }, [requests, selCode]);

  useEffect(() => {
    void refreshProjects();
  }, [refreshProjects]);

  useDwesRefresh(options => refreshProjects(undefined, options));

  useEffect(() => onFramesChanged(detail => {
    if (detail.action !== 'deleted' || detail.frameId) return;
    requests.cancel();
    setProjects(current => current.filter(project => project.code !== detail.projectCode));
    setSelCode(current => current === detail.projectCode ? '' : current);
  }), [requests]);

  const openModal = () => {
    if (!selectedProject) return;
    setStatus('');
    setError('');
    setConfirmed(false);
    setShowModal(true);
  };

  const closeModal = () => {
    if (deleting) return;
    setShowModal(false);
    setError('');
    setConfirmed(false);
  };

  const handleDelete = async () => {
    if (!selCode || !confirmed || !selectedProject) return;
    setDeleting(true);
    setError('');
    try {
      const r = await adminApi.hardDelete(selCode);
      if (r.error) {
        setError(r.error);
        return;
      }
      setStatus(r.message || `Project "${selectedProject.name}" permanently deleted.`);
      setShowModal(false);
      setConfirmed(false);
      setProjects(current => current.filter(project => project.code !== selCode));
      emitFramesChanged({ projectCode: selCode, entity: 'project', action: 'deleted' });
      await refreshProjects(selCode);
    } catch (e: any) {
      setError(e?.response?.data?.message || e?.message || 'Delete failed');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="rounded-2xl border border-red-200 bg-[var(--t-surface-white)] shadow-sm overflow-hidden">
      <div className="px-6 py-4 border-b border-red-200 bg-red-50 flex items-center gap-3">
        <Trash2 size={20} className="text-red-700 shrink-0" />
        <div>
          <div className="text-[14px] font-bold text-red-900">Remove Project</div>
          <div className="text-[12px] text-red-700 mt-0.5">
            System Admin only. This permanently deletes the selected project and all related records and files.
          </div>
        </div>
      </div>

      <div className="p-6">
        {status ? (
          <div className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-[13px] text-emerald-700">
            {status}
          </div>
        ) : null}

        {loading ? (
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-[13px] text-slate-500 text-center">
            Loading projects…
          </div>
        ) : projects.length === 0 ? (
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-[13px] text-slate-500 text-center">
            No active projects to delete.
          </div>
        ) : (
          <>
            <div className="mb-5">
              <label className="form-label mb-1">Select project</label>
              <div className="field-with-icon">
                <span className="field-lead-icon"><FolderKanban size={18} /></span>
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
            </div>

            <button
              type="button"
              onClick={openModal}
              disabled={!selectedProject}
              className="w-full h-14 rounded-2xl bg-red-700 text-white font-bold text-[15px] hover:bg-red-800 active:scale-[0.98] transition-all flex items-center justify-center gap-2 shadow-sm disabled:opacity-60 disabled:cursor-not-allowed"
            >
              <Trash2 size={20} />
              Remove Project
            </button>
          </>
        )}
      </div>

      {showModal && selectedProject && (
        <Modal
          title={PROJECT_DELETE_MODAL_TITLE}
          icon={<Trash2 />}
          iconTone="danger"
          onClose={closeModal}
          size="default"
          closeOnBackdrop={!deleting}
          closeOnEscape={!deleting}
          footer={(
            <div className="flex gap-2">
              <button
                type="button"
                className="btn-secondary flex-1"
                onClick={closeModal}
                disabled={deleting}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn-danger flex-1"
                onClick={() => void handleDelete()}
                disabled={deleting || !confirmed}
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
                checked={confirmed}
                disabled={deleting}
                onChange={e => setConfirmed(e.target.checked)}
              />
              <span>{PROJECT_DELETE_CONFIRM_LABEL}</span>
            </label>

            {error ? <div className="form-error">{error}</div> : null}
          </div>
        </Modal>
      )}
    </div>
  );
}
