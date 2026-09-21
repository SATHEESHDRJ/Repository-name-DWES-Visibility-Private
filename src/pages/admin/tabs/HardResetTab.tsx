import { useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, ShieldAlert, FolderKanban } from '../../../components/ui/icons';
import { adminApi, projectsApi } from '../../../services/api';
import { DwesLoadingCenter } from '../../../components/ui/DwesLoadingIndicator';

/**
 * Orphan UI — not mounted in AdminSettingsPage (2026-07 tablet roadmap).
 * Prefer hide over deleting backend hard-reset endpoints. Do not re-wire
 * without explicit ops approval; Danger Zone uses HardResetDbTab instead.
 */

interface Precheck {
  project: { code: string; name: string; state: string };
  counts: {
    frames: number; drawings: number; assignments: number;
    inspections: number; file_hashes: number; audit_logs: number;
  };
  backup_note: string;
}

export default function HardResetTab() {
  const [projects, setProjects] = useState<any[]>([]);
  const [selCode, setSelCode] = useState('');
  const [precheck, setPrecheck] = useState<Precheck | null>(null);
  const [precheckErr, setPrecheckErr] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [modalCode, setModalCode] = useState('');
  const [modalPrecheck, setModalPrecheck] = useState<Precheck | null>(null);
  const [modalPrecheckLoading, setModalPrecheckLoading] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [resetErr, setResetErr] = useState('');

  useEffect(() => {
    projectsApi.list().then(d => {
      setProjects(d);
      if (d.length) setSelCode(d[0].code);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    if (!selCode) { setPrecheck(null); return; }
    setPrecheckErr('');
    setPrecheck(null);
    adminApi.hardResetPrecheck(selCode)
      .then(d => { if (d.error) setPrecheckErr(d.error); else setPrecheck(d); })
      .catch(() => setPrecheckErr('Could not load project details'));
  }, [selCode]);

  useEffect(() => {
    if (!showModal || !modalCode) { setModalPrecheck(null); return; }
    setModalPrecheckLoading(true);
    setResetErr('');
    adminApi.hardResetPrecheck(modalCode)
      .then(d => {
        if (d.error) { setResetErr(d.error); setModalPrecheck(null); }
        else setModalPrecheck(d);
      })
      .catch(() => { setResetErr('Could not load project details'); setModalPrecheck(null); })
      .finally(() => setModalPrecheckLoading(false));
  }, [showModal, modalCode]);

  const openModal = () => {
    setModalCode(selCode);
    setModalPrecheck(precheck);
    setResetErr('');
    setResult(null);
    setShowModal(true);
  };

  const closeModal = () => {
    if (resetting) return;
    setShowModal(false);
    setModalCode('');
    setModalPrecheck(null);
    setResetErr('');
    setResult(null);
  };

  const handleReset = async () => {
    if (!modalCode) { setResetErr('Select a project to reset'); return; }
    setResetting(true); setResetErr('');
    try {
      const r = await adminApi.hardReset(modalCode, modalCode);
      if (r.error) { setResetErr(r.error); setResetting(false); return; }
      setResult(r);
      adminApi.hardResetPrecheck(selCode).then(d => { if (!d.error) setPrecheck(d); }).catch(() => {});
    } catch (e: any) {
      setResetErr(e?.response?.data?.message || e?.message || 'Reset failed');
    } finally {
      setResetting(false);
    }
  };

  const modalCounts = modalPrecheck?.counts;
  const modalTotalItems = modalCounts
    ? modalCounts.frames + modalCounts.drawings + modalCounts.assignments + modalCounts.inspections + modalCounts.file_hashes
    : 0;

  const { counts } = precheck || {};
  const totalItems = counts
    ? counts.frames + counts.drawings + counts.assignments + counts.inspections + counts.file_hashes
    : 0;

  return (
    <div className="rounded-2xl border border-red-100 bg-[var(--t-surface-white)] shadow-sm overflow-hidden">
      {/* Header */}
      <div className="px-6 py-4 border-b border-red-100 bg-red-50 flex items-center gap-3">
        <ShieldAlert size={20} className="text-red-600 shrink-0" />
        <div>
          <div className="text-[14px] font-bold text-red-800">Hard Reset Project</div>
          <div className="text-[12px] text-red-600 mt-0.5">
            Permanently clears all frames, drawings, assignments and wiring progress for one project.
            A full DB backup + file archive is created first. System Admin only.
          </div>
        </div>
      </div>

      <div className="p-6">
        {/* Project selector */}
        <div className="mb-5">
          <label className="form-label mb-1">Select project to reset</label>
          <div className="field-with-icon">
            <span className="field-lead-icon"><FolderKanban size={18} /></span>
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
          </div>
        </div>

        {/* Precheck counts */}
        {precheckErr && <div className="form-error mb-4">{precheckErr}</div>}

        {precheck && (
          <div className="mb-5">
            <div className="text-[12px] font-bold uppercase tracking-widest text-slate-400 mb-2">What will be removed</div>
            <div className="grid grid-cols-2 tablet-land:grid-cols-3 gap-3 mb-3">
              {[
                { label: 'Frames',      value: counts!.frames },
                { label: 'Drawings',    value: counts!.drawings },
                { label: 'Assignments', value: counts!.assignments },
                { label: 'Inspections',  value: counts!.inspections },
                { label: 'Hash records', value: counts!.file_hashes },
                { label: 'Audit entries', value: counts!.audit_logs },
              ].map(item => (
                <div key={item.label} className={`rounded-xl p-3 border text-center ${item.value > 0 ? 'border-red-200 bg-red-50' : 'border-slate-100 bg-slate-50'}`}>
                  <div className={`text-[22px] font-bold leading-none ${item.value > 0 ? 'text-red-700' : 'text-slate-400'}`}>{item.value}</div>
                  <div className="text-[11px] text-muted mt-1">{item.label}</div>
                </div>
              ))}
            </div>

            <div className="text-[12px] text-muted flex items-start gap-1.5 mb-4">
              <CheckCircle2 size={14} className="text-green-500 shrink-0 mt-0.5" />
              <span>{precheck.backup_note}</span>
            </div>

            {totalItems === 0 ? (
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-center text-[13px] text-muted">
                This project is already empty — nothing to reset.
              </div>
            ) : (
              <button
                type="button"
                onClick={openModal}
                className="w-full h-14 rounded-2xl bg-red-600 text-white font-bold text-[15px] hover:bg-red-700 active:scale-[0.98] transition-all flex items-center justify-center gap-2 shadow-sm"
              >
                <AlertTriangle size={20} />
                Reset Project: {precheck.project.name}
              </button>
            )}
          </div>
        )}
      </div>

      {/* Confirm modal */}
      {showModal && (
        <div className="modal-overlay z-[210]" onClick={closeModal}>
          <div
            className="modal-box hard-reset-modal overflow-hidden"
            onClick={e => e.stopPropagation()}
          >
            {/* Modal header */}
            <div className="hard-reset-modal__header border-b border-red-100 bg-red-50">
              <div className="flex items-center gap-2 mb-1">
                <ShieldAlert size={18} className="text-red-600" />
                <span className="text-[15px] font-bold text-red-800">Confirm Hard Reset</span>
              </div>
              <div className="text-[12px] text-red-600">This action is recoverable from the backup — but irreversible within the app.</div>
            </div>

            <div className="hard-reset-modal__body overflow-y-auto min-h-0">
              {!result ? (
                <>
                  {modalPrecheckLoading ? (
                    <DwesLoadingCenter label="Loading project details…" className="py-8" />
                  ) : modalPrecheck && modalCounts ? (
                    <>
                      <div className="mb-4">
                        <label className="form-label mb-1">Select project to reset</label>
                        <div className="field-with-icon">
                          <span className="field-lead-icon"><FolderKanban size={18} /></span>
                          <select
                            value={modalCode}
                            onChange={e => { setModalCode(e.target.value); setResetErr(''); }}
                            className="form-select"
                            aria-label="Select project to reset"
                            disabled={resetting}
                          >
                            {projects.map(p => (
                              <option key={p.code} value={p.code}>{p.name} ({p.code})</option>
                            ))}
                          </select>
                        </div>
                      </div>

                      {/* What will be deleted */}
                      <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 mb-4 text-[13px] text-secondary">
                        <div className="font-semibold text-primary mb-2">{modalPrecheck.project.name}</div>
                        <ul className="space-y-1">
                          <li>• {modalCounts.frames} frame{modalCounts.frames !== 1 ? 's' : ''} (wiring schedules + disk files)</li>
                          <li>• {modalCounts.drawings} drawing{modalCounts.drawings !== 1 ? 's' : ''} (disk files)</li>
                          <li>• {modalCounts.assignments} assignment{modalCounts.assignments !== 1 ? 's' : ''} + {modalCounts.inspections} inspection{modalCounts.inspections !== 1 ? 's' : ''}</li>
                          <li>• {modalCounts.file_hashes} dedup hash record{modalCounts.file_hashes !== 1 ? 's' : ''}</li>
                        </ul>
                        <div className="mt-3 text-[12px] text-green-700 flex items-start gap-1">
                          <CheckCircle2 size={14} className="shrink-0 mt-0.5" />
                          pg_dump backup + uploads/{modalCode}/ archive will be saved to <strong>uploads/backups/</strong> first.
                        </div>
                      </div>

                      {modalTotalItems === 0 && (
                        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 mb-4 text-[13px] text-muted text-center">
                          This project is already empty — nothing to reset.
                        </div>
                      )}

                      {resetErr && <div className="form-error mb-3">{resetErr}</div>}

                      <div className="hard-reset-modal__actions flex gap-2">
                        <button
                          type="button"
                          onClick={closeModal}
                          disabled={resetting}
                          className="flex-1 h-12 rounded-xl border border-slate-200 bg-[var(--t-surface-white)] text-secondary font-semibold text-[14px] hover:bg-slate-50 transition-colors disabled:opacity-50"
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          onClick={handleReset}
                          disabled={resetting || !modalCode || modalTotalItems === 0}
                          className="flex-1 h-12 rounded-xl bg-red-600 text-white font-bold text-[14px] hover:bg-red-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                        >
                          {resetting ? (
                            <>
                              <span className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                              Resetting…
                            </>
                          ) : (
                            <>
                              <AlertTriangle size={16} />
                              Permanently Reset
                            </>
                          )}
                        </button>
                      </div>
                    </>
                  ) : (
                    <div className="py-8 text-center text-[13px] text-muted">
                      {resetErr || 'No project selected.'}
                    </div>
                  )}
                </>
              ) : (
                <div className="text-center">
                  <CheckCircle2 size={48} className="text-green-500 mx-auto mb-3" />
                  <div className="text-[16px] font-bold text-primary mb-2">Reset complete</div>
                  <div className="text-[13px] text-muted mb-4">{result.message}</div>
                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-left text-[12px] text-muted mb-4 space-y-1">
                    <div>Deleted: {result.deleted.assignments} assignments, {result.deleted.inspections} inspections, {result.deleted.file_hashes} hashes, {result.deleted.disk_files} files</div>
                    <div className="text-green-700 font-medium">Backup: {result.backup.dump}</div>
                    {result.backup.archive !== '(no uploads folder existed)' && (
                      <div className="text-green-700 font-medium">Archive: {result.backup.archive}</div>
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
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
