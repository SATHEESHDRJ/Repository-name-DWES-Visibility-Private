import type { PanelModelDimension, PanelModelSpec } from '../data/mock-store';

/**
 * Deterministic parametric GLB generator (glTF 2.0 binary, no dependencies).
 *
 * The geometry is a schematic engineering representation built ONLY from the
 * panel's own spec: enclosure shell, door(s), mounting plate, gland plate,
 * base frame, wire troughs, terminal rows and component blocks. Any part whose
 * driving value is a placeholder is rendered in the translucent amber
 * "verification required" material and flagged in node extras — the model
 * never silently pretends to know a dimension or a position.
 *
 * Units: spec values are mm; glTF output is metres (+Y up, front face +Z).
 */

interface Part {
  name: string;
  part: string;
  /** centre, metres */ cx: number; cy: number; cz: number;
  /** full size, metres */ sx: number; sy: number; sz: number;
  material: number;
  placeholder: boolean;
  label?: string;
}

const MATERIALS = [
  { name: 'enclosure', baseColorFactor: [0.85, 0.85, 0.83, 1], metallicFactor: 0.35, roughnessFactor: 0.6 },
  { name: 'door', baseColorFactor: [0.80, 0.80, 0.78, 1], metallicFactor: 0.35, roughnessFactor: 0.55 },
  { name: 'mounting-plate', baseColorFactor: [0.72, 0.75, 0.78, 1], metallicFactor: 0.6, roughnessFactor: 0.45 },
  { name: 'base-frame', baseColorFactor: [0.23, 0.25, 0.27, 1], metallicFactor: 0.4, roughnessFactor: 0.7 },
  { name: 'trough', baseColorFactor: [0.42, 0.45, 0.50, 1], metallicFactor: 0.1, roughnessFactor: 0.8 },
  { name: 'terminal', baseColorFactor: [0.85, 0.77, 0.54, 1], metallicFactor: 0.05, roughnessFactor: 0.85 },
  { name: 'component', baseColorFactor: [0.22, 0.25, 0.31, 1], metallicFactor: 0.2, roughnessFactor: 0.65 },
  { name: 'handle', baseColorFactor: [0.16, 0.18, 0.20, 1], metallicFactor: 0.7, roughnessFactor: 0.35 },
  { name: 'placeholder', baseColorFactor: [0.96, 0.62, 0.04, 0.55], metallicFactor: 0.0, roughnessFactor: 0.9 },
] as const;

const MAT = Object.fromEntries(MATERIALS.map((m, i) => [m.name, i])) as Record<(typeof MATERIALS)[number]['name'], number>;

/** Component footprint by normalized type (mm): [width, height, depth-off-plate]. */
const COMPONENT_SIZES: Record<string, [number, number, number]> = {
  protection_relay: [220, 180, 150],
  aux_relay: [90, 100, 110],
  mcb: [72, 90, 75],
  mccb: [140, 160, 100],
  contactor: [55, 85, 95],
  meter: [96, 96, 70],
  ct_vt: [110, 110, 110],
  switch: [70, 70, 80],
  lamp: [30, 30, 55],
  push_button: [30, 30, 55],
  heater: [180, 60, 60],
  thermostat: [55, 70, 45],
  power_supply: [120, 125, 120],
  fuse: [30, 80, 65],
  socket: [80, 80, 55],
  timer: [55, 75, 70],
  terminal_block: [120, 60, 60],
  device: [100, 90, 90],
};

const mm = (v: number) => v / 1000;

export interface GlbBuildResult {
  glb: Buffer;
  placeholders: string[];
  partCount: number;
}

function requiredEnclosureDimension(dimension: PanelModelDimension, label: string): number {
  if (
    dimension.value_mm === null
    || !Number.isFinite(dimension.value_mm)
    || dimension.value_mm <= 0
    || dimension.source === 'placeholder'
  ) {
    throw new Error(`Cannot generate a panel GLB without a valid enclosure ${label}`);
  }
  return dimension.value_mm;
}

