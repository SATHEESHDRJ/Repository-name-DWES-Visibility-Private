import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException, Optional } from '@nestjs/common';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { PrismaService } from '../prisma/prisma.service';
import {
  MockStore,
  type PanelDrawingRole,
  type PanelGeneratedModel,
  type PanelModelComponent,
  type PanelModelSpec,
  type PanelModelStageEvent,
  type User,
} from '../data/mock-store';
import { FrameStore } from '../frames/frame-store';
import { PanelModelStore } from './panel-model-store';
import { extractPdfText } from './pdf-text';
import {
  classifyDrawingRole,
  detectViews,
  extractComponents,
  extractDimensions,
  overallConfidence,
} from './drawing-extract';
import { buildPanelGlb } from './glb-builder';
import { compareScheduleToDrawing } from './schedule-compare';
import { Flat3dConversionService } from '../flat3d-conversion/flat3d-conversion.service';
import { runAutoExtract, type AutoExtractResult } from './auto-extract';
import {
  applySafeAutoFixes,
  readFlat3dArtifacts,
  runWorkflowDiagnose,
  validateGlbBuffer,
  type WorkflowDiagnoseResult,
} from './workflow-diagnose';

export const INSUFFICIENT_INFO_MESSAGE =
  'Insufficient GA, dimensional or internal-layout information to generate a reliable 3D model for this Panel.';

const COMPONENT_TYPE_WHITELIST = new Set([
  'protection_relay', 'aux_relay', 'mcb', 'mccb', 'contactor', 'meter', 'ct_vt', 'switch',
  'lamp', 'push_button', 'heater', 'thermostat', 'power_supply', 'fuse', 'socket', 'timer',
  'terminal_block', 'device',
]);

export interface PanelModelSpecPatch {
  package_revision?: number;
  enclosure?: { width_mm?: number; height_mm?: number; depth_mm?: number };
  doors?: { count: number };
  mounting_plate?: { present: boolean };
  gland_plate?: { present: boolean };
  base_frame?: { present: boolean; height_mm?: number };
  wire_troughs?: { count: number };
  terminal_rows?: { count: number };
  components?: Array<{ label: string; type: string }>;
  verification_notes?: string;
}

function sanitizeLabel(label: string): string {
  return String(label || '').replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 60);
}

function sanitizeNotes(value: unknown): string {
  return String(value ?? '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').trim().slice(0, 1000);
}

function requireMm(value: number, field: string): number {
  if (!Number.isFinite(value) || value < 100 || value > 6000) {
    throw new BadRequestException(`${field} must be between 100 and 6000 mm`);
  }
  return Math.round(value);
}

@Injectable()
export class PanelModelService {
  constructor(
    private prisma: PrismaService,
    @Optional() private flat3d: Flat3dConversionService | null = null,
  ) {}

  // ── Validation of the Project → Panel → Drawing chain ─────────────────────

  private async assertProjectActive(projectCode: string) {
    const project = await this.prisma.projects.findFirst({ where: { code: projectCode, is_active: true } });
    if (!project) throw new NotFoundException(`Project ${projectCode} not found`);
    return project;
  }

  private frameOrThrow(projectCode: string, frameId: string) {
    if (FrameStore.isBlocked(projectCode, frameId)) throw new NotFoundException(`Panel ${frameId} not found in project ${projectCode}`);
    const frame = MockStore.findFrameByProjectAndId(projectCode, frameId) ?? FrameStore.getFrameFromDisk(projectCode, frameId);
    if (!frame) throw new NotFoundException(`Panel ${frameId} not found in project ${projectCode}`);
    return frame;
  }

  private packageOrThrow(projectCode: string, frameId: string) {
    const record = FrameStore.getDrawingPackage(projectCode, frameId);
    if (!record) throw new NotFoundException(`Panel ${frameId} not found in project ${projectCode}`);
    return record;
  }

  private assertSupervisor(user: User) {
    if (user.role !== 'prod_supervisor') {
      throw new ForbiddenException('Only a Production Supervisor may generate, correct or approve a panel model');
    }
  }

  private assertPackageRevision(expected: number | undefined, actual: number) {
    if (expected === undefined || expected === null || !Number.isInteger(Number(expected))) {
      throw new BadRequestException('package_revision is required for this operation');
    }
    if (Number(expected) !== actual) {
      throw new ConflictException(
        `The drawing package changed (revision ${actual}, you had ${expected}). Reload the panel before generating, correcting or approving.`,
      );
    }
  }

  // ── Read model state (role-aware) ──────────────────────────────────────────

  async getPanelModels(projectCode: string, frameId: string, user: User) {
    await this.assertProjectActive(projectCode);
    const frame = this.frameOrThrow(projectCode, frameId);
    const pkg = this.packageOrThrow(projectCode, frameId);
    const technician = user.role === 'wiring_technician';
    const all = PanelModelStore.list(projectCode, frameId);
    const visible = technician ? all.filter(m => m.status === 'approved') : all;
    const current = technician
      ? visible[0] ?? null
      : all[0] ?? null;
    const supervisor = user.role === 'prod_supervisor';
    return {
      project_code: projectCode,
      frame_id: frameId,
      panel_name: frame.panel_name,
      panel_type: frame.panel_type ?? null,
      package_revision: pkg.revision,
      has_drawing_2d: Boolean(pkg.drawing_2d),
      panel_status: current ? current.status : pkg.drawing_2d ? 'drawing_uploaded' : 'no_drawing',
      current,
      history: visible,
      permissions: {
        can_convert: supervisor && Boolean(pkg.drawing_2d),
        can_correct: supervisor && !!current
          && current.source_package_revision === pkg.revision
          && (current.status === 'verification_required' || current.status === 'conversion_failed'),
        can_approve: supervisor && !!current
          && current.source_package_revision === pkg.revision
          && current.status === 'verification_required'
          && Boolean(current.model_file),
      },
    };
  }

