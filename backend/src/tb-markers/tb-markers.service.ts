import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import type { User } from '../data/mock-store';
import { PrismaService } from '../prisma/prisma.service';
import { assertTechnicianAssignedToFrame } from '../common/technician-panel-access.helper';
import {
  formatTerminalRange,
  isTerminalInRange,
  normalizeDeviceName,
  parseTerminalRange,
  type ParsedTerminalRange,
} from './terminal-range';

export type TbMarkerType = 'SOURCE_GROUP' | 'DESTINATION_GROUP' | 'TB_GROUP';

export type TbMarkerGeometry = {
  x: number;
  y: number;
  width: number;
  height: number;
  rotation?: number;
};

type TbMarkerGeometryInput = Partial<TbMarkerGeometry> & {
  x?: unknown;
  y?: unknown;
  width?: unknown;
  height?: unknown;
  rotation?: unknown;
};

type CreateTbMarkerBody = {
  project_code: string;
  frame_id: string;
  drawing_asset_id?: number | null;
  page_number?: number;
  view_name?: string | null;
  marker_type: TbMarkerType | string;
  tb_number: string;
  terminal_group: string;
  geometry: TbMarkerGeometryInput;
  notes?: string | null;
  /**
   * When a near-duplicate is detected, the backend can require confirmation.
   * Phase TB1 expects the client to re-submit with this flag set.
   */
  confirm_near_duplicate?: boolean;
  /** Optional reason/comment for audit history. */
  reason?: string | null;
};

type UpdateTbMarkerBody = Partial<CreateTbMarkerBody> & {
  geometry?: TbMarkerGeometryInput;
  marker_type?: TbMarkerType | string;
  tb_number?: string;
  terminal_group?: string;
};

type Rect = { x1: number; y1: number; x2: number; y2: number };

function rectFromGeometry(geom: TbMarkerGeometry): Rect {
  const x1 = geom.x;
  const y1 = geom.y;
  const x2 = geom.x + geom.width;
  const y2 = geom.y + geom.height;
  return { x1, y1, x2, y2 };
}

function iou(a: Rect, b: Rect): number {
  const ix1 = Math.max(a.x1, b.x1);
  const iy1 = Math.max(a.y1, b.y1);
  const ix2 = Math.min(a.x2, b.x2);
  const iy2 = Math.min(a.y2, b.y2);
  const iw = Math.max(0, ix2 - ix1);
  const ih = Math.max(0, iy2 - iy1);
  const inter = iw * ih;
  const areaA = Math.max(0, a.x2 - a.x1) * Math.max(0, a.y2 - a.y1);
  const areaB = Math.max(0, b.x2 - b.x1) * Math.max(0, b.y2 - b.y1);
  const union = areaA + areaB - inter;
  if (union <= 0) return 0;
  return inter / union;
}

function validateNormalizedGeometry(input: TbMarkerGeometryInput): TbMarkerGeometry {
  const x = Number((input as any)?.x);
  const y = Number((input as any)?.y);
  const width = Number((input as any)?.width);
  const height = Number((input as any)?.height);
  const rotationNum = input.rotation == null ? 0 : Number(input.rotation);

  if (![x, y, width, height].every(v => Number.isFinite(v))) {
    throw new BadRequestException('Invalid geometry.');
  }
  if (width <= 0 || height <= 0) {
    throw new BadRequestException('Geometry must have a non-zero area.');
  }

  const eps = 1e-9;
  if (x < 0 - eps || x > 1 + eps || y < 0 - eps || y > 1 + eps) {
    throw new BadRequestException('Geometry x/y must be within [0..1].');
  }
  if (width < 0 - eps || width > 1 + eps || height < 0 - eps || height > 1 + eps) {
    throw new BadRequestException('Geometry width/height must be within [0..1].');
  }

  if (x + width > 1 + eps || y + height > 1 + eps) {
    throw new BadRequestException('Geometry must be within page bounds.');
  }

  const rotation = Number.isFinite(rotationNum) ? rotationNum : 0;
  return { x, y, width, height, rotation };
}

function validateMarkerType(v: string): TbMarkerType | null {
  const s = String(v || '').toUpperCase();
  if (s === 'SOURCE_GROUP') return 'SOURCE_GROUP';
  if (s === 'DESTINATION_GROUP') return 'DESTINATION_GROUP';
  if (s === 'TB_GROUP') return 'TB_GROUP';
  return null;
}

