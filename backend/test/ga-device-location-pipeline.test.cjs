/**
 * Phase 9B — generic DEVICE drawing pipeline + GaDeviceLocationsService
 * persistence contract (mocked repository). No real PostgreSQL writes.
 */
const test = require('node:test');
const assert = require('node:assert/strict');

const {
  collectDeviceTargetsFromCables,
  decideDevicePersistence,
  analyseDeviceLocations,
  normalizeFullPageBbox,
  isRejectedNonphysicalHit,
  samePhysicalDeviceEntity,
  buildSharedDevicePersistKey,
  filterHitsForScheduleDevice,
} = require('../dist/ga-device-locations/device-location-analysis');
const { GaDeviceLocationsService } = require('../dist/ga-device-locations/ga-device-locations.service');
const { AutomaticGaDeviceLocationService } = require('../dist/ga-device-locations/automatic-ga-device-location.service');
const { classifyLiveTbEndpoint } = require('../dist/tb-markers/terminal-range');
const { isPhysicalStripKind } = require('../dist/drawing-tb-analysis/pdf-text-layer');
const { resolvePhysicalParent } = require('../dist/tb-markers/endpoint-resolution');

/** TB strip vs reference: physical strip wins when both exist. */
function selectTbPhysicalOccurrence(hits) {
  const strip = (hits || []).filter((h) => isPhysicalStripKind(h.kind));
  if (strip.length) return { status: 'PHYSICAL', hit: strip[0] };
  const nonPhysical = (hits || []).filter((h) => !isPhysicalStripKind(h.kind));
  if (nonPhysical.length) return { status: 'UNRESOLVED', hit: null, reason: 'reference_or_nonphysical_only' };
  return { status: 'UNRESOLVED', hit: null, reason: 'no_hits' };
}

const CHECKSUM = 'abc123checksumcurrent0000000000000000000000000000000000000001';
const STALE = 'deadbeefstale000000000000000000000000000000000000000000000002';

function body(x = 0.1, y = 0.2, width = 0.15, height = 0.2) {
  return { x, y, width, height };
}

function hit(overrides = {}) {
  return {
    device_identity: 'DEVICE_A',
    page: 1,
    page_view: 'FRONT_VIEW',
    region_kind: 'physical_device_body',
    tag_bbox: { x: 0.12, y: 0.22, width: 0.04, height: 0.02 },
    body_bbox: body(),
    detection_method: 'native_pdf',
    confidence_score: 0.9,
    drawing_checksum: CHECKSUM,
    ...overrides,
  };
}

function mockRepo() {
  const creates = [];
  const statusUpdates = [];
  let idSeq = 1;
  return {
    creates,
    statusUpdates,
    create: async (data) => {
      const row = { id: idSeq++, ...data, verification_status: 'UNVERIFIED', grounding_available: false };
      creates.push(row);
      return row;
    },
    findByDeviceAndDrawing: async () => null,
    findAll: async () => [],
    updateVerificationStatus: async (id, status) => {
      statusUpdates.push({ id, status });
      return { id, verification_status: status };
    },
    markGroundingAvailable: async (id) => ({ id, grounding_available: true }),
    deleteOldByDrawing: async () => ({ count: 0 }),
  };
}

test('1 FRONT_VIEW physical DEVICE → persist success', async () => {
  const d = decideDevicePersistence({
    device_identity: 'DEVICE_A',
    hits: [hit({ page_view: 'FRONT_VIEW' })],
    currentDrawingChecksum: CHECKSUM,
    drawing_id: 1,
    analysis_run_id: 'run1',
    pipeline_version: 'v1',
    groundingUnavailable: false,
  });
  assert.equal(d.action, 'persist');
  assert.equal(d.input.device_identity, 'DEVICE_A');
  assert.equal(d.input.view_classification, 'FRONT_VIEW');
});

test('2 INTERNAL_VIEW physical DEVICE → persist success', () => {
  const d = decideDevicePersistence({
    device_identity: 'RELAY_A',
    hits: [hit({ device_identity: 'RELAY_A', page_view: 'INTERNAL_VIEW' })],
    currentDrawingChecksum: CHECKSUM,
    drawing_id: 1,
    analysis_run_id: 'run1',
    pipeline_version: 'v1',
    groundingUnavailable: false,
  });
  assert.equal(d.action, 'persist');
  assert.equal(d.input.view_classification, 'INTERNAL_VIEW');
});

