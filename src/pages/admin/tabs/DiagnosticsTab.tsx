import { useEffect, useState } from 'react';
import { adminApi } from '../../../services/api';
import { RefreshCw, CheckCircle, XCircle } from '../../../components/ui/icons';

function MetricCard({ label, val, sub, tone = 'muted', wide = false }: { label: string; val: any; sub?: string; tone?: string; wide?: boolean }) {
  const isDanger = tone === 'danger';
  const isWarning = tone === 'warning';
  const isSuccess = tone === 'completed' || tone === 'progress' || tone === 'qaqc';
  const bgClass = isDanger ? 'bg-red-50 text-red-700' : isWarning ? 'bg-amber-50 text-amber-700' : isSuccess ? 'bg-green-50 text-green-700' : 'bg-blue-50 text-blue-700';

  return (
    <div className={`h-[90px] border border-[#E2E8F0] rounded-[10px] bg-white p-4 flex flex-col justify-between shadow-sm hover:border-blue-200 transition-colors ${wide ? 'col-span-2 md:col-span-4 lg:col-span-2' : ''}`}>
      <div className="flex items-center justify-between">
        <span className="text-[12px] font-bold text-slate-500 uppercase tracking-[0.06em] truncate">{label}</span>
        {sub && <span className="text-[11px] font-medium text-slate-400 truncate ml-2">{sub}</span>}
      </div>
      <div className={`text-[18px] font-bold px-2.5 py-0.5 rounded-[6px] w-fit truncate ${bgClass}`}>
        {val ?? '—'}
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-8">
      <div className="text-[14px] font-bold text-slate-800 uppercase tracking-[0.08em] mb-4 pb-2 border-b border-[#E2E8F0]">{title}</div>
      <div className="grid grid-cols-2 tablet-port:grid-cols-3 tablet-land:grid-cols-4 gap-4">{children}</div>
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

  if (loading) return <div className="flex items-center justify-center p-12 text-slate-500">Loading diagnostics...</div>;
  if (!data) return <div className="p-4 bg-red-50 text-red-600 rounded-[10px] border border-red-200">Failed to load diagnostics</div>;

  const heapPct = data.memory.heap_pct;
  const heapTone = heapPct > 80 ? 'danger' : heapPct > 60 ? 'warning' : 'completed';

  return (
    <div className="p-2">
      <div className="flex items-center gap-3 mb-6">
        <button onClick={load} className="flex items-center justify-center gap-2 h-[44px] px-[16px] bg-white border border-[#E2E8F0] text-slate-700 font-medium text-[14px] rounded-[10px] hover:bg-slate-50 transition-colors shadow-sm" type="button">
          <RefreshCw size={16} strokeWidth={1.5} />
          <span>Refresh</span>
        </button>
        <button onClick={doPing} disabled={pinging} className="flex items-center justify-center h-[44px] px-[16px] bg-white border border-[#E2E8F0] text-slate-700 font-medium text-[14px] rounded-[10px] hover:bg-slate-50 transition-colors shadow-sm disabled:opacity-50" type="button">
          {pinging ? 'Pinging...' : 'DB Ping'}
        </button>
        <button onClick={doClearCache} disabled={clearing} className="flex items-center justify-center h-[44px] px-[16px] bg-white border border-[#E2E8F0] text-slate-700 font-medium text-[14px] rounded-[10px] hover:bg-red-50 hover:text-red-600 transition-colors shadow-sm ml-auto disabled:opacity-50" type="button">
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
        <MetricCard label="Node" val={data.system.node_version} tone="completed" />
        <MetricCard label="Platform" val={data.system.platform} />
        <MetricCard label="Uptime" val={data.system.uptime_human} tone="progress" sub={`${data.system.uptime_seconds}s`} />
        <MetricCard label="Environment" val={data.system.env} tone="warning" />
      </Section>

      <Section title="Memory">
        <MetricCard label="Heap Used" val={`${data.memory.heap_used_mb} MB`} tone={heapTone} sub={`${heapPct}% of total`} />
        <MetricCard label="Heap Total" val={`${data.memory.heap_total_mb} MB`} />
        <MetricCard label="RSS" val={`${data.memory.rss_mb} MB`} tone="qaqc" />
        <MetricCard label="External" val={`${data.memory.external_mb} MB`} />
      </Section>

      <div className="mb-8 p-6 border border-[#E2E8F0] rounded-[10px] bg-slate-50 flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <span className="text-[13px] font-bold text-slate-700 uppercase tracking-[0.06em]">Heap Utilization</span>
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
        <MetricCard label="Users" val={data.database.users} tone="progress" />
        <MetricCard label="Projects" val={data.database.projects} tone="progress" />
        <MetricCard label="Frames" val={data.database.frames} />
        <MetricCard label="Assignments" val={data.database.assignments} />
        <MetricCard label="Inspections" val={data.database.inspections} tone="qaqc" />
        <MetricCard label="Audit Logs" val={data.database.audit_logs} />
        <MetricCard label="Session Logs" val={data.database.session_logs} />
        <MetricCard label="File Hashes" val={data.database.file_hashes} />
      </Section>

      <Section title="Wiring Summary">
        <MetricCard label="Total Cables" val={data.wiring.total_cables.toLocaleString()} tone="completed" />
        <MetricCard label="Panels Done" val={data.wiring.panels_completed} tone="completed" />
        <MetricCard label="Wiring Hours" val={`${data.wiring.total_wiring_hours}h`} tone="warning" />
        <MetricCard label="QC Done" val={data.wiring.qc_inspections} tone="qaqc" />
      </Section>

      <div className="mb-8">
        <div className="flex items-center gap-2 mb-4 pb-2 border-b border-[#E2E8F0]">
          <span className="text-[14px] font-bold text-slate-800 uppercase tracking-[0.08em]">Recent Errors</span>
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
