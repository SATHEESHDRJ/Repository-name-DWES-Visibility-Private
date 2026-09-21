const test = require('node:test');
const assert = require('node:assert/strict');

const {
  assessOversizedPage,
  clampCanvasRenderScale,
  DEFAULT_PAGE_PIXEL_BUDGET,
} = require('../dist/drawing-tb-analysis/oversized-page.util');

const {
  upsertDrawingJob,
  advanceLifecycle,
  makeJobId,
  _resetDrawingJobsForTests,
} = require('../dist/drawing-tb-analysis/drawing-process-job');

test('assessOversizedPage: huge pixmap is unsafe with preview scale', () => {
  const a = assessOversizedPage({ widthPx: 20000, heightPx: 14000, dpi: 400 });
  assert.equal(a.unsafe, true);
  assert.ok(a.previewScale < 1);
  assert.ok(a.previewWidthPx <= DEFAULT_PAGE_PIXEL_BUDGET.previewMaxEdgePx);
  assert.equal(a.lifecycleHint, 'PARTIAL');
  assert.ok(String(a.reason).includes('edge') || String(a.reason).includes('pixels'));
});

test('assessOversizedPage: normal page READY', () => {
  const a = assessOversizedPage({ widthPx: 2000, heightPx: 1500, dpi: 150 });
  assert.equal(a.unsafe, false);
  assert.equal(a.previewScale, 1);
  assert.equal(a.lifecycleHint, 'READY');
});

test('assessOversizedPage: invalid dimensions FAILED', () => {
  const a = assessOversizedPage({ widthPx: 0, heightPx: 100 });
  assert.equal(a.unsafe, true);
  assert.equal(a.lifecycleHint, 'FAILED');
});

test('clampCanvasRenderScale reduces DPR or scale under budget', () => {
  const c = clampCanvasRenderScale({
    viewportWidth: 8000,
    viewportHeight: 6000,
    pixelRatio: 2,
  });
  assert.equal(c.clamped, true);
  assert.ok(c.scaleFactor < 1 || c.pixelRatio < 2);
});

test('drawing process job lifecycle QUEUED→PROCESSING→PARTIAL→READY', () => {
  _resetDrawingJobsForTests();
  const id = makeJobId('003', 'frame_x', 'abc');
  let job = upsertDrawingJob({
    id,
    project_code: '003',
    frame_id: 'frame_x',
    drawing_checksum: 'abc',
    status: 'QUEUED',
    stage: 'upload',
    reason: null,
    preview_cache_key: null,
  });
  assert.equal(job.status, 'QUEUED');
  const started = advanceLifecycle(job.status, 'start');
  job = upsertDrawingJob({ ...job, status: started.status, stage: 'ocr' });
  assert.equal(job.status, 'PROCESSING');
  const partial = advanceLifecycle(job.status, 'ocr_partial', 'oversized_preview_ocr');
  job = upsertDrawingJob({ ...job, status: partial.status, reason: partial.reason, stage: 'preview' });
  assert.equal(job.status, 'PARTIAL');
  const done = advanceLifecycle(job.status, 'complete');
  job = upsertDrawingJob({ ...job, status: done.status, stage: 'done', reason: null });
  assert.equal(job.status, 'READY');
});
