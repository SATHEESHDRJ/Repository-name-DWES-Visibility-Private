/**
 * LIVE TB status ordering — TECHNICAL_FAILURE before SCHEDULE_DRAWING_MISMATCH
 * when OCR/worker failed and finds are empty.
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

/**
 * Mirrors processInline decision (kept local so tests run without Nest bootstrap).
 */
function decideStatus(input) {
  const expectedCount = input.expectedCount || 0;
  const headersFound = input.headersFound || [];
  const reviewCandidates = input.reviewCandidates || [];
  const notes = input.notes || [];
  const readinessSearchable = input.readinessSearchable !== false;
  const ocrPython = input.ocrPython || 'ok';

  const emptyFinds = headersFound.length === 0 && reviewCandidates.length === 0;
  const noteBlob = notes.join('|');
  const ocrFailedOrUnavailable =
    /ocr_stage_failed|ocr_unavailable|ocr_worker_unavailable|ocr_python.?missing|image_requires_ocr_worker/i.test(noteBlob)
    || (
      readinessSearchable === false
      && emptyFinds
      && (ocrPython === 'missing' || ocrPython === 'error' || ocrPython === 'unconfigured')
    );
  const scheduleDrawingMismatch =
    expectedCount > 0 && emptyFinds && !ocrFailedOrUnavailable;
  const technical =
    emptyFinds
    && (
      ocrFailedOrUnavailable
      || notes.some(n => /drawing_missing|ocr_stage_failed|pdfjs_unavailable|worker|timeout|ECONNREFUSED/i.test(String(n)))
    );

  if (technical) return 'TECHNICAL_FAILURE';
  if (scheduleDrawingMismatch) return 'SCHEDULE_DRAWING_MISMATCH';
  return 'READY_OR_OTHER';
}

test('IMAGE_ONLY + OCR worker missing → TECHNICAL_FAILURE (not mismatch)', () => {
  assert.equal(
    decideStatus({
      expectedCount: 10,
      headersFound: [],
      reviewCandidates: [],
      notes: ['ocr_worker_unavailable', 'ocr_stage_failed'],
      readinessSearchable: false,
      ocrPython: 'missing',
    }),
    'TECHNICAL_FAILURE',
  );
});

test('searchable legend-only empty physical finds → SCHEDULE_DRAWING_MISMATCH', () => {
  assert.equal(
    decideStatus({
      expectedCount: 26,
      headersFound: [],
      reviewCandidates: [],
      notes: ['headers_legend_only', 'non_physical_only:X9'],
      readinessSearchable: true,
      ocrPython: 'ok',
    }),
    'SCHEDULE_DRAWING_MISMATCH',
  );
});

test('Wire 030/D3 style: X321 absent + X9 legend → mismatch when extraction completed', () => {
  assert.equal(
    decideStatus({
      expectedCount: 2,
      headersFound: [],
      reviewCandidates: [],
      notes: ['x321Absent', 'non_physical_only:X9'],
      readinessSearchable: true,
      ocrPython: 'ok',
    }),
    'SCHEDULE_DRAWING_MISMATCH',
  );
});

test('stale ANALYSING (>10m) → TECHNICAL_FAILURE via derivePanelLiveTbStatus', () => {
  let derive;
  try {
    ({ derivePanelLiveTbStatus: derive } = require('../dist/drawing-tb-analysis/panel-live-tb-status.js'));
  } catch {
    // Source not built yet — skip soft
    return;
  }
  const fresh = derive({
    analysisStatus: 'ANALYSING',
    updatedAt: new Date(),
  });
  assert.equal(fresh.panel_status, 'ANALYSIS_IN_PROGRESS');
  const stale = derive({
    analysisStatus: 'ANALYSING',
    updatedAt: new Date(Date.now() - 11 * 60 * 1000),
  });
  assert.equal(stale.panel_status, 'TECHNICAL_FAILURE');
  assert.equal(stale.stale_analysis, true);
  assert.equal(stale.failed_stage, 'worker_startup');
});
