import { useEffect, useState } from 'react';
import { AlertTriangle, Trash2 } from '../../../components/ui/icons';
import DeleteConfirmModal, {
  type DeleteResultSummary,
  type DeleteScopeId,
} from '../../../components/ui/DeleteConfirmModal';
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
  const [deleting, setDeleting] = useState(false);
  const [result, setResult] = useState<DeleteResultSummary | null>(null);
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
    setError('');
    setResult(null);
    setShowModal(true);
  };

  const closeModal = () => {
    if (deleting) return;
    setShowModal(false);
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

  const handleDelete = async (_scope: DeleteScopeId) => {
    if (!selCode) return;
    setDeleting(true);
    setError('');
    try {
      // API still requires confirmed_code — send project code after checkbox ack (hidden from UI).
      const r = await adminApi.hardDelete(selCode, selCode);
      if (r.error) {
        setError(r.error);
        setDeleting(false);
        return;
      }
      setResult({
        title: 'Project permanently deleted',
        message: r.message || `${precheck?.project.name || selCode} was permanently removed.`,
        removed: [
          `Project ${precheck?.project.name || selCode} (${selCode})`,
          `${r.deleted?.assignments ?? precheck?.counts.assignments ?? 0} assignments`,
          `${r.deleted?.inspections ?? precheck?.counts.inspections ?? 0} inspections`,
          `${r.deleted?.file_hashes ?? precheck?.counts.file_hashes ?? 0} hash records`,
          `${r.deleted?.audit_logs ?? precheck?.counts.audit_logs ?? 0} audit entries`,
          `uploads/${selCode}/ ${r.deleted?.folder_removed ? 'removed' : 'was not present'}`,
        ],
        retained: ['Other projects in WiringSchemeDB', 'System users and auth store'],
      });
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
                  <AlertTriangle size={14} className="shrink-0 mt-0.5 text-red-600" />
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
        <DeleteConfirmModal
          title="Confirm Permanent Delete"
          subtitle="No backup — irreversible within DWES."
          resourceKind="project_hard"
          itemLabel={precheck.project.name}
          parentProject={{ code: selCode, name: precheck.project.name }}
          stats={[
            { label: 'frames', count: precheck.counts.frames, tone: precheck.counts.frames > 0 ? 'danger' : 'neutral' },
            { label: 'drawings', count: precheck.counts.drawings, tone: precheck.counts.drawings > 0 ? 'danger' : 'neutral' },
            { label: 'assignments', count: precheck.counts.assignments, tone: precheck.counts.assignments > 0 ? 'warning' : 'neutral' },
            { label: 'inspections', count: precheck.counts.inspections, tone: 'neutral' },
          ]}
          sections={[
            {
              id: 'db',
              title: 'Database records',
              icon: 'database',
              badge: 'removed',
              items: [
                'Project row and related frames',
                `${precheck.counts.assignments} assignments`,
                `${precheck.counts.inspections} inspections`,
                `${precheck.counts.file_hashes} file hashes`,
                `${precheck.counts.audit_logs} audit entries`,
              ],
            },
            {
              id: 'files',
              title: 'Disk / uploads',
              icon: 'folder',
              badge: 'removed',
              items: [
                `Entire uploads/${selCode}/ folder`,
                `${precheck.counts.drawings} drawing file(s)`,
                'Wiring schedules and generated artifacts for this project',
              ],
            },
          ]}
          scopes={[
            {
              id: 'everything_related',
              label: 'Delete everything related',
              description: 'Permanently deletes the project, all related DB records, and the uploads folder.',
            },
          ]}
          defaultScope="everything_related"
          backup={{
            status: 'skipped',
            note: 'No backup is created for permanent project delete. There is no restore path within DWES.',
          }}
          warningText={`This permanently deletes ${precheck.project.name} (${selCode}) from the database and disk. This cannot be undone within DWES.`}
          confirmCheckboxLabel={`I understand that project “${precheck.project.name}” (${selCode}) and all related data will be permanently deleted with no backup.`}
          confirmButtonLabel="Permanently Delete"
          deleting={deleting}
          error={error}
          result={result}
          onClose={closeModal}
          onConfirm={handleDelete}
          onDone={closeModal}
        />
      )}
    </div>
  );
}
