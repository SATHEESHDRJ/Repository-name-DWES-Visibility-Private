import type { PanelDrawingRole, PanelModelDimension } from '../data/mock-store';

/**
 * Deterministic information extraction from drawing text + filenames.
 * Everything here reports provenance and confidence — values are only ever
 * 'extracted' when they came from the current panel's own files. Nothing is
 * invented; missing data stays null for the service to placeholder + flag.
 */

export interface ExtractedDimensions {
  width: PanelModelDimension;
  height: PanelModelDimension;
  depth: PanelModelDimension;
  notes: string[];
}

export interface ExtractedComponent {
  label: string;
  type: string;
}

const ROLE_PATTERNS: Array<{ role: PanelDrawingRole; re: RegExp }> = [
  { role: 'apparatus_list', re: /\b(apparatus\s*list|bill\s*of\s*materials?|b\.?o\.?m\.?|equipment\s*list|component\s*list|material\s*list)\b/i },
  { role: 'internal', re: /\b(internal\s*(arrangement|layout|view)|inside\s*view|component\s*layout|mounting\s*plate\s*layout)\b/i },
  { role: 'construction', re: /\b(construction\s*detail|fabrication|sheet\s*metal|enclosure\s*detail)\b/i },
  { role: 'schematic', re: /\b(schematic|circuit\s*diagram|wiring\s*diagram|single\s*line|elementary\s*diagram)\b/i },
  { role: 'section', re: /\b(section(al)?\s*(view|[a-z]-[a-z])|cross\s*section)\b/i },
  { role: 'front', re: /\bfront\s*(view|elevation)\b/i },
  { role: 'rear', re: /\b(rear|back)\s*(view|elevation)\b/i },
  { role: 'side', re: /\b(side|left|right)\s*(view|elevation)\b/i },
  { role: 'top', re: /\b(top|plan)\s*view\b/i },
  { role: 'revision', re: /\b(revision|rev\.?\s*(history|table))\b/i },
  { role: 'ga', re: /\b(general\s*arrangement|g\.?\s*a\.?\s*(drawing|dwg|view)?)\b/i },
];

/** Classify what a drawing file shows, from its filename and any extracted text. */
export function classifyDrawingRole(filename: string, text: string): PanelDrawingRole {
  const haystackName = filename.replace(/[_\-.]+/g, ' ');
  for (const { role, re } of ROLE_PATTERNS) {
    if (re.test(haystackName)) return role;
  }
  for (const { role, re } of ROLE_PATTERNS) {
    if (re.test(text)) return role;
  }
  return 'unknown';
}

/** Every distinct view/section detected across all of the panel's text. */
export function detectViews(text: string): PanelDrawingRole[] {
  const found = new Set<PanelDrawingRole>();
  for (const { role, re } of ROLE_PATTERNS) {
    if (re.test(text)) found.add(role);
  }
  return [...found];
}

const MM_RANGE = { width: [250, 4000], height: [400, 3200], depth: [150, 2500] } as const;

function plausible(kind: keyof typeof MM_RANGE, v: number): boolean {
  return v >= MM_RANGE[kind][0] && v <= MM_RANGE[kind][1];
}

function dim(value: number | null, source: PanelModelDimension['source'], confidence: number): PanelModelDimension {
  return { value_mm: value, source, confidence };
}

/**
 * Find enclosure dimensions in drawing text. Strategies, in confidence order:
 *  1. Labeled values:  W=800 / WIDTH: 800 / 800(W) / H 2200 ...
 *  2. Dimension triple: 800 x 2200 x 600 (interpreted W×H×D; second value
 *     is treated as height when it is the largest — the common convention).
 * Missing dimensions come back as null with confidence 0.
 */
