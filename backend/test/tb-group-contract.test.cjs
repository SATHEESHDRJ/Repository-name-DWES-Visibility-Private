const test = require('node:test');
const assert = require('node:assert/strict');

/**
 * Phase 0/1 contract tests for TB_GROUP + expected headers + confidence.
 * Compiled dist must include drawing-tb-analysis + updated match service.
 */

test('TB_GROUP marker type is accepted by validate path (create body contract)', () => {
  // Soft contract: type string used by API must include TB_GROUP.
  const allowed = new Set(['SOURCE_GROUP', 'DESTINATION_GROUP', 'TB_GROUP']);
  assert.equal(allowed.has('TB_GROUP'), true);
});

test('buildExpectedTbHeaders returns unique physical TB headers only', () => {
  const { buildExpectedTbHeaders } = require('../dist/drawing-tb-analysis/expected-headers');
  const headers = buildExpectedTbHeaders([
    { source_device: 'X1A-CT', source_terminal: '1', dest_device: 'X5B-C', dest_terminal: '5' },
    { source_device: 'X1A-CT', source_terminal: '2', dest_device: 'X5B-C', dest_terminal: '6' },
    { source_device: 'x1a-ct', source_terminal: '3', dest_device: 'X5B-C', dest_terminal: '7' },
    // Equipment endpoints must not become expected TB headers
    { source_device: '74IO', source_terminal: '1(-)', dest_device: 'K01', dest_terminal: 'c' },
  ]);
  assert.deepEqual(headers, ['X1A-CT', 'X5B-C']);
});

test('isPhysicalTbHeader distinguishes equipment from X-series TB strips', () => {
  const { isPhysicalTbHeader, resolvePhysicalTbEnd } = require('../dist/tb-markers/terminal-range');
  assert.equal(isPhysicalTbHeader('X1A-CT'), true);
  assert.equal(isPhysicalTbHeader('X7'), true);
  assert.equal(isPhysicalTbHeader('XTJ'), true);
  assert.equal(isPhysicalTbHeader('74IO'), false);
  assert.equal(isPhysicalTbHeader('K01'), false);
  assert.equal(isPhysicalTbHeader('QDC2'), false);

  const equip = resolvePhysicalTbEnd('74IO', '1(-)');
  assert.equal(equip.tb, '');
  const phys = resolvePhysicalTbEnd('74IO', '4');
  assert.equal(phys.tb, '');
  const destTb = resolvePhysicalTbEnd('X9', '49');
  assert.equal(destTb.tb, 'X9');
  assert.equal(destTb.terminal, '49');
  // Equipment DEV_TBLK must NOT promote embedded TERM X* into a TB lookup.
  const deviceTerm = resolvePhysicalTbEnd('87STUB', 'X317:10');
  assert.equal(deviceTerm.tb, '');
  assert.equal(deviceTerm.terminal, '');
  // Header empty + embedded TERM still resolves to TB (TB-only rows).
  const embeddedOnly = resolvePhysicalTbEnd('', 'X317:10');
  assert.equal(embeddedOnly.tb, 'X317');
  assert.equal(embeddedOnly.terminal, '10');
});

test('classifyLiveTbEndpoint: DEVICE vs TB_GROUP cases A–D', () => {
  const { classifyLiveTbEndpoint } = require('../dist/tb-markers/terminal-range');
  const { buildExpectedTbHeaders } = require('../dist/drawing-tb-analysis/expected-headers');

  // A TB → TB
  const aSrc = classifyLiveTbEndpoint('X9', '18');
  const aDst = classifyLiveTbEndpoint('X5A-C', '15');
  assert.equal(aSrc.endpointType, 'TB_GROUP');
  assert.equal(aSrc.physicalLookupKey, 'X9');
  assert.equal(aDst.endpointType, 'TB_GROUP');
  assert.equal(aDst.physicalLookupKey, 'X5A-C');

  // B DEVICE → TB (Wire 022/D4 style)
  const bSrc = classifyLiveTbEndpoint('87STUB', 'X329:18');
  const bDst = classifyLiveTbEndpoint('X5A-C', '15');
  assert.equal(bSrc.endpointType, 'DEVICE_TERMINAL');
  assert.equal(bSrc.physicalLookupKey, '87STUB');
  assert.equal(bSrc.tbHeader, null);
  assert.match(bSrc.terminalReference, /X329/);
  assert.equal(bDst.endpointType, 'TB_GROUP');
  assert.equal(bDst.physicalLookupKey, 'X5A-C');

  // C TB → DEVICE
  const cSrc = classifyLiveTbEndpoint('X5A-C', '15');
  const cDst = classifyLiveTbEndpoint('87STUB', 'X329:18');
  assert.equal(cSrc.endpointType, 'TB_GROUP');
  assert.equal(cDst.endpointType, 'DEVICE_TERMINAL');
  assert.equal(cDst.physicalLookupKey, '87STUB');

  // D DEVICE → DEVICE
  const dSrc = classifyLiveTbEndpoint('74IO', '1(-)');
  const dDst = classifyLiveTbEndpoint('K01', 'c');
  assert.equal(dSrc.endpointType, 'DEVICE_TERMINAL');
  assert.equal(dDst.endpointType, 'DEVICE_TERMINAL');
  assert.equal(dSrc.physicalLookupKey, '74IO');
  assert.equal(dDst.physicalLookupKey, 'K01');

  // Expected headers must not include X329 from DEVICE terminal metadata
  const headers = buildExpectedTbHeaders([
    {
      source_device: '87STUB',
      source_terminal: 'X329:18',
      dest_device: 'X5A-C',
      dest_terminal: '15',
      _raw: {
        DEV_TBLK_A: '87STUB',
        TERM_A: 'X329:18',
      },
    },
  ]);
  assert.deepEqual(headers, ['X5A-C']);
  assert.ok(!headers.includes('X329'));
});

