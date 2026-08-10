import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { isOperationalTwin3dReady } from '../src/utils/operationalTwinReadiness.ts';
import type { Ot3dPayload } from '../src/types/ot3d.ts';

function mappedDevice(): Ot3dPayload['devices'][number] {
  return {
    id: 1,
    stableItemId: 'dev-1',
    tag: 'QB1',
    description: null,
    type: 'breaker',
    face: 'internal',
    xMm: 100,
    yMm: 200,
    widthMm: 40,
    heightMm: 60,
    depthMm: 10,
    mappingRevision: 'A',
    terminals: [{ id: 1, terminalRef: 'QB1:1', xMm: 110, yMm: 210, zMm: 5 }],
  };
}

function basePayload(overrides: Partial<Ot3dPayload> = {}): Ot3dPayload {
  return {
    projectCode: 'P1',
    frameId: 'F1',
    sceneScale: 0.001,
    panelMm: { height: 2000, width: 800, depth: 600 },
    gaAssetSetId: 'ga-1',
    gaRevision: 1,
    mappingRevision: 'A',
    scheduleRevision: '1',
    releaseStatus: 'released',
    faces: [{
      faceId: 'face-1',
      face: 'front',
      imagePath: '/uploads/front.png',
      imageWidth: 1000,
      imageHeight: 2000,
      viewport: { width: 1, height: 1 },
    }],
    devices: [mappedDevice()],
    activeWire: null,
    wires: [],
    executionBySno: {},
    legacy: false,
    ...overrides,
  };
}

describe('isOperationalTwin3dReady', () => {
  it('returns true for released GA with faces and mapped terminals', () => {
    assert.equal(isOperationalTwin3dReady(basePayload()), true);
  });

  it('returns false for legacy payloads without GA asset set', () => {
    assert.equal(isOperationalTwin3dReady(basePayload({ legacy: true, gaAssetSetId: null })), false);
  });

  it('returns false when GA faces are missing', () => {
    assert.equal(isOperationalTwin3dReady(basePayload({ faces: [] })), false);
  });

  it('returns false when release status is not released', () => {
    assert.equal(isOperationalTwin3dReady(basePayload({ releaseStatus: 'draft' })), false);
  });

  it('returns false when device/terminal mapping is missing', () => {
    assert.equal(isOperationalTwin3dReady(basePayload({ devices: [] })), false);
    assert.equal(isOperationalTwin3dReady(basePayload({
      devices: [{ ...mappedDevice(), terminals: [] }],
    })), false);
  });
});