function canonicalizeTerminalGroup(terminalGroup: string): string {
  // Keep meaning stable: normalize separators/spaces so duplicates compare correctly.
  // If parsing fails, formatTerminalRange will return a normalized "named" string.
  return formatTerminalRange(terminalGroup);
}

function normalizeTbNumber(tbNumber: string): string {
  return normalizeDeviceName(tbNumber);
}

async function findNearDuplicates({
  prisma,
  where,
  geometry,
  excludeMarkerId,
}: {
  prisma: PrismaService;
  where: {
    project_code: string;
    frame_id: string;
    marker_type: TbMarkerType;
    tb_number: string;
    terminal_group: string;
    page_number: number;
    drawing_asset_id?: number | null;
  };
  geometry: TbMarkerGeometry;
  excludeMarkerId?: number;
}): Promise<Array<{ id: number }>> {
  // Candidate reduction: identity fields must match; IoU decides "near duplicate".
  const candidates = await prisma.tb_markers.findMany({
    where: {
      project_code: where.project_code,
      frame_id: where.frame_id,
      marker_type: where.marker_type,
      tb_number: where.tb_number,
      terminal_group: where.terminal_group,
      page_number: where.page_number,
      drawing_asset_id: where.drawing_asset_id ?? null,
      ...(excludeMarkerId != null ? { id: { not: excludeMarkerId } } : {}),
    },
    select: { id: true, geometry: true },
  });
  const rect = rectFromGeometry(geometry);

  const scored = candidates
    .map(c => {
      const g = c.geometry as any;
      const parsed = validateNormalizedGeometry(g as TbMarkerGeometryInput);
      return { id: c.id, score: iou(rectFromGeometry(parsed), rect) };
    })
    .filter(s => s.score > 0.8)
    .sort((a, b) => b.score - a.score);

  return scored.map(s => ({ id: s.id }));
}

@Injectable()
export class TbMarkersService {
  constructor(private readonly prisma: PrismaService) {}

  private async ensureDrawingAssetBelongsToProjectPanel(drawing_asset_id: number | null | undefined, projectCode: string, frameId: string) {
    if (drawing_asset_id == null) return;
    const asset = await this.prisma.drawing_assets.findUnique({
      where: { id: drawing_asset_id },
      select: { id: true, project_code: true, frame_id: true },
    });
    if (!asset || asset.project_code !== projectCode || asset.frame_id !== frameId) {
      throw new BadRequestException('drawing_asset_id does not belong to the selected project/panel.');
    }
  }

  private async assertAccess(user: User, projectCode: string, frameId: string) {
    // Supervisors can read by scope via query params; technicians must be assigned.
    if (user.role === 'wiring_technician') {
      await assertTechnicianAssignedToFrame(this.prisma, user, projectCode, frameId);
      return;
    }
    // QA/QC and director read-only: no extra isolation beyond project_code/frame_id filter.
  }

  async listMarkers(projectCode: string, frameId: string, user?: User) {
    if (user) await this.assertAccess(user, projectCode, frameId);
    return this.prisma.tb_markers.findMany({
      where: { project_code: projectCode, frame_id: frameId },
      orderBy: { created_at: 'asc' },
    });
  }

  async createMarker(body: CreateTbMarkerBody, user: User) {
    await this.assertAccess(user, body.project_code, body.frame_id);
    if (user.role !== 'prod_supervisor' && user.role !== 'system_admin') {
      // RolesGuard should have blocked this, but keep an explicit service-level guard.
      throw new ForbiddenException('Not authorized to create markers.');
    }

    await this.ensureDrawingAssetBelongsToProjectPanel(body.drawing_asset_id ?? null, body.project_code, body.frame_id);

    const marker_type = validateMarkerType(body.marker_type);
    if (!marker_type) throw new BadRequestException('Invalid marker_type.');

    const page_number = body.page_number == null ? 1 : Number(body.page_number);
    if (!Number.isFinite(page_number) || page_number < 1) throw new BadRequestException('Invalid page_number.');

    if (!body.tb_number || !String(body.tb_number).trim()) throw new BadRequestException('tb_number is required.');
    if (!body.terminal_group || !String(body.terminal_group).trim()) throw new BadRequestException('terminal_group is required.');

    const tb_number = normalizeTbNumber(body.tb_number);
    const terminal_group = canonicalizeTerminalGroup(body.terminal_group);

    const geometry = validateNormalizedGeometry(body.geometry);
    const notes = body.notes ? String(body.notes).slice(0, 500) : null;
    const view_name = body.view_name ? String(body.view_name).slice(0, 50) : null;
    const reason = body.reason ? String(body.reason).slice(0, 500) : null;

    const nearDupes = await findNearDuplicates({
      prisma: this.prisma,
      geometry,
      excludeMarkerId: undefined,
      where: {
        project_code: body.project_code,
        frame_id: body.frame_id,
        marker_type,
        tb_number,
        terminal_group,
        page_number,
        drawing_asset_id: body.drawing_asset_id ?? null,
      },
    });

    if (nearDupes.length > 0 && !body.confirm_near_duplicate) {
      // Client should re-submit with confirm_near_duplicate=true.
      throw new ConflictException({
        code: 'NEAR_DUPLICATE',
        message: 'A near-duplicate TB marker already exists. Confirm to create anyway.',
        near_duplicates: nearDupes,
      });
    }

    const created = await this.prisma.tb_markers.create({
      data: {
        project_code: body.project_code,
        frame_id: body.frame_id,
        drawing_asset_id: body.drawing_asset_id ?? null,
        page_number,
        view_name,
        marker_type,
        tb_number,
        terminal_group,
        geometry,
        notes,
        created_by: user.id,
        updated_by: user.id,
      },
    });

    await this.writeHistory({
      project_code: body.project_code,
      frame_id: body.frame_id,
      event_type: 'tb_marker_created',
      user,
      reason,
      previous_value: null,
      new_value: JSON.stringify(created),
      marker_id: created.id,
    });

    return created;
  }

