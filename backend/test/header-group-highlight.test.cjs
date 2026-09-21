/**
 * HEADER GROUP HIGHLIGHT — Pure helper unit tests.
 * Tests the extracted header-group-match.ts helpers via compiled dist.
 *
 * Run: node --test backend/test/header-group-highlight.test.cjs
 */
const test = require('node:test');
const assert = require('node:assert/strict');

const {
  asCandidateHeaderGroup,
  selectUniqueHeaderGroup,
  findEquipmentConnectorCandidates,
  findEquipmentTerminalCandidates,
  manualMapToCandidate,
  findManualMapCandidates,
  resolveEndpointHeaderGroup,
} = require('../dist/tb-markers/header-group-match');

const { classifyEndpointV2 } = require('../dist/tb-markers/terminal-range');

/* ── Fixtures ─────────────────────────────────────────────────────────────── */

function makeMarkerRow(overrides) {
  return {
    id: 1,
    tb_number: 'X9',
    terminal_group: '1-70',
    page_number: 2,
    view_name: 'REAR_WIRING_VIEW',
    marker_type: 'TB_GROUP',
    marker_status: 'ACTIVE',
    detection_method: 'OCR_VERIFIED',
    notes: null,
    geometry: {
      x: 0.175,
      y: 0.254,
      width: 0.032,
      height: 0.157,
      strip_bbox: { x: 0.175, y: 0.254, width: 0.032, height: 0.157 },
      view_classification: 'PHYSICAL_TB_BANK',
    },
    ...overrides,
  };
}

function makeManualMap(overrides) {
  return {
    id: 'manual-test-001',
    project_code: '001',
    frame_id: 'frame_test',
    page_number: 1,
    geometry: { x: 0.2, y: 0.3, width: 0.05, height: 0.08 },
    endpoint_kind: 'EQUIPMENT_TERMINAL',
    identity_tag: 'QDC1',
    terminal: null,
    connector: null,
    drawing_checksum: null,
    drawing_revision: null,
    created_by: 1,
    created_at: new Date().toISOString(),
    notes: 'Test manual map',
    ...overrides,
  };
}

/* ── asCandidateHeaderGroup ───────────────────────────────────────────────── */

test('asCandidateHeaderGroup always sets paint_mode to header_group', () => {
  const marker = makeMarkerRow({
    geometry: {
      x: 0.2, y: 0.2, width: 0.04, height: 0.03,
      strip_bbox: { x: 0.2, y: 0.2, width: 0.04, height: 0.03 },
      view_classification: 'PHYSICAL_TB_BANK',
      terminal_cells: { '7': { x: 0.21, y: 0.21, width: 0.02, height: 0.015 } },
    },
  });
  const candidate = asCandidateHeaderGroup(marker, '7');
  assert.equal(candidate.paint_mode, 'header_group');
  assert.equal(candidate.geometry.paint_mode, 'header_group');
});

test('asCandidateHeaderGroup uses header group geometry, not terminal cell', () => {
  const marker = makeMarkerRow({
    geometry: {
      x: 0.2, y: 0.2, width: 0.04, height: 0.03,
      strip_bbox: { x: 0.15, y: 0.18, width: 0.08, height: 0.12 },
      terminal_cells: { '7': { x: 0.21, y: 0.21, width: 0.02, height: 0.015 } },
      view_classification: 'PHYSICAL_TB_BANK',
    },
  });
  const candidate = asCandidateHeaderGroup(marker, '7');
  // Primary geometry should be strip_bbox, not terminal cell
  assert.equal(candidate.geometry.x, 0.15);
  assert.equal(candidate.geometry.width, 0.08);
});

/* ── selectUniqueHeaderGroup ──────────────────────────────────────────────── */

test('unique match returns SRC role metadata', () => {
  const candidates = [asCandidateHeaderGroup(makeMarkerRow(), '12')];
  const result = selectUniqueHeaderGroup(candidates, 'source', 'X9');
  assert.equal(result.unmatched, false);
  assert.equal(result.best.tb_number, 'X9');
  assert.ok(result.reason.includes('Matched'));
  assert.equal(result.diagnostics.confidence, 'HIGH');
});

