import { useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, Database, ShieldAlert } from '../../../components/ui/icons';
import Modal from '../../../components/Modal';
import { useAppDialog } from '../../../components/AppDialogProvider';
import { useDevHardReset } from '../../../hooks/useDevHardReset';
import { devApi } from '../../../services/api';

const CONFIRM_PHRASE = 'HARD RESET DB';

interface Precheck {
  counts: {
    users: number;
    projects: number;
    assignments: number;
    inspections: number;
    session_logs: number;
    audit_logs: number;
    file_hashes: number;
    webauthn_credentials: number;
    frames: number;
    drawings: number;
    director_reports: number;
    upload_project_folders: number;
  };
  reseed_projects: number;
  backup_note: string;
  confirm_phrase: string;
  preserved: string[];
}

function clearClientCaches() {
  const theme = localStorage.getItem('theme-mode');
  const keysToRemove: string[] = [];
  for (let i = 0; i < localStorage.length; i += 1) {
    const key = localStorage.key(i);
    if (key) keysToRemove.push(key);
  }
  keysToRemove.forEach(key => localStorage.removeItem(key));
  if (theme) localStorage.setItem('theme-mode', theme);
  sessionStorage.clear();
}

export default function HardResetDbTab() {
  const devAllowed = useDevHardReset();
  const dialog = useAppDialog();
  const [available, setAvailable] = useState<boolean | null>(null);
  const [precheck, setPrecheck] = useState<Precheck | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [confirmPhrase, setConfirmPhrase] = useState('');
  const [resetting, setResetting] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!devAllowed) {
      setAvailable(false);
      return;
    }
    devApi.hardResetPrecheck()
      .then(d => { setPrecheck(d); setAvailable(true); })
      .catch(() => setAvailable(false));
  }, [devAllowed]);

  if (!devAllowed || available !== true) return null;

  const counts = precheck?.counts;
  const totalOperational = counts
    ? counts.projects + counts.assignments + counts.inspections + counts.session_logs
      + counts.file_hashes + counts.frames + counts.drawings + counts.director_reports
    : 0;

  const openModal = () => {
    setConfirmPhrase('');
    setError('');
    setResult(null);
    setShowModal(true);
  };

  const closeModal = () => {
    if (resetting) return;
    setShowModal(false);
    setConfirmPhrase('');
    setError('');
    setResult(null);
  };

  const handleReset = async () => {
    const ok = await dialog.confirm({
      title: 'Hard Reset DB',
      tone: 'delete',
      confirmText: 'Continue to reset',
      message:
        'This will delete ALL projects, panels, wiring schedules, drawings, reports, '
        + 'technician assignments, duplicate hash records, session log entries, and WebAuthn passkeys. '
        + 'User accounts are preserved. This cannot be undone except from pg_dump backup.',
    });
    if (!ok) return;

    if (confirmPhrase !== CONFIRM_PHRASE) {
      setError(`Type exactly: ${CONFIRM_PHRASE}`);
      return;
    }

    setResetting(true);
    setError('');
    try {
      const r = await devApi.hardReset(CONFIRM_PHRASE);
      if (r.error) {
        setError(r.error);
        setResetting(false);
        return;
      }
      setResult(r);
      clearClientCaches();
      window.setTimeout(() => window.location.reload(), 1500);
    } catch (e: any) {
      setError(e?.response?.data?.message || e?.message || 'Hard reset failed');
      setResetting(false);
    }
  };

  return (
    <div className="rounded-2xl border border-red-300 bg-[var(--t-surface-white)] shadow-sm overflow-hidden">
      <div className="px-6 py-4 border-b border-red-300 bg-red-50 flex items-center gap-3">
        <Database size={20} className="text-red-800 shrink-0" />
        <div>
          <div className="text-[14px] font-bold text-red-900">Hard Reset DB</div>
          <div className="text-[12px] text-red-700 mt-0.5">
            Development mode only — wipe all operational data, uploads, session log, and WebAuthn credentials;
            restore canonical seed projects. Requires <code className="text-[11px]">DEMO_MODE=true</code> or{' '}
            <code className="text-[11px]">ALLOW_DEV_HARD_RESET=true</code> on the backend.
          </div>
        </div>
      </div>

      <div className="p-6">
        {counts && (
          <div className="mb-5">
            <div className="text-[12px] font-bold uppercase tracking-widest text-slate-400 mb-2">
              Current data (will be cleared)
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 tablet-land:grid-cols-4 gap-3 mb-4">
              {[
                { label: 'Projects', value: counts.projects },
                { label: 'Assignments', value: counts.assignments },
                { label: 'Inspections', value: counts.inspections },
                { label: 'Session logs', value: counts.session_logs },
                { label: 'Hash records', value: counts.file_hashes },
                { label: 'Frames', value: counts.frames },
                { label: 'Drawings', value: counts.drawings },
                { label: 'Reports', value: counts.director_reports },
                { label: 'WebAuthn keys', value: counts.webauthn_credentials },
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
            <div className="text-[12px] text-slate-500 flex items-start gap-1.5 mb-3">
              <CheckCircle2 size={14} className="text-green-500 shrink-0 mt-0.5" />
              <span>{precheck?.backup_note}</span>
            </div>
            <div className="text-[12px] text-slate-600">
              Preserved: {precheck?.preserved.join('; ')}. After reset, no projects are recreated — all projects are created manually in the app.
            </div>
          </div>
        )}

        <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-[12px] text-amber-800 font-medium flex items-start gap-2 mb-4">
          <AlertTriangle size={14} className="shrink-0 mt-0.5 text-amber-600" />
          Clears duplicate-panel hash cache, upload validation state, in-memory frames/drawings, and all client storage before reload.
          {counts?.users ? ` ${counts.users} user account(s) kept.` : ''}
        </div>

        <button
          type="button"
          onClick={openModal}
          className="w-full h-[56px] rounded-2xl bg-red-800 text-white font-bold text-[15px] hover:bg-red-900 active:scale-[0.98] transition-all flex items-center justify-center gap-2 shadow-sm"
        >
          <Database size={20} />
          Hard Reset DB
          {totalOperational > 0 ? ` (${totalOperational} items)` : ''}
        </button>
      </div>

      {showModal && (
        <Modal
          title="Confirm Hard Reset DB"
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
                disabled={resetting || confirmPhrase !== CONFIRM_PHRASE}
                className="flex-1 h-[56px] rounded-xl bg-red-800 text-white font-bold text-[14px] hover:bg-red-900 transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {resetting ? (
                  <>
                    <span className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                    Resetting…
                  </>
                ) : (
                  <>
                    <Database size={16} />
                    Execute Hard Reset
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
                  This wipes the entire DWES test database state. Only user accounts and existing backup archives are kept.
                </div>
              </div>

              <div className="mb-4">
                <label className="form-label mb-1">Type confirmation phrase</label>
                <input
                  type="text"
                  value={confirmPhrase}
                  onChange={e => { setConfirmPhrase(e.target.value); setError(''); }}
                  className="form-input font-mono"
                  placeholder={CONFIRM_PHRASE}
                  autoComplete="off"
                  disabled={resetting}
                  aria-label="Hard reset confirmation phrase"
                />
                <div className="text-[11px] text-slate-500 mt-1">
                  Type exactly: <strong>{CONFIRM_PHRASE}</strong>
                </div>
              </div>

              {error && <div className="form-error">{error}</div>}
            </>
          ) : (
            <div className="text-center">
              <CheckCircle2 size={48} className="text-green-500 mx-auto mb-3" />
              <div className="text-[16px] font-bold text-slate-800 mb-2">Hard reset complete</div>
              <div className="text-[13px] text-slate-600 mb-4">{result.message}</div>
              <div className="text-[12px] text-slate-500">Reloading app…</div>
            </div>
          )}
        </Modal>
      )}
    </div>
  );
}
