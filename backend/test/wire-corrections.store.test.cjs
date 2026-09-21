const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const ExcelJS = require('exceljs');

const {
  WireCorrectionsStore,
  CORRECTABLE_FIELD_LABELS,
  buildCorrectedFilename,
  safePanelName,
} = require('../dist/tech/wire-corrections.store');

test('safePanelName strips leading equals for folder names', () => {
  assert.equal(safePanelName('=H001'), 'H001');
  assert.equal(safePanelName('H001'), 'H001');
});

test('buildCorrectedFilename keeps project code 002 as text', () => {
  const name = buildCorrectedFilename({
    projectCode: '002',
    projectName: 'SHUNOOF – DEWA – 002',
    panelName: '=H001',
    wireNumber: 16,
    correctedAt: '2026-07-28T06:13:19.396Z',
  });
  assert.match(name, /002/);
  assert.doesNotMatch(name, /__Panel-2__/);
  assert.match(name, /Panel-H001/);
  assert.match(name, /Wire-16/);
  assert.match(name, /Corrected__/);
  assert.match(name, /\.xlsx$/);
});

test('wire corrections write versioned panel folder + WIRING SCHEDULE cell update', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dwes-corr-'));
  const prevUpload = process.env.UPLOAD_DIR;
  process.env.UPLOAD_DIR = root;

  try {
    const project = '002';
    const frameId = 'frame_corr_test';
    const framesDir = path.join(root, project, 'frames');
    fs.mkdirSync(framesDir, { recursive: true });

    const originalPath = path.join(framesDir, `${frameId}.xlsx`);
    const wb = new ExcelJS.Workbook();
    wb.addWorksheet('COVER SHEET').addRow(['Cover']);
    const sheet = wb.addWorksheet('WIRING SCHEDULE');
    sheet.addRow(['S.NO', 'WIRE COLOR CABLE COLOR', 'WIRE SIZE CABLE SIZE', 'LENGTH(m)']);
    for (let i = 1; i <= 16; i++) {
      sheet.addRow([i, 'GREY', '1.5', i === 16 ? '5m' : '1.75']);
    }
    wb.addWorksheet('LINK LIST').addRow(['A', 'B']);
    await wb.xlsx.writeFile(originalPath);
    const originalBytes = fs.readFileSync(originalPath);

    const record = {
      id: 'corr_test_1',
      project_code: project,
      project_name: 'SHUNOOF – DEWA – 002',
      panel_name: '=H001',
      frame_id: frameId,
      cable_index: 15,
      wire_number: 16,
      field: 'length',
      field_label: CORRECTABLE_FIELD_LABELS.length,
      original_value: '5m',
      corrected_value: '30M',
      reason: '3696',
      technician_id: 40,
      technician_name: 'Viju Vijayan',
      technician_username: 'tech1',
      corrected_at: '2026-07-28T06:13:19.396Z',
    };

    const result = await WireCorrectionsStore.append(record, {
      sourceBuffer: originalBytes,
      cables: Array.from({ length: 16 }, (_, i) => ({
        sno: i + 1,
        color: 'GREY',
        size: '1.5',
        length: i === 15 ? '5m' : '1.75',
        excel_row: i + 2,
      })),
      mapping: {
        color: 'WIRE COLOR CABLE COLOR',
        size: 'WIRE SIZE CABLE SIZE',
        length: 'LENGTH(m)',
      },
    });

    assert.match(result.corrected_excel_display_path, /uploads\/002\/Corrections\/H001\//);
    assert.match(result.corrected_excel_filename, /Wire-16/);
    assert.match(result.corrected_excel_filename, /002/);
    assert.deepEqual(
      fs.readFileSync(originalPath),
      originalBytes,
      'original Excel must be unchanged',
    );

    const correctedAbs = WireCorrectionsStore.resolveCorrectedExcelAbsolutePath(project, frameId);
    assert.ok(correctedAbs && fs.existsSync(correctedAbs));
    assert.match(correctedAbs.replace(/\\/g, '/'), /Corrections\/H001\//);

    const out = new ExcelJS.Workbook();
    await out.xlsx.readFile(correctedAbs);
    assert.ok(out.getWorksheet('COVER SHEET'));
    assert.ok(out.getWorksheet('LINK LIST'));
    const schedule = out.getWorksheet('WIRING SCHEDULE');
    assert.ok(schedule);
    // S.NO 16 is Excel row 17 (header + 16)
    const lengthCell = schedule.getRow(17).getCell(4);
    assert.equal(String(lengthCell.value), '30M');
    assert.equal(String(lengthCell.fill?.fgColor?.argb || '').toUpperCase(), 'FFFFC107');
    assert.match(String(lengthCell.note || ''), /Viju Vijayan/);
    assert.match(String(lengthCell.note || ''), /@tech1/);
    assert.match(String(lengthCell.note || ''), /3696/);

    // Soft yellow on a non-corrected cell in the same row
    const colorCell = schedule.getRow(17).getCell(2);
    assert.equal(String(colorCell.fill?.fgColor?.argb || '').toUpperCase(), 'FFFFF3CD');

    // Unrelated row not highlighted
    const other = schedule.getRow(2).getCell(4);
    assert.equal(String(other.value), '1.75');
    assert.notEqual(String(other.fill?.fgColor?.argb || '').toUpperCase(), 'FFFFC107');

    // CORRECTION AUDIT column
    const headerRow = schedule.getRow(1);
    let auditCol = 0;
    headerRow.eachCell((cell, col) => {
      if (String(cell.value || '').toUpperCase().includes('CORRECTION AUDIT')) auditCol = col;
    });
    assert.ok(auditCol > 0);
    assert.match(String(schedule.getRow(17).getCell(auditCol).value || ''), /5m → 30M/);

    const techSheet = out.getWorksheet('Technician Corrections');
    assert.ok(techSheet);
    assert.match(String(techSheet.getRow(2).getCell(1).value), /002/);
    assert.equal(String(techSheet.getRow(2).getCell(6).value), '30M');

    // Second correction creates a new file and keeps prior
    const priorName = result.corrected_excel_filename;
    const record2 = {
      ...record,
      id: 'corr_test_2',
      field: 'color',
      field_label: CORRECTABLE_FIELD_LABELS.color,
      original_value: 'GREY',
      corrected_value: 'BLUE',
      reason: 'colour check',
      corrected_at: '2026-07-28T07:00:00.000Z',
    };
    const result2 = await WireCorrectionsStore.append(record2, {
      sourceBuffer: originalBytes,
      cables: Array.from({ length: 16 }, (_, i) => ({
        sno: i + 1,
        color: 'GREY',
        size: '1.5',
        length: i === 15 ? '5m' : '1.75',
        excel_row: i + 2,
      })),
      mapping: {
        color: 'WIRE COLOR CABLE COLOR',
        size: 'WIRE SIZE CABLE SIZE',
        length: 'LENGTH(m)',
      },
    });
    assert.notEqual(result2.corrected_excel_filename, priorName);
    assert.ok(fs.existsSync(path.join(root, project, 'Corrections', 'H001', priorName)));
    assert.ok(fs.existsSync(path.join(root, project, 'Corrections', 'H001', result2.corrected_excel_filename)));

    const out2 = new ExcelJS.Workbook();
    await out2.xlsx.readFile(WireCorrectionsStore.resolveCorrectedExcelAbsolutePath(project, frameId));
    const schedule2 = out2.getWorksheet('WIRING SCHEDULE');
    assert.equal(String(schedule2.getRow(17).getCell(4).value), '30M');
    assert.equal(String(schedule2.getRow(17).getCell(2).value), 'BLUE');
  } finally {
    if (prevUpload == null) delete process.env.UPLOAD_DIR;
    else process.env.UPLOAD_DIR = prevUpload;
    fs.rmSync(root, { recursive: true, force: true });
  }
});