test('3 REAR_VIEW physical DEVICE → persist success', () => {
  const d = decideDevicePersistence({
    device_identity: 'IED_01',
    hits: [hit({ device_identity: 'IED_01', page_view: 'REAR_VIEW' })],
    currentDrawingChecksum: CHECKSUM,
    drawing_id: 1,
    analysis_run_id: 'run1',
    pipeline_version: 'v1',
    groundingUnavailable: false,
  });
  assert.equal(d.action, 'persist');
});

test('4 SIDE_VIEW physical DEVICE → persist success', () => {
  const d = decideDevicePersistence({
    device_identity: 'MODULE_X',
    hits: [hit({ device_identity: 'MODULE_X', page_view: 'SIDE_VIEW' })],
    currentDrawingChecksum: CHECKSUM,
    drawing_id: 1,
    analysis_run_id: 'run1',
    pipeline_version: 'v1',
    groundingUnavailable: false,
  });
  assert.equal(d.action, 'persist');
});

test('5 BOM-only DEVICE → reject, no persist', () => {
  const h = hit({ region_kind: 'bom', page_view: 'LEGEND_OR_BOM', body_bbox: body() });
  assert.equal(isRejectedNonphysicalHit(h), true);
  const d = decideDevicePersistence({
    device_identity: 'DEVICE_A',
    hits: [h],
    currentDrawingChecksum: CHECKSUM,
    drawing_id: 1,
    analysis_run_id: 'run1',
    pipeline_version: 'v1',
    groundingUnavailable: false,
  });
  assert.equal(d.action, 'reject');
});

test('6 description-table-only DEVICE → reject', () => {
  const d = decideDevicePersistence({
    device_identity: 'DEVICE_B',
    hits: [hit({
      device_identity: 'DEVICE_B',
      region_kind: 'description_table',
      page_view: 'FRONT_VIEW',
    })],
    currentDrawingChecksum: CHECKSUM,
    drawing_id: 1,
    analysis_run_id: 'run1',
    pipeline_version: 'v1',
    groundingUnavailable: false,
  });
  assert.equal(d.action, 'reject');
});

test('7 physical DEVICE + BOM duplicate → physical wins', () => {
  const d = decideDevicePersistence({
    device_identity: 'PUMP_01',
    hits: [
      hit({
        device_identity: 'PUMP_01',
        region_kind: 'bom',
        page_view: 'LEGEND_OR_BOM',
        confidence_score: 0.99,
      }),
      hit({
        device_identity: 'PUMP_01',
        region_kind: 'physical_device_body',
        page_view: 'FRONT_VIEW',
        confidence_score: 0.8,
        body_bbox: body(0.3, 0.3, 0.2, 0.2),
      }),
    ],
    currentDrawingChecksum: CHECKSUM,
    drawing_id: 1,
    analysis_run_id: 'run1',
    pipeline_version: 'v1',
    groundingUnavailable: false,
  });
  assert.equal(d.action, 'persist');
  assert.equal(d.input.geometry_bbox_x, 0.3);
});

test('8 OCR-only physical tag+body → works', () => {
  const d = decideDevicePersistence({
    device_identity: 'DEVICE_A',
    hits: [hit({ detection_method: 'ocr' })],
    currentDrawingChecksum: CHECKSUM,
    drawing_id: 1,
    analysis_run_id: 'run1',
    pipeline_version: 'v1',
    groundingUnavailable: false,
  });
  assert.equal(d.action, 'persist');
  assert.equal(d.input.detection_method, 'ocr');
});

test('9 native-text physical tag+body → works', () => {
  const d = decideDevicePersistence({
    device_identity: 'DEVICE_A',
    hits: [hit({ detection_method: 'native_pdf' })],
    currentDrawingChecksum: CHECKSUM,
    drawing_id: 1,
    analysis_run_id: 'run1',
    pipeline_version: 'v1',
    groundingUnavailable: false,
  });
  assert.equal(d.action, 'persist');
  assert.equal(d.input.detection_method, 'native_pdf');
});

