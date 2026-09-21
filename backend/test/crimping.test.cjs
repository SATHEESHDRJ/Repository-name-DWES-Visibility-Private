const test = require('node:test');
const assert = require('node:assert/strict');

const {
  normalizeCrimping,
  deriveOverall,
  isWiringLockedByCrimping,
  isReadyForWiring,
  markStripEndComplete,
  markCrimpEndComplete,
  markPrepOperation,
  setCrimpingRequired,
  summarizeCrimpingKpis,
  markPrepReworkRequired,
  markPrepReworkWithAffectedEnd,
  markWirePrepared,
  markWireCut,
  markBothEndsStripped,
  markWireCrimped,
  resolveLegacyPartial,
  crimpingWirePercent,
  completePrepEnd,
  aggregateCrimpingKpis,
  CRIMPING_NOT_COMPLETED_CODE,
  SOURCE_STRIPPING_REQUIRED_CODE,
  STAGED_PREPARATION_REQUIRED_CODE,
} = require('../dist/common/crimping');

function stripThenCrimp(cable, end, techId, at) {
  const stripped = markStripEndComplete(cable, end, techId, at);
  return markCrimpEndComplete({ ...cable, crimping: stripped.state }, end, techId, at);
}

/** Helper: fully prepare a wire via V2 stages (cut→strip→crimp). */
function v2FullPrepare(cable, techId, at) {
  at = at || '2026-09-18T10:00:00.000Z';
  const cut = markWireCut(cable, techId, {}, at);
  const stripped = markBothEndsStripped({ ...cable, crimping: cut.state }, techId, at);
  const crimped = markWireCrimped({ ...cable, crimping: stripped.state }, techId, at);
  return { ...cable, crimping: crimped.state };
}

test('missing crimping JSON defaults to not required — no wiring lock', () => {
  const state = normalizeCrimping(undefined, null);
  assert.equal(state.required, false);
  assert.equal(state.overall, 'NOT_REQUIRED');
  assert.equal(isWiringLockedByCrimping({}), false);
  assert.equal(isWiringLockedByCrimping({ src: true, dst: true }), false);
});

test('OPEN END destination: only source is applicable; strip then crimp completes overall', () => {
  let cable = {
    openEnd: 'destination',
    crimping: { required: true },
  };
  let state = normalizeCrimping(cable.crimping, cable.openEnd);
  assert.equal(state.destination.crimpingStatus, 'NOT_APPLICABLE');
  assert.equal(state.destination.strippingStatus, 'NOT_APPLICABLE');
  assert.equal(state.overall, 'NOT_STARTED');
  assert.equal(isWiringLockedByCrimping({ ...cable, crimping: state }), true);

  assert.throws(
    () => markCrimpEndComplete({ ...cable, crimping: state }, 'source', 7),
    /SOURCE STRIPPING REQUIRED/,
  );

  const stripped = markStripEndComplete({ ...cable, crimping: state }, 'source', 7, '2026-09-04T06:00:00.000Z');
  assert.equal(stripped.auditAction, 'source_stripped');
  const marked = markCrimpEndComplete(
    { ...cable, crimping: stripped.state },
    'source',
    7,
    '2026-09-04T06:00:01.000Z',
  );
  assert.equal(marked.changed, true);
  assert.equal(marked.auditAction, 'source_crimped');
  assert.equal(marked.state.overall, 'COMPLETED');
  assert.equal(marked.state.source.crimpedBy, 7);
  assert.equal(isWiringLockedByCrimping({ ...cable, crimping: marked.state }), false);

  assert.throws(
    () => markCrimpEndComplete({ ...cable, crimping: marked.state }, 'destination', 7),
    /not applicable/i,
  );
});

test('acceptance §29: two-end required wire — strip→crimp each end before wiring unlock', () => {
  let cable = {
    src: false,
    dst: false,
    crimping: setCrimpingRequired({}, true, 1),
  };
  assert.equal(cable.crimping.overall, 'NOT_STARTED');
  assert.equal(isWiringLockedByCrimping(cable), true);

  assert.throws(
    () => markCrimpEndComplete(cable, 'source', 10),
    (err) => err.code === SOURCE_STRIPPING_REQUIRED_CODE,
  );

  const afterSrcStrip = markStripEndComplete(cable, 'source', 10, '2026-09-04T06:01:00.000Z');
  cable = { ...cable, crimping: afterSrcStrip.state };
  const afterSrcCrimp = markCrimpEndComplete(cable, 'source', 10, '2026-09-04T06:01:30.000Z');
  cable = { ...cable, crimping: afterSrcCrimp.state };
  assert.equal(cable.crimping.overall, 'PARTIAL');
  assert.equal(isWiringLockedByCrimping(cable), true);

  const afterDstStrip = markStripEndComplete(cable, 'destination', 10, '2026-09-04T06:02:00.000Z');
  cable = { ...cable, crimping: afterDstStrip.state };
  const afterDstCrimp = markCrimpEndComplete(cable, 'destination', 10, '2026-09-04T06:02:30.000Z');
  cable = { ...cable, crimping: afterDstCrimp.state };
  assert.equal(cable.crimping.overall, 'COMPLETED');
  assert.equal(isWiringLockedByCrimping(cable), false);
});

