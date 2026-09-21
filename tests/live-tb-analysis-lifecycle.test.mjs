/**
 * LIVE TB analysis lifecycle chip — never leave forever "in progress".
 * Mirrors LiveTbViewModal derivation for QUEUED/PROCESSING/READY/PARTIAL/FAILED.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

function deriveLifecycle({
  analysisStatus = '',
  panelStatus = '',
  analysisStatusResolved = false,
  matchLoading = false,
  pendingStatuses = [
    'ANALYSIS_PENDING', 'ANALYSING', 'ENRICHMENT_RETRY', 'UPLOADED',
    'REANALYSIS_REQUIRED', 'ANALYSIS_IN_PROGRESS', 'QUEUED', 'PROCESSING',
  ],
  hasPaint = false,
  scheduleMismatch = false,
}) {
  const pendingAnalysis = pendingStatuses.includes(analysisStatus)
    || panelStatus === 'ANALYSIS_IN_PROGRESS';
  const analysisStatusPending = !analysisStatusResolved && matchLoading;
  const analysisReady = ['READY_FOR_LIVE_TB', 'PARTIAL_DETECTION', 'READY', 'PARTIAL'].includes(analysisStatus)
    || panelStatus === 'READY_FOR_LIVE_TB';
  const analysisFailed = ['FAILED', 'TECHNICAL_FAILURE', 'DETECTION_FAILED'].includes(analysisStatus)
    || panelStatus === 'TECHNICAL_FAILURE';

  if (pendingAnalysis || analysisStatusPending) {
    return analysisStatus === 'QUEUED' || analysisStatus === 'UPLOADED' ? 'QUEUED' : 'PROCESSING';
  }
  if (analysisFailed || scheduleMismatch || panelStatus === 'SCHEDULE_DRAWING_MISMATCH') return 'FAILED';
  if (
    analysisStatus === 'PARTIAL'
    || analysisStatus === 'PARTIAL_DETECTION'
    || panelStatus === 'SUPERVISOR_VERIFICATION_REQUIRED'
  ) {
    return 'PARTIAL';
  }
  if (analysisReady || hasPaint) return 'READY';
  if (analysisStatusResolved) return 'PARTIAL';
  return null;
}

test('empty status after resolve is PARTIAL — not forever PROCESSING', () => {
  assert.equal(
    deriveLifecycle({ analysisStatus: '', analysisStatusResolved: true, matchLoading: false }),
    'PARTIAL',
  );
});

test('match still loading without status → PROCESSING', () => {
  assert.equal(
    deriveLifecycle({ analysisStatus: '', analysisStatusResolved: false, matchLoading: true }),
    'PROCESSING',
  );
});

test('QUEUED status → QUEUED chip', () => {
  assert.equal(
    deriveLifecycle({ analysisStatus: 'QUEUED', analysisStatusResolved: true }),
    'QUEUED',
  );
});

test('READY_FOR_LIVE_TB → READY', () => {
  assert.equal(
    deriveLifecycle({ analysisStatus: 'READY_FOR_LIVE_TB', analysisStatusResolved: true }),
    'READY',
  );
});

test('TECHNICAL_FAILURE with reason path → FAILED', () => {
  assert.equal(
    deriveLifecycle({
      analysisStatus: 'DETECTION_FAILED',
      panelStatus: 'TECHNICAL_FAILURE',
      analysisStatusResolved: true,
    }),
    'FAILED',
  );
});

test('SCHEDULE_DRAWING_MISMATCH → FAILED (not stuck in progress)', () => {
  assert.equal(
    deriveLifecycle({
      analysisStatus: 'SCHEDULE_DRAWING_MISMATCH',
      panelStatus: 'SCHEDULE_DRAWING_MISMATCH',
      analysisStatusResolved: true,
      scheduleMismatch: true,
    }),
    'FAILED',
  );
});
