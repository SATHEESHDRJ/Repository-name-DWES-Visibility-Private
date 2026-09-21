/**
 * Drawing index eligibility — reject directory/BOM; allow physical DEVICE/TB.
 * Run: node --test backend/test/drawing-index.test.cjs
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');

const { DrawingIndexService } = require('../dist/drawing-tb-analysis/drawing-index.service');

test('eligibleForAutoPaint rejects legend/directory KF87L', () => {
  const svc = new DrawingIndexService();
  assert.equal(
    svc.eligibleForAutoPaint({
      element_type: 'DEVICE',
      normalized_reference: 'KF87L',
      page_number: 6,
      bbox: { x: 0.55, y: 0.35, width: 0.05, height: 0.01 },
      view_classification: 'LEGEND_OR_BOM',
      extraction_method: 'OCR',
      confidence: 'LOW',
      evidence: { region_kind: 'device_reference_table', rejected_reason: 'directory_or_legend_text' },
    }),
    false,
  );
});

test('eligibleForAutoPaint accepts INTERNAL H74 device body', () => {
  const svc = new DrawingIndexService();
  assert.equal(
    svc.eligibleForAutoPaint({
      element_type: 'DEVICE',
      normalized_reference: 'H74',
      page_number: 6,
      bbox: { x: 0.255, y: 0.118, width: 0.125, height: 0.06 },
      view_classification: 'INTERNAL_VIEW',
      extraction_method: 'OCR_AND_MANUAL_VERIFY',
      confidence: 'HIGH',
      evidence: { region_kind: 'physical_device_body' },
    }),
    true,
  );
});

test('seeded Solar Wadi index: H74 eligible, KF87L not', () => {
  const seed = path.join(
    __dirname,
    '..',
    '..',
    'uploads',
    'drawing-index',
    '003',
    'b52f477d15f9174840b053bb4658ba5c3c084f5d07e9d743299a1ae7e8940baa.json',
  );
  assert.ok(fs.existsSync(seed), 'seed index must exist');
  const doc = JSON.parse(fs.readFileSync(seed, 'utf8'));
  const svc = new DrawingIndexService();
  const h74 = doc.elements.filter(e => e.normalized_reference === 'H74' && svc.eligibleForAutoPaint(e));
  const kf = doc.elements.filter(e => e.normalized_reference === 'KF87L' && svc.eligibleForAutoPaint(e));
  assert.ok(h74.length >= 1);
  assert.equal(kf.length, 0);
});
