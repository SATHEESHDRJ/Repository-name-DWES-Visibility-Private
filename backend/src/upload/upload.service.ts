import { Injectable, BadRequestException } from '@nestjs/common';
import * as XLSX from 'xlsx';
import * as crypto from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { MockStore, Cable } from '../data/mock-store';
import { FrameStore } from '../frames/frame-store';
import { parseWiringSheet } from './parse-wiring';
import {
  buildHeaderPairs,
  dataStartRow,
  findHeaderRow,
  scoreSheetHeaders,
} from './excel-headers';

const REQUIRED_FIELDS = ['ferrule'];

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
      sample_rows: unknown[][]; header_row: number;
    }[] = [];
    for (const name of wb.SheetNames) {
      const ws = wb.Sheets[name];
      const rows: unknown[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' }) as unknown[][];
      if (rows.length < 2) continue;

      const headerRow = findHeaderRow(rows);
      const headerPairs = buildHeaderPairs(rows, headerRow);
      if (headerPairs.length < 2) continue;

      const dataStart = dataStartRow(rows, headerRow);

      const rawSampleRows = rows.slice(dataStart, dataStart + 3);
      const sampleRows = rawSampleRows.map(row =>
        headerPairs.map(p => {
          const v = (row as unknown[])[p.idx];
          return v !== null && v !== undefined && String(v).trim() !== '' ? String(v).trim() : '';
        })
      ).filter(r => r.some(v => v !== ''));

      const headers = headerPairs.map(p => p.name);
      const score = scoreSheetHeaders(headers);

      sheets.push({ name, score, headers, sample_rows: sampleRows, header_row: headerRow });
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
  ) {
    const project = await this.prisma.projects.findUnique({ where: { code: projectCode } });
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

    const frameId = `frame_${Date.now()}`;

    // Panel name: from mapped panel column → project name → filename
    let panelName = cables.find(c => c.panel)?.panel || '';
    if (!panelName || panelName.startsWith('=')) {
      panelName = project.name || filename.replace(/\.(xlsx?|xls)$/i, '');
    }

    const frame = {
      id: frameId, project_code: projectCode, panel_name: panelName, cables,
      uploaded_at: new Date().toISOString(), compare_status: 'none' as const,
      original_filename: filename, cable_count: cables.length, mapping, sheet_name: sheetName,
      excel_headers: excelHeaders, header_row: headerRowIdx,
    };
    MockStore.frames.push(frame);
    FrameStore.save(frame, buffer);

    return {
      ...frame,
      cables: undefined,
      message: `Parsed ${cables.length} cables successfully`,
    };
  }

  async uploadDrawing(projectCode: string, buffer: Buffer, filename: string, contentType: string) {
    const project = await this.prisma.projects.findUnique({ where: { code: projectCode } });
    if (!project) throw new BadRequestException(`Project ${projectCode} not found`);

    const hash = crypto.createHash('sha256').update(buffer).digest('hex');
    const existingHash = await this.prisma.file_hashes.findFirst({ where: { file_hash: hash } });
    if (!existingHash) {
      await this.prisma.file_hashes.create({
        data: { file_hash: hash, file_name: filename, file_type: 'drawing', project_code: projectCode },
      });
    }

    const id = `drw_${Date.now()}`;
    const drawing = { id, project_code: projectCode, filename: `${id}_${filename}`, original_name: filename, content_type: contentType, uploaded_at: new Date().toISOString(), size: buffer.length, buffer };
    MockStore.drawings.push(drawing);
    FrameStore.saveDrawing(projectCode, id, filename, buffer);

    const { buffer: _, ...safe } = drawing;
    return safe;
  }

  async uploadDirectorReport(projectCode: string, buffer: Buffer, filename: string, contentType: string) {
    const project = await this.prisma.projects.findUnique({ where: { code: projectCode } });
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