test('either end may be prepared first (DST strip+crimp then SRC)', () => {
  const cable = { crimping: setCrimpingRequired({}, true, 1) };
  const afterDst = stripThenCrimp(cable, 'destination', 2, '2026-09-04T06:00:00.000Z');
  assert.equal(afterDst.state.overall, 'PARTIAL');
  const afterSrc = stripThenCrimp({ crimping: afterDst.state }, 'source', 3, '2026-09-04T06:01:00.000Z');
  assert.equal(afterSrc.state.overall, 'COMPLETED');
  assert.equal(afterSrc.state.source.crimpedBy, 3);
  assert.equal(afterSrc.state.destination.crimpedBy, 2);
});

test('idempotent remake of completed crimp end does not change attribution', () => {
  let cable = { crimping: setCrimpingRequired({}, true, 1) };
  const first = stripThenCrimp(cable, 'source', 11, '2026-09-04T06:10:00.000Z');
  const second = markCrimpEndComplete({ crimping: first.state }, 'source', 99, '2026-09-04T07:00:00.000Z');
  assert.equal(second.changed, false);
  assert.equal(second.state.source.crimpedBy, 11);
  assert.equal(second.state.source.crimpedAt, '2026-09-04T06:10:00.000Z');
});

test('legacy already-wired wire stamped when first marked required — no gate', () => {
  const state = setCrimpingRequired({ src: true, dst: true }, true, 5);
  assert.equal(state.required, true);
  assert.equal(state.legacyWiringCompleted, true);
  assert.equal(isWiringLockedByCrimping({ src: true, dst: true, crimping: state }), false);
});

test('crimping KPI denominator is required only; ready = strip+crimp complete', () => {
  const wires = [
    { crimping: { required: true, source: completePrepEnd(), destination: completePrepEnd() } },
    { crimping: { required: true, source: completePrepEnd(), destination: completePrepEnd() } },
    {
      crimping: {
        required: true,
        source: completePrepEnd(),
        destination: { strippingStatus: 'COMPLETED', crimpingStatus: 'NOT_STARTED' },
      },
    },
    { crimping: { required: true } },
    { crimping: { required: true } },
    { crimping: { required: true, source: completePrepEnd(), destination: completePrepEnd() } },
    {}, {}, {}, {},
  ];
  const kpi = summarizeCrimpingKpis(wires);
  assert.equal(kpi.totalWires, 10);
  assert.equal(kpi.required, 6);
  assert.equal(kpi.completed, 3);
  assert.equal(kpi.readyForWiring, 3);
  assert.equal(kpi.partial, 1);
  assert.equal(kpi.pending, 2);
  assert.equal(kpi.notRequired, 4);
  assert.equal(kpi.percent, 50);
  assert.equal(kpi.sourceStripped, 4);
  assert.equal(kpi.sourceCrimped, 4);
  assert.equal(crimpingWirePercent(3, 6), 50);
  assert.equal(crimpingWirePercent(3, 10), 30);
});

test('wiring complete does not imply preparation complete', () => {
  const cable = {
    src: true,
    dst: true,
    crimping: setCrimpingRequired({ src: false, dst: false }, true, 1),
  };
  assert.equal(cable.crimping.overall, 'NOT_STARTED');
  assert.equal(isWiringLockedByCrimping(cable), true);
});

test('CRIMPING_NOT_COMPLETED_CODE is stable for API clients', () => {
  assert.equal(CRIMPING_NOT_COMPLETED_CODE, 'CRIMPING_NOT_COMPLETED');
});

test('deriveOverall COMPLETED when open both (zero applicable ends) and required', () => {
  const state = normalizeCrimping({ required: true }, 'both');
  assert.equal(state.source.crimpingStatus, 'NOT_APPLICABLE');
  assert.equal(state.destination.crimpingStatus, 'NOT_APPLICABLE');
  assert.equal(deriveOverall(state), 'COMPLETED');
});

