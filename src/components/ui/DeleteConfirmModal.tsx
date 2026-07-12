import { useEffect, useId, useMemo, useState } from 'react';
import Modal from '../Modal';
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Cable,
  Database,
  File,
  FolderOpen,
  HardDrive,
  Shield,
  Trash2,
  Users,
} from './icons';
import type {
  DeleteBackupStatus,
  DeleteImpactField,
  DeleteImpactSection,
  DeleteImpactStat,
  DeleteResourceKind,
  DeleteResultSummary,
  DeleteScopeId,
  DeleteScopeOption,
} from './deleteConfirmTypes';

export type {
  DeleteBackupPhase,
  DeleteBackupStatus,
  DeleteGuardedPrecheck,
  DeleteImpactField,
  DeleteImpactSection,
  DeleteImpactStat,
  DeleteResourceKind,
  DeleteResultSummary,
  DeleteScopeId,
  DeleteScopeOption,
} from './deleteConfirmTypes';

export interface DeleteConfirmModalProps {
  title: string;
  subtitle?: string;
  resourceKind: DeleteResourceKind;
  itemLabel: string;
  parentProject?: { code: string; name: string };
  fields?: DeleteImpactField[];
  stats?: DeleteImpactStat[];
  sections?: DeleteImpactSection[];
  scopes?: DeleteScopeOption[];
  defaultScope?: DeleteScopeId;
  backup?: DeleteBackupStatus | null;
  warningTitle?: string;
  warningText: string;
  irreversible?: boolean;
  confirmCheckboxLabel?: string;
  confirmButtonLabel?: string;
  loading?: boolean;
  deleting?: boolean;
  error?: string;
  result?: DeleteResultSummary | null;
  onClose: () => void;
  onConfirm: (scope: DeleteScopeId) => void | Promise<void>;
  onDone?: () => void;
  size?: 'default' | 'lg';
  typography?: 'standard' | 'user-management';
}

function SectionIcon({ icon }: { icon?: DeleteImpactSection['icon'] }) {
  const props = { size: 16 as const, 'aria-hidden': true as const };
  if (icon === 'database') return <Database {...props} />;
  if (icon === 'file') return <File {...props} />;
  if (icon === 'folder') return <FolderOpen {...props} />;
  if (icon === 'users') return <Users {...props} />;
  if (icon === 'link') return <Cable {...props} />;
  if (icon === 'shield') return <Shield {...props} />;
  return <HardDrive {...props} />;
}

function backupToneClass(status: DeleteBackupStatus['status']): string {
  if (status === 'ready' || status === 'done') return 'delete-confirm-backup--ok';
  if (status === 'creating' || status === 'pending') return 'delete-confirm-backup--pending';
  if (status === 'skipped') return 'delete-confirm-backup--warn';
  return 'delete-confirm-backup--danger';
}

function backupLabel(status: DeleteBackupStatus['status']): string {
  if (status === 'ready') return 'Backup before delete';
  if (status === 'creating') return 'Creating backup…';
  if (status === 'done') return 'Backup created';
  if (status === 'pending') return 'Backup pending';
  if (status === 'skipped') return 'No backup in this flow';
  return 'Backup unavailable';
}

