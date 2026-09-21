import { useState, useEffect, useCallback } from 'react';
import { directorApi } from '../../../services/api';

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
      <div className="table-toolbar">
        {(['all', 'session', 'audit'] as const).map(f => (
          <button key={f} onClick={() => setFilter(f)} className={`button-compact activity-filter-btn ${filter === f ? 'is-active' : ''}`} data-type={f} type="button">
            {f === 'all' ? 'All' : f === 'session' ? 'Login/Logout' : 'Wiring Actions'}
            <span className="activity-filter-count">
              ({f === 'all' ? activity.length : activity.filter(a => a.type === f).length})
            </span>
          </button>
        ))}
        <select value={limit} onChange={e => setLimit(parseInt(e.target.value))} className="dwes-select ml-auto min-w-220 activity-limit-select">
          <option value={50}>Last 50</option>
          <option value={100}>Last 100</option>
          <option value={200}>Last 200</option>
        </select>
        <button onClick={load} className="button-compact" type="button">
          ↻ Refresh
        </button>
      </div>

      {loading && <div className="dwes-empty-state"><div className="dwes-empty-copy">Loading activity...</div></div>}

      {!loading && filtered.length === 0 && (
        <div className="dwes-empty-state history-empty-state">
          <div className="history-empty-icon">📋</div>
          <div className="dwes-empty-copy">No activity recorded yet.</div>
          <div className="history-item-meta mt-xxs">Activity appears as technicians log in, start panels, and update wiring status.</div>
        </div>
      )}

      <div className="activity-list">
        {filtered.map(item => {
          return (
            <div key={item.id} className="activity-item" data-action={item.action} data-type={item.type}>
              <span className="activity-type-badge" data-type={item.type}>
                {TYPE_LABEL[item.type] || item.type.toUpperCase()}
              </span>

              <div className="activity-action-dot" data-action={item.action} />

              <div className="activity-main">
                <div className="activity-main-row">
                  <span className="activity-user">{item.user_name}</span>
                  <span className="activity-dot-sep">·</span>
                  <span className="activity-action" data-action={item.action}>{item.action.replace(/_/g, ' ').toUpperCase()}</span>
                  {item.project_code && item.project_code !== '—' && (
                    <>
                      <span className="activity-dot-sep">·</span>
                      <span className="activity-project">{item.project_code}</span>
                    </>
                  )}
                </div>
                <div className="activity-details mt-xxs">
                  {item.details}
                </div>
              </div>

              <div className="activity-time">
                {fmtTime(item.created_at)}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