test('10 tag found but no physical device body → no location', () => {
  const d = decideDevicePersistence({
    device_identity: 'DEVICE_A',
    hits: [hit({
      region_kind: 'equipment_label',
      page_view: 'FRONT_VIEW',
      body_bbox: null,
      tag_bbox: body(0.1, 0.1, 0.05, 0.02),
    })],
    currentDrawingChecksum: CHECKSUM,
    drawing_id: 1,
    analysis_run_id: 'run1',
    pipeline_version: 'v1',
    groundingUnavailable: false,
  });
  assert.equal(d.action, 'reject');
  assert.match(d.reason, /tag_without_physical_body|nonphysical/);
});

test('11 invalid normalized bbox → reject', () => {
  assert.equal(normalizeFullPageBbox({ x: -0.1, y: 0, width: 0.2, height: 0.2 }), null);
  assert.equal(normalizeFullPageBbox({ x: 0.9, y: 0.9, width: 0.2, height: 0.2 }), null);
  assert.equal(normalizeFullPageBbox({ x: 0.1, y: 0.1, width: 0, height: 0.2 }), null);
  const d = decideDevicePersistence({
    device_identity: 'DEVICE_A',
    hits: [hit({ body_bbox: { x: 0.1, y: 0.1, width: 0, height: 0.2 } })],
    currentDrawingChecksum: CHECKSUM,
    drawing_id: 1,
    analysis_run_id: 'run1',
    pipeline_version: 'v1',
    groundingUnavailable: false,
  });
  assert.equal(d.action, 'reject');
});

test('12 stale drawing checksum → reject', () => {
  const d = decideDevicePersistence({
    device_identity: 'DEVICE_A',
    hits: [hit({ drawing_checksum: STALE })],
    currentDrawingChecksum: CHECKSUM,
    drawing_id: 1,
    analysis_run_id: 'run1',
    pipeline_version: 'v1',
    groundingUnavailable: false,
  });
  assert.equal(d.action, 'reject');
  assert.equal(d.reason, 'stale_drawing_checksum');
});

test('13 multiple valid physical candidates same page → ambiguous', () => {
  const d = decideDevicePersistence({
    device_identity: 'DEVICE_A',
    hits: [
      hit({ body_bbox: body(0.1, 0.1, 0.1, 0.1), confidence_score: 0.85 }),
      hit({ body_bbox: body(0.5, 0.5, 0.1, 0.1), confidence_score: 0.85 }),
    ],
    currentDrawingChecksum: CHECKSUM,
    drawing_id: 1,
    analysis_run_id: 'run1',
    pipeline_version: 'v1',
    groundingUnavailable: false,
  });
  assert.equal(d.action, 'ambiguous');
});

test('14 same DEVICE referenced by several wires → one target / one persist', async () => {
  const cables = [
    { source_device: 'DEVICE_A', source_terminal: '1', dest_device: 'X9', dest_terminal: '2' },
    { source_device: 'DEVICE_A', source_terminal: '3', dest_device: 'X9', dest_terminal: '4' },
    { source_device: 'DEVICE_A', source_terminal: '5', dest_device: 'X9', dest_terminal: '6' },
  ];
  const targets = collectDeviceTargetsFromCables(cables);
  assert.equal(targets.filter((t) => t.physicalIdentity === 'DEVICE_A').length, 1);

  const repo = mockRepo();
  const svc = new GaDeviceLocationsService(repo);
  const auto = new AutomaticGaDeviceLocationService(svc);
  const metrics = await auto.persistFromAnalysis({
    cables,
    hits: [hit()],
    currentDrawingChecksum: CHECKSUM,
    drawing_id: 42,
    analysis_run_id: 'run-multi',
    pipeline_version: 'v1',
    groundingUnavailable: false,
  });
  assert.equal(metrics.device_targets_requested, 1);
  assert.equal(repo.creates.length, 1);
  assert.equal(metrics.device_locations_persisted, 1);
  assert.equal(metrics.real_postgresql_ga_device_locations_write_verified, false);
});

