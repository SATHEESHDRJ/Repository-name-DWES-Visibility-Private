'use strict';
// backend/test/workflow-diagnose.test.cjs
// Unit tests for the panel-model workflow diagnose (Flat 3D honesty checks).
// These tests operate on the compiled dist/ output.
// Run: cd backend && node --test test/workflow-diagnose.test.cjs
// (requires `npm run build` first to populate dist/)

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');

const DIST_DIAGNOSE = path.join(__dirname, '..', 'dist', 'panel-model', 'workflow-diagnose.js');
const distBuilt = fs.existsSync(DIST_DIAGNOSE);

function field(value, confidence = 'CONFIRMED', source = 'drawing text') {
  return { value, confidence, source, source_page: null, source_entity: null };
}

function makeExtract(overrides = {}) {
  const base = {
    scanned_sources: [{ drawing_id: 'd1', original_name: 'GA.pdf', role: 'ga', pages_scanned: 2, text_quality: 0.9 }],
    views_detected: ['ga', 'internal'],
    fields: {
      width_mm: field(800),
      height_mm: field(2200),
      depth_mm: field(600),
      doors: field(1),
      mounting_plate: field(true),
      gland_plate: field(true),
      base_frame: field(true),
      base_frame_height_mm: field(100),
      wire_troughs: field(2, 'HIGH_CONFIDENCE', 'duct/trunking keywords'),
      terminal_rows: field(3, 'HIGH_CONFIDENCE', 'CAD terminal blocks'),
      din_rails_detected: field(2),
    },
    components: [],
    schedule_match: { matched_tags: ['=Q1+F1'], missing_schedule_tags: [], duplicate_drawing_tags: {}, drawing_only_tags: [] },
    form: {
      width_mm: 800, height_mm: 2200, depth_mm: 600, doors: 1, mounting_plate: true, gland_plate: true,
      base_frame: true, base_frame_height_mm: 100, wire_troughs: 2, terminal_rows: 3, din_rails_detected: 2, components: [],
    },
    notes: [],
    auto_fix: { issues: [], can_regenerate: true },
  };
  return { ...base, ...overrides };
}

function emptyArtifacts() {
  return { manifest: null, overlay: null, gltfValidation: null, report: null, glbPath: null, glbBytes: 0, sourceChecksum: null };
}

function makeArgs(overrides = {}) {
  return {
    packageRevision: 3,
    drawingSha256: 'abc123def456',
    drawingName: 'GA.pdf',
    extract: makeExtract(),
    flat3dMeta: null,
    artifacts: emptyArtifacts(),
    modelHasGlb: true,
    modelStatus: 'verification_required',
    isPdf: true,
    ...overrides,
  };
}

function check(result, id) {
  return result.checks.find(c => c.id === id);
}

