import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import type { AutoExtractResult } from './auto-extract';
import type { Flat3dRunMeta } from '../flat3d-conversion/flat3d-conversion.types';

export type WorkflowCheckStatus = 'pass' | 'warn' | 'fail' | 'manual';

export interface WorkflowCheck {
  id: string;
  stage: string;
  status: WorkflowCheckStatus;
  message: string;
  evidence?: string;
}

export interface WorkflowDiagnoseResult {
  verdict: 'PASS' | 'PASS_WITH_WARNINGS' | 'FAIL';
  checks: WorkflowCheck[];
  overlay?: Record<string, unknown> | null;
  gltf_validation?: Record<string, unknown> | null;
  blocking_stage?: string | null;
}

export interface Flat3dArtifacts {
  manifest: Record<string, unknown> | null;
  overlay: Record<string, unknown> | null;
  gltfValidation: Record<string, unknown> | null;
  report: Record<string, unknown> | null;
  glbPath: string | null;
  glbBytes: number;
  sourceChecksum: string | null;
}

export function readFlat3dArtifacts(runDir: string | undefined | null): Flat3dArtifacts {
  const empty: Flat3dArtifacts = {
    manifest: null,
    overlay: null,
    gltfValidation: null,
    report: null,
    glbPath: null,
    glbBytes: 0,
    sourceChecksum: null,
  };
  if (!runDir || !fs.existsSync(runDir)) return empty;
  const out = path.join(runDir, 'out');
  const readJson = (p: string) => {
    if (!fs.existsSync(p)) return null;
    try {
      return JSON.parse(fs.readFileSync(p, 'utf8')) as Record<string, unknown>;
    } catch {
      return null;
    }
  };
  const glbPath = fs.existsSync(path.join(out, 'model.glb')) ? path.join(out, 'model.glb') : null;
  let glbBytes = 0;
  if (glbPath) glbBytes = fs.statSync(glbPath).size;
  const report = readJson(path.join(out, 'report.json'));
  return {
    manifest: readJson(path.join(out, 'manifest.json')),
    overlay: readJson(path.join(out, 'overlay_compare.json')),
    gltfValidation: readJson(path.join(out, 'gltf_validation.json')),
    report,
    glbPath,
    glbBytes,
    sourceChecksum: typeof report?.checksum === 'string' ? report.checksum : null,
  };
}

function push(checks: WorkflowCheck[], check: WorkflowCheck): void {
  checks.push(check);
}

function verdictFromChecks(checks: WorkflowCheck[]): 'PASS' | 'PASS_WITH_WARNINGS' | 'FAIL' {
  if (checks.some(c => c.status === 'fail')) return 'FAIL';
  if (checks.some(c => c.status === 'warn')) return 'PASS_WITH_WARNINGS';
  return 'PASS';
}

function firstBlocking(checks: WorkflowCheck[]): string | null {
  const fail = checks.find(c => c.status === 'fail');
  return fail?.stage ?? null;
}

