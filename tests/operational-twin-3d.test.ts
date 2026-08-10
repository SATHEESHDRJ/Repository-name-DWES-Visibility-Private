import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  mmToWorld,
  doorHingePosition,
  doorRotationY,
  cameraFitPosition,
  SCENE_SCALE,
  DOOR_OPEN_ANGLE_RAD,
} from '../src/utils/operationalTwin3dCoords.ts';

import {
  deriveWireVisualState,
  passesLayerFilter,
  resolveCompletionState,
  buildWireStateMap,
  WIRE_STATE_COLORS,
} from '../src/utils/operationalTwin3dWireState.ts';

const P = { height: 600, width: 400, depth: 200 };

describe('operationalTwin3dCoords', () => {
  it('SCENE_SCALE is 0.001', () => { assert.equal(SCENE_SCALE, 0.001); });

  it('mmToWorld converts panel-local mm to Three.js world units', () => {
    const c = mmToWorld(200, 300, 100, P);
    assert.ok(Math.abs(c.x) < 0.001);
    assert.ok(Math.abs(c.y) < 0.001);
    assert.ok(Math.abs(c.z) < 0.001);
  });

  it('mmToWorld origin at panel centre', () => {
    const c = mmToWorld(P.width / 2, P.height / 2, P.depth / 2, P);
    assert.ok(Math.abs(c.x) < 0.0001);
    assert.ok(Math.abs(c.y) < 0.0001);
    assert.ok(Math.abs(c.z) < 0.0001);
  });

  it('doorHingePosition at left edge front face', () => {
    const h = doorHingePosition(P);
    assert.ok(h[0] < 0);
  });

  it('doorRotationY is 0 when closed', () => {
    assert.equal(doorRotationY(false), 0);
  });

  it('doorRotationY equals -DOOR_OPEN_ANGLE_RAD when open', () => {
    assert.equal(doorRotationY(true), -DOOR_OPEN_ANGLE_RAD);
  });

  it('cameraFitPosition returns positive Z', () => {
    const pos = cameraFitPosition(P);
    assert.ok(pos[2] > 0);
  });
});

describe('operationalTwin3dWireState', () => {
  it('pending: no status', () => { assert.equal(deriveWireVisualState(undefined), 'pending'); });

  it('pending: src and dst both false', () => {
    assert.equal(deriveWireVisualState({ src: false, dst: false, issue: false } as any), 'pending');
  });

  it('in_progress: src only', () => {
    assert.equal(deriveWireVisualState({ src: true, dst: false, issue: false } as any), 'in_progress');
  });

  it('in_progress: dst only', () => {
    assert.equal(deriveWireVisualState({ src: false, dst: true, issue: false } as any), 'in_progress');
  });

  it('completed: both src and dst', () => {
    assert.equal(deriveWireVisualState({ src: true, dst: true, issue: false } as any), 'completed');
  });

  it('issue overrides completed', () => {
    assert.equal(deriveWireVisualState({ src: true, dst: true, issue: true } as any), 'issue');
  });

  it('issue on partial also returns issue', () => {
    assert.equal(deriveWireVisualState({ src: true, dst: false, issue: true } as any), 'issue');
  });

  it('passesLayerFilter all passes everything', () => {
    assert.equal(passesLayerFilter('1', 'pending', undefined, 'all'), true);
    assert.equal(passesLayerFilter('1', 'completed', undefined, 'all'), true);
  });

  it('passesLayerFilter completed filter', () => {
    assert.equal(passesLayerFilter('1', 'completed', undefined, 'completed'), true);
    assert.equal(passesLayerFilter('1', 'pending', undefined, 'completed'), false);
  });

  it('passesLayerFilter pending filter', () => {
    assert.equal(passesLayerFilter('1', 'pending', undefined, 'pending'), true);
    assert.equal(passesLayerFilter('1', 'completed', undefined, 'pending'), false);
  });

  it('passesLayerFilter issues filter', () => {
    assert.equal(passesLayerFilter('1', 'issue', undefined, 'issues'), true);
    assert.equal(passesLayerFilter('1', 'completed', undefined, 'issues'), false);
  });

  it('passesLayerFilter my_wires: matches current user technicianId', () => {
    assert.equal(passesLayerFilter('1', 'completed', { technicianId: 7 } as any, 'my_wires', 7), true);
    assert.equal(passesLayerFilter('1', 'completed', { technicianId: 7 } as any, 'my_wires', 8), false);
    assert.equal(passesLayerFilter('1', 'pending', { technicianId: 7 } as any, 'my_wires', 7), false);
  });

  it('passesLayerFilter my_wires: without technicianId shows non-pending on assignment', () => {
    assert.equal(passesLayerFilter('1', 'completed', undefined, 'my_wires', 7), true);
    assert.equal(passesLayerFilter('1', 'pending', undefined, 'my_wires', 7), false);
  });

  it('resolveCompletionState no status returns hidden pending', () => {
    const r = resolveCompletionState(undefined);
    assert.equal(r.show, false);
    assert.equal(r.state, 'pending');
    assert.equal(r.rework, false);
  });

  it('resolveCompletionState completed returns show=true rework=false', () => {
    const r = resolveCompletionState({ src: true, dst: true, issue: false } as any);
    assert.equal(r.show, true);
    assert.equal(r.rework, false);
  });

  it('resolveCompletionState rework returns show=true rework=true', () => {
    const r = resolveCompletionState({ src: true, dst: true, issue: true } as any);
    assert.equal(r.show, true);
    assert.equal(r.rework, true);
  });

  it('resolveCompletionState pending returns show=false', () => {
    const r = resolveCompletionState({ src: false, dst: false, issue: false } as any);
    assert.equal(r.show, false);
  });

  it('buildWireStateMap maps all cables', () => {
    const cables = [{ sno: '1' }, { sno: '2' }, { sno: '3' }];
    const statusMap = {
      '1': { src: true, dst: true, issue: false } as any,
      '2': { src: true, dst: false, issue: false } as any,
    };
    const map = buildWireStateMap(cables, statusMap);
    assert.equal(map.get('1'), 'completed');
    assert.equal(map.get('2'), 'in_progress');
    assert.equal(map.get('3'), 'pending');
  });

  it('WIRE_STATE_COLORS are defined for all states', () => {
    const states = ['pending', 'in_progress', 'completed', 'issue'] as const;
    states.forEach(s => assert.ok(WIRE_STATE_COLORS[s].startsWith('#')));
  });
});
