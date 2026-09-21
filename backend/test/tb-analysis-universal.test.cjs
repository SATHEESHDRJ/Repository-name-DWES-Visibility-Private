const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

test('buildExpectedTbHeaders excludes equipment embedded TERM; keeps physical TB headers', () => {
  const { buildExpectedTbHeaders, buildScheduleTbTerminalIndex } = require('../dist/drawing-tb-analysis/expected-headers');
  const cables = [
    {
      // 87STUB is equipment; X321 in TERM is device terminal metadata — NOT an expected TB header
      source_device: '87STUB',
      source_terminal: 'X321:17',
      dest_device: 'X9',
      dest_terminal: '40',
    },
    {
      source_device: '74IO',
      source_terminal: '1(-)',
      dest_device: 'K01',
      dest_terminal: 'c',
    },
    {
      // Empty device + embedded TERM still yields a physical TB header
      source_device: '',
      source_terminal: 'X321:17',
      dest_device: 'X5A-C',
      dest_terminal: '15',
    },
  ];
  const headers = buildExpectedTbHeaders(cables);
  assert.deepEqual(headers, ['X321', 'X5A-C', 'X9']);
  const index = buildScheduleTbTerminalIndex(cables);
  assert.deepEqual(index.X321, ['17']);
  assert.deepEqual(index.X9, ['40']);
  assert.deepEqual(index['X5A-C'], ['15']);
});

test('buildExpectedTbHeaders prefers _raw DEV_TBLK over equipment typed fields', () => {
  const { buildExpectedTbHeaders } = require('../dist/drawing-tb-analysis/expected-headers');
  const cables = [
    {
      source_device: '74IO',
      source_terminal: '1(-)',
      dest_device: 'K01',
      dest_terminal: 'c',
      _raw: {
        DEV_TBLK_A: 'X7',
        TERM_A: '12',
        DEV_TBLK_B: 'X1A-CT',
        TERM_B: '3',
      },
    },
  ];
  assert.deepEqual(buildExpectedTbHeaders(cables), ['X1A-CT', 'X7']);
});

test('classifyPageView rejects schematic/terminal-diagram; allows rear/internal', () => {
  const {
    classifyPageView,
    classifyHeaderView,
    isLiveTbEligibleView,
    isLiveTbRejectedView,
  } = require('../dist/drawing-tb-analysis/live-tb-view-classification');
  assert.equal(classifyPageView('REARWIRINGVIEW TERMINALSTRIP'), 'REAR_WIRING_VIEW');
  assert.equal(classifyPageView('INTERNALVIEW TERMINALBLOCK'), 'INTERNAL_VIEW');
  assert.equal(classifyPageView('SCHEMATIC DIAGRAM NO REAR'), 'SCHEMATIC');
  assert.equal(classifyPageView('TERMINALDIAGRAM CONNECTIONTABLE'), 'TERMINAL_DIAGRAM');
  assert.equal(isLiveTbRejectedView('SCHEMATIC'), true);
  assert.equal(isLiveTbRejectedView('TERMINAL_DIAGRAM'), true);
  assert.equal(isLiveTbEligibleView('PHYSICAL_TB_BANK'), true);
  const hv = classifyHeaderView({
    pageView: 'INTERNAL_VIEW',
    neighborhoodKind: 'strip_candidate',
    nearbyCompact: 'X71-12TERMINALS',
  });
  assert.equal(hv, 'PHYSICAL_TB_BANK');
});

test('scoreCandidate HIGH with eligible view + box without terminal cells', () => {
  const { scoreCandidate } = require('../dist/drawing-tb-analysis/expected-headers');
  const r = scoreCandidate({
    headerExact: true,
    terminalRangeFound: false,
    strongCellPattern: false,
    uniqueOnPage: true,
    ocrOnlyWeak: false,
    conflictingPeers: 0,
    eligibleView: true,
    hasRealBox: true,
  });
  assert.equal(r.confidence, 'HIGH');
});

test('extractPdfLiteralText does not treat compressed-stream X9 as a header hit', () => {
  const { extractPdfLiteralText, textContainsHeader } = require('../dist/drawing-tb-analysis/pdf-text-layer');
  // Synthetic PDF-ish buffer: binary noise containing X9 + a real literal (X1A-CT)
  const noise = Buffer.from('stream\x00\x01X9\x02endstream', 'binary');
  const literal = Buffer.from('BT (X1A-CT) Tj ET', 'latin1');
  const buf = Buffer.concat([noise, literal]);
  const text = extractPdfLiteralText(buf);
  assert.equal(textContainsHeader(text, 'X1A-CT'), true);
  assert.equal(textContainsHeader(text, 'X9'), false);
});

test('legend neighborhood is not classified as a physical strip', () => {
  const { classifyHeaderNeighborhood, findHeaderIndexes } = require('../dist/drawing-tb-analysis/pdf-text-layer');
  assert.equal(classifyHeaderNeighborhood('TB-FEEDTHROUGHTYPE-SPARECIRCUIT'), 'legend_or_table');
  assert.equal(classifyHeaderNeighborhood('1-12TERMINALS'), 'strip_candidate');
  assert.equal(classifyHeaderNeighborhood('TITLEBLOCKREVISION'), 'title_block');
  assert.equal(classifyHeaderNeighborhood('NOTE:REFERTODRAWING'), 'drawing_note');
  assert.equal(classifyHeaderNeighborhood('RELAYCONTACTORPLC'), 'equipment_label');
  const compact = 'FOO|X9TB-FEEDTHROUGHTYPE|BAR|X321|BAZ|IGX9TB-KNIFE|XD1-XD2DIODE';
  assert.deepEqual(findHeaderIndexes(compact, 'X9'), [4, 40]);
  assert.deepEqual(findHeaderIndexes(compact, 'X321'), [29]);
  assert.deepEqual(findHeaderIndexes('AX9B', 'X9'), []);
  assert.deepEqual(findHeaderIndexes('X91', 'X9'), []);
  assert.deepEqual(findHeaderIndexes('X9:17', 'X9'), [0]);
  assert.deepEqual(findHeaderIndexes(compact, 'XD2'), []); // not XD2DIODE
});