  async updateMarker(markerId: number, body: UpdateTbMarkerBody, user: User) {
    if (user.role !== 'prod_supervisor' && user.role !== 'system_admin') {
      throw new ForbiddenException('Not authorized to update markers.');
    }

    const existing = await this.prisma.tb_markers.findUnique({ where: { id: markerId } });
    if (!existing) throw new BadRequestException('Marker not found.');

    await this.assertAccess(user, existing.project_code, existing.frame_id);

    const marker_type = body.marker_type != null
      ? validateMarkerType(body.marker_type)
      : validateMarkerType(existing.marker_type);
    if (!marker_type) throw new BadRequestException('Invalid marker_type.');

    const tb_number = body.tb_number != null ? normalizeTbNumber(body.tb_number) : existing.tb_number;
    const terminal_group = body.terminal_group != null ? canonicalizeTerminalGroup(body.terminal_group) : existing.terminal_group;

    const page_number = body.page_number != null ? Number(body.page_number) : existing.page_number;
    if (!Number.isFinite(page_number) || page_number < 1) throw new BadRequestException('Invalid page_number.');

    const view_name = body.view_name !== undefined
      ? (body.view_name == null ? null : String(body.view_name).slice(0, 50))
      : existing.view_name;

    const notes = body.notes !== undefined
      ? (body.notes == null ? null : String(body.notes).slice(0, 500))
      : existing.notes;

    const drawing_asset_id = body.drawing_asset_id !== undefined
      ? (body.drawing_asset_id == null ? null : Number(body.drawing_asset_id))
      : existing.drawing_asset_id;

    await this.ensureDrawingAssetBelongsToProjectPanel(drawing_asset_id, existing.project_code, existing.frame_id);

    const geometry = body.geometry != null ? validateNormalizedGeometry(body.geometry) : existing.geometry as any;

    const reason = body.reason ? String(body.reason).slice(0, 500) : null;
    const confirm_near_duplicate = Boolean(body.confirm_near_duplicate);

    const nearDupes = await findNearDuplicates({
      prisma: this.prisma,
      geometry,
      excludeMarkerId: existing.id,
      where: {
        project_code: existing.project_code,
        frame_id: existing.frame_id,
        marker_type,
        tb_number,
        terminal_group,
        page_number,
        drawing_asset_id: drawing_asset_id ?? null,
      },
    });
    if (nearDupes.length > 0 && !confirm_near_duplicate) {
      throw new ConflictException({
        code: 'NEAR_DUPLICATE',
        message: 'A near-duplicate TB marker already exists. Confirm to update anyway.',
        near_duplicates: nearDupes,
      });
    }

    const prev = existing;
    const updated = await this.prisma.tb_markers.update({
      where: { id: markerId },
      data: {
        project_code: existing.project_code,
        frame_id: existing.frame_id,
        drawing_asset_id: drawing_asset_id ?? null,
        page_number,
        view_name,
        marker_type,
        tb_number,
        terminal_group,
        geometry,
        notes,
        updated_by: user.id,
      },
    });

    // Audit granularity: moved/resized/metadata changed.
    const prevGeom = prev.geometry as any as TbMarkerGeometry;
    const nextGeom = updated.geometry as any as TbMarkerGeometry;
    const moved = prevGeom.x !== nextGeom.x || prevGeom.y !== nextGeom.y;
    const resized = prevGeom.width !== nextGeom.width || prevGeom.height !== nextGeom.height;
    const rotated = (prevGeom.rotation ?? 0) !== (nextGeom.rotation ?? 0);

    const metadataChanged = (
      prev.marker_type !== updated.marker_type
      || prev.tb_number !== updated.tb_number
      || prev.terminal_group !== updated.terminal_group
      || prev.page_number !== updated.page_number
      || (prev.view_name || null) !== (updated.view_name || null)
      || (prev.notes || null) !== (updated.notes || null)
      || (prev.drawing_asset_id || null) !== (updated.drawing_asset_id || null)
    );

    if (moved) {
      await this.writeHistory({
        project_code: updated.project_code,
        frame_id: updated.frame_id,
        event_type: 'tb_marker_moved',
        user,
        reason,
        marker_id: updated.id,
        previous_value: JSON.stringify({ x: prevGeom.x, y: prevGeom.y }),
        new_value: JSON.stringify({ x: nextGeom.x, y: nextGeom.y }),
      });
    }
    if (resized || rotated) {
      await this.writeHistory({
        project_code: updated.project_code,
        frame_id: updated.frame_id,
        event_type: rotated ? 'tb_marker_rotated' : 'tb_marker_resized',
        user,
        reason,
        marker_id: updated.id,
        previous_value: JSON.stringify({
          width: prevGeom.width,
          height: prevGeom.height,
          rotation: prevGeom.rotation ?? 0,
        }),
        new_value: JSON.stringify({
          width: nextGeom.width,
          height: nextGeom.height,
          rotation: nextGeom.rotation ?? 0,
        }),
      });
    }
    if (metadataChanged) {
      await this.writeHistory({
        project_code: updated.project_code,
        frame_id: updated.frame_id,
        event_type: 'tb_marker_metadata_updated',
        user,
        reason,
        marker_id: updated.id,
        previous_value: JSON.stringify({
          marker_type: prev.marker_type,
          tb_number: prev.tb_number,
          terminal_group: prev.terminal_group,
          page_number: prev.page_number,
          view_name: prev.view_name,
          notes: prev.notes,
          drawing_asset_id: prev.drawing_asset_id,
        }),
        new_value: JSON.stringify({
          marker_type: updated.marker_type,
          tb_number: updated.tb_number,
          terminal_group: updated.terminal_group,
          page_number: updated.page_number,
          view_name: updated.view_name,
          notes: updated.notes,
          drawing_asset_id: updated.drawing_asset_id,
        }),
      });
    }

    return updated;
  }