export function extractDimensions(text: string, textQuality: number): ExtractedDimensions {
  const notes: string[] = [];
  const compact = text.replace(/[, ]/g, '');
  let width: number | null = null;
  let height: number | null = null;
  let depth: number | null = null;
  let wConf = 0; let hConf = 0; let dConf = 0;

  const labeled: Array<{ key: 'width' | 'height' | 'depth'; re: RegExp }> = [
    { key: 'width', re: /\b(?:W|WD|WIDTH)\s*[:=~]?\s*(\d{3,4})(?:\s*mm)?\b|\b(\d{3,4})\s*(?:mm)?\s*\(\s*W\s*\)/i },
    { key: 'height', re: /\b(?:H|HT|HEIGHT)\s*[:=~]?\s*(\d{3,4})(?:\s*mm)?\b|\b(\d{3,4})\s*(?:mm)?\s*\(\s*H\s*\)/i },
    { key: 'depth', re: /\b(?:D|DP|DEPTH)\s*[:=~]?\s*(\d{3,4})(?:\s*mm)?\b|\b(\d{3,4})\s*(?:mm)?\s*\(\s*D\s*\)/i },
  ];
  for (const { key, re } of labeled) {
    const m = compact.match(re);
    if (!m) continue;
    const v = parseInt(m[1] ?? m[2], 10);
    if (!plausible(key, v)) { notes.push(`Ignored implausible labeled ${key} ${v} mm.`); continue; }
    const conf = Math.min(0.9, 0.55 + 0.45 * textQuality);
    if (key === 'width') { width = v; wConf = conf; }
    if (key === 'height') { height = v; hConf = conf; }
    if (key === 'depth') { depth = v; dConf = conf; }
  }

  if (width === null || height === null || depth === null) {
    const tripleRe = /(\d{3,4})\s*[x×*]\s*(\d{3,4})\s*[x×*]\s*(\d{3,4})(?:\s*mm)?/gi;
    let m: RegExpExecArray | null;
    while ((m = tripleRe.exec(compact))) {
      const values = [parseInt(m[1], 10), parseInt(m[2], 10), parseInt(m[3], 10)];
      // W×H×D written order; if another value clearly dominates, treat it as height.
      let [w, h, d] = values;
      const max = Math.max(...values);
      if (h !== max && max >= 1600 && plausible('height', max)) {
        const rest = values.filter((_, i) => values.indexOf(max) !== i);
        h = max; [w, d] = rest.length === 2 ? [rest[0], rest[1]] : [w, d];
      }
      if (!plausible('width', w) || !plausible('height', h) || !plausible('depth', d)) continue;
      const conf = Math.min(0.75, 0.4 + 0.45 * textQuality);
      if (width === null) { width = w; wConf = conf; }
      if (height === null) { height = h; hConf = conf; }
      if (depth === null) { depth = d; dConf = conf; }
      notes.push(`Dimension triple "${m[0].trim()}" interpreted as W×H×D.`);
      break;
    }
  }

  if (width === null && height === null && depth === null && text.length > 0) {
    notes.push('No enclosure dimensions were found in the drawing text.');
  }

  return {
    width: dim(width, width === null ? 'placeholder' : 'extracted', wConf),
    height: dim(height, height === null ? 'placeholder' : 'extracted', hConf),
    depth: dim(depth, depth === null ? 'placeholder' : 'extracted', dConf),
    notes,
  };
}