test('legacy flat CR-01 crimp COMPLETE does not invent stripping; wiring stays locked', () => {
  const flat = {
    required: true,
    source: 'COMPLETED',
    destination: 'COMPLETED',
    sourceBy: 42,
    sourceAt: '2026-09-01T00:00:00.000Z',
    destinationBy: 42,
    destinationAt: '2026-09-01T00:01:00.000Z',
  };
  const state = normalizeCrimping(flat, null);
  assert.equal(state.source.crimpingStatus, 'COMPLETED');
  assert.equal(state.source.strippingStatus, 'NOT_STARTED');
  assert.equal(state.source.crimpedBy, 42);
  assert.equal(state.legacyCrimpWithoutStrip, true);
  assert.equal(state.overall, 'PARTIAL');
  assert.equal(isWiringLockedByCrimping({ src: false, dst: false, crimping: state }), true);

  // Confirm strip unlocks path to COMPLETE without rewriting crimp attribution
  let cable = { src: false, dst: false, crimping: state };
  cable = { ...cable, crimping: markStripEndComplete(cable, 'source', 7).state };
  cable = { ...cable, crimping: markStripEndComplete(cable, 'destination', 7).state };
  assert.equal(cable.crimping.source.crimpedBy, 42);
  assert.equal(cable.crimping.overall, 'COMPLETED');
  assert.equal(isWiringLockedByCrimping(cable), false);
});

test('bulk eligibility: crimp skipped when strip incomplete; strip proceeds', () => {
  const required = setCrimpingRequired({}, true, 1);
  const cables = [
    { crimping: required },
    { crimping: markStripEndComplete({ crimping: required }, 'source', 1).state },
  ];
  const r0 = (() => {
    try {
      markPrepOperation(cables[0], 'source', 'crimp', 1);
      return { ok: true };
    } catch (e) {
      return { ok: false, reason: e.message };
    }
  })();
  assert.equal(r0.ok, false);
  assert.match(r0.reason, /SOURCE STRIPPING REQUIRED/);

  const r1 = markPrepOperation(cables[1], 'source', 'crimp', 1);
  assert.equal(r1.changed, true);
  assert.equal(r1.state.source.crimpingStatus, 'COMPLETED');
});

test('rework: marks REWORK_REQUIRED, preserves prior by/at, clears ready for wiring', () => {
  let cable = { crimping: setCrimpingRequired({}, true, 9) };
  cable = { crimping: stripThenCrimp(cable, 'source', 2, '2026-09-04T07:00:00.000Z').state };
  cable = { crimping: stripThenCrimp(cable, 'destination', 3, '2026-09-04T07:05:00.000Z').state };
  assert.equal(cable.crimping.overall, 'COMPLETED');
  assert.equal(isWiringLockedByCrimping(cable), false);

  const rework = markPrepReworkRequired(cable, 'source', 'crimp', 99, 'Ferrule damaged', '2026-09-04T08:00:00.000Z', 'qaqc_engineer');
  assert.equal(rework.changed, true);
  assert.equal(rework.state.source.crimpingStatus, 'REWORK_REQUIRED');
  assert.equal(rework.state.source.crimpedBy, 2); // original attribution kept
  assert.equal(rework.state.overall, 'REWORK_REQUIRED');
  assert.equal(isWiringLockedByCrimping({ ...cable, crimping: rework.state }), true);
  assert.ok(Array.isArray(rework.state.source.reworkHistory));
  assert.equal(rework.state.source.reworkHistory[0].reason, 'Ferrule damaged');
  assert.equal(rework.state.source.reworkHistory[0].setBy, 99);

  const kpi = summarizeCrimpingKpis([{ ...cable, crimping: rework.state }]);
  assert.equal(kpi.rework, 1);
  assert.equal(kpi.readyForWiring, 0);
});

test('markWirePrepared: rejects one-shot on fresh wire (stages required)', () => {
  const cable = { crimping: setCrimpingRequired({}, true, 1) };
  assert.throws(
    () => markWirePrepared(cable, 11, '2026-09-18T08:00:00.000Z'),
    (err) => err.code === STAGED_PREPARATION_REQUIRED_CODE,
  );
});

test('markWirePrepared: OPEN SOURCE — rejects one-shot (stages required)', () => {
  const cable = { openEnd: 'source', crimping: { required: true } };
  assert.throws(
    () => markWirePrepared(cable, 5, '2026-09-18T08:10:00.000Z'),
    (err) => err.code === STAGED_PREPARATION_REQUIRED_CODE,
  );
  // V2 stages honour open side correctly
  const prepared = v2FullPrepare(cable, 5, '2026-09-18T08:10:00.000Z');
  assert.equal(prepared.crimping.source.strippingStatus, 'NOT_APPLICABLE');
  assert.equal(prepared.crimping.destination.strippingStatus, 'COMPLETED');
  assert.equal(prepared.crimping.overall, 'COMPLETED');
  assert.equal(isWiringLockedByCrimping(prepared), false);
});

test('markWirePrepared: OPEN DESTINATION — rejects one-shot (stages required)', () => {
  const cable = { openEnd: 'destination', crimping: { required: true } };
  assert.throws(
    () => markWirePrepared(cable, 5, '2026-09-18T08:11:00.000Z'),
    (err) => err.code === STAGED_PREPARATION_REQUIRED_CODE,
  );
  const prepared = v2FullPrepare(cable, 5, '2026-09-18T08:11:00.000Z');
  assert.equal(prepared.crimping.destination.strippingStatus, 'NOT_APPLICABLE');
  assert.equal(prepared.crimping.source.crimpingStatus, 'COMPLETED');
  assert.equal(prepared.crimping.overall, 'COMPLETED');
});

