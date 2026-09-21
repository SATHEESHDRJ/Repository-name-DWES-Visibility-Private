'use strict';
// backend/test/flat3d-conversion.test.cjs
// Unit tests for the Flat 3D conversion pipeline.
// These tests operate on the compiled dist/ output.
// Run: cd backend && node --test test/flat3d-conversion.test.cjs
// (requires `npm run build` first to populate dist/)

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');

// ── Stage constants (sourced from types file via compiled dist) ─────────────

const EXPECTED_STAGES = [
  'INGEST', 'DWG_TO_DXF', 'DXF_PARSE', 'GEOMETRY_NORMALIZATION',
  'SEMANTIC_EXTRACTION', 'SCHEDULE_MATCHING', 'FLAT_3D_GENERATION',
  'GLB_EXPORT', 'GLB_VALIDATION', 'BROWSER_VERIFICATION',
  'READY_FOR_REVIEW', 'FAILED',
];

const DIST_TYPES = path.join(__dirname, '..', 'dist', 'flat3d-conversion', 'flat3d-conversion.types.js');
const DIST_SERVICE = path.join(__dirname, '..', 'dist', 'flat3d-conversion', 'flat3d-conversion.service.js');

const distBuilt = fs.existsSync(DIST_TYPES);

describe('flat3d-conversion types', () => {
  test('FLAT3D_STAGES contains all 12 expected stage identifiers', () => {
    if (!distBuilt) {
      console.log('SKIP: dist/ not built. Run `npm run build` first.');
      return;
    }
    const { FLAT3D_STAGES } = require(DIST_TYPES);
    assert.equal(FLAT3D_STAGES.length, 12, 'Expected 12 stages');
    for (const s of EXPECTED_STAGES) {
      assert.ok(FLAT3D_STAGES.includes(s), `Missing stage: ${s}`);
    }
  });

  test('stage list is ordered correctly (INGEST first, FAILED last)', () => {
    if (!distBuilt) { console.log('SKIP: dist/ not built.'); return; }
    const { FLAT3D_STAGES } = require(DIST_TYPES);
    assert.equal(FLAT3D_STAGES[0], 'INGEST');
    assert.equal(FLAT3D_STAGES[FLAT3D_STAGES.length - 1], 'FAILED');
  });
});

describe('Flat3dConversionService.runConversion', () => {
  test('rejects PDF input immediately with APPROVED_2D_ONLY fallback', async () => {
    if (!fs.existsSync(DIST_SERVICE)) {
      console.log('SKIP: dist/flat3d-conversion/flat3d-conversion.service.js not found. Run `npm run build`.');
      return;
    }

    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dwes-flat3d-'));
    const fakePdf = path.join(tmp, 'drawing.pdf');
    fs.writeFileSync(fakePdf, '%PDF-1.4 fake');

    // The service is a NestJS Injectable — import the compiled module and
    // instantiate without the DI container (jobsService = null).
    const { Flat3dConversionService } = require(DIST_SERVICE);
    const svc = new Flat3dConversionService(null);

    const result = await svc.runConversion({
      projectCode: 'TEST_PROJECT',
      frameId: 'frame-001',
      sourceFilePath: fakePdf,
      originalName: 'drawing.pdf',
    });

    assert.equal(result.status, 'FAILED', 'PDF must return FAILED');
    assert.equal(result.fallback, 'APPROVED_2D_ONLY', 'PDF must set APPROVED_2D_ONLY fallback');
    assert.ok(result.failureReason, 'Must have a failure reason');

    fs.rmSync(tmp, { recursive: true, force: true });
  });

  test('rejects missing source file with FAILED status', async () => {
    if (!fs.existsSync(DIST_SERVICE)) {
      console.log('SKIP: dist not built.');
      return;
    }

    const { Flat3dConversionService } = require(DIST_SERVICE);
    const svc = new Flat3dConversionService(null);

    const result = await svc.runConversion({
      projectCode: 'TEST_PROJECT',
      frameId: 'frame-001',
      sourceFilePath: '/does/not/exist.dwg',
      originalName: 'missing.dwg',
    });

    assert.equal(result.status, 'FAILED');
    assert.ok(result.failureReason?.includes('not found'));
  });

  test('rejects unsupported file format', async () => {
    if (!fs.existsSync(DIST_SERVICE)) {
      console.log('SKIP: dist not built.');
      return;
    }

    const { Flat3dConversionService } = require(DIST_SERVICE);
    const svc = new Flat3dConversionService(null);

    const result = await svc.runConversion({
      projectCode: 'TEST_PROJECT',
      frameId: 'frame-001',
      sourceFilePath: '/tmp/drawing.ifc',
      originalName: 'drawing.ifc',
    });

    assert.equal(result.status, 'FAILED');
    assert.ok(!result.fallback, 'IFC should not set APPROVED_2D_ONLY');
  });

  test('buildScheduleJson preserves special chars in device names', () => {
    if (!fs.existsSync(DIST_SERVICE)) {
      console.log('SKIP: dist not built.');
      return;
    }

    const { Flat3dConversionService } = require(DIST_SERVICE);
    const svc = new Flat3dConversionService(null);

    const cables = [
      { source_device: '=A+B-C/01.X', dest_device: '=D+E:F', ferrule: '001' },
    ];
    const entries = svc.buildScheduleJson(cables);
    assert.equal(entries.length, 1);
    assert.equal(entries[0].source_device, '=A+B-C/01.X', 'Must preserve engineering special chars');
    assert.equal(entries[0].dest_device, '=D+E:F');
  });

  test('DWG input fails gracefully when Python is not installed (no CLI)', async () => {
    if (!fs.existsSync(DIST_SERVICE)) {
      console.log('SKIP: dist not built.');
      return;
    }

    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dwes-flat3d-dwg-'));
    const fakeDwg = path.join(tmp, 'panel.dwg');
    fs.writeFileSync(fakeDwg, Buffer.from([0x41, 0x43, 0x31, 0x30, 0x31, 0x35])); // AC1015 header

    // Override DWES_PYTHON to a known-nonexistent binary.
    const orig = process.env.DWES_PYTHON;
    process.env.DWES_PYTHON = '__dwes_nonexistent_python__';

    const { Flat3dConversionService } = require(DIST_SERVICE);
    const svc = new Flat3dConversionService(null);

    const result = await svc.runConversion({
      projectCode: 'TEST_PROJECT',
      frameId: 'frame-001',
      sourceFilePath: fakeDwg,
      originalName: 'panel.dwg',
    });

    if (orig !== undefined) process.env.DWES_PYTHON = orig;
    else delete process.env.DWES_PYTHON;

    assert.equal(result.status, 'FAILED', 'DWG with missing Python should FAIL');
    assert.ok(result.failureReason, 'Should have a failure reason');

    fs.rmSync(tmp, { recursive: true, force: true });
  });
});
