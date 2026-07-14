import { useCallback, useEffect, useState } from 'react';
import { RefreshCw, Users } from '../../../components/ui/icons';
import { directorApi } from '../../../services/api';
import { useDwesRefresh, type RefreshOptions } from '../../../hooks/useDwesRefresh';
import { useLatestRequest } from '../../../hooks/useLatestRequest';

function kpiTone(kpi: number): 'completed' | 'warning' | 'danger' {
  if (kpi >= 80) return 'completed';
  if (kpi >= 50) return 'warning';
  return 'danger';
}

export default function WorkforceTab() {
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const requests = useLatestRequest();

  const load = useCallback(async (options?: RefreshOptions) => {
    const silent = options?.silent === true;
    const request = requests.begin();
    if (!silent) setLoading(true);
    if (!silent) setRows([]);
    try {
      const next = await directorApi.workforce(request.signal);
      if (requests.isLatest(request.id)) setRows(next);
    } catch { /* unavailable */ }
    finally { if (requests.isLatest(request.id)) setLoading(false); }
  }, [requests]);

  useEffect(() => { void load(); }, [load]);
  useDwesRefresh(load);

  const active = rows.filter(r => r.is_active).length;
  const avgKpi = rows.length
    ? Math.round(rows.reduce((s, r) => s + (r.kpi || 0), 0) / rows.length)
    : 0;

  if (loading) {
    return <div className="empty-state"><p className="empty-text">Loading workforce analytics...</p></div>;
  }

  return (
    <div>
      <div className="toolbar">
        <div className="form-label flex items-center gap-2">
          <Users size={16} />
          Technician performance · sorted by KPI
        </div>
        <button type="button" className="btn-sm" onClick={() => void load()}>
          <RefreshCw size={14} />
          Refresh
        </button>
      </div>

      <div className="workforce-summary-grid mb-5">
        <div className="workforce-summary-card">
          <div className="workforce-summary-value" data-tone="progress">{rows.length}</div>
          <div className="workforce-summary-label">Technicians</div>
        </div>
        <div className="workforce-summary-card">
          <div className="workforce-summary-value" data-tone="completed">{active}</div>
          <div className="workforce-summary-label">Active accounts</div>
        </div>
        <div className="workforce-summary-card">
          <div className="workforce-summary-value" data-tone={kpiTone(avgKpi)}>{avgKpi}%</div>
          <div className="workforce-summary-label">Average KPI</div>
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="empty-state">
          <p className="empty-text">No technician data available.</p>
        </div>
      ) : (
        <div className="workforce-list">
          {rows.map((w, idx) => {
            const tone = kpiTone(w.kpi || 0);
            return (
              <div key={w.id} className={`workforce-row${idx < 3 ? ' is-top' : ''}`}>
                <div className="workforce-rank" data-rank={idx < 3 ? String(idx + 1) : undefined}>
                  #{idx + 1}
                </div>
                <div className="workforce-main">
                  <div className="workforce-head">
                    <span className="workforce-name">{w.full_name}</span>
                    <span className="workforce-employee">{w.employee_id}</span>
                    {!w.is_active && <span className="workforce-flag danger">Inactive</span>}
                    {w.current_project && <span className="workforce-flag success">On {w.current_project}</span>}
                  </div>
                  <progress className="workforce-kpi-progress" value={w.kpi || 0} max={100} data-tone={tone} />
                </div>
                <div className="workforce-stats">
                  <div className="workforce-stat-item">
                    <div className="workforce-stat-value" data-tone="progress">{w.panels_completed}/{w.panels_total}</div>
                    <div className="workforce-stat-label">Panels</div>
                  </div>
                  <div className="workforce-stat-item">
                    <div className="workforce-stat-value" data-tone="muted">{w.wiring_hours}h</div>
                    <div className="workforce-stat-label">Wiring</div>
                  </div>
                  <div className="workforce-stat-item">
                    <div className="workforce-stat-value" data-tone={tone}>{w.kpi}%</div>
                    <div className="workforce-stat-label">KPI</div>
                  </div>
                </div>
                <div className="workforce-qc">
                  {w.qc_inspections > 0 ? (
                    <>
                      <div className="workforce-qc-value" data-tone={w.qc_fail_count > 0 ? 'warning' : 'completed'}>
                        {w.qc_pass_count}/{w.qc_inspections}
                      </div>
                      <div className="workforce-qc-label">QC pass</div>
                    </>
                  ) : (
                    <span className="workforce-qc-empty">—</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
