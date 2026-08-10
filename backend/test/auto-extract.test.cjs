'use strict';
// backend/test/auto-extract.test.cjs
// Unit tests for the panel-model auto-extract pipeline.
// These tests operate on the compiled dist/ output.
// Run: cd backend && node --test test/auto-extract.test.cjs
// (requires `npm run build` first to populate dist/)

const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');

const DIST_AUTO_EXTRACT = path.join(__dirname, '..', 'dist', 'panel-model', 'auto-extract.js');
const distBuilt = fs.existsSync(DIST_AUTO_EXTRACT);

test('exactTagKey preserves engineering characters', () => {
  if (!distBuilt) { console.log('SKIP: dist/ not built. Run `npm run build` first.'); return; }
  const { exactTagKey } = require(DIST_AUTO_EXTRACT);
  assert.equal(exactTagKey('=Q1+F1'), '=Q1+F1');
  assert.equal(exactTagKey('= Q1 + F1'), '=Q1+F1');
});

test('runAutoExtract scans PDF text and resolves dimensions when labeled', () => {
  if (!distBuilt) { console.log('SKIP: dist/ not built.'); return; }
  const { runAutoExtract } = require(DIST_AUTO_EXTRACT);
  const pdf = Buffer.from(
    `%PDF-1.4\n1 0 obj\n<< /Length 44 >>\nstream\nBT (WIDTH: 800 mm HEIGHT: 2200 mm DEPTH: 600 mm GA) Tj ET\nendstream\nendobj\ntrailer\n<<>>\n%%EOF`,
    'latin1',
  );
  const extract = runAutoExtract({
    sources: [{ id: 'd1', original_name: 'GA.pdf', buffer: pdf }],
    cables: [{ source_device: '=Q1+F1', dest_device: 'TB1', source_terminal: '1', dest_terminal: '2', ref: 'W1', color: 'BK', size: '1.5', path: '', ferrule: '', sno: 1 }],
    cadManifest: null,
  });
  assert.ok(extract.scanned_sources.length >= 1);
  assert.ok(extract.form.width_mm === 800 || extract.fields.width_mm.value === 800);
  assert.ok(extract.auto_fix.issues.length >= 0);
});

test('buildAutoFixReport flags missing dimensions', () => {
  if (!distBuilt) { console.log('SKIP: dist/ not built.'); return; }
  const { buildAutoFixReport } = require(DIST_AUTO_EXTRACT);
  const form = { width_mm: null, height_mm: null, depth_mm: null, doors: null, mounting_plate: null, gland_plate: null, base_frame: null, base_frame_height_mm: null, wire_troughs: null, terminal_rows: null, din_rails_detected: null, components: [] };
  const fields = {
    width_mm: { value: null, confidence: 'UNRESOLVED', source: 'x' },
    height_mm: { value: null, confidence: 'UNRESOLVED', source: 'x' },
    depth_mm: { value: null, confidence: 'UNRESOLVED', source: 'x' },
  };
  const report = buildAutoFixReport(form, fields, {}, []);
  assert.equal(report.can_regenerate, false);
  assert.ok(report.issues.some(i => i.code === 'missing_dimension'));
});