export function buildPanelGlb(spec: PanelModelSpec, panelName: string): GlbBuildResult {
  const placeholders: string[] = [];
  const flag = (label: string) => { if (!placeholders.includes(label)) placeholders.push(label); };

  // Enclosure geometry is never guessed. The service requires all three axes
  // from this panel's drawing or a supervisor-verified manual specification;
  // this guard prevents any other caller from accidentally generating a model
  // with hidden sample dimensions.
  const W = requiredEnclosureDimension(spec.enclosure.width, 'width');
  const H = requiredEnclosureDimension(spec.enclosure.height, 'height');
  const D = requiredEnclosureDimension(spec.enclosure.depth, 'depth');
  const shellPh = false;

  const t = 25; // schematic sheet thickness, mm (visual only)
  const parts: Part[] = [];
  const w = mm(W); const h = mm(H); const d = mm(D); const th = mm(t);

  // Base frame (bottom of everything).
  const baseH = spec.base_frame.present ? mm(Math.max(50, Math.min(spec.base_frame.height_mm || 100, 400))) : 0;
  if (spec.base_frame.present) {
    const ph = spec.base_frame.source === 'placeholder';
    if (ph) flag('Base frame (assumed 100 mm)');
    parts.push({
      name: 'Base frame', part: 'base_frame',
      cx: 0, cy: baseH / 2, cz: 0, sx: w, sy: baseH, sz: d,
      material: ph ? MAT.placeholder : MAT['base-frame'], placeholder: ph,
    });
  }
  const y0 = baseH; // enclosure floor

  const shellMat = shellPh ? MAT.placeholder : MAT.enclosure;
  // Rear, sides, top, bottom.
  parts.push(
    { name: 'Rear panel', part: 'enclosure', cx: 0, cy: y0 + h / 2, cz: -d / 2 + th / 2, sx: w, sy: h, sz: th, material: shellMat, placeholder: shellPh },
    { name: 'Left side panel', part: 'enclosure', cx: -w / 2 + th / 2, cy: y0 + h / 2, cz: 0, sx: th, sy: h, sz: d, material: shellMat, placeholder: shellPh },
    { name: 'Right side panel', part: 'enclosure', cx: w / 2 - th / 2, cy: y0 + h / 2, cz: 0, sx: th, sy: h, sz: d, material: shellMat, placeholder: shellPh },
    { name: 'Roof panel', part: 'enclosure', cx: 0, cy: y0 + h - th / 2, cz: 0, sx: w, sy: th, sz: d, material: shellMat, placeholder: shellPh },
  );

  // Bottom: gland plate replaces the middle of the floor when present.
  if (spec.gland_plate.present) {
    const ph = spec.gland_plate.source === 'placeholder';
    if (ph) flag('Gland plate (not confirmed in drawing)');
    const gw = w * 0.6; const gd = d * 0.5;
    parts.push(
      { name: 'Floor panel', part: 'enclosure', cx: 0, cy: y0 + th / 2, cz: d / 4 + gd / 4, sx: w, sy: th, sz: d - gd, material: shellMat, placeholder: shellPh },
      { name: 'Gland plate', part: 'gland_plate', cx: 0, cy: y0 + th / 2, cz: -d / 2 + gd / 2, sx: gw, sy: th, sz: gd, material: ph ? MAT.placeholder : MAT['mounting-plate'], placeholder: ph },
    );
  } else {
    parts.push({ name: 'Floor panel', part: 'enclosure', cx: 0, cy: y0 + th / 2, cz: 0, sx: w, sy: th, sz: d, material: shellMat, placeholder: shellPh });
  }

  // Front door(s), slightly proud of the shell, with handles.
  const doorCount = Math.max(1, Math.min(spec.doors.count || 1, 4));
  const doorPh = spec.doors.source === 'placeholder';
  if (doorPh) flag('Door arrangement (assumed single door)');
  const gap = mm(12);
  const doorW = (w - gap * (doorCount + 1)) / doorCount;
  for (let i = 0; i < doorCount; i++) {
    const cx = -w / 2 + gap * (i + 1) + doorW * (i + 0.5);
    parts.push({
      name: doorCount === 1 ? 'Front door' : `Front door ${i + 1}`, part: 'door',
      cx, cy: y0 + h / 2, cz: d / 2 + th / 2, sx: doorW, sy: h - gap * 2, sz: th,
      material: doorPh ? MAT.placeholder : MAT.door, placeholder: doorPh,
    });
    const hingeRight = i % 2 === 0;
    parts.push({
      name: `Door handle ${i + 1}`, part: 'handle',
      cx: cx + (hingeRight ? 1 : -1) * (doorW / 2 - mm(45)), cy: y0 + h / 2, cz: d / 2 + th + mm(18),
      sx: mm(28), sy: mm(160), sz: mm(30), material: MAT.handle, placeholder: false,
    });
  }

  // Mounting plate + everything on it.
  const plateZ = -d / 2 + th + mm(60);
  if (spec.mounting_plate.present) {
    const ph = spec.mounting_plate.source === 'placeholder';
    if (ph) flag('Mounting plate (not confirmed in drawing)');
    parts.push({
      name: 'Mounting plate', part: 'mounting_plate',
      cx: 0, cy: y0 + h / 2, cz: plateZ, sx: w - mm(120), sy: h - mm(200), sz: mm(4),
      material: ph ? MAT.placeholder : MAT['mounting-plate'], placeholder: ph,
    });
  }

  const plateW = w - mm(160);
  const plateTop = y0 + h - mm(160);
  const plateBottom = y0 + mm(160);

  // Vertical wire troughs across the plate width.
  const troughs = Math.max(0, Math.min(spec.wire_troughs.count, 6));
  const troughPh = spec.wire_troughs.source === 'placeholder';
  if (troughs > 0 && troughPh) flag('Wire trough layout (assumed)');
  for (let i = 0; i < troughs; i++) {
    const cx = troughs === 1 ? 0 : -plateW / 2 + (plateW / (troughs - 1)) * i;
    parts.push({
      name: `Wire trough ${i + 1}`, part: 'wire_trough',
      cx, cy: (plateTop + plateBottom) / 2, cz: plateZ + mm(40),
      sx: mm(60), sy: plateTop - plateBottom, sz: mm(70),
      material: troughPh ? MAT.placeholder : MAT.trough, placeholder: troughPh,
    });
  }

  // Terminal rows near the bottom of the plate.
  const rows = Math.max(0, Math.min(spec.terminal_rows.count, 5));
  const rowPh = spec.terminal_rows.source === 'placeholder';
  if (rows > 0 && rowPh) flag('Terminal row layout (assumed)');
  for (let i = 0; i < rows; i++) {
    parts.push({
      name: `Terminal row ${i + 1}`, part: 'terminal_row',
      cx: 0, cy: plateBottom + mm(70) + mm(95) * i, cz: plateZ + mm(45),
      sx: plateW * 0.72, sy: mm(60), sz: mm(70),
      material: rowPh ? MAT.placeholder : MAT.terminal, placeholder: rowPh,
    });
  }

  // Component blocks laid out in a grid on the plate. Positions are placeholders
  // by definition (text extraction cannot locate equipment) unless set manually.
  const compTop = plateTop - mm(40);
  const compBottom = plateBottom + mm(90) + mm(95) * rows;
  const cellW = mm(250); const cellH = mm(230);
  const cols = Math.max(1, Math.floor(plateW / cellW));
  spec.components.forEach((component, index) => {
    const [cwMm, chMm, cdMm] = COMPONENT_SIZES[component.type] ?? COMPONENT_SIZES.device;
    const col = index % cols;
    const row = Math.floor(index / cols);
    const cx = -plateW / 2 + cellW * (col + 0.5);
    const cy = compTop - cellH * (row + 0.5);
    if (cy - mm(chMm) / 2 < compBottom) return; // plate is full — remaining items stay list-only
    const ph = component.position === 'placeholder';
    if (ph) flag(`Position of ${component.label}`);
    parts.push({
      name: component.label, part: `component:${component.type}`, label: component.label,
      cx, cy, cz: plateZ + mm(cdMm) / 2 + mm(4),
      sx: mm(cwMm), sy: mm(chMm), sz: mm(cdMm),
      material: ph ? MAT.placeholder : MAT.component, placeholder: ph,
    });
  });

  return { glb: assembleGlb(parts, panelName), placeholders, partCount: parts.length };
}

