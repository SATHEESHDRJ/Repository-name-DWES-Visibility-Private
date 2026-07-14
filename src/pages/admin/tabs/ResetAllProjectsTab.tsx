import { useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, ShieldAlert, Trash2 } from '../../../components/ui/icons';
import Modal from '../../../components/Modal';
import { adminApi, projectsApi } from '../../../services/api';

type Scope = 'all' | 'single';

interface AllPrecheck {
  counts: {
    projects:    number;
    frames:      number;
    drawings:    number;
    assignments: number;
    inspections: number;
    file_hashes: number;
    audit_logs:  number;
  };
  backup_note: string;
}

interface SinglePrecheck {
  project: { code: string; name: string; state: string };
  counts: {
    frames: number; drawings: number; assignments: number;
    inspections: number; file_hashes: number; audit_logs: number;
  };
  backup_note: string;
}

const CONFIRM_PHRASE = 'DELETE ALL PROJECTS';

export default function ResetAllProjectsTab() {
  const [available, setAvailable] = useState<boolean | null>(null);
  const [scope, setScope] = useState<Scope>('all');
  const [projects, setProjects] = useState<any[]>([]);
  const [selCode, setSelCode] = useState('');
  const [allPrecheck, setAllPrecheck] = useState<AllPrecheck | null>(null);
  const [singlePrecheck, setSinglePrecheck] = useState<SinglePrecheck | null>(null);
  const [singlePrecheckErr, setSinglePrecheckErr] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [modalScope, setModalScope] = useState<Scope>('all');
  const [modalCode, setModalCode] = useState('');
  const [modalConfirmPhrase, setModalConfirmPhrase] = useState('');
  const [modalPrecheck, setModalPrecheck] = useState<AllPrecheck | SinglePrecheck | null>(null);
  const [modalPrecheckLoading, setModalPrecheckLoading] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    adminApi.resetAllPrecheck()
      .then(d => { setAllPrecheck(d); setAvailable(true); })
      .catch(() => setAvailable(false));
    projectsApi.list()
      .then(d => {
        setProjects(d);
        if (d.length) setSelCode(d[0].code);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (scope !== 'single' || !selCode) {
      setSinglePrecheck(null);
      return;
    }
    setSinglePrecheckErr('');
    setSinglePrecheck(null);
    adminApi.hardResetPrecheck(selCode)
      .then(d => { if (d.error) setSinglePrecheckErr(d.error); else setSinglePrecheck(d); })
      .catch(() => setSinglePrecheckErr('Could not load project details'));
  }, [scope, selCode]);

  useEffect(() => {
    if (!showModal) {
      setModalPrecheck(null);
      return;
    }
    if (modalScope === 'all') {
      setModalPrecheckLoading(true);
      adminApi.resetAllPrecheck()
        .then(d => { setModalPrecheck(d); setAllPrecheck(d); })
        .catch(() => setError('Could not load system counts'))
        .finally(() => setModalPrecheckLoading(false));
      return;
    }
    if (!modalCode) {
      setModalPrecheck(null);
      return;
    }
    setModalPrecheckLoading(true);
    setError('');
    adminApi.hardResetPrecheck(modalCode)
      .then(d => {
        if (d.error) { setError(d.error); setModalPrecheck(null); }
        else setModalPrecheck(d);
      })
      .catch(() => { setError('Could not load project details'); setModalPrecheck(null); })
      .finally(() => setModalPrecheckLoading(false));
  }, [showModal, modalScope, modalCode]);

  if (available !== true) return null;

  const openModal = () => {
    setModalScope(scope);
    setModalCode(scope === 'single' ? selCode : '');
    setModalConfirmPhrase('');
    setModalPrecheck(scope === 'single' ? singlePrecheck : allPrecheck);
    setError('');
    setResult(null);
    setShowModal(true);
  };

  const closeModal = () => {
    if (resetting) return;
    setShowModal(false);
    setModalCode('');
    setModalConfirmPhrase('');
    setModalPrecheck(null);
    setError('');
    setResult(null);
  };

  const refreshAfterReset = () => {
    adminApi.resetAllPrecheck().then(d => setAllPrecheck(d)).catch(() => {});
    if (scope === 'single' && selCode) {
      adminApi.hardResetPrecheck(selCode)
        .then(d => { if (!d.error) setSinglePrecheck(d); })
        .catch(() => {});
    }
    projectsApi.list()
      .then(d => {
        setProjects(d);
        if (d.length && !d.some((p: { code: string }) => p.code === selCode)) setSelCode(d[0].code);
      })
      .catch(() => {});
  };

  const handleReset = async () => {
    if (modalScope === 'all') {
      if (modalConfirmPhrase !== CONFIRM_PHRASE) return;
    } else {
      if (!modalCode) { setError('Select a project to reset'); return; }
    }

    setResetting(true);
    setError('');
    try {
      const r = modalScope === 'all'
        ? await adminApi.resetAllProjects(modalConfirmPhrase)
        : await adminApi.hardReset(modalCode, modalCode);

      if (r.error) { setError(r.error); setResetting(false); return; }
      setResult(r);
      refreshAfterReset();
    } catch (e: any) {
      setError(e?.response?.data?.message || e?.message || 'Reset failed');
    } finally {
      setResetting(false);
    }
  };

  const allCounts = allPrecheck?.counts;
  const singleCounts = singlePrecheck?.counts;
  const singleTotalItems = singleCounts
    ? singleCounts.frames + singleCounts.drawings + singleCounts.assignments
      + singleCounts.inspections + singleCounts.file_hashes
    : 0;

  const modalAllCounts = modalScope === 'all' ? (modalPrecheck as AllPrecheck | null)?.counts : null;
  const modalSinglePrecheck = modalScope === 'single' ? (modalPrecheck as SinglePrecheck | null) : null;
  const modalSingleCounts = modalSinglePrecheck?.counts;
  const modalSingleTotalItems = modalSingleCounts
    ? modalSingleCounts.frames + modalSingleCounts.drawings + modalSingleCounts.assignments
      + modalSingleCounts.inspections + modalSingleCounts.file_hashes
    : 0;

  const allIsEmpty = !allCounts || allCounts.projects === 0;
  const singleIsEmpty = !singlePrecheck || singleTotalItems === 0;
  const canOpenModal = scope === 'all' ? !allIsEmpty : projects.length > 0 && !singleIsEmpty;

  const resetDisabled = modalScope === 'all'
    ? resetting || modalConfirmPhrase !== CONFIRM_PHRASE || !modalAllCounts || modalAllCounts.projects === 0
    : resetting || !modalCode || modalSingleTotalItems === 0;

  return (
    <div className="rounded-2xl border border-red-200 bg-[var(--t-surface-white)] shadow-sm overflow-hidden">
      <div className="px-6 py-4 border-b border-red-200 bg-red-50 flex items-center gap-3">
        <Trash2 size={20} className="text-red-700 shrink-0" />
        <div>
          <div className="text-[14px] font-bold text-red-900">Reset Projects</div>
          <div className="text-[12px] text-red-700 mt-0.5">
            Permanently delete all projects or hard-reset a single project — drawings, schedules, frames,
            and assignments. User accounts are preserved. Full pg_dump + file backup created first.
            Available in DEMO_MODE only.
          </div>
        </div>
      </div>

      <div className="p-6">
        {/* Scope selector */}
        <div className="mb-5">
          <div className="text-[12px] font-bold uppercase tracking-widest text-slate-400 mb-2">
            Reset scope
          </div>
          <div className="inline-flex rounded-xl border border-slate-200 bg-slate-50 p-1 gap-1">
            {([
              { key: 'all' as Scope, label: 'All projects' },
              { key: 'single' as Scope, label: 'Single project' },
            ]).map(opt => (
              <button
                key={opt.key}
                type="button"
                onClick={() => setScope(opt.key)}
                className={`h-10 px-4 rounded-lg text-[13px] font-semibold transition-colors ${
                  scope === opt.key
                    ? 'bg-[var(--t-surface-white)] text-red-800 shadow-sm border border-red-100'
                    : 'text-slate-600 hover:text-slate-800'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {scope === 'single' && (
          <div className="mb-5">
            <label className="form-label mb-1">Select project</label>
            {projects.length === 0 ? (
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-[13px] text-slate-500">
                No projects available.
              </div>
            ) : (
              <select
                value={selCode}
                onChange={e => setSelCode(e.target.value)}
                className="form-select"
                aria-label="Select project"
              >
                {projects.map(p => (
                  <option key={p.code} value={p.code}>{p.name} ({p.code})</option>
                ))}
              </select>
            )}
          </div>
        )}

        {scope === 'all' && allCounts && (
          <PrecheckGrid
            items={[
              { label: 'Projects',     value: allCounts.projects },
              { label: 'Frames',       value: allCounts.frames },
              { label: 'Drawings',     value: allCounts.drawings },
              { label: 'Assignments',  value: allCounts.assignments },
              { label: 'Inspections',  value: allCounts.inspections },
              { label: 'Hash records', value: allCounts.file_hashes },
            ]}
            backupNote={allPrecheck!.backup_note}
          />
        )}

        {scope === 'single' && singlePrecheckErr && (
          <div className="form-error mb-4">{singlePrecheckErr}</div>
        )}

        {scope === 'single' && singlePrecheck && singleCounts && (
          <PrecheckGrid
            items={[
              { label: 'Frames',       value: singleCounts.frames },
              { label: 'Drawings',     value: singleCounts.drawings },
              { label: 'Assignments',  value: singleCounts.assignments },
              { label: 'Inspections',  value: singleCounts.inspections },
              { label: 'Hash records', value: singleCounts.file_hashes },
              { label: 'Audit entries', value: singleCounts.audit_logs },
            ]}
            backupNote={singlePrecheck.backup_note}
            projectName={singlePrecheck.project.name}
          />
        )}

        <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-[12px] text-amber-800 font-medium flex items-start gap-2 mb-4">
          <AlertTriangle size={14} className="shrink-0 mt-0.5 text-amber-600" />
          {scope === 'all'
            ? 'All projects mode permanently deletes every project row and all wiring data.'
            : 'Single project mode clears all wiring data but keeps the project record.'}
          {' '}User accounts are NOT deleted.
        </div>

        {scope === 'all' && allIsEmpty ? (
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-center text-[13px] text-slate-500">
            System is already clean — no projects to delete.
          </div>
        ) : scope === 'single' && projects.length === 0 ? (
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-center text-[13px] text-slate-500">
            No projects available to reset.
          </div>
        ) : scope === 'single' && singleIsEmpty ? (
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-center text-[13px] text-slate-500">
            This project is already empty — nothing to reset.
          </div>
        ) : canOpenModal ? (
          <button
            type="button"
            onClick={openModal}
            className="w-full h-[56px] rounded-2xl bg-red-700 text-white font-bold text-[15px] hover:bg-red-800 active:scale-[0.98] transition-all flex items-center justify-center gap-2 shadow-sm"
          >
            <Trash2 size={20} />
            {scope === 'all'
              ? `Delete All Projects (${allCounts!.projects})`
              : `Reset Project: ${singlePrecheck!.project.name}`}
          </button>
        ) : null}
      </div>

      {showModal && (
        <Modal
          title={modalScope === 'all' ? 'Confirm: Delete All Projects' : 'Confirm: Reset Project'}
          onClose={closeModal}
          size="lg"
          footer={result ? undefined : (
            <div className="flex gap-3 w-full">
              <button
                type="button"
                onClick={closeModal}
                disabled={resetting}
                className="flex-1 h-[56px] rounded-xl border border-slate-200 bg-[var(--t-surface-white)] text-slate-700 font-semibold text-[14px] hover:bg-slate-50 transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleReset}
                disabled={resetDisabled}
                className="flex-1 h-[56px] rounded-xl bg-red-700 text-white font-bold text-[14px] hover:bg-red-800 transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {resetting ? (
                  <>
                    <span className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                    {modalScope === 'all' ? 'Deleting…' : 'Resetting…'}
                  </>
                ) : (
                  <>
                    <Trash2 size={16} />
                    {modalScope === 'all' ? 'Permanently Delete All' : 'Permanently Reset'}
                  </>
                )}
              </button>
            </div>
          )}
        >
          {!result ? (
            <>
              <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 mb-4 flex items-start gap-2">
                <ShieldAlert size={16} className="text-red-700 shrink-0 mt-0.5" />
                <div className="text-[12px] text-red-700">
                  {modalScope === 'all'
                    ? 'This permanently deletes every project and cannot be undone within the app.'
                    : 'This clears all wiring data for the selected project. Recoverable from backup only.'}
                </div>
              </div>

              {modalPrecheckLoading ? (
                <div className="py-8 text-center text-[13px] text-slate-500">Loading details…</div>
              ) : modalScope === 'all' && modalAllCounts ? (
                <>
                  <div className="mb-4">
                    <label className="form-label mb-1">Confirm action</label>
                    <select
                      value={modalConfirmPhrase}
                      onChange={e => { setModalConfirmPhrase(e.target.value); setError(''); }}
                      className="form-select"
                      aria-label="Confirm delete all projects"
                      disabled={resetting}
                    >
                      <option value="">Select confirmation…</option>
                      <option value={CONFIRM_PHRASE}>Permanently delete ALL projects ({modalAllCounts.projects})</option>
                    </select>
                  </div>

                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 mb-4 text-[13px] text-slate-700">
                    <div className="font-semibold text-slate-800 mb-2">The following will be permanently deleted:</div>
                    <ul className="space-y-1">
                      <li>• All {modalAllCounts.projects} project{modalAllCounts.projects !== 1 ? 's' : ''}</li>
                      <li>• All {modalAllCounts.frames} frame file{modalAllCounts.frames !== 1 ? 's' : ''}</li>
                      <li>• All {modalAllCounts.drawings} drawing{modalAllCounts.drawings !== 1 ? 's' : ''}</li>
                      <li>
                        • All {modalAllCounts.assignments} assignment{modalAllCounts.assignments !== 1 ? 's' : ''}
                        {' + '}{modalAllCounts.inspections} inspection{modalAllCounts.inspections !== 1 ? 's' : ''}
                      </li>
                      <li>• All {modalAllCounts.file_hashes} dedup hash record{modalAllCounts.file_hashes !== 1 ? 's' : ''}</li>
                    </ul>
                    <div className="mt-3 text-[12px] text-emerald-700 flex items-start gap-1.5">
                      <CheckCircle2 size={14} className="shrink-0 mt-0.5" />
                      pg_dump + all uploads archived to <strong>uploads/backups/</strong> before deletion.
                    </div>
                  </div>
                </>
              ) : modalScope === 'single' && modalSinglePrecheck && modalSingleCounts ? (
                <>
                  <div className="mb-4">
                    <label className="form-label mb-1">Select project to reset</label>
                    <select
                      value={modalCode}
                      onChange={e => { setModalCode(e.target.value); setError(''); }}
                      className="form-select"
                      aria-label="Select project to reset"
                      disabled={resetting}
                    >
                      {projects.map(p => (
                        <option key={p.code} value={p.code}>{p.name} ({p.code})</option>
                      ))}
                    </select>
                  </div>

                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 mb-4 text-[13px] text-slate-700">
                    <div className="font-semibold text-slate-800 mb-2">{modalSinglePrecheck.project.name}</div>
                    <ul className="space-y-1">
                      <li>• {modalSingleCounts.frames} frame{modalSingleCounts.frames !== 1 ? 's' : ''}</li>
                      <li>• {modalSingleCounts.drawings} drawing{modalSingleCounts.drawings !== 1 ? 's' : ''}</li>
                      <li>
                        • {modalSingleCounts.assignments} assignment{modalSingleCounts.assignments !== 1 ? 's' : ''}
                        {' + '}{modalSingleCounts.inspections} inspection{modalSingleCounts.inspections !== 1 ? 's' : ''}
                      </li>
                      <li>• {modalSingleCounts.file_hashes} dedup hash record{modalSingleCounts.file_hashes !== 1 ? 's' : ''}</li>
                    </ul>
                    <div className="mt-3 text-[12px] text-green-700 flex items-start gap-1">
                      <CheckCircle2 size={14} className="shrink-0 mt-0.5" />
                      pg_dump + uploads/{modalCode}/ archived to <strong>uploads/backups/</strong> first.
                    </div>
                  </div>

                  {modalSingleTotalItems === 0 && (
                    <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 mb-4 text-[13px] text-slate-500 text-center">
                      This project is already empty — nothing to reset.
                    </div>
                  )}
                </>
              ) : (
                <div className="py-8 text-center text-[13px] text-slate-500">
                  {error || 'Could not load reset details.'}
                </div>
              )}

              {error && modalPrecheck && <div className="form-error">{error}</div>}
            </>
          ) : (
            <div className="text-center">
              <CheckCircle2 size={48} className="text-green-500 mx-auto mb-3" />
              <div className="text-[16px] font-bold text-slate-800 mb-2">
                {modalScope === 'all' ? 'All projects deleted' : 'Reset complete'}
              </div>
              <div className="text-[13px] text-slate-600 mb-4">{result.message}</div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-left text-[12px] text-slate-600 mb-4 space-y-1">
                {modalScope === 'all' ? (
                  <>
                    <div>
                      Deleted: {result.deleted.projects} project(s), {result.deleted.assignments} assignments,{' '}
                      {result.deleted.inspections} inspections, {result.deleted.file_hashes} hash records
                    </div>
                    <div>Disk: {result.deleted.folders_removed} project folder(s) removed</div>
                    <div className="text-green-700 font-medium pt-1">Dump: {result.backup.dump}</div>
                    <div className="text-green-700 font-medium">Archive: {result.backup.archive}</div>
                  </>
                ) : (
                  <>
                    <div>
                      Deleted: {result.deleted.assignments} assignments, {result.deleted.inspections} inspections,{' '}
                      {result.deleted.file_hashes} hashes, {result.deleted.disk_files} files
                    </div>
                    <div className="text-green-700 font-medium">Backup: {result.backup.dump}</div>
                    {result.backup.archive !== '(no uploads folder existed)' && (
                      <div className="text-green-700 font-medium">Archive: {result.backup.archive}</div>
                    )}
                  </>
                )}
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

function PrecheckGrid({
  items,
  backupNote,
  projectName,
}: {
  items: { label: string; value: number }[];
  backupNote: string;
  projectName?: string;
}) {
  return (
    <div className="mb-5">
      <div className="text-[12px] font-bold uppercase tracking-widest text-slate-400 mb-2">
        {projectName ? `What will be removed — ${projectName}` : 'What will be permanently removed'}
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-4">
        {items.map(item => (
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
      <div className="text-[12px] text-slate-500 flex items-start gap-1.5">
        <CheckCircle2 size={14} className="text-green-500 shrink-0 mt-0.5" />
        <span>{backupNote}</span>
      </div>
    </div>
  );
}
