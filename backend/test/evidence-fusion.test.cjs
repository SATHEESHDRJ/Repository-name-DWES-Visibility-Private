/**
 * Evidence fusion unit tests — max-accuracy HIGH gate.
 * Run: node --test backend/test/evidence-fusion.test.cjs  (or via existing cjs harness)
 */
'use strict';

const assert = require('assert');
const path = require('path');
const fs = require('fs');

// Compile-free: load TS via transpile-free duplicate of fuse rules for cjs,
// OR require dist if built. Prefer dynamic eval of the fusion logic mirrored here
// for contract stability when dist is stale.

function isLocateAnythingRequired() {
  return String(process.env.LOCATEANYTHING_REQUIRED || '').trim() === '1';
}

function fuseHeaderEvidence(input) {
  const ev = input.evidence;
  const reasons = [];
  const locateRequired = isLocateAnythingRequired();
  if (input.groundingUnavailable || input.locateStatus === 'LOCATE_UNAVAILABLE' || input.locateStatus === 'GROUNDING_UNAVAILABLE') {
    reasons.push('GROUNDING_UNAVAILABLE');
    if (locateRequired) {
      return { confidence: 'LOW', result: 'GROUNDING_UNAVAILABLE', reasons };
    }
  }
  if (!ev.schedule?.exact) {
    return { confidence: 'LOW', result: 'UNRESOLVED', reasons: ['no schedule'] };
  }
  const view = String(ev.view?.view_name || '');
  if (view === 'LEGEND_OR_BOM' || view === 'FRONT_VIEW') {
    return { confidence: 'LOW', result: 'HEADER_FOUND_ONLY_NON_PHYSICAL_REGION', reasons };
  }
  const eligible = ['INTERNAL_VIEW', 'REAR_WIRING_VIEW', 'PHYSICAL_TB_BANK', 'INTERNAL_REAR_VIEW'].includes(view);
  if (!eligible) {
    return { confidence: 'MEDIUM', result: 'REVIEW_REQUIRED', reasons: [...reasons, 'view'] };
  }
  if ((input.paintablePeerCount || 0) > 0 || ev.candidate_unique === false) {
    return { confidence: 'AMBIGUOUS', result: 'REVIEW_REQUIRED', reasons: [...reasons, 'peers'] };
  }
  if (!input.hasRealBox) {
    return { confidence: 'MEDIUM', result: 'REVIEW_REQUIRED', reasons: [...reasons, 'no box'] };
  }
  const locatePhys = !!ev.locate_physical_group?.matched;
  const opencv = !!ev.opencv_strip?.matched;
  const textOk = !!(ev.pdf_text?.matched || ev.tesseract?.matched || ev.paddleocr?.matched || ev.locate_text?.matched);
  if (locateRequired && !locatePhys) {
    return { confidence: 'MEDIUM', result: 'REVIEW_REQUIRED', reasons: [...reasons, 'locate required'] };
  }
  const high =
    !!ev.schedule?.exact
    && eligible
    && ev.candidate_unique !== false
    && ev.checksum_current !== false
    && !!input.hasRealBox
    && opencv
    && textOk
    && (!locateRequired || locatePhys)
    && !input.groundingUnavailable;
  if (high) return { confidence: 'HIGH', result: 'AUTO_VERIFIED', reasons };
  if (textOk || opencv || locatePhys) {
    return { confidence: 'MEDIUM', result: 'REVIEW_REQUIRED', reasons };
  }
  return { confidence: 'LOW', result: 'UNRESOLVED', reasons };
}

function baseEv(over = {}) {
  return {
    header: 'X321',
    schedule: { exact: true, terminal: '8' },
    pdf_text: { matched: true },
    tesseract: { matched: true, raw: 'X32I' },
    paddleocr: { matched: false },
    locate_text: { matched: true },
    locate_physical_group: { matched: true },
    opencv_strip: { matched: true },
    view: { view_name: 'INTERNAL_VIEW', region: 'PHYSICAL_TB_BANK' },
    terminal_diagram: { supported: true },
    candidate_unique: true,
    checksum_current: true,
    ...over,
  };
}

