const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');

// Compiled output (run `npm run build` first — same convention as the other tests).
const { MockStore } = require('../dist/data/mock-store');
const { FrameStore } = require('../dist/frames/frame-store');
const { PanelModelStore } = require('../dist/panel-model/panel-model-store');
const { buildPanelGlb } = require('../dist/panel-model/glb-builder');
const { extractPdfText } = require('../dist/panel-model/pdf-text');
const { extractDimensions, extractComponents, classifyDrawingRole } = require('../dist/panel-model/drawing-extract');
const { PanelModelService, INSUFFICIENT_INFO_MESSAGE } = require('../dist/panel-model/panel-model.service');
const { FramesController } = require('../dist/frames/frames.controller');

// ── helpers ───────────────────────────────────────────────────────────────────

const manualDim = v => ({ value_mm: v, source: 'manual', confidence: 1 });

function fullManualSpec() {
  return {
    enclosure: { width: manualDim(800), height: manualDim(2200), depth: manualDim(600) },
    doors: { count: 1, source: 'manual' },
    mounting_plate: { present: true, source: 'manual' },
    gland_plate: { present: true, source: 'manual' },
    base_frame: { present: true, height_mm: 100, source: 'manual' },
    wire_troughs: { count: 2, source: 'manual' },
    terminal_rows: { count: 1, source: 'manual' },
    components: [],
  };
}

function parseGlb(buffer) {
  assert.equal(buffer.readUInt32LE(0), 0x46546c67, 'GLB magic');
  assert.equal(buffer.readUInt32LE(4), 2, 'GLB version');
  assert.equal(buffer.readUInt32LE(8), buffer.length, 'GLB total length');
  const jsonLen = buffer.readUInt32LE(12);
  assert.equal(buffer.readUInt32LE(16), 0x4e4f534a, 'JSON chunk type');
  const json = JSON.parse(buffer.subarray(20, 20 + jsonLen).toString('utf8'));
  const binLen = buffer.readUInt32LE(20 + jsonLen);
  assert.equal(buffer.readUInt32LE(24 + jsonLen), 0x004e4942, 'BIN chunk type');
  assert.equal(20 + jsonLen + 8 + binLen, buffer.length, 'chunk sizes add up');
  return json;
}

function pdfWithText(text) {
  const stream = `BT (${text}) Tj ET`;
  return Buffer.from(
    `%PDF-1.4\n1 0 obj\n<< /Length ${stream.length} >>\nstream\n${stream}\nendstream\nendobj\ntrailer\n<<>>\n%%EOF`,
    'latin1',
  );
}

const supervisor = { id: 7, username: 'sup1', full_name: 'Super Visor', role: 'prod_supervisor' };
const technician = { id: 9, username: 'tech1', full_name: 'Tech One', role: 'wiring_technician' };
const prismaMock = { projects: { findFirst: async () => ({ code: 'X', is_active: true }) } };

let tmpRoot;
const PROJECT = 'DEMO3D_TEST_PROJECT_001';
const FRAME = 'frame_pm_test_1';

function seedFrameWithDrawing(pdfBuffer, name = 'GA General Arrangement.pdf') {
  const frame = {
    id: FRAME, project_code: PROJECT, panel_name: 'Test Protection Panel',
    cables: [], uploaded_at: new Date().toISOString(), compare_status: 'validated',
    original_filename: 'x.xlsx', cable_count: 0, mapping: {}, sheet_name: 'S',
    panel_type: 'protection',
  };
  MockStore.frames.push(frame);
  FrameStore.save(frame);
  const drawingId = `drw_${crypto.randomUUID()}`;
  FrameStore.saveDrawing(PROJECT, drawingId, name, pdfBuffer, FRAME, {
    kind: '2d', content_type: 'application/pdf',
    sha256: crypto.createHash('sha256').update(pdfBuffer).digest('hex'),
    uploaded_at: new Date().toISOString(),
  });
  return drawingId;
}

beforeEach(() => {
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'dwes-pm-'));
  process.env.UPLOAD_DIR = tmpRoot;
  MockStore.frames.length = 0;
  MockStore.drawings.length = 0;
  MockStore.drawingPackages.length = 0;
  MockStore.panelModels.length = 0;
});

// ── GLB builder ───────────────────────────────────────────────────────────────