function ExpandableSection({ section }: { section: DeleteImpactSection }) {
  const [open, setOpen] = useState(section.defaultExpanded ?? true);
  const panelId = useId();

  return (
    <div className="delete-confirm-section">
      <button
        type="button"
        className="delete-confirm-section-toggle"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen(v => !v)}
      >
        <span className="delete-confirm-section-icon">
          <SectionIcon icon={section.icon} />
        </span>
        <span className="delete-confirm-section-title">{section.title}</span>
        {section.badge ? (
          <span className="delete-confirm-badge">{section.badge}</span>
        ) : null}
        <span className="delete-confirm-section-chevron" aria-hidden="true">
          {open ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
        </span>
      </button>
      {open ? (
        <ul id={panelId} className="delete-confirm-section-list">
          {section.items.map(item => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

export default function DeleteConfirmModal({
  title,
  subtitle,
  resourceKind,
  itemLabel,
  parentProject,
  fields = [],
  stats = [],
  sections = [],
  scopes,
  defaultScope = 'item_only',
  backup = null,
  warningTitle = 'This action cannot be undone',
  warningText,
  irreversible = true,
  confirmCheckboxLabel,
  confirmButtonLabel = 'Delete',
  loading = false,
  deleting = false,
  error,
  result = null,
  onClose,
  onConfirm,
  onDone,
  size = 'lg',
  typography = 'standard',
}: DeleteConfirmModalProps) {
  const checkboxId = useId();
  const enabledScopes = useMemo(
    () => (scopes && scopes.length > 0 ? scopes : null),
    [scopes],
  );
  const initialScope = useMemo(() => {
    if (!enabledScopes) return defaultScope;
    const preferred = enabledScopes.find(s => s.id === defaultScope && !s.disabled);
    return preferred?.id ?? enabledScopes.find(s => !s.disabled)?.id ?? defaultScope;
  }, [enabledScopes, defaultScope]);

  const [acknowledged, setAcknowledged] = useState(false);
  const [scope, setScope] = useState<DeleteScopeId>(initialScope);

  useEffect(() => {
    setAcknowledged(false);
    setScope(initialScope);
  }, [itemLabel, resourceKind, initialScope, result]);

  const handleClose = () => {
    if (deleting) return;
    onClose();
  };

  const handleConfirm = async () => {
    if (!acknowledged || deleting || loading || result) return;
    await onConfirm(scope);
  };

  const checkboxLabel =
    confirmCheckboxLabel
    || `I understand this will permanently delete “${itemLabel}” and related data shown above.`;

  const footer = result ? (
    <div className="delete-confirm-footer">
      <button
        type="button"
        className="btn-primary flex-1"
        onClick={() => (onDone ? onDone() : onClose())}
      >
        Done
      </button>
    </div>
  ) : (
    <div className="delete-confirm-footer">
      <button
        type="button"
        className="btn-secondary flex-1"
        onClick={handleClose}
        disabled={deleting || loading}
      >
        Cancel
      </button>
      <button
        type="button"
        className="btn-danger flex-1"
        onClick={() => void handleConfirm()}
        disabled={deleting || loading || !acknowledged}
        aria-disabled={deleting || loading || !acknowledged}
      >
        {deleting ? (
          <>
            <span className="delete-confirm-spinner" aria-hidden="true" />
            Deleting…
          </>
        ) : (
          <>
            <Trash2 size={16} aria-hidden="true" />
            {confirmButtonLabel}
          </>
        )}
      </button>
    </div>
  );

  return (
    <Modal
      title={title}
      subtitle={subtitle}
      onClose={handleClose}
      size={size}
      typography={typography}
      closeOnBackdrop={!deleting}
      closeOnEscape={!deleting}
      footer={footer}
    >
      {loading ? (
        <div className="delete-confirm-loading">Preparing delete confirmation…</div>
      ) : result ? (
        <div className="delete-confirm-result">
          <CheckCircle2 size={48} className="delete-confirm-result-icon" aria-hidden="true" />
          <div className="delete-confirm-result-title">
            {result.title || 'Deletion complete'}
          </div>
          {result.message ? (
            <p className="delete-confirm-result-message">{result.message}</p>
          ) : null}
          <div className="delete-confirm-result-card glass-surface--subtle">
            {result.removed.length > 0 ? (
              <div className="delete-confirm-result-block">
                <span className="delete-confirm-result-label">Removed</span>
                <ul>
                  {result.removed.map(line => (
                    <li key={line}>{line}</li>
                  ))}
                </ul>
              </div>
            ) : null}
            {result.retained && result.retained.length > 0 ? (
              <div className="delete-confirm-result-block">
                <span className="delete-confirm-result-label">Retained</span>
                <ul>
                  {result.retained.map(line => (
                    <li key={line}>{line}</li>
                  ))}
                </ul>
              </div>
            ) : null}
            {result.backupPath ? (
              <div className="delete-confirm-result-backup">
                Backup: <code>{result.backupPath}</code>
              </div>
            ) : null}
          </div>
        </div>
      ) : (
        <div className="delete-confirm-body" data-resource-kind={resourceKind}>
          <div className="delete-confirm-info-card glass-surface--subtle">
            <div className="delete-confirm-info-grid">
              <div className="delete-confirm-info-field">
                <span className="delete-confirm-info-label">Item</span>
                <span className="delete-confirm-info-value delete-confirm-info-value--item">
                  {itemLabel}
                </span>
              </div>
              {parentProject ? (
                <div className="delete-confirm-info-field">
                  <span className="delete-confirm-info-label">Project</span>
                  <span className="delete-confirm-info-value">{parentProject.name}</span>
                  <span className="delete-confirm-info-meta">{parentProject.code}</span>
                </div>
              ) : null}
              {fields.map(field => (
                <div key={field.label} className="delete-confirm-info-field">
                  <span className="delete-confirm-info-label">{field.label}</span>
                  <span
                    className={
                      field.emphasize
                        ? 'delete-confirm-info-value delete-confirm-info-value--item'
                        : 'delete-confirm-info-value'
                    }
                  >
                    {field.value}
                  </span>
                  {field.meta ? (
                    <span className="delete-confirm-info-meta">{field.meta}</span>
                  ) : null}
                </div>
              ))}
            </div>
            {stats.length > 0 ? (
              <div className="delete-confirm-stats">
                {stats.map(stat => (
                  <span
                    key={stat.label}
                    className={`delete-confirm-stat delete-confirm-stat--${stat.tone || 'neutral'}`}
                  >
                    <strong>{stat.count}</strong> {stat.label}
                  </span>
                ))}
              </div>
            ) : null}
          </div>

          {sections.length > 0 ? (
            <div className="delete-confirm-sections">
              {sections.map(section => (
                <ExpandableSection key={section.id} section={section} />
              ))}
            </div>
          ) : null}

          {enabledScopes ? (
            <fieldset className="delete-confirm-scopes" disabled={deleting}>
              <legend className="delete-confirm-scopes-legend">Deletion scope</legend>
              <div className="delete-confirm-scopes-list">
                {enabledScopes.map(option => (
                  <label
                    key={option.id}
                    className={`delete-confirm-scope ${option.disabled ? 'is-disabled' : ''} ${scope === option.id ? 'is-selected' : ''}`}
                  >
                    <input
                      type="radio"
                      name="delete-confirm-scope"
                      value={option.id}
                      checked={scope === option.id}
                      disabled={option.disabled || deleting}
                      onChange={() => setScope(option.id)}
                    />
                    <span className="delete-confirm-scope-copy">
                      <span className="delete-confirm-scope-label">{option.label}</span>
                      <span className="delete-confirm-scope-desc">{option.description}</span>
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>
          ) : null}

          {backup ? (
            <div className={`delete-confirm-backup ${backupToneClass(backup.status)}`} role="status">
              <HardDrive size={16} aria-hidden="true" />
              <div className="delete-confirm-backup-copy">
                <span className="delete-confirm-backup-title">{backupLabel(backup.status)}</span>
                <span className="delete-confirm-backup-note">{backup.note}</span>
              </div>
            </div>
          ) : null}

          <div className="delete-confirm-warning" role="alert">
            <AlertTriangle size={18} className="delete-confirm-warning-icon" aria-hidden="true" />
            <div className="delete-confirm-warning-copy">
              <p className="delete-confirm-warning-title">
                {irreversible ? warningTitle : warningTitle}
              </p>
              <p className="delete-confirm-warning-text">{warningText}</p>
            </div>
          </div>

          <label htmlFor={checkboxId} className="delete-confirm-ack">
            <input
              id={checkboxId}
              type="checkbox"
              checked={acknowledged}
              disabled={deleting}
              onChange={e => setAcknowledged(e.target.checked)}
            />
            <span>{checkboxLabel}</span>
          </label>

          {error ? <div className="form-error">{error}</div> : null}
        </div>
      )}
    </Modal>
  );
}
