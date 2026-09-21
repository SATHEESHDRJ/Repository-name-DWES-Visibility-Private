interface KPITabProps {
  stats: any;
  projects: any[];
}

function RingGauge({ pct, tone, size = 80 }: { pct: number; tone: 'progress' | 'completed' | 'qaqc'; size?: number }) {
  const r = (size - 12) / 2;
  const circ = 2 * Math.PI * r;
  const dash = (pct / 100) * circ;
  return (
    <svg width={size} height={size} className="kpi-ring-svg">
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#1e3a5f" strokeWidth={8} />
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" className={`kpi-ring-progress kpi-ring-tone-${tone}`} strokeWidth={8}
        strokeDasharray={`${dash} ${circ}`} strokeLinecap="round"
        transform={`rotate(-90 ${size / 2} ${size / 2})`} />
      <text x={size / 2} y={size / 2 + 5} textAnchor="middle" className={`kpi-ring-text-${tone}`} fontSize={14} fontWeight={800}>{pct}%</text>
    </svg>
  );
}

function ProgressBar({ value, max, tone }: { value: number; max: number; tone: 'source' | 'destination' }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  return (
    <div>
      <div className="kpi-progress-meta">
        <span className="kpi-progress-copy">{value.toLocaleString()} / {max.toLocaleString()}</span>
        <span className="kpi-progress-pct" data-tone={tone}>{pct}%</span>
      </div>
      <progress className="kpi-progress-track" data-tone={tone} value={pct} max={100} />
    </div>
  );
}

function ProjectBarChart({ projects }: { projects: any[] }) {
  if (!projects.length) return (
    <div className="chart-empty">No project data available.</div>
  );

  const sorted = [...projects].sort((a, b) => b.kpi - a.kpi).slice(0, 12);
  const barH = 32;
  const gap = 8;
  const labelW = 160;
  const barMaxW = 360;
  const svgH = sorted.length * (barH + gap) + gap;
  const svgW = labelW + barMaxW + 60;

  return (
    <svg width="100%" viewBox={`0 0 ${svgW} ${svgH}`} className="chart-bar-svg">
      {sorted.map((p, i) => {
        const y = gap + i * (barH + gap);
        const barW = Math.max(2, (p.kpi / 100) * barMaxW);
        const color = p.kpi >= 80 ? '#16a34a' : p.kpi >= 50 ? '#d97706' : '#2563eb';
        const name = (p.name || p.code || '').substring(0, 22);
        return (
          <g key={p.code}>
            <text x={labelW - 8} y={y + barH / 2 + 5} textAnchor="end" fontSize={11} fill="#64748b">{name}</text>
            <rect x={labelW} y={y} width={barW} height={barH} rx={6} fill={color} opacity={0.85} />
            <text x={labelW + barW + 6} y={y + barH / 2 + 5} fontSize={12} fontWeight={700} fill={color}>{p.kpi}%</text>
          </g>
        );
      })}
    </svg>
  );
}

