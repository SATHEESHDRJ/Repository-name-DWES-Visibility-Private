import { useEffect, useState } from 'react';
import { adminApi } from '../../../services/api';
import { RefreshCw, CheckCircle, XCircle } from '../../../components/ui/icons';
import { DwesLoadingCenter } from '../../../components/ui/DwesLoadingIndicator';
import { WorkspaceInfoMatrix } from '../../../components/ui/WorkspaceInfoMatrix';

function MetricCard({ label, val, sub, wide = false }: { label: string; val: any; sub?: string; wide?: boolean }) {
  return (
    <div className={`dw-wim-cell${wide ? ' dw-wim-matrix-span' : ''}`}>
      <span className="dw-wim-label">{label}</span>
      <span className="dw-wim-value dw-wim-value--primary">{val ?? '—'}</span>
      {sub ? <span className="dw-wim-value dw-wim-value--meta">{sub}</span> : null}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-8">
      <div className="text-[14px] font-bold text-primary uppercase tracking-[0.08em] mb-4 pb-2 border-b border-[#E2E8F0]">{title}</div>
      <WorkspaceInfoMatrix columns={4}>{children}</WorkspaceInfoMatrix>
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

  if (loading) return <DwesLoadingCenter label="Loading diagnostics…" className="flex items-center justify-center p-12" />;
  if (!data) return <div className="p-4 bg-red-50 text-red-600 rounded-[10px] border border-red-200">Failed to load diagnostics</div>;

  const heapPct = data.memory.heap_pct;

  return (
    <div className="p-2">
      <div className="flex items-center gap-3 mb-6">
        <button onClick={load} className="flex items-center justify-center gap-2 h-[44px] px-[16px] bg-[var(--t-surface-white)] border border-[#E2E8F0] text-secondary font-medium text-[14px] rounded-[10px] hover:bg-slate-50 transition-colors shadow-sm" type="button">
          <RefreshCw size={16} strokeWidth={1.5} />
          <span>Refresh</span>
        </button>
        <button onClick={doPing} disabled={pinging} className="flex items-center justify-center h-[44px] px-[16px] bg-[var(--t-surface-white)] border border-[#E2E8F0] text-secondary font-medium text-[14px] rounded-[10px] hover:bg-slate-50 transition-colors shadow-sm disabled:opacity-50" type="button">
          {pinging ? 'Pinging...' : 'DB Ping'}
        </button>
        <button onClick={doClearCache} disabled={clearing} className="flex items-center justify-center h-[44px] px-[16px] bg-[var(--t-surface-white)] border border-[#E2E8F0] text-secondary font-medium text-[14px] rounded-[10px] hover:bg-red-50 hover:text-red-600 transition-colors shadow-sm ml-auto disabled:opacity-50" type="button">
          {clearing ? 'Clearing...' : 'Clear Error Buffer'}
        </button>
      </div>

      {pingResult && (
        <div className={`p-4 rounded-[10px] border mb-6 flex flex-col gap-1 ${pingResult.status === 'ok' ? 'bg-green-50 border-green-200 text-green-800' : 'bg-red-50 border-red-200 text-red-800'}`}>
          <div className="flex items-center gap-2 font-bold text-[14px]">
            DB Ping: {pingResult.status === 'ok' ? <CheckCircle size={18} strokeWidth={2} className="text-green-600" /> : <XCircle size={18} strokeWidth={2} className="text-red-600" />}
          </div>
          <div className="text-[13px] font-medium opacity-80">
            {pingResult.status === 'ok' ? `${pingResult.latency_ms}ms - ${pingResult.records_checked} records checked` : 'Failed to connect to database'}
          </div>
        </div>
      )}

      {msg && <div className="p-4 bg-green-50 border border-green-200 text-green-700 rounded-[10px] text-[14px] font-medium mb-6">{msg}</div>}

      <Section title="System">
        <MetricCard label="Node" val={data.system.node_version} />
        <MetricCard label="Platform" val={data.system.platform} />
        <MetricCard label="Uptime" val={data.system.uptime_human} sub={`${data.system.uptime_seconds}s`} />
        <MetricCard label="Environment" val={data.system.env} />
      </Section>

      <Section title="Memory">
        <MetricCard label="Heap Used" val={`${data.memory.heap_used_mb} MB`} sub={`${heapPct}% of total`} />
        <MetricCard label="Heap Total" val={`${data.memory.heap_total_mb} MB`} />
        <MetricCard label="RSS" val={`${data.memory.rss_mb} MB`} />
        <MetricCard label="External" val={`${data.memory.external_mb} MB`} />
      </Section>

      <div className="mb-8 p-6 border border-[#E2E8F0] rounded-[10px] bg-slate-50 flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <span className="text-[13px] font-bold text-secondary uppercase tracking-[0.06em]">Heap Utilization</span>
          <span className={`text-[14px] font-bold ${heapPct > 80 ? 'text-red-600' : heapPct > 60 ? 'text-amber-600' : 'text-green-600'}`}>{heapPct}%</span>
        </div>
        <div className="h-3 w-full bg-slate-200 rounded-full overflow-hidden">
          <div 
            className={`h-full ${heapPct > 80 ? 'bg-red-500' : heapPct > 60 ? 'bg-amber-500' : 'bg-green-500'}`} 
            style={{ width: `${Math.min(100, Math.max(0, heapPct))}%` }}
          />
        </div>
      </div>

      <Section title="Database (WiringSchemeDB)">
        <MetricCard label="Users" val={data.database.users} />
        <MetricCard label="Projects" val={data.database.projects} />
        <MetricCard label="Frames" val={data.database.frames} />
        <MetricCard label="Assignments" val={data.database.assignments} />
        <MetricCard label="Inspections" val={data.database.inspections} />
        <MetricCard label="Audit Logs" val={data.database.audit_logs} />
        <MetricCard label="Session Logs" val={data.database.session_logs} />
        <MetricCard label="File Hashes" val={data.database.file_hashes} />
      </Section>

      <Section title="Wiring Summary">
        <MetricCard label="Total Cables" val={data.wiring.total_cables.toLocaleString()} />
        <MetricCard label="Panels Done" val={data.wiring.panels_completed} />
        <MetricCard label="Wiring Hours" val={`${data.wiring.total_wiring_hours}h`} />
        <MetricCard label="QC Done" val={data.wiring.qc_inspections} />
      </Section>

      <div className="mb-8">
        <div className="flex items-center gap-2 mb-4 pb-2 border-b border-[#E2E8F0]">
          <span className="text-[14px] font-bold text-primary uppercase tracking-[0.08em]">Recent Errors</span>
          <span className="px-2 py-0.5 bg-red-100 text-red-700 rounded-full text-[11px] font-bold">{data.recent_errors.length}</span>
        </div>
        {data.recent_errors.length === 0 ? (
          <div className="p-6 bg-green-50 border border-green-200 rounded-[10px] text-green-700 text-[14px] font-medium flex items-center gap-2">
            <CheckCircle size={18} strokeWidth={2} /> No errors recorded recently
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {data.recent_errors.map((item: any, index: number) => (
              <div key={index} className="flex flex-col gap-2 p-4 bg-red-50 border border-red-200 rounded-[10px]">
                <div className="flex items-center justify-between">
                  <span className="text-[12px] font-bold text-red-800 uppercase tracking-[0.06em] px-2 py-0.5 bg-red-200/50 rounded-[4px]">{item.context}</span>
                  <span className="text-[12px] font-medium text-red-500">{new Date(item.ts).toLocaleString()}</span>
                </div>
                <div className="text-[13px] font-mono text-red-700 break-words leading-relaxed whitespace-pre-wrap">
                  {item.message}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
