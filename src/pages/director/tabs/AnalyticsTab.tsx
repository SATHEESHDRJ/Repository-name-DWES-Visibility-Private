import { useEffect, useState } from 'react';
import { directorApi } from '../../../services/api';
import { useCallback } from 'react';
import { useDwesRefresh } from '../../../hooks/useDwesRefresh';
import { useLatestRequest } from '../../../hooks/useLatestRequest';

function RingChart({ pct, tone, label, sub }: { pct: number; tone: string; label: string; sub: string }) {
  const r = 36;
  const circ = 2 * Math.PI * r;
  const dash = (pct / 100) * circ;
  return (
    <div className="kpi-top-card" data-tone={tone}>
      <svg width="88" height="88" className="kpi-ring-svg mx-auto">
        <circle cx="44" cy="44" r={r} fill="none" stroke="#E2E8F0" strokeWidth="8" />
        <circle
          cx="44" cy="44" r={r} fill="none" strokeWidth="8" strokeLinecap="round"
          className={`kpi-ring-progress kpi-ring-tone-${tone}`}
          strokeDasharray={`${dash} ${circ}`}
          transform="rotate(-90 44 44)"
        />
        <text x="44" y="48" textAnchor="middle" className={`kpi-ring-text-${tone} text-[14px] font-bold`}>{pct}%</text>
      </svg>
      <div className="kpi-top-title text-center mt-2">{label}</div>
      <div className="kpi-top-sub text-center">{sub}</div>
    </div>
  );
}

function BarChart({ items }: { items: { label: string; value: number; tone: string }[] }) {
  const max = Math.max(...items.map(i => i.value), 1);
  const w = 280;
  const barH = 22;
  const gap = 8;
  const h = items.length * (barH + gap) + 8;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="chart-bar-svg">
      {items.map((item, i) => {
        const bw = Math.max(4, (item.value / max) * (w - 100));
        const y = 4 + i * (barH + gap);
        return (
          <g key={item.label}>
            <text x="0" y={y + 15} className="text-[11px] fill-slate-600">{item.label}</text>
            <rect x="92" y={y} width={bw} height={barH} rx="4" fill={
              item.tone === 'completed' ? '#16A34A' : item.tone === 'progress' ? '#1D4ED8' : item.tone === 'warning' ? '#D97706' : '#94A3B8'
            } />
            <text x={92 + bw + 6} y={y + 15} className="text-[11px] fill-slate-800 font-semibold">{item.value}</text>
          </g>
        );
      })}
    </svg>
  );
}

