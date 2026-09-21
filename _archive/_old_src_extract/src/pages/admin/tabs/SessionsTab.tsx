import { useState, useEffect, useCallback } from 'react';
import { adminApi } from '../../../services/api';
import { useAppDialog } from '../../../components/AppDialogProvider';

function fmtTime(iso: string) {
  return new Date(iso).toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'medium' });
}

export default function SessionsTab() {
  const dialog = useAppDialog();
  const [sessions, setSessions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [limit, setLimit] = useState(100);
  const [filter, setFilter] = useState<'all' | 'login' | 'logout'>('all');
  const [clearing, setClearing] = useState(false);
  const [msg, setMsg] = useState('');

  const load = useCallback(() => {
    setLoading(true);
    adminApi.sessions(limit).then(d => { setSessions(d); setLoading(false); }).catch(() => setLoading(false));
  }, [limit]);

  useEffect(() => { load(); }, [load]);

  const doClear = async () => {
    const ok = await dialog.confirm({
      title: 'Clear Session Logs',
      message: 'This cannot be undone. Clear all session logs?',
      tone: 'delete',
      confirmText: 'Clear Logs',
    });
    if (!ok) return;
    setClearing(true);
    try { const r = await adminApi.clearSessions(); setMsg(r.message); load(); }
    catch { setMsg('Failed to clear sessions'); }
    finally { setClearing(false); }
  };

  const filtered = filter === 'all' ? sessions : sessions.filter(s => s.action === filter);

  const loginCount = sessions.filter(s => s.action === 'login').length;
  const logoutCount = sessions.filter(s => s.action === 'logout').length;
  const uniqueUsers = new Set(sessions.map(s => s.user_id)).size;

  return (
    <div>
      <div className="table-toolbar">
        {(['all', 'login', 'logout'] as const).map(f => {
          return (
            <button key={f} onClick={() => setFilter(f)} className={`button-compact sessions-filter-btn ${filter === f ? 'is-active' : ''}`} data-filter={f} type="button">
              {f.charAt(0).toUpperCase() + f.slice(1)}
              <span className="activity-filter-count">
                ({f === 'all' ? sessions.length : f === 'login' ? loginCount : logoutCount})
              </span>
            </button>
          );
        })}
        <select value={limit} onChange={e => setLimit(parseInt(e.target.value))} className="dwes-select sessions-limit-select">
          <option value={50}>Last 50</option>
          <option value={100}>Last 100</option>
          <option value={500}>Last 500</option>
        </select>
        <button onClick={load} className="button-compact" type="button">↻</button>
        <button onClick={doClear} disabled={clearing || sessions.length === 0} className="button-compact sessions-clear-btn" type="button">
          {clearing ? 'Clearing…' : 'Clear All'}
        </button>
      </div>

      <div className="sessions-summary-grid">
        {[
          { label: 'Total Events', val: sessions.length, tone: 'muted' },
          { label: 'Logins', val: loginCount, tone: 'completed' },
          { label: 'Logouts', val: logoutCount, tone: 'danger' },
          { label: 'Unique Users', val: uniqueUsers, tone: 'progress' },
        ].map(k => (
          <div key={k.label} className="sessions-summary-card">
            <div className="sessions-summary-value" data-tone={k.tone}>{k.val}</div>
            <div className="sessions-summary-label mt-xxs">{k.label}</div>
          </div>
        ))}
      </div>

      {msg && <div className="dwes-message-success mb-md">{msg}</div>}

      {loading && <div className="dwes-empty-state"><div className="dwes-empty-copy">Loading sessions...</div></div>}

      {!loading && filtered.length === 0 && (
        <div className="dwes-empty-state history-empty-state">
          <div className="history-empty-icon">🔑</div>
          <div className="dwes-empty-copy">No session logs yet.</div>
        </div>
      )}

      <div className="sessions-list">
        {filtered.map(s => {
          return (
            <div key={s.id} className="sessions-item" data-action={s.action} data-role={s.login_role}>
              <div className="sessions-dot" data-action={s.action} />

              <div className="sessions-main">
                <div className="sessions-row">
                  <span className="sessions-user">{s.user_name}</span>
                  <span className="activity-dot-sep">·</span>
                  <span className="sessions-role-pill" data-role={s.login_role}>
                    {s.login_role.replace(/_/g, ' ').toUpperCase()}
                  </span>
                  <span className="sessions-action" data-action={s.action}>{s.action.replace(/_/g, ' ').toUpperCase()}</span>
                </div>
                <div className="sessions-meta mt-xxs">
                  IP: {s.ip_address || '—'}{s.project_code ? ` · Project: ${s.project_code}` : ''}
                </div>
              </div>

              <div className="sessions-time">
                {fmtTime(s.created_at)}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}