/** Drawing revision recorded by the conversion run, when the CLI was given one. */
function runDrawingRevision(artifacts: Flat3dArtifacts): number | null {
  const raw =
    (artifacts.manifest as { drawing_revision?: unknown } | null)?.drawing_revision ??
    (artifacts.report as { drawing_revision?: unknown } | null)?.drawing_revision;
  if (raw === null || raw === undefined || raw === '') return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

export interface RunWorkflowDiagnoseArgs {
  packageRevision: number;
  drawingSha256: string | null;
  drawingName: string;
  extract: AutoExtractResult | null;
  flat3dMeta: Flat3dRunMeta | null;
  artifacts: Flat3dArtifacts;
  modelHasGlb: boolean;
  modelStatus: string | null;
  isPdf: boolean;
}

export function runWorkflowDiagnose(args: RunWorkflowDiagnoseArgs): WorkflowDiagnoseResult {
  const checks: WorkflowCheck[] = [];

  push(checks, {
    id: 'drawing_stored',
    stage: 'INGEST',
    status: args.drawingSha256 ? 'pass' : 'fail',
    message: args.drawingSha256
      ? `Drawing stored with checksum ${args.drawingSha256.slice(0, 12)}… (rev ${args.packageRevision}).`
      : 'Drawing checksum missing — re-upload required.',
    evidence: args.drawingName,
  });

  const pdfFallbackRun = args.flat3dMeta?.fallback === 'APPROVED_2D_ONLY';
  if (args.isPdf && (!args.flat3dMeta || pdfFallbackRun)) {
    push(checks, {
      id: 'pdf_flat3d',
      stage: 'INGEST',
      status: 'warn',
      message: 'PDF source — Flat 3D CAD pipeline not applicable; Approved 2D fallback until confirmed geometry or DWG/DXF.',
    });
  }

  if (args.flat3dMeta && !(args.isPdf && pdfFallbackRun)) {
    const failed = args.flat3dMeta.status === 'FAILED';
    push(checks, {
      id: 'flat3d_run',
      stage: 'FLAT_3D_GENERATION',
      status: failed ? 'fail' : 'pass',
      message: failed
        ? `Latest Flat 3D run FAILED — ${args.flat3dMeta.failureReason ?? 'no failure reason recorded'}.`
        : `Latest Flat 3D run ${args.flat3dMeta.runId} is ${args.flat3dMeta.status}.`,
      evidence: args.flat3dMeta.runId,
    });
  }

  if (args.extract) {
    const pages = args.extract.scanned_sources.reduce((n, s) => n + s.pages_scanned, 0);
    push(checks, {
      id: 'full_document_scan',
      stage: 'DXF_PARSE',
      status: pages > 0 ? 'pass' : 'fail',
      message: `Scanned ${args.extract.scanned_sources.length} file(s), ${pages} page/chunk(s).`,
    });
    const ga = args.extract.views_detected.includes('ga') || args.extract.views_detected.includes('internal');
    push(checks, {
      id: 'ga_internal_layout',
      stage: 'SEMANTIC_EXTRACTION',
      status: ga ? 'pass' : 'warn',
      message: ga
        ? `GA/internal views detected: ${args.extract.views_detected.join(', ')}`
        : 'No GA or internal-layout view confidently detected — verify page selection.',
    });
    for (const key of ['width_mm', 'height_mm', 'depth_mm'] as const) {
      const f = args.extract.fields[key];
      push(checks, {
        id: `dimension_${key}`,
        stage: 'GEOMETRY_NORMALIZATION',
        status: f.value == null ? 'fail' : f.confidence === 'UNRESOLVED' ? 'warn' : 'pass',
        message: `${key}: ${f.value ?? 'unresolved'} (${f.confidence}) — ${f.source}`,
        evidence: f.source_page ?? undefined,
      });
    }

    const terminals = args.extract.fields.terminal_rows;
    push(checks, {
      id: 'terminals_detected',
      stage: 'SEMANTIC_EXTRACTION',
      status: terminals.value == null ? 'warn' : 'pass',
      message: terminals.value == null
        ? 'No terminal rows detected — model omits terminal blocks until confirmed from internal layout or manual entry.'
        : `Terminal rows: ${terminals.value} (${terminals.confidence}) — ${terminals.source}`,
    });
    const ducts = args.extract.fields.wire_troughs;
    push(checks, {
      id: 'ducts_detected',
      stage: 'SEMANTIC_EXTRACTION',
      status: ducts.value == null ? 'warn' : 'pass',
      message: ducts.value == null
        ? 'No wire duct/trunking detected — model omits ducts until confirmed from drawing or manual entry.'
        : `Wire ducts/troughs: ${ducts.value} (${ducts.confidence}) — ${ducts.source}`,
    });

    const dup = Object.keys(args.extract.schedule_match.duplicate_drawing_tags).length;
    const missTags = args.extract.schedule_match.missing_schedule_tags;
    const miss = missTags.length;
    const matched = args.extract.schedule_match.matched_tags.length;
    const noneMatched = miss > 0 && matched === 0;
    push(checks, {
      id: 'schedule_tags',
      stage: 'SCHEDULE_MATCHING',
      status: noneMatched ? 'fail' : miss > 0 || dup > 0 ? 'warn' : 'pass',
      message: noneMatched
        ? `None of ${miss} schedule device(s) found on drawing — drawing/schedule mismatch blocks a trustworthy model.`
        : `Matched ${matched}; missing schedule ${miss}; duplicate drawing tags ${dup}.`,
      evidence: miss > 0 ? `missing: ${missTags.slice(0, 10).join(', ')}${miss > 10 ? '…' : ''}` : undefined,
    });
    const unresolved = args.extract.components.filter(c => c.confidence === 'UNRESOLVED').length;
    push(checks, {
      id: 'unresolved_components',
      stage: 'SEMANTIC_EXTRACTION',
      status: unresolved > 0 ? 'warn' : 'pass',
      message: `${unresolved} unresolved component(s); ${args.extract.components.length} total candidates.`,
    });
  } else {
    push(checks, {
      id: 'extract_missing',
      stage: 'SEMANTIC_EXTRACTION',
      status: 'fail',
      message: 'Auto extract has not run — use Auto Extract & Generate.',
    });
  }

  const runRev = runDrawingRevision(args.artifacts);
  if (runRev !== null) {
    const revMatch = runRev === args.packageRevision;
    push(checks, {
      id: 'revision_match',
      stage: 'INGEST',
      status: revMatch ? 'pass' : 'fail',
      message: revMatch
        ? `Conversion run was generated for the current package revision ${args.packageRevision}.`
        : `Flat 3D run was generated for package revision ${runRev}; current revision is ${args.packageRevision} — regenerate conversion.`,
    });
  }

  if (args.artifacts.sourceChecksum && args.drawingSha256) {
    const match = args.artifacts.sourceChecksum === args.drawingSha256;
    push(checks, {
      id: 'checksum_unchanged',
      stage: 'INGEST',
      status: match ? 'pass' : 'fail',
      message: match
        ? 'Conversion source checksum matches stored drawing.'
        : 'Flat 3D run source checksum does not match current drawing — regenerate conversion.',
    });
  } else if (args.flat3dMeta && !args.isPdf) {
    push(checks, {
      id: 'checksum_unchanged',
      stage: 'INGEST',
      status: 'warn',
      message: 'Conversion provenance not verifiable — run report has no source checksum to compare against the stored drawing.',
    });
  }

  if (args.artifacts.glbPath) {
    let structural: { ok: boolean; bytes: number } | null = null;
    try {
      structural = validateGlbBuffer(fs.readFileSync(args.artifacts.glbPath));
    } catch {
      structural = null;
    }
    push(checks, {
      id: 'glb_structure',
      stage: 'GLB_EXPORT',
      status: structural?.ok ? 'pass' : 'fail',
      message: structural
        ? structural.ok
          ? `GLB present (${structural.bytes} bytes).`
          : 'GLB magic/version invalid.'
        : 'GLB file could not be read from run directory.',
    });
    push(checks, {
      id: 'source_traceability',
      stage: 'GLB_EXPORT',
      status: args.artifacts.manifest ? 'pass' : 'warn',
      message: args.artifacts.manifest
        ? 'Conversion manifest present for source-entity traceability.'
        : 'Manifest missing — node metadata traceability not verified.',
    });
  } else if (!args.isPdf) {
    push(checks, {
      id: 'glb_structure',
      stage: 'GLB_EXPORT',
      status: 'fail',
      message: 'No Flat 3D GLB produced yet.',
    });
  }

  const gv = args.artifacts.gltfValidation;
  if (gv) {
    const exit = gv.exit_code;
    const ran = gv.ran === true;
    push(checks, {
      id: 'gltf_validator',
      stage: 'GLB_VALIDATION',
      status: !ran ? 'warn' : exit === 0 ? 'pass' : 'fail',
      message: ran ? `Khronos validator exit ${exit}.` : 'Validator not run — structural GLB check only.',
    });
  } else if (args.artifacts.glbPath) {
    push(checks, {
      id: 'gltf_validator',
      stage: 'GLB_VALIDATION',
      status: 'warn',
      message: 'No glTF validation report on disk.',
    });
  }

  const ov = args.artifacts.overlay as {
    matched_device_pct?: number;
    missing_device_pct?: number;
    positional_deviation_mm?: { max?: number | null };
  } | null;
  if (ov) {
    const match = ov.matched_device_pct ?? 0;
    const dev = ov.positional_deviation_mm?.max;
    push(checks, {
      id: 'overlay_alignment',
      stage: 'BROWSER_VERIFICATION',
      status: match >= 80 && (dev ?? 0) <= 5 ? 'pass' : match >= 50 ? 'warn' : 'fail',
      message: `Overlay matched devices ${match}%; missing ${ov.missing_device_pct ?? 100 - match}%; max positional deviation ${dev ?? 'n/a'} mm.`,
      evidence: JSON.stringify(ov).slice(0, 200),
    });
  } else if (args.flat3dMeta?.status === 'READY_FOR_REVIEW') {
    push(checks, {
      id: 'overlay_alignment',
      stage: 'BROWSER_VERIFICATION',
      status: 'warn',
      message: 'Overlay compare metrics not found.',
    });
  }

  push(checks, {
    id: 'model_persisted',
    stage: 'READY_FOR_REVIEW',
    status: args.modelHasGlb ? 'pass' : 'fail',
    message: args.modelHasGlb
      ? `Panel model status: ${args.modelStatus ?? 'unknown'}.`
      : 'No generated model GLB in panel model store.',
  });

  push(checks, {
    id: 'viewer_controls',
    stage: 'BROWSER_VERIFICATION',
    status: 'manual',
    message: 'Confirm rotate/zoom/pan/reset in EngineeringModelViewer (Supervisor verify tab).',
  });
  push(checks, {
    id: 'themes_tablet',
    stage: 'BROWSER_VERIFICATION',
    status: 'manual',
    message: 'Confirm light/dark theme and tablet viewport in browser smoke test.',
  });
  push(checks, {
    id: 'approved_2d_fallback',
    stage: 'BROWSER_VERIFICATION',
    status: args.drawingSha256 ? 'pass' : 'fail',
    message: !args.drawingSha256
      ? 'No stored drawing — Approved 2D fallback unavailable until re-upload.'
      : args.isPdf
        ? 'PDF Approved 2D path available when Flat 3D not published.'
        : 'CAD/parametric path — Approved 2D remains available from drawing package.',
  });

  const verdict = verdictFromChecks(checks);
  return {
    verdict,
    checks,
    overlay: args.artifacts.overlay,
    gltf_validation: args.artifacts.gltfValidation,
    blocking_stage: verdict === 'FAIL' ? firstBlocking(checks) : null,
  };
}

export function validateGlbBuffer(buffer: Buffer): { ok: boolean; sha256: string; bytes: number } {
  const sha256 = crypto.createHash('sha256').update(buffer).digest('hex');
  const ok = buffer.length >= 12 && buffer.readUInt32LE(0) === 0x46546c67 && buffer.readUInt32LE(4) === 2;
  return { ok, sha256, bytes: buffer.length };
}

/** Safe fixes only — never invent engineering values. */
export function applySafeAutoFixes(extract: AutoExtractResult): { extract: AutoExtractResult; fixes: string[] } {
  const fixes: string[] = [];
  const components = [...extract.components];
  const seen = new Set<string>();
  const deduped = components.filter(c => {
    const k = `${c.type}:${c.label.replace(/\s+/g, '')}`;
    if (seen.has(k)) {
      fixes.push(`Removed duplicate component entry "${c.label}".`);
      return false;
    }
    seen.add(k);
    return true;
  });
  const form = { ...extract.form, components: deduped.map(c => ({
    label: c.label.trim(),
    type: c.type,
    confidence: c.confidence,
    source: c.source,
  })) };
  if (deduped.some(c => c.label !== c.label.trim())) {
    fixes.push('Trimmed whitespace on component labels.');
  }
  return {
    extract: { ...extract, components: deduped, form },
    fixes,
  };
}
