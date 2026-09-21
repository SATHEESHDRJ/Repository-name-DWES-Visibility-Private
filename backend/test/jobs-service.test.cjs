const test = require('node:test');
const assert = require('node:assert/strict');
const { JobsService } = require('../dist/jobs/jobs.service');

// Mirrors backend/prisma/schema.prisma's background_jobs columns exactly. Real Prisma
// throws "Unknown argument" for any field outside this set — this fake does too, so a
// regression like passing a non-existent `progress` column (which silently broke every
// job's status update; see updateJobProgress) fails a unit test instead of only
// surfacing in a live Postgres run.
const BACKGROUND_JOB_COLUMNS = new Set([
  'id', 'job_type', 'project_code', 'frame_id', 'requested_by', 'status', 'payload',
  'result', 'attempts', 'max_attempts', 'available_at', 'lease_owner', 'lease_expires_at',
  'provider_name', 'provider_version', 'safe_error', 'created_at', 'started_at',
  'finished_at', 'cancel_requested_at',
]);

function assertKnownColumns(data) {
  for (const key of Object.keys(data)) {
    if (!BACKGROUND_JOB_COLUMNS.has(key)) {
      throw new Error(`Unknown argument \`${key}\`. Available options are marked with ?.`);
    }
  }
}

function fakePrisma() {
  const rows = new Map();
  return {
    background_jobs: {
      create: async ({ data }) => {
        assertKnownColumns(data);
        const row = { attempts: 0, result: null, safe_error: null, started_at: null, finished_at: null, ...data };
        rows.set(row.id, row);
        return row;
      },
      update: async ({ where, data }) => {
        assertKnownColumns(data);
        const existing = rows.get(where.id) ?? { id: where.id };
        const updated = { ...existing, ...data };
        rows.set(where.id, updated);
        return updated;
      },
      findUnique: async ({ where }) => rows.get(where.id) ?? null,
    },
  };
}

// REDIS_URL is intentionally unset in this test process, so onModuleInit() (never
// called here) would be a no-op anyway — createJob() falls through to the in-memory
// `setImmediate` execution path exercised below, same as a single dev instance today.

async function waitForTerminalStatus(service, jobId, { timeoutMs = 2_000 } = {}) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const job = await service.getJob(jobId);
    if (job && (job.status === 'COMPLETED' || job.status === 'FAILED')) return job;
    await new Promise(resolve => setTimeout(resolve, 10));
  }
  throw new Error(`job ${jobId} did not reach a terminal status within ${timeoutMs}ms`);
}

test('JobsService: an unrecognized job type fails clearly instead of fake-succeeding', async () => {
  const service = new JobsService(fakePrisma());
  const created = await service.createJob({
    jobType: 'totally_unsupported_type',
    projectCode: 'PRJ',
    frameId: 'F1',
    requestedBy: 1,
    payload: {},
  });

  const finished = await waitForTerminalStatus(service, created.id);
  assert.equal(finished.status, 'FAILED');
  assert.match(finished.safe_error || '', /Unsupported job type/);
});

test('JobsService: dwg_convert fails with a clear configuration error and never fabricates a converted result', async () => {
  const service = new JobsService(fakePrisma());
  const created = await service.createJob({
    jobType: 'dwg_convert',
    projectCode: 'PRJ',
    frameId: 'F1',
    requestedBy: 1,
    payload: {},
  });

  const finished = await waitForTerminalStatus(service, created.id);
  assert.equal(finished.status, 'FAILED');
  assert.match(finished.safe_error || '', /not configured/i);
  assert.equal(finished.result, null, 'a failed job must never carry a fabricated result payload');
});

test('JobsService.updateJobProgress: never writes a `progress` column (background_jobs has none) and correctly persists status/timestamps', async () => {
  const service = new JobsService(fakePrisma());
  const created = await service.createJob({
    jobType: 'dwg_convert', // any real (Postgres-backed) job type — exercises the same update path backup_export uses
    projectCode: 'PRJ',
    frameId: 'F1',
    requestedBy: 1,
    payload: {},
  });

  const finished = await waitForTerminalStatus(service, created.id);
  // Reaching FAILED here (rather than timing out) proves updateJobProgress's writes
  // succeeded against the strict fake — the historical bug made every write throw
  // silently, freezing the row at QUEUED with started_at/finished_at forever null.
  assert.equal(finished.status, 'FAILED');
  assert.ok(finished.started_at, 'started_at must be stamped when the job transitions to PROCESSING');
  assert.ok(finished.finished_at, 'finished_at must be stamped once the job reaches a terminal state');
});

test('JobsService.getStatus: reports BullMQ as inactive when REDIS_URL is unset and onModuleInit never ran', () => {
  const service = new JobsService(fakePrisma());
  const status = service.getStatus();
  assert.equal(status.bullmqActive, false);
});
