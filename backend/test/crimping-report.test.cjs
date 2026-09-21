/**
 * Multi-project Crimping Report acceptance (T1–T5) + missing-leg rules.
 * E01+R1 is fixture-only — these tests use synthetic Project A / Project B data.
 */
const test = require('node:test');
const assert = require('node:assert/strict');

const {
  getCrimpingReport,
  reportCell,
  fieldAvailability,
} = require('../dist/common/crimping-report');

function cable(partial) {
  return {
    sno: 1,
    panel: 'P1',
    ferrule: 'F1',
    source_device: 'EQ-A',
    source_terminal: '1',
    source: 'EQ-A:1',
    destination: 'EQ-B:2',
    dest_device: 'EQ-B',
    dest_terminal: '2',
    ref: '',
    color: 'BK',
    size: '1.5',
    length: '1',
    sign: '',
    remarks: '',
    path: '',
    rack: '',
    ...partial,
  };
}

function statuses(n, required = true) {
  return Array.from({ length: n }, () => ({
    src: false,
    dst: false,
    note: '',
    crimping: { required },
  }));
}

test('T1: Tech A / Project A / Panel A1 — report rows = N only', () => {
  const N = 5;
  const report = getCrimpingReport({
    assignmentId: 101,
    projectCode: 'PROJ_A_001',
    frameId: 'frame-a1',
    panelName: 'Panel A1',
    technicianId: 11,
    technicianName: 'Tech A',
    scheduleCables: Array.from({ length: N }, (_, i) => cable({ sno: i + 1, ferrule: `A-${i + 1}` })),
    cableStatuses: statuses(N),
  });
  assert.equal(report.wireRows.length, N);
  assert.equal(report.metadata.assignmentId, 101);
  assert.equal(report.metadata.projectCode, 'PROJ_A_001');
  assert.equal(report.metadata.panelName, 'Panel A1');
  assert.equal(report.metadata.technicianId, 11);
  assert.equal(report.summary.totalWires, N);
  assert.ok(report.wireRows.every((r) => String(r.ferrule).startsWith('A-')));
});

test('T2: Tech B / Project B / Panel B7 — report rows = M only (no Project A leakage)', () => {
  const M = 3;
  const report = getCrimpingReport({
    assignmentId: 202,
    projectCode: 'PROJ_B_007',
    frameId: 'frame-b7',
    panelName: 'Panel B7',
    technicianId: 22,
    technicianName: 'Tech B',
    scheduleCables: Array.from({ length: M }, (_, i) => cable({
      sno: i + 1,
      ferrule: `B-${i + 1}`,
      source_device: 'X',
      dest_device: 'Y',
    })),
    cableStatuses: statuses(M),
  });
  assert.equal(report.wireRows.length, M);
  assert.equal(report.metadata.assignmentId, 202);
  assert.equal(report.metadata.projectCode, 'PROJ_B_007');
  assert.ok(!report.wireRows.some((r) => String(r.ferrule).startsWith('A-')));
  assert.ok(report.wireRows.every((r) => String(r.ferrule).startsWith('B-')));
});

test('T3: switching assignment selector changes report scope (no stale cross-assignment rows)', () => {
  const reportA = getCrimpingReport({
    assignmentId: 1,
    projectCode: 'PROJ_A_001',
    frameId: 'f1',
    panelName: 'A1',
    technicianId: 11,
    scheduleCables: [cable({ ferrule: 'ONLY-A' }), cable({ ferrule: 'ONLY-A2', sno: 2 })],
    cableStatuses: statuses(2),
  });
  const reportB = getCrimpingReport({
    assignmentId: 2,
    projectCode: 'PROJ_A_001',
    frameId: 'f2',
    panelName: 'A2',
    technicianId: 11,
    scheduleCables: [cable({ ferrule: 'ONLY-B' })],
    cableStatuses: statuses(1),
  });
  assert.equal(reportA.wireRows.length, 2);
  assert.equal(reportB.wireRows.length, 1);
  assert.equal(reportB.wireRows[0].ferrule, 'ONLY-B');
  assert.ok(!reportB.wireRows.some((r) => r.ferrule === 'ONLY-A'));
});