test('15 physical device + GROUNDING_UNAVAILABLE → detect yes, AUTO_VERIFIED blocked', async () => {
  const prev = process.env.LOCATEANYTHING_REQUIRED;
  process.env.LOCATEANYTHING_REQUIRED = '1';
  try {
    // Re-require isLocateAnythingRequired reads env at call time
    const d = decideDevicePersistence({
      device_identity: 'DEVICE_A',
      hits: [hit()],
      currentDrawingChecksum: CHECKSUM,
      drawing_id: 1,
      analysis_run_id: 'run1',
      pipeline_version: 'v1',
      groundingUnavailable: true,
    });
    assert.equal(d.action, 'persist');
    assert.equal(d.verification, 'BLOCKED_GROUNDING');

    const repo = mockRepo();
    const svc = new GaDeviceLocationsService(repo);
    const auto = new AutomaticGaDeviceLocationService(svc);
    const metrics = await auto.persistFromAnalysis({
      cables: [{ source_device: 'DEVICE_A', source_terminal: '1', dest_device: 'X9', dest_terminal: '2' }],
      hits: [hit()],
      currentDrawingChecksum: CHECKSUM,
      drawing_id: 1,
      analysis_run_id: 'run1',
      pipeline_version: 'v1',
      groundingUnavailable: true,
    });
    assert.equal(repo.creates.length, 1);
    assert.ok(repo.statusUpdates.some((u) => u.status === 'BLOCKED_GROUNDING'));
    assert.ok(!repo.statusUpdates.some((u) => u.status === 'AUTO_VERIFIED'));
    assert.equal(metrics.device_blocked_grounding >= 1, true);
    assert.equal(metrics.device_locations_persisted, 1);
  } finally {
    if (prev === undefined) delete process.env.LOCATEANYTHING_REQUIRED;
    else process.env.LOCATEANYTHING_REQUIRED = prev;
  }
});

test('nonphysical hits never call repository.create', async () => {
  const repo = mockRepo();
  const svc = new GaDeviceLocationsService(repo);
  const auto = new AutomaticGaDeviceLocationService(svc);
  await auto.persistFromAnalysis({
    cables: [{ source_device: 'DEVICE_A', source_terminal: '1', dest_device: 'X9', dest_terminal: '2' }],
    hits: [hit({ region_kind: 'legend_or_table', page_view: 'LEGEND_OR_BOM' })],
    currentDrawingChecksum: CHECKSUM,
    drawing_id: 1,
    analysis_run_id: 'run1',
    pipeline_version: 'v1',
    groundingUnavailable: false,
  });
  assert.equal(repo.creates.length, 0);
});

test('analyseDeviceLocations metrics honesty flags', () => {
  const { metrics } = analyseDeviceLocations({
    cables: [{ source_device: 'DEVICE_A', source_terminal: '1', dest_device: 'X9', dest_terminal: '2' }],
    hits: [hit()],
    currentDrawingChecksum: CHECKSUM,
    drawing_id: 1,
    analysis_run_id: 'run1',
    pipeline_version: 'v1',
    groundingUnavailable: false,
  });
  assert.equal(metrics.device_targets_requested, 1);
  assert.equal(metrics.device_locations_ready_for_persistence, 1);
  assert.equal(metrics.real_postgresql_ga_device_locations_write_verified, false);
  assert.equal(metrics.device_persistence_contract, 'service_with_repository_boundary');
});

// ---------------------------------------------------------------------------
// GA reference vs physical layout — generic tests A–H
// (87STUB / REB650 / X5A-C are real regression examples only; not hardcoded.)
// ---------------------------------------------------------------------------

test('A: reference DEVICE_A/MODEL_X + physical DEVICE_A body → persist DEVICE_A', () => {
  const d = decideDevicePersistence({
    device_identity: 'DEVICE_A',
    hits: [
      hit({
        device_identity: 'DEVICE_A',
        region_kind: 'device_reference_table',
        page_view: 'LEGEND_OR_BOM',
        supporting_model: 'MODEL_X',
        evidence_role: 'semantic_reference',
        confidence_score: 0.99,
        body_bbox: body(0.01, 0.01, 0.05, 0.02),
      }),
      hit({
        device_identity: 'DEVICE_A',
        region_kind: 'physical_device_body',
        page_view: 'INTERNAL_VIEW',
        supporting_model: 'MODEL_X',
        evidence_role: 'physical_geometry',
        confidence_score: 0.8,
        body_bbox: body(0.2, 0.3, 0.18, 0.22),
      }),
    ],
    currentDrawingChecksum: CHECKSUM,
    drawing_id: 1,
    analysis_run_id: 'runA',
    pipeline_version: 'v1',
    groundingUnavailable: false,
  });
  assert.equal(d.action, 'persist');
  assert.equal(d.input.device_identity, 'DEVICE_A');
  assert.equal(d.input.geometry_bbox_x, 0.2);
  assert.equal(d.input.view_classification, 'INTERNAL_VIEW');
});

