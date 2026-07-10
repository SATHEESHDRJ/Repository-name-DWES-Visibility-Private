import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import * as XLSX from 'xlsx';
import * as fs from 'fs';
import * as path from 'path';
import { spawnSync } from 'child_process';
import { MockStore, Cable, CompareResult, FrameData } from '../data/mock-store';
import { PrismaService } from '../prisma/prisma.service';
import { FrameStore } from './frame-store';
import {
  assertPanelNameUniqueForWrite,
  assertPatchPanelNameAllowed,
} from '../common/panel-duplicate.helper';

const normalize = (s: string) => String(s || '').toUpperCase().trim().replace(/\s+/g, '');

const VFY_KW = ['ferrule', 'cable', 'wire', 'source', 'dest', 'terminal', 's.no', 'sno', 'color', 'size', 'length'];

function findHdrRow(rows: unknown[][]): number {
  for (let i = 0; i < Math.min(20, rows.length); i++) {
    const t = (rows[i] as unknown[]).map(c => String(c || '').toLowerCase()).join(' ');
    if (VFY_KW.some(kw => t.includes(kw))) return i;
  }
  const idx = rows.findIndex(r => (r as unknown[]).filter(c => String(c || '').trim()).length >= 3);
  return idx === -1 ? 0 : idx;
}

function buildValidation(cables: Cable[] | undefined | null) {
  if (!cables || !Array.isArray(cables) || cables.length === 0) {
    return { total: 0, ok_count: 0, error_count: 0, issues: {} };
  }
  const issues: Record<number, Record<string, string>> = {};
  for (let i = 0; i < cables.length; i++) {
    const c = cables[i];
    if (!c) continue;
    const ci: Record<string, string> = {};
    if (!c.ferrule?.trim()) ci['ferrule'] = 'Missing ferrule';
    if (!c.source?.trim()) ci['source'] = 'Source not set';
    if (!c.destination?.trim()) ci['destination'] = 'Destination not set';
    if (Object.keys(ci).length) issues[i] = ci;
  }
  const errorCount = Object.values(issues).reduce((s, ci) => s + Object.keys(ci).length, 0);
  return { total: cables.length, ok_count: cables.length - Object.keys(issues).length, error_count: errorCount, issues };
}

// Best-effort content-type from extension (used when MockStore record/content_type is gone after restart)
function inferContentType(name: string): string {
  const ext = (name.split('.').pop() || '').toLowerCase();
  const map: Record<string, string> = {
    pdf: 'application/pdf', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg',
    svg: 'image/svg+xml', bmp: 'image/bmp', tiff: 'image/tiff', tif: 'image/tiff',
    dwg: 'application/acad', dxf: 'image/vnd.dxf',
  };
  return map[ext] || 'application/octet-stream';
}

@Injectable()
export class FramesService {
  constructor(private prisma: PrismaService) {}

  /** True if the technician has any assignment on a frame/panel of this project. */
  async technicianAssignedToProject(projectCode: string, technicianId: number): Promise<boolean> {
    const a = await this.prisma.tech_assignments.findFirst({
      where: { project_code: projectCode, technician_id: technicianId },
      select: { id: true },
    });
    return !!a;
  }

  /** True if the technician is assigned to this specific frame/panel. */
  async technicianAssignedToFrame(projectCode: string, frameId: string, technicianId: number): Promise<boolean> {
    const a = await this.prisma.tech_assignments.findFirst({
      where: { project_code: projectCode, frame_id: frameId, technician_id: technicianId },
      select: { id: true },
    });
    return !!a;
  }

  /** Frame ids the technician may access within a project (read-only). */
  async technicianAssignedFrameIds(projectCode: string, technicianId: number): Promise<string[]> {
    const rows = await this.prisma.tech_assignments.findMany({
      where: { project_code: projectCode, technician_id: technicianId },
      select: { frame_id: true },
    });
    return [...new Set(rows.map(r => r.frame_id))];
  }