test('glb-builder produces a valid, deterministic GLB with no placeholders for a fully manual spec', () => {
  const a = buildPanelGlb(fullManualSpec(), 'P1');
  const b = buildPanelGlb(fullManualSpec(), 'P1');
  assert.ok(a.glb.equals(b.glb), 'deterministic output');
  assert.deepEqual(a.placeholders, [], 'no placeholders when everything is manual');
  const json = parseGlb(a.glb);
  assert.ok(json.meshes.length >= 8, `expected several parts, got ${json.meshes.length}`);
  assert.equal(json.materials.length, 9);
  assert.ok(json.nodes.every(n => typeof n.extras?.dwes_part === 'string'));
  assert.ok(json.accessors.every(acc => acc.componentType !== undefined));
});

test('glb-builder refuses a missing or placeholder enclosure axis instead of using sample dimensions', () => {
  const spec = fullManualSpec();
  spec.enclosure.depth = { value_mm: null, source: 'placeholder', confidence: 0 };
  assert.throws(() => buildPanelGlb(spec, 'P1'), /valid enclosure depth/i);

  spec.enclosure.depth = { value_mm: 600, source: 'placeholder', confidence: 0 };
  assert.throws(() => buildPanelGlb(spec, 'P1'), /valid enclosure depth/i);
});

test('glb-builder geometry uses the exact entered enclosure dimensions', () => {
  const spec = fullManualSpec();
  spec.enclosure.width.value_mm = 913;
  spec.enclosure.height.value_mm = 2077;
  spec.enclosure.depth.value_mm = 547;
  const json = parseGlb(buildPanelGlb(spec, 'Exact dimensions').glb);
  const rearNode = json.nodes.find(node => node.name === 'Rear panel');
  const primitive = json.meshes[rearNode.mesh].primitives[0];
  const accessor = json.accessors[primitive.attributes.POSITION];
  const size = accessor.max.map((value, index) => Number((value - accessor.min[index]).toFixed(3)));
  assert.deepEqual(size, [0.913, 2.077, 0.025]);
});

// ── extraction ────────────────────────────────────────────────────────────────

test('extractDimensions reads labeled and triple dimensions, ignores implausible values', () => {
  const labeled = extractDimensions('WIDTH: 800 mm  H=2200  DEPTH 600', 0.8);
  assert.equal(labeled.width.value_mm, 800);
  assert.equal(labeled.height.value_mm, 2200);
  assert.equal(labeled.depth.value_mm, 600);
  assert.equal(labeled.width.source, 'extracted');

  const triple = extractDimensions('ENCLOSURE 800 x 2200 x 600 mm', 0.8);
  assert.equal(triple.width.value_mm, 800);
  assert.equal(triple.height.value_mm, 2200);
  assert.equal(triple.depth.value_mm, 600);

  const none = extractDimensions('GENERAL NOTES ONLY', 0.8);
  assert.equal(none.width.value_mm, null);
  assert.equal(none.width.source, 'placeholder');
});

test('extractComponents finds apparatus keywords and device tags on list lines', () => {
  const text = 'APPARATUS LIST\n86 LOCKOUT RELAY QTY 1\nMCB 6A 2P\nTB1 TERMINAL BLOCKS\nSPACE HEATER 60W';
  const comps = extractComponents(text);
  const types = comps.map(c => c.type);
  assert.ok(types.includes('mcb'), `types: ${types}`);
  assert.ok(types.includes('heater'));
  assert.ok(types.includes('terminal_block'));
});

test('classifyDrawingRole uses filename first, then text', () => {
  assert.equal(classifyDrawingRole('Panel_Front_View_Rev2.pdf', ''), 'front');
  assert.equal(classifyDrawingRole('scan001.pdf', 'GENERAL ARRANGEMENT'), 'ga');
  assert.equal(classifyDrawingRole('scan001.pdf', ''), 'unknown');
});

test('extractPdfText harvests text from an uncompressed PDF content stream', () => {
  const { text, quality } = extractPdfText(pdfWithText('FRONT VIEW 800 x 2200 x 600'));
  assert.match(text, /800 x 2200 x 600/);
  assert.ok(quality > 0, `quality ${quality}`);
  const notPdf = extractPdfText(Buffer.from('hello'));
  assert.equal(notPdf.quality, 0);
});

test('extractPdfText rejects binary subset-font glyph bytes as a false text layer', () => {
  const gibberish = Array.from({ length: 240 }, (_, index) => (
    index % 4 === 0 ? String.fromCharCode(0x81) : String.fromCharCode(0xe0 + (index % 20))
  )).join('');
  const result = extractPdfText(pdfWithText(gibberish));
  assert.equal(result.text, '');
  assert.equal(result.quality, 0);
  assert.match(result.notes.join(' '), /undecodable subset-font|no usable text/i);
});

// ── conversion service: full lifecycle ────────────────────────────────────────