test('unique match returns DST role metadata', () => {
  const candidates = [asCandidateHeaderGroup(makeMarkerRow({ tb_number: 'X5A-C' }), '15')];
  const result = selectUniqueHeaderGroup(candidates, 'destination', 'X5A-C');
  assert.equal(result.unmatched, false);
  assert.equal(result.best.tb_number, 'X5A-C');
  assert.ok(result.reason.includes('Destination'));
});

test('multiple matches → Match 1 of N (keep peers, prefer first ranked)', () => {
  const candidates = [
    asCandidateHeaderGroup(makeMarkerRow({ id: 1, page_number: 3, view_name: 'PHYSICAL_TB_BANK', geometry: {
      x: 0.1, y: 0.1, width: 0.05, height: 0.05,
      strip_bbox: { x: 0.1, y: 0.1, width: 0.05, height: 0.05 },
      view_classification: 'PHYSICAL_TB_BANK',
    }}), '12'),
    asCandidateHeaderGroup(makeMarkerRow({ id: 2, page_number: 6, view_name: 'INTERNAL_VIEW', geometry: {
      x: 0.2, y: 0.2, width: 0.05, height: 0.05,
      strip_bbox: { x: 0.2, y: 0.2, width: 0.05, height: 0.05 },
      view_classification: 'INTERNAL_VIEW',
    }}), '12'),
  ];
  const result = selectUniqueHeaderGroup(candidates, 'source', 'X9');
  assert.equal(result.unmatched, false);
  assert.ok(result.best);
  assert.equal(result.candidates.length, 2);
  assert.equal(result.best.page_number, 6); // INTERNAL preferred over PHYSICAL_TB_BANK
  assert.equal(result.rejection, 'multiple_matches');
  assert.ok(result.reason.includes('Match 1 of 2'));
  assert.equal(result.diagnostics.confidence, 'MEDIUM');
});

test('FRONT_VIEW candidates are rejected — only eligible physical regions paint', () => {
  const candidates = [
    asCandidateHeaderGroup(makeMarkerRow({ id: 1, view_name: 'FRONT_VIEW', geometry: {
      x: 0.1, y: 0.1, width: 0.05, height: 0.05,
      strip_bbox: { x: 0.1, y: 0.1, width: 0.05, height: 0.05 },
      view_classification: 'FRONT_VIEW',
    }}), '12'),
    asCandidateHeaderGroup(makeMarkerRow({ id: 2, page_number: 6, view_name: 'INTERNAL_VIEW', geometry: {
      x: 0.2, y: 0.2, width: 0.05, height: 0.05,
      strip_bbox: { x: 0.2, y: 0.2, width: 0.05, height: 0.05 },
      view_classification: 'INTERNAL_VIEW',
    }}), '12'),
  ];
  const result = selectUniqueHeaderGroup(candidates, 'source', 'X9');
  assert.equal(result.unmatched, false);
  assert.equal(result.candidates.length, 1);
  assert.equal(result.best.page_number, 6);
  assert.ok(result.diagnostics.rejected_candidates.some(r => /FRONT/i.test(r.reason)));
});

test('zero candidates → Header group not found', () => {
  const result = selectUniqueHeaderGroup([], 'source', 'X99');
  assert.equal(result.unmatched, true);
  assert.equal(result.best, null);
  assert.ok(result.reason.startsWith('Header group not found'));
});

/* ── Equipment CONNECTOR: 87STUB + X420 ──────────────────────────────────── */

test('EQUIPMENT_CONNECTOR 87STUB/X420 prefer connector group; never X420 as TB standalone', () => {
  const allCandidates = [
    asCandidateHeaderGroup(makeMarkerRow({ id: 10, tb_number: '87STUB' }), 'X420:2'),
    asCandidateHeaderGroup(makeMarkerRow({ id: 11, tb_number: 'X420' }), '2'),
  ];
  // X420 is a physical TB header pattern — must NOT match when parent is equipment
  const found = findEquipmentConnectorCandidates(allCandidates, '87STUB', 'X420');
  assert.equal(found.length, 1);
  assert.equal(found[0].tb_number, '87STUB');
});