function DonutChart({ segments }: { segments: { label: string; value: number; tone: string }[] }) {
  const total = segments.reduce((s, x) => s + x.value, 0) || 1;
  const r = 40;
  const cx = 50;
  const cy = 50;
  let offset = 0;
  const colors: Record<string, string> = {
    completed: '#16A34A', progress: '#1D4ED8', warning: '#D97706', pending: '#94A3B8', danger: '#DC2626',
  };
  const arcs = segments.map(seg => {
    const frac = seg.value / total;
    const len = frac * 2 * Math.PI * r;
    const dash = `${len} ${2 * Math.PI * r - len}`;
    const rot = (offset / total) * 360 - 90;
    offset += seg.value;
    return (
      <circle
        key={seg.label}
        cx={cx} cy={cy} r={r} fill="none" stroke={colors[seg.tone] || '#94A3B8'} strokeWidth="14"
        strokeDasharray={dash}
        transform={`rotate(${rot} ${cx} ${cy})`}
      />
    );
  });

  return (
    <div className="chart-donut-wrap">
      <svg width="100" height="100" className="chart-donut-svg">
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="#E2E8F0" strokeWidth="14" />
        {arcs}
      </svg>
      <div className="chart-legend">
        {segments.map(seg => (
          <div key={seg.label} className="chart-legend-row">
            <span className="chart-legend-dot" data-tone={seg.tone} />
            <span className="chart-legend-label">{seg.label}</span>
            <span className="chart-legend-val">{seg.value}</span>
            <span className="chart-legend-pct">{Math.round((seg.value / total) * 100)}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function AnalyticsTab() {
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const requests = useLatestRequest();

  const load = useCallback(async () => {
    const request = requests.begin();
    setLoading(true);
    setStats(null);
    try {
      const next = await directorApi.stats(request.signal);
      if (requests.isLatest(request.id)) setStats(next);
    } catch { /* unavailable */ }
    finally { if (requests.isLatest(request.id)) setLoading(false); }
  }, [requests]);

  useEffect(() => { void load(); }, [load]);
  useDwesRefresh(load);

  if (loading) return <div className="empty-state"><p className="empty-text">Loading analytics…</p></div>;
  if (!stats) return <div className="empty-state"><p className="empty-text">Analytics unavailable.</p></div>;

  const wiringKpi = stats.wiring_kpi ?? 0;
  const qcRate = stats.qc_pass_rate ?? 0;
  const composite = stats.composite_kpi ?? 0;

  return (
    <div className="space-y-6">
      <div className="kpi-top-grid">
        <RingChart pct={composite} tone="progress" label="Composite KPI" sub="Wiring + QC weighted" />
        <RingChart pct={wiringKpi} tone="completed" label="Wiring Progress" sub={`${stats.cables_src_done + stats.cables_dst_done} / ${(stats.cables_total || 0) * 2} ends`} />
        <RingChart pct={qcRate} tone="qaqc" label="QC Pass Rate" sub={`${stats.qc_inspections || 0} inspections`} />
        <div className="kpi-top-card" data-tone="warning">
          <div className="kpi-hour-shell">
            <div className="kpi-hour-value">{stats.total_wiring_hours ?? 0}h</div>
            <div className="text-[12px] text-amber-800 font-semibold mt-1">Total wiring hours</div>
          </div>
        </div>
      </div>

      <div className="chart-section-grid">
        <div className="chart-card">
          <div className="chart-card-title">Panel Status Distribution</div>
          <div className="chart-card-sub">Live assignment breakdown</div>
          <DonutChart segments={[
            { label: 'In Progress', value: stats.panels_in_progress || 0, tone: 'progress' },
            { label: 'Completed', value: stats.panels_completed || 0, tone: 'completed' },
            { label: 'Paused', value: stats.panels_paused || 0, tone: 'warning' },
            { label: 'Pending QC', value: stats.panels_ready_for_qc || 0, tone: 'pending' },
          ]} />
        </div>

        <div className="chart-card">
          <div className="chart-card-title">Operations Overview</div>
          <div className="chart-card-sub">Projects, technicians, and approvals</div>
          <BarChart items={[
            { label: 'Active Projects', value: stats.projects_active || 0, tone: 'progress' },
            { label: 'Technicians', value: stats.technicians_active || 0, tone: 'completed' },
            { label: 'Pending Approvals', value: stats.pending_approvals || 0, tone: 'warning' },
            { label: 'Rework Queue', value: stats.rework_requested || 0, tone: 'danger' },
          ]} />
        </div>
      </div>

      <div className="kpi-count-grid">
        <div className="kpi-count-card">
          <div className="kpi-count-label">Cable Progress</div>
          <div className="kpi-count-row"><span className="kpi-count-key">Source done</span><span className="kpi-count-value" data-tone="completed">{stats.cables_src_done}</span></div>
          <div className="kpi-count-row"><span className="kpi-count-key">Destination done</span><span className="kpi-count-value" data-tone="warning">{stats.cables_dst_done}</span></div>
          <div className="kpi-count-row"><span className="kpi-count-key">Total cables</span><span className="kpi-count-value">{stats.cables_total}</span></div>
        </div>
        <div className="kpi-count-card">
          <div className="kpi-count-label">Panel Counts</div>
          <div className="kpi-count-row"><span className="kpi-count-key">Total panels</span><span className="kpi-count-value">{stats.panels_total}</span></div>
          <div className="kpi-count-row"><span className="kpi-count-key">Assigned</span><span className="kpi-count-value" data-tone="progress">{stats.panels_assigned}</span></div>
          <div className="kpi-count-row"><span className="kpi-count-key">Technicians wiring</span><span className="kpi-count-value" data-tone="progress">{stats.technicians_in_progress}</span></div>
        </div>
      </div>
    </div>
  );
}
