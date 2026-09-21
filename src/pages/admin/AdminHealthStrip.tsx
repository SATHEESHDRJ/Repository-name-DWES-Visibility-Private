import { useCallback, useEffect, useState } from 'react';
import { adminApi } from '../../services/api';
import { useLiveConnection } from '../../store/useLiveConnection';
import { useDwesRefresh } from '../../hooks/useDwesRefresh';

type DiagnosticsPayload = {
  database?: {
    users?: number;
    projects?: number;
    frames?: number;
    assignments?: number;
    audit_logs?: number;
    session_logs?: number;
  };
  wiring?: {
    total_cables?: number;
    panels_completed?: number;
  };
  system?: {
    uptime_human?: string;
    env?: string;
  };
  memory?: {
    heap_pct?: number;
  };
  recent_errors?: unknown[];
};

type UserRow = {
  is_active?: boolean;
  role?: string;
};

/**
 * Read-only admin portfolio strip — canonical diagnostics + user inventory.
 * Does not invent new business actions; Manage Users remains the existing entry point.
 */
export default function AdminHealthStrip() {
  const connected = useLiveConnection(s => s.connected);
  const lastEventAt = useLiveConnection(s => s.lastEventAt);
  const [diag, setDiag] = useState<DiagnosticsPayload | null>(null);
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    setError('');
    try {
      const [d, u] = await Promise.all([
        adminApi.diagnostics(),
        adminApi.allUsers().catch(() => []),
      ]);
      setDiag(d || null);
      setUsers(Array.isArray(u) ? u : []);
    } catch {
      if (!silent) {
        setDiag(null);
        setError('Could not load admin diagnostics');
      }
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => { void load(false); }, [load]);
  useDwesRefresh(() => { void load(true); });

  const activeUsers = users.filter(u => u.is_active !== false).length;
  const disabledUsers = users.filter(u => u.is_active === false).length;
  const technicians = users.filter(u => String(u.role || '').includes('technician')).length;
  const errorCount = diag?.recent_errors?.length ?? 0;
  const dbUsers = diag?.database?.users;
  const liveLabel = connected ? 'Live' : 'Polling';
  const liveChip = connected
    ? 'dwes-status-chip dwes-status-chip--completed'
    : 'dwes-status-chip dwes-status-chip--attention';
  const updated = lastEventAt
    ? new Date(lastEventAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    : null;

  return (
    <section className="admin-health-strip" aria-label="System health overview" aria-busy={loading}>
      <div className="admin-health-head">
        <h2 className="admin-health-title">System health</h2>
        <div className="admin-health-head-meta">
          <span className={liveChip}>{liveLabel}</span>
          {updated ? <span className="admin-health-updated">Updated {updated}</span> : null}
        </div>
      </div>

      {error ? (
        <p className="admin-health-error" role="alert">{error}</p>
      ) : null}

      <div className="admin-health-groups">
        <div className="admin-health-group" aria-label="Headcount">
          <span className="admin-health-group-label">Headcount</span>
          <ul className="admin-health-kpis">
            <li>
              <span className="dwes-status-chip dwes-status-chip--planned">
                Total <strong className="tabular-nums">{loading ? '…' : (dbUsers ?? users.length)}</strong>
              </span>
            </li>
            <li>
              <span className="dwes-status-chip dwes-status-chip--completed">
                Active <strong className="tabular-nums">{loading ? '…' : activeUsers}</strong>
              </span>
            </li>
            <li>
              <span className={`dwes-status-chip ${disabledUsers > 0 ? 'dwes-status-chip--attention' : 'dwes-status-chip--planned'}`}>
                Disabled <strong className="tabular-nums">{loading ? '…' : disabledUsers}</strong>
              </span>
            </li>
            <li>
              <span className="dwes-status-chip dwes-status-chip--assigned">
                Technicians <strong className="tabular-nums">{loading ? '…' : technicians}</strong>
              </span>
            </li>
          </ul>
        </div>

        <div className="admin-health-group" aria-label="Application and data">
          <span className="admin-health-group-label">Application / data</span>
          <ul className="admin-health-kpis">
            <li>
              <span className="dwes-status-chip dwes-status-chip--planned">
                Projects <strong className="tabular-nums">{loading ? '…' : (diag?.database?.projects ?? '—')}</strong>
              </span>
            </li>
            <li>
              <span className="dwes-status-chip dwes-status-chip--planned">
                Frames <strong className="tabular-nums">{loading ? '…' : (diag?.database?.frames ?? '—')}</strong>
              </span>
            </li>
            <li>
              <span className="dwes-status-chip dwes-status-chip--assigned">
                Assignments <strong className="tabular-nums">{loading ? '…' : (diag?.database?.assignments ?? '—')}</strong>
              </span>
            </li>
            <li>
              <span className="dwes-status-chip dwes-status-chip--completed">
                Panels done <strong className="tabular-nums">{loading ? '…' : (diag?.wiring?.panels_completed ?? '—')}</strong>
              </span>
            </li>
          </ul>
        </div>

        <div className="admin-health-group" aria-label="Service alerts">
          <span className="admin-health-group-label">Alerts &amp; audit</span>
          <ul className="admin-health-kpis">
            <li>
              <span className={`dwes-status-chip ${errorCount > 0 ? 'dwes-status-chip--error' : 'dwes-status-chip--completed'}`}>
                Failed / errors <strong className="tabular-nums">{loading ? '…' : errorCount}</strong>
              </span>
            </li>
            <li>
              <span className="dwes-status-chip dwes-status-chip--planned">
                Audit logs <strong className="tabular-nums">{loading ? '…' : (diag?.database?.audit_logs ?? '—')}</strong>
              </span>
            </li>
            <li>
              <span className="dwes-status-chip dwes-status-chip--planned">
                Login sessions <strong className="tabular-nums">{loading ? '…' : (diag?.database?.session_logs ?? '—')}</strong>
              </span>
            </li>
          </ul>
        </div>
      </div>
    </section>
  );
}
