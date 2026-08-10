const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { permanentlyDeleteProject } = require('../dist/common/project-delete.util');
const { FramesService } = require('../dist/frames/frames.service');
const { FrameStore } = require('../dist/frames/frame-store');
const { MockStore } = require('../dist/data/mock-store');
const { PanelModelStore } = require('../dist/panel-model/panel-model-store');

function deletionPrisma(updates) {
  const deleted = { count: 1 };
  const passthrough = async () => deleted;
  const findManyEmpty = async () => [];
  return {
    tech_assignments: {
      findMany: async () => [{ id: 11 }],
      deleteMany: passthrough,
    },
    panel_inspections: { deleteMany: passthrough },
    file_hashes: { deleteMany: passthrough },
    tech_audit_log: { deleteMany: passthrough },
    session_log: { deleteMany: passthrough },
    ga_finalization_decisions: { deleteMany: passthrough },
    ga_correlation_results: { deleteMany: passthrough },
    ga_faces: { deleteMany: passthrough },
    ga_asset_sets: { findMany: findManyEmpty, deleteMany: passthrough },
    background_jobs: { deleteMany: passthrough },
    mapping_issues: { deleteMany: passthrough },
    cable_route_mappings: { deleteMany: passthrough },
    terminal_geometries: { deleteMany: passthrough },
    duct_segments: { deleteMany: passthrough },
    duct_nodes: { deleteMany: passthrough },
    device_geometries: { findMany: findManyEmpty, deleteMany: passthrough },
    panel_models: { findMany: findManyEmpty, deleteMany: passthrough },
    drawing_assets: { deleteMany: passthrough },
    projects: {
      deleteMany: async (args) => { updates.push(args); return { count: 1 }; },
    },
    $transaction: async fn => (typeof fn === 'function' ? fn({
      tech_assignments: { findMany: async () => [{ id: 11 }], deleteMany: passthrough },
      panel_inspections: { deleteMany: passthrough },
      file_hashes: { deleteMany: passthrough },
      tech_audit_log: { deleteMany: passthrough },
      session_log: { deleteMany: passthrough },
      ga_finalization_decisions: { deleteMany: passthrough },
      ga_correlation_results: { deleteMany: passthrough },
      ga_faces: { deleteMany: passthrough },
      ga_asset_sets: { findMany: findManyEmpty, deleteMany: passthrough },
      background_jobs: { deleteMany: passthrough },
      mapping_issues: { deleteMany: passthrough },
      cable_route_mappings: { deleteMany: passthrough },
      terminal_geometries: { deleteMany: passthrough },
      duct_segments: { deleteMany: passthrough },
      duct_nodes: { deleteMany: passthrough },
      device_geometries: { findMany: findManyEmpty, deleteMany: passthrough },
      panel_models: { findMany: findManyEmpty, deleteMany: passthrough },
      drawing_assets: { deleteMany: passthrough },
      projects: { deleteMany: async (args) => { updates.push(args); return { count: 1 }; } },
    }) : Promise.all(fn)),
  };
}

test('permanent project deletion removes the database row and purges every memory store', async () => {
  const code = 'DELETE-CONSISTENCY';
  const updates = [];
  const original = {
    frames: MockStore.frames,
    drawings: MockStore.drawings,
    drawingPackages: MockStore.drawingPackages,
    directorReports: MockStore.directorReports,
    panelModels: MockStore.panelModels,
  };
  MockStore.frames = [{ id: 'frame-delete', project_code: code }];
  MockStore.drawings = [{ id: 'drawing-delete', project_code: code }];
  MockStore.drawingPackages = [{ id: 'pkg-delete', project_code: code, frame_id: 'frame-delete' }];
  MockStore.directorReports = [{ id: 'report-delete', project_code: code }];
  MockStore.panelModels = [{ id: 'model-delete', project_code: code, frame_id: 'frame-delete', revision: 1, status: 'approved', stages: [], sources: [], spec: {} }];

  try {
    const result = await permanentlyDeleteProject(deletionPrisma(updates), code, os.tmpdir());
    assert.equal(result.success, true);
    assert.equal(result.deleted.projects, 1);
    assert.deepEqual(updates[0], { where: { code } });
    assert.equal(MockStore.frames.some(row => row.project_code === code), false);
    assert.equal(MockStore.drawings.some(row => row.project_code === code), false);
    assert.equal(MockStore.drawingPackages.some(row => row.project_code === code), false);
    assert.equal(MockStore.directorReports.some(row => row.project_code === code), false);
    assert.equal(MockStore.panelModels.some(row => row.project_code === code), false);
  } finally {
    MockStore.frames = original.frames;
    MockStore.drawings = original.drawings;
    MockStore.drawingPackages = original.drawingPackages;
    MockStore.directorReports = original.directorReports;
  }
});

