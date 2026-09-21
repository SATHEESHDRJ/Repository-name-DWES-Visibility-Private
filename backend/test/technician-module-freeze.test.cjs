/**
 * Freeze regression guards — Technician modules stay separated;
 * V2 Whole-Wire staged controls (Mark Wire Cut / Both Ends Stripped / Mark Wire Crimped)
 * are primary in stripping/crimping modules; PREPARE WIRE kept as compat/supervisor escape.
 * Four per-end completion buttons remain forbidden.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..');
const WS = path.join(ROOT, 'src', 'components', 'technician', 'wiring', 'WiringWorkstation.tsx');
const DRAWER = path.join(ROOT, 'src', 'components', 'technician', 'wiring', 'PrepareWireDrawer.tsx');
const GROUP = path.join(ROOT, 'src', 'components', 'technician', 'wiring', 'CrimpingGroupView.tsx');

test('freeze: WiringWorkstation source exists', () => {
  assert.ok(fs.existsSync(WS), 'WiringWorkstation.tsx missing');
});

test('freeze: DIGITAL WIRING / STRIPPING / CRIMPING / CRIMPING REPORT modules present', () => {
  const src = fs.readFileSync(WS, 'utf8');
  assert.match(src, /DIGITAL WIRING/);
  assert.match(src, /STRIPPING/);
  assert.match(src, /CRIMPING REPORT/);
  assert.match(src, /workspaceModule === 'wiring'/);
  assert.match(src, /workspaceModule === 'stripping'/);
  assert.match(src, /workspaceModule === 'crimping'/);
  assert.match(src, /workspaceModule === 'report'/);
});

test('freeze: FINISHED only gated to wiring module', () => {
  const src = fs.readFileSync(WS, 'utf8');
  assert.match(src, /workspaceModule === 'wiring' \? \([\s\S]*?FINISHED/);
  assert.match(src, /allDone && workspaceModule === 'wiring'/);
});

test('freeze: V2 staged controls present (Mark Wire Cut / Both Ends Stripped / Mark Both Ends Crimped)', () => {
  const src = fs.readFileSync(WS, 'utf8');
  assert.match(src, /Mark Wire Cut/);
  assert.match(src, /Mark Both Ends Stripped/);
  assert.match(src, /Mark Both Ends Crimped/);
  assert.match(src, /data-testid="mark-wire-cut"/);
  assert.match(src, /data-testid="mark-both-ends-stripped"/);
  assert.match(src, /data-testid="mark-wire-crimped"/);
});

test('freeze: Stage badges present (CUT / STRIPPED / CRIMPED / REWORK / READY / LEGACY PARTIAL)', () => {
  const src = fs.readFileSync(WS, 'utf8');
  assert.match(src, /data-testid="stage-badges"/);
  assert.match(src, /CUT/);
  assert.match(src, /STRIPPED/);
  assert.match(src, /CRIMPED/);
  assert.match(src, /REWORK/);
  assert.match(src, /READY/);
  assert.match(src, /LEGACY PARTIAL/);
});

test('freeze: PREPARE WIRE kept as compat/escape (not primary in stripping/crimping)', () => {
  const src = fs.readFileSync(WS, 'utf8');
  assert.match(src, /PREPARE WIRE/);
  assert.match(src, /PrepareWireDrawer/);
  assert.match(src, /prepareWire|showPrepareWire/);
  // No per-end technician completion buttons
  assert.doesNotMatch(src, /SOURCE STRIPPED/);
  assert.doesNotMatch(src, /SOURCE CRIMPED/);
  assert.doesNotMatch(src, /DEST STRIPPED/);
  assert.doesNotMatch(src, /DEST CRIMPED/);
  // Wiring-locked gate shows "Wire preparation pending." not PREPARE WIRE as primary
  assert.match(src, /Wire preparation pending/);
  assert.match(src, /GO TO STRIPPING/);
});

test('freeze: V2 staged API calls present (cutWire / stripWire / crimpWire)', () => {
  const src = fs.readFileSync(WS, 'utf8');
  assert.match(src, /techApi\.cutWire/);
  assert.match(src, /techApi\.stripWire/);
  assert.match(src, /techApi\.crimpWire/);
  assert.match(src, /doStageAction/);
});

test('freeze: PrepareWireDrawer confirms whole-wire prepare', () => {
  assert.ok(fs.existsSync(DRAWER), 'PrepareWireDrawer.tsx missing');
  const src = fs.readFileSync(DRAWER, 'utf8');
  assert.match(src, /CONFIRM WIRE PREPARED/);
  assert.match(src, /techApi\.prepareWire/);
});

test('freeze: TechnicianCrimpingReport is read-only (no crimpingAction posts)', () => {
  const report = path.join(ROOT, 'src', 'components', 'technician', 'wiring', 'TechnicianCrimpingReport.tsx');
  const src = fs.readFileSync(report, 'utf8');
  assert.doesNotMatch(src, /crimpingAction/);
  assert.doesNotMatch(src, /prepareWire/);
});

test('freeze: TechnicianCrimpingReport shows V2 KPIs with QA Hold', () => {
  const report = path.join(ROOT, 'src', 'components', 'technician', 'wiring', 'TechnicianCrimpingReport.tsx');
  const src = fs.readFileSync(report, 'utf8');
  assert.match(src, /kpi\.cut/);
  assert.match(src, /kpi\.stripped/);
  assert.match(src, /kpi\.crimped/);
  assert.match(src, /kpi\.legacyPartial/);
  assert.match(src, /kpi\.qaHold/);
  assert.match(src, /Ready for Wiring/);
  assert.match(src, /QA Hold/);
  assert.match(src, /Required/);
  assert.match(src, /Cut/);
  assert.match(src, /Stripped/);
  assert.match(src, /Crimped/);
});

test('freeze: Group view uses staged CUT/STRIP/CRIMP SELECTED and PREPARE SELECTED (compat)', () => {
  const src = fs.readFileSync(GROUP, 'utf8');
  assert.match(src, /CUT SELECTED/);
  assert.match(src, /STRIP SELECTED/);
  assert.match(src, /CRIMP SELECTED/);
  assert.match(src, /PREPARE SELECTED/);
  assert.doesNotMatch(src, /MARK SELECTED SOURCE STRIPPED/);
  assert.doesNotMatch(src, /MARK SELECTED SOURCE CRIMPED/);
});

test('freeze: Group view table has CUT/STRIPPED/CRIMPED/READY columns', () => {
  const src = fs.readFileSync(GROUP, 'utf8');
  assert.match(src, /<th scope="col">CUT<\/th>/);
  assert.match(src, /<th scope="col">STRIPPED<\/th>/);
  assert.match(src, /<th scope="col">CRIMPED<\/th>/);
  assert.match(src, /<th scope="col">READY<\/th>/);
  assert.match(src, /cutOk/);
  assert.match(src, /stripOk/);
  assert.match(src, /crimpOk/);
  // No per-end SRC STRIP/DST STRIP columns
  assert.doesNotMatch(src, /<th scope="col">SRC STRIP<\/th>/);
  assert.doesNotMatch(src, /<th scope="col">DST STRIP<\/th>/);
});

test('freeze: wiring-utils summarizeCrimpingStatus includes V2 fields + qaHold', () => {
  const utils = path.join(ROOT, 'src', 'components', 'technician', 'wiring', 'wiring-utils.ts');
  const src = fs.readFileSync(utils, 'utf8');
  assert.match(src, /cut: cutCount/);
  assert.match(src, /stripped: strippedCount/);
  assert.match(src, /crimped: crimpedCount/);
  assert.match(src, /legacyPartial: legacyPartialCount/);
  assert.match(src, /openRework: openReworkCount/);
  assert.match(src, /qaHold: qaHoldCount/);
});

test('freeze: Frontend API client has staged methods', () => {
  const apiSrc = fs.readFileSync(path.join(ROOT, 'src', 'services', 'api.ts'), 'utf8');
  assert.match(apiSrc, /cutWire:/);
  assert.match(apiSrc, /stripWire:/);
  assert.match(apiSrc, /crimpWire:/);
  assert.match(apiSrc, /resolveLegacyPartial:/);
});

test('freeze: Backend controller has V2 routes', () => {
  const ctrl = fs.readFileSync(path.join(ROOT, 'backend', 'src', 'tech', 'tech.controller.ts'), 'utf8');
  assert.match(ctrl, /crimping\/cut/);
  assert.match(ctrl, /crimping\/strip-wire/);
  assert.match(ctrl, /crimping\/crimp-wire/);
});

test('freeze: Supervisor controller has resolve-legacy-partial route', () => {
  const ctrl = fs.readFileSync(path.join(ROOT, 'backend', 'src', 'supervisor', 'supervisor.controller.ts'), 'utf8');
  assert.match(ctrl, /resolve-legacy-partial/);
  assert.match(ctrl, /resolveLegacyPartial/);
});
