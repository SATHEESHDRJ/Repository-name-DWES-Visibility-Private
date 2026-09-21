import { useMemo, useState } from 'react';
import ProjectInfoCard from '../../../components/ui/ProjectInfoCard';

interface ProjectsTabProps {
  projects: any[];
  loading: boolean;
}

function parseVoltageFromCode(code: string) {
  const levels = ['400KV', '220KV', '132KV', '115KV', '69KV', '33KV', '13.8KV', '11KV', '6.6KV'];
  return levels.find(level => code?.includes(level)) || '--';
}

export default function ProjectsTab({ projects, loading }: ProjectsTabProps) {
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<'kpi' | 'name' | 'panels'>('kpi');

  const filtered = useMemo(() => {
    return projects
      .filter(project => !search || project.name.toLowerCase().includes(search.toLowerCase()) || project.code.toLowerCase().includes(search.toLowerCase()))
      .sort((a, b) => {
        if (sort === 'kpi') return b.kpi - a.kpi;
        if (sort === 'panels') return b.panels_total - a.panels_total;
        return a.name.localeCompare(b.name);
      });
  }, [projects, search, sort]);

  if (loading) return <div className="dwes-empty-state"><div className="dwes-empty-copy">Loading projects...</div></div>;

  return (
    <div>
      <div className="table-toolbar">
        <input
          value={search}
          onChange={event => setSearch(event.target.value)}
          placeholder="Search projects"
          className="dwes-input"
          data-layout="grow"
        />
        <div className="touch-action-row">
          {(['kpi', 'name', 'panels'] as const).map(sortKey => (
            <button
              key={sortKey}
              className={`button-compact ${sort === sortKey ? 'is-active' : ''}`}
              onClick={() => setSort(sortKey)}
              type="button"
            >
              {sortKey === 'kpi' ? 'Sort KPI' : sortKey === 'name' ? 'Sort Name' : 'Sort Panels'}
            </button>
          ))}
        </div>
      </div>

      {filtered.length === 0 && (
        <div className="dwes-empty-state">
          <div className="dwes-empty-title">No projects found</div>
          <div className="dwes-empty-copy">Try another search term or sort option.</div>
        </div>
      )}

      <div className="stack-grid">
        {filtered.map(project => (
          <ProjectInfoCard
            key={project.code}
            title={project.name}
            subtitle={`${project.code} · ${project.location || '--'}`}
            statusLabel={project.status}
            fields={[
              { label: 'Client', value: project.client_name || '--' },
              { label: 'Voltage Level', value: parseVoltageFromCode(project.code) },
              { label: 'Panel Name', value: project.focus_panel || project.panel_name || '--' },
              { label: 'Progress', value: `${project.kpi ?? 0}%` },
              { label: 'Assigned Technician', value: project.active_technicians ? `${project.active_technicians} active` : 'Unassigned' },
              { label: 'Due Date', value: project.due_date ? new Date(project.due_date).toLocaleDateString() : '--' },
              { label: 'Last Updated', value: project.updated_at ? new Date(project.updated_at).toLocaleString() : '--' },
              { label: 'Total Panels', value: project.panels_total ?? 0 },
            ]}
          />
        ))}
      </div>
    </div>
  );
}