test('convert → verification_required → approve lifecycle with technician approved-only access', async () => {
  seedFrameWithDrawing(pdfWithText('GENERAL ARRANGEMENT 800 x 2200 x 600 APPARATUS LIST'));
  const svc = new PanelModelService(prismaMock);

  // Supervisor converts.
  const converted = await svc.convert(PROJECT, FRAME, supervisor, 0);
  assert.equal(converted.current.status, 'verification_required');
  assert.equal(converted.current.revision, 1);
  assert.ok(converted.current.model_file, 'GLB metadata recorded');
  assert.equal(converted.current.spec.enclosure.width.value_mm, 800);
  const stages = converted.current.stages.map(s => s.stage);
  for (const expected of ['analysing', 'extracting_dimensions', 'identifying_components', 'generating_model', 'verification_required']) {
    assert.ok(stages.includes(expected), `missing stage ${expected}`);
  }
  assert.ok(converted.current.sources.length >= 1);
  assert.ok(PanelModelStore.getGlb(PROJECT, FRAME, converted.current.id), 'GLB persisted to disk');

  // Technician cannot see or stream an unapproved model.
  const techView = await svc.getPanelModels(PROJECT, FRAME, technician);
  assert.equal(techView.current, null);
  assert.equal(techView.history.length, 0);
  assert.throws(() => svc.getModelFile(PROJECT, FRAME, converted.current.id, technician), /not found/i);

  // Supervisor CAN stream it.
  const file = svc.getModelFile(PROJECT, FRAME, converted.current.id, supervisor);
  assert.equal(file.contentType, 'model/gltf-binary');
  parseGlb(file.buffer);

  // Stale package revision is rejected.
  await assert.rejects(() => svc.approve(PROJECT, FRAME, converted.current.id, supervisor, 99), /changed/i);

  // Approve with the right revision (package revision is 0 — virtual package).
  await assert.rejects(
    () => svc.approve(PROJECT, FRAME, converted.current.id, supervisor, 0, false),
    /acknowledge all/i,
  );
  const approved = await svc.approve(PROJECT, FRAME, converted.current.id, supervisor, 0, true, 'Checked against the panel drawing');
  assert.equal(approved.current.status, 'approved');
  assert.equal(approved.current.verified_by, supervisor.id);
  assert.ok(approved.current.approved_at);
  assert.equal(approved.current.assumptions_acknowledged, true);
  assert.equal(approved.current.assumptions_acknowledged_by, supervisor.id);
  assert.equal(approved.current.verification_notes, 'Checked against the panel drawing');

  // Technician now sees exactly the approved model.
  const techAfter = await svc.getPanelModels(PROJECT, FRAME, technician);
  assert.equal(techAfter.current?.id, approved.current.id);
  assert.ok(svc.getModelFile(PROJECT, FRAME, approved.current.id, technician).buffer.length > 0);

  // Approved models cannot be corrected.
  await assert.rejects(
    () => svc.updateSpec(PROJECT, FRAME, approved.current.id, { package_revision: 0 }, supervisor),
    /cannot be corrected/i,
  );

  // A re-conversion supersedes the approved revision (read-only history preserved).
  const reconverted = await svc.convert(PROJECT, FRAME, supervisor, 0);
  assert.equal(reconverted.current.revision, 2);
  const old = reconverted.history.find(m => m.id === approved.current.id);
  assert.equal(old.status, 'superseded');
  assert.ok(old.approved_at, 'approval audit preserved on superseded revision');
  const techFinal = await svc.getPanelModels(PROJECT, FRAME, technician);
  assert.equal(techFinal.current, null, 'technician no longer sees a current model after supersede');
});

