export type ParsedTerminalRange =
  | { type: 'single'; value: string }
  | { type: 'numeric_range'; start: number; end: number }
  | { type: 'alpha_range'; prefix: string; start: number; end: number }
  | { type: 'named'; value: string };

function collapseSpaces(s: string) {
  return s.trim().replace(/\s+/g, ' ');
}

/**
 * Normalizes TB/terminal labels in a *safe* way:
 * - trims + collapses spaces
 * - uppercases
 * - removes internal spaces for tokens like "TB 3" -> "TB3"
 */
export function normalizeDeviceName(value: string): string {
  return value.trim().replace(/\s+/g, '').toUpperCase();
}

function normalizeTerminal(value: string): string {
  return value.trim().replace(/\s+/g, '').toUpperCase();
}

/**
 * Parses marker terminal group/range specs like:
 * - "5"
 * - "5-10"
 * - "5 to 10"
 * - "1..12"
 * - "A1-A8"
 * - "X1-8"
 * - otherwise treats as named group (exact string match only)
 */
export function parseTerminalRange(spec: string | null | undefined): ParsedTerminalRange {
  const raw = typeof spec === 'string' ? spec : '';
  const collapsed = collapseSpaces(raw);
  const s = normalizeTerminal(collapsed);

  if (!s) return { type: 'named', value: '' };

  // Separators: "-" / ".." / "TO"
  const sep = '(?:\\-|\\.{2}|TO)';

  const numericSingle = /^(\d+)$/;
  const numericRange = new RegExp(`^(\\d+)${sep}(\\d+)$`);
  const alphaRange = new RegExp(`^([A-Z]+)(\\d+)${sep}([A-Z]+)?(\\d+)$`);

  const ms = s.match(numericSingle);
  if (ms) return { type: 'single', value: String(Number(ms[1])) };

  const mr = s.match(numericRange);
  if (mr) {
    const start = Number(mr[1]);
    const end = Number(mr[2]);
    return { type: 'numeric_range', start: Math.min(start, end), end: Math.max(start, end) };
  }

  const mar = s.match(alphaRange);
  if (mar) {
    const prefix = mar[1];
    const start = Number(mar[2]);
    const endPrefix = mar[3] || prefix;
    const end = Number(mar[4]);
    if (normalizeDeviceName(endPrefix) !== normalizeDeviceName(prefix)) {
      // Cross-prefix ranges are ambiguous; keep safe exact match only.
      return { type: 'named', value: normalizeTerminal(collapsed) };
    }
    return { type: 'alpha_range', prefix, start: Math.min(start, end), end: Math.max(start, end) };
  }

  // If it's a single alpha token like "A1", treat as exact single match.
  const alphaSingle = /^([A-Z]+)(\d+)$/;
  const mas = s.match(alphaSingle);
  if (mas) {
    const prefix = mas[1];
    const n = Number(mas[2]);
    return { type: 'single', value: `${prefix}${n}` };
  }

  // Named group: safe fallback to exact match only.
  return { type: 'named', value: normalizeTerminal(collapsed) };
}

export function isTerminalInRange(
  terminal: string | null | undefined,
  range: ParsedTerminalRange | string,
): boolean {
  const raw = terminal == null ? '' : normalizeTerminal(String(terminal));
  if (!raw) return false;

  const parsed = typeof range === 'string' ? parseTerminalRange(range) : range;

  // Schedule terminals often include polarity suffixes: 1(-), 1(+), 3+.
  // Try the full token first, then a polarity-stripped numeric/alpha core.
  const candidates = [raw];
  const stripped = raw.replace(/\([+-]\)$/, '').replace(/(\d)[+-]$/, '$1');
  if (stripped && stripped !== raw) candidates.push(stripped);

  for (const t of candidates) {
    if (parsed.type === 'single' || parsed.type === 'named') {
      if (t === parsed.value) return true;
      continue;
    }

    if (parsed.type === 'numeric_range') {
      if (!/^\d+$/.test(t)) continue;
      const n = Number(t);
      if (n >= parsed.start && n <= parsed.end) return true;
      continue;
    }

    // alpha_range
    const m = t.match(/^([A-Z]+)(\d+)$/);
    if (!m) continue;
    const prefix = m[1];
    const n = Number(m[2]);
    if (
      normalizeDeviceName(prefix) === normalizeDeviceName(parsed.prefix)
      && n >= parsed.start
      && n <= parsed.end
    ) {
      return true;
    }
  }
  return false;
}

export function formatTerminalRange(spec: string | null | undefined): string {
  const parsed = parseTerminalRange(spec);
  if (parsed.type === 'single') return parsed.value;
  if (parsed.type === 'numeric_range') return `${parsed.start}-${parsed.end}`;
  if (parsed.type === 'alpha_range') return `${parsed.prefix}${parsed.start}-${parsed.prefix}${parsed.end}`;
  return parsed.value;
}

/**
 * Physical panel terminal-block headers (GA strip tags), not equipment/device tags.
 * ENOWA-style racks use X-series names (X1A-CT, X7, XD1, XTJ, XSH, XTA-1).
 * Relays/contactors (74IO, K01, QDC2, …) are equipment endpoints — never TB markers.
 */
