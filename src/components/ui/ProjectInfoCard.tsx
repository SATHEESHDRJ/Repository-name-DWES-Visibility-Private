import type { ReactNode } from 'react';

interface ProjectField {
  label: string;
  value: string | number | null | undefined;
}

interface ProjectInfoCardProps {
  title: string;
  subtitle?: string;
  statusLabel?: string;
  fields: ProjectField[];
  actions?: ReactNode;
}

const STATUS_FRIENDLY: Record<string, string> = {
  completed:             'Completed',
  active:                'Active',
  in_review:             'In Review',
  pending:               'Pending',
  stopped:               'Stopped',
  submitted_to_director: 'Submitted',
  not_started:           'Not Started',
  pass:                  'Pass',
  fail:                  'Fail',
  inspected:             'Inspected',
};

function normalizeStatus(raw: string | undefined) {
  return (raw || '').toLowerCase().replace(/[\s-]+/g, '_');
}

export default function ProjectInfoCard({ title, subtitle, statusLabel, fields, actions }: ProjectInfoCardProps) {
  // Code is the first segment of subtitle before '·'
  const code = subtitle?.split('·')[0]?.trim() ?? '';

  // Find the client from the fields array
  const client = fields.find(f => f.label === 'Client')?.value;

  // Find the most relevant stat to show bottom-right (Progress > Cables > Total Panels)
  const stat = (() => {
    const progress = fields.find(f => f.label === 'Progress')?.value;
    if (progress != null) return String(progress);
    const cables = fields.find(f => f.label === 'Cables')?.value;
    if (cables != null) return `${cables} cables`;
    const panels = fields.find(f => f.label === 'Total Panels')?.value;
    if (panels != null) return `${panels} panels`;
    return null;
  })();

  const statusNorm = normalizeStatus(statusLabel);
  const friendlyStatus = STATUS_FRIENDLY[statusNorm] || statusLabel || '';

  return (
    <article className="proj-mini-card" data-s={statusNorm}>
      {/* Code — tiny mono header */}
      {code && <div className="proj-mini-code">{code}</div>}

      {/* Project / panel name */}
      <div className="proj-mini-name">{title}</div>

      {/* Client or secondary info */}
      {client && <div className="proj-mini-client">{client}</div>}

      {/* Footer: status dot + label · stat + action */}
      <div className="proj-mini-foot">
        <div className="flex items-center gap-1 min-w-0">
          <div className="proj-mini-dot" />
          <span className="proj-mini-slabel">{friendlyStatus}</span>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {stat && <span className="proj-mini-stat">{stat}</span>}
          {actions}
        </div>
      </div>
    </article>
  );
}
