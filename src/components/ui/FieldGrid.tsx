import type { CSSProperties, ReactNode } from 'react';
import {
  WorkspaceInfoMatrix,
  WorkspaceInfoCell,
  isBlankInfoValue,
  type WorkspaceInfoEmphasis,
} from './WorkspaceInfoMatrix';

export interface FieldGridItem {
  label: string;
  value: ReactNode;
  mono?: boolean;
  title?: string;
  className?: string;
  emphasis?: WorkspaceInfoEmphasis;
  hideIfEmpty?: boolean;
}

interface FieldGridProps {
  fields: FieldGridItem[];
  /** auto-fit columns; defaults to dense dashboard packing */
  minCol?: number | string;
  className?: string;
  columns?: 2 | 3 | 4 | 5 | 6;
}

/**
 * Responsive label/value grid — label directly above value, tight gap, packs side-by-side.
 */
export default function FieldGrid({
  fields,
  minCol = '9rem',
  className = '',
  columns,
}: FieldGridProps) {
  const visible = fields.filter(f => !(f.hideIfEmpty !== false && isBlankInfoValue(f.value)));
  const colClass = columns ? ` dw-wim-matrix--cols-${columns}` : '';
  const style = columns
    ? undefined
    : ({ '--field-grid-min': typeof minCol === 'number' ? `${minCol}px` : minCol } as CSSProperties);

  if (columns) {
    return (
      <WorkspaceInfoMatrix className={className} columns={columns} aria-label="Information summary">
        {visible.map(field => (
          <WorkspaceInfoCell
            key={field.label}
            label={field.label}
            value={field.value}
            emphasis={field.emphasis ?? 'default'}
            hideIfEmpty={false}
            title={field.title ?? (typeof field.value === 'string' ? field.value : undefined)}
            className={`${field.mono ? 'dw-wim-value--mono' : ''}${field.className ? ` ${field.className}` : ''}`}
          />
        ))}
      </WorkspaceInfoMatrix>
    );
  }

  return (
    <div
      className={`field-grid${colClass}${className ? ` ${className}` : ''}`}
      style={style}
    >
      {visible.map(field => (
        <div key={field.label} className={`field-grid-item dw-wim-cell${field.className ? ` ${field.className}` : ''}`}>
          <span className="field-grid-label dw-wim-label">{field.label}</span>
          <span
            className={`field-grid-value dw-wim-value${field.emphasis === 'primary' ? ' dw-wim-value--primary' : ''}${field.emphasis === 'meta' ? ' dw-wim-value--meta' : ''}${field.mono ? ' field-grid-value--mono dw-wim-value--mono' : ''}`}
            title={field.title ?? (typeof field.value === 'string' ? field.value : undefined)}
          >
            {field.value}
          </span>
        </div>
      ))}
    </div>
  );
}
