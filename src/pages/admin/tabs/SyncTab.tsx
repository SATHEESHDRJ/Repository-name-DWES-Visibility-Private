import { useEffect, useState } from 'react';
import { adminApi } from '../../../services/api';
import { CheckCircle, XCircle } from '../../../components/ui/icons';
import { DwesLoadingState } from '../../../components/ui/DwesLoadingIndicator';

type Strategy = 'push_all' | 'pull_all' | 'merge' | 'dry_run';

const STRATEGIES: { val: Strategy; label: string; desc: string; tone: string }[] = [
  { val: 'dry_run', label: 'Dry Run', tone: 'progress', desc: 'Preview what would be synced - no changes made' },
  { val: 'push_all', label: 'Push All', tone: 'completed', desc: 'Export all local data and overwrite cloud DB' },
  { val: 'pull_all', label: 'Pull All', tone: 'qaqc', desc: 'Import cloud DB and overwrite local state' },
  { val: 'merge', label: 'Smart Merge', tone: 'warning', desc: 'Merge by timestamp and keep newest rows' },
];

export default function SyncTab() {
  const [storage, setStorage] = useState<any>(null);
  const [syncStatus, setSyncStatus] = useState<any>(null);
  const [inspectResult, setInspectResult] = useState<any>(null);
  const [strategy, setStrategy] = useState<Strategy>('dry_run');
  const [executing, setExecuting] = useState(false);
  const [inspecting, setInspecting] = useState(false);
  const [execResult, setExecResult] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const loadAll = () => {
    setLoading(true);
    Promise.all([adminApi.syncStorage(), adminApi.syncStatus()])
      .then(([s, st]) => {
        setStorage(s);
        setSyncStatus(st);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  };

  useEffect(() => {
    loadAll();
  }, []);

  const doInspect = async () => {
    setInspecting(true);
    setInspectResult(null);
    try {
      const r = await adminApi.syncInspect();
      setInspectResult(r);
    } catch {
      setInspectResult({ error: 'Inspect failed' });
    } finally {
      setInspecting(false);
    }
  };

  const doExecute = async () => {
    setExecuting(true);
    setExecResult(null);
    try {
      const r = await adminApi.syncExecute(strategy);
      setExecResult(r);
      loadAll();
    } catch {
      setExecResult({ status: 'error', message: 'Execution failed' });
    } finally {
      setExecuting(false);
    }
  };

  if (loading) return <DwesLoadingState label="Loading sync status…" />;

  const TONE_ACTIVE: Record<string, string> = {
    progress:  'border-blue-500 bg-blue-50',
    completed: 'border-green-500 bg-green-50',
    qaqc:      'border-indigo-500 bg-indigo-50',
    warning:   'border-amber-500 bg-amber-50',
  };
  const TONE_IDLE: Record<string, string> = {
    progress:  'border-slate-200 hover:border-blue-300',
    completed: 'border-slate-200 hover:border-green-300',
    qaqc:      'border-slate-200 hover:border-indigo-300',
    warning:   'border-slate-200 hover:border-amber-300',
  };

  return (
    <div className="flex flex-col gap-4">
      {/* offline banner */}
      <div className="flex items-center gap-3 bg-amber-50 border border-amber-200 rounded-xl p-4">
        <div className="w-3 h-3 rounded-full bg-amber-500 shrink-0" />
        <div>
          <div className="text-sm font-semibold text-amber-800">PostgreSQL Not Connected</div>
          <div className="text-xs text-amber-700 mt-0.5">
            Local: <span className="font-semibold">in-memory (mock)</span> · Cloud target: <span className="font-semibold">{storage?.target}</span>
          </div>
        </div>
        <div className="ml-auto text-xs text-amber-600 shrink-0">Sync operations are simulated</div>
      </div>

      {storage && (
        <div className="card p-4">
          <div className="text-[11px] font-bold uppercase tracking-wider text-muted mb-3">
            Local Store — {storage.total_rows} rows · ~{storage.estimated_size_kb} KB
          </div>
          <div className="grid grid-cols-2 tablet-land:grid-cols-3 gap-1">
            {storage.tables.map((table: any) => (
              <div key={table.name} className="flex items-center justify-between py-1.5 border-b border-slate-100">
                <span className="text-sm text-muted">{table.name.replace(/_/g, ' ')}</span>
                <span className={`text-sm font-bold ${table.rows > 0 ? 'text-blue-700' : 'text-slate-400'}`}>{table.rows}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="card p-4">
        <div className="text-[11px] font-bold uppercase tracking-wider text-muted mb-3">Sync Strategy</div>
        <div className="grid grid-cols-2 tablet-land:grid-cols-4 gap-3 mb-4">
          {STRATEGIES.map(item => (
            <button
              key={item.val}
              onClick={() => setStrategy(item.val)}
              type="button"
              className={`flex flex-col gap-1 p-3 border-2 rounded-xl text-left transition-all
                ${strategy === item.val ? (TONE_ACTIVE[item.tone] ?? 'border-blue-500 bg-blue-50') : (TONE_IDLE[item.tone] ?? 'border-slate-200')}`}
            >
              <div className="text-sm font-semibold text-primary">{item.label}</div>
              <div className="text-xs text-muted">{item.desc}</div>
            </button>
          ))}
        </div>
        <div className="flex items-center gap-3">
          <button onClick={doInspect} disabled={inspecting} className="btn-primary" type="button">
            {inspecting ? 'Inspecting...' : 'Inspect Plan'}
          </button>
          <button onClick={doExecute} disabled={executing} className="btn-primary" type="button">
            {executing ? 'Executing...' : `Execute: ${STRATEGIES.find(s => s.val === strategy)?.label}`}
          </button>
        </div>
      </div>

      {inspectResult && (
        <div className="card p-4">
          <div className="text-[11px] font-bold uppercase tracking-wider text-muted mb-3">
            Sync Plan — {inspectResult.total_to_push} rows to push
          </div>
          <div className="flex flex-col">
            {inspectResult.plan?.map((plan: any) => (
              <div key={plan.table} className="flex items-center gap-3 py-2 border-b border-slate-100 last:border-0">
                <span className="text-sm font-medium text-secondary flex-1">{plan.table.replace(/_/g, ' ')}</span>
                <span className="text-xs text-muted">{plan.local_rows} local</span>
                <span className={`text-xs font-bold uppercase px-2 py-0.5 rounded-full ${
                  plan.action === 'push' ? 'bg-blue-100 text-blue-700' :
                  plan.action === 'skip' ? 'bg-slate-100 text-muted' :
                  'bg-amber-100 text-amber-700'}`}>
                  {plan.action}
                </span>
              </div>
            ))}
          </div>
          {inspectResult.note && <div className="text-xs text-muted mt-2">{inspectResult.note}</div>}
        </div>
      )}

      {execResult && (
        <div className={execResult.status === 'error' ? 'flash-err' : 'flash-ok'}>
          <div className="flex items-center gap-1.5 font-semibold mb-0.5">
            {execResult.status === 'error' ? <XCircle size={16} /> : <CheckCircle size={16} />}
            <span>{execResult.status === 'error' ? 'Failed' : 'Complete'}</span>
          </div>
          <div className="text-sm">{execResult.message}</div>
          {execResult.records_affected > 0 && (
            <div className="text-xs opacity-70 mt-0.5">{execResult.records_affected} records affected</div>
          )}
        </div>
      )}

      {syncStatus?.history?.length > 0 && (
        <div>
          <div className="text-[11px] font-bold uppercase tracking-wider text-muted mb-3 pb-2 border-b border-slate-200">
            Sync History
          </div>
          <div className="table-wrapper">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Strategy</th>
                  <th>Records Affected</th>
                  <th className="text-right">Time</th>
                </tr>
              </thead>
              <tbody>
                {syncStatus.history.map((item: any, index: number) => (
                  <tr key={index}>
                    <td className="font-bold uppercase tracking-wide text-xs">{item.strategy.replace('_', ' ')}</td>
                    <td>{item.records} rows</td>
                    <td className="text-right text-muted whitespace-nowrap">{new Date(item.ts).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
