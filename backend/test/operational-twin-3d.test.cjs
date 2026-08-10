'use strict';
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

const {
  normalizedFaceToMm,
  SCENE_SCALE,
} = require('../dist/engineering/operational-twin-3d.service');

describe('normalizedFaceToMm', () => {
  const H = 600, W = 400, D = 200;

  test('front face: x=0,y=0 maps to left-top (mm top=height)', () => {
    const r = normalizedFaceToMm(0, 0, 'front', H, W, D);
    assert.equal(r.xMm, 0);
    assert.equal(r.yMm, H);
    assert.equal(r.zMm, 0);
  });

  test('front face: x=1,y=1 maps to right-bottom', () => {
    const r = normalizedFaceToMm(1, 1, 'front', H, W, D);
    assert.equal(r.xMm, W);
    assert.equal(r.yMm, 0);
    assert.equal(r.zMm, 0);
  });

  test('rear face: x is mirrored', () => {
    const rFront = normalizedFaceToMm(0.25, 0.5, 'front', H, W, D);
    const rRear  = normalizedFaceToMm(0.25, 0.5, 'rear',  H, W, D);
    assert.ok(rRear.xMm !== rFront.xMm, 'rear x should differ from front x');
    assert.equal(rRear.zMm, D);
  });

  test('internal face: z offset is non-zero', () => {
    const r = normalizedFaceToMm(0.5, 0.5, 'internal', H, W, D);
    assert.ok(r.zMm > 0);
    assert.ok(r.zMm < D);
  });

  test('custom face behaves like front', () => {
    const front  = normalizedFaceToMm(0.3, 0.4, 'front',  H, W, D);
    const custom = normalizedFaceToMm(0.3, 0.4, 'custom', H, W, D);
    assert.equal(custom.xMm, front.xMm);
    assert.equal(custom.yMm, front.yMm);
    assert.equal(custom.zMm, front.zMm);
  });

  test('SCENE_SCALE equals 0.001', () => {
    assert.equal(SCENE_SCALE, 0.001);
  });

  test('centre of front face is at half-width, half-height, z=0', () => {
    const r = normalizedFaceToMm(0.5, 0.5, 'front', H, W, D);
    assert.equal(r.xMm, W / 2);
    assert.equal(r.yMm, H / 2);
    assert.equal(r.zMm, 0);
  });

  test('rear x mirroring: normalizedX=0 maps to W, normalizedX=1 maps to 0', () => {
    const r0 = normalizedFaceToMm(0, 0.5, 'rear', H, W, D);
    const r1 = normalizedFaceToMm(1, 0.5, 'rear', H, W, D);
    assert.equal(r0.xMm, W);
    assert.equal(r1.xMm, 0);
  });
});

describe('payload shape validation', () => {
  test('normalizedFaceToMm output has xMm, yMm, zMm fields', () => {
    const r = normalizedFaceToMm(0.5, 0.5, 'front', 600, 400, 200);
    assert.ok('xMm' in r);
    assert.ok('yMm' in r);
    assert.ok('zMm' in r);
  });

  test('all mm values are finite numbers', () => {
    const r = normalizedFaceToMm(0.7, 0.3, 'internal', 600, 400, 200);
    assert.ok(Number.isFinite(r.xMm));
    assert.ok(Number.isFinite(r.yMm));
    assert.ok(Number.isFinite(r.zMm));
  });
});
