const { test } = require('node:test');
const assert = require('node:assert/strict');
const XLSX = require('xlsx');

// Compile is run first, so we import from the compiled dist folder
const { parseWiringSheet } = require('../dist/upload/parse-wiring');
const { findHeaderRow, dataStartRow } = require('../dist/upload/excel-headers');

function createSheetBuffer(aoa, sheetName = 'Sheet1') {
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}

const mapping = {
  sno: 'SNO',
  ferrule: 'FERRULE',
  source_device: 'SOURCE DEVICE',
  source_terminal: 'SOURCE TERMINAL',
  dest_device: 'DEST DEVICE',
  dest_terminal: 'DEST TERMINAL',
};

test('Excel Parser Regression - One header and six cables (E2E format)', async (t) => {
  const aoa = [
    ['SNO', 'FERRULE', 'SOURCE DEVICE', 'SOURCE TERMINAL', 'DEST DEVICE', 'DEST TERMINAL'],
    [1, 'F-001', 'SRC-DEV-1', 'X1', 'DST-DEV-1', 'Y1'],
    [2, 'F-002', 'SRC-DEV-2', 'X2', 'DST-DEV-2', 'Y2'],
    [3, 'F-003', 'SRC-DEV-3', 'X3', 'DST-DEV-3', 'Y3'],
    [4, 'F-004', 'SRC-DEV-4', 'X4', 'DST-DEV-4', 'Y4'],
    [5, 'F-005', 'SRC-DEV-5', 'X5', 'DST-DEV-5', 'Y5'],
    [6, 'F-006', 'SRC-DEV-6', 'X6', 'DST-DEV-6', 'Y6'],
  ];

  const buf = createSheetBuffer(aoa, 'WIRING');
  const parsed = parseWiringSheet(buf, 'WIRING', mapping);

  assert.equal(parsed.cables.length, 6, `Expected 6 cables, got ${parsed.cables.length}`);
  assert.equal(parsed.cables[0].ferrule, 'F-001');
  assert.equal(parsed.cables[5].ferrule, 'F-006');
  assert.equal(parsed.cables[0].sno, 1);
  assert.equal(parsed.cables[5].sno, 6);
});

test('Excel Parser Regression - Data begins immediately after header row', async (t) => {
  const aoa = [
    ['SNO', 'FERRULE', 'SOURCE DEVICE', 'SOURCE TERMINAL', 'DEST DEVICE', 'DEST TERMINAL'],
    [1, 'F-001', 'SRC-DEV-1', 'X1', 'DST-DEV-1', 'Y1'],
  ];

  const buf = createSheetBuffer(aoa);
  const parsed = parseWiringSheet(buf, 'Sheet1', mapping);

  assert.equal(parsed.cables.length, 1);
  assert.equal(parsed.cables[0].ferrule, 'F-001');
});

test('Excel Parser Regression - Empty and blank rows ignored', async (t) => {
  const aoa = [
    ['SNO', 'FERRULE', 'SOURCE DEVICE', 'SOURCE TERMINAL', 'DEST DEVICE', 'DEST TERMINAL'],
    [1, 'F-001', 'SRC-DEV-1', 'X1', 'DST-DEV-1', 'Y1'],
    ['', '', '', '', '', ''],
    [2, 'F-002', 'SRC-DEV-2', 'X2', 'DST-DEV-2', 'Y2'],
    [],
  ];

  const buf = createSheetBuffer(aoa);
  const parsed = parseWiringSheet(buf, 'Sheet1', mapping);

  assert.equal(parsed.cables.length, 2);
  assert.equal(parsed.cables[0].ferrule, 'F-001');
  assert.equal(parsed.cables[1].ferrule, 'F-002');
});