test('insufficient drawing information fails honestly, manual correction recovers', async () => {
  seedFrameWithDrawing(pdfWithText('GENERAL NOTES ONLY NO DIMENSIONS HERE'), 'notes.pdf');
  const svc = new PanelModelService(prismaMock);

  const failed = await svc.convert(PROJECT, FRAME, supervisor, 0);
  assert.equal(failed.current.status, 'conversion_failed');
  assert.equal(failed.current.status_message, INSUFFICIENT_INFO_MESSAGE);
  assert.equal(failed.current.model_file, null, 'no misleading model generated');

  // The optimistic lock is mandatory and stale clients receive a conflict.
  await assert.rejects(
    () => svc.updateSpec(PROJECT, FRAME, failed.current.id, {
      enclosure: { width_mm: 800, height_mm: 2000, depth_mm: 600 },
    }, supervisor),
    error => error?.getStatus?.() === 400 && /package_revision is required/i.test(error.message),
  );
  await assert.rejects(
    () => svc.updateSpec(PROJECT, FRAME, failed.current.id, {
      package_revision: 99,
      enclosure: { width_mm: 800, height_mm: 2000, depth_mm: 600 },
    }, supervisor),
    error => error?.getStatus?.() === 409 && /drawing package changed/i.test(error.message),
  );

  // A partial manual specification is still refused; all three axes are required.
  await assert.rejects(
    () => svc.updateSpec(PROJECT, FRAME, failed.current.id, {
      package_revision: 0,
      enclosure: { width_mm: 800 },
    }, supervisor),
    /Width, Height and Depth are all required/i,
  );

  // Supervisor supplies real dimensions → a NEW revision is generated.
  const fixed = await svc.updateSpec(PROJECT, FRAME, failed.current.id, {
    package_revision: 0,
    enclosure: { width_mm: 800, height_mm: 2000, depth_mm: 600 },
    verification_notes: 'Dimensions checked against the enclosure nameplate.',
  }, supervisor);
  assert.equal(fixed.current.status, 'verification_required');
  assert.equal(fixed.current.revision, 2);
  assert.notEqual(fixed.current.id, failed.current.id);
  assert.ok(fixed.current.model_file);
  assert.equal(fixed.current.spec.enclosure.width.source, 'manual');
  assert.equal(fixed.current.manual_entry.source, 'supervisor_verified_manual');
  assert.equal(fixed.current.manual_entry.entered_by, supervisor.id);
  assert.equal(fixed.current.manual_entry.prior_automatic_confidence, failed.current.extraction.confidence);
  assert.equal(fixed.current.manual_entry.corrected_from_model_id, failed.current.id);
  assert.equal(fixed.current.source_package_revision, failed.current.source_package_revision);
  assert.equal(fixed.current.sources[0].drawing_id, failed.current.sources[0].drawing_id, 'manual recovery reuses the original drawing');
  assert.ok(fixed.current.conversion_completed_at >= fixed.current.conversion_started_at);
  const failedHistory = fixed.history.find(item => item.id === failed.current.id);
  assert.equal(failedHistory.status, 'superseded');
  assert.equal(failedHistory.superseded_from_status, 'conversion_failed');
  assert.equal(failedHistory.superseded_status_message, INSUFFICIENT_INFO_MESSAGE);
  assert.equal(failedHistory.model_file, null);

  // Invalid numeric and extreme values are rejected without creating a revision.
  for (const badWidth of [0, -1, 'abc', 6001]) {
    await assert.rejects(
      () => svc.updateSpec(PROJECT, FRAME, fixed.current.id, {
        package_revision: 0,
        enclosure: { width_mm: badWidth, height_mm: 2000, depth_mm: 600 },
      }, supervisor),
      /between 100 and 6000/i,
    );
  }
  assert.equal((await svc.getPanelModels(PROJECT, FRAME, supervisor)).current.revision, 2);

  // Approval is impossible without explicit assumption acknowledgement.
  await assert.rejects(
    () => svc.approve(PROJECT, FRAME, fixed.current.id, supervisor, 0, false),
    /acknowledge all/i,
  );
  const approved = await svc.approve(PROJECT, FRAME, fixed.current.id, supervisor, 0, true);
  assert.equal(approved.current.status, 'approved');
});

test('partial automatic dimensions fail without generating a fallback-sized GLB', async () => {
  seedFrameWithDrawing(pdfWithText('GENERAL ARRANGEMENT WIDTH: 900 HEIGHT: 2100'), 'partial-ga.pdf');
  const svc = new PanelModelService(prismaMock);
  const failed = await svc.convert(PROJECT, FRAME, supervisor, 0);
  assert.equal(failed.current.status, 'conversion_failed');
  assert.equal(failed.current.spec.enclosure.width.value_mm, 900);
  assert.equal(failed.current.spec.enclosure.height.value_mm, 2100);
  assert.equal(failed.current.spec.enclosure.depth.value_mm, null);
  assert.equal(failed.current.model_file, null);
  assert.equal(PanelModelStore.getGlb(PROJECT, FRAME, failed.current.id), null);
  assert.match(failed.current.extraction.notes.join(' '), /Missing required enclosure dimensions: depth/i);
  await assert.rejects(
    () => svc.approve(PROJECT, FRAME, failed.current.id, supervisor, 0, true),
    /conversion_failed.*cannot be approved/i,
  );
});

