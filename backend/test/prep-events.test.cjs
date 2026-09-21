/**
 * Canonical prep event mapping tests.
 * Run: node --test backend/test/prep-events.test.cjs
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const {
  mapAuditActionToCanonical,
  buildCanonicalPrepEvent,
  sideForCanonicalEvent,
} = require('../dist/common/prep-events');

test('wire_cut → WIRE_CUT / Both', () => {
  assert.equal(mapAuditActionToCanonical('wire_cut'), 'WIRE_CUT');
  assert.equal(sideForCanonicalEvent('WIRE_CUT'), 'Both');
});

test('source_stripped → SRC_STRIPPED', () => {
  assert.equal(mapAuditActionToCanonical('source_stripped'), 'SRC_STRIPPED');
  assert.equal(sideForCanonicalEvent('SRC_STRIPPED'), 'Source');
});

test('buildCanonicalPrepEvent never invents from null audit', () => {
  assert.equal(
    buildCanonicalPrepEvent({
      auditAction: null,
      project_id: '003',
      panel_id: 'FEEDER-1',
      assignment_id: 1,
      wire_id: '20.16:E',
      technician_id: 9,
    }),
    null,
  );
});

test('FINISHED mapping is explicit WIRING_FINISHED only when audit says so', () => {
  const ev = buildCanonicalPrepEvent({
    auditAction: 'wiring_finished',
    project_id: '003',
    panel_id: 'P1',
    assignment_id: 2,
    wire_id: 'w1',
    technician_id: 1,
  });
  assert.equal(ev.event_type, 'WIRING_FINISHED');
});
