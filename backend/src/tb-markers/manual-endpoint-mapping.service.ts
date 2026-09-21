/**
 * 2D: Manual Endpoint Mapping — additive JSON sidecar store.
 *
 * Supervisor/Engineering can bind typed identity to a drawn rect on a specific page.
 * Stored as JSON under uploads/manual-endpoint-mappings/<project>/<frame>.json.
 * No DDL required — purely file-based. Technicians read-only.
 */
import { Injectable, Logger, ForbiddenException, BadRequestException } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import type { EndpointKind } from './terminal-range';

export interface ManualEndpointMapping {
  id: string;
  project_code: string;
  frame_id: string;
  /** Page number in the GA drawing */
  page_number: number;
  /** Normalized rect (0–1 coords) drawn by the supervisor */
  geometry: { x: number; y: number; width: number; height: number };
  /** Typed identity classification */
  endpoint_kind: EndpointKind;
  /** Physical identity tag (e.g. X87BZ2, 87STUB, QDC1) */
  identity_tag: string;
  /** Terminal/pin if applicable */
  terminal: string | null;
  /** Connector sub-address if EQUIPMENT_CONNECTOR */
  connector: string | null;
  /** Drawing checksum at time of binding */
  drawing_checksum: string | null;
  /** Drawing revision at time of binding */
  drawing_revision: string | null;
  /** Who created this mapping */
  created_by: number;
  created_at: string;
  /** Optional notes */
  notes: string | null;
}

function uploadsRoot(): string {
  const dir = process.env.UPLOAD_DIR;
  if (dir) {
    return path.isAbsolute(dir) ? dir : path.join(process.cwd(), dir);
  }
  return path.join(process.cwd(), 'uploads');
}

function mappingDir(projectCode: string): string {
  return path.join(uploadsRoot(), 'manual-endpoint-mappings', projectCode);
}

function mappingFile(projectCode: string, frameId: string): string {
  return path.join(mappingDir(projectCode), `${frameId}.json`);
}

@Injectable()
export class ManualEndpointMappingService {
  private readonly logger = new Logger(ManualEndpointMappingService.name);

  /** Read all mappings for a panel (any role). */
  list(projectCode: string, frameId: string): ManualEndpointMapping[] {
    const file = mappingFile(projectCode, frameId);
    if (!fs.existsSync(file)) return [];
    try {
      const data = JSON.parse(fs.readFileSync(file, 'utf8'));
      return Array.isArray(data) ? data : [];
    } catch (err: any) {
      this.logger.warn(`read mapping ${file}: ${err?.message || err}`);
      return [];
    }
  }

  /** Add a new mapping (Supervisor/Engineering only). */
  create(
    input: {
      project_code: string;
      frame_id: string;
      page_number: number;
      geometry: { x: number; y: number; width: number; height: number };
      endpoint_kind: EndpointKind;
      identity_tag: string;
      terminal?: string | null;
      connector?: string | null;
      drawing_checksum?: string | null;
      drawing_revision?: string | null;
      notes?: string | null;
    },
    userId: number,
    userRole: string,
  ): ManualEndpointMapping {
    if (userRole === 'wiring_technician') {
      throw new ForbiddenException('Technicians cannot create manual endpoint mappings.');
    }
    if (!input.identity_tag?.trim()) {
      throw new BadRequestException('identity_tag is required.');
    }
    const g = input.geometry;
    if (
      !Number.isFinite(g?.x) || !Number.isFinite(g?.y)
      || !Number.isFinite(g?.width) || !Number.isFinite(g?.height)
      || g.width <= 0 || g.height <= 0
    ) {
      throw new BadRequestException('geometry {x, y, width, height} must be valid normalized rect.');
    }

    const mapping: ManualEndpointMapping = {
      id: `manual-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      project_code: input.project_code,
      frame_id: input.frame_id,
      page_number: input.page_number || 1,
      geometry: { x: g.x, y: g.y, width: g.width, height: g.height },
      endpoint_kind: input.endpoint_kind,
      identity_tag: input.identity_tag.trim(),
      terminal: input.terminal?.trim() || null,
      connector: input.connector?.trim() || null,
      drawing_checksum: input.drawing_checksum || null,
      drawing_revision: input.drawing_revision || null,
      created_by: userId,
      created_at: new Date().toISOString(),
      notes: input.notes?.trim() || null,
    };

    const existing = this.list(input.project_code, input.frame_id);
    existing.push(mapping);

    const dir = mappingDir(input.project_code);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(mappingFile(input.project_code, input.frame_id), JSON.stringify(existing, null, 2));

    this.logger.log(`Manual mapping created: ${mapping.id} by user ${userId}`);
    return mapping;
  }
}
