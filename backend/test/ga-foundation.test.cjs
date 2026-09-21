const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

// Compiled-output convention used by the backend test suite.
const {
  assertNormalizedRect,
  calculateTerminalPoints,
  normalizeDeviceTag,
  normalizeEndpointReference,
  normalizeTerminal,
  parseCombinedEndpoint,
  validateCatalogItems,
} = require('../dist/ga-foundation/ga-mapping.util');
const { JobQueueService } = require('../dist/ga-foundation/job-queue.service');
const { GaFoundationService } = require('../dist/ga-foundation/ga-foundation.service');
const { LocalLibreDwgProvider } = require('../dist/ga-foundation/cad-conversion.provider');
const { MockStore } = require('../dist/data/mock-store');
const { FrameStore } = require('../dist/frames/frame-store');
const { UploadService } = require('../dist/upload/upload.service');
const { _resetWiringDbTableCacheForTests } = require('../dist/common/wiring-db-tables');

beforeEach(() => {
  MockStore.frames.length = 0;
  MockStore.drawings.length = 0;
  delete process.env.DWES_GA_TERMINAL_PREFIXES;
  _resetWiringDbTableCacheForTests();
});

/** Prisma mock whose $queryRaw advertises every optional engineering table as present. */
function gaAwarePrisma(extra = {}) {
  return {
    $queryRaw: async () => [
      ...['users','projects','tech_assignments','panel_inspections','file_hashes','tech_audit_log','session_log'],
      ...['ga_finalization_decisions','ga_correlation_results','ga_faces','ga_asset_sets','background_jobs','mapping_issues','cable_route_mappings','terminal_geometries','duct_segments','duct_nodes','device_geometries','panel_models','drawing_assets'],
    ].map(tablename => ({ tablename })),
    ...extra,
  };
}

test('GA normalization is deterministic and preserves meaningful engineering characters', () => {
  assert.equal(normalizeDeviceTag('  -TB_1 /A+2.3  '), 'TB1/A+2.3');
  assert.equal(normalizeTerminal(' X-001 '), '001');
  assert.equal(normalizeTerminal('17A'), '17A');
  assert.equal(normalizeEndpointReference('-TB_1/A', 'X-001'), 'TB1/A:001');
  assert.deepEqual(parseCombinedEndpoint('-TB_1/A:X-001'), { device: '-TB_1/A', terminal: 'X-001' });
  assert.deepEqual(parseCombinedEndpoint('DEVICE-A 17'), { device: 'DEVICE-A', terminal: '17' });
});

test('terminal point generation is deterministic for horizontal and reversed vertical blocks', () => {
  const rect = { x: 0.1, y: 0.2, width: 0.4, height: 0.3 };
  const horizontal = calculateTerminalPoints(rect, {
    tag: '-X1', count: 3, firstTerminalNumber: '01', pitch: 0.1,
    orientation: 'horizontal', reversed: false,
  });
  assert.deepEqual(horizontal, [
    { terminalNumber: '01', terminalIndex: 0, normalizedX: 0.1, normalizedY: 0.35 },
    { terminalNumber: '02', terminalIndex: 1, normalizedX: 0.2, normalizedY: 0.35 },
    { terminalNumber: '03', terminalIndex: 2, normalizedX: 0.30000000000000004, normalizedY: 0.35 },
  ]);

  const vertical = calculateTerminalPoints(rect, {
    tag: '-X2', count: 3, firstTerminalNumber: '7', pitch: 0.05,
    orientation: 'vertical', reversed: true,
  });
  assert.deepEqual(vertical.map(point => ({ n: point.terminalNumber, x: point.normalizedX, y: point.normalizedY })), [
    { n: '7', x: 0.30000000000000004, y: 0.30000000000000004 },
    { n: '8', x: 0.30000000000000004, y: 0.25 },
    { n: '9', x: 0.30000000000000004, y: 0.2 },
  ]);
});

test('mapping validation rejects out-of-bounds geometry, excess pitch, and ambiguous tags', () => {
  assert.throws(
    () => assertNormalizedRect({ x: 0.9, y: 0, width: 0.2, height: 0.2 }),
    /inside the normalized face bounds/,
  );
  assert.throws(
    () => calculateTerminalPoints(
      { x: 0, y: 0, width: 0.1, height: 0.2 },
      { tag: 'X1', count: 3, firstTerminalNumber: '1', pitch: 0.1, orientation: 'horizontal', reversed: false },
    ),
    /exceed the mapped terminal-block rectangle/,
  );
  const item = tag => ({
    tag, type: 'terminal_block', face: 'front',
    rect: { x: 0.1, y: 0.1, width: 0.2, height: 0.2 },
  });
  assert.throws(() => validateCatalogItems([item('-X_1'), item('X-1')]), /Duplicate or ambiguous mapped tag/);
});