test('EQUIPMENT_CONNECTOR prefers combined tag when present', () => {
  const allCandidates = [
    asCandidateHeaderGroup(makeMarkerRow({ id: 10, tb_number: '87STUB' }), 'X420:2'),
    asCandidateHeaderGroup(makeMarkerRow({ id: 12, tb_number: '87STUB/X420' }), '2'),
  ];
  const found = findEquipmentConnectorCandidates(allCandidates, '87STUB', 'X420');
  assert.equal(found.length, 1);
  assert.equal(found[0].tb_number, '87STUB/X420');
});

/* ── Equipment TERMINAL: QDC1 ─────────────────────────────────────────────── */

test('EQUIPMENT_TERMINAL QDC1 matches parent group, ignores pin', () => {
  const allCandidates = [
    asCandidateHeaderGroup(makeMarkerRow({ id: 20, tb_number: 'QDC1' }), '4'),
  ];
  const found = findEquipmentTerminalCandidates(allCandidates, 'QDC1');
  assert.equal(found.length, 1);
  assert.equal(found[0].tb_number, 'QDC1');
});

/* ── Manual mapping → synthetic candidate ─────────────────────────────────── */

test('manualMapToCandidate builds synthetic with negative id and header_group mode', () => {
  const map = makeManualMap();
  const cand = manualMapToCandidate(map, '4');
  assert.ok(cand.id < 0, 'synthetic id should be negative');
  assert.equal(cand.paint_mode, 'header_group');
  assert.equal(cand.detection_method, 'MANUAL_MAP');
  assert.equal(cand.tb_number, 'QDC1');
  assert.equal(cand.geometry.paint_mode, 'header_group');
  assert.ok(cand.geometry.strip_bbox);
});

test('findManualMapCandidates matches identity_tag exact', () => {
  const maps = [
    makeManualMap({ identity_tag: '87STUB', connector: 'X420', endpoint_kind: 'EQUIPMENT_CONNECTOR' }),
    makeManualMap({ identity_tag: 'QDC1', endpoint_kind: 'EQUIPMENT_TERMINAL' }),
  ];
  const result = findManualMapCandidates(maps, '87STUB', 'X420', 'EQUIPMENT_CONNECTOR', 'X420:2');
  assert.equal(result.length, 1);
  assert.equal(result[0].tb_number, '87STUB');
});

test('findManualMapCandidates filters by connector for EQUIPMENT_CONNECTOR', () => {
  const maps = [
    makeManualMap({ identity_tag: '87STUB', connector: 'X420', endpoint_kind: 'EQUIPMENT_CONNECTOR' }),
    makeManualMap({ identity_tag: '87STUB', connector: 'X421', endpoint_kind: 'EQUIPMENT_CONNECTOR' }),
  ];
  const result = findManualMapCandidates(maps, '87STUB', 'X420', 'EQUIPMENT_CONNECTOR', 'X420:2');
  assert.equal(result.length, 1);
});

/* ── Wire 021 / =E01_R1 fixture classification ───────────────────────────── */

