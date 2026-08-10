import { useMemo, useState } from 'react';
import Modal from '../../components/Modal';
import { DwesLoadingCenter } from '../../components/ui/DwesLoadingIndicator';
import { compactPanelDisplayName } from '../../utils/projectDisplay';

export type DirectorMonitoringPayload = {
  projects_status: {
    totals: {
      projects: number;
      not_started: number;
      in_progress: number;
      completed: number;
      overall_progress_pct: number;
      panels_total: number;
      panels_completed: number;
    };
    projects: Array<{
      code: string;
      name: string;
      client: string | null;
      status: string;
      progress_pct: number;
      panels_total: number;
      panels_completed: number;
      panels_in_progress: number;
      cables_total: number;
      cables_completed: number;
    }>;
  };
  consolidated_panels: Array<{
    project_code: string;
    project_name: string;
    panel_name: string;
    frame_id: string;
    assignment_id: number;
    total_wires: number;
    finished: number;
    remaining: number;
    skipped: number;
    open_source: number;
    open_destination: number;
    corrections: number;
    progress_pct: number;
    assigned_employees: string[];
    started_at: string | null;
    latest_activity_at: string | null;
    assignment_status: string;
  }>;
  one_side: {
    summary: {
      src_only: number;
      dst_only: number;
      both_done: number;
      both_pending: number;
      open_source: number;
      open_destination: number;
    };
    rows: Array<{
      project_code: string;
      panel_name: string;
      assignment_id: number;
      wire_ref: string;
      sno: string | number | null;
      bucket: string;
      technician_name: string;
      panel_progress_pct: number;
    }>;
  };
  employees: Array<{
    technician_id: number;
    full_name: string;
    employee_id: string | null;
    assignments: Array<{
      project_code: string;
      panel_name: string;
      status: string;
      assigned_wires: number;
      finished: number;
      remaining: number;
      skipped: number;
      open_side: number;
      corrections: number;
      started_at: string | null;
      last_activity_at: string | null;
      productivity_pct: number;
    }>;
  }>;
  people_working: {
    totals: {
      assigned: number;
      working: number;
      paused: number;
      not_started: number;
      completed: number;
      no_active_assignment: number;
    };
    rows: Array<{
      technician_id: number;
      full_name: string;
      status: string;
      project_code: string | null;
      panel_name: string | null;
      last_activity_at: string | null;
    }>;
  };
};

type DrillKey = 'projects' | 'consolidated' | 'one_side' | 'employees' | 'people' | null;

function fmtWhen(iso: string | null | undefined): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

function statusLabel(s: string): string {
  const map: Record<string, string> = {
    not_started: 'Not started',
    in_progress: 'In progress',
    working: 'Working',
    paused: 'Paused',
    completed: 'Completed',
    no_active_assignment: 'No active assignment',
    src_only: 'Source done · Destination pending',
    dst_only: 'Destination done · Source pending',
    both_done: 'Both sides terminated',
    both_pending: 'Both sides pending',
    skipped: 'Skipped',
  };
  return map[s] || s;
}

type Props = {
  data: DirectorMonitoringPayload | null;
  loading: boolean;
  onRefresh: () => void;
};