const PHYSICAL_TB_NO_DIGIT = new Set(['XTJ', 'XSH']);

export function isPhysicalTbHeader(value: string | null | undefined): boolean {
  const n = normalizeDeviceName(String(value ?? ''));
  if (!n || n.length < 2) return false;
  if (PHYSICAL_TB_NO_DIGIT.has(n)) return true;
  // X + alnum/hyphen, must include at least one digit (X7, X1A-CT, XD2, XTA-1).
  return /^X[A-Z0-9-]*\d[A-Z0-9-]*$/.test(n);
}

export type PhysicalTbEnd = {
  tb: string;
  terminal: string;
  /** How the physical TB was derived from the schedule end. */
  from: 'header' | 'embedded_header' | 'embedded_terminal' | '';
};

export type LiveTbEndpointType = 'TB_GROUP' | 'DEVICE' | 'DEVICE_TERMINAL' | 'UNKNOWN';

export type LiveTbEndpointClassification = {
  endpointType: LiveTbEndpointType;
  equipmentTag: string | null;
  tbHeader: string | null;
  terminalReference: string;
  physicalLookupKey: string | null;
  /** Provenance when a physical TB was derived (empty for DEVICE / UNKNOWN). */
  from: PhysicalTbEnd['from'];
};

/** Display form for schedule terminal refs (X329:18 → X329/18). */
export function formatTerminalReference(terminal: string | null | undefined): string {
  const t = String(terminal ?? '').trim();
  if (!t) return '';
  return t.replace(/:/g, ' / ');
}

/**
 * Classify one schedule end before any GA Match / expected-header work.
 * Never promotes an embedded X* terminal ref to a TB lookup when DEV_TBLK is equipment.
 */
export function classifyLiveTbEndpoint(
  header: string | null | undefined,
  terminal: string | null | undefined,
): LiveTbEndpointClassification {
  const h = String(header ?? '').trim();
  const t = String(terminal ?? '').trim();
  const termRef = formatTerminalReference(t) || t;

  if (h && isPhysicalTbHeader(h)) {
    return {
      endpointType: 'TB_GROUP',
      equipmentTag: null,
      tbHeader: h,
      terminalReference: termRef,
      physicalLookupKey: h,
      from: 'header',
    };
  }

  // Non-TB schedule header = equipment/device. Terminal may look like X329:18 — that is
  // device terminal metadata, NOT a physical TB strip to locate.
  if (h) {
    return {
      endpointType: t ? 'DEVICE_TERMINAL' : 'DEVICE',
      equipmentTag: h,
      tbHeader: null,
      terminalReference: termRef,
      physicalLookupKey: h,
      from: '',
    };
  }

  // Header empty: allow TB derived from embedded TERM only (TB-only rows).
  const embeddedTerm = t.match(/^(X[A-Z0-9][-A-Z0-9]*):(.+)$/i);
  if (embeddedTerm && isPhysicalTbHeader(embeddedTerm[1])) {
    const tb = embeddedTerm[1];
    const termOnly = embeddedTerm[2].trim();
    return {
      endpointType: 'TB_GROUP',
      equipmentTag: null,
      tbHeader: tb,
      terminalReference: formatTerminalReference(termOnly) || termOnly,
      physicalLookupKey: tb,
      from: 'embedded_terminal',
    };
  }

  if (t && isPhysicalTbHeader(t)) {
    return {
      endpointType: 'TB_GROUP',
      equipmentTag: null,
      tbHeader: t,
      terminalReference: '',
      physicalLookupKey: t,
      from: 'header',
    };
  }

  return {
    endpointType: t ? 'UNKNOWN' : 'UNKNOWN',
    equipmentTag: null,
    tbHeader: null,
    terminalReference: termRef,
    physicalLookupKey: null,
    from: '',
  };
}

/**
 * Resolve one schedule end to a physical TB header + terminal for LIVE TB match.
 * Returns empty tb when the end is equipment/device (e.g. 87STUB / X329:18).
 * Does not promote embedded X* from TERM when a non-TB equipment header is present.
 */
export function resolvePhysicalTbEnd(
  header: string | null | undefined,
  terminal: string | null | undefined,
): PhysicalTbEnd {
  const c = classifyLiveTbEndpoint(header, terminal);
  if (c.endpointType === 'TB_GROUP' && c.tbHeader) {
    // Prefer raw terminal for Match when header was already physical TB.
    const h = String(header ?? '').trim();
    const t = String(terminal ?? '').trim();
    if (c.from === 'header' && isPhysicalTbHeader(h)) {
      return { tb: c.tbHeader, terminal: t, from: 'header' };
    }
    if (c.from === 'embedded_terminal') {
      const embeddedTerm = t.match(/^(X[A-Z0-9][-A-Z0-9]*):(.+)$/i);
      return {
        tb: c.tbHeader,
        terminal: embeddedTerm ? embeddedTerm[2].trim() : t,
        from: 'embedded_terminal',
      };
    }
    return { tb: c.tbHeader, terminal: t, from: c.from };
  }
  return { tb: '', terminal: '', from: '' };
}

