import {
  isPhysicalTbHeader,
  normalizeDeviceName,
  resolvePhysicalTbEnd,
} from '../tb-markers/terminal-range';

/**
 * Unique expected *physical* TB headers from wiring schedule cables.
 * Equipment/device tags (74IO, 87STUB, K01, …) are excluded — they are not GA TB strips.
 * Embedded X* values in TERM under a non-TB DEV_TBLK are terminal metadata, not expected headers.
 *
 * Aligns with Technician `resolveLiveTbWireEnds` / `classifyLiveTbEndpoint`.
 */
export function buildExpectedTbHeaders(
  cables: any[] | null | undefined,
  mapping?: Record<string, string> | null,
): string[] {
  return Object.keys(buildScheduleTbTerminalIndex(cables, mapping)).sort();
}

/** Rich EXPECTED_TB_HEADERS dictionary for max-accuracy anchoring. */
export type ExpectedTbHeaderEntry = {
  canonical_header: string;
  raw_header: string;
  schedule_count: number;
  example_terminals: string[];
  equipment_context: string[];
  source_usage_count: number;
  destination_usage_count: number;
};

export function buildExpectedTbDictionary(
  cables: any[] | null | undefined,
  mapping?: Record<string, string> | null,
): ExpectedTbHeaderEntry[] {
  const index = buildScheduleTbTerminalIndex(cables, mapping);
  const stats = new Map<string, ExpectedTbHeaderEntry>();
  for (const [header, terminals] of Object.entries(index)) {
    stats.set(header, {
      canonical_header: header,
      raw_header: header,
      schedule_count: terminals.length,
      example_terminals: terminals.slice(0, 8),
      equipment_context: [],
      source_usage_count: 0,
      destination_usage_count: 0,
    });
  }
  for (const c of cables || []) {
    const ends = resolveCablePhysicalEndsForAnalysis(c, mapping);
    const equip = String(c?.equipment || c?.equipment_tag || c?.tag || '').trim();
    if (ends.src.tb) {
      const key = normalizeDeviceName(ends.src.tb);
      const e = stats.get(key);
      if (e) {
        e.source_usage_count += 1;
        if (equip && !e.equipment_context.includes(equip)) e.equipment_context.push(equip);
      }
    }
    if (ends.dst.tb) {
      const key = normalizeDeviceName(ends.dst.tb);
      const e = stats.get(key);
      if (e) {
        e.destination_usage_count += 1;
        if (equip && !e.equipment_context.includes(equip)) e.equipment_context.push(equip);
      }
    }
  }
  return [...stats.values()].sort((a, b) => a.canonical_header.localeCompare(b.canonical_header));
}

/**
 * Map physical TB header → set of schedule terminal ids for Excel–GA cross-verify.
 */
export function buildScheduleTbTerminalIndex(
  cables: any[] | null | undefined,
  mapping?: Record<string, string> | null,
): Record<string, string[]> {
  const map = new Map<string, Set<string>>();
  const add = (tb: string, term: string) => {
    const key = normalizeDeviceName(tb);
    if (!key || !isPhysicalTbHeader(key)) return;
    if (!map.has(key)) map.set(key, new Set());
    const t = String(term || '').trim();
    if (t) map.get(key)!.add(t);
  };

  for (const c of cables || []) {
    const ends = resolveCablePhysicalEndsForAnalysis(c, mapping);
    if (ends.src.tb) add(ends.src.tb, ends.src.terminal);
    if (ends.dst.tb) add(ends.dst.tb, ends.dst.terminal);
  }
  const out: Record<string, string[]> = {};
  for (const [k, v] of map) out[k] = [...v];
  return out;
}

/** Same priority as FE resolveLiveTbWireEnds: _raw DEV_TBLK → mapped → typed. */
export function resolveCablePhysicalEndsForAnalysis(
  cable: any,
  mapping?: Record<string, string> | null,
): {
  src: { tb: string; terminal: string };
  dst: { tb: string; terminal: string };
} {
  const raw = (cable && typeof cable._raw === 'object' && cable._raw) || {};
  const map = mapping || {};

  const rawSrcTb = readRawAliases(raw, ['DEV_TBLK_A', 'DEV_A', 'SRC_DEV', 'SOURCE_DEVICE']);
  const rawSrcTerm = readRawAliases(raw, ['TERM_A', 'SRC_TERM', 'TERMINAL_A', 'SOURCE_TERMINAL']);
  const rawDstTb = readRawAliases(raw, ['DEV_TBLK_B', 'DEV_B', 'DST_DEV', 'DEST_DEVICE']);
  const rawDstTerm = readRawAliases(raw, ['TERM_B', 'DST_TERM', 'TERMINAL_B', 'DEST_TERMINAL']);

  const mappedSrc = map.source_device ? readRawExact(raw, map.source_device) : '';
  const mappedSrcTerm = map.source_terminal ? readRawExact(raw, map.source_terminal) : '';
  const mappedDst = map.dest_device ? readRawExact(raw, map.dest_device) : '';
  const mappedDstTerm = map.dest_terminal ? readRawExact(raw, map.dest_terminal) : '';

  let srcHeader = '';
  if (rawSrcTb) srcHeader = rawSrcTb;
  else if (mappedSrc) srcHeader = mappedSrc;
  else srcHeader = String(cable?.source_device || parseCombinedDevice(cable?.source) || '').trim();

  const srcTerm =
    rawSrcTerm
    || mappedSrcTerm
    || String(cable?.source_terminal || '').trim();

  let dstHeader = '';
  if (rawDstTb) dstHeader = rawDstTb;
  else if (mappedDst) dstHeader = mappedDst;
  else {
    dstHeader = String(
      cable?.dest_device || cable?.destination_device || parseCombinedDevice(cable?.destination) || '',
    ).trim();
  }

  const dstTerm =
    rawDstTerm
    || mappedDstTerm
    || String(cable?.dest_terminal || cable?.destination_terminal || '').trim();

  const srcPhys = resolvePhysicalTbEnd(srcHeader, srcTerm);
  const dstPhys = resolvePhysicalTbEnd(dstHeader, dstTerm);
  return {
    src: { tb: srcPhys.tb, terminal: srcPhys.terminal || '' },
    dst: { tb: dstPhys.tb, terminal: dstPhys.terminal || '' },
  };
}

