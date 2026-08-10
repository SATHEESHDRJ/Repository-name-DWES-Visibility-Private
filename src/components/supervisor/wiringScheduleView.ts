import type { WiringSchedulePreview } from './WiringScheduleMappingGrid';

export interface VerifyScheduleData {
  panel_name: string;
  original_filename: string;
  sheet_name: string;
  mapping: Record<string, string>;
  excel_headers: string[];
  cables: Array<Record<string, unknown> & { _raw?: Record<string, string> }>;
  validation: WiringSchedulePreview['validation'];
}

export function buildGridFromVerifyData(data: VerifyScheduleData) {
  const headers = data.excel_headers?.length
    ? data.excel_headers
    : [...new Set(Object.values(data.mapping || {}).filter(Boolean))];

  const rows = (data.cables || []).map(cable => {
    const raw = cable._raw;
    if (raw && Object.keys(raw).length > 0) {
      return headers.map(h => String(raw[h] ?? ''));
    }
    return headers.map(h => {
      const fieldKey = Object.entries(data.mapping || {}).find(([, hdr]) => hdr === h)?.[0];
      return fieldKey ? String(cable[fieldKey] ?? '') : '';
    });
  });

  const includedHeaders = Object.fromEntries(headers.map(h => [h, true]));
  const mappedHeaders = new Set(Object.values(data.mapping || {}).filter(Boolean));

  const preview: WiringSchedulePreview = {
    cable_count: data.cables?.length ?? 0,
    mapped_columns: mappedHeaders.size,
    unmatched_headers: headers.filter(h => !mappedHeaders.has(h)),
    validation: data.validation || { total: 0, ok_count: 0, error_count: 0, issues: {} },
  };

  return {
    headers,
    rows,
    mapping: data.mapping || {},
    includedHeaders,
    preview,
    sheetName: data.sheet_name,
    originalFilename: data.original_filename,
  };
}
