import {
  Injectable, NotFoundException, BadRequestException, ConflictException, ForbiddenException, HttpException, HttpStatus, Optional,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { MockStore, type FrameData, type PanelDrawingAsset } from '../data/mock-store';
import { FrameStore } from '../frames/frame-store';
import { buildCompletionReport } from '../common/completion-report.helper';
import { assertPanelNameUniqueForWrite } from '../common/panel-duplicate.helper';
import { wiringKpiPercent } from '../common/kpi.constants';
import {
  CRIMPING_NOT_COMPLETED_CODE,
  crimpingGateMessage,
  isWiringLockedByCrimping,
  isReadyForWiring,
  markPrepOperation,
  markWirePrepared,
  markWireCut,
  markBothEndsStripped,
  markWireCrimped,
  resolveLegacyPartial,
  normalizeCrimping,
  projectWirePrep,
  setCrimpingRequired,
  summarizeCrimpingKpis,
  aggregateCrimpingKpis,
  markPrepReworkRequired,
  markPrepReworkWithAffectedEnd,
  type ReworkAffectedEnd,
  type CrimpingOperation,
  type CrimpingState,
  type CrimpingMarkResult,
} from '../common/crimping';
import { mapAuditActionToCanonical } from '../common/prep-events';
import { getCrimpingReport, resolvePermanentWireId } from '../common/crimping-report';
import * as crypto from 'crypto';
import { GaFoundationService } from '../ga-foundation/ga-foundation.service';
import {
  CORRECTABLE_FIELDS,
  CORRECTABLE_FIELD_LABELS,
  WireCorrectionsStore,
  applyCorrectionsToCable,
  readCableFieldValue,
  type CorrectableField,
} from './wire-corrections.store';
import * as path from 'path';
import {
  buildAssignmentActionPolicy as buildAssignmentActionPolicyFn,
  deriveAssignmentLifecycle,
  isAssignableBeforeStart,
  type AssignmentActionPolicy,
  type AssignmentLifecycle,
} from '../common/assignment-lifecycle';

export interface CableStatus {
  src: boolean;
  dst: boolean;
  note: string;
  issue?: boolean;
  technicianId?: number;
  /** Intentionally open end(s) — additive JSON, no schema change. Survives FINISHED. */
  openEnd?: 'source' | 'destination' | 'both' | null;
  /** Technician field correction applied (overlay; original schedule preserved). */
  corrected?: boolean;
  /** Latest correction comment for UI badge / card. */
  correctionComment?: string;
  /** Crimping execution — additive JSON; independent from src/dst wiring. */
  crimping?: CrimpingState;
}

export interface MidChangeRequestPayload {
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
    // Normalise: ensure `issue` defaults to false for backward compat;
    // normalize additive crimping JSON (OPEN END → NOT_APPLICABLE).
    Object.values(obj).forEach((v: any) => {
      if (!v || typeof v !== 'object') return;
      if (v.issue === undefined) v.issue = false;
      if (v.crimping != null || v.openEnd) {
        v.crimping = normalizeCrimping(v.crimping, v.openEnd ?? null);
      }
    });
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

/**
 * Technician schedules must use the exact uploaded Excel labels. Older frame
 * metadata can contain labels merged with the descriptive row beneath the real
 * header (for example, "S.NO SERIAL NUMBER"), while every parsed record keeps
 * its original labels in `_raw`. Prefer the stored order only when every label
 * still resolves to an original raw key; otherwise recover that exact raw order.
 */
function technicianExcelHeaders(frame: FrameData): string[] {
  const stored = Array.isArray(frame.excel_headers)
    ? frame.excel_headers.filter((header): header is string => typeof header === 'string' && header.trim().length > 0)
    : [];
  const rawHeaders: string[] = [];
  const seen = new Set<string>();

  for (const cable of Array.isArray(frame.cables) ? frame.cables : []) {
    const raw = cable?._raw;
    if (!raw || typeof raw !== 'object') continue;
    for (const header of Object.keys(raw)) {
      if (!header.trim() || seen.has(header)) continue;
      seen.add(header);
      rawHeaders.push(header);
    }
  }

  if (!rawHeaders.length) return stored;
  if (stored.length && stored.every(header => seen.has(header))) return stored;
  return rawHeaders;
}


@Injectable()
export class TechService {
  constructor(
    private prisma: PrismaService,
    @Optional() private readonly gaFoundation?: GaFoundationService,
  ) {}

  private async logAudit(techId: number, techName: string, projectCode: string, frameId: string, panelName: string, action: string, details: string) {
    await this.prisma.tech_audit_log.create({
      data: { technician_id: techId, technician_name: techName, project_code: projectCode,
              frame_id: frameId, panel_name: panelName, action, details },
    });
  // Dual-write canonical prep event type when the action maps (never invent from FINISHED alone).
  const canon = mapAuditActionToCanonical(action);
  if (canon && canon !== action) {
    await this.prisma.tech_audit_log.create({
      data: {
        technician_id: techId,
        technician_name: techName,
        project_code: projectCode,
        frame_id: frameId,
        panel_name: panelName,
        action: canon,
        details: `${details} [canonical:${canon}]`,
      },
    });
  }
  // Whole-wire strip fans out to both ends (never invents from FINISHED).
  if (String(action) === 'wire_stripped') {
    for (const both of ['DST_STRIPPED'] as const) {
      await this.prisma.tech_audit_log.create({
        data: {
          technician_id: techId,
          technician_name: techName,
          project_code: projectCode,
          frame_id: frameId,
          panel_name: panelName,
          action: both,
          details: `${details} [canonical:${both}]`,
        },
      });
    }
  }
}

  /** Public wrapper — pure lifecycle from assignment row. */
  getAssignmentLifecycle(assignment: Parameters<typeof deriveAssignmentLifecycle>[0]): AssignmentLifecycle {
    return deriveAssignmentLifecycle(assignment);
  }

  /** Public wrapper — action flags + lifecycle for UI/API. */
  buildAssignmentActionPolicy(assignment: Parameters<typeof buildAssignmentActionPolicyFn>[0]): AssignmentActionPolicy {
    return buildAssignmentActionPolicyFn(assignment);
  }

  /**
   * Reject mutations on closed transfer rows (reassigned / mid_changed / changeover_locked)
   * so the previous technician cannot keep acting after Reassign or Mid Change.
   */
  private assertWritableAssignment(
    assignment: {
      status?: string | null;
      changeover_locked?: boolean | null;
      technician_id?: number;
    },
    techId?: number,
  ): void {
    if (techId != null && assignment.technician_id !== techId) {
      throw new BadRequestException('Not your assignment');
    }
    const status = String(assignment.status || '').toLowerCase();
    if (assignment.changeover_locked || status === 'mid_changed' || status === 'reassigned') {
      throw new ConflictException({
        message: 'This assignment was transferred. You no longer have access — use your active assignment.',
        status: assignment.status,
        lifecycle: this.getAssignmentLifecycle(assignment),
      });
    }
    if (status === 'completed') {
      throw new BadRequestException('Assignment is already completed');
    }
  }

  /**
   * Keep panel_workflow WIRING stage assignees aligned with the active tech_assignments row.
   * Best-effort: missing workflow/stage is a no-op (no throw).
   */
  async syncWiringStageAssignee(
    projectCode: string,
    frameId: string,
    technicianId: number,
    assignedById: number,
  ): Promise<void> {
    try {
      const workflow = await this.prisma.panel_workflows.findUnique({
        where: {
          project_code_frame_id: {
            project_code: String(projectCode || '').trim(),
            frame_id: String(frameId || '').trim(),
          },
        },
        include: { stages: true },
      });
      if (!workflow) return;

      const wiringStage = (workflow.stages || []).find(
        (s) => String(s.stage_key || '').toUpperCase() === 'WIRING',
      );
      if (!wiringStage) return;

      await this.prisma.panel_workflow_stage_assignees.deleteMany({
        where: {
          stage_id: wiringStage.id,
          user_id: { not: technicianId },
        },
      });

      const existing = await this.prisma.panel_workflow_stage_assignees.findUnique({
        where: {
          stage_id_user_id: {
            stage_id: wiringStage.id,
            user_id: technicianId,
          },
        },
      });
      if (!existing) {
        await this.prisma.panel_workflow_stage_assignees.create({
          data: {
            stage_id: wiringStage.id,
            user_id: technicianId,
            role_hint: 'wiring_technician',
            assigned_by: assignedById,
          },
        });
      }
    } catch (err) {
      console.warn(
        `[syncWiringStageAssignee] best-effort failed for ${projectCode}/${frameId} tech=${technicianId}:`,
        (err as Error)?.message || err,
      );
    }
  }

  async assignFrame(dto: { project_code: string; frame_id: string; technician_id: number; assigned_by_id: number }) {
    let frame = MockStore.findFrameByProjectAndId(dto.project_code, dto.frame_id);
    if (!frame) {
      const disk = FrameStore.getFrameFromDisk(dto.project_code, dto.frame_id);
      if (!disk) throw new NotFoundException(`Frame ${dto.frame_id} not found`);
      MockStore.frames.push(disk);
      frame = disk;
    }

    await this.gaFoundation?.assertPanelReleased(dto.project_code, dto.frame_id);

    const tech = await this.prisma.users.findUnique({ where: { id: dto.technician_id } });
    if (!tech || tech.role !== 'wiring_technician') throw new BadRequestException('Invalid technician');
    if (tech.is_active === false) throw new BadRequestException('This technician account is deactivated and cannot receive assignments');

    const cablesList = Array.isArray(frame.cables) ? frame.cables : [];
    const cablesTotal = Number(frame.cable_count) || cablesList.length;
    if (!cablesTotal) {
      throw new BadRequestException('Upload the panel wiring schedule before assigning a technician.');
    }

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

    const cableStatus: Record<string, CableStatus> = {};
    cablesList.forEach((_, i) => { cableStatus[String(i)] = { src: false, dst: false, note: '' }; });

    const assigner = await this.prisma.users.findUnique({ where: { id: dto.assigned_by_id } });

    const otpCode = generateOtpCode();
    const qrCode = generateQrIdentity();
    const otpExpires = new Date(Date.now() + 24 * 60 * 60 * 1000);

    let assignment;
    try {
      assignment = await this.prisma.$transaction(async tx => {
        const [panelActive, technicianStillActive] = await Promise.all([
          tx.tech_assignments.findFirst({
            where: {
              project_code: dto.project_code,
              frame_id: dto.frame_id,
              status: { in: ['assigned', 'in_progress', 'paused'] },
              changeover_locked: { not: true },
            },
          }),
          tx.tech_assignments.findFirst({
            where: {
              technician_id: dto.technician_id,
              status: { in: ['assigned', 'in_progress', 'paused'] },
              changeover_locked: { not: true },
            },
          }),
        ]);
        if (panelActive) throw new ConflictException('This panel already has an active technician assignment');
        if (technicianStillActive) throw new ConflictException('This technician is already assigned to an active panel');
        return tx.tech_assignments.create({
          data: {
            project_code: dto.project_code, frame_id: dto.frame_id, panel_name: frame.panel_name,
            technician_id: dto.technician_id, assigned_by: dto.assigned_by_id,
            status: 'assigned', cables_total: cablesTotal,
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
      }, { isolationLevel: 'Serializable' });
    } catch (error: any) {
      if (error?.code === 'P2034') {
        throw new ConflictException('Assignment availability changed. Refresh and select an available technician again.');
      }
      throw error;
    }

    const qrPayload = generateQrPayload(dto.project_code, dto.frame_id, assignment.id);
    await this.logAudit(tech.id, tech.full_name || '', dto.project_code, dto.frame_id, frame.panel_name,
      'assigned', `Assigned by ${assigner?.full_name || 'supervisor'} (direct start)`);
    console.log(`[WHATSAPP] Panel "${frame.panel_name}" assigned to ${tech.full_name} (${tech.whatsapp_number})`);
    console.log(`[WHATSAPP] OTP: ${otpCode} | QR identity: ${qrCode} | Panel QR payload: ${qrPayload}`);

    await this.syncWiringStageAssignee(
      dto.project_code,
      dto.frame_id,
      dto.technician_id,
      dto.assigned_by_id,
    );

    const { hashed_password: _hashed_password, ...safeTech } = tech;
    return {
      assignment: { ...assignment, cable_status: cableStatus },
      technician: safeTech,
      frame: { id: frame.id, panel_name: frame.panel_name },
      otp_code: otpCode, qr_code: qrCode, qr_payload: qrPayload,
      lifecycle: this.getAssignmentLifecycle(assignment),
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
      ? await this.prisma.projects.findMany({ where: { code: { in: codes }, is_active: true } })
      : [];
    const projectByCode = new Map(projects.map(p => [p.code, p]));

    return assignments
      .filter(a => {
        if (!projectByCode.has(a.project_code)) return false;
        if (FrameStore.isBlocked(a.project_code, a.frame_id)) return false;
        return true;
      })
      .map(a => {
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
        // Panel metadata for the technician Current Assignment card (frame file, no schema change).
        panel_type: (frame as any)?.panel_type || null,
        voltage_level: (frame as any)?.voltage_level || null,
        system_type: (frame as any)?.system_type || null,
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
    this.assertWritableAssignment(a, techId);
    await this.gaFoundation?.assertPanelReleased(a.project_code, a.frame_id);
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
    this.assertWritableAssignment(a, techId);
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
    this.assertWritableAssignment(a, techId);
    if (a.status !== 'paused') throw new BadRequestException('Assignment is not paused');
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
    this.assertWritableAssignment(a, techId);
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
    await this.gaFoundation?.assertPanelReleased(a.project_code, a.frame_id);

    const cs = parseCS(a.cable_status);
    const key = String(cableIndex);
    if (!cs[key]) cs[key] = { src: false, dst: false, note: '' };

    // Continuation segments (Mid Change) must not undo work recorded by the
    // previous technician — checks completed before the handover are immutable.
    if ((field === 'src' || field === 'dst') && value === false && a.handover_from_id != null) {
      const baseline = await this._handoverBaseline(a.handover_from_id);
      if (baseline[key]?.[field]) {
        throw new ForbiddenException(
          'This cable check was completed by the previous technician before the Mid Change and cannot be modified',
        );
      }
    }

    let src_done = a.cables_src_done || 0;
    let dst_done = a.cables_dst_done || 0;

    if (field === 'src' || field === 'dst') {
      if (value === true) {
        this._assertWiringUnlockedByCrimping(cs[key], cableIndex);
      }
      cs[key][field] = value as boolean;
      if (value === true) {
        cs[key].technicianId = techId;
      } else if (!cs[key].src && !cs[key].dst) {
        delete cs[key].technicianId;
      }
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

  async cableAction(
    assignmentId: number,
    techId: number,
    cableIndex: number,
    action: 'complete' | 'src_only' | 'dst_only' | 'reset_all' | 'skip' | 'flag_issue' | 'source_end_open' | 'destination_end_open',
    note: string,
  ) {
    const a = await this.prisma.tech_assignments.findUnique({ where: { id: assignmentId } });
    if (!a) throw new NotFoundException('Assignment not found');
    this.assertWritableAssignment(a, techId);
    await this.gaFoundation?.assertPanelReleased(a.project_code, a.frame_id);

    // skip / flag_issue: audit-only actions. The cable stays pending — src/dst and
    // the completed-cable KPI are never touched, no auto-start is triggered, and the
    // skip is recorded (who / when / why) in the per-cable note plus the immutable
    // tech_audit_log. Skip = move on without completing; the cable can be returned to.
    if (action === 'skip' || action === 'flag_issue') {
      const auditTotal = a.cables_total ?? 0;
      if (cableIndex < 0 || (auditTotal > 0 && cableIndex >= auditTotal)) {
        throw new BadRequestException(`Cable index ${cableIndex} out of range [0, ${auditTotal})`);
      }
      const reason = (note || '').trim();
      if (action === 'skip' && reason.length < 3) {
        throw new BadRequestException('Skip reason must be at least 3 characters');
      }
      const auditCs = parseCS(a.cable_status);
      const auditKey = String(cableIndex);
      if (!auditCs[auditKey]) auditCs[auditKey] = { src: false, dst: false, note: '' };
      const stamp = new Date().toISOString();
      const entry = action === 'skip' ? `[SKIPPED ${stamp}] ${reason}` : `[MAPPING ISSUE ${stamp}] ${reason}`;
      auditCs[auditKey].note = auditCs[auditKey].note ? `${auditCs[auditKey].note}\n${entry}` : entry;
      if (action === 'flag_issue') auditCs[auditKey].issue = true;
      await this.prisma.tech_assignments.update({
        where: { id: assignmentId },
        data: { cable_status: JSON.stringify(auditCs) },
      });
      const auditTech = await this.prisma.users.findUnique({ where: { id: techId } });
      await this.logAudit(
        techId, auditTech?.full_name || '', a.project_code, a.frame_id, a.panel_name || '',
        action === 'skip' ? 'cable_skip' : 'cable_mapping_issue',
        `Cable ${cableIndex + 1}: ${reason || '(no reason given)'}`,
      );
      return {
        assignment_id: assignmentId, cable_index: cableIndex, action,
        cables_src_done: a.cables_src_done ?? 0, cables_dst_done: a.cables_dst_done ?? 0,
      };
    }

    // reset_all: rebuild the entire cable_status to pristine pending state (DEV/demo helper).
    // Continuations reset only to the Mid Change handover baseline — the previous
    // technician's completed checks are immutable even in demo mode.
    if (action === 'reset_all') {
      if (process.env.DEMO_MODE !== 'true') throw new NotFoundException();
      const resetTotal = this._cableCountForAssignment(a);
      const resetBaseline = await this._handoverBaseline(a.handover_from_id);
      const resetCs: Record<string, any> = {};
      for (let i = 0; i < resetTotal; i++) {
        const resetKey = String(i);
        resetCs[resetKey] = resetBaseline[resetKey]
          ? { ...resetBaseline[resetKey] }
          : { src: false, dst: false, note: '' };
      }
      const resetSrc = Object.values(resetCs).filter((c: any) => c.src).length;
      const resetDst = Object.values(resetCs).filter((c: any) => c.dst).length;
      await this.prisma.tech_assignments.update({
        where: { id: assignmentId },
        data: { cable_status: JSON.stringify(resetCs), cables_src_done: resetSrc, cables_dst_done: resetDst },
      });
      return { assignment_id: assignmentId, cable_index: 0, action, cables_src_done: resetSrc, cables_dst_done: resetDst };
    }

    const total = a.cables_total ?? 0;
    if (cableIndex < 0 || (total > 0 && cableIndex >= total)) {
      throw new BadRequestException(`Cable index ${cableIndex} out of range [0, ${total})`);
    }

    const cs = parseCS(a.cable_status);
    const key = String(cableIndex);
    if (!cs[key]) cs[key] = { src: false, dst: false, note: '' };

    const stamp = new Date().toISOString();
    let auditAction = '';
    let auditDetails = '';

    if (action === 'complete' || action === 'src_only' || action === 'dst_only') {
      this._assertWiringUnlockedByCrimping(cs[key], cableIndex);
    }

    if (action === 'complete') {
      cs[key].src = true;
      cs[key].dst = true;
      cs[key].technicianId = techId;
      // Preserve intentional open-end marker through FINISHED (combined status).
      if (note) cs[key].note = note;
      auditAction = 'WIRING_FINISHED';
      auditDetails = `Cable ${cableIndex + 1}: wiring finished`;
    } else if (action === 'src_only') {
      cs[key].src = true;
      cs[key].technicianId = techId;
      if (note) cs[key].note = note;
    } else if (action === 'dst_only') {
      cs[key].dst = true;
      cs[key].technicianId = techId;
      if (note) cs[key].note = note;
    } else if (action === 'source_end_open' || action === 'destination_end_open') {
      // Record open side immediately without completing the wire; FINISHED later preserves it.
      cs[key].technicianId = techId;
      const existingNote = cs[key].note || '';
      const hasSrcOpen = cs[key].openEnd === 'source' || cs[key].openEnd === 'both'
        || /\[SOURCE END OPEN /.test(existingNote);
      const hasDstOpen = cs[key].openEnd === 'destination' || cs[key].openEnd === 'both'
        || /\[DESTINATION END OPEN /.test(existingNote);
      if (action === 'source_end_open') {
        cs[key].openEnd = hasDstOpen ? 'both' : 'source';
      } else {
        cs[key].openEnd = hasSrcOpen ? 'both' : 'destination';
      }
      const openLabel = action === 'source_end_open' ? 'SOURCE END OPEN' : 'DESTINATION END OPEN';
      const openMsg = action === 'source_end_open'
        ? 'Source end intentionally not terminated'
        : 'Destination end intentionally not terminated';
      const entry = `[${openLabel} ${stamp}] ${openMsg}`;
      cs[key].note = existingNote ? `${existingNote}\n${entry}` : entry;
      if (note.trim()) cs[key].note = `${cs[key].note}\n${note.trim()}`;
      auditAction = action === 'source_end_open' ? 'cable_src_open' : 'cable_dst_open';
      auditDetails = `Cable ${cableIndex + 1}: ${openMsg}`;
    }
    if (note && action !== 'source_end_open' && action !== 'destination_end_open') {
      cs[key].note = note;
    }

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
    if (auditAction) {
      await this.logAudit(
        techId, tech?.full_name || '', a.project_code, a.frame_id, a.panel_name || '',
        auditAction, auditDetails,
      );
    }

    // LIVE ENDPOINT / report: publish previous + next active wire ids on FINISHED/SKIP advance.
    const frame = FrameStore.getFrameFromDisk(a.project_code, a.frame_id);
    const scheduleCables: any[] = Array.isArray((frame as any)?.cables) ? (frame as any).cables : [];
    const finishedWireId = resolvePermanentWireId(scheduleCables[cableIndex], cableIndex);
    let next_cable_index: number | null = null;
    let next_wire_id: string | null = null;
    // `skip` returns earlier; only FINISHED (`complete`) advances the LIVE wire here.
    if (action === 'complete') {
      const limit = total > 0 ? total : scheduleCables.length;
      for (let i = cableIndex + 1; i < limit; i++) {
        const st = cs[String(i)];
        const done = !!(st?.src && st?.dst);
        const skipped = typeof st?.note === 'string' && /\[SKIPPED /.test(st.note);
        if (!done && !skipped) {
          next_cable_index = i;
          next_wire_id = resolvePermanentWireId(scheduleCables[i], i);
          break;
        }
      }
    }

    return {
      assignment_id: assignmentId,
      cable_index: cableIndex,
      action,
      cables_src_done: src_done,
      cables_dst_done: dst_done,
      project_code: a.project_code,
      frame_id: a.frame_id,
      wire_id: finishedWireId,
      previous_wire_id: finishedWireId,
      previous_cable_index: cableIndex,
      next_cable_index,
      next_wire_id,
    };
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
    await this.gaFoundation?.assertPanelReleased(a.project_code, a.frame_id);

    const total = this._cableCountForAssignment(a);
    if (total <= 0) throw new BadRequestException('No cables on this assignment');

    if (action === 'reset_all') {
      // Continuations reset only to the Mid Change handover baseline (see cableAction).
      const bulkBaseline = await this._handoverBaseline(a.handover_from_id);
      const resetCs: Record<string, CableStatus & { issue?: boolean }> = {};
      for (let i = 0; i < total; i++) {
        const bulkKey = String(i);
        resetCs[bulkKey] = bulkBaseline[bulkKey]
          ? { ...bulkBaseline[bulkKey] }
          : { src: false, dst: false, note: '' };
      }
      const bulkSrc = Object.values(resetCs).filter(c => c.src).length;
      const bulkDst = Object.values(resetCs).filter(c => c.dst).length;
      await this.prisma.tech_assignments.update({
        where: { id: assignmentId },
        data: { cable_status: JSON.stringify(resetCs), cables_src_done: bulkSrc, cables_dst_done: bulkDst },
      });
      return {
        action,
        assignment_id: assignmentId,
        cables_total: a.cables_total,
        cables_src_done: bulkSrc,
        cables_dst_done: bulkDst,
        cable_status: resetCs,
      };
    }

    const cs: Record<string, CableStatus & { issue?: boolean }> = {};
    for (let i = 0; i < total; i++) {
      cs[String(i)] = { src: true, dst: true, note: '', technicianId: techId };
    }

    if (action === 'mark_all_with_issues') {
      const targets = [
        Math.floor(total * 0.1),
        Math.floor(total * 0.5),
        total - 1,
      ].filter((v, i, arr) => arr.indexOf(v) === i);
      const reasons = ['Wrong terminal', 'Wire damaged', 'Missing ferrule'];
      targets.forEach((idx, i) => {
        cs[String(idx)] = { src: true, dst: true, note: reasons[i] || 'Dev test issue', issue: true, technicianId: techId };
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

  /** Cable state recorded at the Mid Change handover — immutable for the continuation. */
  private async _handoverBaseline(handoverFromId: number | null): Promise<Record<string, CableStatus & { issue?: boolean }>> {
    if (handoverFromId == null) return {};
    const priorSegment = await this.prisma.tech_assignments.findUnique({ where: { id: handoverFromId } });
    return parseCS(priorSegment?.cable_status);
  }

  /** Cable count for status writes — frame JSON length when available, else cables_total (never mutates cables_total). */
  private _cableCountForAssignment(a: { project_code: string; frame_id: string; cables_total: number | null }) {
    const frame = this.resolveAssignmentFrame(a.project_code, a.frame_id);
    const fromFrame = Array.isArray(frame?.cables) ? frame!.cables.length : 0;
    const fromDb = a.cables_total ?? 0;
    return Math.max(fromFrame, fromDb);
  }

  /** Hard gate: Crimping-required wires must finish applicable ends before Wiring progress. */
  private _assertWiringUnlockedByCrimping(cable: CableStatus, cableIndex: number) {
    if (!isWiringLockedByCrimping(cable)) return;
    throw new BadRequestException({
      code: CRIMPING_NOT_COMPLETED_CODE,
      message: crimpingGateMessage(cableIndex),
      goToMode: 'crimping',
      cable_index: cableIndex,
    });
  }

  /** Technician Crimping summary for CRIMPING mode KPIs. */
  async getCrimpingSummary(assignmentId: number, techId: number) {
    const a = await this.prisma.tech_assignments.findUnique({ where: { id: assignmentId } });
    if (!a) throw new NotFoundException('Assignment not found');
    if (a.technician_id !== techId) throw new BadRequestException('Not your assignment');
    return this._crimpingSummaryPayload(a);
  }

  /** Supervisor/QA/Director read of Crimping state for an assignment. */
  async getCrimpingSummaryForManagers(assignmentId: number) {
    const a = await this.prisma.tech_assignments.findUnique({ where: { id: assignmentId } });
    if (!a) throw new NotFoundException('Assignment not found');
    return this._crimpingSummaryPayload(a);
  }

  /**
   * Complete Crimping Report projection for the owning technician only.
   * Global — assignment-scoped; no project-specific report classes.
   */
  async getCrimpingReportForTech(assignmentId: number, techId: number) {
    const a = await this.prisma.tech_assignments.findUnique({ where: { id: assignmentId } });
    if (!a) throw new NotFoundException('Assignment not found');
    if (a.technician_id !== techId) {
      throw new ForbiddenException('Not your assignment');
    }
    return this._crimpingReportPayload(a);
  }

  /** Manager read of the same global Crimping Report projection. */
  async getCrimpingReportForManagers(assignmentId: number) {
    const a = await this.prisma.tech_assignments.findUnique({ where: { id: assignmentId } });
    if (!a) throw new NotFoundException('Assignment not found');
    return this._crimpingReportPayload(a);
  }

  /**
   * Portfolio Cut/Strip/Crimp roll-up over assignments (real persisted cable_status only).
   * Never fabricates KPIs. Optional project_code filter.
   */
  async getPrepPortfolioForManagers(projectCode?: string | null) {
    const where: { project_code?: string; status?: { notIn: string[] } } = {
      status: { notIn: ['reassigned', 'mid_changed'] },
    };
    const code = String(projectCode || '').trim();
    if (code) where.project_code = code;

    const rows = await this.prisma.tech_assignments.findMany({
      where,
      select: {
        id: true,
        project_code: true,
        frame_id: true,
        panel_name: true,
        status: true,
        cables_total: true,
        cable_status: true,
        technician_id: true,
      },
      orderBy: { id: 'asc' },
      take: 500,
    });

    const panels: Array<{
      assignment_id: number;
      project_code: string;
      frame_id: string;
      panel_name: string | null;
      status: string | null;
      kpi: ReturnType<typeof summarizeCrimpingKpis>;
    }> = [];

    for (const a of rows) {
      const total = this._cableCountForAssignment(a);
      const cs = parseCS(a.cable_status);
      const cables = Array.from({ length: total }, (_, i) => cs[String(i)] || { src: false, dst: false, note: '' });
      panels.push({
        assignment_id: a.id,
        project_code: a.project_code,
        frame_id: a.frame_id,
        panel_name: a.panel_name,
        status: a.status,
        kpi: summarizeCrimpingKpis(cables),
      });
    }

    const portfolio = aggregateCrimpingKpis(panels.map((p) => p.kpi));
    return {
      scope: code ? { project_code: code } : { project_code: null },
      assignment_count: panels.length,
      portfolio,
      panels,
      invented: false,
      source: 'tech_assignments.cable_status',
    };
  }

  private async _crimpingReportPayload(a: {
    id: number;
    frame_id: string;
    project_code: string;
    panel_name: string | null;
    cables_total: number | null;
    cable_status: string | null;
    technician_id: number | null;
  }) {
    const total = this._cableCountForAssignment(a);
    const cs = parseCS(a.cable_status);
    const cables: CableStatus[] = [];
    for (let i = 0; i < total; i++) {
      const key = String(i);
      cables.push(cs[key] || { src: false, dst: false, note: '' });
    }
    const frame = this.resolveAssignmentFrame(a.project_code, a.frame_id);
    const scheduleCables = Array.isArray(frame?.cables) ? frame!.cables : [];
    let technicianName: string | null = null;
    if (a.technician_id != null) {
      const tech = await this.prisma.users.findUnique({
        where: { id: a.technician_id },
        select: { full_name: true, username: true },
      });
      technicianName = tech?.full_name || tech?.username || null;
    }
    const actorNames = await this._resolveCrimpingActorNames(cables, a.technician_id);
    if (a.technician_id != null && technicianName) {
      actorNames[String(a.technician_id)] = technicianName;
    }
    const auditRows = await this.prisma.tech_audit_log.findMany({
      where: {
        project_code: a.project_code,
        frame_id: a.frame_id,
      },
      orderBy: { id: 'asc' },
      select: {
        action: true,
        details: true,
        technician_id: true,
        technician_name: true,
        created_at: true,
      },
      take: 5000,
    });
    return getCrimpingReport({
      assignmentId: a.id,
      projectCode: a.project_code,
      frameId: a.frame_id,
      panelName: a.panel_name || frame?.panel_name || '',
      technicianId: a.technician_id,
      technicianName,
      scheduleCables,
      cableStatuses: cables,
      actorNames,
      auditEvents: auditRows,
    });
  }

  /** Resolve display names for every actor id stamped on preparation stages. */
  private async _resolveCrimpingActorNames(
    cables: CableStatus[],
    technicianId?: number | null,
  ): Promise<Record<string, string>> {
    const ids = new Set<number>();
    if (technicianId != null) ids.add(technicianId);
    for (const cable of cables) {
      const prep = normalizeCrimping(cable?.crimping, cable?.openEnd ?? null);
      for (const id of [
        prep.cut?.by,
        prep.wireStrip?.by,
        prep.wireCrimp?.by,
        prep.source.strippedBy,
        prep.source.crimpedBy,
        prep.destination.strippedBy,
        prep.destination.crimpedBy,
        prep.updatedBy,
        ...(prep.source.reworkHistory || []).map((h) => h.setBy),
        ...(prep.destination.reworkHistory || []).map((h) => h.setBy),
      ]) {
        if (typeof id === 'number' && Number.isFinite(id)) ids.add(id);
      }
    }
    if (ids.size === 0) return {};
    const users = await this.prisma.users.findMany({
      where: { id: { in: [...ids] } },
      select: { id: true, full_name: true, username: true },
    });
    const out: Record<string, string> = {};
    for (const u of users) {
      out[String(u.id)] = u.full_name || u.username || String(u.id);
    }
    return out;
  }

  private _crimpingSummaryPayload(a: {
    id: number;
    frame_id: string;
    project_code: string;
    panel_name: string | null;
    cables_total: number | null;
    cable_status: string | null;
  }) {
    const total = this._cableCountForAssignment(a);
    const cs = parseCS(a.cable_status);
    const cables: CableStatus[] = [];
    for (let i = 0; i < total; i++) {
      const key = String(i);
      cables.push(cs[key] || { src: false, dst: false, note: '' });
    }
    const kpi = summarizeCrimpingKpis(cables);
    const wires = cables.map((cable, index) => projectWirePrep(cable, index));
    const frame = this.resolveAssignmentFrame(a.project_code, a.frame_id);
    const scheduleCables = Array.isArray(frame?.cables) ? frame!.cables : [];
    return {
      assignment_id: a.id,
      frame_id: a.frame_id,
      project_code: a.project_code,
      panel_name: a.panel_name,
      kpi,
      wires,
      schedule_cables: scheduleCables,
      cable_count: total,
    };
  }

  /**
   * Mark Source/Destination strip or crimp for one wire.
   * operation defaults to 'crimp' for CR-01→CR-04 client compat (strip gate enforced).
   */
  async crimpingAction(
    assignmentId: number,
    techId: number,
    cableIndex: number,
    end: 'source' | 'destination',
    remarks?: string,
    operation: CrimpingOperation = 'crimp',
  ) {
    const a = await this.prisma.tech_assignments.findUnique({ where: { id: assignmentId } });
    if (!a) throw new NotFoundException('Assignment not found');
    if (a.technician_id !== techId) throw new BadRequestException('Not your assignment');
    await this.gaFoundation?.assertPanelReleased(a.project_code, a.frame_id);

    const total = this._cableCountForAssignment(a);
    if (cableIndex < 0 || (total > 0 && cableIndex >= total)) {
      throw new BadRequestException(`Cable index ${cableIndex} out of range [0, ${total})`);
    }

    const cs = parseCS(a.cable_status);
    const key = String(cableIndex);
    if (!cs[key]) cs[key] = { src: false, dst: false, note: '' };

    let result;
    try {
      result = markPrepOperation(cs[key], end, operation, techId);
    } catch (err: any) {
      throw new BadRequestException({
        code: err?.code || undefined,
        message: err?.message || 'Crimping action failed',
        end,
        operation,
        cable_index: cableIndex,
      });
    }
    if (remarks?.trim()) result.state.remarks = remarks.trim();
    cs[key].crimping = result.state;

    const autoStart = a.status === 'assigned' && result.changed
      ? { status: 'in_progress', started_at: a.started_at || new Date() }
      : {};
    await this.prisma.tech_assignments.update({
      where: { id: assignmentId },
      data: { cable_status: JSON.stringify(cs), ...autoStart },
    });

    if (result.changed && result.auditAction) {
      const tech = await this.prisma.users.findUnique({ where: { id: techId } });
      const verb = operation === 'strip' ? 'stripping' : 'crimping';
      await this.logAudit(
        techId,
        tech?.full_name || '',
        a.project_code,
        a.frame_id,
        a.panel_name || '',
        result.auditAction,
        `Cable ${cableIndex + 1}: ${end} ${verb} completed`
          + (result.previousStatus ? ` (${result.previousStatus}→${result.newStatus})` : ''),
      );
      // Dual-write legacy audit alias for crimp completes (CR-01→CR-04 clients/reports)
      if (operation === 'crimp') {
        const legacy = end === 'source' ? 'CRIMP_SOURCE_COMPLETED' : 'CRIMP_DESTINATION_COMPLETED';
        if (result.auditAction !== legacy) {
          await this.logAudit(
            techId, tech?.full_name || '', a.project_code, a.frame_id, a.panel_name || '',
            legacy, `Cable ${cableIndex + 1}: ${end} crimping completed (compat)`,
          );
        }
      }
      if ('status' in autoStart) {
        await this.logAudit(
          techId, tech?.full_name || '', a.project_code, a.frame_id, a.panel_name || '',
          'start', 'Auto-started on first preparation update',
        );
      }
    }

    return {
      assignment_id: assignmentId,
      cable_index: cableIndex,
      end,
      operation,
      changed: result.changed,
      crimping: result.state,
      wiring_locked: isWiringLockedByCrimping({ ...cs[key], crimping: result.state }),
    };
  }

  /**
   * Atomic whole-wire preparation: applicable SRC/DST strip+crimp in one write.
   * Soft identity via optional expected_sno / expected_ferrule. Skipped wires rejected.
   */
  async prepareWire(
    assignmentId: number,
    techId: number,
    cableIndex: number,
    remarks?: string,
    expectedSno?: string | number,
    expectedFerrule?: string,
  ) {
    const a = await this.prisma.tech_assignments.findUnique({ where: { id: assignmentId } });
    if (!a) throw new NotFoundException('Assignment not found');
    if (a.technician_id !== techId) throw new BadRequestException('Not your assignment');
    await this.gaFoundation?.assertPanelReleased(a.project_code, a.frame_id);

    const total = this._cableCountForAssignment(a);
    if (cableIndex < 0 || (total > 0 && cableIndex >= total)) {
      throw new BadRequestException(`Cable index ${cableIndex} out of range [0, ${total})`);
    }

    const frame = this.resolveAssignmentFrame(a.project_code, a.frame_id);
    const scheduleCable = Array.isArray(frame?.cables) ? frame!.cables[cableIndex] as any : null;
    if (expectedSno != null && String(expectedSno).trim() !== '') {
      const actual = scheduleCable?.sno != null ? String(scheduleCable.sno) : String(cableIndex + 1);
      if (String(expectedSno).trim() !== actual.trim()) {
        throw new ConflictException({
          code: 'WIRE_IDENTITY_MISMATCH',
          message: `Wire identity mismatch: expected S.No ${expectedSno}, schedule has ${actual}`,
        });
      }
    }
    if (expectedFerrule != null && String(expectedFerrule).trim() !== '') {
      const actual = String(scheduleCable?.ferrule || '').trim();
      if (String(expectedFerrule).trim() !== actual) {
        throw new ConflictException({
          code: 'WIRE_IDENTITY_MISMATCH',
          message: `Wire identity mismatch: expected ferrule ${expectedFerrule}, schedule has ${actual || '(empty)'}`,
        });
      }
    }

    const cs = parseCS(a.cable_status);
    const key = String(cableIndex);
    if (!cs[key]) cs[key] = { src: false, dst: false, note: '' };
    const note = String(cs[key].note || '');
    if (/\[SKIPPED\b/i.test(note)) {
      throw new BadRequestException({
        code: 'WIRE_SKIPPED',
        message: 'Skipped wires cannot be prepared. Clear skip before preparation.',
        cable_index: cableIndex,
      });
    }

    const stamp = new Date().toISOString();
    let result;
    try {
      result = markWirePrepared(cs[key], techId, stamp);
    } catch (err: any) {
      const isStagedReq = err?.code === 'STAGED_PREPARATION_REQUIRED';
      const isOrderError = isStagedReq || /before stripping|before crimping|STRIPPING REQUIRED/i.test(err?.message || '');
      const ExClass = isOrderError ? ConflictException : BadRequestException;
      throw new ExClass({
        code: err?.code || (isOrderError ? 'STAGE_ORDER_VIOLATION' : undefined),
        message: err?.message || 'Wire preparation failed',
        cable_index: cableIndex,
      });
    }
    if (remarks?.trim()) result.state.remarks = remarks.trim();
    cs[key].crimping = result.state;

    if (result.changed) {
      const autoStart = a.status === 'assigned'
        ? { status: 'in_progress', started_at: a.started_at || new Date() }
        : {};
      await this.prisma.tech_assignments.update({
        where: { id: assignmentId },
        data: { cable_status: JSON.stringify(cs), ...autoStart },
      });

      const tech = await this.prisma.users.findUnique({ where: { id: techId } });
      const name = tech?.full_name || '';
      await this.logAudit(
        techId,
        name,
        a.project_code,
        a.frame_id,
        a.panel_name || '',
        result.auditAction || 'wire_prepared',
        `Cable ${cableIndex + 1}: whole-wire preparation`
          + (result.previousStatus ? ` (${result.previousStatus}→${result.newStatus})` : ''),
      );
      for (const ea of result.endAudits || []) {
        if (!ea.auditAction) continue;
        await this.logAudit(
          techId,
          name,
          a.project_code,
          a.frame_id,
          a.panel_name || '',
          ea.auditAction,
          `Cable ${cableIndex + 1}: ${ea.end} ${ea.operation} via prepare-wire`,
        );
      }
      if ('status' in autoStart) {
        await this.logAudit(
          techId, name, a.project_code, a.frame_id, a.panel_name || '',
          'start', 'Auto-started on first preparation update',
        );
      }
    }

    return {
      assignment_id: assignmentId,
      cable_index: cableIndex,
      changed: result.changed,
      crimping: result.state,
      wiring_locked: isWiringLockedByCrimping({ ...cs[key], crimping: result.state }),
      wire: projectWirePrep({ ...cs[key], crimping: result.state }, cableIndex),
      cleared_rework: result.clearedRework === true,
    };
  }

  /* ── V2 Whole-Wire Preparation staged APIs ── */

  /**
   * Shared helper for staged wire preparation endpoints.
   * Handles ownership, assertPanelReleased, soft identity, skip rejection,
   * single JSON write, audit logging, and response projection.
   */
  private async _stageWirePrep(
    assignmentId: number,
    techId: number,
    cableIndex: number,
    stageFn: (cs: CableStatus) => CrimpingMarkResult,
    auditLabel: string,
    remarks?: string,
    expectedSno?: string | number,
    expectedFerrule?: string,
  ) {
    const a = await this.prisma.tech_assignments.findUnique({ where: { id: assignmentId } });
    if (!a) throw new NotFoundException('Assignment not found');
    if (a.technician_id !== techId) throw new BadRequestException('Not your assignment');
    await this.gaFoundation?.assertPanelReleased(a.project_code, a.frame_id);

    const total = this._cableCountForAssignment(a);
    if (cableIndex < 0 || (total > 0 && cableIndex >= total)) {
      throw new BadRequestException(`Cable index ${cableIndex} out of range [0, ${total})`);
    }

    const frame = this.resolveAssignmentFrame(a.project_code, a.frame_id);
    const scheduleCable = Array.isArray(frame?.cables) ? frame!.cables[cableIndex] as any : null;
    if (expectedSno != null && String(expectedSno).trim() !== '') {
      const actual = scheduleCable?.sno != null ? String(scheduleCable.sno) : String(cableIndex + 1);
      if (String(expectedSno).trim() !== actual.trim()) {
        throw new ConflictException({
          code: 'WIRE_IDENTITY_MISMATCH',
          message: `Wire identity mismatch: expected S.No ${expectedSno}, schedule has ${actual}`,
        });
      }
    }
    if (expectedFerrule != null && String(expectedFerrule).trim() !== '') {
      const actual = String(scheduleCable?.ferrule || '').trim();
      if (String(expectedFerrule).trim() !== actual) {
        throw new ConflictException({
          code: 'WIRE_IDENTITY_MISMATCH',
          message: `Wire identity mismatch: expected ferrule ${expectedFerrule}, schedule has ${actual || '(empty)'}`,
        });
      }
    }

    const cs = parseCS(a.cable_status);
    const key = String(cableIndex);
    if (!cs[key]) cs[key] = { src: false, dst: false, note: '' };
    const note = String(cs[key].note || '');
    if (/\[SKIPPED\b/i.test(note)) {
      throw new BadRequestException({
        code: 'WIRE_SKIPPED',
        message: 'Skipped wires cannot be prepared. Clear skip before preparation.',
        cable_index: cableIndex,
      });
    }

    let result: CrimpingMarkResult;
    try {
      result = stageFn(cs[key]);
    } catch (err: any) {
      const isOrderError = /before stripping|before crimping|STRIPPING REQUIRED/i.test(err?.message || '');
      const ExClass = isOrderError ? ConflictException : BadRequestException;
      throw new ExClass({
        code: err?.code || (isOrderError ? 'STAGE_ORDER_VIOLATION' : undefined),
        message: err?.message || `${auditLabel} failed`,
        cable_index: cableIndex,
      });
    }
    if (remarks?.trim()) result.state.remarks = remarks.trim();
    cs[key].crimping = result.state;

    if (result.changed) {
      const autoStart = a.status === 'assigned'
        ? { status: 'in_progress', started_at: a.started_at || new Date() }
        : {};
      await this.prisma.tech_assignments.update({
        where: { id: assignmentId },
        data: { cable_status: JSON.stringify(cs), ...autoStart },
      });

      const tech = await this.prisma.users.findUnique({ where: { id: techId } });
      const name = tech?.full_name || '';
      await this.logAudit(
        techId, name, a.project_code, a.frame_id, a.panel_name || '',
        result.auditAction || auditLabel,
        `Cable ${cableIndex + 1}: ${auditLabel}`,
      );
      for (const ea of result.endAudits || []) {
        if (!ea.auditAction) continue;
        await this.logAudit(
          techId, name, a.project_code, a.frame_id, a.panel_name || '',
          ea.auditAction,
          `Cable ${cableIndex + 1}: ${ea.end} ${ea.operation} via ${auditLabel}`,
        );
      }
      if ('status' in autoStart) {
        await this.logAudit(
          techId, name, a.project_code, a.frame_id, a.panel_name || '',
          'start', `Auto-started on first ${auditLabel} update`,
        );
      }
    }

    const wireId = resolvePermanentWireId(scheduleCable, cableIndex);
    return {
      assignment_id: assignmentId,
      cable_index: cableIndex,
      wire_id: wireId,
      project_code: a.project_code,
      frame_id: a.frame_id,
      panel_name: a.panel_name || '',
      changed: result.changed,
      crimping: result.state,
      wiring_locked: isWiringLockedByCrimping({ ...cs[key], crimping: result.state }),
      wire: projectWirePrep({ ...cs[key], crimping: result.state }, cableIndex),
    };
  }

  /** V2 Stage 1 — Mark wire cut to length. */
  async cutWire(
    assignmentId: number,
    techId: number,
    cableIndex: number,
    opts?: { plannedLength?: string; actualLength?: string; remarks?: string; expectedSno?: string | number; expectedFerrule?: string },
  ) {
    const pl = opts?.plannedLength;
    const al = opts?.actualLength;
    return this._stageWirePrep(
      assignmentId, techId, cableIndex,
      (cable) => markWireCut(cable, techId, { plannedLength: pl, actualLength: al }),
      'wire_cut',
      opts?.remarks,
      opts?.expectedSno,
      opts?.expectedFerrule,
    );
  }

  /** V2 Stage 2 — Mark both applicable ends stripped. */
  async stripWire(
    assignmentId: number,
    techId: number,
    cableIndex: number,
    opts?: { remarks?: string; expectedSno?: string | number; expectedFerrule?: string },
  ) {
    return this._stageWirePrep(
      assignmentId, techId, cableIndex,
      (cable) => markBothEndsStripped(cable, techId),
      'wire_stripped',
      opts?.remarks,
      opts?.expectedSno,
      opts?.expectedFerrule,
    );
  }

  /** V2 Stage 3 — Mark both applicable ends crimped. */
  async crimpWire(
    assignmentId: number,
    techId: number,
    cableIndex: number,
    opts?: { remarks?: string; expectedSno?: string | number; expectedFerrule?: string },
  ) {
    return this._stageWirePrep(
      assignmentId, techId, cableIndex,
      (cable) => markWireCrimped(cable, techId),
      'wire_crimped',
      opts?.remarks,
      opts?.expectedSno,
      opts?.expectedFerrule,
    );
  }

  /** Supervisor — resolve legacyPartial flag on a wire. */
  async resolveLegacyPartialForAssignment(
    assignmentId: number,
    actorId: number,
    cableIndex: number,
  ) {
    const a = await this.prisma.tech_assignments.findUnique({ where: { id: assignmentId } });
    if (!a) throw new NotFoundException('Assignment not found');

    const total = this._cableCountForAssignment(a);
    if (cableIndex < 0 || (total > 0 && cableIndex >= total)) {
      throw new BadRequestException(`Cable index ${cableIndex} out of range [0, ${total})`);
    }

    const cs = parseCS(a.cable_status);
    const key = String(cableIndex);
    if (!cs[key]) cs[key] = { src: false, dst: false, note: '' };

    let result: CrimpingMarkResult;
    try {
      result = resolveLegacyPartial(cs[key], actorId);
    } catch (err: any) {
      throw new BadRequestException({
        code: 'LEGACY_PARTIAL_RESOLVE_FAILED',
        message: err?.message || 'Could not resolve legacy partial',
      });
    }

    cs[key].crimping = result.state;
    if (result.changed) {
      await this.prisma.tech_assignments.update({
        where: { id: assignmentId },
        data: { cable_status: JSON.stringify(cs) },
      });
      const actor = await this.prisma.users.findUnique({ where: { id: actorId } });
      const name = actor?.full_name || '';
      await this.logAudit(
        actorId, name, a.project_code, a.frame_id, a.panel_name || '',
        'legacy_partial_resolved',
        `Cable ${cableIndex + 1}: legacy partial flag resolved`,
      );
    }

    return {
      assignment_id: assignmentId,
      cable_index: cableIndex,
      changed: result.changed,
      crimping: result.state,
      wiring_locked: isWiringLockedByCrimping({ ...cs[key], crimping: result.state }),
      wire: projectWirePrep({ ...cs[key], crimping: result.state }, cableIndex),
    };
  }

  /**
   * Bulk strip/crimp for selected indexes. Each wire is evaluated independently —
   * ineligible wires are skipped with a reason (never silently marked complete).
   */
  async crimpingBulkAction(
    assignmentId: number,
    techId: number,
    cableIndexes: number[],
    end: 'source' | 'destination',
    operation: CrimpingOperation,
  ) {
    const a = await this.prisma.tech_assignments.findUnique({ where: { id: assignmentId } });
    if (!a) throw new NotFoundException('Assignment not found');
    if (a.technician_id !== techId) throw new BadRequestException('Not your assignment');
    await this.gaFoundation?.assertPanelReleased(a.project_code, a.frame_id);

    const total = this._cableCountForAssignment(a);
    const unique = [...new Set(cableIndexes.map((n) => Number(n)).filter((n) => Number.isInteger(n)))];
    const cs = parseCS(a.cable_status);
    const results: Array<{
      cable_index: number;
      ok: boolean;
      skipped: boolean;
      reason?: string;
      changed?: boolean;
    }> = [];
    let anyChanged = false;
    const stamp = new Date().toISOString();

    for (const idx of unique) {
      if (idx < 0 || (total > 0 && idx >= total)) {
        results.push({ cable_index: idx, ok: false, skipped: true, reason: 'out of range' });
        continue;
      }
      const key = String(idx);
      if (!cs[key]) cs[key] = { src: false, dst: false, note: '' };
      try {
        const result = markPrepOperation(cs[key], end, operation, techId, stamp);
        cs[key].crimping = result.state;
        if (result.changed) {
          anyChanged = true;
          const tech = await this.prisma.users.findUnique({ where: { id: techId } });
          await this.logAudit(
            techId,
            tech?.full_name || '',
            a.project_code,
            a.frame_id,
            a.panel_name || '',
            result.auditAction || `${end}_${operation}ed`,
            `Cable ${idx + 1}: bulk ${end} ${operation}`
              + (result.previousStatus ? ` (${result.previousStatus}→${result.newStatus})` : ''),
          );
        }
        results.push({ cable_index: idx, ok: true, skipped: false, changed: result.changed });
      } catch (err: any) {
        results.push({
          cable_index: idx,
          ok: false,
          skipped: true,
          reason: err?.message || 'not eligible',
        });
      }
    }

    if (anyChanged) {
      const autoStart = a.status === 'assigned'
        ? { status: 'in_progress', started_at: a.started_at || new Date() }
        : {};
      await this.prisma.tech_assignments.update({
        where: { id: assignmentId },
        data: { cable_status: JSON.stringify(cs), ...autoStart },
      });
      const bulkAudit =
        operation === 'strip'
          ? (end === 'source' ? 'bulk_source_stripped' : 'bulk_destination_stripped')
          : (end === 'source' ? 'bulk_source_crimped' : 'bulk_destination_crimped');
      const tech = await this.prisma.users.findUnique({ where: { id: techId } });
      const okCount = results.filter(r => r.ok && r.changed).length;
      const skipCount = results.filter(r => r.skipped).length;
      await this.logAudit(
        techId, tech?.full_name || '', a.project_code, a.frame_id, a.panel_name || '',
        bulkAudit,
        `${okCount} completed, ${skipCount} skipped (${end} ${operation})`,
      );
    }

    const cables = Array.from({ length: total }, (_, i) => cs[String(i)] || { src: false, dst: false, note: '' });
    return {
      assignment_id: assignmentId,
      end,
      operation,
      eligible: results.filter(r => r.ok).length,
      not_eligible: results.filter(r => r.skipped).length,
      results,
      kpi: summarizeCrimpingKpis(cables),
    };
  }

  /**
   * Supervisor: set Crimping Required on selected cable indexes (panel-scoped via assignment/frame).
   * Atomic update of the active assignment cable_status JSON.
   */
  async setCrimpingRequiredForAssignment(
    assignmentId: number,
    actorId: number,
    cableIndexes: number[],
    required: boolean,
  ) {
    const a = await this.prisma.tech_assignments.findUnique({ where: { id: assignmentId } });
    if (!a) throw new NotFoundException('Assignment not found');
    const total = this._cableCountForAssignment(a);
    const unique = [...new Set(cableIndexes.map((n) => Number(n)).filter((n) => Number.isInteger(n)))];
    for (const idx of unique) {
      if (idx < 0 || (total > 0 && idx >= total)) {
        throw new BadRequestException(`Cable index ${idx} out of range [0, ${total})`);
      }
    }

    const cs = parseCS(a.cable_status);
    const stamp = new Date().toISOString();
    for (const idx of unique) {
      const key = String(idx);
      if (!cs[key]) cs[key] = { src: false, dst: false, note: '' };
      cs[key].crimping = setCrimpingRequired(cs[key], required, actorId, stamp);
    }

    await this.prisma.tech_assignments.update({
      where: { id: assignmentId },
      data: { cable_status: JSON.stringify(cs) },
    });

    const tech = await this.prisma.users.findUnique({ where: { id: actorId } });
    await this.logAudit(
      actorId,
      tech?.full_name || '',
      a.project_code,
      a.frame_id,
      a.panel_name || '',
      required ? 'crimp_required_set' : 'crimp_required_cleared',
      `${unique.length} wire(s) → required=${required}`,
    );

    const cables = Array.from({ length: total }, (_, i) => cs[String(i)] || { src: false, dst: false, note: '' });
    return {
      assignment_id: assignmentId,
      updated_indexes: unique,
      required,
      kpi: summarizeCrimpingKpis(cables),
    };
  }

  /**
   * Supervisor / QAQC: set or clear qaHold on selected wires.
   * qaHold blocks readiness (isReadyForWiring returns false).
   * Additive: sets crimping.qaHold boolean on cable_status JSON. No DDL.
   */
  async setQaHoldForAssignment(
    assignmentId: number,
    actorId: number,
    cableIndexes: number[],
    qaHold: boolean,
  ) {
    const a = await this.prisma.tech_assignments.findUnique({ where: { id: assignmentId } });
    if (!a) throw new NotFoundException('Assignment not found');
    const total = this._cableCountForAssignment(a);
    const unique = [...new Set(cableIndexes.map((n) => Number(n)).filter((n) => Number.isInteger(n)))];
    for (const idx of unique) {
      if (idx < 0 || (total > 0 && idx >= total)) {
        throw new BadRequestException(`Cable index ${idx} out of range [0, ${total})`);
      }
    }

    const cs = parseCS(a.cable_status);
    const stamp = new Date().toISOString();
    for (const idx of unique) {
      const key = String(idx);
      if (!cs[key]) cs[key] = { src: false, dst: false, note: '' };
      const crimping = normalizeCrimping(cs[key].crimping, cs[key].openEnd ?? null);
      crimping.qaHold = qaHold || undefined;
      crimping.updatedAt = stamp;
      crimping.updatedBy = actorId;
      crimping.revision = (crimping.revision || 0) + 1;
      cs[key].crimping = crimping;
    }

    await this.prisma.tech_assignments.update({
      where: { id: assignmentId },
      data: { cable_status: JSON.stringify(cs) },
    });

    const tech = await this.prisma.users.findUnique({ where: { id: actorId } });
    await this.logAudit(
      actorId,
      tech?.full_name || '',
      a.project_code,
      a.frame_id,
      a.panel_name || '',
      qaHold ? 'qa_hold_set' : 'qa_hold_cleared',
      `${unique.length} wire(s) → qaHold=${qaHold}`,
    );

    const cables = Array.from({ length: total }, (_, i) => cs[String(i)] || { src: false, dst: false, note: '' });
    return {
      assignment_id: assignmentId,
      updated_indexes: unique,
      qa_hold: qaHold,
      kpi: summarizeCrimpingKpis(cables),
    };
  }

  /**
   * QA / Supervisor: mark strip or crimp REWORK_REQUIRED on one wire end.
   * Preserves prior by/at; appends reworkHistory; does not rewrite legacy wiring.
   */
  async setCrimpingReworkForAssignment(
    assignmentId: number,
    actorId: number,
    cableIndex: number,
    end: 'source' | 'destination',
    operation: CrimpingOperation,
    reason: string,
    role?: string,
  ) {
    const a = await this.prisma.tech_assignments.findUnique({ where: { id: assignmentId } });
    if (!a) throw new NotFoundException('Assignment not found');
    const total = this._cableCountForAssignment(a);
    if (cableIndex < 0 || (total > 0 && cableIndex >= total)) {
      throw new BadRequestException(`Cable index ${cableIndex} out of range [0, ${total})`);
    }
    const cs = parseCS(a.cable_status);
    const key = String(cableIndex);
    if (!cs[key]) cs[key] = { src: false, dst: false, note: '' };

    let result;
    try {
      result = markPrepReworkRequired(cs[key], end, operation, actorId, reason, new Date().toISOString(), role);
    } catch (err: any) {
      throw new BadRequestException({
        code: 'CRIMPING_REWORK_FAILED',
        message: err?.message || 'Rework failed',
        end,
        operation,
        cable_index: cableIndex,
      });
    }
    cs[key].crimping = result.state;
    await this.prisma.tech_assignments.update({
      where: { id: assignmentId },
      data: { cable_status: JSON.stringify(cs) },
    });

    const tech = await this.prisma.users.findUnique({ where: { id: actorId } });
    await this.logAudit(
      actorId,
      tech?.full_name || '',
      a.project_code,
      a.frame_id,
      a.panel_name || '',
      'crimp_rework',
      `wire ${cableIndex} ${end} ${operation}: ${result.previousStatus} → REWORK_REQUIRED — ${String(reason || '').slice(0, 120)}`,
    );

    return {
      assignment_id: assignmentId,
      cable_index: cableIndex,
      end,
      operation,
      changed: result.changed,
      crimping: result.state,
      ready_for_wiring: result.state.overall === 'COMPLETED',
    };
  }

  async setCrimpingReworkWithAffectedEnd(
    assignmentId: number,
    actorId: number,
    cableIndex: number,
    affectedEnd: ReworkAffectedEnd,
    operation: CrimpingOperation,
    reason: string,
    role?: string,
  ) {
    const a = await this.prisma.tech_assignments.findUnique({ where: { id: assignmentId } });
    if (!a) throw new NotFoundException('Assignment not found');
    const total = this._cableCountForAssignment(a);
    if (cableIndex < 0 || (total > 0 && cableIndex >= total)) {
      throw new BadRequestException(`Cable index ${cableIndex} out of range [0, ${total})`);
    }
    const cs = parseCS(a.cable_status);
    const key = String(cableIndex);
    if (!cs[key]) cs[key] = { src: false, dst: false, note: '' };

    let result: CrimpingMarkResult;
    try {
      result = markPrepReworkWithAffectedEnd(cs[key], affectedEnd, operation, actorId, reason, new Date().toISOString(), role);
    } catch (err: any) {
      throw new BadRequestException({
        code: 'CRIMPING_REWORK_FAILED',
        message: err?.message || 'Rework failed',
        affected_end: affectedEnd,
        operation,
        cable_index: cableIndex,
      });
    }
    cs[key].crimping = result.state;
    await this.prisma.tech_assignments.update({
      where: { id: assignmentId },
      data: { cable_status: JSON.stringify(cs) },
    });

    const tech = await this.prisma.users.findUnique({ where: { id: actorId } });
    await this.logAudit(
      actorId,
      tech?.full_name || '',
      a.project_code,
      a.frame_id,
      a.panel_name || '',
      'crimp_rework',
      `wire ${cableIndex} ${affectedEnd} ${operation}: → REWORK_REQUIRED — ${String(reason || '').slice(0, 120)}`,
    );

    return {
      assignment_id: assignmentId,
      cable_index: cableIndex,
      affected_end: affectedEnd,
      operation,
      changed: result.changed,
      crimping: result.state,
      ready_for_wiring: isReadyForWiring(result.state),
    };
  }

  async myAssignmentDetail(assignmentId: number, techId: number) {
    const a = await this.prisma.tech_assignments.findUnique({ where: { id: assignmentId } });
    if (!a) throw new NotFoundException('Assignment not found');
    if (a.technician_id !== techId) throw new BadRequestException('Not your assignment');
    const project = await this.prisma.projects.findFirst({
      where: { code: a.project_code, is_active: true },
      select: { code: true },
    });
    if (!project || FrameStore.isBlocked(a.project_code, a.frame_id)) {
      throw new NotFoundException('Assignment not found');
    }
    const frame = this.resolveAssignmentFrame(a.project_code, a.frame_id);
    const kpi = wiringKpiPercent(a.cables_src_done || 0, a.cables_dst_done || 0, a.cables_total || 0);
    const mapping = ((frame as any)?.mapping || {}) as Record<string, string>;
    const correctionRecords = frame
      ? WireCorrectionsStore.listForFrame(a.project_code, a.frame_id)
      : [];
    const cables = frame
      ? WireCorrectionsStore.overlayCables(
          frame.cables as unknown as Array<Record<string, unknown>>,
          a.project_code,
          a.frame_id,
          mapping,
        )
      : [];
    const cableStatus = parseCS(a.cable_status);
    // Restore Corrected badges from Corrections folder if status JSON lost the flag.
    if (correctionRecords.length) {
      const correctedIndexes = new Set(correctionRecords.map(r => r.cable_index));
      for (const index of correctedIndexes) {
        const key = String(index);
        if (!cableStatus[key]) cableStatus[key] = { src: false, dst: false, note: '' };
        cableStatus[key].corrected = true;
        const latest = [...correctionRecords].reverse().find(r => r.cable_index === index);
        if (latest?.reason) cableStatus[key].correctionComment = latest.reason;
      }
    }
    return {
      assignment: { ...a, cable_status: cableStatus },
      frame: frame ? {
        id: frame.id,
        panel_name: frame.panel_name,
        panel_type: (frame as any).panel_type || null,
        cables,
        cable_count: frame.cable_count,
        mapping,
        sheet_name: (frame as any).sheet_name || '',
        original_filename: frame.original_filename || '',
        excel_headers: technicianExcelHeaders(frame),
      } : null,
      corrections: correctionRecords.map(r => ({
        ...r,
        status: 'corrected',
        corrected_excel_display_path: frame
          ? WireCorrectionsStore.correctedWorkbookDisplayPath(a.project_code, a.frame_id)
          : undefined,
        corrected_excel_relative_path: frame
          ? WireCorrectionsStore.correctedWorkbookRelativePath(a.project_code, a.frame_id)
          : undefined,
      })),
      corrected_excel_display_path: frame
        ? WireCorrectionsStore.correctedWorkbookDisplayPath(a.project_code, a.frame_id)
        : null,
      corrected_excel_relative_path: frame
        ? WireCorrectionsStore.correctedWorkbookRelativePath(a.project_code, a.frame_id)
        : null,
      correctable_fields: CORRECTABLE_FIELDS.map(field => ({
        field,
        label: CORRECTABLE_FIELD_LABELS[field],
      })),
      kpi,
    };
  }

  /**
   * Technician field correction — overlays only.
   * Does not mutate frame JSON or the original uploaded Excel.
   * Persists under uploads/<project>/Corrections/ + cable_status.corrected flag.
   */
  async correctCable(
    assignmentId: number,
    techId: number,
    cableIndex: number,
    field: string,
    correctedValue: string,
    reason: string,
  ) {
    const a = await this.prisma.tech_assignments.findUnique({ where: { id: assignmentId } });
    if (!a) throw new NotFoundException('Assignment not found');
    if (a.technician_id !== techId) throw new BadRequestException('Not your assignment');
    await this.gaFoundation?.assertPanelReleased(a.project_code, a.frame_id);

    if (a.status !== 'in_progress' && a.status !== 'assigned' && a.status !== 'paused') {
      throw new BadRequestException('Corrections are only allowed on an active assignment');
    }

    const fieldKey = String(field || '').trim() as CorrectableField;
    if (!CORRECTABLE_FIELDS.includes(fieldKey)) {
      throw new BadRequestException(`Field "${field}" is not correctable`);
    }
    const comment = String(reason || '').trim();
    const nextValue = String(correctedValue ?? '').trim();
    const total = this._cableCountForAssignment(a);
    if (cableIndex < 0 || (total > 0 && cableIndex >= total)) {
      throw new BadRequestException(`Cable index ${cableIndex} out of range [0, ${total})`);
    }

    const frame = this.resolveAssignmentFrame(a.project_code, a.frame_id);
    if (!frame || !Array.isArray(frame.cables) || !frame.cables[cableIndex]) {
      throw new BadRequestException('Wiring schedule cable not found');
    }
    const mapping = ((frame as any).mapping || {}) as Record<string, string>;
    const existingOverlay = WireCorrectionsStore.listForCable(a.project_code, a.frame_id, cableIndex);
    const baseCable = frame.cables[cableIndex] as unknown as Record<string, unknown>;
    const displayCable = existingOverlay.length
      ? applyCorrectionsToCable(baseCable, existingOverlay, mapping)
      : baseCable;
    // Prefer reading from the already-overlaid cable for "existing value"
    const originalValue = readCableFieldValue(displayCable, fieldKey, mapping);
    if (originalValue === nextValue) {
      throw new BadRequestException('Corrected value must differ from the existing value');
    }

    const tech = await this.prisma.users.findUnique({ where: { id: techId } });
    const project = await this.prisma.projects.findUnique({ where: { code: a.project_code } });
    const stamp = new Date().toISOString();
    const record = {
      id: `corr_${Date.now().toString(36)}_${crypto.randomBytes(3).toString('hex')}`,
      project_code: a.project_code,
      project_name: project?.name || a.project_code,
      panel_name: a.panel_name || frame.panel_name || '',
      frame_id: a.frame_id,
      cable_index: cableIndex,
      wire_number: (frame.cables[cableIndex] as any)?.sno ?? cableIndex + 1,
      field: fieldKey,
      field_label: CORRECTABLE_FIELD_LABELS[fieldKey],
      original_value: originalValue,
      corrected_value: nextValue,
      reason: comment,
      technician_id: techId,
      technician_name: tech?.full_name || tech?.username || `Tech #${techId}`,
      technician_username: tech?.username || '',
      corrected_at: stamp,
    };

    const appendResult = await WireCorrectionsStore.append(record, {
      sourceBuffer: FrameStore.getBuffer(a.project_code, a.frame_id),
      cables: frame.cables as unknown as Array<Record<string, unknown>>,
      mapping,
    });
    const allRecords = appendResult.records;

    const cs = parseCS(a.cable_status);
    const key = String(cableIndex);
    if (!cs[key]) cs[key] = { src: false, dst: false, note: '' };
    cs[key].corrected = true;
    cs[key].correctionComment = comment;
    const noteEntry = `[CORRECTED ${stamp}] ${CORRECTABLE_FIELD_LABELS[fieldKey]}: "${originalValue}" → "${nextValue}" — ${comment}`;
    cs[key].note = cs[key].note ? `${cs[key].note}\n${noteEntry}` : noteEntry;

    await this.prisma.tech_assignments.update({
      where: { id: assignmentId },
      data: { cable_status: JSON.stringify(cs) },
    });
    await this.logAudit(
      techId,
      tech?.full_name || '',
      a.project_code,
      a.frame_id,
      a.panel_name || '',
      'cable_correction',
      `Cable ${cableIndex + 1}: ${CORRECTABLE_FIELD_LABELS[fieldKey]} "${originalValue}" → "${nextValue}" (${comment})`,
    );

    const overlaid = applyCorrectionsToCable(
      baseCable,
      allRecords.filter(r => r.cable_index === cableIndex),
      mapping,
    );

    return {
      assignment_id: assignmentId,
      cable_index: cableIndex,
      correction: record,
      cable_status: cs[key],
      cable: overlaid,
      corrections: allRecords.filter(r => r.cable_index === cableIndex).map(r => ({
        ...r,
        status: 'corrected',
        corrected_excel_display_path: appendResult.corrected_excel_display_path,
        corrected_excel_relative_path: appendResult.corrected_excel_relative_path,
        corrected_excel_filename: appendResult.corrected_excel_filename,
      })),
      corrected_excel_display_path: appendResult.corrected_excel_display_path,
      corrected_excel_relative_path: appendResult.corrected_excel_relative_path,
      corrected_excel_filename: appendResult.corrected_excel_filename,
    };
  }

  private assertCorrectionReadAccess(assignment: { technician_id: number; project_code: string }, user: { id: number; role: string }) {
    if (user.role === 'wiring_technician') {
      if (assignment.technician_id !== user.id) {
        throw new BadRequestException('Not your assignment');
      }
      return;
    }
    const readers = new Set(['prod_supervisor', 'qaqc_engineer', 'ops_director', 'system_admin']);
    if (!readers.has(user.role)) {
      throw new BadRequestException('Not authorised to view corrections');
    }
  }

  async cableCorrections(assignmentId: number, user: { id: number; role: string }, cableIndex?: number) {
    const a = await this.prisma.tech_assignments.findUnique({ where: { id: assignmentId } });
    if (!a) throw new NotFoundException('Assignment not found');
    this.assertCorrectionReadAccess(a, user);
    const meta = WireCorrectionsStore.getFrameMeta(a.project_code, a.frame_id);
    const project = await this.prisma.projects.findUnique({ where: { code: a.project_code } });
    const display = WireCorrectionsStore.correctedWorkbookDisplayPath(a.project_code, a.frame_id);
    const relative = WireCorrectionsStore.correctedWorkbookRelativePath(a.project_code, a.frame_id);
    const filename = meta.latest_corrected_filename || '';
    const location = WireCorrectionsStore.panelDisplayPath(a.project_code, meta.panel_name || a.panel_name || 'PANEL');
    const enriched = meta.records.map(r => ({
      ...r,
      project_name: r.project_name || project?.name || a.project_code,
      status: 'corrected',
      corrected_excel_display_path: r.corrected_excel_relative_path
        ? `uploads/${r.corrected_excel_relative_path}`
        : display,
      corrected_excel_relative_path: r.corrected_excel_relative_path || relative,
      corrected_excel_filename: r.corrected_excel_filename || filename,
    }));
    const envelope = {
      assignment_id: assignmentId,
      project_code: a.project_code,
      project_name: project?.name || a.project_code,
      panel_name: a.panel_name || meta.panel_name || '',
      corrected_excel_display_path: display,
      corrected_excel_relative_path: relative,
      corrected_excel_filename: filename,
      corrected_excel_location: location,
    };
    if (cableIndex == null || Number.isNaN(cableIndex)) {
      return { ...envelope, corrections: enriched };
    }
    return {
      ...envelope,
      cable_index: cableIndex,
      corrections: enriched.filter(r => r.cable_index === cableIndex),
    };
  }

  async downloadCorrectedExcel(assignmentId: number, user: { id: number; role: string }) {
    const a = await this.prisma.tech_assignments.findUnique({ where: { id: assignmentId } });
    if (!a) throw new NotFoundException('Assignment not found');
    this.assertCorrectionReadAccess(a, user);
    const uploadsRoot = path.resolve(
      process.env.UPLOAD_DIR
        ? (path.isAbsolute(process.env.UPLOAD_DIR) ? process.env.UPLOAD_DIR : path.join(process.cwd(), process.env.UPLOAD_DIR))
        : path.join(process.cwd(), 'uploads'),
    );
    const project = await this.prisma.projects.findUnique({ where: { code: a.project_code } });
    const projectName = project?.name || a.project_code;
    const panelName = a.panel_name || 'PANEL';
    const frame = this.resolveAssignmentFrame(a.project_code, a.frame_id);
    const originalFilename = frame?.original_filename || '';

    const correctedAbs = WireCorrectionsStore.resolveCorrectedExcelAbsolutePath(a.project_code, a.frame_id);
    if (correctedAbs) {
      const correctionsRoot = path.resolve(WireCorrectionsStore.correctionsDir(a.project_code));
      const resolved = path.resolve(correctedAbs);
      if (!resolved.startsWith(correctionsRoot + path.sep) && resolved !== correctionsRoot) {
        throw new BadRequestException('Corrected Excel path is outside the project corrections folder');
      }
      const display = WireCorrectionsStore.correctedWorkbookDisplayPath(a.project_code, a.frame_id);
      const filename = WireCorrectionsStore.buildDownloadFilenameFromUploadedSchedule({
        originalFilename,
        corrected: true,
        fallbackProjectCode: a.project_code,
        fallbackProjectName: projectName,
        fallbackPanelName: panelName,
      });
      return {
        absolutePath: correctedAbs,
        filename,
        displayPath: display,
        workbookSource: 'corrected' as const,
        contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      };
    }

    const originalAbs = FrameStore.resolveExcelAbsolutePath(a.project_code, a.frame_id);
    if (!originalAbs) throw new NotFoundException('Wiring schedule Excel file not found');
    const resolvedOriginal = path.resolve(originalAbs);
    if (!resolvedOriginal.startsWith(uploadsRoot + path.sep) && resolvedOriginal !== uploadsRoot) {
      throw new BadRequestException('Original Excel path is outside the uploads folder');
    }
    const filename = WireCorrectionsStore.buildDownloadFilenameFromUploadedSchedule({
      originalFilename,
      corrected: false,
      fallbackProjectCode: a.project_code,
      fallbackProjectName: projectName,
      fallbackPanelName: panelName,
    });
    return {
      absolutePath: originalAbs,
      filename,
      displayPath: FrameStore.excelDisplayPath(a.project_code, a.frame_id),
      workbookSource: 'original' as const,
      contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    };
  }

  async previewCorrectedExcel(
    assignmentId: number,
    user: { id: number; role: string },
    wireNumber?: string,
    focusField?: string,
  ) {
    const a = await this.prisma.tech_assignments.findUnique({ where: { id: assignmentId } });
    if (!a) throw new NotFoundException('Assignment not found');
    this.assertCorrectionReadAccess(a, user);
    const project = await this.prisma.projects.findUnique({ where: { code: a.project_code } });
    const preview = await WireCorrectionsStore.buildExcelPreview({
      projectCode: a.project_code,
      frameId: a.frame_id,
      panelName: a.panel_name || '',
      projectName: project?.name || a.project_code,
      wireNumber: wireNumber != null && String(wireNumber).trim() ? wireNumber : undefined,
      focusField: focusField != null && String(focusField).trim() ? focusField : undefined,
      originalBuffer: FrameStore.getBuffer(a.project_code, a.frame_id),
      originalDisplayPath: FrameStore.excelDisplayPath(a.project_code, a.frame_id),
    });
    if (!preview) throw new NotFoundException('Wiring schedule Excel file not found');
    return {
      assignment_id: assignmentId,
      project_code: a.project_code,
      project_name: project?.name || a.project_code,
      panel_name: a.panel_name || '',
      ...preview,
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

  /**
   * Supervisor reassignment before wiring starts (no Mid Change / no progress transfer).
   * Old row → status `reassigned` (≤20 chars); new virgin assignment like assignFrame.
   */
  async reassignBeforeStart(dto: {
    assignmentId: number;
    newTechnicianId: number;
    supervisorId: number;
    reason: string;
  }) {
    const reason = String(dto.reason || '').trim();
    if (!reason) throw new BadRequestException('Reassignment reason is required');

    const existing = await this.prisma.tech_assignments.findUnique({ where: { id: dto.assignmentId } });
    if (!existing) throw new NotFoundException('Assignment not found');

    if (!isAssignableBeforeStart(existing)) {
      const lifecycle = this.getAssignmentLifecycle(existing);
      throw new ConflictException({
        message: 'Work has already started on this assignment. Use Mid Change to transfer the panel.',
        status: existing.status,
        lifecycle,
        assignment_id: existing.id,
      });
    }

    assertPanelNameUniqueForWrite(existing.project_code, existing.frame_id);

    const newTech = await this.prisma.users.findUnique({ where: { id: dto.newTechnicianId } });
    if (!newTech || newTech.role !== 'wiring_technician') {
      throw new BadRequestException('Invalid technician');
    }
    if (newTech.is_active === false) {
      throw new BadRequestException('This technician account is deactivated and cannot receive assignments');
    }
    if (dto.newTechnicianId === existing.technician_id) {
      throw new BadRequestException('New technician must be different');
    }

    const technicianActive = await this.prisma.tech_assignments.findFirst({
      where: {
        technician_id: dto.newTechnicianId,
        status: { in: ['assigned', 'in_progress', 'paused'] },
        changeover_locked: { not: true },
      },
    });
    if (technicianActive) {
      throw new ConflictException('This technician is already assigned to an active panel');
    }

    const otpCode = generateOtpCode();
    const qrCode = generateQrIdentity();
    const otpExpires = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const pauseReason = `REASSIGNED_BEFORE_START: ${reason}`.slice(0, 200);

    // Empty progress cable_status keyed like assignFrame (preserve cables_total).
    let cableStatusJson = existing.cable_status || '{}';
    try {
      const parsed = JSON.parse(cableStatusJson);
      const reset: Record<string, CableStatus> = {};
      const keys = Object.keys(parsed && typeof parsed === 'object' ? parsed : {});
      if (keys.length) {
        for (const key of keys) reset[key] = { src: false, dst: false, note: '' };
      } else {
        const total = existing.cables_total || 0;
        for (let i = 0; i < total; i++) reset[String(i)] = { src: false, dst: false, note: '' };
      }
      cableStatusJson = JSON.stringify(reset);
    } catch {
      const reset: Record<string, CableStatus> = {};
      const total = existing.cables_total || 0;
      for (let i = 0; i < total; i++) reset[String(i)] = { src: false, dst: false, note: '' };
      cableStatusJson = JSON.stringify(reset);
    }

    let previous;
    let assignment;
    try {
      const transfer = await this.prisma.$transaction(async (tx) => {
        const source = await tx.tech_assignments.findUnique({ where: { id: dto.assignmentId } });
        if (!source) throw new NotFoundException('Assignment not found');
        if (!isAssignableBeforeStart(source)) {
          throw new ConflictException({
            message: 'Work has already started on this assignment. Use Mid Change to transfer the panel.',
            status: source.status,
            lifecycle: this.getAssignmentLifecycle(source),
            assignment_id: source.id,
          });
        }

        const newActive = await tx.tech_assignments.findFirst({
          where: {
            technician_id: dto.newTechnicianId,
            status: { in: ['assigned', 'in_progress', 'paused'] },
            changeover_locked: { not: true },
          },
        });
        if (newActive) {
          throw new ConflictException('This technician is already assigned to an active panel');
        }

        const created = await tx.tech_assignments.create({
          data: {
            project_code: source.project_code,
            frame_id: source.frame_id,
            panel_name: source.panel_name,
            technician_id: dto.newTechnicianId,
            assigned_by: dto.supervisorId,
            status: 'assigned',
            cables_total: source.cables_total,
            cables_src_done: 0,
            cables_dst_done: 0,
            cable_status: cableStatusJson,
            supervisor_approved: true,
            is_hidden: false,
            report_submitted: false,
            rework_requested: false,
            rework_reason: '',
            changeover_locked: false,
            qc_status: 'not_ready',
            otp_code: otpCode,
            qr_code: qrCode,
            otp_verified: false,
            qr_panel_verified: false,
            otp_expires_at: otpExpires,
            otp_attempts: 0,
          },
        });

        const updatedPrevious = await tx.tech_assignments.update({
          where: { id: source.id },
          data: {
            status: 'reassigned',
            pause_reason: pauseReason,
            changeover_locked: true,
            handover_to_id: created.id,
          },
        });

        return { previous: updatedPrevious, assignment: created };
      }, { isolationLevel: 'Serializable' });
      previous = transfer.previous;
      assignment = transfer.assignment;
    } catch (error: any) {
      if (error instanceof ConflictException || error instanceof NotFoundException || error instanceof BadRequestException) {
        throw error;
      }
      if (error?.code === 'P2034') {
        throw new ConflictException('Assignment availability changed. Refresh and try again.');
      }
      if (error?.code === 'P2002') {
        throw new ConflictException(
          'This technician already has a historical assignment on this panel and cannot be reassigned here. Choose another technician or use Mid Change after work starts.',
        );
      }
      throw error;
    }

    await this.syncWiringStageAssignee(
      assignment.project_code,
      assignment.frame_id,
      dto.newTechnicianId,
      dto.supervisorId,
    );

    const [oldTech, supervisor] = await Promise.all([
      this.prisma.users.findUnique({ where: { id: previous.technician_id } }),
      this.prisma.users.findUnique({ where: { id: dto.supervisorId } }),
    ]);
    const auditDetails =
      `prev_tech=${previous.technician_id}:${oldTech?.full_name || ''} | new_tech=${dto.newTechnicianId}:${newTech.full_name || ''}`
      + ` | reason=${reason} | supervisor=${dto.supervisorId}:${supervisor?.full_name || ''}`;

    await this.logAudit(
      previous.technician_id,
      oldTech?.full_name || '',
      previous.project_code,
      previous.frame_id,
      previous.panel_name || '',
      'reassigned',
      `Reassigned before start to ${newTech.full_name} | ${reason}`.slice(0, 500),
    );
    await this.logAudit(
      dto.newTechnicianId,
      newTech.full_name || '',
      assignment.project_code,
      assignment.frame_id,
      assignment.panel_name || '',
      'assigned',
      `Reassigned before start from ${oldTech?.full_name || previous.technician_id} | ${reason}`.slice(0, 500),
    );
    await this.logAudit(
      dto.supervisorId,
      supervisor?.full_name || '',
      assignment.project_code,
      assignment.frame_id,
      assignment.panel_name || '',
      'reassign_before',
      auditDetails.slice(0, 500),
    );

    console.log(
      `[WHATSAPP] Reassign-before-start: ${newTech.full_name} (${newTech.whatsapp_number}) → panel "${assignment.panel_name}"`,
    );
    console.log(`[WHATSAPP] OTP: ${otpCode} | QR: ${qrCode}`);

    const { hashed_password: _hp, ...safeTech } = newTech;
    return {
      previous,
      assignment,
      assignment_id: assignment.id,
      project_code: assignment.project_code,
      frame_id: assignment.frame_id,
      technician: safeTech,
      otp_code: otpCode,
      qr_code: qrCode,
      qr_payload: generateQrPayload(assignment.project_code, assignment.frame_id, assignment.id),
      lifecycle: 'ASSIGNED_NOT_STARTED' as AssignmentLifecycle,
      previous_status: 'reassigned',
      transfer_kind: 'REASSIGNED_BEFORE_START',
    };
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

    let transfer: { source: typeof old; created: NonNullable<typeof old> };
    try {
      transfer = await this.prisma.$transaction(async tx => {
        let source = await tx.tech_assignments.findUnique({ where: { id: oldAssignmentId } });
        if (!source) throw new NotFoundException('Old assignment not found');
        const sourceIsStartedHandover = source.status === 'assigned' && source.handover_from_id != null;
        const sourceIsAssignedWithWork = source.status === 'assigned' && hasCableWork(source);
        if (!['paused', 'in_progress'].includes(source.status || '') && !sourceIsStartedHandover && !sourceIsAssignedWithWork) {
          throw new ConflictException({
            message: 'Work must have started before a mid-changeover',
            status: source.status,
            lifecycle: this.getAssignmentLifecycle(source),
            assignment_id: source.id,
          });
        }
        if (source.changeover_locked) {
          throw new ConflictException({
            message: 'Changeover already initiated',
            status: source.status,
            lifecycle: this.getAssignmentLifecycle(source),
            assignment_id: source.id,
          });
        }

        const newActive = await tx.tech_assignments.findFirst({
          where: {
            technician_id: newTechId,
            status: { in: ['assigned', 'in_progress', 'paused'] },
            changeover_locked: { not: true },
          },
        });
        if (newActive) {
          throw new ConflictException({
            message: 'Replacement technician is not available',
            status: newActive.status,
            lifecycle: this.getAssignmentLifecycle(newActive),
            assignment_id: newActive.id,
          });
        }

        const created = await tx.tech_assignments.create({
          data: {
            project_code: source.project_code, frame_id: source.frame_id, panel_name: source.panel_name,
            // Receiver is active via Mid Change (status stays VARCHAR(20)-safe `assigned`;
            // handover_from_id + audit encode ASSIGNED_VIA_MID_CHANGE).
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

        // Close previous technician as MID_CHANGED (stored as mid_changed ≤20 chars).
        source = await tx.tech_assignments.update({
          where: { id: oldAssignmentId },
          data: {
            status: 'mid_changed',
            paused_at: source.paused_at || new Date(),
            pause_reason: `MID_CHANGED: ${reason}${reasonNotes.trim() ? ` — ${reasonNotes.trim()}` : ''}`.slice(0, 200),
            changeover_locked: true,
            handover_to_id: created.id,
          },
        });
        return { source, created };
      }, { isolationLevel: 'Serializable' });
    } catch (error: any) {
      if (
        error instanceof ConflictException
        || error instanceof NotFoundException
        || error instanceof BadRequestException
      ) {
        throw error;
      }
      if (error?.code === 'P2034') {
        throw new ConflictException('Assignment availability changed. Refresh and try again.');
      }
      if (error?.code === 'P2002') {
        throw new ConflictException(
          'This technician already has a historical assignment on this panel. Choose another technician.',
        );
      }
      throw error;
    }
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

    await this.logAudit(old.technician_id, oldTech?.full_name || '', old.project_code, old.frame_id, old.panel_name || '', 'mid_changed', `MID_CHANGED — handed over to ${newTech.full_name}`);
    await this.logAudit(old.technician_id, oldTech?.full_name || '', old.project_code, old.frame_id, old.panel_name || '', 'mid_changeover', auditDetails);
    await this.logAudit(
      newTechId,
      newTech.full_name || '',
      newAssignment.project_code,
      newAssignment.frame_id,
      newAssignment.panel_name || '',
      'assigned',
      `ASSIGNED_VIA_MID_CHANGE from ${oldTech?.full_name} | reason=${reason}`,
    );
    console.log(`[WHATSAPP] Changeover: ${newTech.full_name} (${newTech.whatsapp_number}) assigned to continue panel "${old.panel_name}"`);
    console.log(`[WHATSAPP] Changeover OTP: ${newOtp} | QR: ${newQr}`);

    await this.syncWiringStageAssignee(
      newAssignment.project_code,
      newAssignment.frame_id,
      newTechId,
      supervisorId,
    );

    return {
      message: 'Changeover initiated',
      assignment_id: newAssignment.id,
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
      previous_status: 'mid_changed',
      receiver_status: 'assigned',
      transfer_kind: 'ASSIGNED_VIA_MID_CHANGE',
      ...cableCounts,
    };
  }

  async midChangeTargets(technicianId: number) {
    const [technicians, activeAssignments, projects] = await Promise.all([
      this.prisma.users.findMany({ where: { role: 'wiring_technician', is_active: true } }),
      this.prisma.tech_assignments.findMany({
        where: {
          status: { in: ['assigned', 'in_progress', 'paused'] },
          changeover_locked: { not: true },
          is_hidden: { not: true },
        },
      }),
      this.prisma.projects.findMany(),
    ]);

    const projectMap = new Map<string, any>(projects.map(p => [p.code, p]));
    const assignmentMap = new Map<number, typeof activeAssignments[0]>();
    for (const a of activeAssignments) {
      assignmentMap.set(a.technician_id, a);
    }

    const targets = technicians.map(t => {
      const a = assignmentMap.get(t.id);
      return {
        technician_id: t.id,
        technician_name: t.full_name || `Tech #${t.id}`,
        technician_username: t.username,
        is_me: t.id === technicianId,
        has_assignment: !!a,
        assignment: a ? {
          id: a.id,
          project_code: a.project_code,
          project_name: projectMap.get(a.project_code)?.name || a.project_code,
          frame_id: a.frame_id,
          panel_name: a.panel_name || a.frame_id,
          cables_total: a.cables_total || 0,
          cables_src_done: a.cables_src_done || 0,
          cables_dst_done: a.cables_dst_done || 0,
          started_at: a.started_at,
          status: a.status,
        } : null,
      };
    });

    return targets;
  }

  async midChangeRequests(technicianId?: number) {
    // Incoming transfers/interchanges that are 'assigned' waiting for resume.
    // Without a technicianId (supervisor view) every waiting transfer is returned.
    const incoming = await this.prisma.tech_assignments.findMany({
      where: {
        ...(technicianId != null ? { technician_id: technicianId } : {}),
        status: 'assigned',
        handover_from_id: { not: null },
        changeover_locked: { not: true },
        is_hidden: { not: true },
      },
    });

    if (incoming.length === 0) return [];

    const fromIds = incoming.map(a => a.handover_from_id as number);
    const previousAssignments = await this.prisma.tech_assignments.findMany({
      where: { id: { in: fromIds } },
    });
    const prevMap = new Map(previousAssignments.map(a => [a.id, a]));

    const techIds = [...new Set(previousAssignments.map(a => a.technician_id))];
    const prevTechs = await this.prisma.users.findMany({
      where: { id: { in: techIds } },
    });
    const prevTechMap = new Map(prevTechs.map(t => [t.id, t]));

    const describeSegment = (assignment?: (typeof incoming)[number]) => {
      if (!assignment) return null;
      const cableStates = parseCS(assignment.cable_status);
      const total = this._cableCountForAssignment(assignment);
      const frame = this.resolveAssignmentFrame(assignment.project_code, assignment.frame_id);
      const cableLabel = (index: number) => {
        const cable = Array.isArray(frame?.cables) ? (frame!.cables[index] as any) : null;
        return cable?.ferrule || (cable?.sno != null && String(cable.sno)) || `Cable ${index + 1}`;
      };
      let lastCompleted: number | null = null;
      let nextIncomplete: number | null = null;
      let completedPairs = 0;
      for (let i = 0; i < total; i++) {
        const entry = cableStates[String(i)];
        if (entry?.src && entry?.dst) { completedPairs += 1; lastCompleted = i; }
        else if (nextIncomplete == null) nextIncomplete = i;
      }
      return {
        id: assignment.id,
        project_code: assignment.project_code,
        frame_id: assignment.frame_id,
        panel_name: assignment.panel_name || assignment.frame_id,
        status: assignment.status,
        cables_total: total,
        cables_src_done: assignment.cables_src_done || 0,
        cables_dst_done: assignment.cables_dst_done || 0,
        cables_completed: completedPairs,
        cables_remaining: Math.max(0, total - completedPairs),
        last_completed_index: lastCompleted,
        last_completed_label: lastCompleted != null ? cableLabel(lastCompleted) : null,
        next_incomplete_index: nextIncomplete,
        next_incomplete_label: nextIncomplete != null ? cableLabel(nextIncomplete) : null,
      };
    };

    return incoming.map(a => {
      const prevA = prevMap.get(a.handover_from_id as number);
      const prevT = prevA ? prevTechMap.get(prevA.technician_id) : null;
      return {
        requestId: `transfer-${a.id}`, // Mock requestId to fit UI
        direction: 'incoming',
        initiator_name: prevT?.full_name || `Tech #${prevA?.technician_id}`,
        initiator_username: prevT?.username || '',
        target_technician_name: 'You',
        reason: a.pause_reason || 'Mid Change', // Used pause_reason of new assignment to store the reason
        assigned_at: a.assigned_at,
        source: describeSegment(prevA),
        target: describeSegment(a),
      };
    });
  }

  async executeMidChange(initiatorId: number, sourceAssignmentId: number, targetTechnicianId: number, reason = '') {
    if (initiatorId === targetTechnicianId) throw new BadRequestException('Select a different technician');
    const cleanReason = reason.trim().slice(0, 120);
    if (!cleanReason) throw new BadRequestException('Mid Change reason is required');
    const changedAt = new Date();

    const result = await this.prisma.$transaction(async tx => {
      let source = await tx.tech_assignments.findUnique({ where: { id: sourceAssignmentId } });
      if (!source) throw new NotFoundException('Your assignment no longer exists');
      if (source.technician_id !== initiatorId) throw new ForbiddenException('You can only mid-change your own assignment');
      if (!['in_progress', 'paused'].includes(String(source.status || '')) || source.changeover_locked) {
        throw new ConflictException('Your panel segment is no longer eligible for Mid Change');
      }

      const targetActive = await tx.tech_assignments.findFirst({
        where: {
          technician_id: targetTechnicianId,
          status: { in: ['assigned', 'in_progress', 'paused'] },
          changeover_locked: { not: true },
          is_hidden: { not: true },
        },
      });

      const [initiator, targetTechnician] = await Promise.all([
        tx.users.findUnique({ where: { id: initiatorId } }),
        tx.users.findUnique({ where: { id: targetTechnicianId } }),
      ]);
      // The receiving side must be a real, active wiring technician — otherwise the
      // transfer would strand the panel on an account that can never resume it.
      if (!targetTechnician || targetTechnician.is_active === false
        || targetTechnician.role !== 'wiring_technician') {
        throw new BadRequestException('Select an active wiring technician to receive the panel');
      }

      const createContinuation = (
        panel: typeof source,
        incomingTechnicianId: number,
        handoverFromId: number,
      ) => ({
        project_code: panel.project_code,
        frame_id: panel.frame_id,
        panel_name: panel.panel_name,
        technician_id: incomingTechnicianId,
        assigned_by: initiatorId, // Tech assigns to tech
        assigned_at: changedAt,
        status: 'assigned', // Wait for resume
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
        pause_reason: cleanReason,
      });

      const elapsed = (assignment: typeof source) => {
        if (!assignment?.started_at || assignment.status === 'paused') {
          return assignment?.total_wiring_seconds || 0;
        }
        return (assignment.total_wiring_seconds || 0)
          + Math.max(0, Math.floor((changedAt.getTime() - assignment.started_at.getTime()) / 1000));
      };

      if (!targetActive) {
        // Direct Transfer
        source = await tx.tech_assignments.update({
          where: { id: source.id },
          data: {
            status: 'paused',
            paused_at: changedAt,
            pause_reason: `Mid Change transferred to ${targetTechnician?.full_name}`,
            total_wiring_seconds: elapsed(source),
            changeover_locked: true,
          },
        });

        const targetContinuation = await tx.tech_assignments.create({
          data: createContinuation(source, targetTechnicianId, source.id),
        });

        await tx.tech_assignments.update({ where: { id: source.id }, data: { handover_to_id: targetContinuation.id } });

        await tx.tech_audit_log.create({
          data: {
            technician_id: initiatorId,
            technician_name: initiator?.full_name || '',
            project_code: source.project_code,
            frame_id: source.frame_id,
            panel_name: source.panel_name || '',
            action: 'mid_change_transfer',
            details: JSON.stringify({ to: targetTechnicianId, to_name: targetTechnician?.full_name, new_assignment_id: targetContinuation.id, reason: cleanReason, at: changedAt.toISOString() }),
          },
        });

        return { type: 'transfer', new_assignment_id: targetContinuation.id };
      } else {
        // Interchange
        if (targetActive.status === 'assigned') {
           throw new ConflictException('The selected technician must start their assigned panel before it can be interchanged');
        }

        let target = await tx.tech_assignments.update({
          where: { id: targetActive.id },
          data: {
            status: 'paused',
            paused_at: changedAt,
            pause_reason: `Mid Change interchange with ${initiator?.full_name}`,
            total_wiring_seconds: elapsed(targetActive),
            changeover_locked: true,
          },
        });

        source = await tx.tech_assignments.update({
          where: { id: source.id },
          data: {
            status: 'paused',
            paused_at: changedAt,
            pause_reason: `Mid Change interchange with ${targetTechnician?.full_name}`,
            total_wiring_seconds: elapsed(source),
            changeover_locked: true,
          },
        });

        const initiatorContinuation = await tx.tech_assignments.create({
          data: createContinuation(target, initiatorId, target.id),
        });
        const targetContinuation = await tx.tech_assignments.create({
          data: createContinuation(source, targetTechnicianId, source.id),
        });

        await Promise.all([
          tx.tech_assignments.update({ where: { id: source.id }, data: { handover_to_id: targetContinuation.id } }),
          tx.tech_assignments.update({ where: { id: target.id }, data: { handover_to_id: initiatorContinuation.id } }),
        ]);

        await tx.tech_audit_log.createMany({
          data: [
            {
              technician_id: initiatorId,
              technician_name: initiator?.full_name || '',
              project_code: source.project_code,
              frame_id: source.frame_id,
              panel_name: source.panel_name || '',
              action: 'mid_change_swap',
              details: JSON.stringify({ with: targetTechnicianId, with_name: targetTechnician?.full_name, reason: cleanReason, at: changedAt.toISOString() }),
            },
            {
              technician_id: targetTechnicianId,
              technician_name: targetTechnician?.full_name || '',
              project_code: target.project_code,
              frame_id: target.frame_id,
              panel_name: target.panel_name || '',
              action: 'mid_change_swap',
              details: JSON.stringify({ with: initiatorId, with_name: initiator?.full_name, reason: cleanReason, at: changedAt.toISOString() }),
            },
          ],
        });

        return { type: 'interchange', initiator_new_assignment_id: initiatorContinuation.id, target_new_assignment_id: targetContinuation.id };
      }
    }, { isolationLevel: 'Serializable' });

    return { message: 'Mid Change executed successfully', ...result };
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