test('Wire 021/D1 classification + unique synthetic markers → two header groups', () => {
  // Simulated Wire 021 from =E01_R1 schedule:
  // Source: 87STUB / X420:2  → EQUIPMENT_CONNECTOR
  // Destination: QDC1 / 4    → EQUIPMENT_TERMINAL
  const srcV2 = classifyEndpointV2('87STUB', 'X420:2');
  assert.equal(srcV2.kind, 'EQUIPMENT_CONNECTOR');
  assert.equal(srcV2.parentEquipment, '87STUB');
  assert.equal(srcV2.connector, 'X420');
  assert.equal(srcV2.pin, '2');

  const dstV2 = classifyEndpointV2('QDC1', '4');
  assert.equal(dstV2.kind, 'EQUIPMENT_TERMINAL');
  assert.equal(dstV2.parentEquipment, 'QDC1');
  assert.equal(dstV2.pin, '4');

  // Synthetic markers from manual maps
  const manualMaps = [
    makeManualMap({
      identity_tag: '87STUB',
      connector: 'X420',
      endpoint_kind: 'EQUIPMENT_CONNECTOR',
      geometry: { x: 0.15, y: 0.25, width: 0.06, height: 0.10 },
    }),
    makeManualMap({
      identity_tag: 'QDC1',
      endpoint_kind: 'EQUIPMENT_TERMINAL',
      geometry: { x: 0.35, y: 0.40, width: 0.05, height: 0.08 },
    }),
  ];

  const srcResult = resolveEndpointHeaderGroup(srcV2, [], manualMaps, 'X420:2', 'source');
  assert.equal(srcResult.unmatched, false);
  assert.equal(srcResult.best.tb_number, '87STUB');
  assert.equal(srcResult.best.paint_mode, 'header_group');

  const dstResult = resolveEndpointHeaderGroup(dstV2, [], manualMaps, '4', 'destination');
  assert.equal(dstResult.unmatched, false);
  assert.equal(dstResult.best.tb_number, 'QDC1');
  assert.equal(dstResult.best.paint_mode, 'header_group');
});

/* ── resolveEndpointHeaderGroup: TB_TERMINAL ──────────────────────────────── */

test('resolveEndpointHeaderGroup: TB_TERMINAL unique match', () => {
  const v2 = classifyEndpointV2('X9', '18');
  assert.equal(v2.kind, 'TB_TERMINAL');
  const dbCandidates = [asCandidateHeaderGroup(makeMarkerRow(), '18')];
  const result = resolveEndpointHeaderGroup(v2, dbCandidates, [], '18', 'source');
  assert.equal(result.unmatched, false);
  assert.equal(result.best.tb_number, 'X9');
  assert.equal(result.best.paint_mode, 'header_group');
});

test('resolveEndpointHeaderGroup: UNKNOWN kind → Header group not found', () => {
  const v2 = classifyEndpointV2('', '');
  assert.equal(v2.kind, 'UNKNOWN');
  const result = resolveEndpointHeaderGroup(v2, [], [], '', 'source');
  assert.equal(result.unmatched, true);
  assert.ok(result.reason.startsWith('Header group not found'));
});

test('Match 1 of N: H74 FRONT manual map rejected; INTERNAL remains unique', () => {
  const v2 = classifyEndpointV2('H74', 'X10:4');
  assert.equal(v2.kind, 'EQUIPMENT_CONNECTOR');
  const maps = [
    makeManualMap({
      identity_tag: 'H74',
      connector: 'X10',
      endpoint_kind: 'EQUIPMENT_CONNECTOR',
      page_number: 3,
      notes: 'Wire 20.16:E Source alternate — physical H74 on FRONT VIEW (page 3).',
      geometry: { x: 0.165, y: 0.125, width: 0.175, height: 0.055 },
    }),
    makeManualMap({
      identity_tag: 'H74',
      connector: 'X10',
      endpoint_kind: 'EQUIPMENT_CONNECTOR',
      page_number: 6,
      notes: 'Wire 20.16:E Source — physical H74 footprint on INTERNAL VIEW-1 (page 6) REAR section.',
      geometry: { x: 0.255, y: 0.118, width: 0.125, height: 0.06 },
    }),
  ];
  const result = resolveEndpointHeaderGroup(v2, [], maps, '4', 'source');
  assert.equal(result.unmatched, false);
  assert.equal(result.candidates.length, 1);
  assert.ok(result.best);
  assert.equal(result.best.tb_number, 'H74');
  assert.equal(result.best.page_number, 6);
  assert.ok(result.diagnostics.rejected_candidates.some(r => /FRONT|ineligible/i.test(r.reason)));
});

test('manualMapToCandidate DEVICE footprint uses PHYSICAL_DEVICE view', () => {
  const cand = manualMapToCandidate(
    makeManualMap({ identity_tag: 'H74', endpoint_kind: 'EQUIPMENT_CONNECTOR', connector: 'X10' }),
    '4',
  );
  assert.equal(cand.marker_type, 'DEVICE');
  assert.equal(cand.view_classification, 'PHYSICAL_DEVICE');
});