test('findTerminalRangeNearHeader never invents 1-12 evidence', () => {
  const { findTerminalRangeNearHeader } = require('../dist/drawing-tb-analysis/pdf-text-layer');
  assert.deepEqual(findTerminalRangeNearHeader('X7ONLYLABEL', 'X7'), { range: '', found: false });
  assert.deepEqual(findTerminalRangeNearHeader('X7 1-24 TERMINALS', 'X7'), { range: '1-24', found: true });
  assert.equal(findTerminalRangeNearHeader('NOHEADERHERE1-12', 'X99').found, false);
});

test('crossVerifyTbHeader: legend-only stays LOW; rear strip header-group promotes HIGH', () => {
  const { crossVerifyTbHeader } = require('../dist/drawing-tb-analysis/excel-ga-cross-verify');
  const legend = crossVerifyTbHeader({
    header: 'X9',
    hits: [{
      header: 'X9',
      pageNumber: 1,
      kind: 'legend_or_table',
      viewClassification: 'LEGEND_OR_BOM',
      geometry: { x: 0.1, y: 0.1, width: 0.05, height: 0.02, rotation: 0 },
      nearbyCompact: 'X9TB-FEEDTHROUGH',
    }],
    scheduleTerminals: ['40'],
    terminalRangeFound: false,
    terminalRange: '',
    hasGlyphBox: true,
    peers: 0,
  });
  assert.equal(legend.confidence, 'LOW');
  assert.equal(legend.usableHits.length, 0);

  const strip = crossVerifyTbHeader({
    header: 'X7',
    hits: [{
      header: 'X7',
      pageNumber: 1,
      kind: 'strip_candidate',
      viewClassification: 'PHYSICAL_TB_BANK',
      geometry: { x: 0.2, y: 0.3, width: 0.04, height: 0.02, rotation: 0 },
      nearbyCompact: 'X71-12TERMINALS',
    }],
    scheduleTerminals: ['5'],
    terminalRangeFound: true,
    terminalRange: '1-12',
    hasGlyphBox: true,
    peers: 0,
  });
  assert.equal(strip.confidence, 'HIGH');

  // Terminal outside detected range is OK — LIVE TB paints header group, not exact cell
  const mismatchRange = crossVerifyTbHeader({
    header: 'X7',
    hits: [{
      header: 'X7',
      pageNumber: 1,
      kind: 'strip_candidate',
      viewClassification: 'REAR_WIRING_VIEW',
      geometry: { x: 0.2, y: 0.3, width: 0.04, height: 0.02, rotation: 0 },
      nearbyCompact: 'X71-12',
    }],
    scheduleTerminals: ['40'],
    terminalRangeFound: true,
    terminalRange: '1-12',
    hasGlyphBox: true,
    peers: 0,
  });
  assert.equal(mismatchRange.confidence, 'HIGH');

  const ambiguous = crossVerifyTbHeader({
    header: 'X7',
    hits: [
      {
        header: 'X7',
        pageNumber: 1,
        kind: 'strip_candidate',
        viewClassification: 'PHYSICAL_TB_BANK',
        geometry: { x: 0.2, y: 0.3, width: 0.04, height: 0.02, rotation: 0 },
        nearbyCompact: 'X71-12',
      },
      {
        header: 'X7',
        pageNumber: 2,
        kind: 'strip_candidate',
        viewClassification: 'PHYSICAL_TB_BANK',
        geometry: { x: 0.5, y: 0.5, width: 0.04, height: 0.02, rotation: 0 },
        nearbyCompact: 'X71-24',
      },
    ],
    scheduleTerminals: ['5'],
    terminalRangeFound: true,
    terminalRange: '1-12',
    hasGlyphBox: true,
    peers: 1,
  });
  assert.equal(ambiguous.confidence, 'AMBIGUOUS');
});

test('isPhysicalStripKind only accepts strip_candidate', () => {
  const { isPhysicalStripKind } = require('../dist/drawing-tb-analysis/pdf-text-layer');
  assert.equal(isPhysicalStripKind('strip_candidate'), true);
  assert.equal(isPhysicalStripKind('legend_or_table'), false);
  assert.equal(isPhysicalStripKind('title_block'), false);
  assert.equal(isPhysicalStripKind('unknown'), false);
});

test('repro GA PDF literals do not contain X321 (schedule/drawing presence gate)', () => {
  const { extractPdfLiteralText, textContainsHeader } = require('../dist/drawing-tb-analysis/pdf-text-layer');
  const pdfPath = path.join(__dirname, '_tmp_repro_ga.pdf');
  if (!fs.existsSync(pdfPath)) {
    // Optional local artifact from debug search — skip if absent
    return;
  }
  const text = extractPdfLiteralText(fs.readFileSync(pdfPath));
  assert.equal(textContainsHeader(text, 'X321'), false);
});
