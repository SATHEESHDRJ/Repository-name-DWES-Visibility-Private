/** System field definitions for wiring schedule Excel column mapping. */
export const WIRING_SYSTEM_FIELDS = [
  { key: 'sno', label: 'S.No', required: false },
  { key: 'panel', label: 'Panel Name', required: false },
  { key: 'ferrule', label: 'Ferrule', required: true },
  { key: 'path', label: 'Path (SRC/DST)', required: false, hint: 'Auto-derives Source & Destination' },
  { key: 'source', label: 'Source (dev:term)', required: false },
  { key: 'destination', label: 'Destination (dev:term)', required: false },
  { key: 'source_device', label: 'Source Device', required: false },
  { key: 'source_terminal', label: 'Source Terminal', required: false },
  { key: 'dest_device', label: 'Dest Device', required: false },
  { key: 'dest_terminal', label: 'Dest Terminal', required: false },
  { key: 'color', label: 'Wire Color', required: false },
  { key: 'size', label: 'Wire Size', required: false },
  { key: 'length', label: 'Length', required: false },
  { key: 'sign', label: 'Sign/Polarity', required: false },
  { key: 'rack', label: 'Rack', required: false },
  { key: 'ref', label: 'Ref', required: false },
  { key: 'remarks', label: 'Remarks', required: false },
] as const;

export type WiringSystemFieldKey = (typeof WIRING_SYSTEM_FIELDS)[number]['key'];

const MONO_FIELDS = new Set<WiringSystemFieldKey>([
  'ferrule', 'source', 'destination', 'path',
  'source_device', 'dest_device', 'source_terminal', 'dest_terminal',
]);

export function isMonoWiringField(key: string | undefined): boolean {
  return !!key && MONO_FIELDS.has(key as WiringSystemFieldKey);
}

export function buildAutoWiringMapping(hdrs: string[], sample: unknown[][]): Record<string, string> {
  const auto: Record<string, string> = {};
  for (const field of WIRING_SYSTEM_FIELDS) {
    const match = hdrs.find((header: string) => {
      const hl = header.toLowerCase();
      if (field.key === 'sno') return hl === 's.no' || hl === 's.no.' || hl === 'sno' || hl === 'sl.no' || hl === 'sl no';
      if (field.key === 'ferrule') {
        if (hl.includes('pnl') || hl.includes('panel')) return false;
        return hl.includes('ferrule')
          || hl === 'iec_ferr_a' || (hl.includes('ferr') && !hl.endsWith('_b'))
          || hl === 'wire no' || hl === 'wire no.' || hl === 'wire number' || hl === 'cable no' || hl === 'cable no.';
      }
      if (field.key === 'source') return hl === 'source' || hl === 'from';
      if (field.key === 'destination') return hl === 'destination' || hl === 'to' || hl === 'dest';
      if (field.key === 'color') return hl.includes('color') || hl.includes('colour');
      if (field.key === 'size') return (hl.includes('size') || hl.includes('sq')) && !hl.includes('source');
      if (field.key === 'length') return hl.includes('length') || hl.includes('len(') || hl.includes('length(');
      if (field.key === 'ref') return hl === 'ref' || hl.includes('refrnce') || hl.includes('reference');
      if (field.key === 'remarks') return hl.includes('remark');
      if (field.key === 'sign') return hl.includes('sign') || hl === 'sign mark';
      if (field.key === 'rack') return hl === 'rack';
      if (field.key === 'panel') return (hl.includes('panel') && !hl.includes('layout')) || hl.includes('pnlno') || hl === 'pnl no' || hl === 'pnl_no';
      if (field.key === 'source_device') return hl.includes('src_dev') || hl === 'dev_tblk_a' || hl === 'dev_a';
      if (field.key === 'source_terminal') return hl === 'term_a' || hl === 'src_term' || hl === 'terminal_a';
      if (field.key === 'dest_device') return hl.includes('dst_dev') || hl === 'dev_tblk_b' || hl === 'dev_b';
      if (field.key === 'dest_terminal') return hl === 'term_b' || hl === 'dst_term' || hl === 'terminal_b';
      return false;
    });
    if (match) auto[field.key] = match;
  }

  if (!auto.path && !auto.source && !auto.destination) {
    const pathCol = hdrs.find((_header, hidx) => {
      const sampleVal = String(sample[0]?.[hidx] ?? '');
      return sampleVal.includes('/') && sampleVal.length > 3;
    });
    if (pathCol) auto.path = pathCol;
  }
  return auto;
}

export function fieldKeyForHeader(mapping: Record<string, string>, header: string): string | undefined {
  return Object.keys(mapping).find(k => mapping[k] === header);
}

export function updateWiringMapping(
  mapping: Record<string, string>,
  header: string,
  newKey: string,
): Record<string, string> {
  const next = { ...mapping };
  for (const k of Object.keys(next)) {
    if (next[k] === header) delete next[k];
  }
  if (newKey) next[newKey] = header;
  return next;
}
