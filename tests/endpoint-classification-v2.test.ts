/**
 * V2 Tranche 2: Typed endpoint classification tests.
 *
 * Fixture rules (tests only hard-code these):
 *   - DEV_TBLK=X87BZ2, TERM=2   → TB_TERMINAL
 *   - DEV_TBLK=87STUB, TERM=X420/2 or X420:2 → EQUIPMENT_CONNECTOR
 *     (parent 87STUB, connector X420, pin 2) — NEVER standalone TB
 *   - DEV_TBLK=QDC1,   TERM=4   → EQUIPMENT_TERMINAL
 *   - DEV_TBLK=BCPU1,  TERM=X51:2 → EQUIPMENT_CONNECTOR
 *
 * 2C Fixture: Wire 021/D1 — Panel =E01_R1/001
 *   Source 87STUB/X420:2, Destination QDC1/4
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  classifyEndpointV2,
  classifyLiveTbEndpoint,
  parseConnectorTerminal,
  isPhysicalTbHeader,
  resolveLiveTbWireEnds,
  endpointKindBadgeLabel,
  type EndpointClassificationV2,
} from '../src/components/technician/wiring/wiring-utils.ts';
import type { Cable } from '../src/types/index.ts';

/* ── parseConnectorTerminal ── */

describe('parseConnectorTerminal', () => {
  it('parses X420:2', () => {
    const r = parseConnectorTerminal('X420:2');
    assert.deepStrictEqual(r, { connector: 'X420', pin: '2' });
  });

  it('parses X420/2', () => {
    const r = parseConnectorTerminal('X420/2');
    assert.deepStrictEqual(r, { connector: 'X420', pin: '2' });
  });

  it('parses X51:2', () => {
    const r = parseConnectorTerminal('X51:2');
    assert.deepStrictEqual(r, { connector: 'X51', pin: '2' });
  });

  it('returns null for plain pin number', () => {
    assert.strictEqual(parseConnectorTerminal('4'), null);
    assert.strictEqual(parseConnectorTerminal('15'), null);
    assert.strictEqual(parseConnectorTerminal(''), null);
    assert.strictEqual(parseConnectorTerminal(null), null);
  });

  it('returns null for non-X-series prefix', () => {
    assert.strictEqual(parseConnectorTerminal('K01:3'), null);
  });
});

/* ── classifyEndpointV2 fixtures ── */

describe('classifyEndpointV2 — fixture rules', () => {
  it('DEV_TBLK=X87BZ2, TERM=2 → TB_TERMINAL', () => {
    const r = classifyEndpointV2('X87BZ2', '2');
    assert.strictEqual(r.kind, 'TB_TERMINAL');
    assert.strictEqual(r.tbHeader, 'X87BZ2');
    assert.strictEqual(r.pin, '2');
    assert.strictEqual(r.parentEquipment, null);
    assert.strictEqual(r.connector, null);
    assert.strictEqual(r.legacyType, 'TB_GROUP');
  });

  it('DEV_TBLK=87STUB, TERM=X420:2 → EQUIPMENT_CONNECTOR (never standalone TB)', () => {
    const r = classifyEndpointV2('87STUB', 'X420:2');
    assert.strictEqual(r.kind, 'EQUIPMENT_CONNECTOR');
    assert.strictEqual(r.parentEquipment, '87STUB');
    assert.strictEqual(r.connector, 'X420');
    assert.strictEqual(r.pin, '2');
    assert.strictEqual(r.tbHeader, null, 'MUST NOT classify X420 as standalone TB');
    assert.strictEqual(r.legacyType, 'DEVICE_TERMINAL');
    assert.strictEqual(r.physicalLookupKey, '87STUB');
  });

  it('DEV_TBLK=87STUB, TERM=X420/2 → EQUIPMENT_CONNECTOR (slash variant)', () => {
    const r = classifyEndpointV2('87STUB', 'X420/2');
    assert.strictEqual(r.kind, 'EQUIPMENT_CONNECTOR');
    assert.strictEqual(r.parentEquipment, '87STUB');
    assert.strictEqual(r.connector, 'X420');
    assert.strictEqual(r.pin, '2');
  });

  it('DEV_TBLK=QDC1, TERM=4 → EQUIPMENT_TERMINAL', () => {
    const r = classifyEndpointV2('QDC1', '4');
    assert.strictEqual(r.kind, 'EQUIPMENT_TERMINAL');
    assert.strictEqual(r.parentEquipment, 'QDC1');
    assert.strictEqual(r.pin, '4');
    assert.strictEqual(r.connector, null);
    assert.strictEqual(r.tbHeader, null);
    assert.strictEqual(r.legacyType, 'DEVICE_TERMINAL');
  });

  it('DEV_TBLK=BCPU1, TERM=X51:2 → EQUIPMENT_CONNECTOR', () => {
    const r = classifyEndpointV2('BCPU1', 'X51:2');
    assert.strictEqual(r.kind, 'EQUIPMENT_CONNECTOR');
    assert.strictEqual(r.parentEquipment, 'BCPU1');
    assert.strictEqual(r.connector, 'X51');
    assert.strictEqual(r.pin, '2');
  });
});

