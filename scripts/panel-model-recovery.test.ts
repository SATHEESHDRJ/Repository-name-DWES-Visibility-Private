import test from 'node:test';
import assert from 'node:assert/strict';
import {
  firstInvalidPanelDimension,
  validatePanelDimensions,
} from '../src/utils/panelModelRecovery.ts';

test('manual panel recovery requires all three verified dimensions', () => {
  const result = validatePanelDimensions({ width: '800', height: '', depth: '600' });
  assert.equal(result.errors.height, 'Height is required.');
  assert.equal(firstInvalidPanelDimension({ width: '800', height: '', depth: '600' }), 'height');
});

test('manual panel recovery rejects non-finite, zero, negative, and extreme dimensions', () => {
  assert.match(validatePanelDimensions({ width: 'not-a-number', height: '2000', depth: '600' }).errors.width ?? '', /valid number/);
  assert.match(validatePanelDimensions({ width: '0', height: '2000', depth: '600' }).errors.width ?? '', /between 100 and 6000/);
  assert.match(validatePanelDimensions({ width: '-5', height: '2000', depth: '600' }).errors.width ?? '', /between 100 and 6000/);
  assert.match(validatePanelDimensions({ width: '800', height: '6001', depth: '600' }).errors.height ?? '', /between 100 and 6000/);
});

test('manual panel recovery normalizes valid millimetre dimensions without defaults', () => {
  const result = validatePanelDimensions({ width: '800.5', height: '2200', depth: '600' });
  assert.deepEqual(result.errors, {});
  assert.deepEqual(result.normalized, { width: 800.5, height: 2200, depth: 600 });
});
