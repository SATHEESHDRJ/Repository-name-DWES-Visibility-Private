import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { loadWiringDbTables, wiringTableReady } from '../common/wiring-db-tables';
import { createHash, randomUUID } from 'crypto';
import { distance } from 'fastest-levenshtein';
import { Prisma, type device_geometries, type terminal_geometries } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { FrameStore } from '../frames/frame-store';
import { MockStore, type Cable } from '../data/mock-store';
import { EventsService } from '../events/events.service';
import { CadProviderRegistry } from './cad-conversion.provider';
import { JobQueueService } from './job-queue.service';
import {
  GA_FACES,
  type GaFace,
  type GaViewport,
  type MappingCatalogItemInput,
  type NormalizedRect,
  type SaveMappingCatalogInput,
} from './ga-foundation.types';
import {
  assertNormalizedRect,
  calculateTerminalPoints,
  normalizeDeviceTag,
  normalizeEndpointReference,
  normalizeTerminal,
  parseCombinedEndpoint,
  validateCatalogItems,
} from './ga-mapping.util';

const MAPPING_MODEL_FORMAT = 'ga-mapping-catalog';

function isUuid(value: string | undefined): value is string {
  return !!value && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function jsonRecord(value: Prisma.JsonValue | null | undefined): Record<string, unknown> {
  return value && !Array.isArray(value) && typeof value === 'object' ? value as Record<string, unknown> : {};
}

function stringArray(value: Prisma.JsonValue | null | undefined): string[] {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string') : [];
}

function positiveDimension(value: unknown, label: string): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0 || parsed > 100_000) {
    throw new BadRequestException(`${label} must be a positive dimension no greater than 100000 mm`);
  }
  return parsed;
}

function boundedNumber(value: unknown, label: string, min: number, max: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < min || parsed > max) {
    throw new BadRequestException(`${label} must be between ${min} and ${max}`);
  }
  return parsed;
}

function pngDimensions(buffer: Buffer): { width: number; height: number } {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  if (buffer.length < 24 || !buffer.subarray(0, 8).equals(signature)
      || buffer.subarray(12, 16).toString('ascii') !== 'IHDR') {
    throw new BadRequestException('Selected GA face must be a valid PNG image');
  }
  const width = buffer.readUInt32BE(16);
  const height = buffer.readUInt32BE(20);
  if (width < 1 || height < 1 || width > 4096 || height > 4096 || width * height > 16_777_216) {
    throw new BadRequestException('Selected GA face resolution exceeds the bounded 4096 × 4096 limit');
  }
  return { width, height };
}

interface TerminalCandidate {
  terminal: terminal_geometries;
  device: device_geometries;
  rawReference: string;
  normalizedReference: string;
  normalizedAliases: string[];
}

