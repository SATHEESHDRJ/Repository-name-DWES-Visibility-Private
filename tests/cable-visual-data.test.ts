import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { Cable } from '../src/types/index.ts';
import {
  parseLengthMeters,
  resolveCableVisualData,
  cableVisualLabel,
  ensureCableVisualInHeaders,
  deriveTechnicianExcelHeaders,
  findNextPending,
  getExactExcelCellValue,
  wireColorHex,
  wireSizeStrokeWidth,
} from '../src/components/technician/wiring/wiring-utils.ts';

function cable(overrides: Partial<Cable> = {}): Cable {
  return {
    sno: 1,
    panel: '=H00+R',
    ferrule: '74R1:4/86B2:B6',
    source_device: '74R1',
    source_terminal: '4',
    source: '74R1:4',
    destination: '86B2:B6',
    dest_device: '86B2',
    dest_terminal: 'B6',
    ref: '030/B3',
    color: '',
    size: '',
    length: '',
    sign: 'SAS',
    remarks: '',
    path: '74R1:4->86B2:B6',
    ...overrides,
  };
}

describe('Cable Visual Excel row data', () => {
  it('reads ENOWA colour, size, and length directly from the selected row', () => {
    const row = cable({
      _raw: {
        'WIRE COLOR': ' BLUE',
        'WIRE SIZE': '1.5SQ.mm',
        'LENGTH(m)': '2.5m',
      },
    });

    assert.deepEqual(resolveCableVisualData(row), {
      color: 'BLUE',
      size: '1.5SQ.mm',
      length: '2.5m',
    });
  });

  it('uses explicit supervisor mappings for non-standard spreadsheet headers', () => {
    const row = cable({
      color: 'GREY',
      size: '1SQ.mm',
      length: '1m',
      _raw: {
        'CONDUCTOR COLOUR': 'GREEN / YELLOW',
        'CSA': '2.5SQ.mm',
        'CUT LENGTH': '3.25m',
      },
    });

    assert.deepEqual(resolveCableVisualData(row, {
      color: 'CONDUCTOR COLOUR',
      size: 'CSA',
      length: 'CUT LENGTH',
    }), {
      color: 'GREEN/YELLOW',
      size: '2.5SQ.mm',
      length: '3.25m',
    });
  });

  it('updates all visual metrics when revised row cells are supplied', () => {
    const original = resolveCableVisualData(cable({
      _raw: { 'WIRE COLOR': 'BLUE', 'WIRE SIZE': '1.5SQ.mm', 'LENGTH(m)': '2.5m' },
    }));
    const revised = resolveCableVisualData(cable({
      _raw: { 'WIRE COLOR': 'GREEN/YELLOW', 'WIRE SIZE': '2.5SQ.mm', 'LENGTH(m)': '4m' },
    }));

    assert.notDeepEqual(revised, original);
    assert.deepEqual(wireColorHex(revised.color), { hex: '#27ae60', hex2: '#f1c40f' });
    assert.ok(wireSizeStrokeWidth(revised.size) > wireSizeStrokeWidth(original.size));
    assert.equal(parseLengthMeters(revised.length), 4);
    assert.equal(cableVisualLabel(revised), 'GREEN/YELLOW · 2.5 SQ.mm · 4 m');
  });

  it('formats the compact row label without inventing visual values', () => {
    const data = resolveCableVisualData(cable({
      record_id: 'wire_123',
      color: 'grey',
      size: '1.5SQ.mm',
      length: '3m',
    }));
    assert.equal(cableVisualLabel(data), 'GREY · 1.5 SQ.mm · 3 m');
  });

  it('places the compact visual between mapped source and destination columns', () => {
    const headers = ['S.NO', 'SOURCE DEVICE', 'SOURCE TERMINAL', 'DEST DEVICE', 'DEST TERMINAL'];
    const result = ensureCableVisualInHeaders(headers, {
      source_device: 'SOURCE DEVICE',
      source_terminal: 'SOURCE TERMINAL',
      dest_device: 'DEST DEVICE',
      dest_terminal: 'DEST TERMINAL',
    });

    assert.deepEqual(result, [
      'S.NO', 'SOURCE DEVICE', 'SOURCE TERMINAL', 'Cable Visual', 'DEST DEVICE', 'DEST TERMINAL',
    ]);
  });

  it('uses exact uploaded values under the original Excel headings', () => {
    const row = cable({
      record_id: 'wire_exact_1',
      excel_row: 3,
      panel: 'H00+R',
      color: 'BLUE',
      _raw: {
        'S.NO': '1',
        PNLNO_A: '=H00+R',
        DEV_TBLK_A: '74R1',
        TERM_A: '4',
        'WIRE COLOR': ' BLUE',
      },
    });
    const mapping = {
      sno: 'S.NO', panel: 'PNLNO_A', source_device: 'DEV_TBLK_A',
      source_terminal: 'TERM_A', color: 'WIRE COLOR',
    };

    assert.equal(getExactExcelCellValue(row, 'S.NO', mapping), '1');
    assert.equal(getExactExcelCellValue(row, 'PNLNO_A', mapping), '=H00+R');
    assert.equal(getExactExcelCellValue(row, 'DEV_TBLK_A', mapping), '74R1');
    assert.equal(getExactExcelCellValue(row, 'TERM_A', mapping), '4');
    assert.equal(getExactExcelCellValue(row, 'WIRE COLOR', mapping), ' BLUE');
  });

  it('rejects composite metadata labels in favour of exact ordered raw headers', () => {
    const raw = {
      'S.NO': '1',
      PNLNO_A: '=H00+R',
      DEV_TBLK_A: '74R1',
      TERM_A: '4',
      TERMSIDE_A: '',
      'WIRE COLOR': 'BLUE',
      'LENGTH(m)': '2.5m',
    };
    const composite = [
      'S.NO SERIAL NUMBER', 'PNLNO_A PANEL NAME', 'DEV_TBLK_A SOURCE DEVICE',
      'TERM_A SOURCE TERMINALS', 'TERMSIDE_A', 'WIRE COLOR CABLE COLOR',
      'LENGTH(m) CABLE LENGTH',
    ];

    assert.deepEqual(deriveTechnicianExcelHeaders({}, composite, raw), Object.keys(raw));
    assert.equal(getExactExcelCellValue(cable({ _raw: raw }), 'TERMSIDE_A', {}), '');
  });

  it('advances from the completed record to the next record in Excel order', () => {
    const rows = [
      cable({ record_id: 'wire_1', excel_row: 3, sno: 1 }),
      cable({ record_id: 'wire_2', excel_row: 4, sno: 2 }),
    ];
    const next = findNextPending(0, rows.length, {
      '0': { src: true, dst: true, note: '' },
    });

    assert.equal(next, 1);
    assert.equal(rows[next].record_id, 'wire_2');
    assert.equal(rows[next].excel_row, 4);
  });
});
