export type ParsedTerminalRange =
  | { type: 'single'; value: string }
  | { type: 'numeric_range'; start: number; end: number }
  | { type: 'alpha_range'; prefix: string; start: number; end: number }
  | { type: 'named'; value: string };

function collapseSpaces(s: string) {
  return s.trim().replace(/\s+/g, ' ');
}

/**
 * Normalizes TB/terminal labels in a safe way:
 * - trims + collapses spaces
 * - uppercases
 * - removes internal spaces ("TB 3" -> "TB3")
 */
export function normalizeDeviceName(value: string): string {
  return value.trim().replace(/\s+/g, '').toUpperCase();
}

function normalizeTerminal(value: string): string {
  return value.trim().replace(/\s+/g, '').toUpperCase();
}

/**
 * Parses marker terminal group/range specs:
 * - "5"
 * - "5-10"
 * - "5 to 10"
 * - "1..12"
 * - "A1-A8"
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
      return { type: 'named', value: normalizeTerminal(collapsed) };
    }
    return { type: 'alpha_range', prefix, start: Math.min(start, end), end: Math.max(start, end) };
  }

  // Alpha single like "A1"
  const alphaSingle = /^([A-Z]+)(\d+)$/;
  const mas = s.match(alphaSingle);
  if (mas) {
    const prefix = mas[1];
    const n = Number(mas[2]);
    return { type: 'single', value: `${prefix}${n}` };
  }

  return { type: 'named', value: normalizeTerminal(collapsed) };
}

export function isTerminalInRange(
  terminal: string | null | undefined,
  range: ParsedTerminalRange | string,
): boolean {
  const t = terminal == null ? '' : normalizeTerminal(String(terminal));
  if (!t) return false;

  const parsed = typeof range === 'string' ? parseTerminalRange(range) : range;

  if (parsed.type === 'single' || parsed.type === 'named') return t === parsed.value;

  if (parsed.type === 'numeric_range') {
    if (!/^\d+$/.test(t)) return false;
    const n = Number(t);
    return n >= parsed.start && n <= parsed.end;
  }

  // alpha_range
  const m = t.match(/^([A-Z]+)(\d+)$/);
  if (!m) return false;
  const prefix = m[1];
  const n = Number(m[2]);
  return normalizeDeviceName(prefix) === normalizeDeviceName(parsed.prefix)
    && n >= parsed.start
    && n <= parsed.end;
}

export function formatTerminalRange(spec: string | null | undefined): string {
  const parsed = parseTerminalRange(spec);
  if (parsed.type === 'single') return parsed.value;
  if (parsed.type === 'numeric_range') return `${parsed.start}-${parsed.end}`;
  if (parsed.type === 'alpha_range') return `${parsed.prefix}${parsed.start}-${parsed.prefix}${parsed.end}`;
  return parsed.value;
}