function readRawAliases(raw: Record<string, unknown>, aliases: string[]): string {
  const keys = Object.keys(raw);
  for (const alias of aliases) {
    const hit = keys.find(k => k.replace(/\s+/g, '').toUpperCase() === alias.replace(/\s+/g, '').toUpperCase());
    if (hit != null && raw[hit] != null && String(raw[hit]).trim()) {
      return String(raw[hit]).trim();
    }
  }
  return '';
}

function readRawExact(raw: Record<string, unknown>, excelHeader: string): string {
  if (!excelHeader) return '';
  if (raw[excelHeader] != null && String(raw[excelHeader]).trim()) {
    return String(raw[excelHeader]).trim();
  }
  const keys = Object.keys(raw);
  const hit = keys.find(
    k => k.replace(/\s+/g, '').toUpperCase() === excelHeader.replace(/\s+/g, '').toUpperCase(),
  );
  if (hit != null && raw[hit] != null) return String(raw[hit]).trim();
  return '';
}

function parseCombinedDevice(value: unknown): string {
  if (value == null) return '';
  const s = String(value).trim();
  if (!s) return '';
  const parts = s.split(/\s*\/\s*/);
  return parts[0]?.trim() || s;
}

export type DetectionConfidence = 'HIGH' | 'MEDIUM' | 'LOW' | 'AMBIGUOUS';

export type TbGroupCandidate = {
  tb_number: string;
  terminal_group: string;
  page_number: number;
  view_name?: string | null;
  geometry: { x: number; y: number; width: number; height: number; rotation?: number };
  detection_method: string;
  confidence: DetectionConfidence;
  confidence_score: number;
  reasons: string[];
  evidence?: Record<string, unknown>;
};

/** Deterministic confidence: AI alone cannot set HIGH. */
export function scoreCandidate(input: {
  headerExact: boolean;
  terminalRangeFound: boolean;
  strongCellPattern: boolean;
  uniqueOnPage: boolean;
  ocrOnlyWeak: boolean;
  conflictingPeers: number;
  /** When Nest/OCR classified Internal/Rear/Physical TB bank. */
  eligibleView?: boolean;
  hasRealBox?: boolean;
}): { confidence: DetectionConfidence; score: number; reasons: string[] } {
  const reasons: string[] = [];
  let score = 0;
  if (input.headerExact) {
    score += 0.4;
    reasons.push('Expected header exact match');
  }
  if (input.terminalRangeFound) {
    score += 0.25;
    reasons.push('Terminal range detected');
  }
  if (input.strongCellPattern) {
    score += 0.2;
    reasons.push('Repeated terminal-cell pattern');
  }
  if (input.uniqueOnPage) {
    score += 0.15;
    reasons.push('Unique candidate after disambiguation');
  }
  if (input.eligibleView) {
    score += 0.15;
    reasons.push('Eligible Internal/Rear/Physical TB view');
  }
  if (input.ocrOnlyWeak) {
    score -= 0.2;
    reasons.push('Weak OCR-only signal');
  }
  if (input.conflictingPeers > 0) {
    reasons.push(`Conflicting peers=${input.conflictingPeers}`);
    return { confidence: 'AMBIGUOUS', score: Math.max(0, score - 0.3), reasons };
  }
  // HIGH: exact header + unique + real box + (strip cells OR range OR eligible rear/internal view)
  const evidence =
    input.terminalRangeFound
    || input.strongCellPattern
    || (!!input.eligibleView && !!input.hasRealBox);
  if (input.headerExact && evidence && input.uniqueOnPage && input.hasRealBox !== false) {
    return { confidence: 'HIGH', score: Math.min(1, Math.max(score, 0.85)), reasons };
  }
  if (input.headerExact && score >= 0.45) {
    return { confidence: 'MEDIUM', score, reasons };
  }
  return { confidence: 'LOW', score: Math.max(0, score), reasons };
}