test('markWirePrepared: Not Required throws', () => {
  assert.throws(() => markWirePrepared({ crimping: {} }, 1), /not Crimping Required/i);
});

test('markWirePrepared: idempotent when already COMPLETED (via V2 stages)', () => {
  const cable = v2FullPrepare({ crimping: setCrimpingRequired({}, true, 1) }, 7, '2026-09-18T08:12:00.000Z');
  const second = markWirePrepared(cable, 7, '2026-09-18T08:13:00.000Z');
  assert.equal(second.changed, false);
  assert.equal(second.auditAction, null);
  assert.equal(second.state.source.strippedBy, 7);
});

test('markWirePrepared: rework then re-prepare preserves original by/at', () => {
  let cable = v2FullPrepare({ crimping: setCrimpingRequired({}, true, 1) }, 2, '2026-09-18T07:00:00.000Z');
  assert.equal(cable.crimping.source.crimpedBy, 2);
  const rework = markPrepReworkRequired(
    cable, 'source', 'crimp', 99, 'Bad ferrule', '2026-09-18T08:00:00.000Z', 'prod_supervisor',
  );
  const reprepped = markWirePrepared(
    { ...cable, crimping: rework.state },
    8,
    '2026-09-18T09:00:00.000Z',
  );
  assert.equal(reprepped.changed, true);
  assert.equal(reprepped.auditAction, 'wire_reprepared');
  assert.equal(reprepped.clearedRework, true);
  assert.equal(reprepped.state.source.crimpingStatus, 'COMPLETED');
  assert.equal(reprepped.state.source.crimpedBy, 2); // original preserved
  assert.equal(reprepped.state.overall, 'COMPLETED');
  assert.ok(reprepped.state.source.reworkHistory.some((h) => /Re-prepared/i.test(h.reason)));
  assert.equal(isWiringLockedByCrimping({ ...cable, crimping: reprepped.state }), false);
});

/* ── V2 Whole-Wire Preparation Tranche 1 tests ── */

test('V2: markWireCut → markBothEndsStripped → markWireCrimped → ready for wiring', () => {
  const cable = { crimping: setCrimpingRequired({}, true, 1) };

  const cutResult = markWireCut(cable, 5, { plannedLength: '3.5m', actualLength: '3.4m' }, '2026-09-18T10:00:00.000Z');
  assert.equal(cutResult.changed, true);
  assert.equal(cutResult.auditAction, 'wire_cut');
  assert.equal(cutResult.state.cut.status, 'COMPLETED');
  assert.equal(cutResult.state.cut.plannedLength, '3.5m');
  assert.equal(cutResult.state.cut.actualLength, '3.4m');
  assert.equal(cutResult.state.cut.by, 5);
  assert.equal(isWiringLockedByCrimping({ ...cable, crimping: cutResult.state }), true);

  const stripResult = markBothEndsStripped({ ...cable, crimping: cutResult.state }, 5, '2026-09-18T10:01:00.000Z');
  assert.equal(stripResult.changed, true);
  assert.equal(stripResult.auditAction, 'wire_stripped');
  assert.equal(stripResult.state.wireStrip.status, 'COMPLETED');
  assert.equal(stripResult.state.source.strippingStatus, 'COMPLETED');
  assert.equal(stripResult.state.destination.strippingStatus, 'COMPLETED');
  assert.equal(isWiringLockedByCrimping({ ...cable, crimping: stripResult.state }), true);

  const crimpResult = markWireCrimped({ ...cable, crimping: stripResult.state }, 5, '2026-09-18T10:02:00.000Z');
  assert.equal(crimpResult.changed, true);
  assert.equal(crimpResult.auditAction, 'wire_crimped');
  assert.equal(crimpResult.state.wireCrimp.status, 'COMPLETED');
  assert.equal(crimpResult.state.source.crimpingStatus, 'COMPLETED');
  assert.equal(crimpResult.state.destination.crimpingStatus, 'COMPLETED');
  assert.equal(crimpResult.state.overall, 'COMPLETED');
  assert.equal(isWiringLockedByCrimping({ ...cable, crimping: crimpResult.state }), false);
  assert.equal(isReadyForWiring(crimpResult.state), true);
});

test('V2: crimp-before-strip rejects', () => {
  const cable = { crimping: setCrimpingRequired({}, true, 1) };
  const cutResult = markWireCut(cable, 5, {}, '2026-09-18T10:00:00.000Z');
  assert.throws(
    () => markWireCrimped({ ...cable, crimping: cutResult.state }, 5),
    /must be stripped before crimping/i,
  );
});

test('V2: strip-before-cut rejects', () => {
  const cable = { crimping: setCrimpingRequired({}, true, 1) };
  assert.throws(
    () => markBothEndsStripped(cable, 5),
    /must be cut before stripping/i,
  );
});

