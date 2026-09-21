'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

/** Mirror of cli_analyse.is_legend_or_directory_context (keep in sync). */
function isLegendOrDirectoryContext(...textParts) {
  const blob = String(textParts.join(' ') || '')
    .toUpperCase()
    .replace(/\s+/g, '');
  if (!blob) return false;
  if (/(LEGEND:?REFDESCRIPTION|BILLOFMATERIALS|DEVICEREF|COMPONENTLIST|PARTSLIST)/.test(blob)) {
    return true;
  }
  if (/WEIDMULLERW(DU|TL)/.test(blob) && /TERMINALFOR/.test(blob)) return true;
  if (/AUXILIARYRELAY/.test(blob) && /FINDER\//.test(blob)) return true;
  return false;
}

describe('legend OCR must not become AUTO HIGH', () => {
  it('rejects KF87L legend/directory row', () => {
    const line = 'KF67,KF87L,KSD, AUXILIARY RELAY, 110V DC FINDER/ITALY 55.34';
    assert.equal(isLegendOrDirectoryContext(line), true);
  });

  it('rejects X10 Weidmuller legend terminal row', () => {
    const line = '* x10 TERMINAL FOR F67/67N CONTROL CIRCUIT WEIDMULLER WDU 6SL';
    assert.equal(isLegendOrDirectoryContext(line), true);
  });

  it('allows non-legend rear/internal label context', () => {
    assert.equal(isLegendOrDirectoryContext('LHS VIEW REAR VIEW RHS VIEW INTERNAL VIEW-1'), false);
  });
});
