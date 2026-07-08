/** Windows-safe report filename segments (no path separators or reserved device names). */
const WINDOWS_RESERVED = /^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])$/i;

export function sanitizeFilenameSegment(raw: string, maxLen = 48): string {
  let s = String(raw ?? '').trim();
  if (!s) return 'Unknown';
  s = s
    .replace(/[\u2013\u2014\u2212]/g, '-')
    .replace(/[^a-zA-Z0-9._-]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^[_.-]+|[_.-]+$/g, '')
    .replace(/[.\s]+$/g, '');
  if (!s) return 'Unknown';
  if (WINDOWS_RESERVED.test(s)) s = `_${s}`;
  return s.slice(0, maxLen);
}

/**
 * Panel completion / panel report download name.
 * Uses project code (from creation) + panel name — never the long legacy display title.
 * Example: Report_132KV33KV_KSA_RIYADH_2026_001_H001.pdf
 */
export function buildPanelReportFilename(opts: {
  projectCode: string;
  panelName: string;
  ext: 'pdf' | 'xlsx';
}): string {
  const code = sanitizeFilenameSegment(opts.projectCode, 80);
  const panel = sanitizeFilenameSegment(opts.panelName, 40);
  return `Report_${code}_${panel}.${opts.ext}`;
}
