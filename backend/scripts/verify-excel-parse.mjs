/**
 * Quick verification for Excel wiring schedule parse (all rows + first-row retention).
 * Run: node backend/scripts/verify-excel-parse.mjs
 */
import * as XLSX from 'xlsx';
import { writeFileSync, unlinkSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const backendRoot = join(__dirname, '..');

const headersUrl = pathToFileURL(join(backendRoot, 'dist/upload/excel-headers.js')).href;
const parseUrl = pathToFileURL(join(backendRoot, 'dist/upload/parse-wiring.js')).href;

const { dataStartRow, findHeaderRow } = await import(headersUrl);
const { parseWiringSheet } = await import(parseUrl);

function buildTestWorkbook() {
  const data = [
    ['S.NO', 'PNLNO_A', 'DEV_TBLK_A', 'TERM_A', 'TERMSIDE_A', 'TERMSIDE_B', 'IEC_FERR_A', 'WIRE COLOR', 'LENGTH(m)', 'REF'],
  ];
  for (let i = 1; i <= 400; i++) {
    data.push([
      i,
      '=H00+R',
      '74R1',
      i === 1 ? '4' : String(i % 10),
      '',
      '',
      `74R1:${i % 10}/86B2:B${i % 12}`,
      ' BLUE',
      '2.5m',
      i === 400 ? 'XTE-2' : '030/B3',
    ]);
  }
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(data);
  XLSX.utils.book_append_sheet(wb, ws, 'WIRING SCHEDULE');
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}

const buf = buildTestWorkbook();
const tmpPath = join(backendRoot, 'test-parse-400.xlsx');
writeFileSync(tmpPath, buf);

const wb = XLSX.read(buf, { type: 'buffer' });
const ws = wb.Sheets['WIRING SCHEDULE'];
const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
const headerRow = findHeaderRow(rows);
const dataStart = dataStartRow(rows, headerRow);
const dataRows = rows.slice(dataStart).filter(r => r.some(c => String(c ?? '').trim()));

console.log('headerRow:', headerRow, 'dataStart:', dataStart, 'dataRows:', dataRows.length);
if (dataRows.length !== 400) {
  console.error('FAIL: expected 400 data rows, got', dataRows.length);
  process.exit(1);
}
if (String(dataRows[0][0]) !== '1') {
  console.error('FAIL: first data row S.NO should be 1, got', dataRows[0][0]);
  process.exit(1);
}
if (String(dataRows[399][9]) !== 'XTE-2') {
  console.error('FAIL: last row REF should be XTE-2, got', dataRows[399][9]);
  process.exit(1);
}

const mapping = {
  sno: 'S.NO',
  panel: 'PNLNO_A',
  source_device: 'DEV_TBLK_A',
  source_terminal: 'TERM_A',
  ferrule: 'IEC_FERR_A',
  color: 'WIRE COLOR',
  length: 'LENGTH(m)',
  ref: 'REF',
};

const parsed = parseWiringSheet(buf, 'WIRING SCHEDULE', mapping, headerRow);
console.log('parsed cables:', parsed.cables.length);
if (parsed.cables.length !== 400) {
  console.error('FAIL: expected 400 cables');
  process.exit(1);
}
const first = parsed.cables[0];
if (first.sno !== 1 || first.panel !== '=H00+R' || first.color !== 'BLUE' || first.length !== '2.5m') {
  console.error('FAIL: first cable mismatch', first);
  process.exit(1);
}
const last = parsed.cables[399];
if (last.ref !== 'XTE-2') {
  console.error('FAIL: last cable ref mismatch', last.ref);
  process.exit(1);
}

console.log('OK: 400 rows parsed, S.NO 1–400, whitespace trimmed, length preserved');
unlinkSync(tmpPath);
