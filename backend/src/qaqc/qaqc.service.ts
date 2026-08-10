import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { MockStore } from '../data/mock-store';
import { wiringKpiPercent } from '../common/kpi.constants';
import { parseCableStatus as parseCS } from '../common/cable-status.util';

export interface InspectionIssue {
  id: string; severity: 'critical' | 'major' | 'minor';
  description: string; location: string; resolved: boolean;
}

export interface CreateInspectionDto {
  visual_check: 'pass' | 'fail';
  visual_note: string;
  redmarkup_check: 'none' | 'minor' | 'major';
  redmarkup_note: string;
  labeling_check: 'pass' | 'fail';
  labeling_note: string;
  ferrule_check: 'pass' | 'fail';
  ferrule_note: string;
  compliance_check: 'pass' | 'fail';
  compliance_note: string;
  issues: InspectionIssue[];
  inspection_notes: string;
  overall_result: 'PASS' | 'FAIL' | 'CONDITIONAL_PASS';
}

@Injectable()
export class QAQCService {
  constructor(private prisma: PrismaService) {}

  async readyPanels() {
    const assignments = await this.prisma.tech_assignments.findMany({
      where: { review_status: 'ready_for_qc', status: 'completed' },
    });
    return this._enrichAssignments(assignments);
  }

  async allCompletedPanels() {
    const assignments = await this.prisma.tech_assignments.findMany({
      where: { status: 'completed' }, orderBy: { completed_at: 'desc' },
    });
    return this._enrichAssignments(assignments);
  }

  private async _enrichAssignments(assignments: any[]) {
    const techIds = [...new Set(assignments.map((a: any) => a.technician_id))];
    const techs = techIds.length ? await this.prisma.users.findMany({ where: { id: { in: techIds } } }) : [];
    const techMap = new Map(techs.map(t => [t.id, t]));

    const inspections = assignments.length
      ? await this.prisma.panel_inspections.findMany({ where: { assignment_id: { in: assignments.map((a: any) => a.id) } } })
      : [];
    const inspMap = new Map(inspections.map(i => [i.assignment_id, i]));

    return assignments.map((a: any) => {
      const tech = techMap.get(a.technician_id);
      const frame = MockStore.findFrameById(a.frame_id);
      const existing = inspMap.get(a.id);
      const kpi = wiringKpiPercent(a.cables_src_done || 0, a.cables_dst_done || 0, a.cables_total || 0);
      return {
        ...a, cable_status: undefined, technician_name: tech?.full_name || '',
        panel_display_name: frame?.panel_name || a.panel_name, kpi,
        already_inspected: !!existing,
        inspection_id: existing?.id || null,
        inspection_result: existing?.overall_result || null,
      };
    });
  }

  async panelDetail(assignmentId: number) {
    const a = await this.prisma.tech_assignments.findUnique({ where: { id: assignmentId } });
    if (!a) throw new NotFoundException(`Assignment ${assignmentId} not found`);
    const frame = MockStore.findFrameById(a.frame_id);
    const tech = await this.prisma.users.findUnique({ where: { id: a.technician_id } });
    const existing = await this.prisma.panel_inspections.findFirst({ where: { assignment_id: assignmentId } });
    const kpi = wiringKpiPercent(a.cables_src_done || 0, a.cables_dst_done || 0, a.cables_total || 0);
    const cs = parseCS(a.cable_status);
    const cables = (frame?.cables || []).map((c, i) => {
      const st = cs[String(i)];
      return { ...c, status: st ? { src_done: st.src, dst_done: st.dst, note: st.note } : null };
    });
    const { hashed_password: _hashed_password, ...safeTech } = tech || ({} as any);
    return {
      assignment: { ...a, cable_status: undefined },
      frame: frame ? { id: frame.id, panel_name: frame.panel_name, cable_count: frame.cable_count, original_filename: frame.original_filename } : null,
      cables, technician: tech ? safeTech : null, kpi,
      cables_src_done: a.cables_src_done, cables_dst_done: a.cables_dst_done, cables_total: a.cables_total,
      existing_inspection: existing || null,
    };
  }

