import { Injectable, BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import * as XLSX from 'xlsx';
import * as crypto from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import {
  MockStore,
  Cable,
  type PanelDrawingAsset,
  type PanelDrawingAssetKind,
  type PanelDrawingPackage,
} from '../data/mock-store';
import { FrameStore } from '../frames/frame-store';
import { PanelModelStore } from '../panel-model/panel-model-store';
import { parseWiringSheet } from './parse-wiring';
import { convertCadDrawingPreview } from './drawing-preview-converter';
import { isSafeInlineSvg } from '../common/safe-svg.util';
import { assertPanelNameUniqueForWrite } from '../common/panel-duplicate.helper';
import {
  buildHeaderPairs,
  dataStartRow,
  findHeaderRow,
  scoreSheetHeaders,
} from './excel-headers';

const REQUIRED_FIELDS = ['ferrule'];

const DRAWING_EXTENSIONS: Record<PanelDrawingAssetKind, Set<string>> = {
  '2d': new Set(['pdf', 'dwg', 'dxf', 'png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg', 'tif', 'tiff']),
  '3d': new Set(['glb', 'gltf', 'step', 'stp', 'ifc', 'obj', 'fbx', 'stl']),
};

const NORMALIZED_CONTENT_TYPES: Record<string, string> = {
  pdf: 'application/pdf', dwg: 'application/acad', dxf: 'image/vnd.dxf',
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif',
  webp: 'image/webp', bmp: 'image/bmp', svg: 'image/svg+xml', tif: 'image/tiff', tiff: 'image/tiff',
  glb: 'model/gltf-binary', gltf: 'model/gltf+json', obj: 'model/obj', stl: 'model/stl',
  step: 'application/step', stp: 'application/step', ifc: 'application/x-step',
  fbx: 'application/octet-stream',
};

const MIME_ALIASES: Record<string, Set<string>> = {
  pdf: new Set(['application/pdf']),
  dwg: new Set(['application/acad', 'application/x-acad', 'application/autocad_dwg', 'image/vnd.dwg']),
  dxf: new Set(['image/vnd.dxf', 'application/dxf', 'application/x-dxf']),
  png: new Set(['image/png']), jpg: new Set(['image/jpeg']), jpeg: new Set(['image/jpeg']),
  gif: new Set(['image/gif']), webp: new Set(['image/webp']), bmp: new Set(['image/bmp']),
  svg: new Set(['image/svg+xml']),
  tif: new Set(['image/tiff']), tiff: new Set(['image/tiff']),
  glb: new Set(['model/gltf-binary']), gltf: new Set(['model/gltf+json', 'application/json']),
  obj: new Set(['model/obj', 'text/plain']), stl: new Set(['model/stl', 'application/sla', 'text/plain']),
  step: new Set(['application/step', 'model/step']), stp: new Set(['application/step', 'model/step']),
  ifc: new Set(['application/x-step', 'application/ifc']),
  fbx: new Set(['application/octet-stream', 'application/vnd.autodesk.fbx']),
};

function safeUploadName(filename: string): string {
  const base = String(filename || '').replace(/\\/g, '/').split('/').pop() || 'drawing';
  const clean = base.replace(/[\u0000-\u001f\u007f]/g, '').replace(/[^a-zA-Z0-9._() +-]/g, '_').trim();
  return (clean || 'drawing').slice(0, 180);
}

function extensionOf(filename: string): string {
  return (filename.split('.').pop() || '').trim().toLowerCase();
}

function inferredAssetKind(filename: string): PanelDrawingAssetKind | null {
  const ext = extensionOf(filename);
  if (DRAWING_EXTENSIONS['2d'].has(ext)) return '2d';
  if (DRAWING_EXTENSIONS['3d'].has(ext)) return '3d';
  return null;
}

function startsWithAscii(buffer: Buffer, value: string): boolean {
  return buffer.subarray(0, value.length).toString('ascii') === value;
}

function hasBasicSignature(buffer: Buffer, ext: string): boolean {
  if (!buffer.length) return false;
  const head = buffer.subarray(0, Math.min(buffer.length, 4096));
  const ascii = head.toString('utf8').replace(/^\uFEFF/, '').trimStart();
  switch (ext) {
    case 'pdf': return startsWithAscii(buffer, '%PDF-');
    case 'png': return buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
    case 'jpg':
    case 'jpeg': return buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
    case 'gif': return startsWithAscii(buffer, 'GIF87a') || startsWithAscii(buffer, 'GIF89a');
    case 'webp': return startsWithAscii(buffer, 'RIFF') && buffer.subarray(8, 12).toString('ascii') === 'WEBP';
    case 'bmp': return startsWithAscii(buffer, 'BM');
    case 'svg': return isSafeInlineSvg(buffer);
    case 'tif':
    case 'tiff': return buffer.subarray(0, 4).equals(Buffer.from([0x49, 0x49, 0x2a, 0x00])) || buffer.subarray(0, 4).equals(Buffer.from([0x4d, 0x4d, 0x00, 0x2a]));
    case 'dwg': return /^AC10\d{2}/.test(buffer.subarray(0, 6).toString('ascii'));
    case 'dxf': return /(?:^|\r?\n)\s*0\s*\r?\n\s*SECTION/i.test(ascii);
    case 'glb': return startsWithAscii(buffer, 'glTF');
    case 'gltf': {
      try {
        const json = JSON.parse(buffer.toString('utf8')) as { asset?: { version?: unknown } };
        return typeof json?.asset?.version === 'string';
      } catch { return false; }
    }
    case 'step':
    case 'stp': return /^ISO-10303-21\s*;/i.test(ascii);
    case 'ifc': return /^ISO-10303-21\s*;/i.test(ascii) && /FILE_SCHEMA\s*\(\s*\(\s*['"]IFC/i.test(ascii);
    case 'fbx': return startsWithAscii(buffer, 'Kaydara FBX Binary') || /^;\s*FBX/i.test(ascii);
    case 'obj': return /(?:^|\r?\n)\s*(?:v|vn|vt|f|o|g)\s+/m.test(ascii);
    case 'stl': {
      if (/^solid(?:\s|$)/i.test(ascii)) return /(?:^|\r?\n)\s*(?:facet|endsolid)(?:\s|$)/im.test(ascii);
      if (buffer.length < 84) return false;
      const triangles = buffer.readUInt32LE(80);
      return 84 + triangles * 50 === buffer.length;
    }
    default: return false;
  }
}

function validateDrawingAsset(buffer: Buffer, filename: string, suppliedContentType: string, kind: PanelDrawingAssetKind) {
  const ext = extensionOf(filename);
  if (!DRAWING_EXTENSIONS[kind].has(ext)) {
    throw new BadRequestException(`${kind === '2d' ? '2D drawing' : '3D model'} format .${ext || '(none)'} is not supported`);
  }
  if (!hasBasicSignature(buffer, ext)) {
    throw new BadRequestException(`The uploaded .${ext} file signature is invalid or does not match its extension`);
  }
  const mime = String(suppliedContentType || '').toLowerCase().split(';')[0].trim();
  const expected = NORMALIZED_CONTENT_TYPES[ext];
  const generic = !mime || mime === 'application/octet-stream' || mime === 'binary/octet-stream';
  if (!generic && expected && !MIME_ALIASES[ext]?.has(mime)) {
    throw new BadRequestException(`The uploaded file MIME type (${mime}) does not match .${ext}`);
  }
  return { ext, contentType: expected || 'application/octet-stream' };
}

function previewMetadata(ext: string, filename: string, contentType: string): PanelDrawingAsset['preview'] {
  const requiresConversion = ['dwg', 'dxf', 'step', 'stp', 'ifc'].includes(ext);
  if (requiresConversion) {
    return {
      filename: '',
      content_type: '',
      format: ['dwg', 'dxf'].includes(ext) ? 'pdf' : 'glb',
      status: 'failed',
      error: 'A secure browser preview has not been generated. The original engineering source file is preserved unchanged.',
    };
  }
  return { filename, content_type: contentType, format: ext, status: 'source' };
}

@Injectable()
export class UploadService {
  constructor(private prisma: PrismaService) {}

  async checkHash(hash: string, _fileName: string, _fileType: string, projectCode?: string) {
    const where: any = { file_hash: hash };
    if (projectCode) where.project_code = projectCode;
    const existing = await this.prisma.file_hashes.findFirst({ where });
    if (existing) {
      return { duplicate: true, file_name: existing.file_name, project_code: existing.project_code, file_type: existing.file_type, uploaded_at: existing.uploaded_at };
    }
    return { duplicate: false };
  }

  readHeaders(_projectCode: string, buffer: Buffer, _filename: string) {
    const wb = XLSX.read(buffer, { type: 'buffer' });
    const sheets: {
      name: string; score: number; headers: string[];
      sample_rows: unknown[][]; data_row_count: number; header_row: number;
    }[] = [];
    for (const name of wb.SheetNames) {
      const ws = wb.Sheets[name];
      const rows: unknown[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' }) as unknown[][];
      if (rows.length < 2) continue;

      const headerRow = findHeaderRow(rows);
      const headerPairs = buildHeaderPairs(rows, headerRow);
      if (headerPairs.length < 2) continue;

      const dataStart = dataStartRow(rows, headerRow);

      const rawDataRows = rows.slice(dataStart).filter(r =>
        (r as unknown[]).some(c => String(c ?? '').trim()),
      );
      // Full worksheet data for mapping preview + Full View (cap guards memory on huge files).
      const MAX_PREVIEW_ROWS = 10000;
      const dataRows = rawDataRows.slice(0, MAX_PREVIEW_ROWS);
      const sampleRows = dataRows.map(row =>
        headerPairs.map(p => {
          const v = (row as unknown[])[p.idx];
          return v !== null && v !== undefined ? String(v).trim() : '';
        }),
      );

      const headers = headerPairs.map(p => p.name);
      const score = scoreSheetHeaders(headers);

      sheets.push({
        name, score, headers,
        sample_rows: sampleRows,
        data_row_count: rawDataRows.length,
        header_row: headerRow,
      });
    }
    sheets.sort((a, b) => b.score - a.score);
    return { sheets, best_sheet: sheets[0]?.name || wb.SheetNames[0] };
  }

  previewMapped(
    buffer: Buffer,
    sheetName: string,
    mapping: Record<string, string>,
    headerRow?: number,
  ) {
    for (const field of REQUIRED_FIELDS) {
      if (!mapping[field]) throw new BadRequestException(`Required field '${field}' is not mapped`);
    }
    try {
      const parsed = parseWiringSheet(buffer, sheetName, mapping, headerRow);
      const mappedCount = Object.values(mapping).filter(Boolean).length;
      return {
        cable_count: parsed.cables.length,
        mapped_columns: mappedCount,
        unmatched_headers: parsed.unmatchedHeaders,
        header_row: parsed.headerRowIdx,
        validation: parsed.validation,
        sample_cables: parsed.cables.slice(0, 5).map(c => ({
          ferrule: c.ferrule, source: c.source, destination: c.destination,
          path: c.path, color: c.color, size: c.size, length: c.length,
        })),
      };
    } catch (e) {
      throw new BadRequestException(e instanceof Error ? e.message : 'Failed to parse wiring schedule');
    }
  }

  extractMetadata(buffer: Buffer) {
    try {
      const wb = XLSX.read(buffer, { type: 'buffer' });
      const firstSheet = wb.Sheets[wb.SheetNames[0]];
      const data: unknown[][] = XLSX.utils.sheet_to_json(firstSheet, { header: 1, defval: '' }) as unknown[][];
      const meta: Record<string, string> = {};
      for (const row of data.slice(0, 15)) {
        const cells = row.map(c => String(c).trim());
        for (let i = 0; i < cells.length - 1; i++) {
          const key = cells[i].toLowerCase();
          if (key.includes('panel')) meta['panel_name'] = cells[i + 1];
          if (key.includes('voltage')) meta['voltage'] = cells[i + 1];
          if (key.includes('station') || key.includes('substation')) meta['substation'] = cells[i + 1];
          if (key.includes('client') || key.includes('customer')) meta['client'] = cells[i + 1];
        }
      }
      return { metadata: meta, sheet_count: wb.SheetNames.length, sheets: wb.SheetNames };
    } catch { return { metadata: {}, sheet_count: 0, sheets: [] }; }
  }

  async uploadMapped(
    projectCode: string,
    buffer: Buffer,
    filename: string,
    sheetName: string,
    mapping: Record<string, string>,
    headerRow?: number,
    targetFrameId?: string,
  ) {
    const project = await this.prisma.projects.findFirst({ where: { code: projectCode, is_active: true } });
    if (!project) throw new BadRequestException(`Project ${projectCode} not found`);

    for (const field of REQUIRED_FIELDS) {
      if (!mapping[field]) throw new BadRequestException(`Required field '${field}' is not mapped`);
    }

    let cables: Cable[];
    let excelHeaders: string[];
    let unmatchedHeaders: string[];
    let headerRowIdx: number;
    try {
      ({ cables, excelHeaders, unmatchedHeaders, headerRowIdx } = parseWiringSheet(buffer, sheetName, mapping, headerRow));
    } catch (e) {
      // Mapping sanity failures (e.g. constant-value ferrule column) → 400 with guidance.
      throw new BadRequestException(e instanceof Error ? e.message : 'Failed to parse wiring schedule');
    }

    if (unmatchedHeaders.length) {
      console.log(`[upload] ${filename}: ${unmatchedHeaders.length} Excel column(s) not mapped to a system field (kept in _raw): ${unmatchedHeaders.join(', ')}`);
    }

    if (cables.length === 0) {
      throw new BadRequestException('No cables parsed — check your column mapping and sheet selection');
    }

    const hash = crypto.createHash('sha256').update(buffer).digest('hex');
    const existingHash = await this.prisma.file_hashes.findFirst({ where: { file_hash: hash } });
    if (!existingHash) {
      await this.prisma.file_hashes.create({
        data: { file_hash: hash, file_name: filename, file_type: 'wiring_schedule', project_code: projectCode },
      });
    }

    const frameId = targetFrameId?.trim() || `frame_${Date.now()}`;
    const existingFrame = targetFrameId
      ? MockStore.findFrameByProjectAndId(projectCode, targetFrameId)
      : undefined;
    if (targetFrameId && !existingFrame) {
      throw new BadRequestException(`Panel ${targetFrameId} not found in project ${projectCode}`);
    }
    if (targetFrameId) {
      assertPanelNameUniqueForWrite(projectCode, targetFrameId);
    }

    // Panel name: keep selected panel name when updating an existing frame
    let panelName = existingFrame?.panel_name || cables.find(c => c.panel)?.panel || '';
    if (!panelName) {
      panelName = project.name || filename.replace(/\.(xlsx?|xls)$/i, '');
    }

    const verifiedAt = new Date().toISOString();
    const frame = {
      id: frameId, project_code: projectCode, panel_name: panelName, cables,
      uploaded_at: verifiedAt, compare_status: 'validated' as const,
      verified: true, verified_at: verifiedAt,
      original_filename: filename, cable_count: cables.length, mapping, sheet_name: sheetName,
      excel_headers: excelHeaders, header_row: headerRowIdx,
      ...(existingFrame?.panel_type ? { panel_type: existingFrame.panel_type } : {}),
      ...(existingFrame?.panel_description ? { panel_description: existingFrame.panel_description } : {}),
      ...(existingFrame?.voltage_level ? { voltage_level: existingFrame.voltage_level } : {}),
      ...(existingFrame?.system_type ? { system_type: existingFrame.system_type } : {}),
    };

    if (existingFrame) {
      FrameStore.archiveFrameFiles(projectCode, frameId, existingFrame.panel_name || panelName);
      Object.assign(existingFrame, frame);
      FrameStore.save(existingFrame, buffer);
    } else {
      MockStore.frames.push(frame);
      FrameStore.save(frame, buffer);
    }

    return {
      ...frame,
      cables: undefined,
      message: `Parsed ${cables.length} cables successfully`,
    };
  }

  async uploadDrawing(
    projectCode: string,
    buffer: Buffer,
    filename: string,
    contentType: string,
    replaceDrawingId?: string,
    targetFrameId?: string,
  ) {
    const project = await this.prisma.projects.findFirst({ where: { code: projectCode, is_active: true } });
    if (!project) throw new BadRequestException(`Project ${projectCode} not found`);

    const safeName = safeUploadName(filename);
    const kind = inferredAssetKind(safeName);
    if (!kind) throw new BadRequestException('Unsupported drawing or 3D model format');

    const frameId = targetFrameId?.trim();
    if (frameId) {
      const current = FrameStore.getDrawingPackage(projectCode, frameId);
      if (!current) throw new NotFoundException(`Panel ${frameId} not found in project ${projectCode}`);
      const currentSlot = kind === '2d' ? current.drawing_2d : current.model_3d;
      if (replaceDrawingId?.trim()) {
        const oldId = replaceDrawingId.trim();
        const allDisk = FrameStore.listDrawingsFromDisk(projectCode);
        for (const disk of allDisk) {
          if (!MockStore.drawings.some(d => d.project_code === projectCode && d.id === disk.id)) MockStore.drawings.push(disk);
        }
        const requested = MockStore.drawings.find(d => d.project_code === projectCode && d.id === oldId);
        if (!requested) throw new NotFoundException(`Drawing ${oldId} not found`);
        if (requested.frame_id !== frameId) throw new ConflictException('Cannot replace a drawing owned by another panel');
        if ((requested.kind || inferredAssetKind(requested.original_name)) !== kind) {
          throw new ConflictException('Cannot replace a 2D drawing with a 3D model, or a 3D model with a 2D drawing');
        }
        if (currentSlot && currentSlot.id !== oldId) throw new ConflictException('The selected drawing is no longer the active asset for this panel slot');
      }
      const record = await this.uploadPanelDrawingAsset(projectCode, frameId, kind, buffer, safeName, contentType);
      const asset = kind === '2d' ? record.drawing_2d : record.model_3d;
      if (!asset) throw new BadRequestException('Drawing upload did not create an asset');
      return asset;
    }

    // Legacy project-level route remains supported, but is intentionally not attached
    // to a multi-panel package until a supervisor selects an exact panel.
    const validated = validateDrawingAsset(buffer, safeName, contentType, kind);
    let old: (typeof MockStore.drawings)[number] | undefined;
    if (replaceDrawingId?.trim()) {
      for (const disk of FrameStore.listDrawingsFromDisk(projectCode)) {
        if (!MockStore.drawings.some(d => d.project_code === projectCode && d.id === disk.id)) MockStore.drawings.push(disk);
      }
      old = MockStore.drawings.find(d => d.project_code === projectCode && d.id === replaceDrawingId.trim());
      if (!old) throw new NotFoundException(`Drawing ${replaceDrawingId.trim()} not found`);
      if (old.frame_id) throw new ConflictException('Select the drawing\'s exact panel before replacing a panel-scoped asset');
      if ((old.kind || inferredAssetKind(old.original_name)) !== kind) {
        throw new ConflictException('Cannot replace a drawing with a different asset type');
      }
    }

    const hash = crypto.createHash('sha256').update(buffer).digest('hex');
    await this.recordDrawingHash(projectCode, safeName, hash);
    const id = `drw_${crypto.randomUUID()}`;
    const uploadedAt = new Date().toISOString();
    const drawing = {
      id, project_code: projectCode, kind, sha256: hash,
      filename: `${id}_${safeName}`, original_name: safeName,
      content_type: validated.contentType, uploaded_at: uploadedAt, size: buffer.length, buffer,
    };
    FrameStore.saveDrawing(projectCode, id, safeName, buffer, undefined, {
      kind, content_type: validated.contentType, sha256: hash, uploaded_at: uploadedAt,
    });
    MockStore.drawings.push(drawing);
    if (old) {
      FrameStore.archiveDrawingFile(projectCode, old.id, old.original_name || safeName);
      FrameStore.removeDrawing(projectCode, old.id, old.original_name || '');
      MockStore.drawings = MockStore.drawings.filter(d => d !== old);
    }
    const { buffer: _, ...safe } = drawing;
    return safe;
  }

  /** Create or replace one slot while retaining a stable package id and the other slot. */
  async uploadPanelDrawingAsset(
    projectCode: string,
    frameId: string,
    kind: PanelDrawingAssetKind,
    buffer: Buffer,
    filename: string,
    contentType: string,
    uploadedBy?: number,
  ): Promise<PanelDrawingPackage> {
    const project = await this.prisma.projects.findFirst({ where: { code: projectCode, is_active: true } });
    if (!project) throw new NotFoundException(`Project ${projectCode} not found`);
    assertPanelNameUniqueForWrite(projectCode, frameId);

    const safeName = safeUploadName(filename);
    const validated = validateDrawingAsset(buffer, safeName, contentType, kind);
    const record = FrameStore.getDrawingPackage(projectCode, frameId);
    if (!record) throw new NotFoundException(`Panel ${frameId} not found in project ${projectCode}`);

    const hash = crypto.createHash('sha256').update(buffer).digest('hex');
    await this.recordDrawingHash(projectCode, safeName, hash);
    const id = `drw_${crypto.randomUUID()}`;
    const uploadedAt = new Date().toISOString();
    const cadConversion = kind === '2d' && ['dwg', 'dxf'].includes(validated.ext)
      ? convertCadDrawingPreview(buffer, safeName)
      : null;
    const preview = cadConversion?.status === 'ready'
      ? {
          filename: `${id}.preview.${cadConversion.format}`,
          content_type: cadConversion.contentType,
          format: cadConversion.format,
          status: 'ready' as const,
        }
      : cadConversion
        ? {
            filename: '',
            content_type: '',
            format: cadConversion.format,
            status: 'failed' as const,
            error: cadConversion.error,
          }
        : previewMetadata(validated.ext, `${id}_${safeName}`, validated.contentType);
    const asset: PanelDrawingAsset = {
      id,
      kind,
      filename: `${id}_${safeName}`,
      original_name: safeName,
      content_type: validated.contentType,
      source_format: validated.ext,
      size: buffer.length,
      sha256: hash,
      uploaded_at: uploadedAt,
      ...(uploadedBy !== undefined ? { uploaded_by: uploadedBy } : {}),
      preview,
    };
    const previous = kind === '2d' ? record.drawing_2d : record.model_3d;
    const next: PanelDrawingPackage = {
      ...record,
      id: record.id || FrameStore.drawingPackageId(projectCode, frameId),
      revision: record.revision + 1,
      created_at: record.revision > 0 ? record.created_at : uploadedAt,
      updated_at: uploadedAt,
      drawing_2d: kind === '2d' ? asset : record.drawing_2d,
      model_3d: kind === '3d' ? asset : record.model_3d,
    };

    try {
      FrameStore.saveDrawing(projectCode, id, safeName, buffer, frameId, {
        package_id: next.id,
        kind,
        content_type: validated.contentType,
        sha256: hash,
        uploaded_at: uploadedAt,
        uploaded_by: uploadedBy,
      });
      if (cadConversion?.status === 'ready' && cadConversion.buffer) {
        FrameStore.saveDrawingPreview(projectCode, id, cadConversion.format, cadConversion.buffer);
      }
      MockStore.drawings.push({
        id, project_code: projectCode, frame_id: frameId, package_id: next.id, kind,
        sha256: hash, uploaded_by: uploadedBy, filename: asset.filename,
        original_name: safeName, content_type: validated.contentType,
        uploaded_at: uploadedAt, size: buffer.length, buffer,
      });
      FrameStore.persistDrawingPackage(next);
    } catch (error) {
      FrameStore.removeDrawing(projectCode, id, safeName);
      MockStore.drawings = MockStore.drawings.filter(d => d.id !== id);
      throw error;
    }

    if (previous && previous.id !== asset.id) {
      FrameStore.archiveDrawingFile(projectCode, previous.id, previous.original_name);
      FrameStore.removeDrawing(projectCode, previous.id, previous.original_name);
      MockStore.drawings = MockStore.drawings.filter(d => d.id !== previous.id);
    }
    // A new 2D drawing revision supersedes every generated 3D model of THIS panel
    // (read-only history is preserved; nothing is overwritten or deleted).
    if (kind === '2d') {
      PanelModelStore.supersedeActive(
        projectCode,
        frameId,
        null,
        `Superseded by new 2D drawing revision ${next.revision}`,
      );
    }
    return next;
  }

  private async recordDrawingHash(projectCode: string, filename: string, hash: string) {
    const existingHash = await this.prisma.file_hashes.findFirst({ where: { file_hash: hash } });
    if (!existingHash) {
      await this.prisma.file_hashes.create({
        data: { file_hash: hash, file_name: filename, file_type: 'drawing', project_code: projectCode },
      });
    }
  }

  async uploadDirectorReport(projectCode: string, buffer: Buffer, filename: string, contentType: string) {
    const project = await this.prisma.projects.findFirst({ where: { code: projectCode, is_active: true } });
    if (!project) throw new BadRequestException(`Project ${projectCode} not found`);
    if (!/\.pdf$/i.test(filename)) {
      throw new BadRequestException('Director reports must be PDF files');
    }

    const hash = crypto.createHash('sha256').update(buffer).digest('hex');
    const existingHash = await this.prisma.file_hashes.findFirst({ where: { file_hash: hash } });
    if (!existingHash) {
      await this.prisma.file_hashes.create({
        data: { file_hash: hash, file_name: filename, file_type: 'director_report', project_code: projectCode },
      });
    }

    const id = `drpt_${Date.now()}`;
    const report = {
      id, project_code: projectCode, filename: `${id}_${filename}`, original_name: filename,
      content_type: contentType || 'application/pdf', uploaded_at: new Date().toISOString(), size: buffer.length, buffer,
    };
    MockStore.directorReports.push(report);
    FrameStore.saveDirectorReport(projectCode, id, filename, buffer);

    const { buffer: _buf, ...safe } = report;
    return safe;
  }
}
