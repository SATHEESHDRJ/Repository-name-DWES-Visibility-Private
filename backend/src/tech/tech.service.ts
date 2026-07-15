import {
  Injectable, NotFoundException, BadRequestException, ConflictException, ForbiddenException, HttpException, HttpStatus,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { MockStore, type FrameData, type PanelDrawingAsset } from '../data/mock-store';
import { FrameStore } from '../frames/frame-store';
import { buildCompletionReport } from '../common/completion-report.helper';
import { assertPanelNameUniqueForWrite } from '../common/panel-duplicate.helper';
import { wiringKpiPercent } from '../common/kpi.constants';
import * as crypto from 'crypto';

export interface CableStatus { src: boolean; dst: boolean; note: string; issue?: boolean; }

interface MidChangeRequestPayload {
  requestId: string;
  sourceAssignmentId: number;
  targetAssignmentId: number;
  initiatorId: number;
  targetTechnicianId: number;
  createdAt: string;
  reason: string;
}

const OTP_MAX_ATTEMPTS = 5;

function generateOtpCode(): string {
  return Array.from({ length: 6 }, () => Math.floor(Math.random() * 10)).join('');
}

function generateQrIdentity(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code = 'WS-';
  for (let i = 0; i < 6; i++) code += chars[crypto.randomInt(chars.length)];
  return code;
}

function generateQrPayload(projectCode: string, frameId: string, assignmentId: number): string {
  return `WSM:${projectCode}:${frameId}:${assignmentId}`;
}

function parseCS(raw: string | null | undefined): Record<string, CableStatus> {
  try {
    const obj = JSON.parse(raw || '{}');
    // Normalise: ensure `issue` defaults to false for backward compat
    Object.values(obj).forEach((v: any) => { if (v && v.issue === undefined) v.issue = false; });
    return obj;
  } catch { return {}; }
}

function hasCableWork(assignment: {
  cable_status?: string | null;
  cables_src_done?: number | null;
  cables_dst_done?: number | null;
}): boolean {
  if ((assignment.cables_src_done || 0) > 0 || (assignment.cables_dst_done || 0) > 0) return true;
  return Object.values(parseCS(assignment.cable_status)).some(state => Boolean(state?.src || state?.dst));
}

function parseMidChangeDetails(raw: string | null | undefined): MidChangeRequestPayload | null {
  try {
    const value = JSON.parse(raw || '{}') as Partial<MidChangeRequestPayload>;
    if (!value.requestId || !value.sourceAssignmentId || !value.targetAssignmentId
      || !value.initiatorId || !value.targetTechnicianId || !value.createdAt) return null;
    return value as MidChangeRequestPayload;
  } catch {
    return null;
  }
}

function pendingMidChangePayloads(rows: Array<{ action: string; details?: string | null }>): MidChangeRequestPayload[] {
  const requested = new Map<string, MidChangeRequestPayload>();
  const resolved = new Set<string>();
  for (const row of rows) {
    const payload = parseMidChangeDetails(row.details);
    if (!payload) continue;
    if (row.action === 'mid_change_requested') requested.set(payload.requestId, payload);
    else resolved.add(payload.requestId);
  }
  return [...requested.values()].filter(payload => !resolved.has(payload.requestId));
}

@Injectable()
export class TechService {
  constructor(private prisma: PrismaService) {}

  private async logAudit(techId: number, techName: string, projectCode: string, frameId: string, panelName: string, action: string, details: string) {
    await this.prisma.tech_audit_log.create({
      data: { technician_id: techId, technician_name: techName, project_code: projectCode,
              frame_id: frameId, panel_name: panelName, action, details },
    });
  }

  async assignFrame(dto: { project_code: string; frame_id: string; technician_id: number; assigned_by_id: number }) {
    let frame = MockStore.findFrameByProjectAndId(dto.project_code, dto.frame_id);
    if (!frame) {
      const disk = FrameStore.getFrameFromDisk(dto.project_code, dto.frame_id);
      if (!disk) throw new NotFoundException(`Frame ${dto.frame_id} not found`);
      MockStore.frames.push(disk);
      frame = disk;
    }

    const tech = await this.prisma.users.findUnique({ where: { id: dto.technician_id } });
    if (!tech || tech.role !== 'wiring_technician') throw new BadRequestException('Invalid technician');

    const existing = await this.prisma.tech_assignments.findFirst({
      where: {
        project_code: dto.project_code,
        frame_id: dto.frame_id,
        status: { in: ['assigned', 'in_progress', 'paused'] },
        changeover_locked: { not: true },
      },
    });
    if (existing) throw new ConflictException('This panel already has an active technician assignment');

    const technicianActive = await this.prisma.tech_assignments.findFirst({
      where: {
        technician_id: dto.technician_id,
        status: { in: ['assigned', 'in_progress', 'paused'] },
        changeover_locked: { not: true },
      },
    });
    if (technicianActive) throw new ConflictException('This technician is already assigned to an active panel');

    assertPanelNameUniqueForWrite(dto.project_code, dto.frame_id);

    const cablesList = Array.isArray(frame.cables) ? frame.cables : [];
    const cableStatus: Record<string, CableStatus> = {};
    cablesList.forEach((_, i) => { cableStatus[String(i)] = { src: false, dst: false, note: '' }; });

    const assigner = await this.prisma.users.findUnique({ where: { id: dto.assigned_by_id } });

    const otpCode = generateOtpCode();
    const qrCode = generateQrIdentity();
    const otpExpires = new Date(Date.now() + 24 * 60 * 60 * 1000);

    const assignment = await this.prisma.tech_assignments.create({
      data: {
        project_code: dto.project_code, frame_id: dto.frame_id, panel_name: frame.panel_name,
        technician_id: dto.technician_id, assigned_by: dto.assigned_by_id,
        status: 'assigned', cables_total: frame.cable_count || cablesList.length,
        cable_status: JSON.stringify(cableStatus),
        supervisor_approved: true,
        cables_src_done: 0, cables_dst_done: 0,
        is_hidden: false, report_submitted: false,
        rework_requested: false, rework_reason: '', changeover_locked: false,
        qc_status: 'not_ready',
        otp_code: otpCode, qr_code: qrCode, otp_verified: false, qr_panel_verified: false,
        otp_expires_at: otpExpires, otp_attempts: 0,
      },
    });

    const qrPayload = generateQrPayload(dto.project_code, dto.frame_id, assignment.id);
    await this.logAudit(tech.id, tech.full_name || '', dto.project_code, dto.frame_id, frame.panel_name,
      'assigned', `Assigned by ${assigner?.full_name || 'supervisor'} (direct start)`);
    console.log(`[WHATSAPP] Panel "${frame.panel_name}" assigned to ${tech.full_name} (${tech.whatsapp_number})`);
    console.log(`[WHATSAPP] OTP: ${otpCode} | QR identity: ${qrCode} | Panel QR payload: ${qrPayload}`);

    const { hashed_password: _hashed_password, ...safeTech } = tech;
    return {
      assignment: { ...assignment, cable_status: cableStatus },
      technician: safeTech,
      frame: { id: frame.id, panel_name: frame.panel_name },
      otp_code: otpCode, qr_code: qrCode, qr_payload: qrPayload,
    };
  }

  async myPanels(techId: number) {
    const assignments = await this.prisma.tech_assignments.findMany({
      where: {
        technician_id: techId,
        is_hidden: { not: true },
        changeover_locked: { not: true },
      },
      orderBy: { assigned_at: 'desc' },
    });

    // Resolve each assignment's project (code → name/client) in one query (no schema change).
    const codes = [...new Set(assignments.map(a => a.project_code))];
    const projects = codes.length
      ? await this.prisma.projects.findMany({ where: { code: { in: codes } } })
      : [];
    const projectByCode = new Map(projects.map(p => [p.code, p]));

    return assignments.map(a => {
      const frame = this.resolveAssignmentFrame(a.project_code, a.frame_id);
      const project = projectByCode.get(a.project_code);
      const drawingPackage = FrameStore.getDrawingPackage(a.project_code, a.frame_id);
      const drawings = [drawingPackage?.drawing_2d, drawingPackage?.model_3d]
        .filter((d): d is PanelDrawingAsset => !!d)
        .map(d => ({
          id: d.id,
          kind: d.kind,
          original_name: d.original_name,
          content_type: d.content_type,
          uploaded_at: d.uploaded_at,
        }));
      const kpi = wiringKpiPercent(a.cables_src_done || 0, a.cables_dst_done || 0, a.cables_total || 0);
      const {
        otp_code: _otp,
        otp_expires_at: _otpExp,
        otp_attempts: _otpAttempts,
        ...safe
      } = a;
      return {
        ...safe,
        cable_status: undefined,
        frame_cables: frame?.cables || [],
        kpi,
        project_name: project?.name || a.project_code,
        project_client: project?.client || '',
        schedule_file: frame?.original_filename || null,
        drawings,
        drawing_package: drawingPackage ? {
          id: drawingPackage.id,
          revision: drawingPackage.revision,
          drawing_2d: drawingPackage.drawing_2d,
          model_3d: drawingPackage.model_3d,
        } : null,
      };
    });
  }

  async start(assignmentId: number, techId: number) {
    // Direct start: no OTP, QR scan, or supervisor-approval gate (policy DWES_FINAL_NO_START_GATE).
    // verifyOtp() / scanQr() remain available for other flows but are not required here.
    const a = await this.prisma.tech_assignments.findUnique({ where: { id: assignmentId } });
    if (!a) throw new NotFoundException('Assignment not found');
    if (a.technician_id !== techId) throw new BadRequestException('Not your assignment');
    if (a.status === 'in_progress') throw new BadRequestException('Already in progress');
    const other = await this.prisma.tech_assignments.findFirst({
      where: { technician_id: techId, id: { not: assignmentId }, status: 'in_progress' },
    });
    if (other) throw new BadRequestException('You already have another panel in progress');

    const updated = await this.prisma.tech_assignments.update({
      where: { id: assignmentId },
      data: { status: 'in_progress', started_at: a.started_at || new Date() },
    });
    const tech = await this.prisma.users.findUnique({ where: { id: techId } });
    await this.logAudit(techId, tech?.full_name || '', a.project_code, a.frame_id, a.panel_name || '', 'start', 'Wiring started');
    return { ...updated, cable_status: parseCS(updated.cable_status) };
  }

  async pause(assignmentId: number, techId: number, elapsedSeconds: number, reason: string) {
    const a = await this.prisma.tech_assignments.findUnique({ where: { id: assignmentId } });
    if (!a) throw new NotFoundException('Assignment not found');
    if (a.technician_id !== techId) throw new BadRequestException('Not your assignment');
    if (a.status !== 'in_progress') throw new BadRequestException('Assignment is not in progress');

    const updated = await this.prisma.tech_assignments.update({
      where: { id: assignmentId },
      data: { status: 'paused', paused_at: new Date(),
               total_wiring_seconds: (a.total_wiring_seconds || 0) + elapsedSeconds, pause_reason: reason },
    });
    const tech = await this.prisma.users.findUnique({ where: { id: techId } });
    await this.logAudit(techId, tech?.full_name || '', a.project_code, a.frame_id, a.panel_name || '', 'pause', `Paused: ${reason}, time=${elapsedSeconds}s`);
    return { ...updated, cable_status: parseCS(updated.cable_status) };
  }

  async resume(assignmentId: number, techId: number) {
    const a = await this.prisma.tech_assignments.findUnique({ where: { id: assignmentId } });
    if (!a) throw new NotFoundException('Assignment not found');
    if (a.technician_id !== techId) throw new BadRequestException('Not your assignment');
    if (a.status !== 'paused') throw new BadRequestException('Assignment is not paused');
    if (a.changeover_locked) throw new BadRequestException('Assignment is locked for changeover');
    const other = await this.prisma.tech_assignments.findFirst({
      where: { technician_id: techId, id: { not: assignmentId }, status: 'in_progress' },
    });
    if (other) throw new BadRequestException('Complete or pause your other active panel first');

    const updated = await this.prisma.tech_assignments.update({
      where: { id: assignmentId },
      data: { status: 'in_progress', paused_at: null, pause_reason: '' },
    });
    const tech = await this.prisma.users.findUnique({ where: { id: techId } });
    await this.logAudit(techId, tech?.full_name || '', a.project_code, a.frame_id, a.panel_name || '', 'resume', 'Wiring resumed');
    return { ...updated, cable_status: parseCS(updated.cable_status) };
  }

  async complete(assignmentId: number, techId: number) {
    const a = await this.prisma.tech_assignments.findUnique({ where: { id: assignmentId } });
    if (!a) throw new NotFoundException('Assignment not found');
    if (a.technician_id !== techId) throw new BadRequestException('Not your assignment');
    if (!['in_progress', 'paused'].includes(a.status || '')) throw new BadRequestException('Cannot complete from current status');

    const updated = await this.prisma.tech_assignments.update({
      where: { id: assignmentId },
      data: { status: 'completed', completed_at: new Date() },
    });
    const tech = await this.prisma.users.findUnique({ where: { id: techId } });
    const kpi = wiringKpiPercent(a.cables_src_done || 0, a.cables_dst_done || 0, a.cables_total || 0);
    await this.logAudit(techId, tech?.full_name || '', a.project_code, a.frame_id, a.panel_name || '', 'complete', `Completed: KPI=${kpi}%, time=${a.total_wiring_seconds}s`);
    return { ...updated, cable_status: parseCS(updated.cable_status) };
  }

  /** Reopen a completed panel for rework — edit, never reset. Progress
   *  (cable_status, src/dst counters, started_at) is fully preserved; if the
   *  report was already submitted it is un-submitted and review reset so the
   *  supervisor re-reviews. Audit trail appended to review_notes. */
  async rework(assignmentId: number, techId: number, reason: string) {
    const a = await this.prisma.tech_assignments.findUnique({ where: { id: assignmentId } });
    if (!a) throw new NotFoundException('Assignment not found');
    if (a.technician_id !== techId) throw new ForbiddenException('Not your assignment');

    // Idempotent: already reopened → return current state, no writes.
    if (a.status === 'in_progress') {
      return { ...a, cable_status: parseCS(a.cable_status) };
    }
    if (a.status !== 'completed') {
      throw new BadRequestException('Only completed panels can be reworked');
    }

    const wasSubmitted = !!a.report_submitted;
    if (wasSubmitted && !reason.trim()) {
      throw new BadRequestException('A rework reason is required — this report was already submitted for review');
    }

    const tech = await this.prisma.users.findUnique({ where: { id: techId } });
    const techName = tech?.full_name || tech?.username || `tech#${techId}`;

    // APPEND to review_notes (never overwrite); clamp to the column's 500-char
    // limit keeping the newest entries.
    const stamp = `[REWORK ${new Date().toISOString()} by ${techName}]${reason.trim() ? ` reason: ${reason.trim()}` : ''}`;
    let notes = a.review_notes ? `${a.review_notes}\n${stamp}` : stamp;
    if (notes.length > 500) notes = notes.slice(notes.length - 500);

    const data: Record<string, unknown> = {
      status: 'in_progress',
      completed_at: null,
      review_notes: notes,
    };
    if (wasSubmitted) {
      data.report_submitted = false;
      data.report_submitted_at = null;
      if (a.review_status) data.review_status = 'pending';
    }

    const updated = await this.prisma.tech_assignments.update({ where: { id: assignmentId }, data });
    await this.logAudit(
      techId, techName, a.project_code, a.frame_id, a.panel_name || '', 'rework',
      `Reopened for rework${wasSubmitted ? ' (report un-submitted, review reset)' : ''}${reason.trim() ? ` — ${reason.trim()}` : ''}`,
    );
    return { ...updated, cable_status: parseCS(updated.cable_status) };
  }

  async updateCableStatus(assignmentId: number, techId: number, cableIndex: number, field: 'src' | 'dst' | 'note' | 'issue', value: boolean | string) {
    const a = await this.prisma.tech_assignments.findUnique({ where: { id: assignmentId } });
    if (!a) throw new NotFoundException('Assignment not found');
    if (a.technician_id !== techId) throw new BadRequestException('Not your assignment');

    const cs = parseCS(a.cable_status);
    const key = String(cableIndex);
    if (!cs[key]) cs[key] = { src: false, dst: false, note: '' };

    let src_done = a.cables_src_done || 0;
    let dst_done = a.cables_dst_done || 0;

    if (field === 'src' || field === 'dst') {
      cs[key][field] = value as boolean;
      src_done = Object.values(cs).filter(c => c.src).length;
      dst_done = Object.values(cs).filter(c => c.dst).length;
    } else if (field === 'issue') {
      // Additive key: stored inside the same JSON value (no DB column change)
      (cs[key] as any).issue = value as boolean;
    } else {
      cs[key].note = value as string;
    }

    const autoStart = a.status === 'assigned'
      && (field === 'src' || field === 'dst')
      && value === true
      ? { status: 'in_progress', started_at: a.started_at || new Date() }
      : {};
    await this.prisma.tech_assignments.update({
      where: { id: assignmentId },
      data: { cable_status: JSON.stringify(cs), cables_src_done: src_done, cables_dst_done: dst_done, ...autoStart },
    });
    if ('status' in autoStart) {
      const tech = await this.prisma.users.findUnique({ where: { id: techId } });
      await this.logAudit(techId, tech?.full_name || '', a.project_code, a.frame_id, a.panel_name || '', 'start', 'Auto-started on first cable update');
    }
    return { assignment_id: assignmentId, cables_src_done: src_done, cables_dst_done: dst_done };
  }

  async cableAction(assignmentId: number, techId: number, cableIndex: number, action: 'complete' | 'src_only' | 'dst_only' | 'reset_all', note: string) {
    const a = await this.prisma.tech_assignments.findUnique({ where: { id: assignmentId } });
    if (!a) throw new NotFoundException('Assignment not found');
    if (a.technician_id !== techId) throw new BadRequestException('Not your assignment');

    // reset_all: rebuild the entire cable_status to pristine pending state (DEV/demo helper)
    if (action === 'reset_all') {
      if (process.env.DEMO_MODE !== 'true') throw new NotFoundException();
      const resetTotal = this._cableCountForAssignment(a);
      const resetCs: Record<string, any> = {};
      for (let i = 0; i < resetTotal; i++) {
        resetCs[String(i)] = { src: false, dst: false, note: '' };
      }
      await this.prisma.tech_assignments.update({
        where: { id: assignmentId },
        data: { cable_status: JSON.stringify(resetCs), cables_src_done: 0, cables_dst_done: 0 },
      });
      return { assignment_id: assignmentId, cable_index: 0, action, cables_src_done: 0, cables_dst_done: 0 };
    }

    const total = a.cables_total ?? 0;
    if (cableIndex < 0 || (total > 0 && cableIndex >= total)) {
      throw new BadRequestException(`Cable index ${cableIndex} out of range [0, ${total})`);
    }

    const cs = parseCS(a.cable_status);
    const key = String(cableIndex);
    if (!cs[key]) cs[key] = { src: false, dst: false, note: '' };

    if (action === 'complete') { cs[key].src = true; cs[key].dst = true; }
    else if (action === 'src_only') { cs[key].src = true; }
    else if (action === 'dst_only') { cs[key].dst = true; }
    if (note) cs[key].note = note;

    const src_done = Object.values(cs).filter((c: any) => c.src).length;
    const dst_done = Object.values(cs).filter((c: any) => c.dst).length;

    // Auto-start: assigned/paused → in_progress on first cable action
    const autoStart: Record<string, any> = {};
    if (a.status === 'assigned' || a.status === 'paused') {
      autoStart.status = 'in_progress';
      if (!a.started_at) autoStart.started_at = new Date();
    }

    await this.prisma.tech_assignments.update({
      where: { id: assignmentId },
      data: { cable_status: JSON.stringify(cs), cables_src_done: src_done, cables_dst_done: dst_done, ...autoStart },
    });
    const tech = await this.prisma.users.findUnique({ where: { id: techId } });
    if (autoStart.status) {
      await this.logAudit(techId, tech?.full_name || '', a.project_code, a.frame_id, a.panel_name || '', 'start', 'Auto-started on first cable action');
    }
    return { assignment_id: assignmentId, cable_index: cableIndex, action, cables_src_done: src_done, cables_dst_done: dst_done };
  }

  /** DEMO_MODE bulk helpers — single write, same cable_status shape as normal marking. */
  async devCableBulk(
    assignmentId: number,
    techId: number,
    action: 'mark_all_verified' | 'mark_all_with_issues' | 'reset_all',
  ) {
    const a = await this.prisma.tech_assignments.findUnique({ where: { id: assignmentId } });
    if (!a) throw new NotFoundException('Assignment not found');
    if (a.technician_id !== techId) throw new BadRequestException('Not your assignment');

    const total = this._cableCountForAssignment(a);
    if (total <= 0) throw new BadRequestException('No cables on this assignment');

    if (action === 'reset_all') {
      const resetCs: Record<string, CableStatus & { issue?: boolean }> = {};
      for (let i = 0; i < total; i++) {
        resetCs[String(i)] = { src: false, dst: false, note: '' };
      }
      await this.prisma.tech_assignments.update({
        where: { id: assignmentId },
        data: { cable_status: JSON.stringify(resetCs), cables_src_done: 0, cables_dst_done: 0 },
      });
      return {
        action,
        assignment_id: assignmentId,
        cables_total: a.cables_total,
        cables_src_done: 0,
        cables_dst_done: 0,
        cable_status: resetCs,
      };
    }

    const cs: Record<string, CableStatus & { issue?: boolean }> = {};
    for (let i = 0; i < total; i++) {
      cs[String(i)] = { src: true, dst: true, note: '' };
    }

    if (action === 'mark_all_with_issues') {
      const targets = [
        Math.floor(total * 0.1),
        Math.floor(total * 0.5),
        total - 1,
      ].filter((v, i, arr) => arr.indexOf(v) === i);
      const reasons = ['Wrong terminal', 'Wire damaged', 'Missing ferrule'];
      targets.forEach((idx, i) => {
        cs[String(idx)] = { src: true, dst: true, note: reasons[i] || 'Dev test issue', issue: true };
      });
    }

    const autoStart: Record<string, unknown> = {};
    if (a.status === 'assigned' || a.status === 'paused') {
      autoStart.status = 'in_progress';
      if (!a.started_at) autoStart.started_at = new Date();
    }

    await this.prisma.tech_assignments.update({
      where: { id: assignmentId },
      data: {
        cable_status: JSON.stringify(cs),
        cables_src_done: total,
        cables_dst_done: total,
        ...autoStart,
      },
    });

    return {
      action,
      assignment_id: assignmentId,
      cables_total: a.cables_total,
      cables_src_done: total,
      cables_dst_done: total,
      cable_status: cs,
    };
  }

  /**
   * Resolve frame for technician wiring — prefer on-disk JSON when MockStore has a stale
   * or empty cables[] entry (common after re-upload while the in-memory id already exists).
   */
  private resolveAssignmentFrame(projectCode: string, frameId: string): FrameData | null {
    const mem = MockStore.findFrameByProjectAndId(projectCode, frameId)
      ?? MockStore.findFrameById(frameId);
    const disk = FrameStore.getFrameFromDisk(projectCode, frameId);
    const memLen = Array.isArray(mem?.cables) ? mem!.cables.length : 0;
    const diskLen = Array.isArray(disk?.cables) ? disk!.cables.length : 0;

    if (disk && mem) {
      const merged = diskLen >= memLen
        ? { ...mem, ...disk, cables: disk.cables ?? mem.cables }
        : mem;
      if (diskLen > memLen) {
        const idx = MockStore.frames.findIndex(f => f.id === frameId);
        if (idx >= 0) MockStore.frames[idx] = { ...MockStore.frames[idx], ...disk };
      }
      return merged;
    }
    return disk ?? mem ?? null;
  }

  /** Cable count for status writes — frame JSON length when available, else cables_total (never mutates cables_total). */
  private _cableCountForAssignment(a: { project_code: string; frame_id: string; cables_total: number | null }) {
    const frame = this.resolveAssignmentFrame(a.project_code, a.frame_id);
    const fromFrame = Array.isArray(frame?.cables) ? frame!.cables.length : 0;
    const fromDb = a.cables_total ?? 0;
    return Math.max(fromFrame, fromDb);
  }

  async myAssignmentDetail(assignmentId: number, techId: number) {
    const a = await this.prisma.tech_assignments.findUnique({ where: { id: assignmentId } });
    if (!a) throw new NotFoundException('Assignment not found');
    if (a.technician_id !== techId) throw new BadRequestException('Not your assignment');
    const frame = this.resolveAssignmentFrame(a.project_code, a.frame_id);
    const kpi = wiringKpiPercent(a.cables_src_done || 0, a.cables_dst_done || 0, a.cables_total || 0);
    return {
      assignment: { ...a, cable_status: parseCS(a.cable_status) },
      frame: frame ? {
        id: frame.id,
        panel_name: frame.panel_name,
        cables: frame.cables,
        cable_count: frame.cable_count,
        mapping: (frame as any).mapping || {},
        sheet_name: (frame as any).sheet_name || '',
        original_filename: frame.original_filename || '',
        excel_headers: (frame as any).excel_headers || [],
      } : null,
      kpi,
    };
  }

  async report(assignmentId: number, techId: number) {
    const a = await this.prisma.tech_assignments.findUnique({ where: { id: assignmentId } });
    if (!a) throw new NotFoundException('Assignment not found');
    if (a.technician_id !== techId) throw new BadRequestException('Not your assignment');
    const frame = MockStore.findFrameById(a.frame_id);
    const audit = await this.prisma.tech_audit_log.findMany({
      where: { technician_id: techId, frame_id: a.frame_id },
      orderBy: { created_at: 'asc' },
    });
    const cs = parseCS(a.cable_status);
    const kpi = wiringKpiPercent(a.cables_src_done || 0, a.cables_dst_done || 0, a.cables_total || 0);
    const cablesBothDone = Object.values(cs).filter(s => s.src && s.dst).length;
    return {
      panel_name: a.panel_name, project_code: a.project_code,
      cables_total: a.cables_total, cables_src_done: a.cables_src_done, cables_dst_done: a.cables_dst_done,
      cables_both_done: cablesBothDone, total_wiring_seconds: a.total_wiring_seconds,
      review_status: a.review_status, report_submitted: a.report_submitted, status: a.status, kpi,
      audit_trail: audit, cables: frame?.cables || [], cable_status: cs,
    };
  }

  // Full completion report — includes technician details, project details, and panel rollup
  async completionReport(assignmentId: number, techId: number) {
    const a = await this.prisma.tech_assignments.findUnique({ where: { id: assignmentId } });
    if (!a) throw new NotFoundException('Assignment not found');
    if (a.technician_id !== techId) throw new BadRequestException('Not your assignment');
    return buildCompletionReport(a, this.prisma);
  }

  async submitReport(assignmentId: number, techId: number, notes?: string) {
    const a = await this.prisma.tech_assignments.findUnique({ where: { id: assignmentId } });
    if (!a) throw new NotFoundException('Assignment not found');
    if (a.technician_id !== techId) throw new BadRequestException('Not your assignment');
    if (a.status !== 'completed') throw new BadRequestException('Wiring must be completed first');
    await this.prisma.tech_assignments.update({
      where: { id: assignmentId }, data: { report_submitted: true, report_submitted_at: new Date() },
    });
    const tech = await this.prisma.users.findUnique({ where: { id: techId } });
    const trimmedNotes = (notes || '').trim().slice(0, 500);
    await this.logAudit(techId, tech?.full_name || '', a.project_code, a.frame_id, a.panel_name || '', 'report_submitted',
      trimmedNotes ? `Report submitted — notes: ${trimmedNotes}` : 'Report submitted');
    return { message: 'Report submitted successfully' };
  }

  async hide(assignmentId: number, techId: number) {
    const a = await this.prisma.tech_assignments.findUnique({ where: { id: assignmentId } });
    if (!a) throw new NotFoundException('Assignment not found');
    if (a.technician_id !== techId) throw new BadRequestException('Not your assignment');
    if (a.status !== 'completed') {
      throw new BadRequestException('Only completed wiring records can be removed from the dashboard');
    }
    await this.prisma.tech_assignments.update({ where: { id: assignmentId }, data: { is_hidden: true } });
    const tech = await this.prisma.users.findUnique({ where: { id: techId } });
    await this.logAudit(techId, tech?.full_name || '', a.project_code, a.frame_id, a.panel_name || '', 'hide_completed', 'Removed completed record from dashboard');
    return { message: 'Completed record removed from dashboard' };
  }

  async deleteAssignment(assignmentId: number) {
    const a = await this.prisma.tech_assignments.findUnique({ where: { id: assignmentId } });
    if (!a) throw new NotFoundException('Assignment not found');
    assertPanelNameUniqueForWrite(a.project_code, a.frame_id);
    const hasRecordedCableWork = hasCableWork(a);
    // Removal is only allowed until the technician starts. Once started (started_at set —
    // covers in_progress, started-then-paused, and completed) or the first cable update is
    // recorded, the panel can only be handed over via mid-changeover.
    if (
      a.status !== 'assigned'
      || a.started_at != null
      || a.handover_from_id != null
      || a.changeover_locked
      || hasRecordedCableWork
    ) {
      throw new BadRequestException('Cannot remove this assignment — work has already started. Use mid-changeover to hand over to another technician.');
    }
    await this.prisma.tech_assignments.delete({ where: { id: assignmentId } });
    return { message: 'Assignment deleted' };
  }

  private countCableProgress(cableStatus: string | null | undefined, cablesTotal: number | null | undefined) {
    const total = cablesTotal || 0;
    const cs = parseCS(cableStatus);
    let completed = 0;
    for (const st of Object.values(cs)) {
      const s = st as { src?: boolean; dst?: boolean };
      if (s?.src && s?.dst) completed++;
    }
    return {
      completed_cables: completed,
      remaining_cables: Math.max(0, total - completed),
      cables_total: total,
    };
  }

  async changeover(
    oldAssignmentId: number,
    newTechId: number,
    supervisorId: number,
    changeoverReason = '',
    reasonNotes = '',
  ) {
    let old = await this.prisma.tech_assignments.findUnique({ where: { id: oldAssignmentId } });
    if (!old) throw new NotFoundException('Old assignment not found');
    const isStartedHandover = old.status === 'assigned' && old.handover_from_id != null;
    const isAssignedWithWork = old.status === 'assigned' && hasCableWork(old);
    if (!['paused', 'in_progress'].includes(old.status || '') && !isStartedHandover && !isAssignedWithWork) {
      throw new BadRequestException('Work must have started before a mid-changeover');
    }
    if (old.changeover_locked) throw new BadRequestException('Changeover already initiated');

    assertPanelNameUniqueForWrite(old.project_code, old.frame_id);

    const reason = (changeoverReason || '').trim();
    if (!reason) throw new BadRequestException('Changeover reason is required');

    const newTech = await this.prisma.users.findUnique({ where: { id: newTechId } });
    if (!newTech || newTech.role !== 'wiring_technician') throw new BadRequestException('Invalid new technician');
    if (newTechId === old.technician_id) throw new BadRequestException('New technician must be different');

    const changeoverAt = new Date().toISOString();

    const newOtp = generateOtpCode();
    const newQr = generateQrIdentity();
    const otpExpires = new Date(Date.now() + 24 * 60 * 60 * 1000);

    const transfer = await this.prisma.$transaction(async tx => {
      let source = await tx.tech_assignments.findUnique({ where: { id: oldAssignmentId } });
      if (!source) throw new NotFoundException('Old assignment not found');
      const sourceIsStartedHandover = source.status === 'assigned' && source.handover_from_id != null;
      const sourceIsAssignedWithWork = source.status === 'assigned' && hasCableWork(source);
      if (!['paused', 'in_progress'].includes(source.status || '') && !sourceIsStartedHandover && !sourceIsAssignedWithWork) {
        throw new BadRequestException('Work must have started before a mid-changeover');
      }
      if (source.changeover_locked) throw new BadRequestException('Changeover already initiated');

      const newActive = await tx.tech_assignments.findFirst({
        where: {
          technician_id: newTechId,
          status: { in: ['assigned', 'in_progress', 'paused'] },
          changeover_locked: { not: true },
        },
      });
      if (newActive) throw new BadRequestException('Replacement technician is not available');

      if (source.status === 'in_progress' || sourceIsAssignedWithWork) {
        source = await tx.tech_assignments.update({
          where: { id: oldAssignmentId },
          data: {
            status: 'paused',
            paused_at: new Date(),
            pause_reason: `Mid-changeover: ${reason}${reasonNotes.trim() ? ` — ${reasonNotes.trim()}` : ''}`,
          },
        });
      }

      const created = await tx.tech_assignments.create({
        data: {
          project_code: source.project_code, frame_id: source.frame_id, panel_name: source.panel_name,
          technician_id: newTechId, assigned_by: supervisorId, status: 'assigned',
          cables_total: source.cables_total, cables_src_done: source.cables_src_done, cables_dst_done: source.cables_dst_done,
          cable_status: source.cable_status, total_wiring_seconds: source.total_wiring_seconds,
          // Keep the panel's original execution start timestamp across every handover.
          started_at: source.started_at || new Date(changeoverAt),
          supervisor_approved: true, approved_at: new Date(), approved_by: supervisorId,
          handover_from_id: source.id, is_hidden: false, report_submitted: false,
          rework_requested: false, rework_reason: '', changeover_locked: false, qc_status: 'not_ready',
          otp_code: newOtp, qr_code: newQr, otp_verified: false, qr_panel_verified: false,
          otp_expires_at: otpExpires, otp_attempts: 0,
        },
      });

      await tx.tech_assignments.update({
        where: { id: oldAssignmentId },
        data: { changeover_locked: true, handover_to_id: created.id },
      });
      return { source, created };
    });
    old = transfer.source;
    const newAssignment = transfer.created;
    const cableCounts = this.countCableProgress(old.cable_status, old.cables_total);

    const [oldTech, supervisor] = await Promise.all([
      this.prisma.users.findUnique({ where: { id: old.technician_id } }),
      this.prisma.users.findUnique({ where: { id: supervisorId } }),
    ]);
    const notesSuffix = reasonNotes.trim() ? ` | notes=${reasonNotes.trim()}` : '';
    const auditDetails =
      `prev_tech=${old.technician_id}:${oldTech?.full_name || ''} | new_tech=${newTechId}:${newTech.full_name || ''}` +
      ` | reason=${reason}${notesSuffix} | completed=${cableCounts.completed_cables} | remaining=${cableCounts.remaining_cables}` +
      ` | total=${cableCounts.cables_total} | at=${changeoverAt}` +
      ` | supervisor=${supervisorId}:${supervisor?.full_name || ''} | supervisor_confirmed=true`;

    await this.logAudit(old.technician_id, oldTech?.full_name || '', old.project_code, old.frame_id, old.panel_name || '', 'changeover_locked', `Handed over to ${newTech.full_name}`);
    await this.logAudit(old.technician_id, oldTech?.full_name || '', old.project_code, old.frame_id, old.panel_name || '', 'mid_changeover', auditDetails);
    await this.logAudit(newTechId, newTech.full_name || '', newAssignment.project_code, newAssignment.frame_id, newAssignment.panel_name || '', 'assigned', `Changeover from ${oldTech?.full_name} | reason=${reason}`);
    console.log(`[WHATSAPP] Changeover: ${newTech.full_name} (${newTech.whatsapp_number}) assigned to continue panel "${old.panel_name}"`);
    console.log(`[WHATSAPP] Changeover OTP: ${newOtp} | QR: ${newQr}`);

    return {
      message: 'Changeover initiated',
      new_assignment_id: newAssignment.id,
      new_otp: newOtp,
      new_qr: newQr,
      new_tech: newTech.full_name,
      new_tech_id: newTechId,
      old_tech: oldTech?.full_name || '',
      old_tech_id: old.technician_id,
      panel_name: old.panel_name,
      project_code: old.project_code,
      frame_id: old.frame_id,
      changeover_reason: reason,
      changeover_at: changeoverAt,
      supervisor_id: supervisorId,
      supervisor_name: supervisor?.full_name || '',
      supervisor_confirmed: true,
      technician_whatsapp: newTech.whatsapp_number,
      ...cableCounts,
    };
  }

  async midChangeCandidates(technicianId: number) {
    const active = await this.prisma.tech_assignments.findMany({
      where: {
        status: 'in_progress',
        changeover_locked: { not: true },
        is_hidden: { not: true },
      },
      orderBy: { started_at: 'asc' },
    });
    const mine = active.filter(assignment => assignment.technician_id === technicianId);
    const candidates = active.filter(assignment => assignment.technician_id !== technicianId);
    const technicianIds = [...new Set(active.map(assignment => assignment.technician_id))];
    const projectCodes = [...new Set(active.map(assignment => assignment.project_code))];
    const [technicians, projects] = await Promise.all([
      technicianIds.length
        ? this.prisma.users.findMany({ where: { id: { in: technicianIds }, is_active: true } })
        : [],
      projectCodes.length
        ? this.prisma.projects.findMany({ where: { code: { in: projectCodes } } })
        : [],
    ]);
    const technicianMap = new Map(technicians.map(technician => [technician.id, technician]));
    const projectMap = new Map(projects.map(project => [project.code, project]));
    const present = (assignment: typeof active[number]) => ({
      id: assignment.id,
      project_code: assignment.project_code,
      project_name: projectMap.get(assignment.project_code)?.name || assignment.project_code,
      frame_id: assignment.frame_id,
      panel_name: assignment.panel_name || assignment.frame_id,
      technician_id: assignment.technician_id,
      technician_name: technicianMap.get(assignment.technician_id)?.full_name || `Tech #${assignment.technician_id}`,
      technician_username: technicianMap.get(assignment.technician_id)?.username || '',
      cables_total: assignment.cables_total || 0,
      cables_src_done: assignment.cables_src_done || 0,
      cables_dst_done: assignment.cables_dst_done || 0,
      started_at: assignment.started_at,
    });
    return {
      my_assignments: mine.map(present),
      candidates: candidates.map(present),
    };
  }

  async midChangeRequests(technicianId: number) {
    const events = await this.prisma.tech_audit_log.findMany({
      where: { action: { in: ['mid_change_requested', 'mid_change_confirmed', 'mid_change_rejected'] } },
      orderBy: { created_at: 'desc' },
      take: 500,
    });
    const pending = pendingMidChangePayloads(events)
      .filter(request => request.initiatorId === technicianId || request.targetTechnicianId === technicianId);
    if (pending.length === 0) return [];

    const assignmentIds = [...new Set(pending.flatMap(request => [request.sourceAssignmentId, request.targetAssignmentId]))];
    const technicianIds = [...new Set(pending.flatMap(request => [request.initiatorId, request.targetTechnicianId]))];
    const assignments = await this.prisma.tech_assignments.findMany({ where: { id: { in: assignmentIds } } });
    const technicians = await this.prisma.users.findMany({ where: { id: { in: technicianIds } } });
    const assignmentMap = new Map(assignments.map(assignment => [assignment.id, assignment]));
    const technicianMap = new Map(technicians.map(technician => [technician.id, technician]));

    return pending.map(request => {
      const source = assignmentMap.get(request.sourceAssignmentId);
      const target = assignmentMap.get(request.targetAssignmentId);
      return {
        ...request,
        direction: request.targetTechnicianId === technicianId ? 'incoming' : 'outgoing',
        initiator_name: technicianMap.get(request.initiatorId)?.full_name || `Tech #${request.initiatorId}`,
        target_technician_name: technicianMap.get(request.targetTechnicianId)?.full_name || `Tech #${request.targetTechnicianId}`,
        source: source ? {
          project_code: source.project_code,
          frame_id: source.frame_id,
          panel_name: source.panel_name || source.frame_id,
          status: source.status,
        } : null,
        target: target ? {
          project_code: target.project_code,
          frame_id: target.frame_id,
          panel_name: target.panel_name || target.frame_id,
          status: target.status,
        } : null,
      };
    });
  }

  async requestMidChange(technicianId: number, sourceAssignmentId: number, targetAssignmentId: number, reason = '') {
    if (sourceAssignmentId === targetAssignmentId) throw new BadRequestException('Select a different technician and panel');
    const cleanReason = reason.trim().slice(0, 120);
    if (!cleanReason) throw new BadRequestException('Mid Change reason is required');
    const requestId = crypto.randomUUID();
    const createdAt = new Date().toISOString();

    const payload = await this.prisma.$transaction(async tx => {
      const [source, target, initiator, events] = await Promise.all([
        tx.tech_assignments.findUnique({ where: { id: sourceAssignmentId } }),
        tx.tech_assignments.findUnique({ where: { id: targetAssignmentId } }),
        tx.users.findUnique({ where: { id: technicianId } }),
        tx.tech_audit_log.findMany({
          where: { action: { in: ['mid_change_requested', 'mid_change_confirmed', 'mid_change_rejected'] } },
          orderBy: { created_at: 'desc' },
          take: 500,
        }),
      ]);
      if (!source || !target) throw new NotFoundException('One of the active assignments no longer exists');
      if (source.technician_id !== technicianId) throw new ForbiddenException('You can only exchange your own active assignment');
      if (target.technician_id === technicianId) throw new BadRequestException('You cannot select yourself for Mid Change');
      if (source.status !== 'in_progress' || target.status !== 'in_progress'
        || source.changeover_locked || target.changeover_locked) {
        throw new ConflictException('Both technicians must still be actively working before Mid Change can be requested');
      }
      const duplicate = pendingMidChangePayloads(events).find(request => (
        [request.sourceAssignmentId, request.targetAssignmentId].includes(source.id)
        || [request.sourceAssignmentId, request.targetAssignmentId].includes(target.id)
      ));
      if (duplicate) throw new ConflictException('A pending Mid Change already involves one of these assignments');

      const request: MidChangeRequestPayload = {
        requestId,
        sourceAssignmentId: source.id,
        targetAssignmentId: target.id,
        initiatorId: technicianId,
        targetTechnicianId: target.technician_id,
        createdAt,
        reason: cleanReason,
      };
      await tx.tech_audit_log.create({
        data: {
          technician_id: technicianId,
          technician_name: initiator?.full_name || '',
          project_code: source.project_code,
          frame_id: source.frame_id,
          panel_name: source.panel_name || '',
          action: 'mid_change_requested',
          details: JSON.stringify(request),
        },
      });
      return request;
    }, { isolationLevel: 'Serializable' });

    return { message: 'Mid Change request sent for technician confirmation', request: payload };
  }

  async rejectMidChange(technicianId: number, requestId: string) {
    const events = await this.prisma.tech_audit_log.findMany({
      where: { action: { in: ['mid_change_requested', 'mid_change_confirmed', 'mid_change_rejected'] } },
      orderBy: { created_at: 'desc' },
      take: 500,
    });
    const request = pendingMidChangePayloads(events).find(item => item.requestId === requestId);
    if (!request) throw new NotFoundException('Pending Mid Change request not found');
    if (request.targetTechnicianId !== technicianId) throw new ForbiddenException('Only the selected technician can reject this request');
    const technician = await this.prisma.users.findUnique({ where: { id: technicianId } });
    await this.prisma.tech_audit_log.create({
      data: {
        technician_id: technicianId,
        technician_name: technician?.full_name || '',
        action: 'mid_change_rejected',
        details: JSON.stringify(request),
      },
    });
    return { message: 'Mid Change request rejected', request_id: requestId };
  }

  async confirmMidChange(technicianId: number, requestId: string) {
    const changedAt = new Date();
    const result = await this.prisma.$transaction(async tx => {
      const events = await tx.tech_audit_log.findMany({
        where: { action: { in: ['mid_change_requested', 'mid_change_confirmed', 'mid_change_rejected'] } },
        orderBy: { created_at: 'desc' },
        take: 500,
      });
      const request = pendingMidChangePayloads(events).find(item => item.requestId === requestId);
      if (!request) throw new NotFoundException('Pending Mid Change request not found');
      if (request.targetTechnicianId !== technicianId) {
        throw new ForbiddenException('Only the selected technician can confirm this request');
      }

      let source = await tx.tech_assignments.findUnique({ where: { id: request.sourceAssignmentId } });
      let target = await tx.tech_assignments.findUnique({ where: { id: request.targetAssignmentId } });
      if (!source || !target) throw new NotFoundException('One of the assignments no longer exists');
      if (source.technician_id !== request.initiatorId || target.technician_id !== request.targetTechnicianId) {
        throw new ConflictException('Technician assignments changed before confirmation');
      }
      if (source.status !== 'in_progress' || target.status !== 'in_progress'
        || source.changeover_locked || target.changeover_locked) {
        throw new ConflictException('Both technicians must remain actively working until the exchange is confirmed');
      }

      const priorCrossAssignments = await tx.tech_assignments.findMany({
        where: {
          OR: [
            { project_code: target.project_code, frame_id: target.frame_id, technician_id: source.technician_id },
            { project_code: source.project_code, frame_id: source.frame_id, technician_id: target.technician_id },
          ],
        },
        select: { id: true },
      });
      if (priorCrossAssignments.length > 0) {
        throw new ConflictException('This technician/panel interchange already exists in the permanent assignment history');
      }

      const [initiator, targetTechnician] = await Promise.all([
        tx.users.findUnique({ where: { id: request.initiatorId } }),
        tx.users.findUnique({ where: { id: request.targetTechnicianId } }),
      ]);
      const elapsed = (assignment: typeof source) => {
        if (!assignment?.started_at) return assignment?.total_wiring_seconds || 0;
        return (assignment.total_wiring_seconds || 0)
          + Math.max(0, Math.floor((changedAt.getTime() - assignment.started_at.getTime()) / 1000));
      };
      source = await tx.tech_assignments.update({
        where: { id: source.id },
        data: {
          status: 'paused',
          paused_at: changedAt,
          pause_reason: `Mid Change to ${target.panel_name || target.frame_id}`,
          total_wiring_seconds: elapsed(source),
          changeover_locked: true,
        },
      });
      target = await tx.tech_assignments.update({
        where: { id: target.id },
        data: {
          status: 'paused',
          paused_at: changedAt,
          pause_reason: `Mid Change to ${source.panel_name || source.frame_id}`,
          total_wiring_seconds: elapsed(target),
          changeover_locked: true,
        },
      });

      const createContinuation = (
        panel: typeof source,
        incomingTechnicianId: number,
        handoverFromId: number,
      ) => ({
        project_code: panel.project_code,
        frame_id: panel.frame_id,
        panel_name: panel.panel_name,
        technician_id: incomingTechnicianId,
        assigned_by: panel.assigned_by,
        assigned_at: changedAt,
        status: 'in_progress',
        started_at: changedAt,
        cables_total: panel.cables_total,
        cables_src_done: panel.cables_src_done,
        cables_dst_done: panel.cables_dst_done,
        cable_status: panel.cable_status,
        total_wiring_seconds: 0,
        supervisor_approved: true,
        approved_at: panel.approved_at || changedAt,
        approved_by: panel.approved_by || panel.assigned_by,
        handover_from_id: handoverFromId,
        is_hidden: false,
        report_submitted: false,
        rework_requested: false,
        rework_reason: '',
        changeover_locked: false,
        qc_status: 'not_ready',
        otp_code: generateOtpCode(),
        qr_code: generateQrIdentity(),
        otp_verified: false,
        qr_panel_verified: false,
        otp_expires_at: new Date(changedAt.getTime() + 24 * 60 * 60 * 1000),
        otp_attempts: 0,
      });

      const initiatorContinuation = await tx.tech_assignments.create({
        data: createContinuation(target, request.initiatorId, target.id),
      });
      const targetContinuation = await tx.tech_assignments.create({
        data: createContinuation(source, request.targetTechnicianId, source.id),
      });
      await Promise.all([
        tx.tech_assignments.update({ where: { id: source.id }, data: { handover_to_id: targetContinuation.id } }),
        tx.tech_assignments.update({ where: { id: target.id }, data: { handover_to_id: initiatorContinuation.id } }),
      ]);

      const confirmedPayload = JSON.stringify(request);
      await tx.tech_audit_log.createMany({
        data: [
          {
            technician_id: technicianId,
            technician_name: targetTechnician?.full_name || '',
            project_code: target.project_code,
            frame_id: target.frame_id,
            panel_name: target.panel_name || '',
            action: 'mid_change_confirmed',
            details: confirmedPayload,
          },
          {
            technician_id: request.initiatorId,
            technician_name: initiator?.full_name || '',
            project_code: target.project_code,
            frame_id: target.frame_id,
            panel_name: target.panel_name || '',
            action: 'mid_change_swap',
            details: JSON.stringify({ requestId, from: source.id, to: initiatorContinuation.id, at: changedAt.toISOString() }),
          },
          {
            technician_id: request.targetTechnicianId,
            technician_name: targetTechnician?.full_name || '',
            project_code: source.project_code,
            frame_id: source.frame_id,
            panel_name: source.panel_name || '',
            action: 'mid_change_swap',
            details: JSON.stringify({ requestId, from: target.id, to: targetContinuation.id, at: changedAt.toISOString() }),
          },
        ],
      });

      return {
        request,
        changed_at: changedAt.toISOString(),
        initiator_assignment_id: initiatorContinuation.id,
        target_assignment_id: targetContinuation.id,
        initiator_panel_name: target.panel_name || target.frame_id,
        target_panel_name: source.panel_name || source.frame_id,
      };
    }, { isolationLevel: 'Serializable' });

    return { message: 'Mid Change confirmed and both active assignments were interchanged', ...result };
  }

  async verifyOtp(assignmentId: number, techId: number, code: string) {
    const a = await this.prisma.tech_assignments.findUnique({ where: { id: assignmentId } });
    if (!a) throw new NotFoundException('Assignment not found');
    if (a.technician_id !== techId) throw new BadRequestException('Not your assignment');
    if (a.otp_verified) return { verified: true, message: 'Already verified' };

    const storedOtp = a.otp_code || '';
    const storedQr = a.qr_code || '';
    if (!storedOtp && !storedQr) return { verified: true, message: 'No verification required' };

    if (a.otp_expires_at && new Date() > a.otp_expires_at) {
      throw new BadRequestException('OTP has expired. Ask your supervisor to initiate a mid-changeover.');
    }
    const attempts = a.otp_attempts || 0;
    if (attempts >= OTP_MAX_ATTEMPTS) {
      throw new HttpException(`Too many incorrect attempts (${OTP_MAX_ATTEMPTS} max). Contact supervisor.`, HttpStatus.TOO_MANY_REQUESTS);
    }

    const trimmed = (code || '').trim();
    const match = trimmed === storedOtp || trimmed.toUpperCase() === storedQr.toUpperCase();
    if (!match) {
      const newAttempts = attempts + 1;
      await this.prisma.tech_assignments.update({ where: { id: assignmentId }, data: { otp_attempts: newAttempts } });
      const remaining = OTP_MAX_ATTEMPTS - newAttempts;
      throw new BadRequestException(`Incorrect code. ${remaining} attempt${remaining === 1 ? '' : 's'} remaining.`);
    }

    await this.prisma.tech_assignments.update({
      where: { id: assignmentId },
      data: { otp_verified: true, otp_attempts: 0 },
    });
    const tech = await this.prisma.users.findUnique({ where: { id: techId } });
    await this.logAudit(techId, tech?.full_name || '', a.project_code, a.frame_id, a.panel_name || '', 'otp_verified', `Assignment ${assignmentId} identity verified`);
    return { verified: true, message: 'Identity verified' };
  }

  async getQrData(assignmentId: number, techId: number) {
    const a = await this.prisma.tech_assignments.findUnique({ where: { id: assignmentId } });
    if (!a) throw new NotFoundException('Assignment not found');
    if (a.technician_id !== techId) throw new BadRequestException('Not your assignment');
    const qrData = generateQrPayload(a.project_code, a.frame_id, assignmentId);
    return {
      qr_data: qrData,
      qr_img_url: `https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(qrData)}`,
      panel_name: a.panel_name,
      otp_verified: !!a.otp_verified,
      qr_panel_verified: !!a.qr_panel_verified,
    };
  }

  async scanQr(techId: number, qrData: string) {
    const trimmed = (qrData || '').trim();
    if (!trimmed.startsWith('WSM:')) throw new BadRequestException('Invalid QR code format');
    const parts = trimmed.split(':');
    if (parts.length < 4) throw new BadRequestException('Invalid QR code');

    const assignmentId = parseInt(parts[3], 10);
    const a = await this.prisma.tech_assignments.findUnique({ where: { id: assignmentId } });
    if (!a) throw new NotFoundException('Assignment not found for this QR code');
    if (a.technician_id !== techId) throw new BadRequestException('This QR code is not assigned to you');
    if (a.project_code !== parts[1] || a.frame_id !== parts[2]) {
      throw new BadRequestException('QR code does not match assignment');
    }

    await this.prisma.tech_assignments.update({
      where: { id: assignmentId },
      data: { qr_panel_verified: true },
    });
    const tech = await this.prisma.users.findUnique({ where: { id: techId } });
    await this.logAudit(techId, tech?.full_name || '', a.project_code, a.frame_id, a.panel_name || '', 'qr_scan', 'Physical panel QR scanned and verified');
    return {
      verified: true,
      assignment_id: assignmentId,
      panel_name: a.panel_name,
      qr_panel_verified: true,
    };
  }

  async devOtpHint(assignmentId: number, userId: number, role: string) {
    const a = await this.prisma.tech_assignments.findUnique({ where: { id: assignmentId } });
    if (!a) throw new NotFoundException('Assignment not found');
    if (role === 'wiring_technician' && a.technician_id !== userId) {
      throw new ForbiddenException('Not your assignment');
    }
    return {
      otp: a.otp_code || '',
      qr: a.qr_code || '',
      panel: a.panel_name || '',
      verified: !!a.otp_verified,
      attempts: a.otp_attempts || 0,
    };
  }

  async audit(projectCode: string) {
    return this.prisma.tech_audit_log.findMany({
      where: { project_code: projectCode },
      orderBy: { created_at: 'desc' },
    });
  }
}