test('Excel Parser Regression - Actual DWES schedule format (WIRE NO pairs, LENGTH(m), leading-space colours)', async (t) => {
  // Mirrors the real WRING_FRAME sheets: "LENGTH(m)" without a space, colours
  // with a leading space ("␣GREEN/YELLOW"), and device:terminal pair columns.
  const dwesMapping = {
    sno: 'S.NO',
    ferrule: 'WIRE NO',
    source_device: 'FROM DEVICE',
    source_terminal: 'FROM TERM',
    dest_device: 'TO DEVICE',
    dest_terminal: 'TO TERM',
    color: 'COLOUR',
    size: 'SIZE',
    length: 'LENGTH(m)',
    remarks: 'REMARKS',
  };
  const aoa = [
    ['S.NO', 'WIRE NO', 'FROM DEVICE', 'FROM TERM', 'TO DEVICE', 'TO TERM', 'COLOUR', 'SIZE', 'LENGTH(m)', 'REMARKS'],
    [1, 'F-001', '=H001-X2', '1', '-K1', '2', ' GREEN/YELLOW', '2.5sq mm', '1.2', 'earth link'],
    [2, 'F-002', '=H001-X2', '2', '-K1', '4', ' GREEN', '1.5sq mm', '0.8', ''],
    [3, 'F-003', '=H001-X3', '1', '-K2', '1', 'YELLOW', '1.5sq mm', '2.4', ''],
    [4, 'F-004', '=H001-X3', '2', '-K2', '3', 'RED', '1.5sq mm', '2.4', ''],
    [5, 'F-005', '=H001-X4', '1', '-K3', '1', 'BLUE', '1.5sq mm', '3.1', ''],
    [6, 'F-006', '=H001-X4', '2', '-K3', '2', 'BLACK', '1.5sq mm', '3.1', ''],
  ];
  const parsed = parseWiringSheet(createSheetBuffer(aoa, 'WIRING'), 'WIRING', dwesMapping);

  assert.equal(parsed.cables.length, 6, `Expected 6 cables, got ${parsed.cables.length}`);
  assert.deepEqual(parsed.cables.map(c => c.ferrule), ['F-001', 'F-002', 'F-003', 'F-004', 'F-005', 'F-006']);
  assert.equal(parsed.cables[0].color, 'GREEN/YELLOW'); // leading space + slash normalised
  assert.equal(parsed.cables[0].length, '1.2');
  assert.equal(parsed.cables[0].source, '=H001-X2:1');
});

test('Excel Parser Regression - Digit-free first data row is NOT skipped as a sub-header', async (t) => {
  // Historical first-row drop: short digit-free cells (device names, colours)
  // used to satisfy the loose header-label fallback and the whole row was
  // skipped as a "sub-header". Strong-evidence counting keeps it as data.
  const aoa = [
    ['SNO', 'FERRULE', 'SOURCE DEVICE', 'SOURCE TERMINAL', 'DEST DEVICE', 'DEST TERMINAL'],
    ['', 'CT', 'MAIN', 'A', 'RELAY', 'B'],
    ['', 'PT', 'AUX', 'C', 'METER', 'D'],
  ];
  const parsed = parseWiringSheet(createSheetBuffer(aoa), 'Sheet1', mapping);

  assert.equal(parsed.cables.length, 2, `Expected 2 cables, got ${parsed.cables.length}`);
  assert.equal(parsed.cables[0].ferrule, 'CT');
  assert.equal(parsed.cables[1].ferrule, 'PT');
});

test('Excel Parser Regression - Genuine wire-spec sub-header row is still skipped', async (t) => {
  const aoa = [
    ['SNO', 'FERRULE', 'SOURCE DEVICE', 'SOURCE TERMINAL', 'DEST DEVICE', 'DEST TERMINAL'],
    ['', '2.5sq mm White', '1.5sq mm Black', '2.5sq mm White', '1.5sq mm Black', ''],
    [1, 'F-001', 'SRC-DEV-1', 'X1', 'DST-DEV-1', 'Y1'],
    [2, 'F-002', 'SRC-DEV-2', 'X2', 'DST-DEV-2', 'Y2'],
  ];
  const parsed = parseWiringSheet(createSheetBuffer(aoa), 'Sheet1', mapping);

  assert.equal(parsed.cables.length, 2, `Expected 2 cables (spec row skipped), got ${parsed.cables.length}`);
  assert.equal(parsed.cables[0].ferrule, 'F-001');
});

test('Excel Parser Regression - Alternative header positions (Metadata at top)', async (t) => {
  const aoa = [
    ['PROJECT:', 'DEMO-123'],
    ['CLIENT:', 'TEST CLIENT'],
    [],
    ['SNO', 'FERRULE', 'SOURCE DEVICE', 'SOURCE TERMINAL', 'DEST DEVICE', 'DEST TERMINAL'],
    [1, 'F-001', 'SRC-DEV-1', 'X1', 'DST-DEV-1', 'Y1'],
    [2, 'F-002', 'SRC-DEV-2', 'X2', 'DST-DEV-2', 'Y2'],
  ];

  const buf = createSheetBuffer(aoa);
  
  const wb = XLSX.read(buf, { type: 'buffer' });
  const ws = wb.Sheets['Sheet1'];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
  
  const headerIdx = findHeaderRow(rows);
  assert.equal(headerIdx, 3, `Expected header index 3, got ${headerIdx}`);

  const dataStart = dataStartRow(rows, headerIdx);
  assert.equal(dataStart, 4, `Expected data start row 4, got ${dataStart}`);

  const parsed = parseWiringSheet(buf, 'Sheet1', mapping, headerIdx);
  assert.equal(parsed.cables.length, 2);
  assert.equal(parsed.cables[0].ferrule, 'F-001');
  assert.equal(parsed.cables[1].ferrule, 'F-002');
});
