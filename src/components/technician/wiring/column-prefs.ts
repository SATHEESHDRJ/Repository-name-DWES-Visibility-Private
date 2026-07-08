/** Column pin / filter preferences for wiring schedule display. */

export interface ColumnPrefs {
  /** Excel header names pinned to the cable work card. */
  pinned: string[];
  /** Excel header names hidden from the main grid (still in details drawer). */
  hidden: string[];
}

const STORAGE_PREFIX = 'dwes-wiring-cols-v1';

export const DEFAULT_PINNED_SYS_KEYS = [
  'sno', 'ferrule', 'ref', 'color', 'size', 'length', 'sign', 'remarks',
] as const;

/** Normalize header for fuzzy match (LENGTH (m) ↔ LENGTH(m)). */
export function normalizeHeader(h: string): string {
  return h.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

const COMMON_PINNED_PATTERNS = [
  'SERIALNUMBER', 'SNO', 'SERIALNO',
  'IECFERRA', 'IECFERRB', 'FERRULE', 'PNLNO',
  'REFERENCEA', 'REFRNCEA', 'REFERENCE', 'REF',
  'WIRECOLOR', 'COLOR', 'COLOUR',
  'WIRESIZE', 'SIZE',
  'SIGNMARK', 'SIGN',
  'REMARKS', 'REMARK',
  'LENGTHM', 'LENGTH',
];

export function defaultColumnPrefs(
  excelHeaders: string[],
  mapping: Record<string, string>,
): ColumnPrefs {
  const pinned: string[] = [];
  const add = (h: string) => {
    if (h && excelHeaders.includes(h) && !pinned.includes(h)) pinned.push(h);
  };

  for (const key of DEFAULT_PINNED_SYS_KEYS) {
    add(mapping[key] || '');
  }

  for (const h of excelHeaders) {
    const norm = normalizeHeader(h);
    if (COMMON_PINNED_PATTERNS.some(p => norm.includes(p) || p.includes(norm))) {
      add(h);
    }
  }

  return { pinned, hidden: [] };
}

export function loadColumnPrefs(
  frameId: string | undefined,
  excelHeaders: string[],
  mapping: Record<string, string>,
): ColumnPrefs {
  const defaults = defaultColumnPrefs(excelHeaders, mapping);
  if (!frameId) return defaults;
  try {
    const raw = localStorage.getItem(`${STORAGE_PREFIX}:${frameId}`);
    if (!raw) return defaults;
    const parsed = JSON.parse(raw) as Partial<ColumnPrefs>;
    const valid = new Set(excelHeaders);
    const pinned = (parsed.pinned || []).filter(h => valid.has(h));
    const hidden = (parsed.hidden || []).filter(h => valid.has(h));
    // Recover from prefs that hide every column (blank schedule grid).
    if (excelHeaders.length > 0 && hidden.length >= excelHeaders.length) {
      return defaults;
    }
    return {
      pinned: pinned.length ? pinned : defaults.pinned,
      hidden,
    };
  } catch {
    return defaults;
  }
}

export function saveColumnPrefs(frameId: string | undefined, prefs: ColumnPrefs): void {
  if (!frameId) return;
  try {
    localStorage.setItem(`${STORAGE_PREFIX}:${frameId}`, JSON.stringify(prefs));
  } catch { /* quota / private mode */ }
}

export function gridHeaders(excelHeaders: string[], prefs: ColumnPrefs): string[] {
  const hidden = new Set(prefs.hidden);
  return excelHeaders.filter(h => !hidden.has(h));
}

export function drawerHeaders(excelHeaders: string[], prefs: ColumnPrefs): string[] {
  const hidden = new Set(prefs.hidden);
  return excelHeaders.filter(h => hidden.has(h));
}
