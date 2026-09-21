const test = require('node:test');
const assert = require('node:assert/strict');
const ExcelJS = require('exceljs');
const { NotFoundException } = require('@nestjs/common');
const { JobsService } = require('../dist/jobs/jobs.service');
const { UploadService } = require('../dist/upload/upload.service');
const { WiringDocumentService } = require('../dist/projects/wiring-document.service');
const { MockStore } = require('../dist/data/mock-store');

function fakeJobsPrisma() {
  const rows = new Map();
  return {
    background_jobs: {
      create: async ({ data }) => {
        const row = { attempts: 0, result: null, safe_error: null, started_at: null, finished_at: null, ...data };
        rows.set(row.id, row);
        return row;
      },
      update: async ({ where, data }) => {
        const existing = rows.get(where.id) ?? { id: where.id };
        const updated = { ...existing, ...data };
        rows.set(where.id, updated);
        return updated;
      },
      findUnique: async ({ where }) => rows.get(where.id) ?? null,
    },
  };
}

async function waitForTerminalStatus(service, jobId, { timeoutMs = 2_000 } = {}) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const job = await service.getJob(jobId);
    if (job && (job.status === 'COMPLETED' || job.status === 'FAILED')) return job;
    await new Promise(resolve => setTimeout(resolve, 10));
  }
  throw new Error(`job ${jobId} did not reach a terminal status within ${timeoutMs}ms`);
}

// REDIS_URL is unset in this test process, so every job below runs through
// JobsService's existing in-memory fallback (onModuleInit never called / no-op) —
// the same path a single dev instance uses today. This exercises the pluggable
// registerHandler mechanism itself, independent of Redis being available.

test('JobsService.registerHandler: a successful handler reaches COMPLETED with its real result and reported progress', async () => {
  const service = new JobsService(fakeJobsPrisma());
  const progressSeen = [];
  service.registerHandler('demo_ok', async (payload, report) => {
    await report(40);
    progressSeen.push(40);
    await report(75);
    progressSeen.push(75);
    return { echoed: payload.value };
  });

  const created = await service.createJob({
    jobType: 'demo_ok', projectCode: 'PRJ', frameId: 'F1', requestedBy: 1, payload: { value: 'hello' },
  });
  const finished = await waitForTerminalStatus(service, created.id);

  assert.equal(finished.status, 'COMPLETED');
  assert.deepEqual(finished.result, { echoed: 'hello' });
  assert.deepEqual(progressSeen, [40, 75]);
});

test('JobsService.registerHandler: a failing handler reaches FAILED with the real error, never a fabricated success', async () => {
  const service = new JobsService(fakeJobsPrisma());
  service.registerHandler('demo_fail', async () => {
    throw new Error('parser rejected the input: bad column mapping');
  });

  const created = await service.createJob({
    jobType: 'demo_fail', projectCode: 'PRJ', frameId: 'F1', requestedBy: 1, payload: {},
  });
  const finished = await waitForTerminalStatus(service, created.id);

  assert.equal(finished.status, 'FAILED');
  assert.equal(finished.result, null, 'a failed job must never carry a fabricated result payload');
  assert.match(finished.safe_error || '', /bad column mapping/);
});

test('JobsService.registerHandler: registering the same job type twice fails clearly', () => {
  const service = new JobsService(fakeJobsPrisma());
  service.registerHandler('demo_dup', async () => ({}));
  assert.throws(() => service.registerHandler('demo_dup', async () => ({})), /already registered/);
});

test('JobsService.retryJob: re-invokes the registered handler and can recover a job that previously failed', async () => {
  const service = new JobsService(fakeJobsPrisma());
  let attempt = 0;
  service.registerHandler('demo_retry', async () => {
    attempt += 1;
    if (attempt === 1) throw new Error('transient failure');
    return { attempt };
  });

  const created = await service.createJob({
    jobType: 'demo_retry', projectCode: 'PRJ', frameId: 'F1', requestedBy: 1, payload: {},
  });
  const firstOutcome = await waitForTerminalStatus(service, created.id);
  assert.equal(firstOutcome.status, 'FAILED');

  await service.retryJob(created.id);
  const secondOutcome = await waitForTerminalStatus(service, created.id);
  assert.equal(secondOutcome.status, 'COMPLETED');
  assert.deepEqual(secondOutcome.result, { attempt: 2 });
  assert.equal(attempt, 2, 'retry must actually re-run the handler, not replay a cached result');
});