function correlationService(assetSet = null) {
  const prisma = gaAwarePrisma({ ga_asset_sets: { findFirst: async () => assetSet } });
  return new GaFoundationService(
    prisma,
    { registerHandler: () => undefined },
    {},
    { publish: () => undefined },
  );
}

function candidate(id, deviceTag, terminalNumber, aliases = []) {
  const normalizedReference = normalizeEndpointReference(deviceTag, terminalNumber);
  return {
    terminal: { id, terminal_number: terminalNumber },
    device: { id: 100 + id, device_tag: deviceTag },
    rawReference: `${deviceTag}:${terminalNumber}`,
    normalizedReference,
    normalizedAliases: aliases.map(alias => normalizeEndpointReference(alias, terminalNumber)),
  };
}

function correlate(service, candidates, sourceDevice, sourceTerminal) {
  return service.correlateEndpoint(
    { id: 'job-correlation', projectCode: 'P1', frameId: 'F1' },
    9,
    'MAP-1',
    'SCHEDULE-1',
    candidates,
    {
      sno: 1, source_device: sourceDevice, source_terminal: sourceTerminal,
      source: `${sourceDevice}:${sourceTerminal}`, dest_device: '', dest_terminal: '', destination: '',
    },
    0,
    'source',
  );
}

test('correlation classifies exact, alias, suggested, unmatched, and ambiguous endpoints without auto-approving fuzzy results', () => {
  const service = correlationService();
  const exact = correlate(service, [candidate(1, 'X5A-C', '23')], 'X5A-C', '23');
  assert.equal(exact.state, 'exact_match');
  assert.equal(exact.method, 'exact_raw');
  assert.equal(exact.review_status, 'resolved');

  const normalized = correlate(service, [candidate(1, 'X5A-C', '23')], 'x5a_c', 'X-23');
  assert.equal(normalized.state, 'exact_match');
  assert.equal(normalized.method, 'exact_normalized');

  const alias = correlate(service, [candidate(2, 'NEW-TB', '1', ['OLD_TB'])], 'old-tb', '1');
  assert.equal(alias.state, 'exact_match');
  assert.equal(alias.method, 'configured_alias');

  const suggested = correlate(service, [candidate(3, 'X5A-C', '23')], 'X5A-B', '23');
  assert.equal(suggested.state, 'suggested_match');
  assert.equal(suggested.review_status, 'pending');
  assert.equal(suggested.final_terminal_id, null, 'fuzzy result must never be silently finalized');

  process.env.DWES_GA_FUZZY_THRESHOLD = '0.95';
  const thresholdRejected = correlate(service, [candidate(3, 'X5A-C', '23')], 'X5A-B', '23');
  delete process.env.DWES_GA_FUZZY_THRESHOLD;
  assert.equal(thresholdRejected.state, 'not_matched');

  const unmatched = correlate(service, [candidate(4, 'X1', '1')], 'UNRELATED', '99');
  assert.equal(unmatched.state, 'not_matched');

  const ambiguous = correlate(
    service,
    [candidate(5, 'X5A-C', '23'), candidate(6, 'X5A-D', '23')],
    'X5A-E',
    '23',
  );
  assert.equal(ambiguous.state, 'duplicate_or_ambiguous');
});

test('a correlation worker rejects stale GA, mapping, or schedule revision payloads before writes', async () => {
  const current = {
    id: 'asset-current', source_revision: 'GA-current', mapping_model_id: 10,
    mapping_revision: 'MAP-current', updated_by: 7,
  };
  const service = correlationService(current);
  await assert.rejects(
    () => service.processCorrelation({
      id: 'job-stale', projectCode: 'P1', frameId: 'F1', requestedBy: 7,
      payload: {
        gaAssetSetId: 'asset-old', sourceRevision: 'GA-old', mappingModelId: 9,
        mappingRevision: 'MAP-old', scheduleRevision: 'schedule-old',
      },
    }),
    /became stale before processing/,
  );
});