  /** Resolve a drawing's bytes for streaming — from MockStore (this session) or disk (post-restart).
   *  Returns null if the id doesn't exist for this project or the file is missing. */
  getDrawingFile(projectCode: string, drawingId: string): { buffer: Buffer; filename: string; contentType: string } | null {
    const mem = MockStore.drawings.find(d => d.id === drawingId && d.project_code === projectCode);
    if (mem?.buffer) {
      return { buffer: mem.buffer, filename: mem.original_name, contentType: mem.content_type || inferContentType(mem.original_name) };
    }
    const disk = FrameStore.getDrawingFile(projectCode, drawingId);
    if (disk) {
      return { buffer: disk.buffer, filename: mem?.original_name || disk.filename, contentType: mem?.content_type || inferContentType(disk.filename) };
    }
    return null;
  }
  findAll(projectCode: string) {
    return MockStore.findFramesByProject(projectCode).map(f => ({
      id: f.id, project_code: f.project_code, panel_name: f.panel_name,
      uploaded_at: f.uploaded_at, compare_status: f.compare_status,
      original_filename: f.original_filename, cable_count: f.cable_count, sheet_name: f.sheet_name,
      panel_type: f.panel_type || null,
      voltage_level: f.voltage_level || null,
      system_type: f.system_type || null,
    }));
  }

  async createPanel(projectCode: string, dto: {
    name: string;
    type?: string;
    voltage_level: string;
    system_type?: string;
  }) {
    const project = await this.prisma.projects.findUnique({ where: { code: projectCode } });
    if (!project || project.is_active === false) {
      throw new NotFoundException(`Project ${projectCode} not found`);
    }

    const name = (dto.name || '').trim();
    if (!name) throw new BadRequestException('Panel name is required');
    const voltageLevel = (dto.voltage_level || '').trim();
    if (!voltageLevel) throw new BadRequestException('Voltage level is required');

    const frameId = `frame_${Date.now()}_0_${Math.random().toString(36).slice(2, 7)}`;
    const frame: FrameData = {
      id: frameId,
      project_code: projectCode,
      panel_name: name,
      cables: [],
      uploaded_at: new Date().toISOString(),
      compare_status: 'none',
      original_filename: '(created with project)',
      cable_count: 0,
      mapping: {},
      sheet_name: '',
      voltage_level: voltageLevel,
      ...(dto.type?.trim() ? { panel_type: dto.type.trim() } : {}),
      ...(dto.system_type?.trim() ? { system_type: dto.system_type.trim() } : {}),
    };
    MockStore.frames.push(frame);
    FrameStore.save(frame);
    return {
      id: frameId,
      project_code: projectCode,
      panel_name: frame.panel_name,
      panel_type: frame.panel_type || null,
      voltage_level: frame.voltage_level || null,
      system_type: frame.system_type || null,
      uploaded_at: frame.uploaded_at,
      compare_status: frame.compare_status,
      original_filename: frame.original_filename,
      cable_count: 0,
      sheet_name: '',
    };
  }

  findOne(projectCode: string, frameId: string) {
    const f = MockStore.findFrameByProjectAndId(projectCode, frameId);
    if (!f) throw new NotFoundException(`Frame ${frameId} not found`);
    const { file_buffer: _file_buffer, ...safe } = f as any;
    return safe;
  }

  remove(projectCode: string, frameId: string) {
    const idx = MockStore.frames.findIndex(f => f.project_code === projectCode && f.id === frameId);
    if (idx === -1) throw new NotFoundException(`Frame ${frameId} not found`);
    FrameStore.remove(projectCode, frameId);
    MockStore.frames.splice(idx, 1);
    return { message: 'Frame deleted' };
  }

  getCompareStatus(projectCode: string, frameId: string) {
    const f = MockStore.findFrameByProjectAndId(projectCode, frameId);
    if (!f) throw new NotFoundException(`Frame ${frameId} not found`);
    return { status: f.compare_status, compare_result: (f as any).compare_result || null, validated: f.compare_status === 'validated' };
  }