test('panel list excludes database tombstones even if stale memory still contains the panel', async () => {
  const code = 'PANEL-TOMBSTONE';
  const originalFrames = MockStore.frames;
  MockStore.frames = [
    { id: 'deleted-panel', project_code: code, panel_name: 'Deleted', cables: [], cable_count: 0 },
    { id: 'valid-panel', project_code: code, panel_name: 'Valid', cables: [], cable_count: 0 },
  ];
  const service = new FramesService({
    projects: { findFirst: async () => ({ code }) },
    file_hashes: { findMany: async () => [{ file_name: 'deleted-panel' }] },
  });
  try {
    const rows = await service.findAll(code);
    assert.deepEqual(rows.map(row => row.id), ['valid-panel']);
    assert.equal(MockStore.frames.some(row => row.id === 'deleted-panel'), false);
  } finally {
    MockStore.frames = originalFrames;
  }
});

function emptyMany() {
  return { findMany: async () => [], deleteMany: async () => ({ count: 0 }) };
}

/** Interactive `$transaction(fn)` mock used by permanentlyDeletePanel. */
function panelDeletePrismaMock({ code, assignmentIds = [], onTombstone, onCounted }) {
  const counted = [];
  const track = (label, args) => {
    counted.push([label, args]);
    onCounted?.(label, args);
  };
  const client = {
    projects: { findFirst: async () => ({ code }) },
    ga_asset_sets: emptyMany(),
    ga_faces: emptyMany(),
    ga_finalization_decisions: emptyMany(),
    ga_correlation_results: emptyMany(),
    background_jobs: emptyMany(),
    mapping_issues: emptyMany(),
    panel_models: emptyMany(),
    device_geometries: emptyMany(),
    terminal_geometries: emptyMany(),
    duct_segments: emptyMany(),
    duct_nodes: emptyMany(),
    cable_route_mappings: emptyMany(),
    drawing_assets: emptyMany(),
    tech_assignments: {
      findMany: async () => assignmentIds.map(id => ({ id })),
      findFirst: async () => null,
      deleteMany: async args => { track('assignments', args); return { count: assignmentIds.length }; },
    },
    panel_inspections: {
      deleteMany: async args => { track('inspections', args); return { count: assignmentIds.length ? 1 : 0 }; },
    },
    tech_audit_log: {
      deleteMany: async args => { track('audit', args); return { count: 1 }; },
    },
    file_hashes: {
      deleteMany: async () => ({ count: 0 }),
      create: async ({ data }) => {
        onTombstone?.(data);
        return data;
      },
    },
  };
  return {
    ...client,
    counted,
    $transaction: async fn => fn(client),
  };
}

test('permanent panel deletion atomically cascades assignments and writes a database tombstone', async () => {
  const code = 'PANEL-DELETE-WRITE';
  const frameId = 'panel-to-delete';
  const originalFrames = MockStore.frames;
  const tombstones = [];
  MockStore.frames = [{
    id: frameId, project_code: code, panel_name: 'Delete Me', cables: [], cable_count: 0,
    uploaded_at: new Date(0).toISOString(), compare_status: 'none', original_filename: '', mapping: {}, sheet_name: '',
  }];
  const prisma = panelDeletePrismaMock({
    code,
    assignmentIds: [91],
    onTombstone: data => tombstones.push(data),
  });
  try {
    const service = new FramesService(prisma);
    await service.remove(code, frameId);
    assert.equal(MockStore.frames.some(row => row.id === frameId), false);
    assert.ok(prisma.counted.some(([label]) => label === 'assignments'));
    assert.ok(prisma.counted.some(([label]) => label === 'inspections'));
    assert.ok(prisma.counted.some(([label]) => label === 'audit'));
    assert.equal(tombstones.length, 1);
    assert.equal(tombstones[0].project_code, code);
    assert.equal(tombstones[0].file_name, frameId);
    assert.equal(tombstones[0].file_type, 'panel_deleted');
    assert.equal(tombstones[0].file_hash.length, 64);
  } finally {
    MockStore.frames = originalFrames;
  }
});

