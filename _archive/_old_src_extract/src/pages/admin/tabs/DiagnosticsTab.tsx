import { useEffect, useState } from 'react';
import { adminApi } from '../../../services/api';

function MetricCard({ label, val, sub, tone = 'muted', wide = false }: { label: string; val: any; sub?: string; tone?: string; wide?: boolean }) {
  return (
    <div className={`diag-metric-card ${wide ? 'diag-metric-wide' : ''}`}>
      <div className="diag-metric-label">{label}</div>
      <div className="diag-metric-value" data-tone={tone}>{val ?? '—'}</div>
      {sub && <div className="diag-metric-sub">{sub}</div>}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-md">
      <div className="diag-section-title">{title}</div>
      <div className="diag-grid">{children}</div>
    </div>
  );
}

export default function DiagnosticsTab() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [pingResult, setPingResult] = useState<any>(null);
  const [pinging, setPinging] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [msg, setMsg] = useState('');

  const load = () => {
    setLoading(true);
    adminApi.diagnostics().then(d => {
      setData(d);
      setLoading(false);
    }).catch(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, []);

  const doPing = async () => {
    setPinging(true);
    setPingResult(null);
    try {
      const result = await adminApi.dbPing();
      setPingResult(result);
    } catch {
      setPingResult({ status: 'error' });
    } finally {
      setPinging(false);
    }
  };

  const doClearCache = async () => {
    setClearing(true);
    try {
      const result = await adminApi.clearCache();
      setMsg(result.message);
      load();
    } catch {
      setMsg('Failed to clear cache');
    } finally {
      setClearing(false);
    }
  };

  if (loading) return <div className="dwes-empty-state"><div className="dwes-empty-copy">Loading diagnostics...</div></div>;
  if (!data) return <div className="dwes-error">Failed to load diagnostics</div>;

  const heapPct = data.memory.heap_pct;
  const heapTone = heapPct > 80 ? 'danger' : heapPct > 60 ? 'warning' : 'completed';

  return (
    <div>
      <div className="table-toolbar">
        <button onClick={load} className="button-compact" type="button">↻ Refresh</button>
        <button onClick={doPing} disabled={pinging} className="button-compact" type="button">{pinging ? 'Pinging...' : 'DB Ping'}</button>
        <button onClick={doClearCache} disabled={clearing} className="button-compact sessions-clear-btn" type="button">{clearing ? 'Clearing...' : 'Clear Error Buffer'}</button>
      </div>

      {pingResult && (
        <div className={`sync-result ${pingResult.status === 'ok' ? 'is-success' : 'is-error'} mb-md`}>
          <div className="sync-result-title">DB Ping: {pingResult.status === 'ok' ? '✓' : '✗'}</div>
          <div className="sync-result-copy">
            {pingResult.status === 'ok' ? `${pingResult.latency_ms}ms - ${pingResult.records_checked} records checked` : 'Failed'}
          </div>
        </div>
      )}

      {msg && <div className="dwes-message-success mb-md">{msg}</div>}

      <Section title="System">
        <MetricCard label="Node" val={data.system.node_version} tone="completed" />
        <MetricCard label="Platform" val={data.system.platform} />
        <MetricCard label="Uptime" val={data.system.uptime_human} tone="progress" sub={`${data.system.uptime_seconds}s`} />
        <MetricCard label="PID" val={data.system.pid} />
        <MetricCard label="Environment" val={data.system.env} tone="warning" />
      </Section>

      <Section title="Memory">
        <MetricCard label="Heap Used" val={`${data.memory.heap_used_mb} MB`} tone={heapTone} sub={`${data.memory.heap_pct}% of total`} />
        <MetricCard label="Heap Total" val={`${data.memory.heap_total_mb} MB`} />
        <MetricCard label="RSS" val={`${data.memory.rss_mb} MB`} tone="qaqc" />
        <MetricCard label="External" val={`${data.memory.external_mb} MB`} />
      </Section>

      <div className="diag-heap-card mb-md">
        <div className="diag-heap-row">
          <span className="diag-heap-label">Heap Utilization</span>
          <span className="diag-heap-value" data-tone={heapTone}>{heapPct}%</span>
        </div>
        <progress className="diag-heap-progress" data-tone={heapTone} value={heapPct} max={100} />
      </div>

      <Section title="Database (WiringSchemeDB)">
        <MetricCard label="Users" val={data.database.users} tone="progress" />
        <MetricCard label="Projects" val={data.database.projects} tone="progress" />
        <MetricCard label="Frames" val={data.database.frames} />
        <MetricCard label="Assignments" val={data.database.assignments} />
        <MetricCard label="Inspections" val={data.database.inspections} tone="qaqc" />
        <MetricCard label="Audit Logs" val={data.database.audit_logs} />
        <MetricCard label="Session Logs" val={data.database.session_logs} />
        <MetricCard label="Drawings" val={data.database.drawings} />
        <MetricCard label="File Hashes" val={data.database.file_hashes} />
      </Section>

      <Section title="Wiring Summary">
        <MetricCard label="Total Cables" val={data.wiring.total_cables.toLocaleString()} tone="completed" />
        <MetricCard label="Panels Done" val={data.wiring.panels_completed} tone="completed" />
        <MetricCard label="Wiring Hours" val={`${data.wiring.total_wiring_hours}h`} tone="warning" />
        <MetricCard label="QC Done" val={data.wiring.qc_inspections} tone="qaqc" />
      </Section>

      <div>
        <div className="diag-section-title">Recent Errors ({data.recent_errors.length})</div>
        {data.recent_errors.length === 0 ? (
          <div className="diag-no-error">✓ No errors recorded</div>
        ) : (
          <div className="stack-grid-sm">
            {data.recent_errors.map((item: any, index: number) => (
              <div key={index} className="diag-error-row">
                <div className="diag-error-head">
                  <span className="diag-error-context">{item.context}</span>
                  <span className="diag-error-time">{new Date(item.ts).toLocaleTimeString()}</span>
                </div>
                <div className="diag-error-copy">{item.message}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
