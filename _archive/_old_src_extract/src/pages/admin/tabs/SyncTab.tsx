import { useEffect, useState } from 'react';
import { adminApi } from '../../../services/api';

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

  if (loading) return <div className="dwes-empty-state"><div className="dwes-empty-copy">Loading sync status...</div></div>;

  return (
    <div>
      <div className="sync-banner">
        <div className="sync-banner-dot" />
        <div>
          <div className="sync-banner-title">PostgreSQL Not Connected</div>
          <div className="sync-banner-copy">
            Local: <span className="sync-banner-strong">in-memory (mock)</span> · Cloud target: <span className="sync-banner-strong">{storage?.target}</span>
          </div>
        </div>
        <div className="sync-banner-note">Sync operations are simulated</div>
      </div>

      {storage && (
        <div className="sync-card mb-md">
          <div className="sync-card-label">Local Store - {storage.total_rows} rows · ~{storage.estimated_size_kb} KB</div>
          <div className="sync-table-grid">
            {storage.tables.map((table: any) => (
              <div key={table.name} className="sync-table-item">
                <span className="sync-table-name">{table.name.replace(/_/g, ' ')}</span>
                <span className="sync-table-value" data-hasrows={table.rows > 0 ? 'true' : 'false'}>{table.rows}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="sync-card mb-md">
        <div className="sync-card-label">Sync Strategy</div>
        <div className="sync-strategy-grid">
          {STRATEGIES.map(item => (
            <button key={item.val} className={`sync-strategy-card ${strategy === item.val ? 'is-active' : ''}`} data-tone={item.tone} onClick={() => setStrategy(item.val)} type="button">
              <div className="sync-strategy-title">{item.label}</div>
              <div className="sync-strategy-copy">{item.desc}</div>
            </button>
          ))}
        </div>

        <div className="touch-action-row">
          <button onClick={doInspect} disabled={inspecting} className="dwes-button dwes-button-progress" type="button">{inspecting ? 'Inspecting...' : 'Inspect Plan'}</button>
          <button onClick={doExecute} disabled={executing} className="dwes-button dwes-button-primary" type="button">
            {executing ? 'Executing...' : `Execute: ${STRATEGIES.find(s => s.val === strategy)?.label}`}
          </button>
        </div>
      </div>

      {inspectResult && (
        <div className="sync-card mb-md">
          <div className="sync-card-label">Sync Plan - {inspectResult.total_to_push} rows to push</div>
          {inspectResult.plan?.map((plan: any) => (
            <div key={plan.table} className="sync-plan-row">
              <span className="sync-plan-table">{plan.table.replace(/_/g, ' ')}</span>
              <span className="sync-plan-local">{plan.local_rows} local</span>
              <span className="sync-plan-action" data-action={plan.action}>{plan.action}</span>
            </div>
          ))}
          <div className="sync-plan-note">{inspectResult.note}</div>
        </div>
      )}

      {execResult && (
        <div className={`sync-result ${execResult.status === 'error' ? 'is-error' : 'is-success'} mb-md`}>
          <div className="sync-result-title">{execResult.status === 'error' ? '✗ Failed' : '✓ Complete'}</div>
          <div className="sync-result-copy">{execResult.message}</div>
          {execResult.records_affected > 0 && <div className="sync-result-meta">{execResult.records_affected} records affected</div>}
        </div>
      )}

      {syncStatus?.history?.length > 0 && (
        <div>
          <div className="sync-card-label mb-sm">Sync History</div>
          <div className="stack-grid-sm">
            {syncStatus.history.map((item: any, index: number) => (
              <div key={index} className="sync-history-row">
                <span className="sync-history-strategy">{item.strategy}</span>
                <span className="sync-history-rows">{item.records} rows</span>
                <span className="sync-history-time">{new Date(item.ts).toLocaleString()}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