test('B: DEVICE_A exists only in reference table → no physical geometry', () => {
  assert.equal(
    isRejectedNonphysicalHit(hit({
      region_kind: 'device_reference_table',
      page_view: 'LEGEND_OR_BOM',
    })),
    true,
  );
  const d = decideDevicePersistence({
    device_identity: 'DEVICE_A',
    hits: [
      hit({
        device_identity: 'DEVICE_A',
        region_kind: 'description_table',
        page_view: 'FRONT_VIEW',
        supporting_model: 'MODEL_X',
        evidence_role: 'semantic_reference',
      }),
    ],
    currentDrawingChecksum: CHECKSUM,
    drawing_id: 1,
    analysis_run_id: 'runB',
    pipeline_version: 'v1',
    groundingUnavailable: false,
  });
  assert.equal(d.action, 'reject');
  assert.match(d.reason, /reference_table_only|nonphysical/);
});

test('C: several physical MODEL_X; schedule DEVICE_A → select DEVICE_A only', () => {
  const filtered = filterHitsForScheduleDevice('DEVICE_A', [
    hit({ device_identity: 'MODEL_X', body_bbox: body(0.1, 0.1, 0.1, 0.1) }),
    hit({ device_identity: 'OTHER_DEVICE', supporting_model: 'MODEL_X', body_bbox: body(0.4, 0.4, 0.1, 0.1) }),
    hit({
      device_identity: 'DEVICE_A',
      supporting_model: 'MODEL_X',
      body_bbox: body(0.55, 0.2, 0.12, 0.15),
    }),
  ]);
  assert.equal(filtered.length, 1);
  assert.equal(filtered[0].device_identity, 'DEVICE_A');

  const d = decideDevicePersistence({
    device_identity: 'DEVICE_A',
    hits: [
      hit({
        device_identity: 'MODEL_X',
        confidence_score: 0.99,
        body_bbox: body(0.1, 0.1, 0.1, 0.1),
      }),
      hit({
        device_identity: 'OTHER_DEVICE',
        supporting_model: 'MODEL_X',
        confidence_score: 0.95,
        body_bbox: body(0.4, 0.4, 0.1, 0.1),
      }),
      hit({
        device_identity: 'DEVICE_A',
        supporting_model: 'MODEL_X',
        confidence_score: 0.7,
        body_bbox: body(0.55, 0.2, 0.12, 0.15),
      }),
    ],
    currentDrawingChecksum: CHECKSUM,
    drawing_id: 1,
    analysis_run_id: 'runC',
    pipeline_version: 'v1',
    groundingUnavailable: false,
  });
  assert.equal(d.action, 'persist');
  assert.equal(d.input.device_identity, 'DEVICE_A');
  assert.equal(d.input.geometry_bbox_x, 0.55);

  const modelOnly = decideDevicePersistence({
    device_identity: 'DEVICE_A',
    hits: [
      hit({ device_identity: 'MODEL_X', body_bbox: body(0.1, 0.1, 0.1, 0.1) }),
      hit({ device_identity: 'OTHER_DEVICE', supporting_model: 'MODEL_X', body_bbox: body(0.4, 0.4, 0.1, 0.1) }),
    ],
    currentDrawingChecksum: CHECKSUM,
    drawing_id: 1,
    analysis_run_id: 'runC2',
    pipeline_version: 'v1',
    groundingUnavailable: false,
  });
  assert.equal(modelOnly.action, 'reject');
  assert.equal(modelOnly.reason, 'model_without_tag_match');
});

