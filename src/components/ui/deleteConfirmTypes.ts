/** Shared delete-confirmation contracts used by DeleteConfirmModal and callers. */

export type DeleteResourceKind =
  | 'panel'
  | 'drawing'
  | 'project_soft'
  | 'project_hard'
  | 'user'
  | 'assignment'
  | 'report'
  | 'upload'
  | 'completed_record'
  | 'generic';

export type DeleteScopeId =
  | 'item_only'
  | 'item_and_files'
  | 'everything_related';

export interface DeleteImpactField {
  label: string;
  value: string;
  meta?: string;
  emphasize?: boolean;
}

export interface DeleteImpactStat {
  label: string;
  count: number;
  tone?: 'danger' | 'neutral' | 'warning';
}

export interface DeleteImpactSection {
  id: string;
  title: string;
  icon?: 'database' | 'file' | 'folder' | 'users' | 'link' | 'shield';
  items: string[];
  defaultExpanded?: boolean;
  badge?: string;
}

export interface DeleteScopeOption {
  id: DeleteScopeId;
  label: string;
  description: string;
  disabled?: boolean;
}

export type DeleteBackupPhase =
  | 'pending'
  | 'ready'
  | 'creating'
  | 'done'
  | 'skipped'
  | 'unavailable';

export interface DeleteBackupStatus {
  status: DeleteBackupPhase;
  note: string;
}

export interface DeleteResultSummary {
  title?: string;
  message?: string;
  removed: string[];
  retained?: string[];
  backupPath?: string;
}

/** Common precheck shape returned by frame/drawing guarded-delete endpoints. */
export interface DeleteGuardedPrecheck {
  confirm_phrase?: string;
  backup_note?: string;
  panel_name?: string;
  cable_count?: number;
  assignment_count?: number;
  original_filename?: string;
  size?: number;
  [key: string]: unknown;
}