function inMemoryQueuePrisma() {
  let row = null;
  return {
    get row() { return row; },
    background_jobs: {
      create: async ({ data }) => {
        row = {
          id: 'job-1', status: 'queued', attempts: 0, available_at: new Date(0),
          created_at: new Date(), started_at: null, finished_at: null,
          cancel_requested_at: null, lease_owner: null, lease_expires_at: null,
          provider_name: null, provider_version: null, safe_error: null, result: null,
          ...data,
        };
        return row;
      },
      findFirst: async () => row?.status === 'queued' ? row : null,
      findUnique: async () => row,
      updateMany: async ({ where, data }) => {
        if (!row || row.id !== where.id || row.status !== where.status || row.attempts !== where.attempts) return { count: 0 };
        row = { ...row, ...data, attempts: row.attempts + (data.attempts?.increment ?? 0) };
        return { count: 1 };
      },
      update: async ({ data }) => {
        row = { ...row, ...data };
        return row;
      },
    },
  };
}

test('persistent background queue claims and completes a registered job once', async () => {
  const prisma = inMemoryQueuePrisma();
  const published = [];
  const queue = new JobQueueService(prisma, { publish: event => published.push(event) });
  // Keep enqueue deterministic; processAvailableOnce is the explicit test worker.
  queue.stopping = true;
  let calls = 0;
  queue.registerHandler('ga_test', async context => {
    calls += 1;
    assert.equal(context.attempt, 1);
    assert.deepEqual(context.payload, { source: 'revision-1' });
    return { status: 'completed', result: { ok: true } };
  });
  const enqueued = await queue.enqueue({
    jobType: 'ga_test', projectCode: 'P1', frameId: 'F1', requestedBy: 7,
    payload: { source: 'revision-1' }, maxAttempts: 2,
  });
  assert.equal(enqueued.status, 'queued');
  assert.equal(await queue.processAvailableOnce(), true);
  assert.equal(calls, 1);
  assert.equal(prisma.row.status, 'completed');
  assert.deepEqual(prisma.row.result, { ok: true });
  assert.equal(await queue.processAvailableOnce(), false);
  assert.equal(published.length, 2);
});

test('LibreDWG provider fails closed when unconfigured and keeps command placeholders as shell-free argv', async () => {
  const provider = new LocalLibreDwgProvider();
  delete process.env.DWES_LIBREDWG_BIN_DIR;
  const health = await provider.healthCheck();
  assert.equal(health.available, false);
  assert.match(health.detail, /not configured/);
  const args = provider.resolveArgs(
    ['-o', '{output}', '{input}', '--label=literal;whoami'],
    'C:\\safe source\\input&whoami.dwg',
    'C:\\safe output\\converted.dxf',
  );
  assert.deepEqual(args, [
    '-o', 'C:\\safe output\\converted.dxf', 'C:\\safe source\\input&whoami.dwg', '--label=literal;whoami',
  ]);
});

