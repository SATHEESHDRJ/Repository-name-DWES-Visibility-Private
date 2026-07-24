const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { permanentlyDeleteProject } = require('../dist/common/project-delete.util');
const { FramesService } = require('../dist/frames/frames.service');
const { FrameStore } = require('../dist/frames/frame-store');
const { MockStore } = require('../dist/data/mock-store');

function deletionPrisma(updates) {
  const deleted = { count: 1 };
  return {
    tech_assignments: {
      findMany: async () => [{ id: 11 }],
      deleteMany: async () => deleted,
    },
    panel_inspections: { deleteMany: async () => deleted },
    file_hashes: { deleteMany: async () => deleted },
    tech_audit_log: { deleteMany: async () => deleted },
    session_log: { deleteMany: async () => deleted },
    projects: {
      deleteMany: async (args) => { updates.push(args); return { count: 1 }; },
    },
    $transaction: async operations => Promise.all(operations),
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
  };
  MockStore.frames = [{ id: 'frame-delete', project_code: code }];
  MockStore.drawings = [{ id: 'drawing-delete', project_code: code }];
  MockStore.drawingPackages = [{ id: 'pkg-delete', project_code: code, frame_id: 'frame-delete' }];
  MockStore.directorReports = [{ id: 'report-delete', project_code: code }];

  try {
    const result = await permanentlyDeleteProject(deletionPrisma(updates), code, os.tmpdir());
    assert.equal(result.success, true);
    assert.equal(result.deleted.project_row, 1);
    assert.deepEqual(updates[0], { where: { code } });
    assert.equal(MockStore.frames.some(row => row.project_code === code), false);
    assert.equal(MockStore.drawings.some(row => row.project_code === code), false);
    assert.equal(MockStore.drawingPackages.some(row => row.project_code === code), false);
    assert.equal(MockStore.directorReports.some(row => row.project_code === code), false);
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

test('permanent panel deletion atomically cascades assignments and writes a database tombstone', async () => {
  const code = 'PANEL-DELETE-WRITE';
  const frameId = 'panel-to-delete';
  const originalFrames = MockStore.frames;
  const tombstones = [];
  MockStore.frames = [{
    id: frameId, project_code: code, panel_name: 'Delete Me', cables: [], cable_count: 0,
    uploaded_at: new Date(0).toISOString(), compare_status: 'none', original_filename: '', mapping: {}, sheet_name: '',
  }];
  const counted = [];
  const prisma = {
    projects: { findFirst: async () => ({ code }) },
    tech_assignments: {
      findMany: async () => [{ id: 91 }],
      deleteMany: async args => { counted.push(['assignments', args]); return { count: 1 }; },
    },
    panel_inspections: {
      deleteMany: async args => { counted.push(['inspections', args]); return { count: 1 }; },
    },
    tech_audit_log: {
      deleteMany: async args => { counted.push(['audit', args]); return { count: 1 }; },
    },
    file_hashes: {
      create: async ({ data }) => { tombstones.push(data); return data; },
    },
    $transaction: async operations => Promise.all(operations),
  };
  try {
    const service = new FramesService(prisma);
    await service.remove(code, frameId);
    assert.equal(MockStore.frames.some(row => row.id === frameId), false);
    assert.equal(counted.length, 3);
    assert.equal(tombstones.length, 1);
    assert.equal(tombstones[0].project_code, code);
    assert.equal(tombstones[0].file_name, frameId);
    assert.equal(tombstones[0].file_type, 'panel_deleted');
    assert.equal(tombstones[0].file_hash.length, 64);
  } finally {
    MockStore.frames = originalFrames;
  }
});

// Removed: panel-scoped generated 3D model directory cleanup (PanelModelStore / panel-model feature retired).

test('application restart loads only active database projects and non-deleted panels from JSON', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dwes-restart-'));
  const oldUploadDir = process.env.UPLOAD_DIR;
  const original = {
    frames: MockStore.frames,
    drawings: MockStore.drawings,
    drawingPackages: MockStore.drawingPackages,
    directorReports: MockStore.directorReports,
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