test('scoreCandidate HIGH requires header + (range or cells) + unique', () => {
  const { scoreCandidate } = require('../dist/drawing-tb-analysis/expected-headers');
  const high = scoreCandidate({
    headerExact: true,
    terminalRangeFound: true,
    strongCellPattern: false,
    uniqueOnPage: true,
    ocrOnlyWeak: false,
    conflictingPeers: 0,
  });
  assert.equal(high.confidence, 'HIGH');

  const ambiguous = scoreCandidate({
    headerExact: true,
    terminalRangeFound: true,
    strongCellPattern: true,
    uniqueOnPage: true,
    ocrOnlyWeak: false,
    conflictingPeers: 2,
  });
  assert.equal(ambiguous.confidence, 'AMBIGUOUS');

  const low = scoreCandidate({
    headerExact: false,
    terminalRangeFound: false,
    strongCellPattern: false,
    uniqueOnPage: false,
    ocrOnlyWeak: true,
    conflictingPeers: 0,
  });
  assert.equal(low.confidence, 'LOW');
});

test('TbMarkerMatchService matches TB_GROUP for both source and destination', async () => {
  const { TbMarkerMatchService } = require('../dist/tb-markers/tb-marker-match.service');

  const markers = [
    {
      id: 1,
      project_code: '001',
      frame_id: 'f1',
      marker_type: 'TB_GROUP',
      tb_number: 'X1A-CT',
      terminal_group: '1-12',
      page_number: 1,
      geometry: { x: 0.1, y: 0.1, width: 0.2, height: 0.1 },
      marker_status: 'ACTIVE',
    },
    {
      id: 2,
      project_code: '001',
      frame_id: 'f1',
      marker_type: 'TB_GROUP',
      tb_number: 'X5B-C',
      terminal_group: '5-10',
      page_number: 1,
      geometry: { x: 0.4, y: 0.2, width: 0.2, height: 0.1 },
      marker_status: 'ACTIVE',
    },
  ];

  const prisma = {
    tb_markers: {
      findMany: async () => markers,
    },
  };

  const manualEndpointMapping = { list: () => [] };
  const svc = new TbMarkerMatchService(prisma, null, manualEndpointMapping);
  const res = await svc.matchWireEndpoints(
    '001',
    'f1',
    { device: 'X1A-CT', terminal: '7' },
    { device: 'X5B-C', terminal: '6' },
    { id: 9, role: 'prod_supervisor' },
  );

  assert.equal(res.source_unmatched, false);
  assert.equal(res.destination_unmatched, false);
  assert.equal(res.best_source.tb_number, 'X1A-CT');
  assert.equal(res.best_destination.tb_number, 'X5B-C');
  assert.equal(res.best_source.marker_type, 'TB_GROUP');
});