test('T4: Project A maps leg size; Project B does not — NOT AVAILABLE, never infer from wire.size', () => {
  const withLeg = getCrimpingReport({
    assignmentId: 1,
    projectCode: 'PROJ_A_001',
    frameId: 'f1',
    panelName: 'A1',
    scheduleCables: [cable({
      size: '2.5',
      color: 'RD',
      source_crimp_leg_size: '1.0',
      source_crimp_leg_color: 'BU',
    })],
    cableStatuses: statuses(1),
  });
  const withoutLeg = getCrimpingReport({
    assignmentId: 2,
    projectCode: 'PROJ_B_007',
    frameId: 'f2',
    panelName: 'B7',
    scheduleCables: [cable({ size: '2.5', color: 'RD' })],
    cableStatuses: statuses(1),
  });

  assert.equal(withLeg.wireRows[0].source.legSize.available, true);
  assert.equal(withLeg.wireRows[0].source.legSize.value, '1.0');
  assert.equal(withLeg.wireRows[0].wireSize, '2.5');

  assert.equal(withoutLeg.wireRows[0].source.legSize.available, false);
  assert.equal(withoutLeg.wireRows[0].source.legSize.value, null);
  assert.equal(withoutLeg.wireRows[0].source.legColor.available, false);
  // Must NOT copy wire size/color into leg cells
  assert.notEqual(withoutLeg.wireRows[0].source.legSize.value, withoutLeg.wireRows[0].wireSize);
  assert.equal(withoutLeg.fieldAvailability.source_crimp_leg_size, false);
  assert.equal(withLeg.fieldAvailability.source_crimp_leg_size, true);
});

test('T5: report projection is assignment-scoped — foreign assignment data is never mixed in', () => {
  // Service-layer ForbiddenException is enforced in getCrimpingReportForTech;
  // projection itself only emits rows for the cables/status arrays it is given.
  const techA = getCrimpingReport({
    assignmentId: 101,
    projectCode: 'PROJ_A_001',
    frameId: 'f1',
    panelName: 'A1',
    technicianId: 11,
    scheduleCables: [cable({ ferrule: 'TECH-A-WIRE' })],
    cableStatuses: statuses(1),
  });
  assert.equal(techA.metadata.technicianId, 11);
  assert.equal(techA.wireRows.length, 1);
  assert.equal(techA.wireRows[0].ferrule, 'TECH-A-WIRE');
  // A second call with Tech B assignment must not retain Tech A rows
  const techB = getCrimpingReport({
    assignmentId: 202,
    projectCode: 'PROJ_B_007',
    frameId: 'f2',
    panelName: 'B7',
    technicianId: 22,
    scheduleCables: [cable({ ferrule: 'TECH-B-WIRE' }), cable({ ferrule: 'TECH-B-WIRE-2', sno: 2 })],
    cableStatuses: statuses(2),
  });
  assert.equal(techB.metadata.technicianId, 22);
  assert.equal(techB.wireRows.length, 2);
  assert.ok(!techB.wireRows.some((r) => r.ferrule === 'TECH-A-WIRE'));
});

test('reportCell: empty / null → unavailable (NOT AVAILABLE), never fabricates', () => {
  assert.deepEqual(reportCell(null, 'source_crimp_leg_size'), {
    value: null,
    available: false,
    sourceField: 'source_crimp_leg_size',
  });
  assert.deepEqual(reportCell(cable({ source_crimp_leg_size: '' }), 'source_crimp_leg_size'), {
    value: null,
    available: false,
    sourceField: 'source_crimp_leg_size',
  });
  assert.deepEqual(reportCell(cable({ source_crimp_leg_size: '  0.75  ' }), 'source_crimp_leg_size'), {
    value: '0.75',
    available: true,
    sourceField: 'source_crimp_leg_size',
  });
});

test('fieldAvailability aggregates across assignment wires only', () => {
  const avail = fieldAvailability([
    cable({ source_crimp_leg_number: '1' }),
    cable({}),
  ]);
  assert.equal(avail.source_crimp_leg_number, true);
  assert.equal(avail.dest_crimp_leg_number, false);
});

