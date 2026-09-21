import { useMemo, useState, type ReactNode } from 'react';
import { ChevronDown, ChevronRight, Copy, Search } from '../../ui/icons';
import {
  HISTORY_FILTER_CHIPS,
  buildDirectorUpgradeSummary,
  buildHistoryDiffs,
  formatChangedBy,
  formatHistoryDateUae,
  historyEventCategory,
  historyEventLabel,
  historyEventTone,
  prettyJson,
  resolveHistoryStageName,
  type HistoryFilterCategory,
  type HistoryRow,
  type HistoryUserLookup,
} from './workflowHistoryFormat';
import type { PanelWorkflowRow, WorkflowStageRow } from './workflowTypes';

type Props = {
  history: HistoryRow[];
  workflow: PanelWorkflowRow;
  projectName?: string;
  panelName?: string;
  users?: HistoryUserLookup[];
};

function MetaRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="pw-history-card__meta-row">
      <span className="pw-history-card__meta-label">{label}</span>
      <span className="pw-history-card__meta-value">{children}</span>
    </div>
  );
}

function HistoryCard({
  row,
  projectLabel,
  panelLabel,
  users,
  stages,
}: {
  row: HistoryRow;
  projectLabel: string;
  panelLabel: string;
  users: HistoryUserLookup[];
  stages: WorkflowStageRow[];
}) {
  const [openTech, setOpenTech] = useState(false);
  const [copied, setCopied] = useState(false);
  const title = historyEventLabel(row.event_type);
  const tone = historyEventTone(row.event_type);
  const stageName = resolveHistoryStageName(row, stages);
  const when = formatHistoryDateUae(row.created_at);
  const changedBy = formatChangedBy(row, users);
  const isDirector = row.event_type === 'director_upgrade_applied';
  const director = isDirector ? buildDirectorUpgradeSummary(row.new_value) : null;
  const diffs = !isDirector
    ? buildHistoryDiffs(row.previous_value, row.new_value)
    : { lines: [], parseFailed: false };

  const techText = [
    `Event ID: ${row.id}`,
    `Event key: ${row.event_type}`,
    `Workflow ID: ${row.workflow_id}`,
    `Stage ID: ${row.stage_id ?? '—'}`,
    '',
    'previous_value:',
    prettyJson(row.previous_value) || '(empty)',
    '',
    'new_value:',
    prettyJson(row.new_value) || '(empty)',
  ].join('\n');

  const copyTech = async () => {
    try {
      await navigator.clipboard.writeText(techText);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  };

  return (
    <article className="pw-history-card" data-tone={tone}>
      <header className="pw-history-card__head">
        <div className="pw-history-card__title-row">
          <span className="pw-history-card__dot" aria-hidden />
          <h4 className="pw-history-card__title">{title}</h4>
          <span className={`pw-history-card__badge pw-history-card__badge--${tone}`}>
            {tone === 'ok' ? 'Completed' : tone === 'warn' ? 'Attention' : tone === 'danger' ? 'Critical' : tone === 'system' ? 'System' : 'Update'}
          </span>
        </div>
        <time className="pw-history-card__when" dateTime={String(row.created_at || '')}>{when}</time>
      </header>

      <div className="pw-history-card__body">
        <MetaRow label="Project">{projectLabel}</MetaRow>
        <MetaRow label="Panel">{panelLabel}</MetaRow>
        {stageName && <MetaRow label="Stage">{stageName}</MetaRow>}
        <MetaRow label="Changed by">{changedBy}</MetaRow>
        <MetaRow label="Role">{row.user_role ? String(row.user_role).replace(/_/g, ' ') : '—'}</MetaRow>
        {row.reason && <MetaRow label="Reason">{row.reason}</MetaRow>}

        {director && (
          <div className="pw-history-card__summary">
            <strong>Summary</strong>
            <MetaRow label="Template">{director.template}</MetaRow>
            {director.added.length > 0 && (
              <div className="pw-history-card__section">
                <span className="pw-history-card__meta-label">Added stages</span>
                <ul>{director.added.map((n) => <li key={n}>{n}</li>)}</ul>
              </div>
            )}
            {director.renamed.length > 0 && (
              <div className="pw-history-card__section">
                <span className="pw-history-card__meta-label">Renamed stages</span>
                <ul>{director.renamed.map((n) => <li key={n}>{n}</li>)}</ul>
              </div>
            )}
            {director.durations.length > 0 && (
              <div className="pw-history-card__section">
                <span className="pw-history-card__meta-label">Updated durations</span>
                <ul>{director.durations.map((n) => <li key={n}>{n}</li>)}</ul>
              </div>
            )}
            {director.legacy.length > 0 && (
              <div className="pw-history-card__section">
                <span className="pw-history-card__meta-label">Legacy stages retained</span>
                <ul>{director.legacy.map((n) => <li key={n}>{n}</li>)}</ul>
              </div>
            )}
            {director.archived.length > 0 && (
              <div className="pw-history-card__section">
                <span className="pw-history-card__meta-label">Archived (disabled)</span>
                <ul>{director.archived.map((n) => <li key={n}>{n}</li>)}</ul>
              </div>
            )}
            {!director.added.length && !director.renamed.length && !director.durations.length && !director.legacy.length && (
              <p className="pw-muted">Director defaults applied (see technical details for full audit).</p>
            )}
          </div>
        )}

        {!director && diffs.lines.length > 0 && (
          <div className="pw-history-card__summary">
            <strong>Changes</strong>
            <ul className="pw-history-card__diffs">
              {diffs.lines.map((line) => (
                <li key={`${line.label}-${line.from}-${line.to}`}>
                  <span className="pw-history-card__diff-label">{line.label}:</span>{' '}
                  <span className="pw-history-card__diff-from">{line.from}</span>
                  <span className="pw-history-card__diff-arrow"> → </span>
                  <span className="pw-history-card__diff-to">{line.to}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {!director && diffs.parseFailed && (row.previous_value || row.new_value) && (
          <p className="pw-muted">Details available in Technical Details.</p>
        )}

        {!director && !diffs.parseFailed && diffs.lines.length === 0 && (row.previous_value || row.new_value) && (
          <p className="pw-muted">No field-level changes detected in the summary payload.</p>
        )}
      </div>

      {(row.previous_value || row.new_value) && (
        <div className="pw-history-card__tech">
          <button
            type="button"
            className="pw-history-card__tech-toggle"
            onClick={() => setOpenTech((v) => !v)}
            aria-expanded={openTech}
          >
            {openTech ? <ChevronDown size={14} aria-hidden /> : <ChevronRight size={14} aria-hidden />}
            View Technical Details
          </button>
          {openTech && (
            <div className="pw-history-card__tech-panel">
              <div className="pw-history-card__tech-actions">
                <button type="button" className="btn-secondary" onClick={() => { void copyTech(); }}>
                  <Copy size={14} aria-hidden /> {copied ? 'Copied' : 'Copy'}
                </button>
              </div>
              <pre className="pw-history-card__tech-code">{techText}</pre>
            </div>
          )}
        </div>
      )}
    </article>
  );
}

export default function WorkflowHistoryTab({
  history,
  workflow,
  projectName,
  panelName,
  users = [],
}: Props) {
  const [category, setCategory] = useState<HistoryFilterCategory>('all');
  const [search, setSearch] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const projectLabel = projectName || workflow.project_code || '—';
  const panelLabel = panelName || workflow.panel_name || workflow.frame_id || '—';
  const stages = workflow.stages || [];

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const fromMs = dateFrom ? new Date(`${dateFrom}T00:00:00`).getTime() : null;
    const toMs = dateTo ? new Date(`${dateTo}T23:59:59.999`).getTime() : null;

    return (history || []).filter((row) => {
      if (category !== 'all' && historyEventCategory(row.event_type) !== category) return false;
      if (fromMs != null || toMs != null) {
        const t = row.created_at ? new Date(row.created_at).getTime() : NaN;
        if (Number.isNaN(t)) return false;
        if (fromMs != null && t < fromMs) return false;
        if (toMs != null && t > toMs) return false;
      }
      if (!q) return true;
      const stageName = resolveHistoryStageName(row, stages) || '';
      const hay = [
        historyEventLabel(row.event_type),
        row.event_type,
        row.user_role,
        formatChangedBy(row, users),
        stageName,
        row.reason,
        row.project_code,
        row.frame_id,
      ].join(' ').toLowerCase();
      return hay.includes(q);
    });
  }, [history, category, search, dateFrom, dateTo, stages, users]);

  const clearFilters = () => {
    setCategory('all');
    setSearch('');
    setDateFrom('');
    setDateTo('');
  };

  const hasFilters = category !== 'all' || !!search || !!dateFrom || !!dateTo;

  return (
    <div className="pw-history">
      <div className="pw-history__toolbar">
        <h3 className="pw-section-title">Workflow history</h3>
        <div className="pw-history__filters" role="toolbar" aria-label="History filters">
          <div className="pw-history__chips">
            {HISTORY_FILTER_CHIPS.map((chip) => (
              <button
                key={chip.id}
                type="button"
                className={`pw-history__chip${category === chip.id ? ' is-active' : ''}`}
                onClick={() => setCategory(chip.id)}
              >
                {chip.label}
              </button>
            ))}
          </div>
          <div className="pw-history__filter-row">
            <label className="pw-history__search">
              <Search size={14} aria-hidden />
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search stage, user or event"
                aria-label="Search history"
              />
            </label>
            <label className="pw-field pw-history__date">
              <span>From</span>
              <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
            </label>
            <label className="pw-field pw-history__date">
              <span>To</span>
              <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
            </label>
            {hasFilters && (
              <button type="button" className="btn-secondary" onClick={clearFilters}>
                Clear Filters
              </button>
            )}
          </div>
        </div>
      </div>

      {(!history || history.length === 0) ? (
        <p className="pw-empty">No workflow history has been recorded for this panel yet.</p>
      ) : filtered.length === 0 ? (
        <p className="pw-empty">No history events match the current filters.</p>
      ) : (
        <div className="pw-history-timeline" role="list">
          {filtered.map((row) => (
            <div key={row.id} className="pw-history-timeline__item" role="listitem">
              <HistoryCard
                row={row}
                projectLabel={projectLabel}
                panelLabel={panelLabel}
                users={users}
                stages={stages}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
