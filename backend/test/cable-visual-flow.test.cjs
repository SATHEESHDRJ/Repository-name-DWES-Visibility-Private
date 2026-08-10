const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const ExcelJS = require('exceljs');

const { UploadService } = require('../dist/upload/upload.service');
const { TechService } = require('../dist/tech/tech.service');
const { MockStore } = require('../dist/data/mock-store');

const PROJECT = 'CV_FLOW';
const FRAME = 'frame_cv_flow';
const TECH_ID = 701;
const SUPERVISOR_ID = 702;

const mapping = {
  sno: 'S.NO',
  ferrule: 'FERRULE',
  source_device: 'SOURCE DEVICE',
  source_terminal: 'SOURCE TERMINAL',
  dest_device: 'DEST DEVICE',
  dest_terminal: 'DEST TERMINAL',
  color: 'WIRE COLOR',
  size: 'WIRE SIZE',
  length: 'CABLE LENGTH',
  sign: 'SIGN MARK',
  ref: 'REFERENCE',
};

async function workbook(rows, withDescriptiveHeaderRow = false) {
  const headers = Object.values(mapping);
  const values = rows.map(row => headers.map(header => row[header] ?? ''));
  const descriptiveHeaders = [
    'SERIAL NUMBER', 'SOURCE FERRULE', 'SOURCE DEVICE', 'SOURCE TERMINALS',
    'DESTINATION DEVICE', 'DESTINATION TERMINALS', 'CABLE COLOR', 'CABLE SIZE',
    'CABLE LENGTH', 'SIGN MARK', 'REFERENCE',
  ];
  const book = new ExcelJS.Workbook();
  book.addWorksheet('WIRING').addRows([headers, ...(withDescriptiveHeaderRow ? [descriptiveHeaders] : []), ...values]);
  return Buffer.from(await book.xlsx.writeBuffer());
}

function row(sno, values = {}) {
  return {
    'S.NO': sno,
    FERRULE: `F-${String(sno).padStart(3, '0')}`,
    'SOURCE DEVICE': `SRC-${sno}`,
    'SOURCE TERMINAL': `X${sno}`,
    'DEST DEVICE': `DST-${sno}`,
    'DEST TERMINAL': `Y${sno}`,
    'WIRE COLOR': 'GREY',
    'WIRE SIZE': '1.5 SQ.mm',
    'CABLE LENGTH': '3 m',
    'SIGN MARK': '+VE',
    REFERENCE: `REF-${sno}`,
    ...values,
  };
}

function prismaHarness() {
  const fileHashes = [];
  const audits = [];
  let assignment = null;
  const prisma = {
    projects: {
      findFirst: async () => ({ id: 1, code: PROJECT, name: 'Cable Visual Flow', is_active: true }),
    },
    file_hashes: {
      findFirst: async ({ where }) => fileHashes.find(item =>
        (!where.file_hash || item.file_hash === where.file_hash)
        && (!where.project_code || item.project_code === where.project_code)) ?? null,
      create: async ({ data }) => {
        const value = { id: fileHashes.length + 1, uploaded_at: new Date(), ...data };
        fileHashes.push(value);
        return value;
      },
    },
    ga_asset_sets: { updateMany: async () => ({ count: 0 }) },
    users: {
      findUnique: async ({ where }) => where.id === TECH_ID
        ? { id: TECH_ID, username: 'cable.tech', full_name: 'Cable Technician', role: 'wiring_technician', is_active: true, whatsapp_number: '' }
        : { id: SUPERVISOR_ID, username: 'supervisor', full_name: 'Production Supervisor', role: 'prod_supervisor', is_active: true },
    },
    tech_assignments: {
      findFirst: async () => null,
      findUnique: async ({ where }) => assignment?.id === where.id ? assignment : null,
      create: async ({ data }) => {
        assignment = { id: 9001, assigned_at: new Date(), ...data };
        return assignment;
      },
    },
    tech_audit_log: {
      create: async ({ data }) => { audits.push(data); return data; },
    },
  };
  prisma.$transaction = async callback => callback(prisma);
  return { prisma, fileHashes, audits, getAssignment: () => assignment };
}

