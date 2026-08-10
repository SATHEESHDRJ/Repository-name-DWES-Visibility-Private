import { useEffect, useState } from 'react';
import {
  CheckCircle, XCircle, Database, Cloud, HardDrive,
  RefreshCw, AlertTriangle, Loader, FolderOpen,
} from '../../../components/ui/icons';
import { useAppDialog } from '../../../components/AppDialogProvider';
import { adminApi } from '../../../services/api';
import { DwesLoadingState } from '../../../components/ui/DwesLoadingIndicator';

interface DbConfig {
  mode: 'local' | 'cloud';
  cloudUrl: string;
  cloudUrlMasked: string;
  localUrlMasked: string;
  lastSwitched: string | null;
  notes: string;
  activeDatabase: string;
}

interface TestResult {
  status: 'ok' | 'error';
  latency_ms?: number;
  database?: string;
  pg_version?: string;
  message?: string;
}

interface StorageInfo {
  upload_dir: string;
  absolute_path: string;
  exists: boolean;
  project_dirs: number;
  projects: string[];
  note: string;
}

export default function DbConfigTab() {
  const dialog = useAppDialog();
  const [config, setConfig] = useState<DbConfig | null>(null);
  const [storage, setStorage] = useState<StorageInfo | null>(null);
  const [loading, setLoading] = useState(true);

  // Edit state
  const [selectedMode, setSelectedMode] = useState<'local' | 'cloud'>('local');
  const [cloudUrl, setCloudUrl] = useState('');
  const [notes, setNotes] = useState('');

  // Operation state
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<TestResult | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveResult, setSaveResult] = useState<{ requiresRestart?: boolean; message?: string; error?: string } | null>(null);
  const [restarting, setRestarting] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const [cfg, stor] = await Promise.all([adminApi.getDbConfig(), adminApi.fileStorageInfo()]);
      setConfig(cfg);
      setStorage(stor);
      setSelectedMode(cfg.mode);
      setCloudUrl(cfg.cloudUrl || '');
      setNotes(cfg.notes || '');
    } catch {} finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const handleTest = async () => {
    const url = selectedMode === 'local'
      ? (config?.localUrlMasked ? '' : '') // local test uses the backend's own pool
      : cloudUrl;
    if (selectedMode === 'cloud' && !url) { setTestResult({ status: 'error', message: 'Enter a connection URL first.' }); return; }
    setTesting(true);
    setTestResult(null);
    try {
      const r = selectedMode === 'local'
        ? await adminApi.dbPing()
        : await adminApi.testDbConnection(url);
      setTestResult(r.status === 'ok' ? { status: 'ok', latency_ms: r.latency_ms, database: r.database, pg_version: r.pg_version }
                                       : { status: 'error', message: r.message });
    } catch (e: any) {
      setTestResult({ status: 'error', message: e?.message || 'Connection failed' });
    } finally { setTesting(false); }
  };

  const handleSave = async () => {
    if (selectedMode === 'cloud' && !cloudUrl.trim()) {
      setSaveResult({ error: 'Cloud URL is required when switching to Cloud mode.' }); return;
    }
    setSaving(true);
    setSaveResult(null);
    try {
      const r = await adminApi.setDbConfig(selectedMode, cloudUrl.trim() || undefined, notes);
      setSaveResult(r);
      await load();
    } catch (e: any) {
      setSaveResult({ error: e?.response?.data?.error || e?.message || 'Failed to save.' });
    } finally { setSaving(false); }
  };

  const handleRestart = async () => {
    const ok = await dialog.confirm({
      title: 'Restart backend',
      message: 'The backend process will restart. DWES will be unavailable for about 3 seconds, then reconnect.',
      tone: 'warning',
      confirmText: 'Restart Backend',
      actionSummary: 'Stop and restart the NestJS/Fastify backend process on this machine.',
      entity: { label: 'Service', value: 'DWES backend', kind: 'other' },
    });
    if (!ok) return;
    setRestarting(true);
    try { await adminApi.triggerRestart(); } catch {}
    setTimeout(() => { setRestarting(false); setSaveResult(null); load(); }, 4000);
  };

  const dirty = config
    ? selectedMode !== config.mode || (selectedMode === 'cloud' && cloudUrl !== (config.cloudUrl || ''))
    : false;

  if (loading) return <DwesLoadingState label="Loading database configuration…" />;

  return (
    <div className="flex flex-col gap-6">

      {/* ── Active Database Banner ───────────────────────── */}
      <div className={`status-banner rounded-xl px-4 tablet-land:px-5 py-4 border ${
        config?.mode === 'cloud' ? 'bg-indigo-50 border-indigo-200' : 'bg-emerald-50 border-emerald-200'
      }`}>
        {config?.mode === 'cloud'
          ? <Cloud size={24} className="text-indigo-600 shrink-0" />
          : <HardDrive size={24} className="text-emerald-600 shrink-0" />}
        <div className="flex-1 min-w-0">
          <div className={`text-[13px] font-bold uppercase tracking-wider select-none ${
            config?.mode === 'cloud' ? 'text-indigo-700' : 'text-emerald-700'
          }`}>
            Active: {config?.mode === 'cloud' ? 'Cloud Database' : 'Local Database'}
          </div>
          <div className="text-[12px] text-muted mt-0.5 font-mono truncate">{config?.activeDatabase}</div>
        </div>
        {config?.lastSwitched && (
          <div className="status-banner-meta">
            Switched {new Date(config.lastSwitched).toLocaleString()}
          </div>
        )}
        <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 shrink-0 animate-pulse" />
      </div>

      {/* ── Mode Selection ───────────────────────────────── */}
      <div className="rounded-xl border border-slate-200 bg-[var(--t-surface-white)] shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100">
          <div className="text-[14px] font-bold text-primary select-none">Database Mode</div>
          <div className="text-[12px] text-muted mt-0.5 select-none">
            Choose where metadata is stored. Files are always local.
          </div>
        </div>
        <div className="p-5 flex flex-col tablet-port:flex-row gap-3">
          {/* Local card */}
          <button
            type="button"
            onClick={() => { setSelectedMode('local'); setTestResult(null); }}
            className={`flex-1 rounded-xl border-2 p-4 text-left transition-all ${
              selectedMode === 'local'
                ? 'border-emerald-500 bg-emerald-50'
                : 'border-slate-200 bg-[var(--t-surface-white)] hover:border-slate-300 hover:bg-slate-50'
            }`}
          >
            <div className="flex items-center gap-3 mb-2">
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                selectedMode === 'local' ? 'bg-emerald-100' : 'bg-slate-100'
              }`}>
                <HardDrive size={16} className={selectedMode === 'local' ? 'text-emerald-700' : 'text-muted'} />
              </div>
              <span className={`text-[14px] font-bold select-none ${
                selectedMode === 'local' ? 'text-emerald-800' : 'text-secondary'
              }`}>Local Database</span>
              {selectedMode === 'local' && (
                <span className="ml-auto text-[10px] font-bold bg-emerald-600 text-white px-2 py-0.5 rounded-full select-none">SELECTED</span>
              )}
            </div>
            <div className="text-[12px] text-muted select-none">
              PostgreSQL at localhost:5432 (WiringSchemeDB). Default for field use — no internet required.
            </div>
            <div className="text-[11px] font-mono text-slate-400 mt-1.5 truncate">{config?.localUrlMasked}</div>
          </button>

          {/* Cloud card */}
          <button
            type="button"
            onClick={() => { setSelectedMode('cloud'); setTestResult(null); }}
            className={`flex-1 rounded-xl border-2 p-4 text-left transition-all ${
              selectedMode === 'cloud'
                ? 'border-indigo-500 bg-indigo-50'
                : 'border-slate-200 bg-[var(--t-surface-white)] hover:border-slate-300 hover:bg-slate-50'
            }`}
          >
            <div className="flex items-center gap-3 mb-2">
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                selectedMode === 'cloud' ? 'bg-indigo-100' : 'bg-slate-100'
              }`}>
                <Cloud size={16} className={selectedMode === 'cloud' ? 'text-indigo-700' : 'text-muted'} />
              </div>
              <span className={`text-[14px] font-bold select-none ${
                selectedMode === 'cloud' ? 'text-indigo-800' : 'text-secondary'
              }`}>Cloud Database</span>
              {selectedMode === 'cloud' && (
                <span className="ml-auto text-[10px] font-bold bg-indigo-600 text-white px-2 py-0.5 rounded-full select-none">SELECTED</span>
              )}
            </div>
            <div className="text-[12px] text-muted select-none">
              Remote PostgreSQL (any host). Shared data across devices. Requires network connectivity.
            </div>
            {cloudUrl && selectedMode === 'cloud' && (
              <div className="text-[11px] font-mono text-slate-400 mt-1.5 truncate">{cloudUrl.replace(/:([^@:/?#]+)@/, ':****@')}</div>
            )}
          </button>
        </div>

        {/* Cloud URL input */}
        {selectedMode === 'cloud' && (
          <div className="px-5 pb-4">
            <label className="text-[12px] font-bold text-muted select-none block mb-1.5">
              Cloud PostgreSQL Connection URL
            </label>
            <input
              type="text"
              value={cloudUrl}
              onChange={e => { setCloudUrl(e.target.value); setTestResult(null); setSaveResult(null); }}
              placeholder="postgresql://user:password@host:5432/database"
              className="form-input w-full font-mono text-[12px]"
              spellCheck={false}
            />
            <p className="text-[11px] text-slate-400 mt-1 select-none">
              Full PostgreSQL connection string. The password is never exposed in logs or the UI.
            </p>
          </div>
        )}

        {/* Notes */}
        <div className="px-5 pb-4">
          <label className="text-[12px] font-bold text-muted select-none block mb-1.5">Notes (optional)</label>
          <input
            type="text"
            value={notes}
            onChange={e => setNotes(e.target.value)}
            placeholder="e.g. Client site Alpha, project phase 2"
            className="form-input w-full text-[13px]"
          />
        </div>

        {/* Action bar */}
        <div className="px-5 py-3 border-t border-slate-100 bg-slate-50 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={handleTest}
            disabled={testing || (selectedMode === 'cloud' && !cloudUrl.trim())}
            className="btn-secondary"
          >
            {testing ? <Loader size={14} className="animate-spin" /> : <Database size={14} />}
            <span>Test Connection</span>
          </button>

          <button
            type="button"
            onClick={handleSave}
            disabled={saving || !dirty}
            className="btn-primary"
          >
            {saving ? <Loader size={14} className="animate-spin" /> : null}
            <span>Save Configuration</span>
          </button>

          {saveResult?.requiresRestart && (
            <button
              type="button"
              onClick={handleRestart}
              disabled={restarting}
              className="btn-warning"
            >
              {restarting ? <Loader size={14} className="animate-spin" /> : <RefreshCw size={14} />}
              <span>{restarting ? 'Restarting…' : 'Restart Backend Now'}</span>
            </button>
          )}
        </div>
      </div>

      {/* ── Test / Save Results ─────────────────────────── */}
      {testResult && (
        <div className={`rounded-xl px-4 py-3 flex items-start gap-3 border ${
          testResult.status === 'ok'
            ? 'bg-emerald-50 border-emerald-200'
            : 'bg-red-50 border-red-200'
        }`}>
          {testResult.status === 'ok'
            ? <CheckCircle size={18} className="text-emerald-600 shrink-0 mt-0.5" />
            : <XCircle size={18} className="text-red-600 shrink-0 mt-0.5" />}
          <div>
            {testResult.status === 'ok' ? (
              <>
                <div className="text-[13px] font-bold text-emerald-800 select-none">Connection successful</div>
                <div className="text-[12px] text-emerald-700 mt-0.5 select-none">
                  Database: <span className="font-mono">{testResult.database}</span>
                  &nbsp;·&nbsp;{testResult.pg_version}
                  &nbsp;·&nbsp;{testResult.latency_ms}ms
                </div>
              </>
            ) : (
              <>
                <div className="text-[13px] font-bold text-red-700 select-none">Connection failed</div>
                <div className="text-[12px] text-red-600 mt-0.5 font-mono">{testResult.message}</div>
              </>
            )}
          </div>
        </div>
      )}

      {saveResult && (
        <div className={`rounded-xl px-4 py-3 flex items-start gap-3 border ${
          saveResult.error
            ? 'bg-red-50 border-red-200'
            : 'bg-amber-50 border-amber-200'
        }`}>
          {saveResult.error
            ? <XCircle size={18} className="text-red-600 shrink-0 mt-0.5" />
            : <AlertTriangle size={18} className="text-amber-600 shrink-0 mt-0.5" />}
          <div>
            {saveResult.error ? (
              <div className="text-[13px] font-bold text-red-700 select-none">{saveResult.error}</div>
            ) : (
              <>
                <div className="text-[13px] font-bold text-amber-800 select-none">Configuration saved — restart required</div>
                <div className="text-[12px] text-amber-700 mt-0.5 select-none">
                  {saveResult.message} Click "Restart Backend Now" to apply immediately, or restart manually.
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* ── File Storage Info ───────────────────────────── */}
      {storage && (
        <div className="rounded-xl border border-slate-200 bg-[var(--t-surface-white)] shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100 flex items-center gap-3">
            <FolderOpen size={18} className="text-muted shrink-0" />
            <div>
              <div className="text-[14px] font-bold text-primary select-none">Local File Storage</div>
              <div className="text-[12px] text-muted select-none">
                Wiring schedules, drawings, and frame JSON files are always stored locally.
              </div>
            </div>
          </div>
          <div className="p-5 grid grid-cols-1 tablet-port:grid-cols-2 tablet-wide:grid-cols-3 gap-3">
            {[
              { label: 'Upload Dir', val: storage.upload_dir, mono: true },
              { label: 'Status', val: storage.exists ? '✓ Exists' : '✗ Missing', tone: storage.exists ? 'completed' : 'danger' },
              { label: 'Projects', val: `${storage.project_dirs} folder${storage.project_dirs !== 1 ? 's' : ''}` },
            ].map(item => (
              <div key={item.label} className="rounded-lg bg-slate-50 border border-slate-200 px-3 py-2">
                <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 select-none">{item.label}</div>
                <div className={`text-[13px] font-semibold mt-0.5 ${
                  item.tone === 'completed' ? 'text-emerald-600' : item.tone === 'danger' ? 'text-red-600' : 'text-secondary'
                } ${item.mono ? 'font-mono text-[11px]' : ''}`}>
                  {item.val}
                </div>
              </div>
            ))}
          </div>
          <div className="px-5 pb-4">
            <div className="text-[11px] text-slate-400 select-none italic">{storage.note}</div>
            <div className="text-[11px] font-mono text-slate-400 mt-1 break-all">{storage.absolute_path}</div>
          </div>
        </div>
      )}
    </div>
  );
}