  async submitInspection(assignmentId: number, dto: CreateInspectionDto, inspector: { id: number; full_name?: string | null }) {
    const a = await this.prisma.tech_assignments.findUnique({ where: { id: assignmentId } });
    if (!a) throw new NotFoundException(`Assignment ${assignmentId} not found`);
    if (a.status !== 'completed') throw new BadRequestException('Panel must be completed before QC inspection');

    const qcStatus = dto.overall_result === 'PASS' ? 'passed' : dto.overall_result === 'FAIL' ? 'failed' : 'conditional';
    await this.prisma.tech_assignments.update({ where: { id: assignmentId }, data: { qc_status: qcStatus } });

    const existing = await this.prisma.panel_inspections.findFirst({ where: { assignment_id: assignmentId } });
    // Field mapping: app ferrule_check → DB redmarkup_check; app result → DB overall_result; app notes → DB inspection_notes
    const inspData = {
      qc_user_id: inspector.id,
      visual_check: dto.visual_check,
      visual_note: dto.visual_note || '',
      redmarkup_check: (dto as any).ferrule_check ?? dto.redmarkup_check,
      redmarkup_note: dto.redmarkup_note || '',
      labeling_check: dto.labeling_check,
      labeling_note: dto.labeling_note || '',
      compliance_check: dto.compliance_check,
      compliance_note: dto.compliance_note || '',
      overall_result: dto.overall_result,
      issues: dto.issues || [],
      inspection_notes: dto.inspection_notes || '',
      signed_off_at: new Date(),
    };

    let inspection: any;
    if (existing) {
      inspection = await this.prisma.panel_inspections.update({ where: { id: existing.id }, data: inspData as any });
      console.log(`[WHATSAPP] QC re-inspection for "${a.panel_name}": ${dto.overall_result}`);
      return { message: 'Inspection updated', inspection };
    }

    inspection = await this.prisma.panel_inspections.create({
      data: { assignment_id: assignmentId, ...inspData } as any,
    });
    console.log(`[WHATSAPP] QC inspection for "${a.panel_name}" by ${inspector.full_name}: ${dto.overall_result}`);
    return { message: 'Inspection submitted', inspection };
  }

  async getInspection(id: number) {
    const i = await this.prisma.panel_inspections.findUnique({ where: { id } });
    if (!i) throw new NotFoundException(`Inspection ${id} not found`);
    const a = await this.prisma.tech_assignments.findUnique({ where: { id: i.assignment_id } });
    const tech = a ? await this.prisma.users.findUnique({ where: { id: a.technician_id } }) : null;
    const inspector = await this.prisma.users.findUnique({ where: { id: i.qc_user_id } });
    return { ...i, panel_name: a?.panel_name || '', technician_name: tech?.full_name || '', inspector_name: inspector?.full_name || '' };
  }

  async allInspections() {
    const inspections = await this.prisma.panel_inspections.findMany({ orderBy: { created_at: 'desc' } });
    const assignmentIds = [...new Set(inspections.map(i => i.assignment_id))];
    const assignments = assignmentIds.length ? await this.prisma.tech_assignments.findMany({ where: { id: { in: assignmentIds } } }) : [];
    const assignMap = new Map(assignments.map(a => [a.id, a]));
    const userIds = [...new Set([...inspections.map(i => i.qc_user_id), ...assignments.map(a => a.technician_id)])];
    const users = userIds.length ? await this.prisma.users.findMany({ where: { id: { in: userIds } } }) : [];
    const userMap = new Map(users.map(u => [u.id, u]));
    return inspections.map(i => {
      const a = assignMap.get(i.assignment_id);
      return { ...i, panel_name: a?.panel_name || '', project_code: a?.project_code || '', technician_name: userMap.get(a?.technician_id || 0)?.full_name || '', inspector_name: userMap.get(i.qc_user_id)?.full_name || '' };
    });
  }

  async myInspections(userId: number) {
    const inspections = await this.prisma.panel_inspections.findMany({
      where: { qc_user_id: userId }, orderBy: { created_at: 'desc' },
    });
    const assignmentIds = [...new Set(inspections.map(i => i.assignment_id))];
    const assignments = assignmentIds.length ? await this.prisma.tech_assignments.findMany({ where: { id: { in: assignmentIds } } }) : [];
    const assignMap = new Map(assignments.map(a => [a.id, a]));
    const techIds = [...new Set(assignments.map(a => a.technician_id))];
    const techs = techIds.length ? await this.prisma.users.findMany({ where: { id: { in: techIds } } }) : [];
    const techMap = new Map(techs.map(t => [t.id, t]));
    return inspections.map(i => {
      const a = assignMap.get(i.assignment_id);
      return { ...i, panel_name: a?.panel_name || '', project_code: a?.project_code || '', technician_name: techMap.get(a?.technician_id || 0)?.full_name || '' };
    });
  }

  async stats() {
    const [total, passed, failed, conditional, ready_for_qc] = await Promise.all([
      this.prisma.panel_inspections.count(),
      this.prisma.panel_inspections.count({ where: { overall_result: 'PASS' } }),
      this.prisma.panel_inspections.count({ where: { overall_result: 'FAIL' } }),
      this.prisma.panel_inspections.count({ where: { overall_result: 'CONDITIONAL_PASS' } }),
      this.prisma.tech_assignments.count({ where: { review_status: 'ready_for_qc' } }),
    ]);
    return { total, passed, failed, conditional, ready_for_qc };
  }
}