test('reworkHistory: strip rework on source is projected (attribution preserved)', () => {
  const history = [{
    operation: 'strip',
    previousStatus: 'COMPLETED',
    reason: 'Ferrule wrong size',
    setBy: 7,
    setAt: '2026-09-04T12:00:00.000Z',
    role: 'prod_supervisor',
  }];
  const report = getCrimpingReport({
    assignmentId: 55,
    projectCode: 'PROJ_A_001',
    frameId: 'f1',
    panelName: 'A1',
    scheduleCables: [cable({ ferrule: 'RW-1' })],
    cableStatuses: [{
      src: false,
      dst: false,
      crimping: {
        required: true,
        source: {
          strippingStatus: 'REWORK_REQUIRED',
          crimpingStatus: 'NOT_STARTED',
          strippedBy: 11,
          strippedAt: '2026-09-03T10:00:00.000Z',
          reworkHistory: history,
        },
        destination: {
          strippingStatus: 'NOT_STARTED',
          crimpingStatus: 'NOT_STARTED',
        },
        overall: 'REWORK_REQUIRED',
      },
    }],
  });
  assert.equal(report.wireRows[0].overall, 'REWORK_REQUIRED');
  assert.equal(report.wireRows[0].source.strippingStatus, 'REWORK_REQUIRED');
  assert.equal(report.summary.rework, 1);
  assert.ok(Array.isArray(report.wireRows[0].source.reworkHistory));
  assert.equal(report.wireRows[0].source.reworkHistory.length, 1);
  assert.equal(report.wireRows[0].source.reworkHistory[0].reason, 'Ferrule wrong size');
  assert.equal(report.wireRows[0].source.strippedBy, 11);
  assert.equal(report.wireRows[0].destination.reworkHistory, undefined);
});

test('live prep projection: wireId + cut/strip/crimp attribution + finished; legs never inferred', () => {
  const report = getCrimpingReport({
    assignmentId: 9,
    projectCode: 'PROJ_A_001',
    frameId: 'f1',
    panelName: 'A1',
    technicianId: 11,
    technicianName: 'Tech A',
    actorNames: { '11': 'Tech A', '22': 'Tech B' },
    scheduleCables: [cable({
      sno: 202,
      ref: 'W-202',
      size: '2.5',
      color: 'BK',
    })],
    cableStatuses: [{
      src: false,
      dst: false,
      crimping: {
        required: true,
        cut: { status: 'COMPLETED', by: 11, at: '2026-09-19T08:00:00.000Z' },
        wireStrip: { status: 'COMPLETED', by: 11, at: '2026-09-19T08:01:00.000Z' },
        wireCrimp: { status: 'COMPLETED', by: 22, at: '2026-09-19T08:02:00.000Z' },
        source: {
          strippingStatus: 'COMPLETED',
          crimpingStatus: 'COMPLETED',
          strippedBy: 11,
          strippedAt: '2026-09-19T08:01:00.000Z',
          crimpedBy: 22,
          crimpedAt: '2026-09-19T08:02:00.000Z',
        },
        destination: {
          strippingStatus: 'COMPLETED',
          crimpingStatus: 'COMPLETED',
          strippedBy: 11,
          strippedAt: '2026-09-19T08:01:00.000Z',
          crimpedBy: 22,
          crimpedAt: '2026-09-19T08:02:00.000Z',
        },
        overall: 'COMPLETED',
      },
    }],
  });
  const row = report.wireRows[0];
  assert.equal(row.wireId, 'W-202');
  assert.equal(row.sno, 202);
  assert.equal(row.finished, true);
  assert.equal(row.cut.status, 'COMPLETED');
  assert.equal(row.cut.byName, 'Tech A');
  assert.equal(row.wireCrimp.byName, 'Tech B');
  assert.equal(row.source.legNumber.available, false);
  assert.equal(row.source.legSize.available, false);
  assert.notEqual(row.source.legSize.value, row.wireSize);
  assert.equal(report.metadata.ferruleLugFittedIsSeparateStage, false);
  assert.equal(report.summary.cut, 1);
  assert.equal(report.summary.stripped, 1);
  assert.equal(report.summary.crimped, 1);
});
