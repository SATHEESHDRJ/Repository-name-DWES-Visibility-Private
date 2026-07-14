const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { UploadService } = require('../dist/upload/upload.service');
const { FrameStore } = require('../dist/frames/frame-store');
const { FramesService } = require('../dist/frames/frames.service');
const { FramesController } = require('../dist/frames/frames.controller');
const { MockStore } = require('../dist/data/mock-store');

const CONVERTER_ENV = [
  'DWES_CAD_PREVIEW_EXECUTABLE', 'DWES_CAD_PREVIEW_ARGS_JSON',
  'DWES_CAD_PREVIEW_FORMAT', 'DWES_CAD_PREVIEW_TIMEOUT_MS', 'DWES_CAD_PREVIEW_MAX_MB',
];

function prisma() {
  return {
    projects: {
      findUnique: async ({ where }) => ({ code: where.code, is_active: true }),
      findFirst: async ({ where }) => ({ code: where.code, is_active: true }),
    },
    file_hashes: {
      findFirst: async () => null,
      create: async ({ data }) => data,
    },
  };
}

function frame(id, panelName) {
  return {
    id,
    project_code: 'PKG_SCOPE',
    panel_name: panelName,
    cables: [],
    uploaded_at: '2026-01-01T00:00:00.000Z',
    compare_status: 'none',
    original_filename: '',
    cable_count: 0,
    mapping: {},
    sheet_name: '',
  };
}

function pdf(name = 'drawing.pdf') {
  return { name, type: 'application/pdf', data: Buffer.from('%PDF-1.4\n1 0 obj\n<<>>\nendobj\n%%EOF') };
}

function glb(name = 'model.glb') {
  return { name, type: 'application/octet-stream', data: Buffer.from('glTF\x02\x00\x00\x00') };
}

function dwg(name = 'drawing.dwg', marker = 'A') {
  return { name, type: 'application/octet-stream', data: Buffer.from(`AC1027${marker.repeat(32)}`) };
}

function withDrawingStore(fn) {
  const previousUploadDir = process.env.UPLOAD_DIR;
  const previousConverterEnv = Object.fromEntries(CONVERTER_ENV.map(key => [key, process.env[key]]));
  const previousFrames = MockStore.frames;
  const previousDrawings = MockStore.drawings;
  const previousPackages = MockStore.drawingPackages;
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dwes-drawing-package-'));
  process.env.UPLOAD_DIR = root;
  for (const key of CONVERTER_ENV) delete process.env[key];
  MockStore.frames = [frame('frame_a', '=H001'), frame('frame_b', '=H002')];
  MockStore.drawings = [];
  MockStore.drawingPackages = [];
  return Promise.resolve()
    .then(() => fn(root))
    .finally(() => {
      MockStore.frames = previousFrames;
      MockStore.drawings = previousDrawings;
      MockStore.drawingPackages = previousPackages;
      if (previousUploadDir === undefined) delete process.env.UPLOAD_DIR;
      else process.env.UPLOAD_DIR = previousUploadDir;
      for (const key of CONVERTER_ENV) {
        if (previousConverterEnv[key] === undefined) delete process.env[key];
        else process.env[key] = previousConverterEnv[key];
      }
      fs.rmSync(root, { recursive: true, force: true });
    });
}

test('panel drawing package keeps a stable id and preserves the other slot', () => withDrawingStore(async () => {
  const service = new UploadService(prisma());
  const twoD = pdf();
  const first = await service.uploadPanelDrawingAsset('PKG_SCOPE', 'frame_a', '2d', twoD.data, twoD.name, twoD.type, 4);
  const threeD = glb();
  const second = await service.uploadPanelDrawingAsset('PKG_SCOPE', 'frame_a', '3d', threeD.data, threeD.name, threeD.type, 4);

  assert.equal(first.id, second.id);
  assert.equal(second.revision, 2);
  assert.equal(second.drawing_2d.id, first.drawing_2d.id);
  assert.equal(second.model_3d.kind, '3d');
  assert.equal(second.drawing_2d.sha256.length, 64);

  MockStore.drawingPackages = [];
  const reloaded = FrameStore.getDrawingPackage('PKG_SCOPE', 'frame_a');
  assert.equal(reloaded.id, second.id);
  assert.equal(reloaded.drawing_2d.id, second.drawing_2d.id);
  assert.equal(reloaded.model_3d.id, second.model_3d.id);
}));