test('supervisor upload → visual data → assignment → technician → replacement', async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dwes-cable-visual-flow-'));
  const priorUploadDir = process.env.UPLOAD_DIR;
  process.env.UPLOAD_DIR = tempDir;
  const frame = {
    id: FRAME,
    project_code: PROJECT,
    panel_name: '=H001',
    cables: [],
    uploaded_at: new Date(0).toISOString(),
    compare_status: 'none',
    original_filename: '',
    cable_count: 0,
    mapping: {},
    sheet_name: '',
  };
  MockStore.frames.push(frame);

  try {
    const harness = prismaHarness();
    const upload = new UploadService(harness.prisma, {});
    const tech = new TechService(harness.prisma);
    const originalBuffer = await workbook([
      row(1),
      row(2, { 'WIRE COLOR': 'BLUE', 'WIRE SIZE': '2.5 SQ.mm', 'CABLE LENGTH': '4 m' }),
    ], true);

    await upload.uploadMapped(PROJECT, originalBuffer, 'wiring-v1.xlsx', 'WIRING', mapping, 0, FRAME);
    assert.equal(frame.cables.length, 2, 'one parsed record per valid Excel row');
    assert.deepEqual(frame.cables.map(cable => cable.sno), [1, 2], 'Excel row order is preserved');
    assert.deepEqual(frame.cables.map(cable => cable.excel_row), [3, 4], 'source Excel row numbers are preserved');
    assert.ok(frame.cables.every(cable => cable.record_id && cable.excel_row), 'records carry stable source identities');
    assert.equal(new Set(frame.cables.map(cable => cable.record_id)).size, 2, 'no duplicate cable identities');
    assert.deepEqual(
      Object.fromEntries(['source_device', 'source_terminal', 'dest_device', 'dest_terminal', 'color', 'size', 'length', 'sign', 'ferrule', 'ref']
        .map(key => [key, frame.cables[0][key]])),
      {
        source_device: 'SRC-1', source_terminal: 'X1', dest_device: 'DST-1', dest_terminal: 'Y1',
        color: 'GREY', size: '1.5 SQ.mm', length: '3m', sign: '+VE', ferrule: 'F-001', ref: 'REF-1',
      },
      'all cable visual/detail fields come from the parsed row',
    );

    const originalIds = frame.cables.map(cable => cable.record_id);
    const originalHash = crypto.createHash('sha256').update(originalBuffer).digest('hex');
    const duplicate = await upload.checkHash(originalHash, 'wiring-v1.xlsx', 'wiring_schedule', PROJECT);
    assert.equal(duplicate.duplicate, true, 'existing duplicate protection still detects the uploaded file');

    const assigned = await tech.assignFrame({
      project_code: PROJECT,
      frame_id: FRAME,
      technician_id: TECH_ID,
      assigned_by_id: SUPERVISOR_ID,
    });
    const technicianV1 = await tech.myAssignmentDetail(assigned.assignment.id, TECH_ID);
    assert.deepEqual(technicianV1.frame.cables.map(cable => cable.record_id), originalIds, 'technician receives the same records');
    assert.deepEqual(
      technicianV1.frame.excel_headers,
      Object.values(mapping),
      'technician receives the exact original Excel labels, not merged descriptive labels',
    );
    assert.equal(technicianV1.frame.cables[0]._raw['S.NO'], '1');
    assert.equal(technicianV1.frame.cables[0]._raw['SOURCE DEVICE'], 'SRC-1');
    assert.equal(technicianV1.frame.cables[1]._raw['DEST TERMINAL'], 'Y2');
    assert.deepEqual(technicianV1.frame.cables.map(cable => cable.color), ['GREY', 'BLUE']);
    assert.equal(harness.audits.some(entry => entry.action === 'assigned'), true, 'assignment audit remains recorded');

    const replacementBuffer = await workbook([
      row(1, {
        'SOURCE DEVICE': 'SRC-1-CORRECTED',
        'DEST TERMINAL': 'Y1-CORRECTED',
        'WIRE COLOR': 'GREEN/YELLOW',
        'WIRE SIZE': '2.5 SQ.mm',
        'CABLE LENGTH': '6 m',
      }),
      row(2, { 'WIRE COLOR': 'RED', 'WIRE SIZE': '4 SQ.mm', 'CABLE LENGTH': '7.5 m' }),
    ], true);
    await upload.uploadMapped(PROJECT, replacementBuffer, 'wiring-v2.xlsx', 'WIRING', mapping, 0, FRAME);

    const technicianV2 = await tech.myAssignmentDetail(assigned.assignment.id, TECH_ID);
    assert.equal(technicianV2.frame.cables.length, 2, 'replacement updates rather than duplicates records');
    assert.deepEqual(technicianV2.frame.cables.map(cable => cable.record_id), originalIds, 'visual remains linked to its original wiring record');
    assert.deepEqual(
      technicianV2.frame.cables.map(cable => [cable.color, cable.size, cable.length]),
      [['GREEN/YELLOW', '2.5 SQ.mm', '6m'], ['RED', '4 SQ.mm', '7.5m']],
      'technician receives the latest replacement visual values in Excel order',
    );
    assert.equal(technicianV2.frame.cables[0].source_device, 'SRC-1-CORRECTED');
    assert.equal(technicianV2.frame.cables[0].dest_terminal, 'Y1-CORRECTED');
    assert.equal(harness.getAssignment().cables_total, 2, 'assignment relationship and cable count are preserved');
    assert.equal(harness.fileHashes.length, 2, 'audit hashes retain both distinct schedule revisions');
  } finally {
    MockStore.frames = MockStore.frames.filter(item => item !== frame);
    if (priorUploadDir === undefined) delete process.env.UPLOAD_DIR;
    else process.env.UPLOAD_DIR = priorUploadDir;
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});