  compareVerify(projectCode: string, frameId: string) {
    assertPanelNameUniqueForWrite(projectCode, frameId);
    const f = MockStore.findFrameByProjectAndId(projectCode, frameId);
    if (!f) throw new NotFoundException(`Frame ${frameId} not found`);
    if (f.compare_status === 'validated') return { status: 'validated', message: 'Already validated' };
    const result: CompareResult = {
      total: f.cables.length, matched: f.cables.length, partial: 0, mismatch: 0, missing: 0,
      errors: [], checked_at: new Date().toISOString(),
    };
    (f as any).compare_result = result;
    f.compare_status = 'verified';
    FrameStore.persist(f);
    return { status: 'verified', compare_result: result };
  }

  compareSubmit(projectCode: string, frameId: string) {
    assertPanelNameUniqueForWrite(projectCode, frameId);
    const f = MockStore.findFrameByProjectAndId(projectCode, frameId);
    if (!f) throw new NotFoundException(`Frame ${frameId} not found`);
    if (f.compare_status !== 'verified') throw new BadRequestException('Frame must be verified before submitting');
    f.compare_status = 'validated';
    FrameStore.persist(f);
    return { status: 'validated', message: 'Frame is now available for technician assignment' };
  }

  // ── Verification endpoints ──────────────────────────────────────────────────

