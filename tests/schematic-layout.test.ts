/**
 * Mode B schematic layout — deterministic Excel twin (no CAD).
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  generateSchematicLayout,
  normalizeEngineeringTag,
  splitEndpoint,
} from '../backend/src/engineering/schematic-layout.ts';

describe('schematic-layout Mode B', () => {
  const cables = [
    {
      sno: 1,
      source_device: 'K2',
      source_terminal: 'A1',
      dest_device: '=H001+XB1',
      dest_terminal: '1',
      color: 'BK',
    },
    {
      sno: 2,
      source_device: 'K2',
      source_terminal: 'A2',
      dest_device: '=H001+XB1',
      dest_terminal: '2',
      color: 'RD',
    },
    {
      sno: 3,
      source: 'X1:L1',
      destination: 'X2:L2',
    },
  ];

  it('normalizes tags without stripping engineering symbols', () => {
    assert.equal(normalizeEngineeringTag('  =H001+XB1  '), '=H001+XB1');
    assert.equal(normalizeEngineeringTag('k2'), 'K2');
    const ep = splitEndpoint(undefined, undefined, 'K2:A1');
    assert.deepEqual(ep, { tag: 'K2', terminal: 'A1' });
  });

  it('generates a stable schematic across identical inputs', () => {
    const a = generateSchematicLayout('FRAME1', cables, { scheduleRevision: 'rev-a' });
    const b = generateSchematicLayout('FRAME1', cables, { scheduleRevision: 'rev-a' });
    assert.equal(a.drawingMode, 'SCHEMATIC');
    assert.equal(a.devices.length, b.devices.length);
    assert.deepEqual(
      a.devices.map(d => ({ tag: d.tag, x: d.x, y: d.y })),
      b.devices.map(d => ({ tag: d.tag, x: d.x, y: d.y })),
    );
    assert.deepEqual(
      a.wires.map(w => w.points),
      b.wires.map(w => w.points),
    );
  });

  it('places one device per normalized tag and routes active wires', () => {
    const layout = generateSchematicLayout('FRAME1', cables);
    const tags = layout.devices.map(d => d.normalizedTag).sort();
    assert.deepEqual(tags, ['=H001+XB1', 'K2', 'X1', 'X2'].sort());
    assert.ok(layout.devices.every(d => d.placed && d.matchMethod === 'schematic-auto'));
    const w1 = layout.wires.find(w => w.sno === '1');
    assert.ok(w1);
    assert.ok(w1!.points.length >= 2);
    assert.ok(
      w1!.classification === 'calculated-guidance' || w1!.classification === 'endpoint-guidance',
    );
    assert.match(layout.diagnostics.note, /not physical/i);
  });

  it('marks incomplete endpoints as route-not-mapped', () => {
    const layout = generateSchematicLayout('F', [
      { sno: 9, source_device: 'ONLYSRC', source_terminal: '1' },
    ]);
    const w = layout.wires[0];
    assert.equal(w.classification, 'route-not-mapped');
    assert.equal(w.points.length, 0);
  });

  it('keeps terminal ids unique when nested device tags share colon paths', () => {
    const layout = generateSchematicLayout('FRAME-NEST', [
      {
        sno: 1,
        source_device: '87BB',
        source_terminal: 'X102:2',
        dest_device: 'P1',
        dest_terminal: '1',
      },
      {
        sno: 2,
        source_device: '87BB:X102',
        source_terminal: '2',
        dest_device: 'P1',
        dest_terminal: '2',
      },
    ]);
    const ids = layout.terminals.map(t => t.id);
    assert.equal(ids.length, new Set(ids).size, `duplicate terminal ids: ${ids.join(', ')}`);
    assert.ok(ids.includes('term:87BB::X102:2'));
    assert.ok(ids.includes('term:87BB:X102::2'));
  });
});