/* ── classifyEndpointV2 provenance ── */

describe('classifyEndpointV2 — provenance', () => {
  it('TB_TERMINAL provenance has source=schedule_header', () => {
    const r = classifyEndpointV2('X87BZ2', '2');
    assert.strictEqual(r.provenance.source, 'schedule_header');
    assert.strictEqual(r.provenance.devTblk, 'X87BZ2');
    assert.strictEqual(r.provenance.term, '2');
  });

  it('EQUIPMENT_CONNECTOR provenance records connector and pin', () => {
    const r = classifyEndpointV2('87STUB', 'X420:2');
    assert.strictEqual(r.provenance.source, 'schedule_header');
    assert.strictEqual(r.provenance.connector, 'X420');
    assert.strictEqual(r.provenance.pin, '2');
    assert.strictEqual(r.provenance.devTblk, '87STUB');
    assert.strictEqual(r.provenance.term, 'X420:2');
  });

  it('embedded terminal provenance has source=embedded_terminal', () => {
    const r = classifyEndpointV2('', 'X5A:3');
    assert.strictEqual(r.kind, 'TB_TERMINAL');
    assert.strictEqual(r.provenance.source, 'embedded_terminal');
    assert.strictEqual(r.provenance.pin, '3');
  });
});

/* ── V1 backward-compat check ── */

describe('classifyLiveTbEndpoint (V1) backward-compat', () => {
  it('X87BZ2 remains TB_GROUP', () => {
    const r = classifyLiveTbEndpoint('X87BZ2', '2');
    assert.strictEqual(r.endpointType, 'TB_GROUP');
  });

  it('87STUB with X420:2 remains DEVICE_TERMINAL (not TB_GROUP)', () => {
    const r = classifyLiveTbEndpoint('87STUB', 'X420:2');
    assert.strictEqual(r.endpointType, 'DEVICE_TERMINAL');
    assert.strictEqual(r.tbHeader, null, 'V1 must NOT promote X420 to TB');
  });

  it('QDC1 remains DEVICE_TERMINAL', () => {
    const r = classifyLiveTbEndpoint('QDC1', '4');
    assert.strictEqual(r.endpointType, 'DEVICE_TERMINAL');
  });
});

/* ── endpointKindBadgeLabel ── */

describe('endpointKindBadgeLabel', () => {
  it('TB_TERMINAL → "TB TERMINAL"', () => {
    assert.strictEqual(endpointKindBadgeLabel('TB_TERMINAL'), 'TB TERMINAL');
  });
  it('EQUIPMENT_CONNECTOR → "EQUIPMENT CONNECTOR"', () => {
    assert.strictEqual(endpointKindBadgeLabel('EQUIPMENT_CONNECTOR'), 'EQUIPMENT CONNECTOR');
  });
  it('EQUIPMENT_TERMINAL → "EQUIPMENT"', () => {
    assert.strictEqual(endpointKindBadgeLabel('EQUIPMENT_TERMINAL'), 'EQUIPMENT');
  });
  it('UNKNOWN → "UNKNOWN"', () => {
    assert.strictEqual(endpointKindBadgeLabel('UNKNOWN'), 'UNKNOWN');
  });
});

/* ── 2C: Wire 021/D1 fixture — Source 87STUB/X420:2, Destination QDC1/4 ── */