test('UploadService.enqueueMappedUpload: rejects with 404 when DWES_ASYNC_EXCEL_PROCESSING is not enabled (default)', async () => {
  delete process.env.DWES_ASYNC_EXCEL_PROCESSING;
  const upload = new UploadService({}, {}, new JobsService(fakeJobsPrisma()));
  await assert.rejects(
    () => upload.enqueueMappedUpload('PRJ', Buffer.from('x'), 'f.xlsx', 'SHEET', { ferrule: 'F' }, 1),
    (err) => err instanceof NotFoundException,
  );
});

test('UploadService async excel_parse: end-to-end through JobsService reuses the real uploadMapped parser (no duplicated logic)', async () => {
  process.env.DWES_ASYNC_EXCEL_PROCESSING = 'true';
  // No pre-existing targetFrameId: uploadMapped's create-new-panel path (a targetFrameId
  // would require that panel to already exist in MockStore — that's the update path).
  const projectCode = 'ASYNC_EXCEL_TEST';
  try {
    const jobs = new JobsService(fakeJobsPrisma());
    const prisma = {
      projects: { findFirst: async () => ({ code: projectCode, is_active: true, name: 'Async Excel Test' }) },
      file_hashes: { findFirst: async () => null, create: async () => ({}) },
      ga_asset_sets: { updateMany: async () => ({ count: 0 }) },
    };
    const upload = new UploadService(prisma, {}, jobs);
    upload.onModuleInit(); // normally called by Nest; invoked directly since this test builds the service by hand

    const mapping = {
      sno: 'S.NO', ferrule: 'FERRULE', source_device: 'SOURCE DEVICE', source_terminal: 'SOURCE TERMINAL',
      dest_device: 'DEST DEVICE', dest_terminal: 'DEST TERMINAL', color: 'WIRE COLOR', size: 'WIRE SIZE',
    };
    const headers = Object.values(mapping);
    const book = new ExcelJS.Workbook();
    book.addWorksheet('WIRING').addRows([
      headers,
      [1, 'F-001', 'SRC-1', 'X1', 'DST-1', 'Y1', 'GREY', '1.5 SQ.mm'],
      [2, 'F-002', 'SRC-2', 'X2', 'DST-2', 'Y2', 'GREY', '1.5 SQ.mm'],
    ]);
    const buffer = Buffer.from(await book.xlsx.writeBuffer());

    const created = await upload.enqueueMappedUpload(
      projectCode, buffer, 'async-test.xlsx', 'WIRING', mapping, 1, 0, undefined,
    );
    assert.equal(created.status, 'QUEUED');

    const finished = await waitForTerminalStatus(jobs, created.id);
    assert.equal(finished.status, 'COMPLETED', finished.safe_error || '');
    assert.match(finished.result?.message || '', /Parsed 2 cables successfully/);

    const persisted = MockStore.frames.find(f => f.project_code === projectCode);
    assert.ok(persisted, 'the async job must persist through the exact same uploadMapped path as the sync endpoint');
    assert.equal(persisted.cables.length, 2);
  } finally {
    delete process.env.DWES_ASYNC_EXCEL_PROCESSING;
    MockStore.frames = MockStore.frames.filter(f => f.project_code !== projectCode);
  }
});

test('WiringDocumentService.enqueuePanelCompletionReport: rejects with 404 when DWES_ASYNC_REPORT_GENERATION is not enabled (default)', async () => {
  delete process.env.DWES_ASYNC_REPORT_GENERATION;
  const doc = new WiringDocumentService({}, new JobsService(fakeJobsPrisma()));
  await assert.rejects(
    () => doc.enqueuePanelCompletionReport('PRJ', 'F1', 1),
    (err) => err instanceof NotFoundException,
  );
});

test('WiringDocumentService async pdf_report: registers its handler only when the flag is enabled', () => {
  delete process.env.DWES_ASYNC_REPORT_GENERATION;
  const offJobs = new JobsService(fakeJobsPrisma());
  new WiringDocumentService({}, offJobs).onModuleInit();
  // Flag off: WiringDocumentService must not have claimed 'pdf_report' — registering
  // it here must succeed (nothing else got there first).
  assert.doesNotThrow(() => offJobs.registerHandler('pdf_report', async () => ({})));

  process.env.DWES_ASYNC_REPORT_GENERATION = 'true';
  try {
    const onJobs = new JobsService(fakeJobsPrisma());
    new WiringDocumentService({}, onJobs).onModuleInit();
    // Flag on: WiringDocumentService must already have claimed 'pdf_report'.
    assert.throws(
      () => onJobs.registerHandler('pdf_report', async () => ({})),
      /already registered/,
    );
  } finally {
    delete process.env.DWES_ASYNC_REPORT_GENERATION;
  }
});