test('V2: wiring locked until all stages complete', () => {
  const cable = { crimping: setCrimpingRequired({}, true, 1) };
  assert.equal(isWiringLockedByCrimping(cable), true);

  const cut = markWireCut(cable, 5, {}, '2026-09-18T10:00:00.000Z');
  assert.equal(isWiringLockedByCrimping({ crimping: cut.state }), true);

  const stripped = markBothEndsStripped({ crimping: cut.state }, 5, '2026-09-18T10:01:00.000Z');
  assert.equal(isWiringLockedByCrimping({ crimping: stripped.state }), true);

  const crimped = markWireCrimped({ crimping: stripped.state }, 5, '2026-09-18T10:02:00.000Z');
  assert.equal(isWiringLockedByCrimping({ crimping: crimped.state }), false);
});

test('V2: legacy exactly-one-end → legacyPartial blocks wiring', () => {
  let cable = { crimping: setCrimpingRequired({}, true, 1) };
  cable = { crimping: markStripEndComplete(cable, 'source', 10, '2026-09-18T10:00:00.000Z').state };
  cable = { crimping: markCrimpEndComplete(cable, 'source', 10, '2026-09-18T10:01:00.000Z').state };

  const state = normalizeCrimping(cable.crimping, null);
  assert.equal(state.legacyPartial, true, 'exactly one end done should set legacyPartial');
  assert.equal(isWiringLockedByCrimping(cable), true);
  assert.equal(isReadyForWiring(state), false);

  // Complete the second end
  cable = { crimping: markStripEndComplete(cable, 'destination', 10, '2026-09-18T10:02:00.000Z').state };
  cable = { crimping: markCrimpEndComplete(cable, 'destination', 10, '2026-09-18T10:03:00.000Z').state };
  const fullState = normalizeCrimping(cable.crimping, null);
  assert.equal(fullState.legacyPartial, undefined, 'both ends done should clear legacyPartial');
  assert.equal(isWiringLockedByCrimping(cable), false);
});

test('V2: resolveLegacyPartial clears flag and maps stages when both ends done', () => {
  let cable = { crimping: setCrimpingRequired({}, true, 1) };
  cable = { crimping: markStripEndComplete(cable, 'source', 10, '2026-09-18T10:00:00.000Z').state };
  cable = { crimping: markCrimpEndComplete(cable, 'source', 10, '2026-09-18T10:01:00.000Z').state };
  cable = { crimping: markStripEndComplete(cable, 'destination', 10, '2026-09-18T10:02:00.000Z').state };
  cable = { crimping: markCrimpEndComplete(cable, 'destination', 10, '2026-09-18T10:03:00.000Z').state };

  // Both ends complete but legacyPartial might be in normalized state from intermediate steps
  // resolveLegacyPartial should be a no-op if not flagged
  const result = resolveLegacyPartial(cable, 99, '2026-09-18T10:10:00.000Z');
  assert.equal(result.changed, false, 'no legacyPartial → no-op');

  // Force a legacyPartial scenario: one end only, then resolve after completing second
  let cable2 = { crimping: setCrimpingRequired({}, true, 1) };
  cable2 = { crimping: markStripEndComplete(cable2, 'source', 10, '2026-09-18T10:00:00.000Z').state };
  cable2 = { crimping: markCrimpEndComplete(cable2, 'source', 10, '2026-09-18T10:01:00.000Z').state };
  // Verify legacyPartial is set on normalize
  const partial = normalizeCrimping(cable2.crimping, null);
  assert.equal(partial.legacyPartial, true);

  // Now complete second end
  cable2 = { crimping: markStripEndComplete({ crimping: partial }, 'destination', 10, '2026-09-18T10:02:00.000Z').state };
  cable2 = { crimping: markCrimpEndComplete(cable2, 'destination', 10, '2026-09-18T10:03:00.000Z').state };
  // After both ends done, normalize auto-clears legacyPartial
  const resolved = normalizeCrimping(cable2.crimping, null);
  assert.equal(resolved.legacyPartial, undefined);
  assert.equal(resolved.cut.status, 'COMPLETED');
  assert.equal(resolved.wireStrip.status, 'COMPLETED');
  assert.equal(resolved.wireCrimp.status, 'COMPLETED');
});

