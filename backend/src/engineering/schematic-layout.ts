/**
 * Mode B — Automatic Excel Schematic layout (deterministic).
 *
 * Generates a 2D operational twin purely from wiring-schedule relationships.
 * Positions are schematic only — never claimed as physical drawing coordinates.
 * Identical input → identical layout (stable across refresh).
 */

export type TwinDrawingMode = 'GEOMETRY' | 'SCHEMATIC';

export interface SchematicCableInput {
  sno?: string | number;
  source_device?: string;
  source_terminal?: string;
  dest_device?: string;
  dest_terminal?: string;
  source?: string;
  destination?: string;
  color?: string;
  size?: string;
  ferrule?: string;
  ref?: string;
}

export interface TwinDeviceLayout {
  id: string;
  tag: string;
  normalizedTag: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  placed: boolean;
  matchConfidence: number;
  matchMethod: 'schematic-auto' | 'cad-exact' | 'cad-alias' | 'unplaced';
  side: 'source' | 'destination' | 'both';
}

export interface TwinTerminalLayout {
  id: string;
  deviceId: string;
  terminalNumber: string;
  x: number;
  y: number;
  direction: 'left' | 'right' | 'up' | 'down';
  placed: boolean;
}

export interface TwinDuctLane {
  id: string;
  points: Array<{ x: number; y: number }>;
  source: 'schematic-lane';
  approved: false;
}

export interface TwinWireRoute {
  wiringRowId: string;
  sno: string;
  sourceTwinTerminalId: string | null;
  destinationTwinTerminalId: string | null;
  /** Human-readable schedule endpoints for live twin labels (device:terminal). */
  sourceLabel?: string | null;
  destinationLabel?: string | null;
  points: Array<{ x: number; y: number }>;
  classification: 'approved-exact' | 'endpoint-guidance' | 'calculated-guidance' | 'route-not-mapped';
  color?: string;
}

export interface TwinPanelLayout {
  panelId: string;
  drawingMode: TwinDrawingMode;
  drawingRevision: string | null;
  scheduleRevision: string;
  generationVersion: number;
  width: number;
  height: number;
  devices: TwinDeviceLayout[];
  terminals: TwinTerminalLayout[];
  ductSegments: TwinDuctLane[];
  wires: TwinWireRoute[];
  diagnostics: {
    deviceCount: number;
    terminalCount: number;
    wireCount: number;
    unplacedDevices: string[];
    note: string;
  };
}

/** Bump when schematic ID/layout algorithm changes so TwinLayoutStore regenerates cache. */
export const SCHEMATIC_GENERATION_VERSION = 3;

function formatEndpointLabel(ep: { tag: string; terminal: string } | null): string | null {
  if (!ep?.tag) return null;
  const term = String(ep.terminal ?? '').trim();
  return term ? `${ep.tag}:${term}` : ep.tag;
}

const DEVICE_W = 120;
const DEVICE_H = 56;
const TERM_R = 6;
const COL_GAP = 280;
const ROW_GAP = 88;
const MARGIN_X = 48;
const MARGIN_Y = 48;
const LANE_X = MARGIN_X + DEVICE_W + 80;

/** Preserve engineering symbols (= + - / : .) — only trim + collapse whitespace + case-fold for matching. */
export function normalizeEngineeringTag(raw?: string | null): string {
  return String(raw ?? '')
    .trim()
    .replace(/\s+/g, ' ')
    .toUpperCase();
}

export function splitEndpoint(
  device?: string,
  terminal?: string,
  combined?: string,
): { tag: string; terminal: string } | null {
  const d = String(device ?? '').trim();
  const t = String(terminal ?? '').trim();
  if (d && t) return { tag: d, terminal: t };
  const combo = String(combined ?? '').trim();
  if (!combo) return null;
  const idx = combo.lastIndexOf(':');
  if (idx > 0) {
    return { tag: combo.slice(0, idx).trim(), terminal: combo.slice(idx + 1).trim() };
  }
  return { tag: combo, terminal: '' };
}

function stableHash(input: string): string {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(16);
}

/**
 * Build a deterministic schematic TwinPanelLayout from Excel wiring rows.
 * Source-oriented devices on the left; destination-oriented on the right;
 * terminals beside parents; wires through a shared vertical lane column.
 */
