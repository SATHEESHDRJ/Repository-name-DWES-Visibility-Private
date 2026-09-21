/**
 * DWES Engineering Geometry Package — validation (pure, no I/O).
 *
 * A "package" is the structured JSON the Chennai design team supplies per panel
 * (spec: docs/ENGINEERING-PACKAGE-SPEC.md). Validation runs BEFORE any database
 * write and again server-side on import — a package that fails here is never
 * persisted. Matching against the wiring schedule uses normalized references but
 * never strips engineering symbols (= + - : / .) from the stored values.
 */

export interface PackageDevice {
  device_tag: string;
  device_type?: string;
  manufacturer?: string;
  model?: string;
  x: number; y: number; z: number;
  width?: number; height?: number; depth?: number;
  rotation_x?: number; rotation_y?: number; rotation_z?: number;
  layer?: string;
  block_reference?: string;
  terminals: PackageTerminal[];
}

export interface PackageTerminal {
  terminal_number: string;
  terminal_block?: string;
  x: number; y: number; z: number;
  direction?: string;
  drawing_sheet?: string;
  drawing_element_reference?: string;
}

export interface PackageDuctNode {
  duct_identifier: string;
  x: number; y: number; z: number;
  node_type?: string;
}

export interface PackageDuctSegment {
  source: string;       // duct_identifier of the source node
  destination: string;  // duct_identifier of the destination node
  width?: number; height?: number; capacity?: number;
  direction?: 'bidirectional' | 'forward' | 'reverse';
  routing_restriction?: string;
}

export interface EngineeringPackage {
  package_type: 'dwes-engineering-package';
  spec_version: 1;
  project_code: string;
  frame_id: string;
  model_revision: string;
  units: 'mm';
  drawing_number?: string;
  drawing_revision?: string;
  panel: { width: number; height: number; depth: number };
  devices: PackageDevice[];
  duct_nodes?: PackageDuctNode[];
  duct_segments?: PackageDuctSegment[];
}

export interface PackageValidationIssue {
  level: 'error' | 'warning';
  code: string;
  message: string;
}

export interface ScheduleMatchReport {
  totalEnds: number;
  matchedEnds: number;
  unmatchedRefs: string[];
}

export interface PackageValidationResult {
  valid: boolean;
  issues: PackageValidationIssue[];
  deviceCount: number;
  terminalCount: number;
  ductNodeCount: number;
  ductSegmentCount: number;
  scheduleMatch?: ScheduleMatchReport;
}

/**
 * Matching normalization: uppercase, collapse internal whitespace, trim.
 * Engineering symbols (= + - : / .) are preserved — "=H001+K1:13" stays intact.
 */
export function normalizeRef(value: string | null | undefined): string {
  return String(value ?? '').trim().replace(/\s+/g, '').toUpperCase();
}

/** Canonical `DEVICE:TERMINAL` reference used for schedule ↔ geometry matching. */
export function terminalRef(deviceTag: string, terminalNumber: string): string {
  return `${normalizeRef(deviceTag)}:${normalizeRef(terminalNumber)}`;
}

const MAX_DIMENSION_MM = 20000;
const MAX_DEVICES = 2000;
const MAX_TERMINALS_PER_DEVICE = 500;

function isFiniteNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

