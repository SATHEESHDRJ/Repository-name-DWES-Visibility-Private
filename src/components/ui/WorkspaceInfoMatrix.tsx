import type { ReactNode } from 'react';

export type WorkspaceInfoEmphasis = 'primary' | 'default' | 'meta';

const BLANK_STRINGS = new Set(['', '-', 'not set', 'n/a', 'na', '--']);

export function isBlankInfoValue(value: ReactNode): boolean {
  if (value === null || value === undefined || value === false) return true;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed.length === 0) return true;
    const lower = trimmed.toLowerCase();
    if (BLANK_STRINGS.has(lower)) return true;
    if (trimmed === '\u2014' || trimmed === '\u2013') return true;
    return false;
  }
  return false;
}

function valueClass(emphasis: WorkspaceInfoEmphasis): string {
  if (emphasis === 'primary') return 'dw-wim-value dw-wim-value--primary';
  if (emphasis === 'meta') return 'dw-wim-value dw-wim-value--meta';
  return 'dw-wim-value';
}

export interface WorkspaceInfoMatrixProps {
  children: ReactNode;
  className?: string;
  columns?: 2 | 3 | 4 | 5 | 6;
  'aria-label'?: string;
}

export function WorkspaceInfoMatrix({
  children,
  className = '',
  columns,
  'aria-label': ariaLabel,
}: WorkspaceInfoMatrixProps) {
  const colClass = columns ? ` dw-wim-matrix--cols-${columns}` : '';
  return (
    <div
      className={`dw-wim-matrix${colClass}${className ? ` ${className}` : ''}`}
      role="group"
      aria-label={ariaLabel}
    >
      {children}
    </div>
  );
}

export function WorkspaceInfoMatrixSpan({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`dw-wim-matrix-span${className ? ` ${className}` : ''}`}>{children}</div>;
}

export interface WorkspaceInfoCellProps {
  label: string;
  value?: ReactNode;
  children?: ReactNode;
  emphasis?: WorkspaceInfoEmphasis;
  hideIfEmpty?: boolean;
  title?: string;
  className?: string;
}

export function WorkspaceInfoCell({
  label,
  value,
  children,
  emphasis = 'default',
  hideIfEmpty = true,
  title,
  className = '',
}: WorkspaceInfoCellProps) {
  const content = children !== undefined ? children : value;
  if (hideIfEmpty && isBlankInfoValue(content)) return null;

  return (
    <div className={`dw-wim-cell${className ? ` ${className}` : ''}`}>
      <span className="dw-wim-label">{label}</span>
      <span
        className={valueClass(emphasis)}
        title={title ?? (typeof content === 'string' ? content : undefined)}
      >
        {content}
      </span>
    </div>
  );
}

export interface WorkspaceInfoHeaderProps {
  primary: ReactNode;
  secondary?: ReactNode;
  trailing?: ReactNode;
  className?: string;
}

export function WorkspaceInfoHeader({ primary, secondary, trailing, className = '' }: WorkspaceInfoHeaderProps) {
  return (
    <header className={`dw-wim-header${className ? ` ${className}` : ''}`}>
      <div className="dw-wim-header-titles">
        <h4 className="dw-wim-title-primary">{primary}</h4>
        {secondary != null && !isBlankInfoValue(secondary) && (
          <p className="dw-wim-title-secondary">{secondary}</p>
        )}
      </div>
      {trailing}
    </header>
  );
}