test('panel delete removes the panel-scoped model directory and leaves other panels intact', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dwes-panel-delete-'));
  const oldUploadDir = process.env.UPLOAD_DIR;
  const original = {
    frames: MockStore.frames,
    drawings: MockStore.drawings,
    drawingPackages: MockStore.drawingPackages,
    directorReports: MockStore.directorReports,
    panelModels: MockStore.panelModels,
  };
  process.env.UPLOAD_DIR = root;
  try {
    const code = 'MODEL-CLEANUP';
    const keptFrameId = 'kept-panel';
    const deletedFrameId = 'deleted-panel';
    const keptDir = path.join(root, code, 'models', keptFrameId);
    const deletedDir = path.join(root, code, 'models', deletedFrameId);
    fs.mkdirSync(keptDir, { recursive: true });
    fs.mkdirSync(deletedDir, { recursive: true });
    fs.writeFileSync(path.join(keptDir, 'keep.model.json'), JSON.stringify({ id: 'keep', project_code: code, frame_id: keptFrameId }));
    fs.writeFileSync(path.join(deletedDir, 'gone.model.json'), JSON.stringify({ id: 'gone', project_code: code, frame_id: deletedFrameId }));
    fs.writeFileSync(path.join(deletedDir, 'gone.glb'), Buffer.from('glb'));
    MockStore.frames = [{ id: deletedFrameId, project_code: code, panel_name: 'Delete Me', cables: [], cable_count: 0 }];
    MockStore.panelModels = [{ id: 'gone', project_code: code, frame_id: deletedFrameId, revision: 1, status: 'approved', stages: [], sources: [], spec: {} }];
    const prisma = panelDeletePrismaMock({ code, assignmentIds: [] });
    const service = new FramesService(prisma);
    await service.remove(code, deletedFrameId);
    assert.equal(fs.existsSync(deletedDir), false);
    assert.equal(fs.existsSync(keptDir), true);
    assert.equal(PanelModelStore.list(code, deletedFrameId).length, 0);
    assert.equal(fs.existsSync(path.join(root, code, 'models', keptFrameId, 'keep.model.json')), true);
  } finally {
    if (oldUploadDir === undefined) delete process.env.UPLOAD_DIR;
    else process.env.UPLOAD_DIR = oldUploadDir;
    fs.rmSync(root, { recursive: true, force: true });
    MockStore.frames = original.frames;
    MockStore.drawings = original.drawings;
    MockStore.drawingPackages = original.drawingPackages;
    MockStore.directorReports = original.directorReports;
    MockStore.panelModels = original.panelModels;
  }
});

test('application restart loads only active database projects and non-deleted panels from JSON', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dwes-restart-'));
  const oldUploadDir = process.env.UPLOAD_DIR;
  const original = {
    frames: MockStore.frames,
    drawings: MockStore.drawings,
    drawingPackages: MockStore.drawingPackages,
    directorReports: MockStore.directorReports,
    panelModels: MockStore.panelModels,
  };
  process.env.UPLOAD_DIR = root;
  const writeFrame = (projectCode, id) => {
    const dir = path.join(root, projectCode, 'frames');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, `${id}.json`), JSON.stringify({
      id, project_code: projectCode, panel_name: id, cables: [], cable_count: 0,
      uploaded_at: new Date(0).toISOString(), compare_status: 'none', original_filename: '', mapping: {}, sheet_name: '',
    }));
  };
  writeFrame('ACTIVE-PROJECT', 'valid-panel');
  writeFrame('ACTIVE-PROJECT', 'deleted-panel');
  writeFrame('DELETED-PROJECT', 'resurrected-panel');
  MockStore.frames = [];
  MockStore.drawings = [];
  MockStore.drawingPackages = [];
  MockStore.directorReports = [];

  try {
    FrameStore.loadAll({
      activeProjectCodes: new Set(['ACTIVE-PROJECT']),
      deletedPanelIdsByProject: new Map([['ACTIVE-PROJECT', new Set(['deleted-panel'])]]),
    });
    assert.deepEqual(MockStore.frames.map(row => `${row.project_code}:${row.id}`), [
      'ACTIVE-PROJECT:valid-panel',
    ]);
    assert.equal(FrameStore.getFrameFromDisk('ACTIVE-PROJECT', 'deleted-panel'), null);
    assert.equal(FrameStore.getFrameFromDisk('DELETED-PROJECT', 'resurrected-panel'), null);
  } finally {
    if (oldUploadDir === undefined) delete process.env.UPLOAD_DIR;
    else process.env.UPLOAD_DIR = oldUploadDir;
    fs.rmSync(root, { recursive: true, force: true });
    MockStore.frames = original.frames;
    MockStore.drawings = original.drawings;
    MockStore.drawingPackages = original.drawingPackages;
    MockStore.directorReports = original.directorReports;
  }
});
