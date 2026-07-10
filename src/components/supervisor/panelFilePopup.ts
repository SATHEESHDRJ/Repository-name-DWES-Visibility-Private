export type PanelFileKind = 'wiring' | 'drawing';

export type PanelFilePopupMode = 'loading' | 'empty' | 'populated' | 'replacing';

export interface PanelFileMetadata {
  fileName: string;
  fileType: string;
  uploadedAt?: string;
  uploadedBy?: string;
  sizeBytes?: number;
  sheetName?: string;
}

export function formatFileSize(bytes?: number): string {
  if (bytes == null || !Number.isFinite(bytes)) return '—';
  if (bytes > 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024).toFixed(0)} KB`;
}

export function formatUploadedAt(iso?: string): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString(undefined, {
      dateStyle: 'medium',
      timeStyle: 'short',
    });
  } catch {
    return iso;
  }
}

export function inferViewerFileType(
  fileName: string,
  contentType?: string,
): 'pdf' | 'image' | 'excel' | 'csv' | 'download-only' {
  const ext = (fileName.split('.').pop() || '').toLowerCase();
  if (ext === 'pdf' || contentType === 'application/pdf') return 'pdf';
  if (/^(png|jpe?g|gif|webp|bmp|svg|tiff?)$/.test(ext) || (contentType || '').startsWith('image/')) {
    return 'image';
  }
  if (/^(xlsx?|xlsm)$/.test(ext) || contentType?.includes('spreadsheet')) return 'excel';
  if (ext === 'csv' || contentType === 'text/csv') return 'csv';
  if (ext === 'dwg' || ext === 'dxf') return 'download-only';
  return 'download-only';
}

export function frameHasWiringSchedule(frame: {
  cable_count?: number;
  original_filename?: string;
  compare_status?: string;
} | null | undefined): boolean {
  if (!frame) return false;
  if ((frame.cable_count ?? 0) > 0) return true;
  const name = (frame.original_filename || '').trim();
  if (/\.(xlsx?|xlsm?)$/i.test(name) && name !== '(created with project)') return true;
  return frame.compare_status === 'validated' || frame.compare_status === 'verified';
}