describe('runWorkflowDiagnose honest blockers', () => {
  test('missing auto extract is a FAIL blocking at SEMANTIC_EXTRACTION', () => {
    if (!distBuilt) { console.log('SKIP: dist/ not built. Run `npm run build` first.'); return; }
    const { runWorkflowDiagnose } = require(DIST_DIAGNOSE);
    const result = runWorkflowDiagnose(makeArgs({ extract: null }));
    assert.equal(result.verdict, 'FAIL');
    assert.equal(check(result, 'extract_missing')?.status, 'fail');
    assert.equal(result.blocking_stage, 'SEMANTIC_EXTRACTION');
  });

  test('checksum mismatch between conversion run and stored drawing is a FAIL', () => {
    if (!distBuilt) { console.log('SKIP: dist not built.'); return; }
    const { runWorkflowDiagnose } = require(DIST_DIAGNOSE);
    const artifacts = { ...emptyArtifacts(), sourceChecksum: 'stale-checksum' };
    const result = runWorkflowDiagnose(makeArgs({ artifacts }));
    assert.equal(check(result, 'checksum_unchanged')?.status, 'fail');
    assert.equal(result.verdict, 'FAIL');
  });

  test('revision mismatch recorded by the conversion run is a FAIL', () => {
    if (!distBuilt) { console.log('SKIP: dist not built.'); return; }
    const { runWorkflowDiagnose } = require(DIST_DIAGNOSE);
    const artifacts = { ...emptyArtifacts(), manifest: { drawing_revision: '2' }, sourceChecksum: 'abc123def456' };
    const result = runWorkflowDiagnose(makeArgs({ artifacts }));
    const rev = check(result, 'revision_match');
    assert.equal(rev?.status, 'fail');
    assert.ok(rev.message.includes('revision 2'));
    assert.equal(result.verdict, 'FAIL');
  });

  test('matching revision passes; unknown revision emits no fabricated pass', () => {
    if (!distBuilt) { console.log('SKIP: dist not built.'); return; }
    const { runWorkflowDiagnose } = require(DIST_DIAGNOSE);
    const matching = runWorkflowDiagnose(makeArgs({
      artifacts: { ...emptyArtifacts(), manifest: { drawing_revision: '3' }, sourceChecksum: 'abc123def456' },
    }));
    assert.equal(check(matching, 'revision_match')?.status, 'pass');
    const unknown = runWorkflowDiagnose(makeArgs());
    assert.equal(check(unknown, 'revision_match'), undefined);
  });

  test('schedule devices entirely missing from the drawing is a FAIL with tag evidence', () => {
    if (!distBuilt) { console.log('SKIP: dist not built.'); return; }
    const { runWorkflowDiagnose } = require(DIST_DIAGNOSE);
    const extract = makeExtract({
      schedule_match: { matched_tags: [], missing_schedule_tags: ['=Q1+F1', 'TB1'], duplicate_drawing_tags: {}, drawing_only_tags: [] },
    });
    const result = runWorkflowDiagnose(makeArgs({ extract }));
    const sched = check(result, 'schedule_tags');
    assert.equal(sched?.status, 'fail');
    assert.ok(sched.evidence.includes('=Q1+F1'));
    assert.equal(result.verdict, 'FAIL');
  });

  test('partially missing schedule devices warn with tag evidence', () => {
    if (!distBuilt) { console.log('SKIP: dist not built.'); return; }
    const { runWorkflowDiagnose } = require(DIST_DIAGNOSE);
    const extract = makeExtract({
      schedule_match: { matched_tags: ['=Q1+F1'], missing_schedule_tags: ['TB9'], duplicate_drawing_tags: {}, drawing_only_tags: [] },
    });
    const result = runWorkflowDiagnose(makeArgs({ extract }));
    const sched = check(result, 'schedule_tags');
    assert.equal(sched?.status, 'warn');
    assert.ok(sched.evidence.includes('TB9'));
  });

  test('undetected terminals and ducts are reported as warnings, never silently passed', () => {
    if (!distBuilt) { console.log('SKIP: dist not built.'); return; }
    const { runWorkflowDiagnose } = require(DIST_DIAGNOSE);
    const extract = makeExtract();
    extract.fields.terminal_rows = field(null, 'UNRESOLVED', 'not detected');
    extract.fields.wire_troughs = field(null, 'UNRESOLVED', 'not detected');
    const result = runWorkflowDiagnose(makeArgs({ extract }));
    assert.equal(check(result, 'terminals_detected')?.status, 'warn');
    assert.equal(check(result, 'ducts_detected')?.status, 'warn');
    assert.notEqual(result.verdict, 'PASS');
  });

  test('non-PDF drawing without a Flat 3D GLB fails at GLB_EXPORT (no fabricated readiness)', () => {
    if (!distBuilt) { console.log('SKIP: dist not built.'); return; }
    const { runWorkflowDiagnose } = require(DIST_DIAGNOSE);
    const result = runWorkflowDiagnose(makeArgs({ isPdf: false, drawingName: 'panel.dxf', modelHasGlb: false }));
    assert.equal(check(result, 'glb_structure')?.status, 'fail');
    assert.equal(check(result, 'model_persisted')?.status, 'fail');
    assert.equal(result.verdict, 'FAIL');
  });

  test('a FAILED Flat 3D run is surfaced with its failure reason', () => {
    if (!distBuilt) { console.log('SKIP: dist not built.'); return; }
    const { runWorkflowDiagnose } = require(DIST_DIAGNOSE);
    const flat3dMeta = {
      runId: 'run-1', runDir: '/nope', status: 'FAILED', stages: [], notes: [],
      failureReason: 'Python CLI exited with code 2', createdAt: new Date().toISOString(),
    };
    const result = runWorkflowDiagnose(makeArgs({ isPdf: false, drawingName: 'panel.dxf', flat3dMeta }));
    const run = check(result, 'flat3d_run');
    assert.equal(run?.status, 'fail');
    assert.ok(run.message.includes('Python CLI exited with code 2'));
    assert.equal(result.verdict, 'FAIL');
  });

  test('missing drawing fails both storage and Approved 2D fallback checks', () => {
    if (!distBuilt) { console.log('SKIP: dist not built.'); return; }
    const { runWorkflowDiagnose } = require(DIST_DIAGNOSE);
    const result = runWorkflowDiagnose(makeArgs({ drawingSha256: null }));
    assert.equal(check(result, 'drawing_stored')?.status, 'fail');
    assert.equal(check(result, 'approved_2d_fallback')?.status, 'fail');
    assert.equal(result.verdict, 'FAIL');
  });

  test('complete CAD run with matching provenance reaches PASS (manual checks stay manual)', () => {
    if (!distBuilt) { console.log('SKIP: dist not built.'); return; }
    const { runWorkflowDiagnose, readFlat3dArtifacts } = require(DIST_DIAGNOSE);

    const runDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dwes-diagnose-'));
    const out = path.join(runDir, 'out');
    fs.mkdirSync(out, { recursive: true });
    const glb = Buffer.alloc(12);
    glb.writeUInt32LE(0x46546c67, 0); // 'glTF'
    glb.writeUInt32LE(2, 4);
    glb.writeUInt32LE(12, 8);
    fs.writeFileSync(path.join(out, 'model.glb'), glb);
    fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify({ checksum: 'abc123def456', drawing_revision: '3' }));
    fs.writeFileSync(path.join(out, 'manifest.json'), JSON.stringify({ drawing_revision: '3', source: { sha256: 'abc123def456' } }));
    fs.writeFileSync(path.join(out, 'gltf_validation.json'), JSON.stringify({ ran: true, exit_code: 0 }));
    fs.writeFileSync(path.join(out, 'overlay_compare.json'), JSON.stringify({
      matched_device_pct: 100, missing_device_pct: 0, positional_deviation_mm: { mean: 0, max: 0 },
    }));

    const artifacts = readFlat3dArtifacts(runDir);
    assert.equal(artifacts.sourceChecksum, 'abc123def456');
    assert.equal(artifacts.glbBytes, 12);

    const flat3dMeta = {
      runId: 'run-ok', runDir, status: 'READY_FOR_REVIEW', stages: [], notes: [], createdAt: new Date().toISOString(),
    };
    const result = runWorkflowDiagnose(makeArgs({ isPdf: false, drawingName: 'panel.dxf', flat3dMeta, artifacts }));
    assert.equal(result.verdict, 'PASS', JSON.stringify(result.checks.filter(c => c.status !== 'pass'), null, 2));
    assert.equal(result.blocking_stage, null);
    assert.ok(result.checks.filter(c => c.status === 'manual').length >= 2, 'browser checks must remain manual');

    fs.rmSync(runDir, { recursive: true, force: true });
  });
});