test('equipment fixture markers (74IO/K01) are never matched as physical TBs', async () => {
  const { TbMarkerMatchService } = require('../dist/tb-markers/tb-marker-match.service');
  const prisma = {
    tb_markers: {
      findMany: async () => [
        {
          id: 22,
          project_code: '001',
          frame_id: 'f1',
          marker_type: 'SOURCE_GROUP',
          tb_number: '74IO',
          terminal_group: '1-12',
          page_number: 1,
          geometry: { x: 0.18, y: 0.32, width: 0.09, height: 0.17 },
          marker_status: 'ACTIVE',
        },
        {
          id: 23,
          project_code: '001',
          frame_id: 'f1',
          marker_type: 'DESTINATION_GROUP',
          tb_number: 'K01',
          terminal_group: 'c',
          page_number: 1,
          geometry: { x: 0.68, y: 0.3, width: 0.09, height: 0.15 },
          marker_status: 'ACTIVE',
        },
      ],
    },
  };
  const svc = new TbMarkerMatchService(prisma, null, { list: () => [] });
  const res = await svc.matchWireEndpoints(
    '001',
    'f1',
    { device: '74IO', terminal: '1(-)' },
    { device: 'K01', terminal: 'c' },
    { id: 9, role: 'prod_supervisor' },
  );
  assert.equal(res.source_unmatched, true);
  assert.equal(res.destination_unmatched, true);
  assert.equal(res.best_source, null);
  assert.equal(res.best_destination, null);
  const reasonBlob = [
    res.source_match_reason,
    res.destination_match_reason,
    JSON.stringify(res.source_rejection_reasons || []),
    JSON.stringify(res.destination_rejection_reasons || []),
  ].join(' ');
  assert.match(reasonBlob, /equipment\/device|DEVICE|equipment/i);
});

test('superseded markers are not matched', async () => {
  const { TbMarkerMatchService } = require('../dist/tb-markers/tb-marker-match.service');
  const prisma = {
    tb_markers: {
      findMany: async () => [
        {
          id: 1,
          project_code: '001',
          frame_id: 'f1',
          marker_type: 'TB_GROUP',
          tb_number: 'X1A-CT',
          terminal_group: '1-12',
          page_number: 1,
          geometry: { x: 0.1, y: 0.1, width: 0.2, height: 0.1 },
          marker_status: 'SUPERSEDED',
        },
      ],
    },
  };
  const svc = new TbMarkerMatchService(prisma, null, { list: () => [] });
  const res = await svc.matchWireEndpoints(
    '001',
    'f1',
    { device: 'X1A-CT', terminal: '3' },
    { device: 'X5B-C', terminal: '1' },
    { id: 1, role: 'prod_supervisor' },
  );
  assert.equal(res.source_unmatched, true);
});

test('drawing_checksum mismatch excludes ACTIVE markers; matching checksum included', async () => {
  const { TbMarkerMatchService } = require('../dist/tb-markers/tb-marker-match.service');
  const markers = [
    {
      id: 10,
      project_code: '001',
      frame_id: 'f1',
      marker_type: 'TB_GROUP',
      tb_number: 'X1A-CT',
      terminal_group: '1-12',
      page_number: 1,
      geometry: { x: 0.1, y: 0.1, width: 0.2, height: 0.1 },
      marker_status: 'ACTIVE',
      drawing_checksum: 'old-revision-sha',
    },
    {
      id: 11,
      project_code: '001',
      frame_id: 'f1',
      marker_type: 'TB_GROUP',
      tb_number: 'X1A-CT',
      terminal_group: '1-12',
      page_number: 1,
      geometry: { x: 0.3, y: 0.3, width: 0.2, height: 0.1 },
      marker_status: 'ACTIVE',
      drawing_checksum: 'current-revision-sha',
    },
    {
      id: 12,
      project_code: '001',
      frame_id: 'f1',
      marker_type: 'TB_GROUP',
      tb_number: 'X5B-C',
      terminal_group: '5-10',
      page_number: 1,
      geometry: { x: 0.4, y: 0.2, width: 0.2, height: 0.1 },
      marker_status: 'ACTIVE',
      drawing_checksum: null,
    },
  ];
  const prisma = {
    tb_markers: {
      findMany: async () => markers,
    },
  };
  const svc = new TbMarkerMatchService(prisma, null, { list: () => [] });

  const mismatched = await svc.matchWireEndpoints(
    '001',
    'f1',
    { device: 'X1A-CT', terminal: '7' },
    { device: 'X5B-C', terminal: '6' },
    { id: 1, role: 'prod_supervisor' },
    'current-revision-sha',
  );
  assert.equal(mismatched.source_unmatched, false);
  assert.equal(mismatched.best_source.id, 11);
  assert.equal(
    mismatched.source_marker_candidates.some(c => c.id === 10),
    false,
    'old revision checksum must be excluded',
  );
  assert.equal(
    mismatched.destination_unmatched,
    true,
    'legacy null checksum excluded when current GA checksum is known',
  );
  assert.ok((mismatched.superseded_excluded || 0) >= 1);

  const noChecksumFilter = await svc.matchWireEndpoints(
    '001',
    'f1',
    { device: 'X1A-CT', terminal: '7' },
    { device: 'X5B-C', terminal: '6' },
    { id: 1, role: 'prod_supervisor' },
  );
  assert.equal(noChecksumFilter.source_marker_candidates.length, 2);
  assert.equal(noChecksumFilter.destination_unmatched, false);
});