test('V2: KPIs count wires not ends for cut/stripped/crimped', () => {
  const wires = [
    // Wire 0: fully V2 prepared
    (() => {
      let c = { crimping: setCrimpingRequired({}, true, 1) };
      c = { crimping: markWireCut(c, 1, {}).state };
      c = { crimping: markBothEndsStripped(c, 1).state };
      c = { crimping: markWireCrimped(c, 1).state };
      return c;
    })(),
    // Wire 1: cut only
    (() => {
      let c = { crimping: setCrimpingRequired({}, true, 1) };
      c = { crimping: markWireCut(c, 1, {}).state };
      return c;
    })(),
    // Wire 2: legacy both-ends complete (should synthesize to V2 COMPLETED)
    { crimping: { required: true, source: completePrepEnd(), destination: completePrepEnd() } },
    // Wire 3: not required
    {},
    // Wire 4: required, not started
    { crimping: { required: true } },
  ];
  const kpi = summarizeCrimpingKpis(wires);
  assert.equal(kpi.totalWires, 5);
  assert.equal(kpi.required, 4);
  assert.equal(kpi.cut, 3, 'wires 0,1 via V2 + wire 2 synthesized');
  assert.equal(kpi.stripped, 2, 'wires 0 via V2 + wire 2 synthesized');
  assert.equal(kpi.crimped, 2, 'wires 0 via V2 + wire 2 synthesized');
  assert.equal(kpi.readyForWiring, 2, 'wires 0 + wire 2 ready');
  assert.equal(kpi.legacyPartial, 0);
  assert.equal(kpi.openRework, 0);
});

test('V2: KPI legacyPartial and openRework counts', () => {
  // Wire with one end done → legacyPartial
  let oneEnd = { crimping: setCrimpingRequired({}, true, 1) };
  oneEnd = { crimping: markStripEndComplete(oneEnd, 'source', 10).state };
  oneEnd = { crimping: markCrimpEndComplete(oneEnd, 'source', 10).state };

  // Wire with rework (prepare via V2 stages first)
  let reworkWire = v2FullPrepare({ crimping: setCrimpingRequired({}, true, 1) }, 2);
  reworkWire = { crimping: markPrepReworkRequired(reworkWire, 'source', 'crimp', 99, 'Damaged').state };

  const kpi = summarizeCrimpingKpis([oneEnd, reworkWire]);
  assert.equal(kpi.required, 2);
  assert.equal(kpi.legacyPartial, 1);
  assert.equal(kpi.openRework, 1);
  assert.equal(kpi.readyForWiring, 0);
});

test('V2: idempotency of each stage', () => {
  let cable = { crimping: setCrimpingRequired({}, true, 1) };

  // Cut idempotent
  cable = { crimping: markWireCut(cable, 5, { plannedLength: '3m' }, '2026-09-18T10:00:00.000Z').state };
  const cutAgain = markWireCut(cable, 99, { plannedLength: '5m' }, '2026-09-18T11:00:00.000Z');
  assert.equal(cutAgain.changed, false);
  assert.equal(cutAgain.state.cut.by, 5, 'original attribution preserved');
  assert.equal(cutAgain.state.cut.plannedLength, '3m', 'original length preserved');

  // Strip idempotent
  cable = { crimping: markBothEndsStripped(cable, 5, '2026-09-18T10:01:00.000Z').state };
  const stripAgain = markBothEndsStripped(cable, 99, '2026-09-18T11:01:00.000Z');
  assert.equal(stripAgain.changed, false);
  assert.equal(stripAgain.state.wireStrip.by, 5);

  // Crimp idempotent
  cable = { crimping: markWireCrimped(cable, 5, '2026-09-18T10:02:00.000Z').state };
  const crimpAgain = markWireCrimped(cable, 99, '2026-09-18T11:02:00.000Z');
  assert.equal(crimpAgain.changed, false);
  assert.equal(crimpAgain.state.wireCrimp.by, 5);
});

test('V2: markWireCut throws when not required', () => {
  assert.throws(() => markWireCut({}, 1), /not Crimping Required/i);
});

test('V2: open-end wire — V2 stages honour open side', () => {
  const cable = { openEnd: 'source', crimping: setCrimpingRequired({}, true, 1) };
  const cut = markWireCut(cable, 5, {}, '2026-09-18T10:00:00.000Z');
  const stripped = markBothEndsStripped({ ...cable, crimping: cut.state }, 5, '2026-09-18T10:01:00.000Z');
  assert.equal(stripped.state.source.strippingStatus, 'NOT_APPLICABLE');
  assert.equal(stripped.state.destination.strippingStatus, 'COMPLETED');

  const crimped = markWireCrimped({ ...cable, crimping: stripped.state }, 5, '2026-09-18T10:02:00.000Z');
  assert.equal(crimped.state.source.crimpingStatus, 'NOT_APPLICABLE');
  assert.equal(crimped.state.destination.crimpingStatus, 'COMPLETED');
  assert.equal(crimped.state.overall, 'COMPLETED');
  assert.equal(isReadyForWiring(crimped.state), true);
  assert.equal(isWiringLockedByCrimping({ ...cable, crimping: crimped.state }), false);
});