test('legacy replacement rejects cross-panel and cross-slot drawing ids', () => withDrawingStore(async () => {
  const service = new UploadService(prisma());
  const twoD = pdf();
  const record = await service.uploadPanelDrawingAsset('PKG_SCOPE', 'frame_a', '2d', twoD.data, twoD.name, twoD.type, 4);
  const drawingId = record.drawing_2d.id;

  await assert.rejects(
    service.uploadDrawing('PKG_SCOPE', twoD.data, 'other.pdf', twoD.type, drawingId, 'frame_b'),
    /another panel/i,
  );

  const threeD = glb();
  await assert.rejects(
    service.uploadDrawing('PKG_SCOPE', threeD.data, threeD.name, threeD.type, drawingId, 'frame_a'),
    /2D drawing with a 3D model/i,
  );
}));

test('slot validation rejects mismatched file signatures', () => withDrawingStore(async () => {
  const service = new UploadService(prisma());
  await assert.rejects(
    service.uploadPanelDrawingAsset('PKG_SCOPE', 'frame_a', '3d', Buffer.from('%PDF-1.4'), 'fake.glb', 'application/octet-stream', 4),
    /signature is invalid/i,
  );
}));

test('panel SVG drawings are accepted only when they contain no executable content', () => withDrawingStore(async () => {
  const service = new UploadService(prisma());
  const safe = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><path d="M0 0L10 10"/></svg>');
  const record = await service.uploadPanelDrawingAsset(
    'PKG_SCOPE', 'frame_a', '2d', safe, 'panel.svg', 'image/svg+xml', 4,
  );
  assert.equal(record.drawing_2d.source_format, 'svg');
  assert.equal(record.drawing_2d.preview.status, 'source');

  const unsafe = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"><script>alert(1)</script></svg>');
  await assert.rejects(
    service.uploadPanelDrawingAsset('PKG_SCOPE', 'frame_a', '2d', unsafe, 'unsafe.svg', 'image/svg+xml', 4),
    /signature is invalid/i,
  );
}));

test('browser-incompatible engineering source is preserved and reports no fake preview', () => withDrawingStore(async () => {
  const service = new UploadService(prisma());
  const source = Buffer.from("ISO-10303-21;\nHEADER;\nFILE_DESCRIPTION(('DWES'),'2;1');\nENDSEC;\nDATA;\nENDSEC;\nEND-ISO-10303-21;");
  const record = await service.uploadPanelDrawingAsset(
    'PKG_SCOPE', 'frame_a', '3d', source, 'panel.step', 'application/step', 4,
  );
  assert.equal(record.model_3d.preview.status, 'failed');
  assert.match(record.model_3d.preview.error, /original engineering source file is preserved/i);
  const stored = FrameStore.getDrawingFile('PKG_SCOPE', record.model_3d.id);
  assert.deepEqual(stored.buffer, source);
}));

test('unconfigured DWG conversion remains explicitly failed and preserves its source', () => withDrawingStore(async () => {
  const service = new UploadService(prisma());
  const source = dwg();
  const record = await service.uploadPanelDrawingAsset(
    'PKG_SCOPE', 'frame_a', '2d', source.data, source.name, source.type, 4,
  );
  assert.equal(record.drawing_2d.preview.status, 'failed');
  assert.match(record.drawing_2d.preview.error, /not configured/i);
  assert.deepEqual(FrameStore.getDrawingFile('PKG_SCOPE', record.drawing_2d.id).buffer, source.data);
}));

