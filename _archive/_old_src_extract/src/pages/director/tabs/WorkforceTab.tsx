import { useState } from 'react';

interface WorkforceTabProps {
  workforce: any[];
  loading: boolean;
}

export default function WorkforceTab({ workforce, loading }: WorkforceTabProps) {
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<'kpi' | 'name' | 'panels'>('kpi');
  const [showInactive, setShowInactive] = useState(false);

  const filtered = workforce
    .filter(w => showInactive || w.is_active)
    .filter(w => !search || w.full_name.toLowerCase().includes(search.toLowerCase()) || w.employee_id.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => sort === 'kpi' ? b.kpi - a.kpi : sort === 'panels' ? b.panels_completed - a.panels_completed : a.full_name.localeCompare(b.full_name));

  if (loading) return <div className="dwes-empty-state"><div className="dwes-empty-copy">Loading workforce...</div></div>;

  const topKpi = filtered.length > 0 ? Math.max(...filtered.map(w => w.kpi)) : 0;

  return (
    <div>
      <div className="table-toolbar">
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search technicians..." className="dwes-input workforce-search" />
        {(['kpi', 'name', 'panels'] as const).map(s => (
          <button key={s} onClick={() => setSort(s)} className={`button-compact ${sort === s ? 'is-active' : ''}`} type="button">
            {s === 'kpi' ? 'By KPI' : s === 'name' ? 'By Name' : 'By Panels'}
          </button>
        ))}
        <label className="workforce-checkbox">
          <input type="checkbox" checked={showInactive} onChange={e => setShowInactive(e.target.checked)} className="workforce-checkbox-input" />
          Show inactive
        </label>
      </div>

      <div className="workforce-summary-grid">
        {[
          { label: 'Technicians', val: filtered.length, tone: 'muted' },
          { label: 'Avg KPI', val: `${filtered.length > 0 ? Math.round(filtered.reduce((s, w) => s + w.kpi, 0) / filtered.length) : 0}%`, tone: 'progress' },
          { label: 'Total Panels', val: filtered.reduce((s, w) => s + w.panels_completed, 0), tone: 'completed' },
          { label: 'Total Hrs', val: `${filtered.reduce((s, w) => s + w.wiring_hours, 0).toFixed(1)}h`, tone: 'warning' },
        ].map(k => (
          <div key={k.label} className="workforce-summary-card">
            <div className="workforce-summary-value" data-tone={k.tone}>{k.val}</div>
            <div className="workforce-summary-label mt-xxs">{k.label}</div>
          </div>
        ))}
      </div>

      {filtered.length === 0 && (
        <div className="dwes-empty-state"><div className="dwes-empty-copy">No technicians found.</div></div>
      )}

      <div className="workforce-list">
        {filtered.map((w, idx) => {
          const kpiTone = w.kpi >= 80 ? 'completed' : w.kpi >= 50 ? 'warning' : 'danger';
          const isTop = w.kpi === topKpi && topKpi > 0;
          const kpiBarW = topKpi > 0 ? (w.kpi / topKpi) * 100 : 0;

          return (
            <div key={w.id} className={`workforce-row ${isTop ? 'is-top' : ''}`}>
              <div className="workforce-rank" data-rank={idx + 1}>
                {idx + 1}
              </div>

              <div className="workforce-main">
                <div className="workforce-head">
                  <span className="workforce-name">{w.full_name}</span>
                  <span className="workforce-employee">{w.employee_id}</span>
                  {!w.is_active && <span className="workforce-flag danger">INACTIVE</span>}
                  {w.current_project && <span className="workforce-flag success">ACTIVE: {w.current_project}</span>}
                </div>
                <progress className="workforce-kpi-progress" data-tone={kpiTone} value={Math.round(kpiBarW)} max={100} />
              </div>

              <div className="workforce-stats">
                {[
                  { label: 'KPI', val: `${w.kpi}%`, tone: kpiTone },
                  { label: 'Panels', val: `${w.panels_completed}/${w.panels_total}`, tone: 'muted' },
                  { label: 'Cables', val: w.cables_total, tone: 'soft' },
                  { label: 'Hrs', val: `${w.wiring_hours}h`, tone: 'warning' },
                ].map(s => (
                  <div key={s.label} className="workforce-stat-item">
                    <div className="workforce-stat-value" data-tone={s.tone}>{s.val}</div>
                    <div className="workforce-stat-label mt-xxs">{s.label}</div>
                  </div>
                ))}
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
                  <div className="workforce-qc-empty">—</div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
