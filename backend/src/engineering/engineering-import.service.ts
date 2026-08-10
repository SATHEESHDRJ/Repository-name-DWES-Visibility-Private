import { Injectable, BadRequestException, ForbiddenException, NotFoundException, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { FrameStore } from '../frames/frame-store';
import { MockStore } from '../data/mock-store';
import {
  validatePackage,
  matchAgainstSchedule,
  normalizeRef,
  terminalRef,
  type EngineeringPackage,
  type PackageValidationResult,
} from './package-validation';

/**
 * Engineering geometry import workflow:
 *
 *   Chennai package → validate → import (DRAFT) → review mappings → approve → publish
 *
 * Safety model:
 *  - A failed validation never writes anything.
 *  - Imports are DRAFTS (`approval_status: pending_review`, `published_at: null`).
 *    The technician Digital Twin only ever consumes PUBLISHED models, so importing
 *    can never change what technicians see.
 *  - Approval/publication is restricted to supervisor/admin and re-validates the
 *    mapping completeness server-side.
 */
@Injectable()
export class EngineeringImportService {
  private readonly logger = new Logger(EngineeringImportService.name);

  constructor(private readonly prisma: PrismaService) {}

  /** Wiring-schedule ends (device:terminal per row end) for match reporting. */
  private scheduleEnds(projectCode: string, frameId: string): Array<{ device: string; terminal: string }> {
    const frame = MockStore.findFrameByProjectAndId(projectCode, frameId)
      ?? FrameStore.getFrameFromDisk(projectCode, frameId);
    const cables: any[] = Array.isArray(frame?.cables) ? frame!.cables : [];
    const ends: Array<{ device: string; terminal: string }> = [];
    for (const c of cables) {
      const push = (device?: string, terminal?: string, combined?: string) => {
        if (device && terminal) { ends.push({ device, terminal }); return; }
        const combo = String(combined ?? '').trim();
        // Combined "DEVICE:TERMINAL" reference — split on the LAST colon so device
        // tags containing ':' keep their structure.
        const idx = combo.lastIndexOf(':');
        if (idx > 0) ends.push({ device: combo.slice(0, idx), terminal: combo.slice(idx + 1) });
      };
      push(c.source_device, c.source_terminal, c.source);
      push(c.dest_device, c.dest_terminal, c.destination);
    }
    return ends;
  }

  /** Dry-run: validation + schedule matching, no writes. */
  validateOnly(pkg: unknown, projectCode: string, frameId: string): PackageValidationResult {
    const result = validatePackage(pkg);
    if (result.valid) {
      result.scheduleMatch = matchAgainstSchedule(
        pkg as EngineeringPackage,
        this.scheduleEnds(projectCode, frameId),
      );
    }
    return result;
  }

  /**
   * Import a validated package as a DRAFT model revision. The route params are
   * authoritative for project/panel ownership — a package whose own ids disagree
   * is rejected (no cross-panel imports).
   */
  async importPackage(pkg: unknown, projectCode: string, frameId: string, userId: number) {
    const result = validatePackage(pkg);
    if (!result.valid) {
      throw new BadRequestException({
        message: 'Engineering package failed validation — nothing was imported.',
        issues: result.issues,
      });
    }
    const p = pkg as EngineeringPackage;
    if (p.project_code !== projectCode || p.frame_id !== frameId) {
      throw new BadRequestException('Package project/panel does not match the import target.');
    }
    const frame = MockStore.findFrameByProjectAndId(projectCode, frameId)
      ?? FrameStore.getFrameFromDisk(projectCode, frameId);
    if (!frame) throw new NotFoundException(`Panel ${frameId} not found in project ${projectCode}`);

    // Duplicate revision guard: a draft or published model with the same revision
    // for this panel must not be silently replaced.
    const existing = await this.prisma.panel_models.findFirst({
      where: { project_code: projectCode, frame_id: frameId, model_revision: p.model_revision },
    });
    if (existing) {
      throw new BadRequestException(
        `Model revision "${p.model_revision}" already exists for this panel (id ${existing.id}, status ${existing.approval_status}). Use a new revision.`,
      );
    }

    const scheduleMatch = matchAgainstSchedule(p, this.scheduleEnds(projectCode, frameId));

    const created = await this.prisma.$transaction(async tx => {
      const model = await tx.panel_models.create({
        data: {
          project_code: projectCode,
          frame_id: frameId,
          model_revision: p.model_revision,
          model_format: 'structured-json',
          units: p.units,
          width: p.panel.width,
          height: p.panel.height,
          depth: p.panel.depth,
          processing_status: 'imported',
          validation_status: 'unvalidated',
          approval_status: 'pending_review',
          published_at: null,
        },
      });

      for (const d of p.devices) {
        const device = await tx.device_geometries.create({
          data: {
            panel_model_id: model.id,
            device_tag: d.device_tag,
            normalized_device_tag: normalizeRef(d.device_tag),
            device_type: d.device_type ?? null,
            manufacturer: d.manufacturer ?? null,
            model: d.model ?? null,
            x: d.x, y: d.y, z: d.z,
            width: d.width ?? null, height: d.height ?? null, depth: d.depth ?? null,
            rotation_x: d.rotation_x ?? 0, rotation_y: d.rotation_y ?? 0, rotation_z: d.rotation_z ?? 0,
            layer: d.layer ?? null,
            block_reference: d.block_reference ?? null,
            validation_status: 'unvalidated',
          },
        });
        for (const t of d.terminals ?? []) {
          await tx.terminal_geometries.create({
            data: {
              device_geometry_id: device.id,
              terminal_block: t.terminal_block ?? null,
              terminal_number: t.terminal_number,
              normalized_terminal_reference: terminalRef(d.device_tag, t.terminal_number),
              x: t.x, y: t.y, z: t.z,
              direction: t.direction ?? null,
              drawing_sheet: t.drawing_sheet ?? null,
              drawing_element_reference: t.drawing_element_reference ?? null,
              validation_status: 'unvalidated',
            },
          });
        }
      }

      const nodeIdByIdentifier = new Map<string, number>();
      for (const n of p.duct_nodes ?? []) {
        const node = await tx.duct_nodes.create({
          data: {
            panel_model_id: model.id,
            duct_identifier: n.duct_identifier,
            x: n.x, y: n.y, z: n.z,
            node_type: n.node_type ?? null,
          },
        });
        nodeIdByIdentifier.set(normalizeRef(n.duct_identifier), node.id);
      }
      for (const s of p.duct_segments ?? []) {
        const src = nodeIdByIdentifier.get(normalizeRef(s.source));
        const dst = nodeIdByIdentifier.get(normalizeRef(s.destination));
        if (src == null || dst == null) continue; // validated above; defensive
        const a = (p.duct_nodes ?? []).find(n => normalizeRef(n.duct_identifier) === normalizeRef(s.source))!;
        const b = (p.duct_nodes ?? []).find(n => normalizeRef(n.duct_identifier) === normalizeRef(s.destination))!;
        const length = Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2 + (a.z - b.z) ** 2);
        await tx.duct_segments.create({
          data: {
            panel_model_id: model.id,
            source_node_id: src,
            destination_node_id: dst,
            length,
            width: s.width ?? null, height: s.height ?? null, capacity: s.capacity ?? null,
            direction: s.direction ?? 'bidirectional',
            routing_restriction: s.routing_restriction ?? null,
            enabled: true,
          },
        });
      }
      return model;
    });

    this.logger.log(`Engineering package imported as DRAFT model ${created.id} (rev ${p.model_revision}) for ${projectCode}/${frameId} by user ${userId}`);
    return {
      model_id: created.id,
      model_revision: p.model_revision,
      approval_status: 'pending_review',
      published: false,
      device_count: result.deviceCount,
      terminal_count: result.terminalCount,
      duct_node_count: result.ductNodeCount,
      duct_segment_count: result.ductSegmentCount,
      schedule_match: scheduleMatch,
      issues: result.issues,
    };
  }

  /** Mapping-review summary for a draft (or published) model. */
  async reviewSummary(modelId: number) {
    const model = await this.prisma.panel_models.findUnique({ where: { id: modelId } });
    if (!model) throw new NotFoundException(`Model ${modelId} not found`);
    const devices = await this.prisma.device_geometries.findMany({
      where: { panel_model_id: model.id },
      select: { id: true, device_tag: true, normalized_device_tag: true },
    });
    const terminals = devices.length > 0
      ? await this.prisma.terminal_geometries.findMany({
          where: { device_geometry_id: { in: devices.map(d => d.id) } },
          select: { normalized_terminal_reference: true },
        })
      : [];
    const [ductNodes, ductSegments] = await Promise.all([
      this.prisma.duct_nodes.count({ where: { panel_model_id: model.id } }),
      this.prisma.duct_segments.count({ where: { panel_model_id: model.id } }),
    ]);

    const available = new Set(terminals.map(t => t.normalized_terminal_reference));
    const ends = this.scheduleEnds(model.project_code, model.frame_id);
    const unmatched = [...new Set(
      ends.map(e => terminalRef(e.device, e.terminal)).filter(ref => !available.has(ref)),
    )];

    return {
      model_id: model.id,
      project_code: model.project_code,
      frame_id: model.frame_id,
      model_revision: model.model_revision,
      approval_status: model.approval_status,
      published: Boolean(model.published_at),
      devices: devices.length,
      terminals: terminals.length,
      duct_nodes: ductNodes,
      duct_segments: ductSegments,
      schedule_ends: ends.length,
      matched_ends: ends.length - unmatched.length,
      unmatched_refs: unmatched.slice(0, 50),
    };
  }

  /**
   * Approve + publish a draft revision. Requires supervisor/admin. Publishing a
   * new revision marks previously published revisions of the same panel as
   * superseded — never deletes them (revision history is preserved).
   */
  async approveAndPublish(modelId: number, approver: { id: number; role: string }) {
    if (approver.role !== 'prod_supervisor' && approver.role !== 'system_admin') {
      throw new ForbiddenException('Only a Production Supervisor or System Admin can approve and publish engineering models');
    }
    const model = await this.prisma.panel_models.findUnique({ where: { id: modelId } });
    if (!model) throw new NotFoundException(`Model ${modelId} not found`);
    if (model.published_at) throw new BadRequestException('This revision is already published.');

    const summary = await this.reviewSummary(modelId);
    if (summary.devices === 0 || summary.terminals === 0) {
      throw new BadRequestException('Cannot publish a model without device and terminal geometry.');
    }

    const now = new Date();
    await this.prisma.$transaction(async tx => {
      await tx.panel_models.updateMany({
        where: {
          project_code: model.project_code,
          frame_id: model.frame_id,
          published_at: { not: null },
          id: { not: model.id },
        },
        data: { approval_status: 'superseded' },
      });
      await tx.panel_models.update({
        where: { id: model.id },
        data: {
          validation_status: 'validated',
          approval_status: 'approved',
          published_at: now,
        },
      });
    });
    this.logger.log(`Engineering model ${modelId} (rev ${model.model_revision}) approved+published for ${model.project_code}/${model.frame_id} by user ${approver.id}`);
    return {
      model_id: modelId,
      approval_status: 'approved',
      published: true,
      published_at: now,
      schedule_match: { total: summary.schedule_ends, matched: summary.matched_ends, unmatched: summary.unmatched_refs },
    };
  }

  /**
   * List engineering model revisions for a panel (drafts + published + superseded).
   * Used by the Supervisor 3D Model workspace; technicians never call this.
   */
  async listModelsForPanel(projectCode: string, frameId: string) {
    const rows = await this.prisma.panel_models.findMany({
      where: { project_code: projectCode, frame_id: frameId },
      orderBy: [{ published_at: 'desc' }, { id: 'desc' }],
      select: {
        id: true,
        model_revision: true,
        model_format: true,
        model_storage_path: true,
        processing_status: true,
        validation_status: true,
        approval_status: true,
        published_at: true,
        width: true,
        height: true,
        depth: true,
        units: true,
        confirmed_at: true,
      },
    });

    const enriched = await Promise.all(rows.map(async row => {
      const devices = await this.prisma.device_geometries.count({ where: { panel_model_id: row.id } });
      const deviceRows = devices > 0
        ? await this.prisma.device_geometries.findMany({
            where: { panel_model_id: row.id },
            select: { id: true },
          })
        : [];
      const terminals = deviceRows.length > 0
        ? await this.prisma.terminal_geometries.count({
            where: { device_geometry_id: { in: deviceRows.map(d => d.id) } },
          })
        : 0;
      return {
        model_id: row.id,
        model_revision: row.model_revision,
        model_format: row.model_format,
        has_engineering_file: Boolean(row.model_storage_path),
        processing_status: row.processing_status,
        validation_status: row.validation_status,
        approval_status: row.approval_status,
        published: Boolean(row.published_at),
        published_at: row.published_at,
        created_at: row.confirmed_at,
        panel: { width: row.width, height: row.height, depth: row.depth, units: row.units },
        devices,
        terminals,
      };
    }));

    const published = enriched.find(r => r.published && r.approval_status === 'approved') ?? null;
    const draft = enriched.find(r => !r.published && r.approval_status === 'pending_review') ?? null;

    return {
      project_code: projectCode,
      frame_id: frameId,
      published,
      draft,
      revisions: enriched,
    };
  }
}