function WireStatusDonut({ stats }: { stats: any }) {
  const total = stats.cables_total || 0;
  const src = stats.cables_src_done || 0;
  const dst = stats.cables_dst_done || 0;

  // Estimate: both_done = src + dst - total (if positive) — otherwise use min(src, dst) as approximation
  const bothRaw = src + dst - total;
  const bothDone = Math.max(0, bothRaw);
  const srcOnly = src - bothDone;
  const dstOnly = dst - bothDone;
  const pending = Math.max(0, total - bothDone - srcOnly - dstOnly);

  const segments = [
    { label: 'Both Done', count: bothDone, color: '#16a34a', tone: 'completed' },
    { label: 'Src Only', count: srcOnly, color: '#1d4ed8', tone: 'source' },
    { label: 'Dst Only', count: dstOnly, color: '#c2410c', tone: 'destination' },
    { label: 'Pending', count: pending, color: '#94a3b8', tone: 'pending' },
  ].filter(s => s.count > 0);

  if (total === 0) return <div className="chart-empty">No cable data yet.</div>;

  const size = 160;
  const cx = size / 2;
  const cy = size / 2;
  const r = 58;
  const innerR = 36;
  let cumAngle = -Math.PI / 2;

  const arcs = segments.map(seg => {
    const fraction = seg.count / total;
    const startAngle = cumAngle;
    cumAngle += fraction * 2 * Math.PI;
    const endAngle = cumAngle;
    const x1 = cx + r * Math.cos(startAngle);
    const y1 = cy + r * Math.sin(startAngle);
    const x2 = cx + r * Math.cos(endAngle);
    const y2 = cy + r * Math.sin(endAngle);
    const ix1 = cx + innerR * Math.cos(endAngle);
    const iy1 = cy + innerR * Math.sin(endAngle);
    const ix2 = cx + innerR * Math.cos(startAngle);
    const iy2 = cy + innerR * Math.sin(startAngle);
    const largeArc = fraction > 0.5 ? 1 : 0;
    const d = `M ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2} L ${ix1} ${iy1} A ${innerR} ${innerR} 0 ${largeArc} 0 ${ix2} ${iy2} Z`;
    return { ...seg, d, fraction };
  });

  const pct = total > 0 ? Math.round((bothDone / total) * 100) : 0;

  return (
    <div className="chart-donut-wrap">
      <svg width={size} height={size} className="chart-donut-svg">
        {arcs.map((arc, i) => (
          <path key={i} d={arc.d} fill={arc.color} opacity={0.9} />
        ))}
        <text x={cx} y={cy - 4} textAnchor="middle" fontSize={20} fontWeight={800} fill="#0f172a">{pct}%</text>
        <text x={cx} y={cy + 14} textAnchor="middle" fontSize={10} fill="#64748b">both done</text>
      </svg>

      <div className="chart-legend">
        {segments.map(seg => (
          <div key={seg.label} className="chart-legend-row">
            <span className="chart-legend-dot" data-tone={seg.tone} />
            <span className="chart-legend-label">{seg.label}</span>
            <span className="chart-legend-val">{seg.count.toLocaleString()}</span>
            <span className="chart-legend-pct">{total > 0 ? Math.round((seg.count / total) * 100) : 0}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function KPITab({ stats, projects }: KPITabProps) {
  if (!stats) return <div className="dwes-empty-state"><div className="dwes-empty-copy">Loading KPIs...</div></div>;

  const topCards = [
    { label: 'Composite KPI', val: `${stats.composite_kpi}%`, tone: 'progress' as const, sub: 'Wiring 70% + QC 30%', ring: stats.composite_kpi },
    { label: 'Wiring KPI', val: `${stats.wiring_kpi}%`, tone: 'completed' as const, sub: `${stats.cables_src_done}+${stats.cables_dst_done} / ${stats.cables_total * 2} endpoints`, ring: stats.wiring_kpi },
    { label: 'QC Pass Rate', val: `${stats.qc_pass_rate}%`, tone: 'qaqc' as const, sub: `${stats.qc_inspections} inspections total`, ring: stats.qc_pass_rate },
    { label: 'Wiring Hours', val: `${stats.total_wiring_hours}h`, tone: 'warning' as const, sub: `${stats.panels_completed} panels completed`, ring: null },
  ];

  const countCards = [
    { label: 'Projects', items: [
      { label: 'Total', val: stats.projects_total, tone: 'progress' },
      { label: 'Active', val: stats.projects_active, tone: 'completed' },
      { label: 'Completed', val: stats.projects_completed, tone: 'qaqc' },
    ]},
    { label: 'Panels', items: [
      { label: 'Total', val: stats.panels_total, tone: 'muted' },
      { label: 'In Progress', val: stats.panels_in_progress, tone: 'progress' },
      { label: 'Completed', val: stats.panels_completed, tone: 'completed' },
    ]},
    { label: 'Workforce', items: [
      { label: 'Active Techs', val: stats.technicians_active, tone: 'completed' },
      { label: 'Working Now', val: stats.technicians_in_progress, tone: 'progress' },
      { label: 'Pending Approvals', val: stats.pending_approvals, tone: 'warning' },
    ]},
    { label: 'Quality', items: [
      { label: 'QC Done', val: stats.qc_inspections, tone: 'qaqc' },
      { label: 'Ready for QC', val: stats.panels_ready_for_qc, tone: 'progress' },
      { label: 'Rework Req.', val: stats.rework_requested, tone: 'danger' },
    ]},
  ];

  return (
    <div>
      <div className="kpi-top-grid">
        {topCards.map(k => (
          <div key={k.label} className="kpi-top-card" data-tone={k.tone}>
            {k.ring !== null ? (
              <RingGauge pct={k.ring} tone={k.tone === 'warning' ? 'progress' : k.tone} />
            ) : (
              <div className="kpi-hour-shell">
                <div className="kpi-hour-value" data-tone={k.tone}>{k.val}</div>
              </div>
            )}
            <div>
              <div className="kpi-top-title">{k.label}</div>
              <div className="kpi-top-sub mt-xxs">{k.sub}</div>
            </div>
          </div>
        ))}
      </div>

      <div className="kpi-block">
        <div className="kpi-block-label">Cable Wiring Progress</div>
        <div className="kpi-progress-grid">
          <div>
            <div className="kpi-endpoint-label tone-source">SOURCE Endpoints</div>
            <ProgressBar value={stats.cables_src_done} max={stats.cables_total} tone="source" />
          </div>
          <div>
            <div className="kpi-endpoint-label tone-destination">DESTINATION Endpoints</div>
            <ProgressBar value={stats.cables_dst_done} max={stats.cables_total} tone="destination" />
          </div>
        </div>
      </div>

      <div className="kpi-count-grid">
        {countCards.map(group => (
          <div key={group.label} className="kpi-count-card">
            <div className="kpi-count-label">{group.label}</div>
            {group.items.map(item => (
              <div key={item.label} className="kpi-count-row">
                <span className="kpi-count-key">{item.label}</span>
                <span className="kpi-count-value" data-tone={item.tone}>{item.val}</span>
              </div>
            ))}
          </div>
        ))}
      </div>

      {/* ── Charts section ── */}
      <div className="chart-section-grid">
        <div className="chart-card">
          <div className="chart-card-title">Completion % by Project</div>
          <div className="chart-card-sub">KPI per project, sorted by completion</div>
          <ProjectBarChart projects={projects} />
        </div>

        <div className="chart-card">
          <div className="chart-card-title">Wire Status Distribution</div>
          <div className="chart-card-sub">All cables across all projects</div>
          <WireStatusDonut stats={stats} />
        </div>
      </div>
    </div>
  );
}