  getModelFile(projectCode: string, frameId: string, modelId: string, user: User) {
    this.frameOrThrow(projectCode, frameId);
    const model = PanelModelStore.find(projectCode, frameId, modelId);
    if (!model) throw new NotFoundException('Generated model not found for this panel');
    if (user.role === 'wiring_technician' && model.status !== 'approved') {
      throw new NotFoundException('Generated model not found for this panel');
    }
    if (!model.model_file) throw new NotFoundException('This model revision has no generated geometry');
    const buffer = PanelModelStore.getGlb(projectCode, frameId, modelId);
    if (!buffer) throw new NotFoundException('Generated model file is missing from storage');
    return { buffer, filename: model.model_file.filename, contentType: 'model/gltf-binary', sha256: model.model_file.sha256, revision: model.revision };
  }

  // ── Conversion pipeline ─────────────────────────────────────────────────────

  async convert(projectCode: string, frameId: string, user: User, expectedPackageRevision?: number) {
    this.assertSupervisor(user);
    await this.assertProjectActive(projectCode);
    const frame = this.frameOrThrow(projectCode, frameId);
    const pkg = this.packageOrThrow(projectCode, frameId);
    if (!pkg.drawing_2d) throw new BadRequestException('Upload a 2D drawing for this panel before generating a 3D model');
    this.assertPackageRevision(expectedPackageRevision, pkg.revision);

    // ── CAD-first path (DWG / DXF → LibreDWG → ezdxf → Flat 3D GLB) ──────────
    // Only attempted when the primary drawing is a DWG or DXF and the flat3d
    // service is available (injected). PDF drawings fall through to the
    // parametric path below — PDF alone cannot produce Engineering Exact geometry.
    if (
      this.flat3d &&
      /\.(dwg|dxf)$/i.test(pkg.drawing_2d.original_name)
    ) {
      const drawingFile = FrameStore.getDrawingFile(projectCode, pkg.drawing_2d.id);
      if (drawingFile) {
        const runId = crypto.randomUUID();
        const tmpDir = path.join(
          process.env.UPLOAD_DIR
            ? path.isAbsolute(process.env.UPLOAD_DIR) ? process.env.UPLOAD_DIR : path.join(process.cwd(), process.env.UPLOAD_DIR)
            : path.join(process.cwd(), 'uploads'),
          projectCode, 'flat3d', frameId, runId, 'source',
        );
        fs.mkdirSync(tmpDir, { recursive: true });
        const ext = path.extname(pkg.drawing_2d.original_name) || '.dwg';
        const tmpSourcePath = path.join(tmpDir, `source${ext}`);
        fs.writeFileSync(tmpSourcePath, drawingFile.buffer);

        // Build schedule.json from cable device tags if cables are present.
        let scheduleJsonPath: string | undefined;
        if (frame.cables && frame.cables.length > 0) {
          const entries = this.flat3d.buildScheduleJson(
            frame.cables.map(c => ({
              source_device: c.source_device,
              source_terminal: c.source_terminal,
              dest_device: c.dest_device,
              dest_terminal: c.dest_terminal,
              ferrule: c.ferrule,
              ref: c.ref,
              color: c.color,
              size: c.size,
              path: c.path,
            })),
          );
          scheduleJsonPath = path.join(path.dirname(tmpDir), 'schedule.json');
          this.flat3d.writeScheduleJson(entries, scheduleJsonPath);
        }

        const flat3dResult = await this.flat3d.runConversion({
          projectCode,
          frameId,
          sourceFilePath: tmpSourcePath,
          originalName: pkg.drawing_2d.original_name,
          scheduleJsonPath,
          drawingRevision: pkg.revision,
        });

        if (flat3dResult.status === 'READY_FOR_REVIEW' && flat3dResult.glbBuffer) {
          const id = `pm_${crypto.randomUUID()}`;
          const revision = PanelModelStore.nextRevision(projectCode, frameId);
          const now = new Date().toISOString();
          const sha256 = crypto.createHash('sha256').update(flat3dResult.glbBuffer).digest('hex');
          const extractionNotes = flat3dResult.notes.slice(0, 20);
          const flat3dRecord: PanelGeneratedModel = {
            id,
            project_code: projectCode,
            frame_id: frameId,
            panel_name: frame.panel_name,
            panel_type: frame.panel_type,
            revision,
            status: 'verification_required',
            status_message: 'Flat 3D GLB produced by DWG/DXF CAD conversion pipeline. Supervisor verification and approval required before technician access.',
            stages: flat3dResult.stages.map(s => ({ stage: s.stage as PanelModelStageEvent['stage'], at: s.at, detail: s.detail })),
            sources: [{ drawing_id: pkg.drawing_2d.id, original_name: pkg.drawing_2d.original_name, sha256: pkg.drawing_2d.sha256 || '', role: 'ga', package_revision: pkg.revision }],
            source_package_revision: pkg.revision,
            views_detected: ['ga'],
            extraction: {
              text_quality: 0,
              confidence: flat3dResult.overlay?.matched_device_pct !== undefined
                ? (flat3dResult.overlay.matched_device_pct > 80 ? 0.75 : 0.5)
                : 0.25,
              notes: extractionNotes,
            },
            analysis: {
              ga_detected: true,
              ga_pages: [],
              ga_confidence: 0.75,
              drawing_references: [],
              schedule_comparison: {
                status: 'no_schedule' as const,
                schedule_rows: 0,
                schedule_references: [],
                drawing_references: [],
                matched_references: [],
                schedule_only_references: [],
                drawing_only_references: [],
                ambiguous_references: [],
                unmatched_schedule_rows: 0,
              },
            },
            spec: {
              enclosure: {
                width: { value_mm: null, source: 'placeholder', confidence: 0 },
                height: { value_mm: null, source: 'placeholder', confidence: 0 },
                depth: { value_mm: null, source: 'placeholder', confidence: 0 },
              },
              doors: { count: 1, source: 'placeholder' },
              mounting_plate: { present: true, source: 'placeholder' },
              gland_plate: { present: true, source: 'placeholder' },
              base_frame: { present: true, height_mm: 100, source: 'placeholder' },
              wire_troughs: { count: 0, source: 'placeholder' },
              terminal_rows: { count: 0, source: 'placeholder' },
              components: [],
            },
            placeholders: ['Enclosure dimensions pending supervisor verification'],
            model_file: { filename: flat3dResult.glbFilename!, content_type: 'model/gltf-binary', size: flat3dResult.glbBuffer.length, sha256 },
            created_at: now,
            updated_at: now,
            converted_by: user.id,
            converted_by_name: user.full_name || user.username,
            conversion_started_at: now,
            conversion_completed_at: now,
            verified_by: null,
            verified_by_name: '',
            approved_at: null,
            superseded_by: null,
            superseded_at: null,
          };
          PanelModelStore.supersedeActive(projectCode, frameId, flat3dRecord.id, `Superseded by Flat 3D CAD conversion revision ${revision}`);
          PanelModelStore.persist(flat3dRecord, flat3dResult.glbBuffer);
          return this.getPanelModels(projectCode, frameId, user);
        }

        // Flat 3D failed (non-PDF, non-APPROVED_2D_ONLY) — store as conversion_failed.
        if (flat3dResult.status === 'FAILED' && flat3dResult.fallback !== 'APPROVED_2D_ONLY') {
          const id = `pm_${crypto.randomUUID()}`;
          const revision = PanelModelStore.nextRevision(projectCode, frameId);
          const now = new Date().toISOString();
          const failed: PanelGeneratedModel = {
            id,
            project_code: projectCode,
            frame_id: frameId,
            panel_name: frame.panel_name,
            panel_type: frame.panel_type,
            revision,
            status: 'conversion_failed',
            status_message: flat3dResult.failureReason || 'Flat 3D CAD conversion failed.',
            stages: flat3dResult.stages.map(s => ({ stage: s.stage as PanelModelStageEvent['stage'], at: s.at, detail: s.detail })),
            sources: [{ drawing_id: pkg.drawing_2d.id, original_name: pkg.drawing_2d.original_name, sha256: pkg.drawing_2d.sha256 || '', role: 'ga', package_revision: pkg.revision }],
            source_package_revision: pkg.revision,
            views_detected: [],
            extraction: { text_quality: 0, confidence: 0.1, notes: flat3dResult.notes.slice(0, 10) },
            analysis: { ga_detected: false, ga_pages: [], ga_confidence: 0, drawing_references: [], schedule_comparison: { status: 'no_schedule' as const, schedule_rows: 0, schedule_references: [], drawing_references: [], matched_references: [], schedule_only_references: [], drawing_only_references: [], ambiguous_references: [], unmatched_schedule_rows: 0 } },
            spec: { enclosure: { width: { value_mm: null, source: 'placeholder', confidence: 0 }, height: { value_mm: null, source: 'placeholder', confidence: 0 }, depth: { value_mm: null, source: 'placeholder', confidence: 0 } }, doors: { count: 1, source: 'placeholder' }, mounting_plate: { present: true, source: 'placeholder' }, gland_plate: { present: true, source: 'placeholder' }, base_frame: { present: true, height_mm: 100, source: 'placeholder' }, wire_troughs: { count: 0, source: 'placeholder' }, terminal_rows: { count: 0, source: 'placeholder' }, components: [] },
            placeholders: [],
            model_file: null,
            created_at: now,
            updated_at: now,
            converted_by: user.id,
            converted_by_name: user.full_name || user.username,
            conversion_started_at: now,
            conversion_completed_at: now,
            verified_by: null,
            verified_by_name: '',
            approved_at: null,
            superseded_by: null,
            superseded_at: null,
          };
          PanelModelStore.supersedeActive(projectCode, frameId, failed.id, `Superseded by failed Flat 3D attempt revision ${revision}`);
          PanelModelStore.persist(failed);
          return this.getPanelModels(projectCode, frameId, user);
        }
        // APPROVED_2D_ONLY fallback — fall through to parametric path.
      }
    }

    const startedAt = new Date().toISOString();
    const stages: PanelModelStageEvent[] = [];
    const stage = (s: PanelModelStageEvent['stage'], detail?: string) =>
      stages.push({ stage: s, at: new Date().toISOString(), ...(detail ? { detail } : {}) });

    // ANALYSING — collect and classify ONLY this panel's 2D files.
    stage('analysing');
    const diskRows = FrameStore.listDrawingsFromDisk(projectCode)
      .filter(d => d.frame_id === frameId && (d.kind ?? 'unknown') !== '3d');
    const sourceRows = [
      ...(pkg.drawing_2d ? [{ id: pkg.drawing_2d.id, original_name: pkg.drawing_2d.original_name, sha256: pkg.drawing_2d.sha256 }] : []),
      ...diskRows.map(d => ({ id: d.id, original_name: d.original_name, sha256: d.sha256 ?? '' })),
    ];
    const seen = new Set<string>();
    const notes: string[] = [];
    let combinedText = '';
    let textQuality = 0;
    const sources: PanelGeneratedModel['sources'] = [];
    for (const row of sourceRows) {
      if (seen.has(row.id)) continue;
      seen.add(row.id);
      const file = FrameStore.getDrawingFile(projectCode, row.id);
      if (!file) { notes.push(`Source file for drawing ${row.id} is missing on disk — skipped.`); continue; }
      let text = '';
      if (/\.pdf$/i.test(row.original_name)) {
        const extracted = extractPdfText(file.buffer);
        text = extracted.text;
        textQuality = Math.max(textQuality, extracted.quality);
        notes.push(...extracted.notes.map(n => `${row.original_name}: ${n}`));
      } else {
        notes.push(`${row.original_name}: raster/CAD source without a text layer — no automatic extraction possible.`);
      }
      const role: PanelDrawingRole = classifyDrawingRole(row.original_name, text);
      combinedText += (combinedText ? '\n' : '') + text;
      sources.push({
        drawing_id: row.id,
        original_name: row.original_name,
        sha256: row.sha256 || crypto.createHash('sha256').update(file.buffer).digest('hex'),
        role,
        package_revision: pkg.revision,
      });
    }
    const views = detectViews(combinedText);
    for (const source of sources) if (source.role !== 'unknown' && !views.includes(source.role)) views.push(source.role);

    // EXTRACTING DIMENSIONS
    stage('extracting_dimensions');
    const dims = extractDimensions(combinedText, textQuality);
    notes.push(...dims.notes);

    // IDENTIFYING COMPONENTS
    stage('identifying_components');
    const extractedComponents = extractComponents(combinedText);
    const scheduleComparison = compareScheduleToDrawing(frame.cables ?? [], combinedText);
    const gaDetected = views.includes('ga') || /\b(?:GENERAL\s+ARRANGEMENT|PANEL\s+ARRANGEMENT|GA)\b/i.test(combinedText);
    if (scheduleComparison.status === 'no_schedule') notes.push('Wiring schedule is not available for this panel.');
    if (scheduleComparison.status === 'mismatch') notes.push(`${scheduleComparison.schedule_only_references.length} scheduled reference(s) were not found in the drawing text.`);
    if (gaDetected && scheduleComparison.status === 'mismatch') notes.push('GA detected, but drawing-to-schedule comparison contains mismatches; supervisor review is required.');
    const components: PanelModelComponent[] = extractedComponents.map((c, i) => ({
      id: `cmp_${i + 1}`,
      label: sanitizeLabel(c.label),
      type: COMPONENT_TYPE_WHITELIST.has(c.type) ? c.type : 'device',
      source: 'extracted',
      position: 'placeholder',
    }));

    const internalDetected = views.includes('internal') || views.includes('apparatus_list');
    const glandDetected = /\bgland\s*plate\b/i.test(combinedText);
    const baseDetected = /\b(base\s*frame|plinth|base\s*channel)\b/i.test(combinedText);
    const troughDetected = /\b(trunking|wire\s*(trough|duct)|cable\s*duct)\b/i.test(combinedText);

    const spec: PanelModelSpec = {
      enclosure: { width: dims.width, height: dims.height, depth: dims.depth },
      doors: { count: 1, source: 'placeholder' },
      mounting_plate: { present: true, source: internalDetected ? 'extracted' : 'placeholder' },
      gland_plate: { present: true, source: glandDetected ? 'extracted' : 'placeholder' },
      base_frame: { present: true, height_mm: 100, source: baseDetected ? 'extracted' : 'placeholder' },
      wire_troughs: { count: 2, source: troughDetected ? 'extracted' : 'placeholder' },
      terminal_rows: { count: components.some(c => c.type === 'terminal_block') ? 1 : 0, source: 'placeholder' },
      components,
    };

    const confidence = overallConfidence({ textQuality, dims, componentCount: components.length, viewCount: views.length });
    const missingDimensions = (['width', 'height', 'depth'] as const)
      .filter(key => dims[key].value_mm === null);
    if (missingDimensions.length) {
      notes.push(`Missing required enclosure dimensions: ${missingDimensions.join(', ')}.`);
    }

    const id = `pm_${crypto.randomUUID()}`;
    const revision = PanelModelStore.nextRevision(projectCode, frameId);
    const base: PanelGeneratedModel = {
      id,
      project_code: projectCode,
      frame_id: frameId,
      panel_name: frame.panel_name,
      panel_type: frame.panel_type,
      revision,
      status: 'analysing',
      stages,
      sources,
      source_package_revision: pkg.revision,
      views_detected: views,
      extraction: { text_quality: textQuality, confidence, notes },
      analysis: {
        ga_detected: gaDetected,
        ga_pages: [],
        ga_confidence: gaDetected ? Math.max(0.25, textQuality) : 0,
        drawing_references: scheduleComparison.drawing_references,
        schedule_comparison: scheduleComparison,
      },
      spec,
      placeholders: [],
      model_file: null,
      created_at: startedAt,
      updated_at: startedAt,
      converted_by: user.id,
      converted_by_name: user.full_name || user.username,
      conversion_started_at: startedAt,
      conversion_completed_at: null,
      verified_by: null,
      verified_by_name: '',
      approved_at: null,
      superseded_by: null,
      superseded_at: null,
    };

    // All three enclosure axes are mandatory. A partial extraction must use the
    // same supervisor-verified fallback as a drawing with no dimensions; the GLB
    // builder is never allowed to fill a missing axis with a sample value.
    if (missingDimensions.length) {
      stage('conversion_failed', INSUFFICIENT_INFO_MESSAGE);
      const failed: PanelGeneratedModel = {
        ...base,
        status: 'conversion_failed',
        status_message: INSUFFICIENT_INFO_MESSAGE,
        conversion_completed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      PanelModelStore.supersedeActive(projectCode, frameId, failed.id, `Superseded by conversion attempt revision ${revision}`);
      PanelModelStore.persist(failed);
      return this.getPanelModels(projectCode, frameId, user);
    }

    // GENERATING MODEL
    stage('generating_model');
    const generated = this.generateInto(base);
    PanelModelStore.supersedeActive(projectCode, frameId, generated.record.id, `Superseded by new model revision ${revision}`);
    PanelModelStore.persist(generated.record, generated.glb);
    return this.getPanelModels(projectCode, frameId, user);
  }

  /** Run the GLB builder for a record and return the completed (verification_required) record. */
  private generateInto(record: PanelGeneratedModel): { record: PanelGeneratedModel; glb: Buffer } {
    const { glb, placeholders } = buildPanelGlb(record.spec, `${record.project_code} · ${record.panel_name}`);
    const now = new Date().toISOString();
    const sha256 = crypto.createHash('sha256').update(glb).digest('hex');
    const completed: PanelGeneratedModel = {
      ...record,
      status: 'verification_required',
      status_message: placeholders.length
        ? `Generated with ${placeholders.length} placeholder value(s) — supervisor verification required.`
        : 'Generated from extracted drawing data — supervisor verification required.',
      placeholders,
      model_file: { filename: `${record.id}.glb`, content_type: 'model/gltf-binary', size: glb.length, sha256 },
      conversion_completed_at: now,
      updated_at: now,
      stages: [...record.stages, { stage: 'verification_required', at: now }],
    };
    return { record: completed, glb };
  }

  // ── Supervisor corrections + approval ───────────────────────────────────────

  async updateSpec(
    projectCode: string,
    frameId: string,
    modelId: string,
    patch: PanelModelSpecPatch,
    user: User,
    expectedPackageRevision: number | undefined = patch.package_revision,
  ) {
    this.assertSupervisor(user);
    await this.assertProjectActive(projectCode);
    this.frameOrThrow(projectCode, frameId);
    const pkg = this.packageOrThrow(projectCode, frameId);
    this.assertPackageRevision(expectedPackageRevision, pkg.revision);
    const model = PanelModelStore.find(projectCode, frameId, modelId);
    if (!model) throw new NotFoundException('Generated model not found for this panel');
    const latest = PanelModelStore.list(projectCode, frameId)[0];
    if (!latest || latest.id !== model.id) throw new ConflictException('Only the latest model revision can be corrected');
    if (model.status !== 'verification_required' && model.status !== 'conversion_failed') {
      throw new ConflictException(`A model in status "${model.status}" cannot be corrected`);
    }
    if (model.source_package_revision !== pkg.revision) {
      throw new ConflictException('The 2D drawing changed after this model revision was created — reload and start a new conversion');
    }

    // The manual fallback is an explicit verified specification, not a partial
    // patch that can leave the builder to guess missing axes.
    if (
      !patch.enclosure
      || patch.enclosure.width_mm === undefined
      || patch.enclosure.height_mm === undefined
      || patch.enclosure.depth_mm === undefined
    ) {
      throw new BadRequestException('Width, Height and Depth are all required before regenerating');
    }

    const spec: PanelModelSpec = JSON.parse(JSON.stringify(model.spec));
    spec.enclosure.width = { value_mm: requireMm(patch.enclosure.width_mm, 'Width'), source: 'manual', confidence: 1 };
    spec.enclosure.height = { value_mm: requireMm(patch.enclosure.height_mm, 'Height'), source: 'manual', confidence: 1 };
    spec.enclosure.depth = { value_mm: requireMm(patch.enclosure.depth_mm, 'Depth'), source: 'manual', confidence: 1 };
    if (patch.doors) {
      const count = Math.round(Number(patch.doors.count));
      if (!Number.isFinite(count) || count < 1 || count > 4) throw new BadRequestException('Door count must be 1–4');
      spec.doors = { count, source: 'manual' };
    }
    if (patch.mounting_plate) spec.mounting_plate = { present: Boolean(patch.mounting_plate.present), source: 'manual' };
    if (patch.gland_plate) spec.gland_plate = { present: Boolean(patch.gland_plate.present), source: 'manual' };
    if (patch.base_frame) {
      const height = patch.base_frame.height_mm !== undefined
        ? requireMm(patch.base_frame.height_mm, 'Base frame height')
        : spec.base_frame.height_mm;
      if (height > 400) throw new BadRequestException('Base frame height must be between 100 and 400 mm');
      spec.base_frame = { present: Boolean(patch.base_frame.present), height_mm: height, source: 'manual' };
    }
    if (patch.wire_troughs) {
      const count = Math.round(Number(patch.wire_troughs.count));
      if (!Number.isFinite(count) || count < 0 || count > 6) throw new BadRequestException('Wire trough count must be 0–6');
      spec.wire_troughs = { count, source: 'manual' };
    }
    if (patch.terminal_rows) {
      const count = Math.round(Number(patch.terminal_rows.count));
      if (!Number.isFinite(count) || count < 0 || count > 5) throw new BadRequestException('Terminal row count must be 0–5');
      spec.terminal_rows = { count, source: 'manual' };
    }
    if (patch.components) {
      if (!Array.isArray(patch.components) || patch.components.length > 60) {
        throw new BadRequestException('Components must be a list of at most 60 items');
      }
      spec.components = patch.components.map((c, i) => {
        const label = sanitizeLabel(c.label);
        if (!label) throw new BadRequestException(`Component ${i + 1} needs a label`);
        return {
          id: `cmp_${i + 1}`,
          label,
          type: COMPONENT_TYPE_WHITELIST.has(String(c.type)) ? String(c.type) : 'device',
          source: 'manual' as const,
          position: 'placeholder' as const,
        };
      });
    }

    const now = new Date().toISOString();
    const notes = sanitizeNotes(patch.verification_notes);
    const corrected: PanelGeneratedModel = {
      ...model,
      id: `pm_${crypto.randomUUID()}`,
      revision: PanelModelStore.nextRevision(projectCode, frameId),
      status: 'generating_model',
      spec,
      placeholders: [],
      model_file: null,
      created_at: now,
      updated_at: now,
      stages: [{ stage: 'generating_model', at: now, detail: `Supervisor-verified manual specification entered by ${user.full_name || user.username}` }],
      status_message: undefined,
      converted_by: user.id,
      converted_by_name: user.full_name || user.username,
      conversion_started_at: now,
      conversion_completed_at: null,
      manual_entry: {
        source: 'supervisor_verified_manual',
        entered_by: user.id,
        entered_by_name: user.full_name || user.username,
        entered_at: now,
        prior_automatic_confidence: model.extraction.confidence,
        corrected_from_model_id: model.id,
        corrected_from_revision: model.revision,
        ...(notes ? { verification_notes: notes } : {}),
      },
      verified_by: null,
      verified_by_name: '',
      approved_at: null,
      assumptions_acknowledged: false,
      assumptions_acknowledged_by: null,
      assumptions_acknowledged_by_name: '',
      assumptions_acknowledged_at: null,
      verification_notes: notes || undefined,
      superseded_by: null,
      superseded_at: null,
      superseded_from_status: undefined,
      superseded_status_message: undefined,
    };
    const generated = this.generateInto(corrected);
    PanelModelStore.supersedeActive(
      projectCode,
      frameId,
      generated.record.id,
      `Superseded by supervisor-corrected model revision ${generated.record.revision}`,
    );
    PanelModelStore.persist(generated.record, generated.glb);
    return this.getPanelModels(projectCode, frameId, user);
  }

  async approve(
    projectCode: string,
    frameId: string,
    modelId: string,
    user: User,
    expectedPackageRevision?: number,
    assumptionsAcknowledged = false,
    verificationNotes?: string,
  ) {
    this.assertSupervisor(user);
    await this.assertProjectActive(projectCode);
    this.frameOrThrow(projectCode, frameId);
    const pkg = this.packageOrThrow(projectCode, frameId);
    this.assertPackageRevision(expectedPackageRevision, pkg.revision);
    const model = PanelModelStore.find(projectCode, frameId, modelId);
    if (!model) throw new NotFoundException('Generated model not found for this panel');
    const latest = PanelModelStore.list(projectCode, frameId)[0];
    if (!latest || latest.id !== model.id) throw new ConflictException('Only the latest model revision can be approved');
    if (model.status !== 'verification_required') {
      throw new ConflictException(`A model in status "${model.status}" cannot be approved`);
    }
    if (model.source_package_revision !== pkg.revision) {
      throw new ConflictException('The 2D drawing changed after this model was generated — regenerate before approving');
    }
    if (!model.model_file || !PanelModelStore.getGlb(projectCode, frameId, model.id)) {
      throw new ConflictException('This model revision has no generated geometry and cannot be approved');
    }
    if (model.placeholders.length > 0 && assumptionsAcknowledged !== true) {
      throw new BadRequestException(
        `Acknowledge all ${model.placeholders.length} declared assumption(s) before approving this model`,
      );
    }
    const now = new Date().toISOString();
    const notes = sanitizeNotes(verificationNotes) || model.verification_notes;
    const acknowledged = model.placeholders.length > 0;
    const approved: PanelGeneratedModel = {
      ...model,
      status: 'approved',
      status_message: acknowledged
        ? `Approved after the supervisor acknowledged ${model.placeholders.length} declared assumption(s).`
        : 'Approved.',
      verified_by: user.id,
      verified_by_name: user.full_name || user.username,
      approved_at: now,
      assumptions_acknowledged: acknowledged,
      assumptions_acknowledged_by: acknowledged ? user.id : null,
      assumptions_acknowledged_by_name: acknowledged ? user.full_name || user.username : '',
      assumptions_acknowledged_at: acknowledged ? now : null,
      verification_notes: notes,
      updated_at: now,
      stages: [...model.stages, { stage: 'approved', at: now, detail: `Approved by ${user.full_name || user.username}` }],
    };
    PanelModelStore.persist(approved);
    return this.getPanelModels(projectCode, frameId, user);
  }

  private async readLatestCadManifest(projectCode: string, frameId: string): Promise<Record<string, unknown> | null> {
    if (!this.flat3d) return null;
    const meta = await this.flat3d.getLatestRun(projectCode, frameId);
    if (!meta?.runDir) return null;
    const manifestPath = path.join(meta.runDir, 'out', 'manifest.json');
    if (!fs.existsSync(manifestPath)) return null;
    try {
      return JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as Record<string, unknown>;
    } catch {
      return null;
    }
  }

  private collectDrawingSources(projectCode: string, frameId: string, pkg: ReturnType<typeof FrameStore.getDrawingPackage>) {
    const diskRows = FrameStore.listDrawingsFromDisk(projectCode).filter(d => d.frame_id === frameId && (d.kind ?? 'unknown') !== '3d');
    const sourceRows = [
      ...(pkg?.drawing_2d ? [{ id: pkg.drawing_2d.id, original_name: pkg.drawing_2d.original_name }] : []),
      ...diskRows.map(d => ({ id: d.id, original_name: d.original_name })),
    ];
    const seen = new Set<string>();
    const sources: Array<{ id: string; original_name: string; buffer: Buffer }> = [];
    for (const row of sourceRows) {
      if (seen.has(row.id)) continue;
      seen.add(row.id);
      const file = FrameStore.getDrawingFile(projectCode, row.id);
      if (!file) continue;
      sources.push({ id: row.id, original_name: row.original_name, buffer: file.buffer });
    }
    return sources;
  }

  private patchFromAutoExtract(extract: AutoExtractResult): PanelModelSpecPatch {
    const f = extract.form;
    const patch: PanelModelSpecPatch = { package_revision: undefined };
    if (f.width_mm != null && f.height_mm != null && f.depth_mm != null) {
      patch.enclosure = { width_mm: f.width_mm, height_mm: f.height_mm, depth_mm: f.depth_mm };
    }
    if (f.doors != null) patch.doors = { count: f.doors };
    if (f.mounting_plate !== null) patch.mounting_plate = { present: f.mounting_plate };
    if (f.gland_plate !== null) patch.gland_plate = { present: f.gland_plate };
    if (f.base_frame !== null) {
      patch.base_frame = {
        present: f.base_frame,
        ...(f.base_frame && f.base_frame_height_mm != null ? { height_mm: f.base_frame_height_mm } : {}),
      };
    }
    if (f.wire_troughs != null) patch.wire_troughs = { count: f.wire_troughs };
    if (f.terminal_rows != null) patch.terminal_rows = { count: f.terminal_rows };
    if (f.components.length) {
      patch.components = f.components.map(c => ({ label: c.label, type: c.type }));
    }
    patch.verification_notes = `Auto Extract & Fill (${new Date().toISOString()}). Review confidence markers before approval.`;
    return patch;
  }

  /** Scan all panel 2D sources (full PDF / CAD manifest), populate extract result, optional regenerate. */
  async autoExtractAndFill(
    projectCode: string,
    frameId: string,
    user: User,
    expectedPackageRevision?: number,
    opts: { regenerate?: boolean } = {},
  ): Promise<{ extract: AutoExtractResult; model?: Awaited<ReturnType<PanelModelService['getPanelModels']>> }> {
    this.assertSupervisor(user);
    await this.assertProjectActive(projectCode);
    const frame = this.frameOrThrow(projectCode, frameId);
    const pkg = this.packageOrThrow(projectCode, frameId);
    if (!pkg.drawing_2d) throw new BadRequestException('Upload a 2D drawing before auto extract');
    this.assertPackageRevision(expectedPackageRevision, pkg.revision);

    const sources = this.collectDrawingSources(projectCode, frameId, pkg);
    if (!sources.length) throw new BadRequestException('Drawing files are missing on disk — re-upload the panel drawing.');

    const cadManifest = await this.readLatestCadManifest(projectCode, frameId);
    const extract = runAutoExtract({ sources, cables: frame.cables ?? [], cadManifest });

    let modelView: Awaited<ReturnType<PanelModelService['getPanelModels']>> | undefined;
    if (opts.regenerate && extract.auto_fix.can_regenerate) {
      const primaryCad = pkg.drawing_2d && /\.(dwg|dxf)$/i.test(pkg.drawing_2d.original_name);
      if (primaryCad && this.flat3d) {
        modelView = await this.convert(projectCode, frameId, user, pkg.revision);
      } else {
        const current = PanelModelStore.list(projectCode, frameId)[0];
        const patch = this.patchFromAutoExtract(extract);
        patch.package_revision = pkg.revision;
        if (current && (current.status === 'verification_required' || current.status === 'conversion_failed')) {
          modelView = await this.updateSpec(projectCode, frameId, current.id, patch, user, pkg.revision);
        } else if (!current) {
          modelView = await this.convert(projectCode, frameId, user, pkg.revision);
          const after = PanelModelStore.list(projectCode, frameId)[0];
          if (after && after.status === 'conversion_failed' && patch.enclosure) {
            modelView = await this.updateSpec(projectCode, frameId, after.id, patch, user, pkg.revision);
          }
        }
      }
    }

    return { extract, ...(modelView ? { model: modelView } : {}) };
  }

  async autoFix(
    projectCode: string,
    frameId: string,
    user: User,
    expectedPackageRevision?: number,
  ): Promise<{ extract: AutoExtractResult; fixes?: string[] }> {
    const { extract: raw } = await this.autoExtractAndFill(projectCode, frameId, user, expectedPackageRevision, { regenerate: false });
    const { extract, fixes } = applySafeAutoFixes(raw);
    return { extract, fixes };
  }

  private async buildWorkflowDiagnose(
    projectCode: string,
    frameId: string,
    user: User,
    expectedPackageRevision?: number,
    extractOverride?: AutoExtractResult | null,
  ): Promise<WorkflowDiagnoseResult> {
    this.assertSupervisor(user);
    const pkg = this.packageOrThrow(projectCode, frameId);
    if (expectedPackageRevision !== undefined) this.assertPackageRevision(expectedPackageRevision, pkg.revision);
    const extract = extractOverride ?? (await this.autoExtractAndFill(projectCode, frameId, user, pkg.revision, { regenerate: false })).extract;
    const meta = this.flat3d ? await this.flat3d.getLatestRun(projectCode, frameId) : null;
    const artifacts = readFlat3dArtifacts(meta?.runDir ?? null);
    const current = PanelModelStore.list(projectCode, frameId)[0];
    const isPdf = /\.pdf$/i.test(pkg.drawing_2d?.original_name ?? '');
    return runWorkflowDiagnose({
      packageRevision: pkg.revision,
      drawingSha256: pkg.drawing_2d?.sha256 ?? null,
      drawingName: pkg.drawing_2d?.original_name ?? '',
      extract,
      flat3dMeta: meta,
      artifacts,
      modelHasGlb: Boolean(current?.model_file && PanelModelStore.getGlb(projectCode, frameId, current.id)),
      modelStatus: current?.status ?? null,
      isPdf,
    });
  }

  async workflowDiagnose(
    projectCode: string,
    frameId: string,
    user: User,
    expectedPackageRevision?: number,
  ): Promise<WorkflowDiagnoseResult> {
    await this.assertProjectActive(projectCode);
    this.frameOrThrow(projectCode, frameId);
    return this.buildWorkflowDiagnose(projectCode, frameId, user, expectedPackageRevision);
  }

  async workflowExtractGenerate(
    projectCode: string,
    frameId: string,
    user: User,
    expectedPackageRevision?: number,
  ) {
    return this.autoExtractAndFill(projectCode, frameId, user, expectedPackageRevision, { regenerate: true });
  }

  async workflowFixSafe(
    projectCode: string,
    frameId: string,
    user: User,
    expectedPackageRevision?: number,
  ) {
    const { extract: raw } = await this.autoExtractAndFill(projectCode, frameId, user, expectedPackageRevision, { regenerate: false });
    const { extract, fixes } = applySafeAutoFixes(raw);
    const diagnose = await this.buildWorkflowDiagnose(projectCode, frameId, user, expectedPackageRevision, extract);
    return { extract, fixes, diagnose };
  }

  async workflowValidate(
    projectCode: string,
    frameId: string,
    user: User,
    expectedPackageRevision?: number,
  ) {
    await this.assertProjectActive(projectCode);
    this.assertSupervisor(user);
    const pkg = this.packageOrThrow(projectCode, frameId);
    this.assertPackageRevision(expectedPackageRevision, pkg.revision);
    const current = PanelModelStore.list(projectCode, frameId)[0];
    if (!current?.model_file) {
      throw new BadRequestException('No generated model to validate — run Auto Extract & Generate first.');
    }
    const buffer = PanelModelStore.getGlb(projectCode, frameId, current.id);
    if (!buffer) throw new BadRequestException('Model GLB missing from storage.');
    const structural = validateGlbBuffer(buffer);
    const diagnose = await this.buildWorkflowDiagnose(projectCode, frameId, user, pkg.revision);
    return {
      structural,
      diagnose,
      ready_for_approval: structural.ok && diagnose.verdict !== 'FAIL' && current.status === 'verification_required',
    };
  }
}