/** Structural + geometric validation. Never throws — reports issues. */
export function validatePackage(pkg: unknown): PackageValidationResult {
  const issues: PackageValidationIssue[] = [];
  const err = (code: string, message: string) => issues.push({ level: 'error', code, message });
  const warn = (code: string, message: string) => issues.push({ level: 'warning', code, message });

  const p = pkg as Partial<EngineeringPackage> | null | undefined;
  if (!p || typeof p !== 'object') {
    err('PKG_NOT_OBJECT', 'Package must be a JSON object.');
    return { valid: false, issues, deviceCount: 0, terminalCount: 0, ductNodeCount: 0, ductSegmentCount: 0 };
  }
  if (p.package_type !== 'dwes-engineering-package') err('PKG_TYPE', 'package_type must be "dwes-engineering-package".');
  if (p.spec_version !== 1) err('PKG_SPEC', 'spec_version must be 1.');
  if (!p.project_code || typeof p.project_code !== 'string') err('PKG_PROJECT', 'project_code is required.');
  if (!p.frame_id || typeof p.frame_id !== 'string') err('PKG_FRAME', 'frame_id is required.');
  if (!p.model_revision || typeof p.model_revision !== 'string') err('PKG_REVISION', 'model_revision is required.');
  if (p.units !== 'mm') err('PKG_UNITS', 'units must be "mm" — no silent unit conversion is performed.');

  // Panel envelope
  const panel = p.panel;
  if (!panel || !isFiniteNumber(panel.width) || !isFiniteNumber(panel.height) || !isFiniteNumber(panel.depth)) {
    err('PANEL_DIMS', 'panel.width/height/depth are required numbers (mm).');
  } else {
    for (const [k, v] of Object.entries(panel)) {
      if (!isFiniteNumber(v) || v <= 0 || v > MAX_DIMENSION_MM) err('PANEL_RANGE', `panel.${k} out of range (0, ${MAX_DIMENSION_MM}] mm.`);
    }
  }

  // Devices + terminals
  const devices = Array.isArray(p.devices) ? p.devices : [];
  if (devices.length === 0) err('NO_DEVICES', 'At least one device is required.');
  if (devices.length > MAX_DEVICES) err('TOO_MANY_DEVICES', `More than ${MAX_DEVICES} devices.`);
  const seenTags = new Set<string>();
  let terminalCount = 0;
  devices.forEach((d, i) => {
    const where = `devices[${i}]`;
    if (!d || typeof d !== 'object') { err('DEVICE_SHAPE', `${where} is not an object.`); return; }
    const tag = normalizeRef(d.device_tag);
    if (!tag) err('DEVICE_TAG', `${where}: device_tag is required.`);
    else if (seenTags.has(tag)) err('DEVICE_DUP', `${where}: duplicate device_tag "${d.device_tag}".`);
    else seenTags.add(tag);
    for (const axis of ['x', 'y', 'z'] as const) {
      if (!isFiniteNumber(d[axis])) err('DEVICE_COORD', `${where}: ${axis} must be a finite number.`);
    }
    if (panel && isFiniteNumber(d.x) && isFiniteNumber(panel.width) && (d.x < 0 || d.x > panel.width)) {
      warn('DEVICE_OUTSIDE', `${where} ("${d.device_tag}"): x outside the panel envelope.`);
    }
    const terminals = Array.isArray(d.terminals) ? d.terminals : [];
    if (terminals.length > MAX_TERMINALS_PER_DEVICE) err('TOO_MANY_TERMINALS', `${where}: more than ${MAX_TERMINALS_PER_DEVICE} terminals.`);
    const seenTerms = new Set<string>();
    terminals.forEach((t, j) => {
      const twhere = `${where}.terminals[${j}]`;
      const tn = normalizeRef(t?.terminal_number);
      if (!tn) err('TERMINAL_NUMBER', `${twhere}: terminal_number is required.`);
      else if (seenTerms.has(tn)) err('TERMINAL_DUP', `${twhere}: duplicate terminal "${t.terminal_number}" on device "${d.device_tag}".`);
      else seenTerms.add(tn);
      for (const axis of ['x', 'y', 'z'] as const) {
        if (!isFiniteNumber(t?.[axis])) err('TERMINAL_COORD', `${twhere}: ${axis} must be a finite number.`);
      }
      terminalCount += 1;
    });
  });

  // Duct graph: identifiers unique, segments reference known nodes, graph connected
  const nodes = Array.isArray(p.duct_nodes) ? p.duct_nodes : [];
  const segments = Array.isArray(p.duct_segments) ? p.duct_segments : [];
  const nodeIds = new Set<string>();
  nodes.forEach((n, i) => {
    const id = normalizeRef(n?.duct_identifier);
    if (!id) err('DUCT_NODE_ID', `duct_nodes[${i}]: duct_identifier is required.`);
    else if (nodeIds.has(id)) err('DUCT_NODE_DUP', `duct_nodes[${i}]: duplicate duct_identifier "${n.duct_identifier}".`);
    else nodeIds.add(id);
    for (const axis of ['x', 'y', 'z'] as const) {
      if (!isFiniteNumber(n?.[axis])) err('DUCT_NODE_COORD', `duct_nodes[${i}]: ${axis} must be a finite number.`);
    }
  });
  if (segments.length > 0 && nodes.length === 0) err('DUCT_SEGMENTS_NO_NODES', 'duct_segments provided without duct_nodes.');
  const adjacency = new Map<string, string[]>();
  segments.forEach((s, i) => {
    const a = normalizeRef(s?.source);
    const b = normalizeRef(s?.destination);
    if (!nodeIds.has(a)) err('DUCT_SEG_SOURCE', `duct_segments[${i}]: unknown source node "${s?.source}".`);
    if (!nodeIds.has(b)) err('DUCT_SEG_DEST', `duct_segments[${i}]: unknown destination node "${s?.destination}".`);
    if (a && b && a === b) err('DUCT_SEG_LOOP', `duct_segments[${i}]: source and destination are the same node.`);
    if (nodeIds.has(a) && nodeIds.has(b)) {
      (adjacency.get(a) ?? adjacency.set(a, []).get(a)!).push(b);
      (adjacency.get(b) ?? adjacency.set(b, []).get(b)!).push(a);
    }
  });
  if (nodes.length > 0 && segments.length === 0) {
    warn('DUCT_NO_SEGMENTS', 'Duct nodes provided without segments — routing will not be possible.');
  }
  if (nodeIds.size > 1 && segments.length > 0) {
    // Connectivity: every node reachable from the first (undirected)
    const start = [...nodeIds][0];
    const seen = new Set([start]);
    const queue = [start];
    while (queue.length) {
      const cur = queue.shift()!;
      for (const nxt of adjacency.get(cur) ?? []) {
        if (!seen.has(nxt)) { seen.add(nxt); queue.push(nxt); }
      }
    }
    const unreachable = [...nodeIds].filter(id => !seen.has(id));
    if (unreachable.length > 0) {
      warn('DUCT_DISCONNECTED', `Duct graph is disconnected — unreachable nodes: ${unreachable.slice(0, 5).join(', ')}${unreachable.length > 5 ? '…' : ''}. Routes across disconnected ducts will not be generated.`);
    }
  }

  return {
    valid: !issues.some(i => i.level === 'error'),
    issues,
    deviceCount: devices.length,
    terminalCount,
    ductNodeCount: nodes.length,
    ductSegmentCount: segments.length,
  };
}

/**
 * Match the package's terminal references against the panel's wiring schedule.
 * Each schedule row has two ends (source, destination); an end matches when its
 * normalized `DEVICE:TERMINAL` exists in the package. Rows whose ends use only a
 * combined reference (e.g. "X1:4") match against the same canonical form.
 */
export function matchAgainstSchedule(
  pkg: EngineeringPackage,
  scheduleEnds: Array<{ device: string; terminal: string }>,
): ScheduleMatchReport {
  const available = new Set<string>();
  for (const d of pkg.devices ?? []) {
    for (const t of d.terminals ?? []) {
      available.add(terminalRef(d.device_tag, t.terminal_number));
    }
  }
  const unmatched: string[] = [];
  let matched = 0;
  for (const end of scheduleEnds) {
    const ref = terminalRef(end.device, end.terminal);
    if (available.has(ref)) matched += 1;
    else unmatched.push(ref);
  }
  return {
    totalEnds: scheduleEnds.length,
    matchedEnds: matched,
    unmatchedRefs: [...new Set(unmatched)].slice(0, 50),
  };
}
