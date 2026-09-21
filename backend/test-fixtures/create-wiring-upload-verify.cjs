const ExcelJS = require('exceljs');
const fs = require('fs');
const path = require('path');

const outPath = path.join(__dirname, 'wiring-upload-verify.xlsx');
const headers = [
  'S.NO', 'PNL.NO_A', 'DEV_TBLK_A', 'TERM_A', 'TERMSIDE_A', 'TERMSIDE_B',
  'IEC_FERR_A', 'IEC_FERR_B', 'REFRNCE_A', 'WIRE COLOR', 'WIRE SIZE',
  'SIGN MARK', 'REMARKS', 'LENGTH(M)',
];

async function main() {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('WIRING SCHEDULE');
  ws.addRow(headers);
  for (let i = 1; i <= 25; i++) {
    ws.addRow([
      i,
      'PNL-01',
      `=H001-X${i}`,
      '1',
      `=H001-X${i}:1/=-K${i}:2`,
      'B',
      `F-${String(i).padStart(3, '0')}`,
      `F-${String(i).padStart(3, '0')}-B`,
      `REF-${i}`,
      'GREEN/YELLOW',
      '2.5sq mm',
      '+',
      `Row ${i}`,
      `${1 + i * 0.1}`,
    ]);
  }
  const buf = await wb.xlsx.writeBuffer();
  fs.writeFileSync(outPath, Buffer.from(buf));
  console.log('Wrote', outPath, 'bytes', fs.statSync(outPath).size);
}

main().catch((e) => { console.error(e); process.exit(1); });