test('LibreDWG external-process adapter validates output, crash, timeout, size bound, and temp cleanup', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dwes-cad-provider-test-'));
  const bin = path.join(root, 'bin');
  fs.mkdirSync(bin);
  const extension = process.platform === 'win32' ? '.exe' : '';
  fs.copyFileSync(process.execPath, path.join(bin, `dwgread${extension}`));
  fs.copyFileSync(process.execPath, path.join(bin, `dwg2dxf${extension}`));
  const sourcePath = path.join(root, 'source&literal-command-text.dwg');
  fs.writeFileSync(sourcePath, Buffer.from('AC1027\0test-source'));
  const stored = { path: sourcePath, originalName: path.basename(sourcePath), size: fs.statSync(sourcePath).size };
  const provider = new LocalLibreDwgProvider();
  const priorTempDirs = new Set(fs.readdirSync(os.tmpdir()).filter(name => name.startsWith('dwes-ga-cad-')));
  process.env.DWES_LIBREDWG_BIN_DIR = bin;
  process.env.DWES_CAD_TIMEOUT_MS = '1000';
  process.env.DWES_CAD_MAX_OUTPUT_MB = '1';
  try {
    process.env.DWES_LIBREDWG_DWG2DXF_ARGS_JSON = JSON.stringify([
      '-e',
      "require('fs').writeFileSync(process.argv[1], '0\\nSECTION\\n2\\nHEADER\\n0\\nENDSEC\\n0\\nEOF\\n')",
      '{output}',
      '{input}',
    ]);
    const converted = await provider.convertToDxf(stored);
    assert.equal(converted.format, 'dxf');
    assert.match(converted.buffer.toString('utf8'), /SECTION/);

    process.env.DWES_LIBREDWG_DWG2DXF_ARGS_JSON = JSON.stringify([
      '-e', 'process.exit(9)', '{input}', '{output}',
    ]);
    await assert.rejects(() => provider.convertToDxf(stored));

    process.env.DWES_LIBREDWG_DWG2DXF_ARGS_JSON = JSON.stringify([
      '-e', 'setTimeout(() => {}, 5000)', '{input}', '{output}',
    ]);
    const timeoutStarted = Date.now();
    await assert.rejects(() => provider.convertToDxf(stored));
    assert.ok(Date.now() - timeoutStarted < 15000, 'configured timeout must terminate the converter');

    process.env.DWES_LIBREDWG_DWG2DXF_ARGS_JSON = JSON.stringify([
      '-e', "require('fs').writeFileSync(process.argv[1], Buffer.alloc(1024 * 1024 + 1, 65))", '{output}', '{input}',
    ]);
    await assert.rejects(() => provider.convertToDxf(stored), /exceeds the configured limit/);
  } finally {
    delete process.env.DWES_LIBREDWG_BIN_DIR;
    delete process.env.DWES_CAD_TIMEOUT_MS;
    delete process.env.DWES_CAD_MAX_OUTPUT_MB;
    delete process.env.DWES_LIBREDWG_DWG2DXF_ARGS_JSON;
    fs.rmSync(root, { recursive: true, force: true });
  }
  const leaked = fs.readdirSync(os.tmpdir())
    .filter(name => name.startsWith('dwes-ga-cad-') && !priorTempDirs.has(name));
  assert.deepEqual(leaked, []);
});

function uploadPrisma() {
  const drawingRows = [];
  const hashRows = [];
  const prisma = {
    projects: { findFirst: async ({ where }) => where.code === 'P-UPLOAD' ? { code: 'P-UPLOAD', is_active: true } : null },
    drawing_assets: {
      count: async ({ where }) => drawingRows.filter(row => row.project_code === where.project_code
        && row.frame_id === where.frame_id && row.drawing_type === where.drawing_type).length,
      updateMany: async ({ where, data }) => {
        let count = 0;
        for (const row of drawingRows) {
          if (row.project_code === where.project_code && row.frame_id === where.frame_id
              && row.drawing_type === where.drawing_type && row.superseded_at === null) {
            Object.assign(row, data);
            count += 1;
          }
        }
        return { count };
      },
      create: async ({ data }) => {
        const row = { id: drawingRows.length + 1, superseded_at: null, ...data };
        drawingRows.push(row);
        return row;
      },
    },
    file_hashes: {
      findFirst: async ({ where }) => hashRows.find(row => row.file_hash === where.file_hash) ?? null,
      create: async ({ data }) => { hashRows.push(data); return data; },
    },
    $transaction: async callback => callback(prisma),
    drawingRows,
    hashRows,
  };
  return prisma;
}

