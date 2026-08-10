const test = require('node:test');
const assert = require('node:assert/strict');
const { BadRequestException, ForbiddenException } = require('@nestjs/common');
const {
  validatePackage, matchAgainstSchedule, normalizeRef, terminalRef,
} = require('../dist/engineering/package-validation');
const { EngineeringImportService } = require('../dist/engineering/engineering-import.service');
const { MockStore } = require('../dist/data/mock-store');

function samplePackage(overrides = {}) {
  return {
    package_type: 'dwes-engineering-package',
    spec_version: 1,
    project_code: 'PRJ',
    frame_id: 'frame_eng',
    model_revision: 'R1',
    units: 'mm',
    panel: { width: 800, height: 2000, depth: 600 },
    devices: [
      {
        device_tag: '=H001+K1', x: 400, y: 1500, z: 300, width: 160, height: 220,
        terminals: [
          { terminal_number: '13', terminal_block: 'X1', x: 360, y: 1420, z: 300 },
          { terminal_number: '14', terminal_block: 'X1', x: 380, y: 1420, z: 300 },
        ],
      },
    ],
    duct_nodes: [
      { duct_identifier: 'D1', x: 100, y: 1400, z: 300 },
      { duct_identifier: 'D2', x: 100, y: 400, z: 300 },
    ],
    duct_segments: [{ source: 'D1', destination: 'D2' }],
    ...overrides,
  };
}

function engPrisma(overrides = {}) {
  const prisma = {
    panel_models: {
      findFirst: async () => null,
      findUnique: async () => null,
      create: async ({ data }) => ({ id: 900, ...data }),
      update: async ({ data }) => ({ id: 900, ...data }),
      updateMany: async () => ({ count: 0 }),
      ...(overrides.panel_models || {}),
    },
    device_geometries: {
      create: async ({ data }) => ({ id: 1, ...data }),
      findMany: async () => [],
      ...(overrides.device_geometries || {}),
    },
    terminal_geometries: {
      create: async ({ data }) => ({ id: 1, ...data }),
      findMany: async () => [],
      ...(overrides.terminal_geometries || {}),
    },
    duct_nodes: {
      create: async ({ data }) => ({ id: 1, ...data }),
      count: async () => 0,
      ...(overrides.duct_nodes || {}),
    },
    duct_segments: {
      create: async ({ data }) => ({ id: 1, ...data }),
      count: async () => 0,
      ...(overrides.duct_segments || {}),
    },
    cable_route_mappings: {
      findFirst: async () => null,
      count: async () => 0,
      ...(overrides.cable_route_mappings || {}),
    },
  };
  prisma.$transaction = async callback => callback(prisma);
  return prisma;
}

/* ── Validator ─────────────────────────────────────────────────────────────── */

test('validatePackage accepts a well-formed package', () => {
  const r = validatePackage(samplePackage());
  assert.equal(r.valid, true);
  assert.equal(r.deviceCount, 1);
  assert.equal(r.terminalCount, 2);
});

test('validatePackage rejects wrong units — no silent conversion', () => {
  const r = validatePackage(samplePackage({ units: 'inch' }));
  assert.equal(r.valid, false);
  assert.ok(r.issues.some(i => i.code === 'PKG_UNITS'));
});

test('validatePackage rejects duplicate device tags and terminals', () => {
  const d = samplePackage();
  d.devices.push({ ...d.devices[0] });
  const r = validatePackage(d);
  assert.equal(r.valid, false);
  assert.ok(r.issues.some(i => i.code === 'DEVICE_DUP'));
});

test('validatePackage rejects duct segments referencing unknown nodes', () => {
  const r = validatePackage(samplePackage({ duct_segments: [{ source: 'D1', destination: 'NOPE' }] }));
  assert.equal(r.valid, false);
  assert.ok(r.issues.some(i => i.code === 'DUCT_SEG_DEST'));
});

test('validatePackage warns (not errors) on a disconnected duct graph', () => {
  const r = validatePackage(samplePackage({
    duct_nodes: [
      { duct_identifier: 'D1', x: 0, y: 0, z: 0 },
      { duct_identifier: 'D2', x: 10, y: 0, z: 0 },
      { duct_identifier: 'ISLAND', x: 500, y: 500, z: 0 },
    ],
    duct_segments: [{ source: 'D1', destination: 'D2' }],
  }));
  assert.equal(r.valid, true);
  assert.ok(r.issues.some(i => i.code === 'DUCT_DISCONNECTED' && i.level === 'warning'));
});

test('normalization preserves engineering symbols while matching case/space-insensitively', () => {
  assert.equal(normalizeRef(' =h001+K1 '), '=H001+K1');
  assert.equal(terminalRef('=H001+K1', 'X1:13'), '=H001+K1:X1:13');
  const report = matchAgainstSchedule(samplePackage(), [
    { device: '=h001+k1', terminal: '13' },
    { device: '=H001+K1', terminal: '99' },
  ]);
  assert.equal(report.totalEnds, 2);
  assert.equal(report.matchedEnds, 1);
  assert.deepEqual(report.unmatchedRefs, ['=H001+K1:99']);
});