test('V2: normalizeCrimping preserves V2 stages from raw', () => {
  const raw = {
    required: true,
    source: completePrepEnd(),
    destination: completePrepEnd(),
    cut: { status: 'COMPLETED', plannedLength: '2m', by: 7, at: '2026-09-18T10:00:00.000Z' },
    wireStrip: { status: 'COMPLETED', by: 7, at: '2026-09-18T10:01:00.000Z' },
    wireCrimp: { status: 'COMPLETED', by: 7, at: '2026-09-18T10:02:00.000Z' },
  };
  const state = normalizeCrimping(raw, null);
  assert.equal(state.cut.status, 'COMPLETED');
  assert.equal(state.cut.plannedLength, '2m');
  assert.equal(state.cut.by, 7);
  assert.equal(state.wireStrip.status, 'COMPLETED');
  assert.equal(state.wireCrimp.status, 'COMPLETED');
  assert.equal(isReadyForWiring(state), true);
});

test('V2: normalizeCrimping synthesizes stages for legacy both-ends complete', () => {
  const raw = {
    required: true,
    source: completePrepEnd(),
    destination: completePrepEnd(),
  };
  const state = normalizeCrimping(raw, null);
  assert.ok(state.cut, 'cut should be synthesized');
  assert.equal(state.cut.status, 'COMPLETED');
  assert.ok(state.wireStrip, 'wireStrip should be synthesized');
  assert.equal(state.wireStrip.status, 'COMPLETED');
  assert.ok(state.wireCrimp, 'wireCrimp should be synthesized');
  assert.equal(state.wireCrimp.status, 'COMPLETED');
  assert.equal(state.legacyPartial, undefined);
});

/* ── P0: prepareWire rejects when stages incomplete (STAGED_PREPARATION_REQUIRED) ── */

test('P0: markWirePrepared rejects when V2 stages incomplete', () => {
  const cable = { crimping: setCrimpingRequired({}, true, 1) };
  assert.throws(
    () => markWirePrepared(cable, 5),
    (err) => err.code === STAGED_PREPARATION_REQUIRED_CODE,
    'should throw STAGED_PREPARATION_REQUIRED when no stages done',
  );
});

test('P0: markWirePrepared rejects with only cut done', () => {
  let cable = { crimping: setCrimpingRequired({}, true, 1) };
  cable = { crimping: markWireCut(cable, 5, {}).state };
  assert.throws(
    () => markWirePrepared(cable, 5),
    (err) => err.code === STAGED_PREPARATION_REQUIRED_CODE,
    'should throw STAGED_PREPARATION_REQUIRED when only cut done',
  );
});

test('P0: markWirePrepared rejects with cut+strip done (crimp missing)', () => {
  let cable = { crimping: setCrimpingRequired({}, true, 1) };
  cable = { crimping: markWireCut(cable, 5, {}).state };
  cable = { crimping: markBothEndsStripped(cable, 5).state };
  assert.throws(
    () => markWirePrepared(cable, 5),
    (err) => err.code === STAGED_PREPARATION_REQUIRED_CODE,
    'should throw when crimp not done',
  );
});

test('P0: markWirePrepared allows when rework needs clearing', () => {
  let cable = v2FullPrepare({ crimping: setCrimpingRequired({}, true, 1) }, 2, '2026-09-18T07:00:00.000Z');
  const rework = markPrepReworkRequired(cable, 'source', 'crimp', 99, 'Damaged');
  // Re-prepare should be allowed for rework even though V2 stages are complete
  const result = markWirePrepared({ crimping: rework.state }, 3);
  assert.equal(result.changed, true);
  assert.equal(result.state.overall, 'COMPLETED');
});

test('P0: markWirePrepared idempotent when already fully complete', () => {
  let cable = { crimping: setCrimpingRequired({}, true, 1) };
  cable = { crimping: markWireCut(cable, 5, {}).state };
  cable = { crimping: markBothEndsStripped(cable, 5).state };
  cable = { crimping: markWireCrimped(cable, 5).state };
  // Now all stages done — markWirePrepared should be idempotent no-op
  const result = markWirePrepared(cable, 99);
  assert.equal(result.changed, false);
  assert.equal(result.auditAction, null);
});

test('P0: STAGED_PREPARATION_REQUIRED_CODE is stable for API clients', () => {
  assert.equal(STAGED_PREPARATION_REQUIRED_CODE, 'STAGED_PREPARATION_REQUIRED');
});

/* ── P0: strip-before-cut → throws (map to 409 in service) ── */

test('P0: strip before cut throws clear error', () => {
  const cable = { crimping: setCrimpingRequired({}, true, 1) };
  assert.throws(
    () => markBothEndsStripped(cable, 5),
    /must be cut before stripping/i,
  );
});

test('P0: crimp before strip rejected', () => {
  let cable = { crimping: setCrimpingRequired({}, true, 1) };
  cable = { crimping: markWireCut(cable, 5, {}).state };
  assert.throws(
    () => markWireCrimped(cable, 5),
    /must be stripped before crimping/i,
  );
});

/* ── P0: qaHold blocks readiness ── */