test('panel GA upload preserves validated bytes, SHA/revisions, fallback formats, and panel isolation', async () => {
  const uploadRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'dwes-ga-upload-test-'));
  process.env.UPLOAD_DIR = uploadRoot;
  const frame = {
    id: 'F-UPLOAD', project_code: 'P-UPLOAD', panel_name: 'Upload Test Panel', cables: [],
    uploaded_at: new Date().toISOString(), original_filename: 'schedule.xlsx', compare_status: 'validated',
    cable_count: 0, mapping: {}, sheet_name: 'Sheet1',
  };
  MockStore.frames.push(frame);
  FrameStore.save(frame);
  const prisma = uploadPrisma();
  const gaCalls = { revisions: 0, jobs: 0 };
  const ga = {
    onSourceUploaded: async () => { gaCalls.revisions += 1; return { id: `asset-${gaCalls.revisions}` }; },
    queueCadConversion: async (_project, _frame, assetId) => {
      gaCalls.jobs += 1;
      return { id: `job-${assetId}`, status: 'queued' };
    },
  };
  const service = new UploadService(prisma, ga);
  const pdf = Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF');
  const dxf = Buffer.from('0\nSECTION\n2\nHEADER\n0\nENDSEC\n0\nEOF\n');
  const dwg = Buffer.from('AC1027\0immutable-dwg');
  try {
    const first = await service.uploadGaSource(
      'P-UPLOAD', 'F-UPLOAD', 'front', pdf, '../../front approved.pdf', 'application/pdf', 7,
    );
    assert.equal(first.source.filename, 'front approved.pdf');
    assert.equal(first.source.revision, `GA-1-${crypto.createHash('sha256').update(pdf).digest('hex').slice(0, 12)}`);
    assert.equal(first.source.sha256, crypto.createHash('sha256').update(pdf).digest('hex'));
    assert.deepEqual(FrameStore.getDrawingFile('P-UPLOAD', first.source.drawing_id).buffer, pdf);

    const replacement = await service.uploadGaSource(
      'P-UPLOAD', 'F-UPLOAD', 'front', dxf, 'front-approved.dxf', 'image/vnd.dxf', 7,
    );
    assert.equal(replacement.source.revision.startsWith('GA-2-'), true);
    assert.ok(prisma.drawingRows[0].superseded_at instanceof Date);
    assert.equal(prisma.drawingRows[0].approval_status, 'superseded');

    const cad = await service.uploadGaSource(
      'P-UPLOAD', 'F-UPLOAD', 'rear', dwg, 'rear&literal.dwg', 'application/acad', 7,
    );
    assert.equal(cad.source.conversion_status, 'queued');
    assert.equal(cad.conversion_job.status, 'queued');
    assert.equal(gaCalls.jobs, 1);

    await assert.rejects(
      () => service.uploadGaSource('P-UPLOAD', 'F-UPLOAD', 'front', Buffer.from('not a PDF'), 'fake.pdf', 'application/pdf', 7),
      /signature is invalid/,
    );
    await assert.rejects(
      () => service.uploadGaSource('P-UPLOAD', 'F-UPLOAD', 'front', pdf, 'drawing.pdf.exe', 'application/pdf', 7),
      /GA sources must be PDF, DWG, or DXF files/,
    );
    await assert.rejects(
      () => service.uploadGaSource('P-UPLOAD', 'OTHER-PANEL', 'front', pdf, 'front.pdf', 'application/pdf', 7),
      /Panel OTHER-PANEL not found/,
    );
    await assert.rejects(
      () => service.uploadGaSource('OTHER-PROJECT', 'F-UPLOAD', 'front', pdf, 'front.pdf', 'application/pdf', 7),
      /Project OTHER-PROJECT not found/,
    );
  } finally {
    delete process.env.UPLOAD_DIR;
    fs.rmSync(uploadRoot, { recursive: true, force: true });
  }
});

test('release gate preserves legacy panels and blocks enrolled stale revisions', async () => {
  const frame = {
    id: 'F-GA-1', project_code: 'P-GA-1', panel_name: 'GA Test Panel',
    cables: [{ cable_number: 'C1', source_device: '-X1', source_terminal: '1', destination_device: '-X2', destination_terminal: '2' }],
    uploaded_at: '2026-07-17T00:00:00.000Z', original_filename: 'schedule.xlsx',
    compare_status: 'validated', cable_count: 1, mapping: {}, sheet_name: 'Sheet1',
  };
  MockStore.frames.push(frame);
  let assetSet = null;
  const prisma = gaAwarePrisma({ ga_asset_sets: { findFirst: async () => assetSet } });
  const jobs = { registerHandler: () => undefined };
  const service = new GaFoundationService(prisma, jobs, {}, { publish: () => undefined });

  await service.assertPanelReleased(frame.project_code, frame.id);

  const scheduleRevision = crypto.createHash('sha256').update(JSON.stringify({
    uploaded_at: frame.uploaded_at,
    original_filename: frame.original_filename,
    cables: frame.cables,
  })).digest('hex');
  assetSet = { release_status: 'blocked', released_at: null, schedule_revision: scheduleRevision };
  await assert.rejects(() => service.assertPanelReleased(frame.project_code, frame.id), /not finalized and released/);

  assetSet = { release_status: 'released', released_at: new Date(), schedule_revision: scheduleRevision };
  await service.assertPanelReleased(frame.project_code, frame.id);

  assetSet = { release_status: 'released', released_at: new Date(), schedule_revision: 'stale-revision' };
  await assert.rejects(() => service.assertPanelReleased(frame.project_code, frame.id), /not finalized and released/);
});