export default function DirectorMonitoringPanel({ data, loading, onRefresh }: Props) {
  const [drill, setDrill] = useState<DrillKey>(null);
  const [oneSideFilter, setOneSideFilter] = useState<string>('src_only');

  const peopleTotals = data?.people_working.totals;
  const projectTotals = data?.projects_status.totals;
  const oneSideSummary = data?.one_side.summary;

  const filteredOneSide = useMemo(() => {
    const rows = data?.one_side.rows || [];
    if (oneSideFilter === 'all') return rows;
    return rows.filter(r => r.bucket === oneSideFilter);
  }, [data, oneSideFilter]);

  const employeeFlat = useMemo(() => {
    const out: Array<{
      full_name: string;
      employee_id: string | null;
      project_code: string;
      panel_name: string;
      status: string;
      assigned_wires: number;
      finished: number;
      remaining: number;
      skipped: number;
      open_side: number;
      corrections: number;
      started_at: string | null;
      last_activity_at: string | null;
      productivity_pct: number;
    }> = [];
    for (const emp of data?.employees || []) {
      for (const a of emp.assignments) {
        out.push({
          full_name: emp.full_name,
          employee_id: emp.employee_id,
          ...a,
        });
      }
    }
    return out;
  }, [data]);

  return (
    <section className="director-monitoring" aria-label="Director monitoring">
      <div className="director-monitoring-kpi-row">
        <button type="button" className="director-monitoring-kpi" onClick={() => setDrill('projects')}>
          <span className="director-monitoring-kpi-label">Projects Status</span>
          <span className="director-monitoring-kpi-value">{projectTotals?.projects ?? '—'}</span>
          <span className="director-monitoring-kpi-meta">
            {projectTotals
              ? `${projectTotals.in_progress} in progress · ${projectTotals.completed} completed · ${projectTotals.overall_progress_pct}% overall`
              : 'Open project drill-down'}
          </span>
        </button>
        <button type="button" className="director-monitoring-kpi" onClick={() => setDrill('consolidated')}>
          <span className="director-monitoring-kpi-label">Consolidated Status Report</span>
          <span className="director-monitoring-kpi-value">{data?.consolidated_panels.length ?? '—'}</span>
          <span className="director-monitoring-kpi-meta">Panel-wise wires, open ends, corrections</span>
        </button>
        <button type="button" className="director-monitoring-kpi" onClick={() => setDrill('one_side')}>
          <span className="director-monitoring-kpi-label">One-Side Termination</span>
          <span className="director-monitoring-kpi-value">
            {oneSideSummary ? oneSideSummary.src_only + oneSideSummary.dst_only : '—'}
          </span>
          <span className="director-monitoring-kpi-meta">
            {oneSideSummary
              ? `Src-only ${oneSideSummary.src_only} · Dst-only ${oneSideSummary.dst_only}`
              : 'Source / destination pending wires'}
          </span>
        </button>
        <button type="button" className="director-monitoring-kpi" onClick={() => setDrill('employees')}>
          <span className="director-monitoring-kpi-label">Employee Performance</span>
          <span className="director-monitoring-kpi-value">{data?.employees.length ?? '—'}</span>
          <span className="director-monitoring-kpi-meta">Assignment-based productivity</span>
        </button>
        <button type="button" className="director-monitoring-kpi" onClick={() => setDrill('people')}>
          <span className="director-monitoring-kpi-label">People Working Now</span>
          <span className="director-monitoring-kpi-value">{peopleTotals?.working ?? '—'}</span>
          <span className="director-monitoring-kpi-meta">
            {peopleTotals
              ? `${peopleTotals.assigned} assigned · ${peopleTotals.paused} paused · ${peopleTotals.no_active_assignment} idle`
              : 'Live workforce status'}
          </span>
        </button>
      </div>

      {loading && !data ? (
        <DwesLoadingCenter label="Loading monitoring data..." className="director-overview-empty" />
      ) : null}

      {!loading && data ? (
        <div className="director-monitoring-summary">
          <p>
            Read-only portfolio view. Totals come from DWES projects, assignments, cable status and activity records.
            Click a KPI card for detail. Use refresh to reload.
          </p>
          <button type="button" className="btn-secondary btn-sm" onClick={onRefresh} disabled={loading}>
            Refresh monitoring
          </button>
        </div>
      ) : null}

      {drill === 'projects' && data ? (
        <Modal title="Projects Status" subtitle="Read-only project drill-down" onClose={() => setDrill(null)} size="xl">
          <div className="director-monitoring-totals">
            <span>Total projects: <strong>{projectTotals?.projects}</strong></span>
            <span>Not started: <strong>{projectTotals?.not_started}</strong></span>
            <span>In progress: <strong>{projectTotals?.in_progress}</strong></span>
            <span>Completed: <strong>{projectTotals?.completed}</strong></span>
            <span>Overall progress: <strong>{projectTotals?.overall_progress_pct}%</strong></span>
            <span>Panels: <strong>{projectTotals?.panels_completed}/{projectTotals?.panels_total}</strong></span>
          </div>
          <div className="director-monitoring-table-wrap">
            <table className="director-monitoring-table">
              <thead>
                <tr>
                  <th>Project</th>
                  <th>Client</th>
                  <th>Status</th>
                  <th>Progress</th>
                  <th>Panels</th>
                  <th>Completed panels</th>
                  <th>In progress panels</th>
                  <th>Cables</th>
                </tr>
              </thead>
              <tbody>
                {data.projects_status.projects.map(p => (
                  <tr key={p.code}>
                    <td>
                      <strong>{p.name}</strong>
                      <div className="director-monitoring-sub">{p.code}</div>
                    </td>
                    <td>{p.client || '—'}</td>
                    <td>{statusLabel(p.status)}</td>
                    <td>{p.progress_pct}%</td>
                    <td>{p.panels_total}</td>
                    <td>{p.panels_completed}</td>
                    <td>{p.panels_in_progress}</td>
                    <td>{p.cables_completed}/{p.cables_total}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Modal>
      ) : null}

      {drill === 'consolidated' && data ? (
        <Modal title="Consolidated Status Report" subtitle="Read-only panel register" onClose={() => setDrill(null)} size="xl">
          <div className="director-monitoring-table-wrap">
            <table className="director-monitoring-table">
              <thead>
                <tr>
                  <th>Project</th>
                  <th>Panel</th>
                  <th>Total</th>
                  <th>Finished</th>
                  <th>Remaining</th>
                  <th>Skipped</th>
                  <th>Open Src</th>
                  <th>Open Dst</th>
                  <th>Corrections</th>
                  <th>Progress</th>
                  <th>Employees</th>
                  <th>Start</th>
                  <th>Latest activity</th>
                </tr>
              </thead>
              <tbody>
                {data.consolidated_panels.map(row => (
                  <tr key={row.assignment_id}>
                    <td>
                      <strong>{row.project_name}</strong>
                      <div className="director-monitoring-sub">{row.project_code}</div>
                    </td>
                    <td title={row.panel_name}>{compactPanelDisplayName(row.panel_name)}</td>
                    <td>{row.total_wires}</td>
                    <td>{row.finished}</td>
                    <td>{row.remaining}</td>
                    <td>{row.skipped}</td>
                    <td>{row.open_source}</td>
                    <td>{row.open_destination}</td>
                    <td>{row.corrections}</td>
                    <td>{row.progress_pct}%</td>
                    <td>{row.assigned_employees.join(', ') || '—'}</td>
                    <td>{fmtWhen(row.started_at)}</td>
                    <td>{fmtWhen(row.latest_activity_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Modal>
      ) : null}

      {drill === 'one_side' && data ? (
        <Modal title="Panel-wise One-Side Termination" subtitle="Read-only wire buckets" onClose={() => setDrill(null)} size="xl">
          <div className="director-monitoring-totals">
            <span>Src only: <strong>{oneSideSummary?.src_only}</strong></span>
            <span>Dst only: <strong>{oneSideSummary?.dst_only}</strong></span>
            <span>Both done: <strong>{oneSideSummary?.both_done}</strong></span>
            <span>Both pending: <strong>{oneSideSummary?.both_pending}</strong></span>
            <span>Open Src: <strong>{oneSideSummary?.open_source}</strong></span>
            <span>Open Dst: <strong>{oneSideSummary?.open_destination}</strong></span>
          </div>
          <div className="director-monitoring-filter">
            <label htmlFor="one-side-filter">Bucket</label>
            <select
              id="one-side-filter"
              value={oneSideFilter}
              onChange={(e) => setOneSideFilter(e.target.value)}
            >
              <option value="src_only">Source terminated, Destination pending</option>
              <option value="dst_only">Destination terminated, Source pending</option>
              <option value="both_pending">Both sides pending</option>
              <option value="skipped">Skipped</option>
              <option value="all">All listed wires</option>
            </select>
          </div>
          <div className="director-monitoring-table-wrap">
            <table className="director-monitoring-table">
              <thead>
                <tr>
                  <th>Project</th>
                  <th>Panel</th>
                  <th>S.No</th>
                  <th>Wire / reference</th>
                  <th>Bucket</th>
                  <th>Technician</th>
                  <th>Panel progress</th>
                </tr>
              </thead>
              <tbody>
                {filteredOneSide.map((row, idx) => (
                  <tr key={`${row.assignment_id}-${row.sno}-${idx}`}>
                    <td>{row.project_code}</td>
                    <td title={row.panel_name}>{compactPanelDisplayName(row.panel_name)}</td>
                    <td>{row.sno ?? '—'}</td>
                    <td>{row.wire_ref}</td>
                    <td>{statusLabel(row.bucket)}</td>
                    <td>{row.technician_name}</td>
                    <td>{row.panel_progress_pct}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Modal>
      ) : null}

      {drill === 'employees' && data ? (
        <Modal title="Employee Performance Monitor" subtitle="Read-only · assignment records only" onClose={() => setDrill(null)} size="xl">
          <div className="director-monitoring-table-wrap">
            <table className="director-monitoring-table">
              <thead>
                <tr>
                  <th>Employee</th>
                  <th>Project</th>
                  <th>Panel</th>
                  <th>Status</th>
                  <th>Assigned</th>
                  <th>Finished</th>
                  <th>Remaining</th>
                  <th>Skipped</th>
                  <th>Open-side</th>
                  <th>Corrections</th>
                  <th>Start</th>
                  <th>Last activity</th>
                  <th>Productivity</th>
                </tr>
              </thead>
              <tbody>
                {employeeFlat.map((row, idx) => (
                  <tr key={`${row.full_name}-${row.project_code}-${row.panel_name}-${idx}`}>
                    <td>
                      <strong>{row.full_name}</strong>
                      <div className="director-monitoring-sub">{row.employee_id || '—'}</div>
                    </td>
                    <td>{row.project_code}</td>
                    <td title={row.panel_name}>{compactPanelDisplayName(row.panel_name)}</td>
                    <td>{statusLabel(row.status)}</td>
                    <td>{row.assigned_wires}</td>
                    <td>{row.finished}</td>
                    <td>{row.remaining}</td>
                    <td>{row.skipped}</td>
                    <td>{row.open_side}</td>
                    <td>{row.corrections}</td>
                    <td>{fmtWhen(row.started_at)}</td>
                    <td>{fmtWhen(row.last_activity_at)}</td>
                    <td>{row.productivity_pct}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Modal>
      ) : null}

      {drill === 'people' && data ? (
        <Modal title="People Working Now" subtitle="Read-only live workforce" onClose={() => setDrill(null)} size="xl">
          <div className="director-monitoring-totals">
            <span>Assigned: <strong>{peopleTotals?.assigned}</strong></span>
            <span>Working: <strong>{peopleTotals?.working}</strong></span>
            <span>Paused: <strong>{peopleTotals?.paused}</strong></span>
            <span>Not started: <strong>{peopleTotals?.not_started}</strong></span>
            <span>Completed: <strong>{peopleTotals?.completed}</strong></span>
            <span>No active assignment: <strong>{peopleTotals?.no_active_assignment}</strong></span>
          </div>
          <div className="director-monitoring-table-wrap">
            <table className="director-monitoring-table">
              <thead>
                <tr>
                  <th>Employee</th>
                  <th>Status</th>
                  <th>Project</th>
                  <th>Panel</th>
                  <th>Last activity</th>
                </tr>
              </thead>
              <tbody>
                {data.people_working.rows.map(row => (
                  <tr key={row.technician_id}>
                    <td>{row.full_name}</td>
                    <td>{statusLabel(row.status)}</td>
                    <td>{row.project_code || '—'}</td>
                    <td title={row.panel_name || ''}>{row.panel_name ? compactPanelDisplayName(row.panel_name) : '—'}</td>
                    <td>{fmtWhen(row.last_activity_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Modal>
      ) : null}
    </section>
  );
}