// ─── glTF 2.0 binary assembly ─────────────────────────────────────────────────

const FACES: Array<{ n: [number, number, number]; corners: Array<[number, number, number]> }> = [
  { n: [1, 0, 0], corners: [[1, -1, -1], [1, 1, -1], [1, 1, 1], [1, -1, 1]] },
  { n: [-1, 0, 0], corners: [[-1, -1, 1], [-1, 1, 1], [-1, 1, -1], [-1, -1, -1]] },
  { n: [0, 1, 0], corners: [[-1, 1, -1], [-1, 1, 1], [1, 1, 1], [1, 1, -1]] },
  { n: [0, -1, 0], corners: [[-1, -1, 1], [-1, -1, -1], [1, -1, -1], [1, -1, 1]] },
  { n: [0, 0, 1], corners: [[-1, -1, 1], [1, -1, 1], [1, 1, 1], [-1, 1, 1]] },
  { n: [0, 0, -1], corners: [[1, -1, -1], [-1, -1, -1], [-1, 1, -1], [1, 1, -1]] },
];

function assembleGlb(parts: Part[], sceneName: string): Buffer {
  const binChunks: Buffer[] = [];
  let binOffset = 0;
  const bufferViews: unknown[] = [];
  const accessors: unknown[] = [];
  const meshes: unknown[] = [];
  const nodes: unknown[] = [];

  const pushView = (data: Buffer, target: number): number => {
    const pad = (4 - (binOffset % 4)) % 4;
    if (pad) { binChunks.push(Buffer.alloc(pad)); binOffset += pad; }
    bufferViews.push({ buffer: 0, byteOffset: binOffset, byteLength: data.length, target });
    binChunks.push(data);
    binOffset += data.length;
    return bufferViews.length - 1;
  };

  for (const part of parts) {
    const hx = part.sx / 2; const hy = part.sy / 2; const hz = part.sz / 2;
    const positions = new Float32Array(24 * 3);
    const normals = new Float32Array(24 * 3);
    const indices = new Uint16Array(36);
    let v = 0;
    FACES.forEach((face, f) => {
      face.corners.forEach(corner => {
        positions[v * 3] = part.cx + corner[0] * hx;
        positions[v * 3 + 1] = part.cy + corner[1] * hy;
        positions[v * 3 + 2] = part.cz + corner[2] * hz;
        normals[v * 3] = face.n[0];
        normals[v * 3 + 1] = face.n[1];
        normals[v * 3 + 2] = face.n[2];
        v++;
      });
      const base = f * 4;
      indices.set([base, base + 1, base + 2, base, base + 2, base + 3], f * 6);
    });

    const posView = pushView(Buffer.from(positions.buffer.slice(0)), 34962);
    const nrmView = pushView(Buffer.from(normals.buffer.slice(0)), 34962);
    const idxView = pushView(Buffer.from(indices.buffer.slice(0)), 34963);

    const min = [part.cx - hx, part.cy - hy, part.cz - hz];
    const max = [part.cx + hx, part.cy + hy, part.cz + hz];
    const posAccessor = accessors.push({ bufferView: posView, componentType: 5126, count: 24, type: 'VEC3', min, max }) - 1;
    const nrmAccessor = accessors.push({ bufferView: nrmView, componentType: 5126, count: 24, type: 'VEC3' }) - 1;
    const idxAccessor = accessors.push({ bufferView: idxView, componentType: 5123, count: 36, type: 'SCALAR' }) - 1;

    const mesh = meshes.push({
      name: part.name,
      primitives: [{ attributes: { POSITION: posAccessor, NORMAL: nrmAccessor }, indices: idxAccessor, material: part.material }],
    }) - 1;
    nodes.push({
      name: part.name,
      mesh,
      extras: { dwes_part: part.part, placeholder: part.placeholder, ...(part.label ? { label: part.label } : {}) },
    });
  }

  const gltf = {
    asset: { version: '2.0', generator: 'DWES panel-model generator' },
    scene: 0,
    scenes: [{ name: sceneName, nodes: nodes.map((_, i) => i) }],
    nodes,
    meshes,
    materials: MATERIALS.map(m => ({
      name: m.name,
      pbrMetallicRoughness: {
        baseColorFactor: [...m.baseColorFactor],
        metallicFactor: m.metallicFactor,
        roughnessFactor: m.roughnessFactor,
      },
      ...(m.baseColorFactor[3] < 1 ? { alphaMode: 'BLEND', doubleSided: true } : {}),
    })),
    bufferViews,
    accessors,
    buffers: [{ byteLength: binOffset }],
  };

  const bin = Buffer.concat(binChunks, binOffset);
  const binPadded = bin.length % 4 ? Buffer.concat([bin, Buffer.alloc(4 - (bin.length % 4))]) : bin;
  let json = Buffer.from(JSON.stringify(gltf), 'utf8');
  if (json.length % 4) json = Buffer.concat([json, Buffer.alloc(4 - (json.length % 4), 0x20)]);

  const header = Buffer.alloc(12);
  header.writeUInt32LE(0x46546c67, 0); // 'glTF'
  header.writeUInt32LE(2, 4);
  header.writeUInt32LE(12 + 8 + json.length + 8 + binPadded.length, 8);
  const jsonHeader = Buffer.alloc(8);
  jsonHeader.writeUInt32LE(json.length, 0);
  jsonHeader.writeUInt32LE(0x4e4f534a, 4); // 'JSON'
  const binHeader = Buffer.alloc(8);
  binHeader.writeUInt32LE(binPadded.length, 0);
  binHeader.writeUInt32LE(0x004e4942, 4); // 'BIN'
  return Buffer.concat([header, jsonHeader, json, binHeader, binPadded]);
}
