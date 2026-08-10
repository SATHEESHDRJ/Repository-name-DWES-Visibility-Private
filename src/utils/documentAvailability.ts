/**
 * Shared document availability helpers — validate against API/DB responses,
 * not stale UI list state alone.
 */

export type DocumentAvailability = 'loading' | 'available' | 'missing' | 'error';

export interface DrawingSummary {
  id: string;
  original_name: string;
}

export interface DocumentStatus {
  availability: DocumentAvailability;
  /** Shown in tooltips / badges when availability is error or missing context. */
  message?: string;
  drawing?: DrawingSummary | null;
  fileName?: string;
  cableCount?: number;
  /** ISO timestamp of the original upload or the most recent replacement. */
  uploadedAt?: string;
}

export function pickPreviewableDrawing(
  drawings: DrawingSummary[],
): DrawingSummary | null {
  if (!drawings.length) return null;
  const ext = (n: string) => n.split('.').pop()?.toLowerCase() ?? '';
  return drawings.find(d => ext(d.original_name) === 'pdf')
    ?? drawings.find(d => ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg'].includes(ext(d.original_name)))
    ?? drawings[0];
}

/** Wiring schedule is available when verify-data reports cables, source Excel, or a real upload filename. */
export function wiringScheduleFromVerifyData(data: {
  cables?: unknown[];
  has_source_excel?: boolean;
  original_filename?: string;
  cable_count?: number;
} | null | undefined): boolean {
  if (!data) return false;
  const cables = Array.isArray(data.cables) ? data.cables : [];
  if (cables.length > 0) return true;
  if ((data.cable_count ?? 0) > 0) return true;
  if (data.has_source_excel) return true;
  const name = (data.original_filename || '').trim();
  return /\.(xlsx?|xlsm?)$/i.test(name) && name !== '(created with project)';
}

export function drawingStatusLabel(status: DocumentStatus): string {
  switch (status.availability) {
    case 'loading': return 'Checking…';
    case 'available': return 'Available';
    case 'error': return 'Error';
    default: return 'Missing';
  }
}

export function wiringStatusLabel(status: DocumentStatus): string {
  if (status.availability === 'missing' && status.message === 'Select a panel first') {
    return 'Select panel';
  }
  return drawingStatusLabel(status);
}