  async deleteMarker(markerId: number, user: User) {
    if (user.role !== 'prod_supervisor' && user.role !== 'system_admin') {
      throw new ForbiddenException('Not authorized to delete markers.');
    }

    const existing = await this.prisma.tb_markers.findUnique({ where: { id: markerId } });
    if (!existing) throw new BadRequestException('Marker not found.');

    await this.writeHistory({
      project_code: existing.project_code,
      frame_id: existing.frame_id,
      event_type: 'tb_marker_deleted',
      user,
      marker_id: existing.id,
      reason: null,
      previous_value: JSON.stringify(existing),
      new_value: null,
    });

    await this.prisma.tb_markers.delete({ where: { id: markerId } });
    return { deleted: true, id: markerId };
  }

  private async writeHistory(input: {
    project_code: string;
    frame_id: string;
    marker_id: number;
    event_type: string;
    previous_value: string | null;
    new_value: string | null;
    user: User;
    reason?: string | null;
  }) {
    await this.prisma.tb_marker_history.create({
      data: {
        marker_id: input.marker_id,
        project_code: input.project_code,
        frame_id: input.frame_id,
        event_type: input.event_type,
        previous_value: input.previous_value ?? null,
        new_value: input.new_value ?? null,
        user_id: input.user.id,
        user_role: input.user.role,
        reason: input.reason ?? null,
      },
    });
  }

  /**
   * Helper: determine if a wire endpoint terminal matches a marker terminal_group.
   * Used by the match service (safe exact + range inclusion only).
   */
  terminalGroupMatches(terminal: string, markerTerminalGroup: string): boolean {
    const parsed = parseTerminalRange(markerTerminalGroup);
    return isTerminalInRange(terminal, parsed);
  }
}