test('configured CAD adapter stores a validated preview while source/download bytes remain exact', () => withDrawingStore(async root => {
  const fixture = path.resolve(__dirname, 'fixtures', 'fake-cad-converter.cjs');
  process.env.DWES_CAD_PREVIEW_EXECUTABLE = process.execPath;
  process.env.DWES_CAD_PREVIEW_ARGS_JSON = JSON.stringify([fixture, '{input}', '{output}']);
  process.env.DWES_CAD_PREVIEW_FORMAT = 'pdf';

  const upload = new UploadService(prisma());
  const source = dwg();
  const record = await upload.uploadPanelDrawingAsset(
    'PKG_SCOPE', 'frame_a', '2d', source.data, source.name, source.type, 4,
  );
  assert.equal(record.drawing_2d.preview.status, 'ready');
  assert.equal(record.drawing_2d.preview.content_type, 'application/pdf');

  const frames = new FramesService({ tech_assignments: { findFirst: async () => null, findMany: async () => [] } });
  const inline = frames.getPanelDrawingAssetFile('PKG_SCOPE', 'frame_a', '2d');
  const original = frames.getPanelDrawingAssetSourceFile('PKG_SCOPE', 'frame_a', '2d');
  assert.equal(inline.isPreview, true);
  assert.equal(inline.buffer.subarray(0, 5).toString('ascii'), '%PDF-');
  assert.deepEqual(original.buffer, source.data);

  // Replacement archives and then removes both the previous source and its preview.
  const previousId = record.drawing_2d.id;
  await upload.uploadPanelDrawingAsset('PKG_SCOPE', 'frame_a', '2d', dwg('replacement.dwg', 'B').data, 'replacement.dwg', source.type, 4);
  assert.equal(FrameStore.getDrawingFile('PKG_SCOPE', previousId), null);
  assert.equal(FrameStore.getDrawingPreviewFile('PKG_SCOPE', previousId, 'pdf'), null);
  const backupRoot = path.join(root, 'backups');
  const archived = fs.readdirSync(backupRoot, { recursive: true }).map(String);
  assert.ok(archived.some(name => name.endsWith(`${previousId}.preview.pdf`)));
}));

test('controller keeps inline preview and supervisor original download paths distinct', async () => {
  const preview = Buffer.from('%PDF-preview');
  const source = Buffer.from('AC1027-source');
  let previewCalls = 0;
  let sourceCalls = 0;
  const svc = {
    findOne: () => ({}),
    getPanelDrawingAssetFile: () => {
      previewCalls += 1;
      return { buffer: preview, filename: 'preview.pdf', contentType: 'application/pdf' };
    },
    getPanelDrawingAssetSourceFile: () => {
      sourceCalls += 1;
      return { buffer: source, filename: 'source.dwg', contentType: 'application/acad' };
    },
  };
  const response = () => ({
    headers: null,
    body: null,
    set(headers) { this.headers = headers; return this; },
    end(body) { this.body = body; return this; },
    status() { return this; },
    json() { return this; },
  });
  const controller = new FramesController(svc, {});
  const user = { role: 'prod_supervisor' };
  const inlineRes = response();
  await controller.panelDrawingAssetFile('PKG_SCOPE', 'frame_a', '2d', user, inlineRes);
  assert.deepEqual(inlineRes.body, preview);
  assert.match(inlineRes.headers['Content-Disposition'], /^inline;/);
  const downloadRes = response();
  await controller.panelDrawingAssetDownload('PKG_SCOPE', 'frame_a', '2d', downloadRes);
  assert.deepEqual(downloadRes.body, source);
  assert.match(downloadRes.headers['Content-Disposition'], /^attachment;/);
  assert.equal(previewCalls, 1);
  assert.equal(sourceCalls, 1);
});