export function generateSchematicLayout(
  panelId: string,
  cables: SchematicCableInput[],
  opts?: {
    scheduleRevision?: string;
    drawingRevision?: string | null;
  },
): TwinPanelLayout {
  const scheduleRevision = opts?.scheduleRevision ?? `sched-${stableHash(JSON.stringify(cables.map(c => c.sno)))}`;
  const deviceStats = new Map<string, {
    tag: string;
    asSource: number;
    asDest: number;
    terminals: Set<string>;
  }>();

  const ends: Array<{
    sno: string;
    src: { tag: string; terminal: string } | null;
    dst: { tag: string; terminal: string } | null;
    color?: string;
  }> = [];

  for (const cable of cables) {
    const sno = String(cable.sno ?? '').trim() || String(ends.length + 1);
    const src = splitEndpoint(cable.source_device, cable.source_terminal, cable.source);
    const dst = splitEndpoint(cable.dest_device, cable.dest_terminal, cable.destination);
    ends.push({ sno, src, dst, color: cable.color });

    const touch = (ep: { tag: string; terminal: string } | null, role: 'src' | 'dst') => {
      if (!ep?.tag) return;
      const key = normalizeEngineeringTag(ep.tag);
      if (!key) return;
      let st = deviceStats.get(key);
      if (!st) {
        st = { tag: ep.tag.trim(), asSource: 0, asDest: 0, terminals: new Set() };
        deviceStats.set(key, st);
      }
      if (role === 'src') st.asSource += 1;
      else st.asDest += 1;
      // Store normalized terminal labels so "2" / "02" do not create colliding slots.
      if (ep.terminal) {
        const termKey = normalizeEngineeringTag(ep.terminal) || ep.terminal.trim();
        if (termKey) st.terminals.add(termKey);
      }
    };
    touch(src, 'src');
    touch(dst, 'dst');
  }

  const sourceKeys: string[] = [];
  const destKeys: string[] = [];
  const bothKeys: string[] = [];
  for (const [key, st] of [...deviceStats.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    if (st.asSource > 0 && st.asDest > 0) bothKeys.push(key);
    else if (st.asSource >= st.asDest) sourceKeys.push(key);
    else destKeys.push(key);
  }
  // Devices used on both sides sit with sources (left) for a stable left→right flow.
  const leftKeys = [...sourceKeys, ...bothKeys].sort((a, b) => a.localeCompare(b));
  const rightKeys = destKeys.sort((a, b) => a.localeCompare(b));

  const devices: TwinDeviceLayout[] = [];
  const terminals: TwinTerminalLayout[] = [];
  const devicePos = new Map<string, TwinDeviceLayout>();

  const placeColumn = (keys: string[], side: 'source' | 'destination', colX: number) => {
    keys.forEach((key, i) => {
      const st = deviceStats.get(key)!;
      const y = MARGIN_Y + i * ROW_GAP;
      const id = `dev:${key}`;
      const device: TwinDeviceLayout = {
        id,
        tag: st.tag,
        normalizedTag: key,
        x: colX,
        y,
        width: DEVICE_W,
        height: DEVICE_H,
        rotation: 0,
        placed: true,
        matchConfidence: 1,
        matchMethod: 'schematic-auto',
        side: side === 'source' && bothKeys.includes(key) ? 'both' : side,
      };
      devices.push(device);
      devicePos.set(key, device);

      const termList = [...st.terminals].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
      const termCount = Math.max(1, termList.length);
      // Source column: terminals on the right edge (toward the lane).
      // Destination column: terminals on the left edge (toward the lane).
      const onRightEdge = side === 'source';
      termList.forEach((term, ti) => {
        const ty = y + DEVICE_H * ((ti + 1) / (termCount + 1));
        const tx = onRightEdge ? colX + DEVICE_W + TERM_R + 2 : colX - TERM_R - 2;
        // Use "::" between device key and terminal so nested tags like 87BB:X102 + "2"
        // cannot collide with parent 87BB + "X102:2" (both previously became term:87BB:X102:2).
        terminals.push({
          id: `term:${key}::${term}`,
          deviceId: id,
          terminalNumber: term,
          x: tx,
          y: ty,
          direction: onRightEdge ? 'right' : 'left',
          placed: true,
        });
      });
      // Ensure at least a default terminal slot when schedule has device-only refs.
      if (termList.length === 0) {
        terminals.push({
          id: `term:${key}::`,
          deviceId: id,
          terminalNumber: '',
          x: onRightEdge ? colX + DEVICE_W + TERM_R + 2 : colX - TERM_R - 2,
          y: y + DEVICE_H / 2,
          direction: onRightEdge ? 'right' : 'left',
          placed: true,
        });
      }
    });
  };

  const leftX = MARGIN_X;
  const rightX = MARGIN_X + COL_GAP + DEVICE_W;
  placeColumn(leftKeys, 'source', leftX);
  placeColumn(rightKeys, 'destination', rightX);

  const termByKey = new Map(terminals.map(t => {
    const dev = devices.find(d => d.id === t.deviceId);
    return [`${dev?.normalizedTag ?? ''}|${normalizeEngineeringTag(t.terminalNumber)}`, t] as const;
  }));

  const wires: TwinWireRoute[] = [];
  let laneSlot = 0;
  for (const end of ends) {
    const srcKey = end.src ? normalizeEngineeringTag(end.src.tag) : '';
    const dstKey = end.dst ? normalizeEngineeringTag(end.dst.tag) : '';
    const srcTerm = end.src
      ? termByKey.get(`${srcKey}|${normalizeEngineeringTag(end.src.terminal)}`)
        ?? termByKey.get(`${srcKey}|`)
      : null;
    const dstTerm = end.dst
      ? termByKey.get(`${dstKey}|${normalizeEngineeringTag(end.dst.terminal)}`)
        ?? termByKey.get(`${dstKey}|`)
      : null;

    if (!srcTerm || !dstTerm) {
      wires.push({
        wiringRowId: `${panelId}#${end.sno}`,
        sno: end.sno,
        sourceTwinTerminalId: srcTerm?.id ?? null,
        destinationTwinTerminalId: dstTerm?.id ?? null,
        sourceLabel: formatEndpointLabel(end.src),
        destinationLabel: formatEndpointLabel(end.dst),
        points: [],
        classification: 'route-not-mapped',
        color: end.color,
      });
      continue;
    }

    const midY = srcTerm.y + ((dstTerm.y - srcTerm.y) * 0.5);
    const laneX = LANE_X + (laneSlot % 6) * 10;
    laneSlot += 1;
    const points = [
      { x: srcTerm.x, y: srcTerm.y },
      { x: laneX, y: srcTerm.y },
      { x: laneX, y: midY },
      { x: laneX, y: dstTerm.y },
      { x: dstTerm.x, y: dstTerm.y },
    ];
    wires.push({
      wiringRowId: `${panelId}#${end.sno}`,
      sno: end.sno,
      sourceTwinTerminalId: srcTerm.id,
      destinationTwinTerminalId: dstTerm.id,
      sourceLabel: formatEndpointLabel(end.src),
      destinationLabel: formatEndpointLabel(end.dst),
      points,
      // Orthogonal lane routing is deterministic guidance through schematic lanes —
      // never an approved exact physical route.
      classification: 'calculated-guidance',
      color: end.color,
    });
  }

  const maxY = Math.max(
    MARGIN_Y + Math.max(leftKeys.length, rightKeys.length, 1) * ROW_GAP,
    ...devices.map(d => d.y + d.height),
    ...terminals.map(t => t.y),
  );
  const width = rightX + DEVICE_W + MARGIN_X;
  const height = maxY + MARGIN_Y;

  const ductSegments: TwinDuctLane[] = [{
    id: 'lane:main',
    points: [
      { x: LANE_X, y: MARGIN_Y / 2 },
      { x: LANE_X, y: height - MARGIN_Y / 2 },
    ],
    source: 'schematic-lane',
    approved: false,
  }];

  return {
    panelId,
    drawingMode: 'SCHEMATIC',
    drawingRevision: opts?.drawingRevision ?? null,
    scheduleRevision,
    generationVersion: SCHEMATIC_GENERATION_VERSION,
    width,
    height,
    devices,
    terminals,
    ductSegments,
    wires,
    diagnostics: {
      deviceCount: devices.length,
      terminalCount: terminals.length,
      wireCount: wires.length,
      unplacedDevices: [],
      note: 'Automatic Excel schematic — positions are relational, not physical drawing coordinates.',
    },
  };
}
