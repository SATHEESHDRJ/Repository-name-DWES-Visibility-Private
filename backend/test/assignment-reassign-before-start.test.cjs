/**
 * Pure unit tests for assignment lifecycle / reassign-before-start policy helpers.
 */
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const {
  deriveAssignmentLifecycle,
  assignmentActionPolicy,
  buildAssignmentActionPolicy,
  isAssignableBeforeStart,
  hasAssignmentCableWork,
} = require('../dist/common/assignment-lifecycle.js');

describe('assignment-lifecycle', () => {
  it('derives UNASSIGNED for null / reassigned', () => {
    assert.equal(deriveAssignmentLifecycle(null), 'UNASSIGNED');
    assert.equal(deriveAssignmentLifecycle({ status: 'reassigned' }), 'UNASSIGNED');
    assert.equal(deriveAssignmentLifecycle({ status: 'mid_changed' }), 'UNASSIGNED');
  });

  it('derives ASSIGNED_NOT_STARTED for virgin assigned row', () => {
    const a = {
      status: 'assigned',
      started_at: null,
      changeover_locked: false,
      handover_from_id: null,
      cable_status: '{"0":{"src":false,"dst":false,"note":""}}',
      cables_src_done: 0,
      cables_dst_done: 0,
    };
    assert.equal(deriveAssignmentLifecycle(a), 'ASSIGNED_NOT_STARTED');
    assert.equal(isAssignableBeforeStart(a), true);
  });

  it('derives IN_PROGRESS when assigned has started_at or cable work', () => {
    assert.equal(
      deriveAssignmentLifecycle({ status: 'assigned', started_at: new Date() }),
      'IN_PROGRESS',
    );
    assert.equal(
      deriveAssignmentLifecycle({
        status: 'assigned',
        started_at: null,
        cable_status: '{"0":{"src":true,"dst":false}}',
      }),
      'IN_PROGRESS',
    );
    assert.equal(
      deriveAssignmentLifecycle({ status: 'assigned', handover_from_id: 9 }),
      'IN_PROGRESS',
    );
    assert.equal(deriveAssignmentLifecycle({ status: 'in_progress' }), 'IN_PROGRESS');
  });

  it('derives PAUSED and COMPLETED', () => {
    assert.equal(deriveAssignmentLifecycle({ status: 'paused' }), 'PAUSED');
    assert.equal(deriveAssignmentLifecycle({ status: 'completed' }), 'COMPLETED');
  });

  it('assignmentActionPolicy flags match lifecycle', () => {
    assert.deepEqual(assignmentActionPolicy('UNASSIGNED'), {
      lifecycle: 'UNASSIGNED',
      can_assign: true,
      can_reassign: false,
      can_mid_change: false,
    });
    assert.deepEqual(assignmentActionPolicy('ASSIGNED_NOT_STARTED'), {
      lifecycle: 'ASSIGNED_NOT_STARTED',
      can_assign: false,
      can_reassign: true,
      can_mid_change: false,
    });
    assert.deepEqual(assignmentActionPolicy('IN_PROGRESS'), {
      lifecycle: 'IN_PROGRESS',
      can_assign: false,
      can_reassign: false,
      can_mid_change: true,
    });
    assert.deepEqual(assignmentActionPolicy('PAUSED'), {
      lifecycle: 'PAUSED',
      can_assign: false,
      can_reassign: false,
      can_mid_change: true,
    });
    assert.deepEqual(assignmentActionPolicy('COMPLETED'), {
      lifecycle: 'COMPLETED',
      can_assign: false,
      can_reassign: false,
      can_mid_change: false,
    });
  });

  it('buildAssignmentActionPolicy composes lifecycle + flags', () => {
    const virgin = buildAssignmentActionPolicy({
      status: 'assigned',
      started_at: null,
      cable_status: '{}',
    });
    assert.equal(virgin.lifecycle, 'ASSIGNED_NOT_STARTED');
    assert.equal(virgin.can_reassign, true);
    assert.equal(virgin.can_mid_change, false);

    const working = buildAssignmentActionPolicy({
      status: 'assigned',
      started_at: null,
      cables_src_done: 1,
    });
    assert.equal(working.lifecycle, 'IN_PROGRESS');
    assert.equal(working.can_mid_change, true);
    assert.equal(working.can_reassign, false);
  });

  it('isAssignableBeforeStart rejects started / locked / handover / work', () => {
    assert.equal(isAssignableBeforeStart({
      status: 'assigned',
      started_at: null,
      changeover_locked: false,
      handover_from_id: null,
      cable_status: '{}',
    }), true);
    assert.equal(isAssignableBeforeStart({
      status: 'assigned',
      started_at: new Date(),
    }), false);
    assert.equal(isAssignableBeforeStart({
      status: 'assigned',
      changeover_locked: true,
    }), false);
    assert.equal(isAssignableBeforeStart({
      status: 'assigned',
      handover_from_id: 3,
    }), false);
    assert.equal(isAssignableBeforeStart({
      status: 'in_progress',
    }), false);
  });

  it('hasAssignmentCableWork detects counters and ends', () => {
    assert.equal(hasAssignmentCableWork({ cables_src_done: 1 }), true);
    assert.equal(hasAssignmentCableWork({
      cable_status: '{"0":{"src":false,"dst":true}}',
    }), true);
    assert.equal(hasAssignmentCableWork({
      cables_src_done: 0,
      cables_dst_done: 0,
      cable_status: '{"0":{"src":false,"dst":false}}',
    }), false);
  });
});
