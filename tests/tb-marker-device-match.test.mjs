/**
 * TB Marker Match Service — DEVICE endpoint matching tests
 * Tests the Match API's ability to locate both TB_GROUP and DEVICE endpoints independently
 */
import test from 'node:test';
import assert from 'node:assert/strict';

/**
 * Simulated Match API test — validates that DEVICE endpoints are searched by equipment tag
 * rather than being rejected as "not a physical TB header".
 *
 * Real test would use actual service with DB mocked.
 * This validates the logic transformation.
 */

function normalizeDeviceName(value) {
  const s = String(value ?? '').trim().replace(/\s+/g, '').toUpperCase();
  return s.length > 0 ? s : null;
}

function isPhysicalTbHeader(value) {
  const n = String(value ?? '').trim().replace(/\s+/g, '').toUpperCase();
  if (!n || n.length < 2) return false;
  const PHYSICAL_TB_NO_DIGIT = new Set(['XTJ', 'XSH']);
  if (PHYSICAL_TB_NO_DIGIT.has(n)) return true;
  return /^X[A-Z0-9-]*\d[A-Z0-9-]*$/.test(n);
}

/**
 * Simplified marker match logic for testing DEVICE endpoint handling.
 * Real implementation is in tb-marker-match.service.ts matchWireEndpoints()
 */
function matchWireEndpointsSimplified(source, destination, markers) {
  const sourceRaw = String(source.device || '').trim();
  const destRaw = String(destination.device || '').trim();
  const sourceTb = normalizeDeviceName(sourceRaw);
  const destTb = normalizeDeviceName(destRaw);

  const sourceIsPhysical = !!(sourceTb && isPhysicalTbHeader(sourceTb));
  const destIsPhysical = !!(destTb && isPhysicalTbHeader(destTb));

  let srcCandidates = [];
  let srcReason = '';

  // SOURCE MATCHING
  if (!sourceIsPhysical) {
    // Source is DEVICE endpoint (equipment tag)
    const srcEquipment = sourceTb;
    if (!srcEquipment) {
      srcReason = 'Source end is empty.';
    } else {
      // Search by equipment tag, not by TB header
      srcCandidates = markers.filter(m => 
        normalizeDeviceName(m.tb_number) === srcEquipment
      );
      srcReason = srcCandidates.length === 0
        ? `No marker found for source device "${srcEquipment}".`
        : `Matched source device ${srcEquipment} on page ${srcCandidates[0]?.page_number || '?'}.`;
    }
  } else {
    // Source is TB_GROUP endpoint
    srcCandidates = markers.filter(m => 
      normalizeDeviceName(m.tb_number) === sourceTb && m.marker_type === 'TB_GROUP'
    );
    srcReason = srcCandidates.length === 0
      ? `No physical TB header group match for source TB="${sourceTb}".`
      : `Matched source TB group ${sourceTb} on page ${srcCandidates[0]?.page_number || '?'}.`;
  }

  let dstCandidates = [];
  let dstReason = '';

  // DESTINATION MATCHING
  if (!destIsPhysical) {
    // Destination is DEVICE endpoint (equipment tag)
    const dstEquipment = destTb;
    if (!dstEquipment) {
      dstReason = 'Destination end is empty.';
    } else {
      // Search by equipment tag, not by TB header
      dstCandidates = markers.filter(m => 
        normalizeDeviceName(m.tb_number) === dstEquipment
      );
      dstReason = dstCandidates.length === 0
        ? `No marker found for destination device "${dstEquipment}".`
        : `Matched destination device ${dstEquipment} on page ${dstCandidates[0]?.page_number || '?'}.`;
    }
  } else {
    // Destination is TB_GROUP endpoint
    dstCandidates = markers.filter(m => 
      normalizeDeviceName(m.tb_number) === destTb && m.marker_type === 'TB_GROUP'
    );
    dstReason = dstCandidates.length === 0
      ? `No physical TB header group match for destination TB="${destTb}".`
      : `Matched destination TB group ${destTb} on page ${dstCandidates[0]?.page_number || '?'}.`;
  }

  return {
    source_marker_candidates: srcCandidates,
    destination_marker_candidates: dstCandidates,
    best_source: srcCandidates[0] || null,
    best_destination: dstCandidates[0] || null,
    source_unmatched: srcCandidates.length === 0,
    destination_unmatched: dstCandidates.length === 0,
    source_match_reason: srcReason,
    destination_match_reason: dstReason,
  };
}

// ──────────────────────────────────────────────────────────────────────────────────────

test('Wire 022 D4: DEVICE→TB (87STUB → X5A-C) matches independently', () => {
  const markers = [
    { id: 101, tb_number: 'X5A-C', marker_type: 'TB_GROUP', page_number: 3, terminal_group: '1-27' },
    // Note: No 87STUB marker in DB (would be added by detection pipeline)
  ];

  const result = matchWireEndpointsSimplified(
    { device: '87STUB', terminal: 'X329:18' },
    { device: 'X5A-C', terminal: '15' },
    markers
  );

  // Source: DEVICE endpoint, not found in markers
  assert.equal(result.source_unmatched, true);
  assert.equal(result.source_marker_candidates.length, 0);
  assert.ok(result.source_match_reason.includes('No marker found'));
  assert.ok(!result.source_match_reason.includes('not a physical TB header')); // NOT this old message

  // Destination: TB_GROUP endpoint, found
  assert.equal(result.destination_unmatched, false);
  assert.equal(result.destination_marker_candidates.length, 1);
  assert.equal(result.destination_marker_candidates[0].tb_number, 'X5A-C');
  assert.ok(result.destination_match_reason.includes('Matched destination TB group'));
});

