import test from 'node:test';
import assert from 'node:assert/strict';
import {
  classifyCableTwin,
  missingTwinRequirements,
  CABLE_TWIN_CLASS_META,
  type CableTwinEvidence,
} from '../src/utils/cableTwinClassification.ts';

const base: CableTwinEvidence = {
  hasApprovedDrawing: false,
  hasStructuredModel: false,
  hasTerminalMap: false,
  hasDuctGraph: false,
  hasApprovedRoute: false,
};

test('E — nothing approved exists → unavailable', () => {
  assert.equal(classifyCableTwin(base), 'unavailable');
});

test('D — approved drawing without terminal mapping → drawing-reference only', () => {
  assert.equal(classifyCableTwin({ ...base, hasApprovedDrawing: true }), 'drawing-reference');
  // A structured model without terminal mapping is still only a reference document.
  assert.equal(classifyCableTwin({ ...base, hasStructuredModel: true }), 'drawing-reference');
});

test('C — mapped endpoints without a duct graph → endpoint guidance', () => {
  assert.equal(
    classifyCableTwin({ ...base, hasApprovedDrawing: true, hasTerminalMap: true }),
    'endpoint-guidance',
  );
});

test('B — mapped endpoints + duct graph → calculated guidance (never presented as exact)', () => {
  const cls = classifyCableTwin({
    ...base, hasApprovedDrawing: true, hasTerminalMap: true, hasDuctGraph: true,
  });
  assert.equal(cls, 'calculated-guidance');
  assert.notEqual(CABLE_TWIN_CLASS_META[cls].label, CABLE_TWIN_CLASS_META['approved-exact'].label);
});

test('A — approved route requires terminal map AND structured model AND approval', () => {
  assert.equal(
    classifyCableTwin({
      hasApprovedDrawing: true, hasStructuredModel: true,
      hasTerminalMap: true, hasDuctGraph: true, hasApprovedRoute: true,
    }),
    'approved-exact',
  );
  // Approval flag alone can never produce an exact route without the geometry.
  assert.equal(
    classifyCableTwin({ ...base, hasApprovedRoute: true }),
    'unavailable',
  );
  assert.equal(
    classifyCableTwin({ ...base, hasApprovedRoute: true, hasTerminalMap: true, hasStructuredModel: true }),
    'approved-exact',
  );
});

test('missing-requirements list explains exactly what is absent', () => {
  // Nothing exists → all five engineering inputs are reported missing.
  assert.equal(missingTwinRequirements(base).length, 5);
  // Drawing-reference panel (like =H001): drawing exists, everything else missing.
  const drawingOnly = missingTwinRequirements({ ...base, hasApprovedDrawing: true });
  assert.equal(drawingOnly.length, 4);
  assert.ok(!drawingOnly.some(item => item.includes('Approved 2D drawing')));
  assert.ok(drawingOnly.some(item => item.includes('terminal coordinate')));
  assert.ok(drawingOnly.some(item => item.includes('duct nodes')));
  // Fully approved exact twin → nothing missing.
  assert.deepEqual(missingTwinRequirements({
    hasApprovedDrawing: true, hasStructuredModel: true,
    hasTerminalMap: true, hasDuctGraph: true, hasApprovedRoute: true,
  }), []);
});

test('every classification has display metadata', () => {
  for (const cls of ['approved-exact', 'calculated-guidance', 'endpoint-guidance', 'drawing-reference', 'unavailable'] as const) {
    assert.ok(CABLE_TWIN_CLASS_META[cls].label.length > 0);
    assert.ok(CABLE_TWIN_CLASS_META[cls].description.length > 0);
  }
});
