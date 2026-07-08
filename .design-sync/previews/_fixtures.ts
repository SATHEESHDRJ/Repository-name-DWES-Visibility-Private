// Shared preview fixtures. Not a component (`.ts`, not in componentSrcMap), so
// the converter's card discovery ignores it; it's bundled into the previews that
// import it. Single source of truth for data reused across multiple previews.

export const completionReportData = {
  technician: { full_name: 'Rami Haddad', username: 'rhaddad', employee_id: 'ENW-114' },
  project: { code: 'ENOWA-01', name: 'Substation 3 Wiring', client: 'ENOWA' },
  assignment: {
    id: 1,
    panel_name: 'Main Panel',
    frame_id: 'A12',
    status: 'completed',
    cables_total: 142,
    cables_src_done: 142,
    cables_dst_done: 142,
    cables_both_done: 142,
    cables_pending: 0,
    kpi: 98,
    src_pct: 100,
    dst_pct: 100,
    started_at: '2024-05-15T08:00:00Z',
    completed_at: '2024-05-15T14:30:00Z',
    total_wiring_seconds: 23400,
    duration_human: '6h 30m',
    review_status: 'approved',
    report_submitted: true,
  },
  rollup: { total_frames: 24, completed_frames: 18, project_kpi: 92 },
  generated_at: '2024-05-15T14:35:00Z',
};