test('Wire 022 D4 + 87STUB marker: DEVICE→TB both match', () => {
  const markers = [
    { id: 101, tb_number: 'X5A-C', marker_type: 'TB_GROUP', page_number: 3, terminal_group: '1-27', geometry: { x: 100, y: 200 } },
    { id: 102, tb_number: '87STUB', marker_type: 'TB_GROUP', page_number: 2, terminal_group: 'X329:1-20', geometry: { x: 50, y: 75 } },
  ];

  const result = matchWireEndpointsSimplified(
    { device: '87STUB', terminal: 'X329:18' },
    { device: 'X5A-C', terminal: '15' },
    markers
  );

  // Source: DEVICE endpoint, found by equipment tag search
  assert.equal(result.source_unmatched, false);
  assert.equal(result.source_marker_candidates.length, 1);
  assert.equal(result.best_source.tb_number, '87STUB');
  assert.equal(result.best_source.id, 102);
  assert.ok(result.source_match_reason.includes('Matched source device 87STUB'));

  // Destination: TB_GROUP endpoint, found by header search
  assert.equal(result.destination_unmatched, false);
  assert.equal(result.destination_marker_candidates.length, 1);
  assert.equal(result.best_destination.tb_number, 'X5A-C');
  assert.equal(result.best_destination.id, 101);
});

test('TB→DEVICE (X9 → K01) reverse direction', () => {
  const markers = [
    { id: 201, tb_number: 'X9', marker_type: 'TB_GROUP', page_number: 4, terminal_group: '1-12' },
    { id: 202, tb_number: 'K01', marker_type: 'TB_GROUP', page_number: 1, terminal_group: '1-6' },
  ];

  const result = matchWireEndpointsSimplified(
    { device: 'X9', terminal: '8' },
    { device: 'K01', terminal: 'c' },
    markers
  );

  // Source: TB_GROUP
  assert.equal(result.source_unmatched, false);
  assert.equal(result.best_source.tb_number, 'X9');

  // Destination: DEVICE endpoint (K01), found by equipment tag search
  assert.equal(result.destination_unmatched, false);
  assert.equal(result.best_destination.tb_number, 'K01');
  assert.ok(result.destination_match_reason.includes('Matched destination device'));
});

test('DEVICE→DEVICE (74IO → 87STUB)', () => {
  const markers = [
    { id: 301, tb_number: '74IO', marker_type: 'TB_GROUP', page_number: 5, terminal_group: '1-8' },
    { id: 302, tb_number: '87STUB', marker_type: 'TB_GROUP', page_number: 2, terminal_group: 'X329:1-20' },
  ];

  const result = matchWireEndpointsSimplified(
    { device: '74IO', terminal: '3' },
    { device: '87STUB', terminal: 'X329:18' },
    markers
  );

  // Both are DEVICE endpoints
  assert.equal(result.source_unmatched, false);
  assert.equal(result.best_source.tb_number, '74IO');
  assert.equal(result.destination_unmatched, false);
  assert.equal(result.best_destination.tb_number, '87STUB');
});

test('Partial solution: DEVICE found, TB not found', () => {
  const markers = [
    { id: 102, tb_number: '87STUB', marker_type: 'TB_GROUP', page_number: 2, terminal_group: 'X329:1-20' },
  ];

  const result = matchWireEndpointsSimplified(
    { device: '87STUB', terminal: 'X329:18' },
    { device: 'X9', terminal: '8' },  // X9 not found
    markers
  );

  // Source found
  assert.equal(result.source_unmatched, false);
  assert.equal(result.best_source.tb_number, '87STUB');

  // Destination unresolved
  assert.equal(result.destination_unmatched, true);
  assert.equal(result.destination_marker_candidates.length, 0);
  assert.ok(result.destination_match_reason.includes('No physical TB header group match'));

  // Result should still be usable (RED overlay on 87STUB)
  assert.ok(result.best_source);
  assert(!result.best_destination);
});

test('Case insensitivity: 87stub (lowercase) matches 87STUB marker', () => {
  const markers = [
    { id: 102, tb_number: '87STUB', marker_type: 'TB_GROUP', page_number: 2, terminal_group: 'X329:1-20' },
  ];

  const result = matchWireEndpointsSimplified(
    { device: '87stub', terminal: 'X329:18' },  // lowercase input
    { device: 'x5a-c', terminal: '15' },        // lowercase TB header
    markers
  );

  // Both should normalize and match correctly
  assert.equal(result.source_unmatched, false);
  assert.equal(result.best_source.tb_number, '87STUB');
});

test('Empty DEVICE endpoint', () => {
  const markers = [
    { id: 101, tb_number: 'X5A-C', marker_type: 'TB_GROUP', page_number: 3, terminal_group: '1-27' },
  ];

  const result = matchWireEndpointsSimplified(
    { device: '', terminal: '' },         // empty source
    { device: 'X5A-C', terminal: '15' },
    markers
  );

  assert.equal(result.source_unmatched, true);
  assert.ok(result.source_match_reason.includes('is empty'));
});