@Injectable()
export class GaFoundationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jobs: JobQueueService,
    private readonly cadProviders: CadProviderRegistry,
    private readonly events: EventsService,
  ) {
    this.jobs.registerHandler('ga_cad_conversion', context => this.processCadConversion(context));
    this.jobs.registerHandler('ga_schedule_correlation', context => this.processCorrelation(context));
  }

  async getStatus(projectCode: string, frameId: string) {
    this.assertPanel(projectCode, frameId);
    const assetSet = await this.currentAssetSet(projectCode, frameId);
    const [sources, faces, mapping, finalization, cadHealth] = await Promise.all([
      this.listSources(projectCode, frameId),
      assetSet ? this.prisma.ga_faces.findMany({ where: { ga_asset_set_id: assetSet.id }, orderBy: { created_at: 'asc' } }) : [],
      assetSet?.mapping_model_id
        ? this.prisma.panel_models.findFirst({ where: { id: assetSet.mapping_model_id, project_code: projectCode, frame_id: frameId } })
        : null,
      assetSet?.mapping_model_id && assetSet.mapping_revision && assetSet.schedule_revision
        ? this.prisma.ga_correlation_results.groupBy({
            by: ['state', 'review_status'],
            where: {
              project_code: projectCode,
              frame_id: frameId,
              mapping_model_id: assetSet.mapping_model_id,
              mapping_revision: assetSet.mapping_revision,
              schedule_revision: assetSet.schedule_revision,
            },
            _count: { _all: true },
          })
        : [],
      this.cadProviders.healthCheck(),
    ]);
    return {
      asset_set: assetSet,
      sources,
      faces: faces.map(face => ({ ...face, image_storage_path: undefined })),
      mapping,
      finalization,
      schedule_revision: this.scheduleRevision(projectCode, frameId),
      cad_provider: cadHealth,
      fallback: 'OperationalTwin2D',
    };
  }

  async listSources(projectCode: string, frameId: string) {
    const tables = await loadWiringDbTables(this.prisma);
    if (!wiringTableReady(tables, 'drawing_assets')) return [];
    const rows = await this.prisma.drawing_assets.findMany({
      where: { project_code: projectCode, frame_id: frameId, drawing_type: { startsWith: 'ga_' } },
      orderBy: [{ uploaded_at: 'desc' }, { id: 'desc' }],
    });
    return rows.map(row => ({
      id: row.id,
      drawing_id: row.drawing_number,
      face: row.source_face,
      revision: row.revision,
      filename: row.original_filename,
      mime_type: row.mime_type,
      size: row.size,
      sha256: row.sha256,
      approval_status: row.approval_status,
      conversion_job_id: row.conversion_job_id,
      conversion_status: row.conversion_status,
      converter_name: row.converter_name,
      converter_version: row.converter_version,
      conversion_error: row.conversion_error,
      uploaded_by: row.uploaded_by,
      uploaded_at: row.uploaded_at,
      superseded_at: row.superseded_at,
    }));
  }

  async onSourceUploaded(projectCode: string, frameId: string, userId: number) {
    const tables = await loadWiringDbTables(this.prisma);
    if (!wiringTableReady(tables, 'ga_asset_sets') || !wiringTableReady(tables, 'drawing_assets')) {
      throw new NotFoundException('GA Asset Set storage is not available on this database');
    }
    const activeSources = await this.prisma.drawing_assets.findMany({
      where: {
        project_code: projectCode,
        frame_id: frameId,
        drawing_type: { startsWith: 'ga_' },
        superseded_at: null,
      },
      select: { sha256: true, revision: true, source_face: true },
      orderBy: [{ source_face: 'asc' }, { revision: 'asc' }],
    });
    const sourceRevision = createHash('sha256')
      .update(activeSources.map(row => `${row.source_face}:${row.revision}:${row.sha256}`).join('|'))
      .digest('hex');
    const current = await this.currentAssetSet(projectCode, frameId);
    if (current && !current.confirmed_at && current.status !== 'superseded') {
      await this.prisma.$transaction([
        this.prisma.ga_asset_sets.update({
          where: { id: current.id },
          data: {
            source_revision: sourceRevision,
            status: 'draft',
            release_status: 'blocked',
            released_at: null,
            released_by: null,
            invalidated_reason: 'GA source package changed before confirmation',
            updated_by: userId,
          },
        }),
        this.prisma.ga_faces.updateMany({
          where: { ga_asset_set_id: current.id },
          data: { status: 'review_required', confirmed_at: null, confirmed_by: null, updated_by: userId },
        }),
      ]);
      return this.prisma.ga_asset_sets.findUnique({ where: { id: current.id } });
    }

    if (current) {
      await this.prisma.ga_asset_sets.update({
        where: { id: current.id },
        data: {
          status: 'superseded',
          release_status: 'blocked',
          superseded_at: new Date(),
          invalidated_reason: 'GA source revision changed',
          updated_by: userId,
        },
      });
    }
    const revision = await this.prisma.ga_asset_sets.count({ where: { project_code: projectCode, frame_id: frameId } }) + 1;
    const created = await this.prisma.ga_asset_sets.create({
      data: {
        project_code: projectCode,
        frame_id: frameId,
        revision,
        source_revision: sourceRevision,
        created_by: userId,
        updated_by: userId,
        schedule_revision: this.scheduleRevision(projectCode, frameId),
      },
    });
    this.publish(projectCode, frameId, userId);
    return created;
  }

  async queueCadConversion(projectCode: string, frameId: string, drawingAssetId: number, userId: number) {
    const asset = await this.sourceAsset(projectCode, frameId, drawingAssetId);
    if (!/\.dwg$/i.test(asset.original_filename)) throw new BadRequestException('Only DWG sources require conversion');
    const job = await this.jobs.enqueue({
      jobType: 'ga_cad_conversion', projectCode, frameId, requestedBy: userId,
      payload: { drawingAssetId }, maxAttempts: 2,
    });
    await this.prisma.drawing_assets.update({
      where: { id: drawingAssetId },
      data: { conversion_job_id: job.id, conversion_status: 'queued', conversion_error: null },
    });
    return job;
  }

  async saveFaceSelection(input: {
    projectCode: string;
    frameId: string;
    face: GaFace;
    customLabel?: string;
    sourceAssetId: number;
    selectedPage?: number;
    crop: NormalizedRect;
    viewport: GaViewport;
    scale: number;
    image: Buffer;
    userId: number;
  }) {
    if (!GA_FACES.includes(input.face)) throw new BadRequestException('Unsupported GA face');
    if (input.face === 'custom' && !String(input.customLabel ?? '').trim()) {
      throw new BadRequestException('Custom GA faces require a label');
    }
    const assetSet = await this.requireCurrentAssetSet(input.projectCode, input.frameId);
    if (assetSet.confirmed_at) throw new ConflictException('Create a new GA revision before changing a confirmed face');
    const source = await this.sourceAsset(input.projectCode, input.frameId, input.sourceAssetId);
    if (source.superseded_at) throw new ConflictException('The selected GA source revision has been superseded');
    if (/\.pdf$/i.test(source.original_filename)) {
      const page = Number(input.selectedPage);
      if (!Number.isInteger(page) || page < 1 || page > 10_000) throw new BadRequestException('A valid PDF page number is required');
    }
    assertNormalizedRect(input.crop);
    const viewport = {
      width: boundedNumber(input.viewport?.width, 'Viewport width', 1, 20_000),
      height: boundedNumber(input.viewport?.height, 'Viewport height', 1, 20_000),
    };
    const scale = boundedNumber(input.scale, 'Render scale', 0.1, 8);
    const dimensions = pngDimensions(input.image);
    const faceKey = input.face === 'custom' ? `custom-${String(input.customLabel).trim()}` : input.face;
    const imagePath = FrameStore.saveGaFaceImage(input.projectCode, input.frameId, assetSet.id, faceKey, input.image);
    const sha256 = createHash('sha256').update(input.image).digest('hex');
    const existing = await this.prisma.ga_faces.findFirst({
      where: { ga_asset_set_id: assetSet.id, face: input.face, custom_label: input.face === 'custom' ? String(input.customLabel).trim() : null },
      orderBy: { created_at: 'desc' },
    });
    const data = {
      drawing_asset_id: source.id,
      source_revision: source.revision,
      selected_page: input.selectedPage ?? null,
      crop: input.crop as unknown as Prisma.InputJsonValue,
      viewport: viewport as unknown as Prisma.InputJsonValue,
      scale,
      image_storage_path: imagePath,
      image_sha256: sha256,
      image_width: dimensions.width,
      image_height: dimensions.height,
      status: 'draft',
      updated_by: input.userId,
      confirmed_by: null,
      confirmed_at: null,
    };
    const face = existing
      ? await this.prisma.ga_faces.update({ where: { id: existing.id }, data })
      : await this.prisma.ga_faces.create({
          data: {
            ga_asset_set_id: assetSet.id,
            face: input.face,
            custom_label: input.face === 'custom' ? String(input.customLabel).trim().slice(0, 100) : null,
            created_by: input.userId,
            ...data,
          },
        });
    await this.prisma.ga_asset_sets.update({
      where: { id: assetSet.id },
      data: { status: 'draft', release_status: 'blocked', invalidated_reason: 'GA face selection changed', updated_by: input.userId },
    });
    this.publish(input.projectCode, input.frameId, input.userId);
    return { ...face, image_storage_path: undefined };
  }

  async updateDimensions(projectCode: string, frameId: string, body: Record<string, unknown>, userId: number) {
    const assetSet = await this.requireCurrentAssetSet(projectCode, frameId);
    if (assetSet.confirmed_at) throw new ConflictException('Confirmed dimensions are immutable; upload a new source revision first');
    const updated = await this.prisma.ga_asset_sets.update({
      where: { id: assetSet.id },
      data: {
        panel_height: positiveDimension(body.height, 'Panel height'),
        panel_width: positiveDimension(body.width, 'Panel width'),
        panel_depth: positiveDimension(body.depth, 'Panel depth'),
        dimension_unit: 'mm',
        status: 'review_required',
        release_status: 'blocked',
        updated_by: userId,
      },
    });
    this.publish(projectCode, frameId, userId);
    return updated;
  }

  async confirmAssetSet(projectCode: string, frameId: string, userId: number) {
    const assetSet = await this.requireCurrentAssetSet(projectCode, frameId);
    positiveDimension(assetSet.panel_height, 'Panel height');
    positiveDimension(assetSet.panel_width, 'Panel width');
    positiveDimension(assetSet.panel_depth, 'Panel depth');
    const faces = await this.prisma.ga_faces.findMany({ where: { ga_asset_set_id: assetSet.id } });
    if (faces.length === 0) throw new BadRequestException('At least one selected GA face is required');
    const activeSourceIds = new Set((await this.prisma.drawing_assets.findMany({
      where: { project_code: projectCode, frame_id: frameId, drawing_type: { startsWith: 'ga_' }, superseded_at: null },
      select: { id: true },
    })).map(row => row.id));
    if (faces.some(face => !activeSourceIds.has(face.drawing_asset_id))) {
      throw new ConflictException('A selected GA face refers to a superseded source revision');
    }
    const now = new Date();
    await this.prisma.$transaction([
      this.prisma.ga_faces.updateMany({
        where: { ga_asset_set_id: assetSet.id },
        data: { status: 'confirmed', confirmed_by: userId, confirmed_at: now, updated_by: userId },
      }),
      this.prisma.drawing_assets.updateMany({
        where: { id: { in: faces.map(face => face.drawing_asset_id) } },
        data: { approval_status: 'approved', approved_by: userId, approved_at: now },
      }),
      this.prisma.ga_asset_sets.update({
        where: { id: assetSet.id },
        data: {
          status: 'confirmed', confirmed_by: userId, confirmed_at: now,
          release_status: 'blocked', invalidated_reason: 'Mapping and correlation are not finalized', updated_by: userId,
        },
      }),
    ]);
    this.publish(projectCode, frameId, userId);
    return this.requireCurrentAssetSet(projectCode, frameId);
  }

  async saveMappingCatalog(projectCode: string, frameId: string, input: SaveMappingCatalogInput, userId: number) {
    const assetSet = await this.requireCurrentAssetSet(projectCode, frameId);
    if (assetSet.id !== input.gaAssetSetId) throw new ConflictException('GA Asset Set revision has changed');
    if (assetSet.status !== 'confirmed') throw new BadRequestException('Confirm the GA Asset Set and dimensions before mapping');
    validateCatalogItems(input.items);
    const revisionNumber = await this.prisma.panel_models.count({
      where: { project_code: projectCode, frame_id: frameId, model_format: MAPPING_MODEL_FORMAT },
    }) + 1;
    const mappingRevision = `MAP-${revisionNumber}-${createHash('sha256')
      .update(JSON.stringify(input.items.map(item => ({ tag: item.tag, face: item.face, rect: item.rect, terminalBlock: item.terminalBlock }))))
      .digest('hex').slice(0, 12)}`;

    const model = await this.prisma.$transaction(async tx => {
      const created = await tx.panel_models.create({
        data: {
          project_code: projectCode,
          frame_id: frameId,
          model_revision: mappingRevision,
          model_format: MAPPING_MODEL_FORMAT,
          units: 'mm',
          width: assetSet.panel_width,
          height: assetSet.panel_height,
          depth: assetSet.panel_depth,
          processing_status: 'ready_for_review',
          validation_status: 'validated',
          approval_status: 'pending_review',
          ga_asset_set_id: assetSet.id,
          source_ga_revision: assetSet.source_revision,
          mapping_revision: mappingRevision,
          mapping_state: 'draft',
          created_by: userId,
        },
      });
      for (const item of input.items) {
        const stableItemId = isUuid(item.stableItemId) ? item.stableItemId : randomUUID();
        const geometry = this.rectToMillimetres(item, assetSet.panel_width!, assetSet.panel_height!, assetSet.panel_depth!);
        const device = await tx.device_geometries.create({
          data: {
            panel_model_id: created.id,
            device_tag: item.tag.trim(),
            normalized_device_tag: normalizeDeviceTag(item.tag),
            device_type: item.type.trim().slice(0, 100),
            description: String(item.description ?? '').trim().slice(0, 500) || null,
            x: geometry.x, y: geometry.y, z: geometry.z,
            width: geometry.width, height: geometry.height, depth: geometry.depth,
            stable_item_id: stableItemId,
            face: item.face,
            normalized_x: item.rect.x,
            normalized_y: item.rect.y,
            normalized_width: item.rect.width,
            normalized_height: item.rect.height,
            terminal_block_tag: item.terminalBlock?.tag.trim() || null,
            terminal_count: item.terminalBlock?.count ?? null,
            first_terminal_number: item.terminalBlock?.firstTerminalNumber.trim() || null,
            terminal_pitch: item.terminalBlock?.pitch ?? null,
            terminal_orientation: item.terminalBlock?.orientation ?? null,
            terminal_reversed: item.terminalBlock?.reversed ?? false,
            aliases: (item.aliases ?? []) as Prisma.InputJsonValue,
            source_ga_revision: assetSet.source_revision,
            mapping_revision: mappingRevision,
            mapping_state: 'draft',
            validation_status: 'validated',
            created_by: userId,
            updated_by: userId,
          },
        });
        if (item.terminalBlock) {
          const points = calculateTerminalPoints(item.rect, item.terminalBlock);
          for (const point of points) {
            const terminalDeviceTag = item.terminalBlock.tag.trim() || item.tag.trim();
            await tx.terminal_geometries.create({
              data: {
                device_geometry_id: device.id,
                terminal_block: terminalDeviceTag,
                terminal_number: point.terminalNumber,
                normalized_terminal_reference: normalizeEndpointReference(terminalDeviceTag, point.terminalNumber),
                x: point.normalizedX * assetSet.panel_width!,
                y: point.normalizedY * assetSet.panel_height!,
                z: geometry.z,
                direction: item.terminalBlock.orientation === 'horizontal' ? 'TOP' : 'RIGHT',
                mapping_confidence: 1,
                validation_status: 'validated',
                terminal_index: point.terminalIndex,
                face: item.face,
                normalized_x: point.normalizedX,
                normalized_y: point.normalizedY,
                mapping_revision: mappingRevision,
              },
            });
          }
        }
      }
      await tx.ga_asset_sets.update({
        where: { id: assetSet.id },
        data: {
          mapping_model_id: created.id,
          mapping_revision: mappingRevision,
          release_status: 'blocked',
          released_at: null,
          released_by: null,
          invalidated_reason: 'Mapping Catalog revision changed',
          updated_by: userId,
        },
      });
      return created;
    });
    this.publish(projectCode, frameId, userId);
    return this.mappingDetail(projectCode, frameId, model.id);
  }

  async confirmMapping(projectCode: string, frameId: string, modelId: number, userId: number) {
    const assetSet = await this.requireCurrentAssetSet(projectCode, frameId);
    if (assetSet.status !== 'confirmed') throw new BadRequestException('GA Asset Set is not confirmed');
    if (assetSet.mapping_model_id !== modelId) throw new ConflictException('Mapping Catalog revision has changed');
    const model = await this.prisma.panel_models.findFirst({
      where: { id: modelId, project_code: projectCode, frame_id: frameId, ga_asset_set_id: assetSet.id, model_format: MAPPING_MODEL_FORMAT },
    });
    if (!model) throw new NotFoundException('Mapping Catalog not found');
    const deviceCount = await this.prisma.device_geometries.count({ where: { panel_model_id: modelId } });
    if (deviceCount === 0) throw new BadRequestException('Mapping Catalog must contain at least one mapped item');
    const now = new Date();
    await this.prisma.$transaction([
      this.prisma.panel_models.updateMany({
        where: {
          project_code: projectCode, frame_id: frameId, model_format: MAPPING_MODEL_FORMAT,
          id: { not: modelId }, mapping_state: 'confirmed',
        },
        data: { mapping_state: 'superseded', approval_status: 'superseded' },
      }),
      this.prisma.device_geometries.updateMany({
        where: { panel_model_id: modelId },
        data: { mapping_state: 'confirmed', confirmed_by: userId, confirmed_at: now, updated_by: userId },
      }),
      this.prisma.panel_models.update({
        where: { id: modelId },
        data: {
          mapping_state: 'confirmed', approval_status: 'approved', validation_status: 'validated',
          confirmed_by: userId, confirmed_at: now, published_at: now,
        },
      }),
      this.prisma.ga_asset_sets.update({
        where: { id: assetSet.id },
        data: {
          mapping_model_id: modelId,
          mapping_revision: model.mapping_revision,
          release_status: 'blocked',
          schedule_revision: this.scheduleRevision(projectCode, frameId),
          invalidated_reason: 'Correlation must be run for the confirmed mapping',
          updated_by: userId,
        },
      }),
    ]);
    this.publish(projectCode, frameId, userId);
    return this.mappingDetail(projectCode, frameId, modelId);
  }

  async mappingDetail(projectCode: string, frameId: string, modelId?: number) {
    const assetSet = await this.requireCurrentAssetSet(projectCode, frameId);
    const id = modelId ?? assetSet.mapping_model_id;
    if (!id) return null;
    const model = await this.prisma.panel_models.findFirst({ where: { id, project_code: projectCode, frame_id: frameId } });
    if (!model) throw new NotFoundException('Mapping Catalog not found');
    const devices = await this.prisma.device_geometries.findMany({ where: { panel_model_id: id }, orderBy: { id: 'asc' } });
    const terminals = devices.length
      ? await this.prisma.terminal_geometries.findMany({ where: { device_geometry_id: { in: devices.map(device => device.id) } }, orderBy: [{ device_geometry_id: 'asc' }, { terminal_index: 'asc' }] })
      : [];
    return { model, devices, terminals };
  }

  async queueCorrelation(projectCode: string, frameId: string, userId: number) {
    const assetSet = await this.requireCurrentAssetSet(projectCode, frameId);
    if (assetSet.status !== 'confirmed' || !assetSet.mapping_model_id || !assetSet.mapping_revision) {
      throw new BadRequestException('Confirm the GA Asset Set and Mapping Catalog before correlation');
    }
    const model = await this.prisma.panel_models.findUnique({ where: { id: assetSet.mapping_model_id } });
    if (!model || model.mapping_state !== 'confirmed') throw new BadRequestException('Mapping Catalog is not confirmed');
    const scheduleRevision = this.scheduleRevision(projectCode, frameId);
    await this.prisma.ga_asset_sets.update({
      where: { id: assetSet.id },
      data: { schedule_revision: scheduleRevision, release_status: 'blocked', invalidated_reason: 'Correlation is running', updated_by: userId },
    });
    return this.jobs.enqueue({
      jobType: 'ga_schedule_correlation', projectCode, frameId, requestedBy: userId,
      payload: {
        gaAssetSetId: assetSet.id,
        sourceRevision: assetSet.source_revision,
        mappingModelId: model.id,
        mappingRevision: model.mapping_revision,
        scheduleRevision,
      },
      maxAttempts: 2,
    });
  }

  /** Schedule-row correlation map keyed by cable serial (`sno`). */
  async correlationMap(projectCode: string, frameId: string): Promise<Record<string, import('./ga-foundation.types').WireRowCorrelationSummary>> {
    const tables = await loadWiringDbTables(this.prisma);
    if (!wiringTableReady(tables, 'ga_asset_sets') || !wiringTableReady(tables, 'ga_correlation_results')) {
      return {};
    }
    const assetSet = await this.prisma.ga_asset_sets.findFirst({
      where: { project_code: projectCode, frame_id: frameId, status: 'confirmed' },
      orderBy: { revision: 'desc' },
    });
    if (!assetSet?.mapping_model_id || !assetSet.mapping_revision || !assetSet.schedule_revision) {
      return {};
    }
    const results = await this.prisma.ga_correlation_results.findMany({
      where: {
        project_code: projectCode,
        frame_id: frameId,
        mapping_model_id: assetSet.mapping_model_id,
        mapping_revision: assetSet.mapping_revision,
        schedule_revision: assetSet.schedule_revision,
      },
    });
    const byRow = new Map<string, typeof results>();
    for (const row of results) {
      const bucket = byRow.get(row.wiring_row_id) ?? [];
      bucket.push(row);
      byRow.set(row.wiring_row_id, bucket);
    }
    const out: Record<string, import('./ga-foundation.types').WireRowCorrelationSummary> = {};
    for (const [rowId, endpoints] of byRow) {
      const sno = rowId.includes('#') ? rowId.split('#').pop()! : rowId;
      out[sno] = this.summarizeRowCorrelation(endpoints);
    }
    return out;
  }

  private summarizeRowCorrelation(
    endpoints: Array<{
      state: string;
      review_status: string;
      exception_hold: boolean;
      final_terminal_id: number | null;
      matched_terminal_id: number | null;
      endpoint: string;
    }>,
  ): import('./ga-foundation.types').WireRowCorrelationSummary {
    const catalogRef = (ep: typeof endpoints[number]) => {
      const id = ep.final_terminal_id ?? ep.matched_terminal_id;
      return id ? `${ep.endpoint}:${id}` : null;
    };
    const src = endpoints.find(e => e.endpoint === 'source');
    const dst = endpoints.find(e => e.endpoint === 'destination');
    if (endpoints.some(e => e.exception_hold)) {
      return { matchState: 'exception', srcCatalogRef: src ? catalogRef(src) : null, dstCatalogRef: dst ? catalogRef(dst) : null };
    }
    const pending = endpoints.filter(e => e.review_status === 'pending');
    if (pending.some(e => e.state === 'not_matched')) {
      return { matchState: 'unmatched', srcCatalogRef: src ? catalogRef(src) : null, dstCatalogRef: dst ? catalogRef(dst) : null };
    }
    if (pending.some(e => e.state === 'suggested_match')) {
      return { matchState: 'suggested', srcCatalogRef: src ? catalogRef(src) : null, dstCatalogRef: dst ? catalogRef(dst) : null };
    }
    const allMatched = endpoints.every(e =>
      e.state === 'exact_match' || (e.review_status === 'resolved' && (e.final_terminal_id || e.matched_terminal_id)),
    );
    return {
      matchState: allMatched && endpoints.length > 0 ? 'matched' : 'unknown',
      srcCatalogRef: src ? catalogRef(src) : null,
      dstCatalogRef: dst ? catalogRef(dst) : null,
    };
  }

  async finalizationQueue(projectCode: string, frameId: string) {
    const assetSet = await this.requireCurrentAssetSet(projectCode, frameId);
    if (!assetSet.mapping_model_id || !assetSet.mapping_revision || !assetSet.schedule_revision) return [];
    return this.prisma.ga_correlation_results.findMany({
      where: {
        project_code: projectCode,
        frame_id: frameId,
        mapping_model_id: assetSet.mapping_model_id,
        mapping_revision: assetSet.mapping_revision,
        schedule_revision: assetSet.schedule_revision,
        state: { not: 'exact_match' },
        review_status: 'pending',
      },
      orderBy: [{ wiring_row_id: 'asc' }, { endpoint: 'asc' }],
    });
  }

  async decideFinalization(input: {
    projectCode: string;
    frameId: string;
    resultId: string;
    decision: 'confirm_suggestion' | 'link_existing' | 'exception_hold';
    targetTerminalId?: number;
    reason?: string;
    userId: number;
  }) {
    const assetSet = await this.requireCurrentAssetSet(input.projectCode, input.frameId);
    const result = await this.prisma.ga_correlation_results.findFirst({
      where: { id: input.resultId, project_code: input.projectCode, frame_id: input.frameId },
    });
    if (!result) throw new NotFoundException('Finalization item not found');
    if (result.mapping_model_id !== assetSet.mapping_model_id
        || result.mapping_revision !== assetSet.mapping_revision
        || result.schedule_revision !== this.scheduleRevision(input.projectCode, input.frameId)) {
      throw new ConflictException('This Finalization item belongs to a stale drawing, mapping, or schedule revision');
    }
    let finalTerminalId: number | null = null;
    let exceptionHold = false;
    const reason = String(input.reason ?? '').trim();
    if (input.decision === 'confirm_suggestion') {
      if (!result.suggested_terminal_id) throw new BadRequestException('This item has no suggested match');
      finalTerminalId = result.suggested_terminal_id;
    } else if (input.decision === 'link_existing') {
      if (!Number.isInteger(input.targetTerminalId)) throw new BadRequestException('Select an existing mapped terminal');
      const candidate = await this.terminalBelongsToModel(input.targetTerminalId!, result.mapping_model_id);
      if (!candidate) throw new BadRequestException('Selected terminal does not belong to the current Mapping Catalog');
      finalTerminalId = input.targetTerminalId!;
      if (reason.length < 3) throw new BadRequestException('A decision reason of at least 3 characters is required');
    } else if (input.decision === 'exception_hold') {
      if (reason.length < 3) throw new BadRequestException('A documented exception reason of at least 3 characters is required');
      exceptionHold = true;
    } else {
      throw new BadRequestException('Unsupported Finalization decision');
    }
    const finalTerminal = finalTerminalId
      ? await this.prisma.terminal_geometries.findUnique({ where: { id: finalTerminalId } })
      : null;
    const originalValue = { device: result.raw_device, terminal: result.raw_terminal };
    const suggestedValue = result.suggested_terminal_id ? { terminal_geometry_id: result.suggested_terminal_id } : null;
    const finalValue = finalTerminal ? { terminal_geometry_id: finalTerminal.id, reference: finalTerminal.normalized_terminal_reference } : null;
    const now = new Date();
    await this.prisma.$transaction([
      this.prisma.ga_correlation_results.update({
        where: { id: result.id },
        data: {
          final_terminal_id: finalTerminalId,
          review_status: 'resolved',
          exception_hold: exceptionHold,
          decided_by: input.userId,
          decided_at: now,
          decision_reason: reason || null,
        },
      }),
      this.prisma.ga_finalization_decisions.create({
        data: {
          correlation_result_id: result.id,
          project_code: input.projectCode,
          frame_id: input.frameId,
          decision: input.decision,
          original_value: originalValue,
          suggested_value: suggestedValue ?? Prisma.JsonNull,
          final_value: finalValue ?? Prisma.JsonNull,
          reason: reason || null,
          decided_by: input.userId,
          ga_revision: assetSet.source_revision,
          mapping_revision: result.mapping_revision,
          schedule_revision: result.schedule_revision,
        },
      }),
      this.prisma.ga_asset_sets.update({
        where: { id: assetSet.id },
        data: { release_status: 'blocked', invalidated_reason: 'Finalization decisions require release validation', updated_by: input.userId },
      }),
    ]);
    this.publish(input.projectCode, input.frameId, input.userId);
    return this.prisma.ga_correlation_results.findUnique({ where: { id: result.id } });
  }

  async releasePanel(projectCode: string, frameId: string, userId: number) {
    const assetSet = await this.requireCurrentAssetSet(projectCode, frameId);
    if (assetSet.status !== 'confirmed' || !assetSet.confirmed_at) throw new BadRequestException('GA Asset Set is not confirmed');
    if (!assetSet.mapping_model_id || !assetSet.mapping_revision) throw new BadRequestException('Mapping Catalog is not confirmed');
    const model = await this.prisma.panel_models.findUnique({ where: { id: assetSet.mapping_model_id } });
    if (!model || model.mapping_state !== 'confirmed' || model.source_ga_revision !== assetSet.source_revision) {
      throw new ConflictException('Mapping Catalog does not match the current GA source revision');
    }
    const scheduleRevision = this.scheduleRevision(projectCode, frameId);
    const frame = this.assertPanel(projectCode, frameId);
    const expectedResults = (frame.cables?.length ?? 0) * 2;
    const results = await this.prisma.ga_correlation_results.findMany({
      where: {
        project_code: projectCode,
        frame_id: frameId,
        mapping_model_id: model.id,
        mapping_revision: model.mapping_revision!,
        schedule_revision: scheduleRevision,
      },
    });
    if (results.length !== expectedResults) throw new BadRequestException('Correlation is missing or stale for the current schedule');
    const unresolved = results.filter(result => result.review_status !== 'resolved');
    if (unresolved.length) throw new BadRequestException(`${unresolved.length} mandatory correlation endpoint(s) remain unresolved`);
    const now = new Date();
    const released = await this.prisma.ga_asset_sets.update({
      where: { id: assetSet.id },
      data: {
        release_status: 'released', released_by: userId, released_at: now,
        schedule_revision: scheduleRevision, invalidated_reason: null, updated_by: userId,
      },
    });
    this.publish(projectCode, frameId, userId);
    return released;
  }

  async assertPanelReleased(projectCode: string, frameId: string): Promise<void> {
    const assetSet = await this.currentAssetSet(projectCode, frameId);
    // Backward compatibility: panels not enrolled in the GA workflow retain the
    // unchanged technician workflow and OperationalTwin2D fallback.
    if (!assetSet) return;
    const scheduleRevision = this.scheduleRevision(projectCode, frameId);
    if (assetSet.release_status !== 'released' || !assetSet.released_at
        || assetSet.schedule_revision !== scheduleRevision) {
      throw new ForbiddenException('Panel GA mapping is not finalized and released for the current wiring schedule');
    }
  }

  getFaceImage(projectCode: string, frameId: string, assetSetId: string, face: string) {
    return FrameStore.getGaFaceImage(projectCode, frameId, assetSetId, face);
  }

  async faceImageById(projectCode: string, frameId: string, faceId: string) {
    const assetSet = await this.requireCurrentAssetSet(projectCode, frameId);
    const face = await this.prisma.ga_faces.findFirst({ where: { id: faceId, ga_asset_set_id: assetSet.id } });
    if (!face) throw new NotFoundException('GA face is unavailable for this panel');
    const faceKey = face.face === 'custom' ? `custom-${face.custom_label ?? ''}` : face.face;
    const file = FrameStore.getGaFaceImage(projectCode, frameId, assetSet.id, faceKey);
    if (!file) throw new NotFoundException('GA face image is unavailable');
    return file;
  }

  async sourceFile(projectCode: string, frameId: string, assetId: number) {
    const asset = await this.sourceAsset(projectCode, frameId, assetId);
    const file = FrameStore.getDrawingFile(projectCode, asset.drawing_number);
    if (!file) throw new NotFoundException('GA source file is unavailable');
    return { ...file, contentType: asset.mime_type };
  }

  private async processCadConversion(context: { projectCode: string; frameId: string; payload: Record<string, unknown> }) {
    const drawingAssetId = Number(context.payload.drawingAssetId);
    if (!Number.isInteger(drawingAssetId)) throw new Error('CAD conversion job has an invalid drawing asset');
    const asset = await this.sourceAsset(context.projectCode, context.frameId, drawingAssetId);
    const sourcePath = FrameStore.getDrawingFilePath(context.projectCode, asset.drawing_number);
    if (!sourcePath) throw new Error('Immutable DWG source file is unavailable');
    const provider = this.cadProviders.provider();
    const health = await provider.healthCheck();
    if (!health.available) {
      await this.prisma.drawing_assets.update({
        where: { id: asset.id },
        data: { conversion_status: 'review_required', conversion_error: 'Conversion service unavailable', converter_name: health.provider, converter_version: health.version },
      });
      return {
        status: 'review_required' as const,
        result: { message: 'Conversion service unavailable', fallback: 'Upload an approved PDF or DXF derivative' },
        providerName: health.provider,
        providerVersion: health.version ?? undefined,
      };
    }
    const stored = { path: sourcePath, originalName: asset.original_filename, size: asset.size };
    await provider.inspect(stored);
    const converted = await provider.convertToDxf(stored);
    const derivativePath = FrameStore.saveCadDerivative(context.projectCode, asset.drawing_number, 'dxf', converted.buffer);
    let preview: { format: 'pdf' | 'svg'; buffer: Buffer; contentType: string } | null = null;
    try {
      preview = await provider.generatePreview(stored);
      FrameStore.saveDrawingPreview(context.projectCode, asset.drawing_number, preview.format, preview.buffer);
    } catch {
      // DXF derivative is authoritative for conversion review; preview is optional.
    }
    await this.prisma.drawing_assets.update({
      where: { id: asset.id },
      data: {
        conversion_status: 'completed', converter_name: converted.provider, converter_version: converted.version,
        derivative_path: derivativePath, derivative_mime: 'image/vnd.dxf', conversion_error: null,
      },
    });
    return {
      status: 'review_required' as const,
      result: { dxf_ready: true, preview_ready: !!preview, source_sha256: asset.sha256 },
      providerName: converted.provider,
      providerVersion: converted.version,
    };
  }

  private async processCorrelation(context: { id: string; projectCode: string; frameId: string; requestedBy: number; payload: Record<string, unknown> }) {
    const assetSet = await this.requireCurrentAssetSet(context.projectCode, context.frameId);
    const modelId = Number(context.payload.mappingModelId);
    const mappingRevision = String(context.payload.mappingRevision ?? '');
    const scheduleRevision = String(context.payload.scheduleRevision ?? '');
    if (assetSet.id !== context.payload.gaAssetSetId || assetSet.source_revision !== context.payload.sourceRevision
        || assetSet.mapping_model_id !== modelId || assetSet.mapping_revision !== mappingRevision
        || this.scheduleRevision(context.projectCode, context.frameId) !== scheduleRevision) {
      throw new ConflictException('Correlation job became stale before processing');
    }
    const devices = await this.prisma.device_geometries.findMany({ where: { panel_model_id: modelId } });
    const terminals = devices.length
      ? await this.prisma.terminal_geometries.findMany({ where: { device_geometry_id: { in: devices.map(device => device.id) } } })
      : [];
    const deviceById = new Map(devices.map(device => [device.id, device]));
    const candidates: TerminalCandidate[] = terminals.flatMap(terminal => {
      const device = deviceById.get(terminal.device_geometry_id);
      if (!device) return [];
      const terminalDevice = terminal.terminal_block || device.device_tag;
      return [{
        terminal,
        device,
        rawReference: `${terminalDevice}:${terminal.terminal_number}`,
        normalizedReference: normalizeEndpointReference(terminalDevice, terminal.terminal_number),
        normalizedAliases: stringArray(device.aliases).map(alias => normalizeEndpointReference(alias, terminal.terminal_number)),
      }];
    });
    const frame = this.assertPanel(context.projectCode, context.frameId);
    await this.prisma.ga_correlation_results.updateMany({
      where: { project_code: context.projectCode, frame_id: context.frameId, review_status: { not: 'stale' } },
      data: { review_status: 'stale' },
    });
    const rows: Prisma.ga_correlation_resultsCreateManyInput[] = [];
    frame.cables.forEach((cable, index) => {
      rows.push(this.correlateEndpoint(context, modelId, mappingRevision, scheduleRevision, candidates, cable, index, 'source'));
      rows.push(this.correlateEndpoint(context, modelId, mappingRevision, scheduleRevision, candidates, cable, index, 'destination'));
    });
    if (rows.length) await this.prisma.ga_correlation_results.createMany({ data: rows });
    const reviewCount = rows.filter(row => row.review_status !== 'resolved').length;
    await this.prisma.ga_asset_sets.update({
      where: { id: assetSet.id },
      data: {
        release_status: 'blocked',
        invalidated_reason: reviewCount ? `${reviewCount} correlation endpoint(s) require Finalization` : 'Correlation complete; release validation required',
        schedule_revision: scheduleRevision,
        updated_by: context.requestedBy,
      },
    });
    return {
      status: reviewCount ? 'review_required' as const : 'completed' as const,
      result: { endpoints: rows.length, review_required: reviewCount, exact: rows.length - reviewCount },
    };
  }

  private correlateEndpoint(
    context: { id: string; projectCode: string; frameId: string },
    modelId: number,
    mappingRevision: string,
    scheduleRevision: string,
    candidates: TerminalCandidate[],
    cable: Cable,
    index: number,
    endpoint: 'source' | 'destination',
  ): Prisma.ga_correlation_resultsCreateManyInput {
    const row = cable as unknown as Record<string, unknown>;
    const combined = String(endpoint === 'source' ? row.source ?? '' : row.destination ?? '');
    const parsed = parseCombinedEndpoint(combined);
    const rawDevice = String(endpoint === 'source' ? row.source_device ?? parsed.device : row.dest_device ?? parsed.device).trim();
    const rawTerminal = String(endpoint === 'source' ? row.source_terminal ?? parsed.terminal : row.dest_terminal ?? parsed.terminal).trim();
    const normalizedReference = normalizeEndpointReference(rawDevice, rawTerminal);
    const rawReference = rawDevice && rawTerminal ? `${rawDevice}:${rawTerminal}` : combined;
    const exactRaw = candidates.filter(candidate => candidate.rawReference === rawReference);
    const exactNormalized = candidates.filter(candidate => candidate.normalizedReference === normalizedReference);
    const alias = candidates.filter(candidate => candidate.normalizedAliases.includes(normalizedReference));
    let state: Prisma.ga_correlation_resultsCreateManyInput['state'] = 'not_matched';
    let method = 'none';
    let confidence = 0;
    let matched: TerminalCandidate | null = null;
    let suggested: TerminalCandidate | null = null;
    const evidence: Record<string, unknown> = { rawReference, normalizedReference };

    const chooseUnique = (found: TerminalCandidate[], foundMethod: string, foundConfidence: number) => {
      if (found.length === 1) {
        state = 'exact_match'; method = foundMethod; confidence = foundConfidence; matched = found[0];
      } else if (found.length > 1) {
        state = 'duplicate_or_ambiguous'; method = foundMethod; confidence = foundConfidence;
        evidence.duplicates = found.map(candidate => candidate.terminal.id);
      }
    };
    if (exactRaw.length) chooseUnique(exactRaw, 'exact_raw', 1);
    else if (exactNormalized.length) chooseUnique(exactNormalized, 'exact_normalized', 0.99);
    else if (alias.length) chooseUnique(alias, 'configured_alias', 0.97);
    else if (normalizedReference) {
      const ranked = candidates
        .map(candidate => {
          const maxLength = Math.max(normalizedReference.length, candidate.normalizedReference.length, 1);
          return { candidate, score: 1 - distance(normalizedReference, candidate.normalizedReference) / maxLength };
        })
        .sort((a, b) => b.score - a.score || a.candidate.terminal.id - b.candidate.terminal.id);
      const threshold = boundedNumber(process.env.DWES_GA_FUZZY_THRESHOLD ?? 0.82, 'Fuzzy threshold', 0.5, 1);
      const best = ranked[0];
      const next = ranked[1];
      if (best && best.score >= threshold) {
        if (next && best.score - next.score < 0.03) {
          state = 'duplicate_or_ambiguous'; method = 'fuzzy'; confidence = best.score;
        } else {
          state = 'suggested_match'; method = 'fuzzy'; confidence = best.score; suggested = best.candidate;
        }
      }
      evidence.threshold = threshold;
    }
    const rankedCandidates = candidates
      .map(candidate => ({
        terminal_geometry_id: candidate.terminal.id,
        reference: candidate.rawReference,
        score: normalizedReference
          ? 1 - distance(normalizedReference, candidate.normalizedReference) / Math.max(normalizedReference.length, candidate.normalizedReference.length, 1)
          : 0,
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);
    return {
      job_id: context.id,
      project_code: context.projectCode,
      frame_id: context.frameId,
      wiring_row_id: `${context.frameId}#${String(row.sno ?? index + 1)}`,
      endpoint,
      raw_device: rawDevice || null,
      raw_terminal: rawTerminal || null,
      normalized_reference: normalizedReference || null,
      state,
      method,
      evidence: evidence as Prisma.InputJsonValue,
      confidence,
      candidate_references: rankedCandidates as Prisma.InputJsonValue,
      matched_terminal_id: matched?.terminal.id ?? null,
      suggested_terminal_id: suggested?.terminal.id ?? null,
      final_terminal_id: matched?.terminal.id ?? null,
      mapping_model_id: modelId,
      mapping_revision: mappingRevision,
      schedule_revision: scheduleRevision,
      review_status: state === 'exact_match' ? 'resolved' : 'pending',
    };
  }

  private async currentAssetSet(projectCode: string, frameId: string) {
    const tables = await loadWiringDbTables(this.prisma);
    if (!wiringTableReady(tables, 'ga_asset_sets')) return null;
    return this.prisma.ga_asset_sets.findFirst({
      where: { project_code: projectCode, frame_id: frameId, status: { not: 'superseded' } },
      orderBy: { revision: 'desc' },
    });
  }

  private async requireCurrentAssetSet(projectCode: string, frameId: string) {
    const assetSet = await this.currentAssetSet(projectCode, frameId);
    if (!assetSet) throw new NotFoundException('No GA Asset Set exists for this panel');
    return assetSet;
  }

  private async sourceAsset(projectCode: string, frameId: string, assetId: number) {
    const tables = await loadWiringDbTables(this.prisma);
    if (!wiringTableReady(tables, 'drawing_assets')) {
      throw new NotFoundException('GA source asset storage is not available on this database');
    }
    const asset = await this.prisma.drawing_assets.findFirst({
      where: { id: assetId, project_code: projectCode, frame_id: frameId, drawing_type: { startsWith: 'ga_' } },
    });
    if (!asset) throw new NotFoundException('GA source asset not found for this panel');
    return asset;
  }

  private assertPanel(projectCode: string, frameId: string) {
    const frame = MockStore.findFrameByProjectAndId(projectCode, frameId) ?? FrameStore.getFrameFromDisk(projectCode, frameId);
    if (!frame) throw new NotFoundException(`Panel ${frameId} not found in project ${projectCode}`);
    return frame;
  }

  private scheduleRevision(projectCode: string, frameId: string): string {
    const buffer = FrameStore.getBuffer(projectCode, frameId);
    if (buffer) return createHash('sha256').update(buffer).digest('hex');
    const frame = this.assertPanel(projectCode, frameId);
    return createHash('sha256').update(JSON.stringify({
      uploaded_at: frame.uploaded_at,
      original_filename: frame.original_filename,
      cables: frame.cables,
    })).digest('hex');
  }

  private rectToMillimetres(item: MappingCatalogItemInput, width: number, height: number, depth: number) {
    const z = item.face === 'rear' ? depth : item.face === 'internal' ? depth / 2 : 0;
    return {
      x: item.rect.x * width,
      y: item.rect.y * height,
      z,
      width: item.rect.width * width,
      height: item.rect.height * height,
      depth: Math.max(1, depth * 0.02),
    };
  }

  private async terminalBelongsToModel(terminalId: number, modelId: number) {
    const terminal = await this.prisma.terminal_geometries.findUnique({ where: { id: terminalId } });
    if (!terminal) return null;
    const device = await this.prisma.device_geometries.findFirst({ where: { id: terminal.device_geometry_id, panel_model_id: modelId } });
    return device ? terminal : null;
  }

  private publish(projectCode: string, frameId: string, actorId: number) {
    this.events.publish({ scope: 'engineering', action: 'updated', projectCode, frameId, actorId });
  }
}