  async verifyData(projectCode: string, frameId: string) {
    let f = MockStore.findFrameByProjectAndId(projectCode, frameId);
    if (!f) {
      const disk = FrameStore.getFrameFromDisk(projectCode, frameId);
      if (!disk) throw new NotFoundException(`Frame ${frameId} not found`);
      MockStore.frames.push(disk);
      f = disk;
    }

    let excelHeaders: string[] = [];
    let hasSourceExcel = false;
    const buf = FrameStore.getBuffer(projectCode, frameId);
    if (buf) {
      hasSourceExcel = true;
      try {
        const wb = XLSX.read(buf, { type: 'buffer' });
        const ws = wb.Sheets[f.sheet_name] || wb.Sheets[wb.SheetNames[0]];
        const rows: unknown[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' }) as unknown[][];
        const hdrIdx = findHdrRow(rows);
        excelHeaders = (rows[hdrIdx] as unknown[]).map(h => String(h || '').trim()).filter(Boolean);
      } catch { /* fall back */ }
    }
    if (!excelHeaders.length) excelHeaders = [...new Set(Object.values(f.mapping).filter(Boolean))];

    const cablesList = Array.isArray(f.cables) ? f.cables : [];
    return {
      panel_name: f.panel_name, original_filename: f.original_filename, sheet_name: f.sheet_name,
      mapping: f.mapping || {}, excel_headers: excelHeaders, cables: cablesList,
      cable_count: f.cable_count ?? cablesList.length,
      validation: buildValidation(cablesList), compare_status: f.compare_status, has_source_excel: hasSourceExcel,
    };
  }

  patchCable(projectCode: string, frameId: string, cableIndex: number, field: string, value: string) {
    assertPanelNameUniqueForWrite(projectCode, frameId);
    const f = MockStore.findFrameByProjectAndId(projectCode, frameId);
    if (!f) throw new NotFoundException(`Frame ${frameId} not found`);
    if (cableIndex < 0 || cableIndex >= f.cables.length) throw new BadRequestException('Invalid cable index');

    const ALLOWED = new Set(['ferrule','source','destination','source_device','source_terminal','dest_device','dest_terminal','color','size','length','ref','remarks','sign','rack','panel','path']);
    if (!ALLOWED.has(field)) throw new BadRequestException(`Field "${field}" is not editable`);

    (f.cables[cableIndex] as any)[field] = value;
    if (field === 'source') {
      if (value.includes(':')) { const p = value.split(':'); f.cables[cableIndex].source_device = p.slice(0,-1).join(':'); f.cables[cableIndex].source_terminal = p[p.length-1]; }
      else { f.cables[cableIndex].source_device = value; f.cables[cableIndex].source_terminal = ''; }
    }
    if (field === 'destination') {
      if (value.includes(':')) { const p = value.split(':'); f.cables[cableIndex].dest_device = p.slice(0,-1).join(':'); f.cables[cableIndex].dest_terminal = p[p.length-1]; }
      else { f.cables[cableIndex].dest_device = value; f.cables[cableIndex].dest_terminal = ''; }
    }
    FrameStore.persist(f);
    return { cable: f.cables[cableIndex], cable_index: cableIndex, validation: buildValidation(f.cables) };
  }

  patchPanel(
    projectCode: string,
    frameId: string,
    dto: { panel_name: string; panel_type?: string; voltage_level?: string; system_type?: string },
  ) {
    const name = (dto.panel_name || '').trim();
    if (!name) throw new BadRequestException('Panel name is required');
    const f = MockStore.findFrameByProjectAndId(projectCode, frameId);
    if (!f) throw new NotFoundException(`Frame ${frameId} not found`);
    assertPatchPanelNameAllowed(projectCode, frameId, name);
    f.panel_name = name;
    if (dto.panel_type !== undefined) {
      const t = dto.panel_type.trim();
      if (t) f.panel_type = t;
      else delete f.panel_type;
    }
    if (dto.voltage_level !== undefined) {
      const v = dto.voltage_level.trim();
      if (v) f.voltage_level = v;
      else delete f.voltage_level;
    }
    if (dto.system_type !== undefined) {
      const s = dto.system_type.trim();
      if (s) f.system_type = s;
      else delete f.system_type;
    }
    FrameStore.persist(f);
    return {
      id: f.id,
      panel_name: f.panel_name,
      project_code: f.project_code,
      panel_type: f.panel_type || null,
      voltage_level: f.voltage_level || null,
      system_type: f.system_type || null,
    };
  }

  async remapColumn(projectCode: string, frameId: string, systemField: string, excelHeader: string) {
    assertPanelNameUniqueForWrite(projectCode, frameId);
    const f = MockStore.findFrameByProjectAndId(projectCode, frameId);
    if (!f) throw new NotFoundException(`Frame ${frameId} not found`);

    const buf = FrameStore.getBuffer(projectCode, frameId);
    if (!buf) throw new BadRequestException('Source Excel not available — please edit cells individually');

    const wb = XLSX.read(buf, { type: 'buffer' });
    const ws = wb.Sheets[f.sheet_name] || wb.Sheets[wb.SheetNames[0]];
    const rows: unknown[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' }) as unknown[][];
    const hdrIdx = findHdrRow(rows);
    const rawHeaders = (rows[hdrIdx] as unknown[]).map(h => String(h || '').trim());
    const colIdx = excelHeader ? rawHeaders.indexOf(excelHeader) : -1;
    if (excelHeader && colIdx === -1) throw new BadRequestException(`Column "${excelHeader}" not found`);

    const dataRows = rows.slice(hdrIdx + 1).filter(r => (r as unknown[]).some(c => String(c ?? '').trim()));
    const np = (p: string) => p.replace(/\s*→\s*/g,'->').replace(/\s*->\s*/g,'->').replace(/\s*\/\s*/g,'/').trim();

    dataRows.forEach((row, i) => {
      if (i >= f.cables.length) return;
      const raw = colIdx === -1 ? '' : String((row as unknown[])[colIdx] ?? '').trim();
      const v = ['none','null','n/a','-'].includes(raw.toLowerCase()) ? '' : raw;
      (f.cables[i] as any)[systemField] = v;
      if (systemField === 'path' && v) {
        const n = np(v); const sep = n.includes('->') ? '->' : n.includes('/') ? '/' : null;
        if (sep) { const [s,d] = n.split(sep,2); f.cables[i].source = s.trim(); f.cables[i].destination = d.trim(); }
      }
      if (systemField === 'ferrule' && v.includes('/')) { const [s,d] = v.split('/',2); if (!f.cables[i].source) f.cables[i].source=s.trim(); if (!f.cables[i].destination) f.cables[i].destination=d.trim(); }
      if (systemField === 'source' && v) { if (v.includes(':')) { const p=v.split(':'); f.cables[i].source_device=p.slice(0,-1).join(':'); f.cables[i].source_terminal=p[p.length-1]; } else f.cables[i].source_device=v; }
      if (systemField === 'destination' && v) { if (v.includes(':')) { const p=v.split(':'); f.cables[i].dest_device=p.slice(0,-1).join(':'); f.cables[i].dest_terminal=p[p.length-1]; } else f.cables[i].dest_device=v; }
    });

    delete f.mapping[systemField];
    if (excelHeader) f.mapping[systemField] = excelHeader;
    FrameStore.persist(f);
    return { cables: f.cables, mapping: f.mapping, validation: buildValidation(f.cables) };
  }

  verifyConfirm(projectCode: string, frameId: string) {
    assertPanelNameUniqueForWrite(projectCode, frameId);
    let f = MockStore.findFrameByProjectAndId(projectCode, frameId);
    if (!f) {
      const disk = FrameStore.getFrameFromDisk(projectCode, frameId);
      if (!disk) throw new NotFoundException(`Frame ${frameId} not found`);
      MockStore.frames.push(disk);
      f = disk;
    }
    const now = new Date().toISOString();
    const cablesList = Array.isArray(f.cables) ? f.cables : [];
    const result: CompareResult = { total: cablesList.length, matched: cablesList.length, partial: 0, mismatch: 0, missing: 0, errors: [], checked_at: now };
    (f as any).compare_result = result;
    (f as any).verified = true;
    (f as any).verified_at = now;
    f.compare_status = 'validated';
    FrameStore.persist(f);
    return { status: 'validated', verified: true, verified_at: now, cable_count: cablesList.length, message: 'Frame verified and ready for technician assignment' };
  }

  async compareSourceFile(projectCode: string, frameId: string, excelBuffer: Buffer) {
    let f = MockStore.findFrameByProjectAndId(projectCode, frameId);
    if (!f) {
      const disk = FrameStore.getFrameFromDisk(projectCode, frameId);
      if (!disk) throw new NotFoundException(`Frame ${frameId} not found`);
      MockStore.frames.push(disk);
      f = disk;
    }
    const cablesList = Array.isArray(f.cables) ? f.cables : [];
    if (!cablesList.length) return { mismatches: {}, compared_rows: 0, mismatch_count: 0 };

    try {
      const wb = XLSX.read(excelBuffer, { type: 'buffer' });
      const ws = wb.Sheets[f.sheet_name] || wb.Sheets[wb.SheetNames[0]];
      const rows: unknown[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' }) as unknown[][];
      const hdrIdx = findHdrRow(rows);
      const rawHeaders = (rows[hdrIdx] as unknown[]).map(h => String(h || '').trim());
      const dataRows = rows.slice(hdrIdx + 1).filter(r => (r as unknown[]).some(c => String(c ?? '').trim()));

      const compareFields = ['ferrule', 'source', 'destination', 'color', 'size', 'length', 'ref'];
      const mismatches: Record<number, Record<string, string>> = {};

      for (let i = 0; i < Math.min(dataRows.length, cablesList.length); i++) {
        const row = dataRows[i] as unknown[];
        const cable = cablesList[i];
        if (!cable) continue;
        const cm: Record<string, string> = {};
        for (const field of compareFields) {
          const colName = f.mapping[field];
          if (!colName) continue;
          const colIdx = rawHeaders.indexOf(colName);
          if (colIdx === -1) continue;
          const srcVal = String(row[colIdx] ?? '').trim();
          const parsedVal = String((cable as any)[field] ?? '').trim();
          if (srcVal && parsedVal && srcVal !== parsedVal) {
            cm[field] = `Source: "${srcVal}" ≠ Parsed: "${parsedVal}"`;
          }
        }
        if (Object.keys(cm).length) mismatches[i] = cm;
      }

      return { mismatches, compared_rows: Math.min(dataRows.length, cablesList.length), mismatch_count: Object.keys(mismatches).length };
    } catch {
      return { mismatches: {}, compared_rows: 0, mismatch_count: 0, parse_error: 'Could not parse source file' };
    }
  }

  compareRevert(projectCode: string, frameId: string) {
    const f = MockStore.findFrameByProjectAndId(projectCode, frameId);
    if (!f) throw new NotFoundException(`Frame ${frameId} not found`);
    f.compare_status = 'none';
    (f as any).compare_result = undefined;
    FrameStore.persist(f);
    return { status: 'none', message: 'Frame reverted to unvalidated state' };
  }

  getMapping(projectCode: string, frameId: string) {
    const f = MockStore.findFrameByProjectAndId(projectCode, frameId);
    if (!f) throw new NotFoundException(`Frame ${frameId} not found`);
    return { mapping: f.mapping, sheet_name: f.sheet_name };
  }

  saveMapping(projectCode: string, frameId: string, mapping: Record<string, string>, sheetName: string) {
    assertPanelNameUniqueForWrite(projectCode, frameId);
    const f = MockStore.findFrameByProjectAndId(projectCode, frameId);
    if (!f) throw new NotFoundException(`Frame ${frameId} not found`);
    f.mapping = mapping;
    f.sheet_name = sheetName;
    FrameStore.persist(f);
    return { message: 'Mapping saved' };
  }

  getCables(projectCode: string) {
    const frames = MockStore.findFramesByProject(projectCode);
    return frames.flatMap(f => f.cables.map(c => ({ ...c, frame_id: f.id, panel_name: f.panel_name })));
  }

  getDrawings(projectCode: string) {
    // Drop in-memory rows whose files were removed from disk (prevents stale re-list after delete).
    for (let i = MockStore.drawings.length - 1; i >= 0; i--) {
      const d = MockStore.drawings[i];
      if (d.project_code === projectCode && !FrameStore.getDrawingFilePath(projectCode, d.id)) {
        MockStore.drawings.splice(i, 1);
      }
    }
    // Rehydrate MockStore from disk after restart (files persist; in-memory list does not).
    for (const disk of FrameStore.listDrawingsFromDisk(projectCode)) {
      if (!MockStore.drawings.some(d => d.id === disk.id && d.project_code === projectCode)) {
        MockStore.drawings.push(disk);
      }
    }
    return MockStore.findDrawingsByProject(projectCode).map(d => ({
      id: d.id, project_code: d.project_code, filename: d.filename,
      original_name: d.original_name, content_type: d.content_type, uploaded_at: d.uploaded_at, size: d.size,
    }));
  }

  removeDrawing(projectCode: string, drawingId: string) {
    const idx = MockStore.drawings.findIndex(d => d.project_code === projectCode && d.id === drawingId);
    if (idx === -1) throw new NotFoundException(`Drawing ${drawingId} not found`);
    const drawing = MockStore.drawings[idx];
    FrameStore.removeDrawing(projectCode, drawingId, drawing.original_name || '');
    MockStore.drawings.splice(idx, 1);
    return { message: 'Drawing deleted' };
  }

  getDirectorReports(projectCode: string) {
    return MockStore.findDirectorReportsByProject(projectCode).map(r => ({
      id: r.id, project_code: r.project_code, filename: r.filename,
      original_name: r.original_name, content_type: r.content_type, uploaded_at: r.uploaded_at, size: r.size,
    }));
  }

  getDirectorReportFile(projectCode: string, reportId: string): { buffer: Buffer; filename: string; contentType: string } | null {
    const mem = MockStore.directorReports.find(r => r.id === reportId && r.project_code === projectCode);
    if (mem?.buffer) {
      return { buffer: mem.buffer, filename: mem.original_name, contentType: mem.content_type || 'application/pdf' };
    }
    const disk = FrameStore.getDirectorReportFile(projectCode, reportId);
    if (disk) {
      return { buffer: disk.buffer, filename: mem?.original_name || disk.filename, contentType: mem?.content_type || 'application/pdf' };
    }
    return null;
  }

  removeDirectorReport(projectCode: string, reportId: string) {
    const idx = MockStore.directorReports.findIndex(r => r.project_code === projectCode && r.id === reportId);
    if (idx === -1) throw new NotFoundException(`Director report ${reportId} not found`);
    const report = MockStore.directorReports[idx];
    FrameStore.removeDirectorReport(projectCode, reportId, report.original_name || '');
    MockStore.directorReports.splice(idx, 1);
    return { message: 'Director report deleted' };
  }

  // ── Guarded frame delete (backup-first + phrase confirm) ────────────────────

  async deleteFramePrecheck(projectCode: string, frameId: string) {
    const f = MockStore.findFrameByProjectAndId(projectCode, frameId);
    if (!f) throw new NotFoundException(`Frame ${frameId} not found`);
    const assignmentCount = await this.prisma.tech_assignments.count({
      where: { project_code: projectCode, frame_id: frameId },
    });
    return {
      panel_name: f.panel_name,
      cable_count: f.cables?.length ?? 0,
      original_filename: f.original_filename,
      assignment_count: assignmentCount,
      confirm_phrase: `DELETE FRAME ${f.panel_name.trim()}`,
      backup_note: 'pg_dump of WiringSchemeDB + frame files archived to uploads/backups/ before deletion',
    };
  }

  async deleteFrameGuarded(projectCode: string, frameId: string, confirmedPhrase: string) {
    const f = MockStore.findFrameByProjectAndId(projectCode, frameId);
    if (!f) throw new NotFoundException(`Frame ${frameId} not found`);

    const REQUIRED = `DELETE FRAME ${f.panel_name.trim()}`;
    if ((confirmedPhrase || '').trim() !== REQUIRED) {
      return { error: `Confirmation phrase does not match — type exactly: ${REQUIRED}` };
    }

    const uploadBase = this._resolveUploadDir();
    const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const safeName = f.panel_name.trim().replace(/[^a-zA-Z0-9_\-]/g, '_').slice(0, 40);
    const backupDir = path.join(uploadBase, 'backups');
    fs.mkdirSync(backupDir, { recursive: true });
    const dumpFile = path.join(backupDir, `FRAME_${safeName}_${ts}.dump`);
    const archiveDir = path.join(backupDir, `FRAME_${safeName}_${ts}`);

    const pgDumpExe = process.env.PG_DUMP_PATH || 'C:\\Program Files\\PostgreSQL\\18\\bin\\pg_dump.exe';
    const pgHost    = process.env.PGHOST     || 'localhost';
    const pgPort    = process.env.PGPORT     || '5432';
    const pgUser    = process.env.PGUSER     || 'postgres';
    const pgPass    = process.env.PGPASSWORD || 'postgres';
    const pgDb      = process.env.PGDATABASE || 'WiringSchemeDB';

    const dumpResult = spawnSync(
      pgDumpExe,
      ['-h', pgHost, '-p', pgPort, '-U', pgUser, '-F', 'c', '-f', dumpFile, pgDb],
      { env: { ...process.env, PGPASSWORD: pgPass }, timeout: 120_000 },
    );
    if (dumpResult.status !== 0) {
      const errMsg = dumpResult.stderr?.toString() || dumpResult.error?.message || 'unknown';
      return { error: `pg_dump failed — aborting delete (no files removed). Details: ${errMsg.slice(0, 300)}` };
    }

    fs.mkdirSync(archiveDir, { recursive: true });
    const srcPaths = FrameStore.getFrameFilePaths(projectCode, frameId);
    const archivedFiles: string[] = [];
    for (const src of srcPaths) {
      const dst = path.join(archiveDir, path.basename(src));
      fs.copyFileSync(src, dst);
      archivedFiles.push(path.basename(src));
    }

    // Purge DB rows tied to this frame (panel_inspections → tech_assignments → audit)
    const assignments = await this.prisma.tech_assignments.findMany({
      where: { project_code: projectCode, frame_id: frameId },
      select: { id: true },
    });
    const assignmentIds = assignments.map(a => a.id);
    const inspDel = assignmentIds.length
      ? await this.prisma.panel_inspections.deleteMany({ where: { assignment_id: { in: assignmentIds } } })
      : { count: 0 };
    const assnDel = await this.prisma.tech_assignments.deleteMany({
      where: { project_code: projectCode, frame_id: frameId },
    });
    const auditDel = await this.prisma.tech_audit_log.deleteMany({
      where: { project_code: projectCode, frame_id: frameId },
    });

    const idx = MockStore.frames.findIndex(fr => fr.project_code === projectCode && fr.id === frameId);
    if (idx !== -1) MockStore.frames.splice(idx, 1);
    FrameStore.remove(projectCode, frameId);

    return {
      success: true,
      backup: { dump: dumpFile, archive: archiveDir, files: archivedFiles },
      deleted: {
        panel_name: f.panel_name,
        frame_id: frameId,
        inspections: inspDel.count,
        assignments: assnDel.count,
        audit_logs: auditDel.count,
      },
      message: `Frame "${f.panel_name}" deleted. Backup at backups/FRAME_${safeName}_${ts}.dump`,
      ts: new Date().toISOString(),
    };
  }

  // ── Guarded drawing delete (backup-first + phrase confirm) ──────────────────

  async deleteDrawingPrecheck(projectCode: string, drawingId: string) {
    const d = MockStore.drawings.find(dr => dr.project_code === projectCode && dr.id === drawingId);
    if (!d) throw new NotFoundException(`Drawing ${drawingId} not found`);
    return {
      original_name: d.original_name,
      size: d.size,
      confirm_phrase: `DELETE DRAWING ${d.original_name.trim()}`,
      backup_note: 'pg_dump of WiringSchemeDB + drawing file archived to uploads/backups/ before deletion',
    };
  }

  async deleteDrawingGuarded(projectCode: string, drawingId: string, confirmedPhrase: string) {
    const d = MockStore.drawings.find(dr => dr.project_code === projectCode && dr.id === drawingId);
    if (!d) throw new NotFoundException(`Drawing ${drawingId} not found`);

    const REQUIRED = `DELETE DRAWING ${d.original_name.trim()}`;
    if ((confirmedPhrase || '').trim() !== REQUIRED) {
      return { error: `Confirmation phrase does not match — type exactly: ${REQUIRED}` };
    }

    const uploadBase = this._resolveUploadDir();
    const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const safeName = d.original_name.trim().replace(/[^a-zA-Z0-9_\-\.]/g, '_').slice(0, 40);
    const backupDir = path.join(uploadBase, 'backups');
    fs.mkdirSync(backupDir, { recursive: true });
    const dumpFile = path.join(backupDir, `DRAWING_${safeName}_${ts}.dump`);
    const archiveDir = path.join(backupDir, `DRAWING_${safeName}_${ts}`);

    const pgDumpExe = process.env.PG_DUMP_PATH || 'C:\\Program Files\\PostgreSQL\\18\\bin\\pg_dump.exe';
    const pgHost    = process.env.PGHOST     || 'localhost';
    const pgPort    = process.env.PGPORT     || '5432';
    const pgUser    = process.env.PGUSER     || 'postgres';
    const pgPass    = process.env.PGPASSWORD || 'postgres';
    const pgDb      = process.env.PGDATABASE || 'WiringSchemeDB';

    const dumpResult = spawnSync(
      pgDumpExe,
      ['-h', pgHost, '-p', pgPort, '-U', pgUser, '-F', 'c', '-f', dumpFile, pgDb],
      { env: { ...process.env, PGPASSWORD: pgPass }, timeout: 120_000 },
    );
    if (dumpResult.status !== 0) {
      const errMsg = dumpResult.stderr?.toString() || dumpResult.error?.message || 'unknown';
      return { error: `pg_dump failed — aborting delete (drawing not removed). Details: ${errMsg.slice(0, 300)}` };
    }

    fs.mkdirSync(archiveDir, { recursive: true });
    const drawingPath = FrameStore.getDrawingFilePath(projectCode, drawingId);
    let archivedFile: string | null = null;
    if (drawingPath && fs.existsSync(drawingPath)) {
      const dst = path.join(archiveDir, path.basename(drawingPath));
      fs.copyFileSync(drawingPath, dst);
      archivedFile = path.basename(drawingPath);
    }

    const idx = MockStore.drawings.findIndex(dr => dr.project_code === projectCode && dr.id === drawingId);
    if (idx !== -1) MockStore.drawings.splice(idx, 1);
    FrameStore.removeDrawing(projectCode, drawingId, d.original_name || '');

    return {
      success: true,
      backup: { dump: dumpFile, archive: archiveDir, file: archivedFile },
      deleted: { original_name: d.original_name, drawing_id: drawingId },
      message: `Drawing "${d.original_name}" deleted. Backup at backups/DRAWING_${safeName}_${ts}.dump`,
      ts: new Date().toISOString(),
    };
  }

  private _resolveUploadDir(): string {
    const raw = process.env.UPLOAD_DIR || 'uploads';
    return path.isAbsolute(raw) ? raw : path.resolve(process.cwd(), raw);
  }
}