/* ── Import workflow ───────────────────────────────────────────────────────── */

const engFrame = { id: 'frame_eng', project_code: 'PRJ', panel_name: '=H000E', cable_count: 1, cables: [{ sno: 1, source: '=H001+K1:13', destination: '=H001+K1:14' }] };
test.before(() => { MockStore.frames.push(engFrame); });
test.after(() => { MockStore.frames = MockStore.frames.filter(f => f !== engFrame); });

test('importPackage rejects an invalid package with zero writes', async () => {
  let writes = 0;
  const service = new EngineeringImportService(engPrisma({
    panel_models: { create: async () => { writes++; return { id: 1 }; } },
  }));
  await assert.rejects(
    () => service.importPackage(samplePackage({ units: 'inch' }), 'PRJ', 'frame_eng', 5),
    (e) => e instanceof BadRequestException,
  );
  assert.equal(writes, 0);
});

test('importPackage rejects a package targeting a different project/panel', async () => {
  const service = new EngineeringImportService(engPrisma());
  await assert.rejects(
    () => service.importPackage(samplePackage({ project_code: 'OTHER' }), 'PRJ', 'frame_eng', 5),
    (e) => e instanceof BadRequestException && /does not match/.test(e.message),
  );
});

test('importPackage rejects a duplicate model revision', async () => {
  const service = new EngineeringImportService(engPrisma({
    panel_models: { findFirst: async () => ({ id: 7, approval_status: 'approved' }) },
  }));
  await assert.rejects(
    () => service.importPackage(samplePackage(), 'PRJ', 'frame_eng', 5),
    (e) => e instanceof BadRequestException && /already exists/.test(e.message),
  );
});

test('importPackage creates a DRAFT: pending review, never published', async () => {
  let createdModel = null;
  const service = new EngineeringImportService(engPrisma({
    panel_models: {
      findFirst: async () => null,
      create: async ({ data }) => { createdModel = data; return { id: 901, ...data }; },
    },
  }));
  const result = await service.importPackage(samplePackage(), 'PRJ', 'frame_eng', 5);
  assert.equal(createdModel.approval_status, 'pending_review');
  assert.equal(createdModel.published_at, null);
  assert.equal(result.published, false);
  assert.equal(result.device_count, 1);
  assert.equal(result.schedule_match.totalEnds, 2);
  assert.equal(result.schedule_match.matchedEnds, 2);
});

/* ── Approval / publication ───────────────────────────────────────────────── */

test('approveAndPublish rejects non-supervisor roles', async () => {
  const service = new EngineeringImportService(engPrisma());
  await assert.rejects(
    () => service.approveAndPublish(1, { id: 9, role: 'wiring_technician' }),
    (e) => e instanceof ForbiddenException,
  );
});

test('approveAndPublish refuses to publish a model without geometry', async () => {
  const service = new EngineeringImportService(engPrisma({
    panel_models: { findUnique: async () => ({ id: 3, project_code: 'PRJ', frame_id: 'frame_eng', model_revision: 'R1', approval_status: 'pending_review', published_at: null }) },
  }));
  await assert.rejects(
    () => service.approveAndPublish(3, { id: 2, role: 'prod_supervisor' }),
    (e) => e instanceof BadRequestException && /without device and terminal geometry/.test(e.message),
  );
});

test('approveAndPublish publishes and supersedes the previously published revision', async () => {
  let updated = null;
  let superseded = null;
  const service = new EngineeringImportService(engPrisma({
    panel_models: {
      findUnique: async () => ({ id: 4, project_code: 'PRJ', frame_id: 'frame_eng', model_revision: 'R2', approval_status: 'pending_review', published_at: null }),
      update: async ({ data }) => { updated = data; return { id: 4, ...data }; },
      updateMany: async ({ where, data }) => { superseded = { where, data }; return { count: 1 }; },
    },
    device_geometries: { findMany: async () => [{ id: 11, device_tag: '=H001+K1', normalized_device_tag: '=H001+K1' }] },
    terminal_geometries: { findMany: async () => [{ normalized_terminal_reference: '=H001+K1:13' }, { normalized_terminal_reference: '=H001+K1:14' }] },
  }));
  const result = await service.approveAndPublish(4, { id: 2, role: 'prod_supervisor' });
  assert.equal(updated.approval_status, 'approved');
  assert.ok(updated.published_at instanceof Date);
  assert.equal(superseded.data.approval_status, 'superseded');
  assert.equal(result.published, true);
  assert.equal(result.schedule_match.matched, 2);
});