function wire021d1Cable(): Cable & { _raw: Record<string, string> } {
  return {
    sno: 21,
    panel: '=E01_R1',
    ferrule: '',
    source_device: '87STUB',
    source_terminal: 'X420:2',
    source: '87STUB:X420:2',
    destination: 'QDC1:4',
    dest_device: 'QDC1',
    dest_terminal: '4',
    ref: '021/D1',
    color: '',
    size: '',
    length: '',
    sign: '',
    remarks: '',
    path: '87STUB:X420:2->QDC1:4',
    rack: '',
    _raw: {
      'DEV_TBLK_A': '87STUB',
      'TERM_A': 'X420:2',
      'DEV_TBLK_B': 'QDC1',
      'TERM_B': '4',
    },
  };
}

describe('2C: Wire 021/D1 fixture (=E01_R1/001)', () => {
  it('Source 87STUB/X420:2 is EQUIPMENT_CONNECTOR, not TB', () => {
    const r = classifyEndpointV2('87STUB', 'X420:2');
    assert.strictEqual(r.kind, 'EQUIPMENT_CONNECTOR');
    assert.strictEqual(r.tbHeader, null, 'X420 must NOT be classified as standalone TB');
    assert.strictEqual(r.parentEquipment, '87STUB');
    assert.strictEqual(r.connector, 'X420');
    assert.strictEqual(r.pin, '2');
  });

  it('Destination QDC1/4 is EQUIPMENT_TERMINAL', () => {
    const r = classifyEndpointV2('QDC1', '4');
    assert.strictEqual(r.kind, 'EQUIPMENT_TERMINAL');
    assert.strictEqual(r.parentEquipment, 'QDC1');
    assert.strictEqual(r.pin, '4');
  });

  it('resolveLiveTbWireEnds: Wire 021/D1 — neither end is physical TB', () => {
    const cable = wire021d1Cable();
    const ends = resolveLiveTbWireEnds(cable);
    assert.strictEqual(ends.source_is_physical_tb, false, 'Source 87STUB is equipment, not TB');
    assert.strictEqual(ends.dest_is_physical_tb, false, 'Dest QDC1 is equipment, not TB');
    assert.strictEqual(ends.tb_fields_present, false, 'No physical TB field present');
    assert.strictEqual(ends.source_endpoint_kind, 'EQUIPMENT_CONNECTOR');
    assert.strictEqual(ends.dest_endpoint_kind, 'EQUIPMENT_TERMINAL');
  });

  it('resolveLiveTbWireEnds: V2 provenance is populated', () => {
    const cable = wire021d1Cable();
    const ends = resolveLiveTbWireEnds(cable);
    assert.strictEqual(ends.source_provenance.connector, 'X420');
    assert.strictEqual(ends.source_provenance.pin, '2');
    assert.strictEqual(ends.dest_provenance.pin, '4');
  });
});

/* ── Edge cases ── */

describe('classifyEndpointV2 — edge cases', () => {
  it('empty header + empty terminal → UNKNOWN', () => {
    const r = classifyEndpointV2('', '');
    assert.strictEqual(r.kind, 'UNKNOWN');
  });

  it('equipment with no terminal → UNKNOWN', () => {
    const r = classifyEndpointV2('K01', '');
    assert.strictEqual(r.kind, 'UNKNOWN');
  });

  it('empty header + embedded X5A:3 → TB_TERMINAL (TB-only row)', () => {
    const r = classifyEndpointV2('', 'X5A:3');
    assert.strictEqual(r.kind, 'TB_TERMINAL');
    assert.strictEqual(r.tbHeader, 'X5A');
    assert.strictEqual(r.pin, '3');
  });

  it('isPhysicalTbHeader does not match non-X equipment tags', () => {
    assert.strictEqual(isPhysicalTbHeader('87STUB'), false);
    assert.strictEqual(isPhysicalTbHeader('QDC1'), false);
    assert.strictEqual(isPhysicalTbHeader('BCPU1'), false);
    assert.strictEqual(isPhysicalTbHeader('K01'), false);
  });

  it('isPhysicalTbHeader matches X-series TB headers', () => {
    assert.strictEqual(isPhysicalTbHeader('X87BZ2'), true);
    assert.strictEqual(isPhysicalTbHeader('X5A'), true);
    assert.strictEqual(isPhysicalTbHeader('X1A-CT'), true);
    assert.strictEqual(isPhysicalTbHeader('X420'), true);
  });
});
