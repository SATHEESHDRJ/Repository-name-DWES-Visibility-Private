import type { ReactNode } from 'react';
import {
  AlertCircle, AlertTriangle, CheckCircle2, FileText, FolderKanban, PanelTop, Trash2,
} from './icons';

export type ActionStatus =
  | 'idle'
  | 'confirm'
  | 'uploading'
  | 'processing'
  | 'completed'
  | 'failed'
  | 'deleted';

export interface ActionEntityRef {
  label: string;
  value: string;
  meta?: string;
  kind?: 'project' | 'panel' | 'file' | 'user' | 'other';
}

export interface ActionStatusPanelProps {
  message: string;
  entity?: ActionEntityRef | ActionEntityRef[];
  actionSummary?: string;
  /** Clear consequence of confirming (shown as a warning note). */
  consequence?: string;
  /** Side-by-side current vs proposed values for assignment / admin changes. */
  comparison?: {
    current: Array<{ label: string; value: string }>;
    proposed: Array<{ label: string; value: string }>;
  };
  removalItems?: string[];
  status?: ActionStatus;
  statusDetail?: string;
  progress?: number | null;
  counts?: Array<{ label: string; value: string | number }>;
  /** Exact backend / action error after a failed confirm. */
  error?: string | null;
  children?: ReactNode;
}

const STATUS_META: Record<ActionStatus, { label: string; className: string }> = {
  idle: { label: 'Ready', className: 'action-status-badge--idle' },
  confirm: { label: 'Confirm', className: 'action-status-badge--confirm' },
  uploading: { label: 'Uploading', className: 'action-status-badge--uploading' },
  processing: { label: 'Processing', className: 'action-status-badge--processing' },
  completed: { label: 'Completed', className: 'action-status-badge--completed' },
  failed: { label: 'Failed', className: 'action-status-badge--failed' },
  deleted: { label: 'Deleted', className: 'action-status-badge--deleted' },
};

function EntityIcon({ kind }: { kind?: ActionEntityRef['kind'] }) {
  if (kind === 'project') return <FolderKanban size={14} aria-hidden />;
  if (kind === 'panel') return <PanelTop size={14} aria-hidden />;
  if (kind === 'file') return <FileText size={14} aria-hidden />;
  if (kind === 'user') return <Trash2 size={14} aria-hidden />;
  return <FileText size={14} aria-hidden />;
}

export default function ActionStatusPanel({
  message,
  entity,
  actionSummary,
  consequence,
  comparison,
  removalItems = [],
  status = 'confirm',
  statusDetail,
  progress = null,
  counts = [],
  error = null,
  children,
}: ActionStatusPanelProps) {
  const entities = entity ? (Array.isArray(entity) ? entity : [entity]) : [];
  const meta = STATUS_META[status];
  const showProgress = typeof progress === 'number' && (status === 'uploading' || status === 'processing');

  return (
    <div className="action-status-panel">
      <div className="action-status-top">
        <span className={`action-status-badge ${meta.className}`} role="status">
          {status === 'failed' ? <AlertCircle size={14} aria-hidden /> : null}
          {status === 'completed' || status === 'deleted' ? <CheckCircle2 size={14} aria-hidden /> : null}
          {(status === 'confirm' || status === 'idle') ? <AlertTriangle size={14} aria-hidden /> : null}
          {meta.label}
        </span>
        {statusDetail ? <span className="action-status-detail">{statusDetail}</span> : null}
      </div>

      <p className="action-status-message">{message}</p>

      {consequence ? (
        <div className="action-status-consequence" role="note">
          <AlertTriangle size={15} aria-hidden />
          <span>{consequence}</span>
        </div>
      ) : null}

      {actionSummary ? (
        <div className="action-status-summary">
          <span className="action-status-summary-label">Action</span>
          <span className="action-status-summary-value">{actionSummary}</span>
        </div>
      ) : null}

      {comparison ? (
        <div className="action-status-comparison" aria-label="Current and proposed values">
          <div className="action-status-comparison-col">
            <h4>Current</h4>
            <dl>
              {comparison.current.map(row => (
                <div key={`cur-${row.label}`}>
                  <dt>{row.label}</dt>
                  <dd>{row.value}</dd>
                </div>
              ))}
            </dl>
          </div>
          <div className="action-status-comparison-col action-status-comparison-col--proposed">
            <h4>Proposed</h4>
            <dl>
              {comparison.proposed.map(row => (
                <div key={`prop-${row.label}`}>
                  <dt>{row.label}</dt>
                  <dd>{row.value}</dd>
                </div>
              ))}
            </dl>
          </div>
        </div>
      ) : null}

      {entities.length > 0 ? (
        <div className="action-status-entities" aria-label="Affected items">
          {entities.map(item => (
            <div key={`${item.label}-${item.value}`} className="action-status-entity">
              <span className="action-status-entity-icon"><EntityIcon kind={item.kind} /></span>
              <div className="action-status-entity-copy">
                <span className="action-status-entity-label">{item.label}</span>
                <span className="action-status-entity-value">{item.value}</span>
                {item.meta ? <span className="action-status-entity-meta">{item.meta}</span> : null}
              </div>
            </div>
          ))}
        </div>
      ) : null}

      {counts.length > 0 ? (
        <div className="action-status-counts">
          {counts.map(c => (
            <span key={c.label} className="action-status-count">
              <strong>{c.value}</strong> {c.label}
            </span>
          ))}
        </div>
      ) : null}

      {showProgress ? (
        <div className="action-status-progress" role="progressbar" aria-valuenow={progress ?? 0} aria-valuemin={0} aria-valuemax={100}>
          <div className="action-status-progress-track">
            <div className="action-status-progress-fill" style={{ width: `${Math.max(0, Math.min(100, progress ?? 0))}%` }} />
          </div>
          <span className="action-status-progress-pct">{Math.round(progress ?? 0)}%</span>
        </div>
      ) : null}

      {removalItems.length > 0 ? (
        <div className="action-status-removal" role="alert">
          <AlertTriangle size={16} className="action-status-removal-icon" aria-hidden />
          <div>
            <p className="action-status-removal-title">Permanently removed</p>
            <ul className="action-status-removal-list">
              {removalItems.map(item => <li key={item}>{item}</li>)}
            </ul>
          </div>
        </div>
      ) : null}

      {error ? (
        <div className="action-status-error form-error" role="alert">{error}</div>
      ) : null}

      {children}
    </div>
  );
}