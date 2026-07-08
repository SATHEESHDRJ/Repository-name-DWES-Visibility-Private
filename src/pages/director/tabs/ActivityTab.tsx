import { useState, useEffect, useCallback } from 'react';
import { directorApi } from '../../../services/api';
import { RefreshCw, ClipboardList } from '../../../components/ui/icons';

const TYPE_LABEL: Record<string, string> = { session: 'SESSION', audit: 'WIRING' };

function fmtTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export default function ActivityTab() {
  const [activity, setActivity] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'session' | 'audit'>('all');
  const [limit, setLimit] = useState(50);

  const load = useCallback(() => {
    setLoading(true);
    directorApi.activity(limit).then(d => { setActivity(d); setLoading(false); }).catch(() => setLoading(false));
  }, [limit]);

  useEffect(() => { load(); }, [load]);

  const filtered = filter === 'all' ? activity : activity.filter(a => a.type === filter);

  return (
    <div>
      <div className="toolbar">
        {(['all', 'session', 'audit'] as const).map(f => (
          <button key={f} onClick={() => setFilter(f)} className={`tab-btn activity-filter-btn ${filter === f ? 'active' : ''}`} data-type={f} type="button">
            {f === 'all' ? 'All' : f === 'session' ? 'Login/Logout' : 'Wiring Actions'}
            <span className="activity-filter-count">
              ({f === 'all' ? activity.length : activity.filter(a => a.type === f).length})
            </span>
          </button>
        ))}
        <select value={limit} onChange={e => setLimit(parseInt(e.target.value))} className="form-select ml-auto min-w-220 activity-limit-select">
          <option value={50}>Last 50</option>
          <option value={100}>Last 100</option>
          <option value={200}>Last 200</option>
        </select>
        <button onClick={load} className="btn-sm" type="button">
          <RefreshCw size={14} />
          <span>Refresh</span>
        </button>
      </div>

      {loading && <div className="empty-state"><p className="empty-text">Loading activity...</p></div>}

      {!loading && filtered.length === 0 && (
        <div className="empty-state history-empty-state">
          <div className="history-empty-icon"><ClipboardList size={32} /></div>
          <p className="empty-text">No activity recorded yet.</p>
          <div className="history-item-meta mt-1">Activity appears as technicians log in, start panels, and update wiring status.</div>
        </div>
      )}

      <div className="relative pl-6 before:content-[''] before:absolute before:left-[11px] before:top-4 before:bottom-4 before:w-[2px] before:bg-[#E2E8F0] flex flex-col gap-6 mt-4 pb-8">
        {filtered.map((item, idx) => {
          const isLatest = idx === 0;
          return (
            <div key={item.id} className="relative flex flex-col gap-1.5 bg-white p-4 rounded-[12px] border border-[#E2E8F0] shadow-sm ml-4">
              <div className={`absolute left-[-26px] top-5 w-3 h-3 rounded-full ring-[4px] ring-[#F8FAFC] ${isLatest ? 'bg-blue-600 ring-blue-100' : 'bg-slate-300'}`} />
              
              <div className="flex items-center gap-3 mb-1">
                <span className="text-[12px] font-semibold text-slate-500">{fmtTime(item.created_at)}</span>
                <span className="px-2 py-0.5 bg-slate-100 text-slate-600 text-[10px] font-bold uppercase tracking-wider rounded-[6px]">
                  {TYPE_LABEL[item.type] || item.type.toUpperCase()}
                </span>
              </div>
              
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[14px] font-bold text-slate-800 uppercase tracking-wide">{item.action.replace(/_/g, ' ')}</span>
                <span className="text-[13px] text-slate-400 font-medium">by</span>
                <span className="text-[13px] font-bold text-slate-700">{item.user_name}</span>
                
                {item.project_code && item.project_code !== '—' && (
                  <>
                    <span className="text-[13px] text-slate-300 font-bold px-1">·</span>
                    <span className="text-[13px] font-mono font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded-[6px] border border-blue-100">
                      {item.project_code}
                    </span>
                  </>
                )}
              </div>
              
              <div className="text-[13px] font-medium text-slate-600 mt-1 leading-relaxed max-w-[800px]">{item.details}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