test('service mutations enforce Production Supervisor role in depth', async () => {
  seedFrameWithDrawing(pdfWithText('GENERAL ARRANGEMENT 800 x 2200 x 600'));
  const svc = new PanelModelService(prismaMock);
  await assert.rejects(() => svc.convert(PROJECT, FRAME, technician, 0), /Only a Production Supervisor/i);

  const converted = await svc.convert(PROJECT, FRAME, supervisor, 0);
  await assert.rejects(
    () => svc.updateSpec(PROJECT, FRAME, converted.current.id, {
      package_revision: 0,
      enclosure: { width_mm: 800, height_mm: 2200, depth_mm: 600 },
    }, technician),
    /Only a Production Supervisor/i,
  );
  await assert.rejects(
    () => svc.approve(PROJECT, FRAME, converted.current.id, technician, 0, true),
    /Only a Production Supervisor/i,
  );
});

test('panel-model controller allows only the technician assigned to the exact panel', async () => {
  const modelView = { project_code: PROJECT, frame_id: FRAME, current: { status: 'approved' } };
  const denied = new FramesController(
    { technicianAssignedToFrame: async () => false },
    {},
    { getPanelModels: async () => modelView },
  );
  await assert.rejects(
    () => denied.getPanelModel(PROJECT, FRAME, technician),
    error => error?.getStatus?.() === 403 && /not assigned to this panel/i.test(error.message),
  );

  const allowed = new FramesController(
    { technicianAssignedToFrame: async (code, frameId, technicianId) => (
      code === PROJECT && frameId === FRAME && technicianId === technician.id
    ) },
    {},
    { getPanelModels: async () => modelView },
  );
  assert.equal(await allowed.getPanelModel(PROJECT, FRAME, technician), modelView);
});

test('correction rejects a model tied to an older source package revision', async () => {
  seedFrameWithDrawing(pdfWithText('GENERAL NOTES ONLY'), 'scan.pdf');
  const svc = new PanelModelService(prismaMock);
  const failed = await svc.convert(PROJECT, FRAME, supervisor, 0);
  const currentPackage = FrameStore.getDrawingPackage(PROJECT, FRAME);
  FrameStore.persistDrawingPackage({ ...currentPackage, revision: 1, updated_at: new Date().toISOString() });

  await assert.rejects(
    () => svc.updateSpec(PROJECT, FRAME, failed.current.id, {
      package_revision: 1,
      enclosure: { width_mm: 800, height_mm: 2000, depth_mm: 600 },
    }, supervisor),
    error => error?.getStatus?.() === 409 && /2D drawing changed.*start a new conversion/i.test(error.message),
  );
});

test('a new 2D drawing revision supersedes active models (store-level hook)', async () => {
  seedFrameWithDrawing(pdfWithText('GA 800 x 2200 x 600'));
  const svc = new PanelModelService(prismaMock);
  const converted = await svc.convert(PROJECT, FRAME, supervisor, 0);
  assert.equal(converted.current.status, 'verification_required');

  PanelModelStore.supersedeActive(PROJECT, FRAME, null, 'Superseded by new 2D drawing revision 2');
  const after = await svc.getPanelModels(PROJECT, FRAME, supervisor);
  assert.equal(after.current.status, 'superseded');
  assert.match(after.current.status_message, /new 2D drawing/i);
  assert.equal(after.panel_status, 'superseded');
});

test('models are strictly panel-scoped — same panel name in another project stays independent', async () => {
  seedFrameWithDrawing(pdfWithText('GA 800 x 2200 x 600'));
  // Second project, same frame id and panel name.
  const OTHER = 'DEMO3D_TEST_PROJECT_002';
  const frame2 = {
    id: FRAME, project_code: OTHER, panel_name: 'Test Protection Panel',
    cables: [], uploaded_at: new Date().toISOString(), compare_status: 'validated',
    original_filename: 'x.xlsx', cable_count: 0, mapping: {}, sheet_name: 'S',
  };
  MockStore.frames.push(frame2);
  FrameStore.save(frame2);

  const svc = new PanelModelService(prismaMock);
  const converted = await svc.convert(PROJECT, FRAME, supervisor, 0);
  assert.equal(converted.current.project_code, PROJECT);

  // The other project's identically-named panel has NO models and no drawing.
  const other = await svc.getPanelModels(OTHER, FRAME, supervisor);
  assert.equal(other.current, null);
  assert.equal(other.history.length, 0);
  assert.equal(other.panel_status, 'no_drawing');
  // And its model file is not reachable through the other project's scope.
  assert.throws(() => svc.getModelFile(OTHER, FRAME, converted.current.id, supervisor), /not found/i);
});
