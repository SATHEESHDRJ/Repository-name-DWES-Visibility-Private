/**
 * Director monitoring aggregation unit tests (no DB).
 */
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const {
  rollupCableStatus,
  classifyCableBucket,
  mapAssignmentStatus,
  projectLifecycleBucket,
  buildOneSideRows,
  isSkippedCable,
} = require('../dist/common/director-monitoring.helper.js');

describe('director-monitoring.helper', () => {
  it('maps assignment statuses', () => {
    assert.equal(mapAssignmentStatus('assigned'), 'not_started');
    assert.equal(mapAssignmentStatus('in_progress'), 'working');
    assert.equal(mapAssignmentStatus('paused'), 'paused');
    assert.equal(mapAssignmentStatus('completed'), 'completed');
  });

  it('maps project lifecycle buckets', () => {
    assert.equal(projectLifecycleBucket('not_started'), 'not_started');
    assert.equal(projectLifecycleBucket('active'), 'in_progress');
    assert.equal(projectLifecycleBucket('wiring_started'), 'in_progress');
    assert.equal(projectLifecycleBucket('completed_by_tech'), 'completed');
  });

  it('rollups mixed cable_status', () => {
    const cs = {
      0: { src: true, dst: true },
      1: { src: true, dst: false },
      2: { src: false, dst: true },
      3: { src: false, dst: false },
      4: { src: false, dst: false, note: '[SKIPPED 2026-01-01] reason' },
      5: { src: true, dst: true, openEnd: 'source', corrected: true },
    };
    const r = rollupCableStatus(cs, 6);
    assert.equal(r.finished, 2);
    assert.equal(r.skipped, 1);
    assert.equal(r.src_only, 1);
    assert.equal(r.dst_only, 1);
    assert.equal(r.both_pending, 1);
    assert.equal(r.both_done, 2);
    assert.equal(r.corrections, 1);
    assert.equal(r.open_source, 1);
    assert.ok(r.progress_pct >= 0);
  });

  it('classifies buckets and skip detection', () => {
    assert.equal(classifyCableBucket({ src: true, dst: false }), 'src_only');
    assert.equal(classifyCableBucket({ src: false, dst: true }), 'dst_only');
    assert.equal(classifyCableBucket({ src: true, dst: true }), 'both_done');
    assert.equal(classifyCableBucket({}), 'both_pending');
    assert.equal(isSkippedCable({ note: '[SKIPPED x] y' }), true);
    assert.equal(classifyCableBucket({ note: '[SKIPPED x] y' }), 'skipped');
  });

  it('buildOneSideRows emits wire refs', () => {
    const rows = buildOneSideRows({
      project_code: '001',
      panel_name: '=P1',
      assignment_id: 9,
      technician_name: 'Tech',
      panel_progress_pct: 50,
      cables_total: 2,
      cable_status: {
        0: { src: true, dst: false },
        1: { src: false, dst: false },
      },
      wireRef: (i) => ({ sno: i + 1, wire_ref: `W${i + 1}` }),
    });
    assert.equal(rows.length, 2);
    assert.equal(rows[0].bucket, 'src_only');
    assert.equal(rows[0].wire_ref, 'W1');
    assert.equal(rows[1].bucket, 'both_pending');
  });
});
