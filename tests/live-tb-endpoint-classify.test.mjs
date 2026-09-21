/**
 * LIVE TB endpoint classification — DEVICE vs TB_GROUP (mirrors wiring-utils).
 */
import test from 'node:test';
import assert from 'node:assert/strict';

const PHYSICAL_TB_NO_DIGIT = new Set(['XTJ', 'XSH']);

function isPhysicalTbHeader(value) {
  const n = String(value ?? '').trim().replace(/\s+/g, '').toUpperCase();
  if (!n || n.length < 2) return false;
  if (PHYSICAL_TB_NO_DIGIT.has(n)) return true;
  return /^X[A-Z0-9-]*\d[A-Z0-9-]*$/.test(n);
}

function formatTerminalReference(terminal) {
  const t = String(terminal ?? '').trim();
  if (!t) return '';
  return t.replace(/:/g, ' / ');
}

function classifyLiveTbEndpoint(header, terminal) {
  const h = String(header ?? '').trim();
  const t = String(terminal ?? '').trim();
  const termRef = formatTerminalReference(t) || t;

  if (h && isPhysicalTbHeader(h)) {
    return {
      endpointType: 'TB_GROUP',
      equipmentTag: null,
      tbHeader: h,
      terminalReference: termRef,
      physicalLookupKey: h,
      from: 'header',
    };
  }

  if (h) {
    return {
      endpointType: t ? 'DEVICE_TERMINAL' : 'DEVICE',
      equipmentTag: h,
      tbHeader: null,
      terminalReference: termRef,
      physicalLookupKey: h,
      from: '',
    };
  }

  const embeddedTerm = t.match(/^(X[A-Z0-9][-A-Z0-9]*):(.+)$/i);
  if (embeddedTerm && isPhysicalTbHeader(embeddedTerm[1])) {
    const tb = embeddedTerm[1];
    const termOnly = embeddedTerm[2].trim();
    return {
      endpointType: 'TB_GROUP',
      equipmentTag: null,
      tbHeader: tb,
      terminalReference: formatTerminalReference(termOnly) || termOnly,
      physicalLookupKey: tb,
      from: 'embedded_terminal',
    };
  }

  return {
    endpointType: 'UNKNOWN',
    equipmentTag: null,
    tbHeader: null,
    terminalReference: termRef,
    physicalLookupKey: null,
    from: '',
  };
}

function resolvePhysicalTbEnd(header, terminal) {
  const c = classifyLiveTbEndpoint(header, terminal);
  if (c.endpointType === 'TB_GROUP' && c.tbHeader) {
    const h = String(header ?? '').trim();
    const t = String(terminal ?? '').trim();
    if (c.from === 'header' && isPhysicalTbHeader(h)) {
      return { tb: c.tbHeader, terminal: t, from: 'header' };
    }
    if (c.from === 'embedded_terminal') {
      const embeddedTerm = t.match(/^(X[A-Z0-9][-A-Z0-9]*):(.+)$/i);
      return {
        tb: c.tbHeader,
        terminal: embeddedTerm ? embeddedTerm[2].trim() : t,
        from: 'embedded_terminal',
      };
    }
    return { tb: c.tbHeader, terminal: t, from: c.from };
  }
  return { tb: '', terminal: '', from: '' };
}

test('A TB→TB both resolve by TB header', () => {
  const src = classifyLiveTbEndpoint('X9', '18');
  const dst = classifyLiveTbEndpoint('X5A-C', '15');
  assert.equal(src.endpointType, 'TB_GROUP');
  assert.equal(src.physicalLookupKey, 'X9');
  assert.equal(dst.endpointType, 'TB_GROUP');
  assert.equal(dst.physicalLookupKey, 'X5A-C');
});

test('B DEVICE→TB: Source 87STUB / X329:18 → device lookup, Dest X5A-C', () => {
  const src = classifyLiveTbEndpoint('87STUB', 'X329:18');
  const dst = classifyLiveTbEndpoint('X5A-C', '15');
  assert.equal(src.endpointType, 'DEVICE_TERMINAL');
  assert.equal(src.physicalLookupKey, '87STUB');
  assert.equal(src.tbHeader, null);
  assert.equal(resolvePhysicalTbEnd('87STUB', 'X329:18').tb, '');
  assert.equal(dst.endpointType, 'TB_GROUP');
  assert.equal(dst.physicalLookupKey, 'X5A-C');
});

test('C TB→DEVICE reverse works', () => {
  const src = classifyLiveTbEndpoint('X5A-C', '15');
  const dst = classifyLiveTbEndpoint('87STUB', 'X329:18');
  assert.equal(src.endpointType, 'TB_GROUP');
  assert.equal(dst.endpointType, 'DEVICE_TERMINAL');
  assert.equal(dst.physicalLookupKey, '87STUB');
});

test('D DEVICE→DEVICE both use exact equipment tags', () => {
  const src = classifyLiveTbEndpoint('74IO', '1(-)');
  const dst = classifyLiveTbEndpoint('K01', 'c');
  assert.equal(src.physicalLookupKey, '74IO');
  assert.equal(dst.physicalLookupKey, 'K01');
});

test('E partial: DEVICE source leaves dest TB match key intact', () => {
  const srcPhys = resolvePhysicalTbEnd('87STUB', 'X329:18');
  const dstPhys = resolvePhysicalTbEnd('X5A-C', '15');
  assert.equal(srcPhys.tb, '');
  assert.equal(dstPhys.tb, 'X5A-C');
  assert.equal(dstPhys.terminal, '15');
});

test('F same TB header X9/12 → X9/16 still one physical group key', () => {
  const src = classifyLiveTbEndpoint('X9', '12');
  const dst = classifyLiveTbEndpoint('X9', '16');
  assert.equal(src.physicalLookupKey, 'X9');
  assert.equal(dst.physicalLookupKey, 'X9');
});

test('empty header + embedded TERM still TB_GROUP', () => {
  const c = classifyLiveTbEndpoint('', 'X317:10');
  assert.equal(c.endpointType, 'TB_GROUP');
  assert.equal(c.physicalLookupKey, 'X317');
  assert.equal(resolvePhysicalTbEnd('', 'X317:10').terminal, '10');
});