test('D: DEVICE_A / X100:12 + physical DEVICE_A → DEVICE geometry, not X100 TB', () => {
  const cls = classifyLiveTbEndpoint('DEVICE_A', 'X100:12');
  assert.equal(cls.endpointType, 'DEVICE_TERMINAL');
  assert.equal(cls.equipmentTag, 'DEVICE_A');
  assert.equal(cls.tbHeader, null);
  assert.ok(cls.terminalReference.includes('X100') || cls.terminalReference.includes('12'));

  // Match-style: equipment via scheduleEquipment when header was historically nulled
  const resolved = resolvePhysicalParent({
    role: 'SOURCE',
    scheduleHeader: null,
    scheduleEquipment: 'DEVICE_A',
    scheduleTerminal: 'X100:12',
    gaMarkers: [],
  });
  assert.equal(resolved.endpointType, 'DEVICE_TERMINAL');
  assert.notEqual(resolved.endpointType, 'TB_GROUP');

  const d = decideDevicePersistence({
    device_identity: 'DEVICE_A',
    hits: [hit({
      device_identity: 'DEVICE_A',
      page_view: 'INTERNAL_VIEW',
      body_bbox: body(0.25, 0.25, 0.2, 0.2),
    })],
    currentDrawingChecksum: CHECKSUM,
    drawing_id: 1,
    analysis_run_id: 'runD',
    pipeline_version: 'v1',
    groundingUnavailable: false,
  });
  assert.equal(d.action, 'persist');
  assert.equal(d.input.device_identity, 'DEVICE_A');
});

test('E: SRC+DST both DEVICE_A different terminals → one shared DEVICE entity', () => {
  assert.equal(samePhysicalDeviceEntity('DEVICE_A', 'DEVICE_A'), true);
  assert.equal(samePhysicalDeviceEntity('DEVICE_A', 'DEVICE_B'), false);
  assert.equal(buildSharedDevicePersistKey('DEVICE_A'), 'DEVICE_A');

  const cables = [
    {
      source_device: 'DEVICE_A',
      source_terminal: 'X100:12',
      dest_device: 'DEVICE_A',
      dest_terminal: 'X100:8',
    },
  ];
  const targets = collectDeviceTargetsFromCables(cables);
  assert.equal(targets.length, 1);
  assert.equal(targets[0].physicalIdentity, 'DEVICE_A');

  const { metrics, decisions } = analyseDeviceLocations({
    cables,
    hits: [hit({ device_identity: 'DEVICE_A', page_view: 'INTERNAL_VIEW' })],
    currentDrawingChecksum: CHECKSUM,
    drawing_id: 1,
    analysis_run_id: 'runE',
    pipeline_version: 'v1',
    groundingUnavailable: false,
  });
  assert.equal(metrics.device_targets_requested, 1);
  assert.equal(decisions.filter((x) => x.action === 'persist').length, 1);
});

test('F: TB_A in reference table + physical strip → physical strip selected', () => {
  const result = selectTbPhysicalOccurrence([
    { header: 'TB_A', kind: 'legend_or_table' },
    { header: 'TB_A', kind: 'strip_candidate' },
  ]);
  assert.equal(result.status, 'PHYSICAL');
  assert.equal(result.hit.kind, 'strip_candidate');
  assert.equal(isPhysicalStripKind('legend_or_table'), false);
  assert.equal(isPhysicalStripKind('strip_candidate'), true);
});

test('G: TB_A appears only in reference table → unresolved', () => {
  const result = selectTbPhysicalOccurrence([
    { header: 'TB_A', kind: 'legend_or_table' },
    { header: 'TB_A', kind: 'title_block' },
  ]);
  assert.equal(result.status, 'UNRESOLVED');
  assert.equal(result.hit, null);
});

test('H: table occurrence + physical occurrence → physical wins (DEVICE + TB)', () => {
  const device = decideDevicePersistence({
    device_identity: 'DEVICE_A',
    hits: [
      hit({
        region_kind: 'reference_table',
        page_view: 'LEGEND_OR_BOM',
        confidence_score: 0.99,
        evidence_role: 'semantic_reference',
      }),
      hit({
        region_kind: 'physical_device_body',
        page_view: 'FRONT_VIEW',
        confidence_score: 0.5,
        body_bbox: body(0.33, 0.33, 0.1, 0.1),
      }),
    ],
    currentDrawingChecksum: CHECKSUM,
    drawing_id: 1,
    analysis_run_id: 'runH',
    pipeline_version: 'v1',
    groundingUnavailable: false,
  });
  assert.equal(device.action, 'persist');
  assert.equal(device.input.geometry_bbox_x, 0.33);

  const tb = selectTbPhysicalOccurrence([
    { header: 'TB_A', kind: 'legend_or_table' },
    { header: 'TB_A', kind: 'strip_candidate' },
  ]);
  assert.equal(tb.status, 'PHYSICAL');
  assert.equal(tb.hit.kind, 'strip_candidate');
});