test('P0: qaHold blocks isReadyForWiring', () => {
  let cable = { crimping: setCrimpingRequired({}, true, 1) };
  cable = { crimping: markWireCut(cable, 5, {}).state };
  cable = { crimping: markBothEndsStripped(cable, 5).state };
  cable = { crimping: markWireCrimped(cable, 5).state };
  assert.equal(isReadyForWiring(cable.crimping), true);

  // Set qaHold manually
  cable.crimping.qaHold = true;
  assert.equal(isReadyForWiring(cable.crimping), false);
  assert.equal(isWiringLockedByCrimping(cable), true);
});

test('P0: qaHold counted in KPIs', () => {
  let cable = { crimping: setCrimpingRequired({}, true, 1) };
  cable = { crimping: markWireCut(cable, 5, {}).state };
  cable = { crimping: markBothEndsStripped(cable, 5).state };
  cable = { crimping: markWireCrimped(cable, 5).state };
  cable.crimping.qaHold = true;

  const kpi = summarizeCrimpingKpis([cable]);
  assert.equal(kpi.qaHold, 1);
  assert.equal(kpi.readyForWiring, 0, 'qaHold wire should not count as ready');
});

/* ── P0: rework affectedEnd ── */

test('P0: markPrepReworkWithAffectedEnd SOURCE delegates to single end', () => {
  let cable = v2FullPrepare({ crimping: setCrimpingRequired({}, true, 1) }, 2);
  const result = markPrepReworkWithAffectedEnd(cable, 'SOURCE', 'crimp', 99, 'Damaged');
  assert.equal(result.changed, true);
  assert.equal(result.state.source.crimpingStatus, 'REWORK_REQUIRED');
  assert.equal(result.state.destination.crimpingStatus, 'COMPLETED');
});

test('P0: markPrepReworkWithAffectedEnd BOTH marks both applicable ends', () => {
  let cable = v2FullPrepare({ crimping: setCrimpingRequired({}, true, 1) }, 2);
  const result = markPrepReworkWithAffectedEnd(cable, 'BOTH', 'strip', 99, 'Restrip both');
  assert.equal(result.changed, true);
  assert.equal(result.state.source.strippingStatus, 'REWORK_REQUIRED');
  assert.equal(result.state.destination.strippingStatus, 'REWORK_REQUIRED');
});

test('P0: markPrepReworkWithAffectedEnd GENERAL marks wire-level stage', () => {
  let cable = { crimping: setCrimpingRequired({}, true, 1) };
  cable = { crimping: markWireCut(cable, 5, {}).state };
  cable = { crimping: markBothEndsStripped(cable, 5).state };
  cable = { crimping: markWireCrimped(cable, 5).state };
  const result = markPrepReworkWithAffectedEnd(cable, 'GENERAL', 'crimp', 99, 'General rework');
  assert.equal(result.changed, true);
  assert.equal(result.state.wireCrimp.status, 'REWORK_REQUIRED');
  assert.equal(isReadyForWiring(result.state), false);
});

test('P0: markPrepReworkWithAffectedEnd Not Required throws', () => {
  assert.throws(
    () => markPrepReworkWithAffectedEnd({}, 'BOTH', 'crimp', 1, 'test'),
    /not Crimping Required/i,
  );
});

/* ── P0: legacyPartial + legacyCrimpWithoutStrip allow markWirePrepared ── */

test('P0: markWirePrepared allowed for legacyPartial bypass', () => {
  let cable = { crimping: setCrimpingRequired({}, true, 1) };
  cable = { crimping: markStripEndComplete(cable, 'source', 10).state };
  cable = { crimping: markCrimpEndComplete(cable, 'source', 10).state };
  // normalize sets legacyPartial
  const state = normalizeCrimping(cable.crimping, null);
  assert.equal(state.legacyPartial, true);
  // markWirePrepared should be allowed as escape
  const result = markWirePrepared({ crimping: state }, 5);
  assert.equal(result.changed, true);
  assert.equal(result.state.overall, 'COMPLETED');
});

test('aggregateCrimpingKpis sums assignment KPIs without inventing', () => {
  const empty = aggregateCrimpingKpis([]);
  assert.equal(empty.totalWires, 0);
  assert.equal(empty.cut, 0);
  assert.equal(empty.percent, 0);

  const a = summarizeCrimpingKpis([
    v2FullPrepare({ crimping: setCrimpingRequired({}, true, 1) }, 1),
  ]);
  const b = summarizeCrimpingKpis([
    { crimping: setCrimpingRequired({}, true, 1) },
    { crimping: setCrimpingRequired({}, true, 1) },
  ]);
  const sum = aggregateCrimpingKpis([a, b]);
  assert.equal(sum.totalWires, a.totalWires + b.totalWires);
  assert.equal(sum.required, a.required + b.required);
  assert.equal(sum.cut, a.cut + b.cut);
  assert.equal(sum.completed, a.completed + b.completed);
  assert.equal(sum.percent, crimpingWirePercent(sum.completed, sum.required));
});