describe('validateGlbBuffer', () => {
  test('accepts a valid GLB v2 header and rejects garbage or short buffers', () => {
    if (!distBuilt) { console.log('SKIP: dist not built.'); return; }
    const { validateGlbBuffer } = require(DIST_DIAGNOSE);
    const glb = Buffer.alloc(12);
    glb.writeUInt32LE(0x46546c67, 0);
    glb.writeUInt32LE(2, 4);
    glb.writeUInt32LE(12, 8);
    assert.equal(validateGlbBuffer(glb).ok, true);
    assert.equal(validateGlbBuffer(Buffer.from('not a glb at all')).ok, false);
    assert.equal(validateGlbBuffer(Buffer.alloc(4)).ok, false);
  });
});

describe('applySafeAutoFixes', () => {
  test('removes duplicate components without inventing values', () => {
    if (!distBuilt) { console.log('SKIP: dist not built.'); return; }
    const { applySafeAutoFixes } = require(DIST_DIAGNOSE);
    const comp = (label) => ({ label, type: 'mcb', value: label, confidence: 'CONFIRMED', source: 'drawing text', source_page: null, source_entity: null });
    const extract = makeExtract({ components: [comp('=Q1+F1'), comp('=Q1 +F1'), comp('TB1')] });
    const { extract: fixed, fixes } = applySafeAutoFixes(extract);
    assert.equal(fixed.components.length, 2);
    assert.ok(fixes.some(f => f.includes('duplicate')));
    assert.ok(!fixes.some(f => f.includes('Trimmed')), 'must not claim a whitespace trim that did not happen');
  });

  test('reports whitespace trim only when labels actually had stray whitespace', () => {
    if (!distBuilt) { console.log('SKIP: dist not built.'); return; }
    const { applySafeAutoFixes } = require(DIST_DIAGNOSE);
    const comp = (label) => ({ label, type: 'mcb', value: label, confidence: 'CONFIRMED', source: 'drawing text', source_page: null, source_entity: null });
    const { extract: fixed, fixes } = applySafeAutoFixes(makeExtract({ components: [comp(' TB1 ')] }));
    assert.equal(fixed.form.components[0].label, 'TB1');
    assert.ok(fixes.some(f => f.includes('Trimmed')));
  });
});