/** Known equipment keywords → normalized component type. Order matters (first match wins). */
const COMPONENT_TYPES: Array<{ type: string; re: RegExp }> = [
  { type: 'protection_relay', re: /\b(protection\s*relay|relay|7S[AJLDK]\w*|REF6\d{2}|P[1-9]4[0-9]|MICOM|SEL-?\d{3})\b/i },
  { type: 'mcb', re: /\b(MCB|miniature\s*circuit\s*breaker)\b/i },
  { type: 'mccb', re: /\b(MCCB|molded\s*case)\b/i },
  { type: 'contactor', re: /\b(contactor)\b/i },
  { type: 'meter', re: /\b(multi\s*function\s*meter|energy\s*meter|ammeter|voltmeter|transducer)\b/i },
  { type: 'terminal_block', re: /\b(terminal\s*blocks?|TB\d*)\b/i },
  { type: 'ct_vt', re: /\b(current\s*transformer|voltage\s*transformer|\bCT\b|\bVT\b)\b/ },
  { type: 'aux_relay', re: /\b(auxiliary\s*relay|aux\.?\s*relay|tripping\s*relay|lockout|86\b|94\b)\b/i },
  { type: 'switch', re: /\b(selector\s*switch|control\s*switch|TNC\s*switch|isolator)\b/i },
  { type: 'lamp', re: /\b(indicating\s*lamp|indication\s*lamp|LED\s*lamp|pilot\s*lamp)\b/i },
  { type: 'push_button', re: /\b(push\s*buttons?)\b/i },
  { type: 'heater', re: /\b(space\s*heater|anti[- ]?condensation)\b/i },
  { type: 'thermostat', re: /\b(thermostat|hygrostat)\b/i },
  { type: 'power_supply', re: /\b(power\s*supply|SMPS|DC[- ]DC)\b/i },
  { type: 'fuse', re: /\b(fuse|fuse\s*holder)\b/i },
  { type: 'socket', re: /\b(socket|receptacle)\b/i },
  { type: 'timer', re: /\b(timer)\b/i },
];

const DEVICE_TAG_RE = /\b(\d{0,2}[A-Z]{1,4}\d{1,3}[A-Z0-9]{0,4})\b/g;

/**
 * Harvest component labels from apparatus-list style text. Two passes:
 *  1. Keyword rows (RELAY, MCB, HEATER …) anywhere in the text.
 *  2. Device designation tags (74R1, K3, X1, TB2 …) on apparatus-list lines only,
 *     to avoid swallowing dimension numbers or ferrule codes from other views.
 */
export function extractComponents(text: string): ExtractedComponent[] {
  if (!text) return [];
  const out = new Map<string, ExtractedComponent>();
  const lines = text.split(/\n+/);

  const listStart = lines.findIndex(l => /\b(apparatus\s*list|bill\s*of\s*material|equipment\s*list|component\s*list)\b/i.test(l));
  const listLines = listStart >= 0 ? lines.slice(listStart + 1, listStart + 60) : [];

  for (const line of lines) {
    for (const { type, re } of COMPONENT_TYPES) {
      const m = line.match(re);
      if (!m) continue;
      const label = m[0].trim().slice(0, 60);
      const key = `${type}:${label.toLowerCase()}`;
      if (!out.has(key)) out.set(key, { label, type });
    }
  }

  for (const line of listLines) {
    let m: RegExpExecArray | null;
    DEVICE_TAG_RE.lastIndex = 0;
    while ((m = DEVICE_TAG_RE.exec(line))) {
      const tag = m[1];
      if (/^\d+$/.test(tag) || tag.length < 2) continue;
      const key = `device:${tag.toLowerCase()}`;
      if (!out.has(key)) out.set(key, { label: tag, type: 'device' });
      if (out.size >= 60) break;
    }
    if (out.size >= 60) break;
  }

  return [...out.values()].slice(0, 60);
}

/** Overall extraction confidence for the audit record (0..1). */
export function overallConfidence(args: {
  textQuality: number;
  dims: ExtractedDimensions;
  componentCount: number;
  viewCount: number;
}): number {
  const dimScore = [args.dims.width, args.dims.height, args.dims.depth]
    .reduce((sum, d) => sum + (d.value_mm !== null ? d.confidence : 0), 0) / 3;
  const compScore = Math.min(1, args.componentCount / 8);
  const viewScore = Math.min(1, args.viewCount / 2);
  const raw = dimScore * 0.6 + compScore * 0.2 + viewScore * 0.2;
  return Math.round(raw * (0.4 + 0.6 * args.textQuality) * 100) / 100;
}
