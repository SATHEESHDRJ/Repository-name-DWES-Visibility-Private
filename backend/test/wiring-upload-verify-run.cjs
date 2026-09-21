const fs = require('fs');
const path = require('path');
const assert = require('node:assert/strict');

const { SafeExcelReader } = require('../dist/upload/excel-reader.js');
const { parseWiringSheet } = require('../dist/upload/parse-wiring.js');

const fixturePath = path.join(__dirname, '../test-fixtures/wiring-upload-verify.xlsx');
const mapping = {
  sno: 'S.NO',
  panel: 'PNL.NO_A',
  ferrule: 'IEC_FERR_A',
  path: 'TERMSIDE_A',
  source_device: 'DEV_TBLK_A',
  source_terminal: 'TERM_A',
  color: 'WIRE COLOR',
  size: 'WIRE SIZE',
  length: 'LENGTH(M)',
  sign: 'SIGN MARK',
  remarks: 'REMARKS',
  ref: 'REFRNCE_A',
};

async function main() {
  const buffer = fs.readFileSync(fixturePath);
  const uint8 = new Uint8Array(buffer);
  const result = await SafeExcelReader.readHeaders(uint8);
  const sheet = result.sheets.find((s) => s.name === 'WIRING SCHEDULE') || result.sheets[0];
  assert.ok(sheet, 'WIRING SCHEDULE sheet missing');
  assert.equal(sheet.dataRowCount, 25, `dataRowCount expected 25 got ${sheet.dataRowCount}`);
  assert.equal(sheet.rows.length, 25, `rows.length expected 25 got ${sheet.rows.length}`);

  const firstSnoCell = sheet.rows[0][0];
  assert.equal(Number(firstSnoCell), 1, `first row S.NO expected 1 got ${firstSnoCell}`);

  const parsed = await parseWiringSheet(buffer, sheet.name, mapping);
  assert.equal(parsed.cables.length, 25, `cables expected 25 got ${parsed.cables.length}`);
  assert.equal(parsed.cables[0].sno, 1, `first cable sno expected 1 got ${parsed.cables[0].sno}`);

  console.log(JSON.stringify({
    ok: true,
    sheet: sheet.name,
    dataRowCount: sheet.dataRowCount,
    rowsLength: sheet.rows.length,
    firstSno: parsed.cables[0].sno,
    cableCount: parsed.cables.length,
    firstFerrule: parsed.cables[0].ferrule,
  }, null, 2));
}

main().catch((e) => {
  console.error('VERIFY FAILED:', e.message || e);
  process.exit(1);
});