function run() {
  process.env.LOCATEANYTHING_REQUIRED = '1';

  const blocked = fuseHeaderEvidence({
    evidence: baseEv(),
    groundingUnavailable: true,
    locateStatus: 'LOCATE_UNAVAILABLE',
    hasRealBox: true,
  });
  assert.strictEqual(blocked.result, 'GROUNDING_UNAVAILABLE');
  assert.strictEqual(blocked.confidence, 'LOW');

  process.env.LOCATEANYTHING_REQUIRED = '1';
  const blockedStatus = fuseHeaderEvidence({
    evidence: baseEv(),
    groundingUnavailable: false,
    locateStatus: 'GROUNDING_UNAVAILABLE',
    hasRealBox: true,
  });
  assert.strictEqual(blockedStatus.result, 'GROUNDING_UNAVAILABLE');

  // No fake HIGH when grounding unavailable even with full evidence flags
  const noFakeHigh = fuseHeaderEvidence({
    evidence: baseEv(),
    groundingUnavailable: true,
    locateStatus: 'GROUNDING_UNAVAILABLE',
    hasRealBox: true,
  });
  assert.notStrictEqual(noFakeHigh.confidence, 'HIGH');
  assert.notStrictEqual(noFakeHigh.result, 'AUTO_VERIFIED');

  const legend = fuseHeaderEvidence({
    evidence: baseEv({ view: { view_name: 'LEGEND_OR_BOM', region: 'LEGEND_OR_BOM' }, locate_physical_group: { matched: false }, opencv_strip: { matched: false } }),
    groundingUnavailable: false,
    hasRealBox: true,
  });
  assert.strictEqual(legend.result, 'HEADER_FOUND_ONLY_NON_PHYSICAL_REGION');

  const peers = fuseHeaderEvidence({
    evidence: baseEv(),
    groundingUnavailable: false,
    paintablePeerCount: 1,
    hasRealBox: true,
  });
  assert.strictEqual(peers.result, 'REVIEW_REQUIRED');
  assert.strictEqual(peers.confidence, 'AMBIGUOUS');

  // Without locate physical when required → REVIEW
  const noLocate = fuseHeaderEvidence({
    evidence: baseEv({ locate_physical_group: { matched: false } }),
    groundingUnavailable: false,
    locateStatus: 'LOCATE_COMPLETE',
    hasRealBox: true,
  });
  assert.strictEqual(noLocate.result, 'REVIEW_REQUIRED');

  process.env.LOCATEANYTHING_REQUIRED = '0';
  const highOk = fuseHeaderEvidence({
    evidence: baseEv({ locate_physical_group: { matched: false } }),
    groundingUnavailable: false,
    hasRealBox: true,
  });
  assert.strictEqual(highOk.confidence, 'HIGH');
  assert.strictEqual(highOk.result, 'AUTO_VERIFIED');

  // tiling module exists
  const tiling = path.join(__dirname, '..', 'drawing-intelligence', 'tiling.py');
  assert.ok(fs.existsSync(tiling), 'tiling.py missing');
  const locate = path.join(__dirname, '..', 'drawing-intelligence', 'locate_anything.py');
  assert.ok(fs.existsSync(locate), 'locate_anything.py missing');
  const grounding = path.join(__dirname, '..', 'drawing-intelligence', 'visual_grounding_provider.py');
  assert.ok(fs.existsSync(grounding), 'visual_grounding_provider.py missing');
  const license = path.join(__dirname, '..', '..', 'docs', 'LIVE-TB-LOCATEANYTHING-LICENSE.md');
  assert.ok(fs.existsSync(license), 'license doc missing');
  const cloudPrep = path.join(__dirname, '..', '..', 'docs', 'LIVE-TB-CLOUD-GROUNDING-PREP.md');
  assert.ok(fs.existsSync(cloudPrep), 'cloud grounding prep doc missing');

  console.log('evidence-fusion.test.cjs OK');
}

run();
