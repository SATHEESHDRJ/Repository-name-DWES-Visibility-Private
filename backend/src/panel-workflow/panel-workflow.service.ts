import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { User } from '../data/mock-store';
import { TechService } from '../tech/tech.service';
import {
  DEFAULT_PANEL_STAGES,
  DIRECTOR_WA1_TEMPLATE_CODE,
  DIRECTOR_PLANNING_TEMPLATE_LABEL,
  PLANNING_DEFAULTS,
  WORKFLOW_INCLUDE,
  durationToMinutes,
} from './panel-workflow.constants';
import { buildDirectorUpgradePreview } from './panel-workflow.director-upgrade';

type Actor = Pick<User, 'id' | 'role'>;

const ACTIVE_ASSIGNMENT_STATUSES = ['assigned', 'in_progress', 'paused'] as const;

@Injectable()
export class PanelWorkflowService {
  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly techService?: TechService,
  ) {}

  private async productiveHoursForProject(project_code?: string | null): Promise<number> {
    const defaults = await this.getProductivityDefaults(project_code || undefined);
    const hours = Number(defaults.productive_hours_per_shift ?? defaults.regular_hours_per_day);
    return Number.isFinite(hours) && hours > 0
      ? hours
      : PLANNING_DEFAULTS.productive_hours_per_shift;
  }

  /** Ensure Director WA1 system template exists; sync names/durations when present. */
  async ensureDirectorWa1Template(user?: Actor | null) {
    const productiveHours = PLANNING_DEFAULTS.productive_hours_per_shift;
    const existing = await this.prisma.panel_workflow_templates.findUnique({
      where: { code: DIRECTOR_WA1_TEMPLATE_CODE },
      include: { stages: { orderBy: { sequence: 'asc' } } },
    });

    if (existing) {
      await this.prisma.panel_workflow_templates.update({
        where: { id: existing.id },
        data: {
          name: DIRECTOR_PLANNING_TEMPLATE_LABEL,
          version: 'v1',
          description:
            'Editable Director planning defaults. Apply via safe upgrade — does not overwrite silently.',
        },
      });
      for (const s of DEFAULT_PANEL_STAGES) {
        const row = existing.stages.find((t) => t.stage_key === s.stage_key);
        const payload = {
          name: s.name,
          sequence: s.sequence,
          mandatory: s.mandatory,
          requires_approval: s.requires_approval,
          approval_role: s.approval_role,
          default_duration_value: s.default_duration_value != null
            ? new Prisma.Decimal(s.default_duration_value)
            : null,
          duration_unit: s.duration_unit,
          confirmation_required: s.confirmation_required,
          supervisor_input_required: s.supervisor_input_required,
          enabled_by_default: s.enabled,
          default_duration_minutes: durationToMinutes(
            s.default_duration_value,
            s.duration_unit,
            productiveHours,
          ),
          default_dep_stage_key: s.depends_on,
        };
        if (row) {
          await this.prisma.panel_workflow_template_stages.update({
            where: { id: row.id },
            data: payload,
          });
        } else {
          await this.prisma.panel_workflow_template_stages.create({
            data: { template_id: existing.id, stage_key: s.stage_key, ...payload },
          });
        }
      }
      return this.prisma.panel_workflow_templates.findUnique({
        where: { id: existing.id },
        include: { stages: { orderBy: { sequence: 'asc' } } },
      });
    }

    return this.prisma.panel_workflow_templates.create({
      data: {
        code: DIRECTOR_WA1_TEMPLATE_CODE,
        name: DIRECTOR_PLANNING_TEMPLATE_LABEL,
        version: 'v1',
        description:
          'Editable Director planning defaults. Apply via safe upgrade — does not overwrite silently.',
        is_system: true,
        created_by: user?.id ?? null,
        stages: {
          create: DEFAULT_PANEL_STAGES.map((s) => ({
            stage_key: s.stage_key,
            name: s.name,
            sequence: s.sequence,
            mandatory: s.mandatory,
            requires_approval: s.requires_approval,
            approval_role: s.approval_role,
            default_duration_value: s.default_duration_value != null
              ? new Prisma.Decimal(s.default_duration_value)
              : null,
            duration_unit: s.duration_unit,
            confirmation_required: s.confirmation_required,
            supervisor_input_required: s.supervisor_input_required,
            enabled_by_default: s.enabled,
            default_duration_minutes: durationToMinutes(
              s.default_duration_value,
              s.duration_unit,
              productiveHours,
            ),
            default_dep_stage_key: s.depends_on,
          })),
        },
      },
      include: { stages: { orderBy: { sequence: 'asc' } } },
    });
  }

  private async writeHistory(input: {
    workflow_id: number;
    stage_id?: number | null;
    project_code: string;
    frame_id: string;
    event_type: string;
    previous_value?: string | null;
    new_value?: string | null;
    user?: Actor | null;
    reason?: string | null;
  }) {
    await this.prisma.panel_workflow_history.create({
      data: {
        workflow_id: input.workflow_id,
        stage_id: input.stage_id ?? null,
        project_code: input.project_code,
        frame_id: input.frame_id,
        event_type: input.event_type,
        previous_value: input.previous_value ?? null,
        new_value: input.new_value ?? null,
        user_id: input.user?.id ?? null,
        user_role: input.user?.role ?? null,
        reason: input.reason ?? null,
      },
    });
  }

  private wouldCreateCycle(
    edges: Array<{ stage_id: number; prerequisite_stage_id: number }>,
    stageId: number,
    prerequisiteId: number,
  ): boolean {
    const adj = new Map<number, number[]>();
    for (const e of edges) {
      if (!adj.has(e.stage_id)) adj.set(e.stage_id, []);
      adj.get(e.stage_id)!.push(e.prerequisite_stage_id);
    }
    if (!adj.has(stageId)) adj.set(stageId, []);
    adj.get(stageId)!.push(prerequisiteId);

    const seen = new Set<number>();
    const stack = [prerequisiteId];
    while (stack.length) {
      const cur = stack.pop()!;
      if (cur === stageId) return true;
      if (seen.has(cur)) continue;
      seen.add(cur);
      for (const next of adj.get(cur) || []) stack.push(next);
    }
    return false;
  }

  async createWorkflow(
    body: {
      project_code: string;
      frame_id: string;
      panel_name?: string;
      notes?: string;
      efficiency_factor?: number | null;
      target_completion_at?: string | null;
    },
    user: Actor,
  ) {
    const project_code = String(body.project_code || '').trim();
    const frame_id = String(body.frame_id || '').trim();
    if (!project_code || !frame_id) {
      throw new BadRequestException('project_code and frame_id are required');
    }

    const existing = await this.prisma.panel_workflows.findUnique({
      where: { project_code_frame_id: { project_code, frame_id } },
    });
    if (existing && existing.status !== 'ARCHIVED') {
      throw new ConflictException('A workflow already exists for this project and panel');
    }
    if (existing?.status === 'ARCHIVED') {
      await this.prisma.panel_workflows.update({
        where: { id: existing.id },
        data: {
          status: 'PLANNED',
          panel_name: body.panel_name?.trim() || existing.panel_name,
          notes: body.notes?.trim() || existing.notes,
          updated_by: user.id,
        },
      });
      await this.writeHistory({
        workflow_id: existing.id,
        project_code,
        frame_id,
        event_type: 'workflow_created',
        previous_value: JSON.stringify({ status: 'ARCHIVED' }),
        new_value: JSON.stringify({ status: 'PLANNED', revived: true }),
        user,
      });
      return this.getWorkflow(existing.id);
    }

    const productiveHours = await this.productiveHoursForProject(project_code);
    const directorTpl = await this.ensureDirectorWa1Template(user);

    const workflow = await this.prisma.$transaction(async (tx) => {
      const created = await tx.panel_workflows.create({
        data: {
          project_code,
          frame_id,
          panel_name: body.panel_name?.trim() || null,
          notes: body.notes?.trim() || null,
          status: 'PLANNED',
          template_id: directorTpl?.id ?? null,
          planning_template_version: DIRECTOR_WA1_TEMPLATE_CODE,
          efficiency_factor: body.efficiency_factor != null
            ? new Prisma.Decimal(body.efficiency_factor)
            : null,
          target_completion_at: body.target_completion_at
            ? new Date(body.target_completion_at)
            : null,
          created_by: user.id,
          updated_by: user.id,
        },
      });

      const stageRows = await Promise.all(
        DEFAULT_PANEL_STAGES.map((s) =>
          tx.panel_workflow_stages.create({
            data: {
              workflow_id: created.id,
              stage_key: s.stage_key,
              name: s.name,
              sequence: s.sequence,
              enabled: s.enabled,
              mandatory: s.mandatory,
              requires_approval: s.requires_approval,
              approval_role: s.approval_role,
              status: 'PLANNED',
              planned_duration_value: s.default_duration_value != null
                ? new Prisma.Decimal(s.default_duration_value)
                : null,
              duration_unit: s.duration_unit,
              confirmation_required: s.confirmation_required,
              supervisor_input_required: s.supervisor_input_required,
              terminology_unconfirmed: !!s.terminology_unconfirmed,
              is_legacy: false,
              planned_duration_minutes: durationToMinutes(
                s.default_duration_value,
                s.duration_unit,
                productiveHours,
              ),
            },
          }),
        ),
      );

      const byKey = new Map(stageRows.map((r) => [r.stage_key, r]));
      for (const def of DEFAULT_PANEL_STAGES) {
        if (!def.depends_on) continue;
        const stage = byKey.get(def.stage_key);
        const prereq = byKey.get(def.depends_on);
        if (!stage || !prereq) continue;
        await tx.panel_workflow_stage_deps.create({
          data: {
            workflow_id: created.id,
            stage_id: stage.id,
            prerequisite_stage_id: prereq.id,
          },
        });
      }

      await tx.panel_workflow_history.create({
        data: {
          workflow_id: created.id,
          project_code,
          frame_id,
          event_type: 'workflow_created',
          new_value: JSON.stringify({
            status: 'PLANNED',
            stages: DEFAULT_PANEL_STAGES.length,
            catalog: 'DIRECTOR_WA1',
          }),
          user_id: user.id,
          user_role: user.role,
        },
      });

      return created;
    });

    return this.getWorkflow(workflow.id);
  }

  async getWorkflow(id: number) {
    const row = await this.prisma.panel_workflows.findUnique({
      where: { id },
      include: WORKFLOW_INCLUDE,
    });
    if (!row) throw new NotFoundException('Workflow not found');
    return row;
  }

  async getByPanel(project_code: string, frame_id: string) {
    const row = await this.prisma.panel_workflows.findUnique({
      where: {
        project_code_frame_id: {
          project_code: String(project_code || '').trim(),
          frame_id: String(frame_id || '').trim(),
        },
      },
      include: WORKFLOW_INCLUDE,
    });
    return row; // null when panel has no workflow — callers keep legacy behaviour
  }

  /** Create workflow if missing; return existing active workflow otherwise. */
  async ensureWorkflow(
    body: {
      project_code: string;
      frame_id: string;
      panel_name?: string;
      notes?: string;
      efficiency_factor?: number | null;
      target_completion_at?: string | null;
    },
    user: Actor,
  ) {
    const existing = await this.getByPanel(body.project_code, body.frame_id);
    if (existing && existing.status !== 'ARCHIVED') {
      return { ...existing, ensured: false as const };
    }
    const created = await this.createWorkflow(body, user);
    return { ...created, ensured: true as const };
  }

  /**
   * Planning estimate only — does not write DB or touch tech_assignments.
   * estimated_hours = total_wires ÷ (target_wph × efficiency) ÷ tech_count
   */
  async estimateWiring(query: {
    project_code?: string;
    frame_id?: string;
    total_wires?: number | string;
    technician_count?: number | string;
    efficiency_factor?: number | string | null;
    target_wires_per_hour?: number | string | null;
    productive_hours_per_day?: number | string | null;
  }) {
    const project_code = query.project_code?.trim() || undefined;
    const defaults = await this.getProductivityDefaults(project_code);
    const totalWires = Math.max(0, Number(query.total_wires) || 0);
    const techCount = Math.max(1, Number(query.technician_count) || 1);
    const efficiency = Number(query.efficiency_factor);
    const eff = Number.isFinite(efficiency) && efficiency > 0 ? efficiency : 1;
    const targetWph = Number(query.target_wires_per_hour);
    const wph = Number.isFinite(targetWph) && targetWph > 0
      ? targetWph
      : Number(defaults.target_wires_per_hour) || PLANNING_DEFAULTS.target_wires_per_hour;
    const prodHours = Number(query.productive_hours_per_day);
    const hoursPerDay = Number.isFinite(prodHours) && prodHours > 0
      ? prodHours
      : Number(defaults.productive_hours_per_shift)
        || PLANNING_DEFAULTS.productive_hours_per_shift;

    const effectiveWph = wph * eff;
    const estimatedHours = totalWires > 0 && effectiveWph > 0
      ? totalWires / effectiveWph / techCount
      : 0;
    const estimatedDays = hoursPerDay > 0 ? estimatedHours / hoursPerDay : 0;

    return {
      configurable_planning_values: true,
      planning_note: 'Planning estimate — confirm before use. Does not overwrite actual execution data.',
      project_code: project_code ?? null,
      frame_id: query.frame_id?.trim() || null,
      total_wires: totalWires,
      target_wires_per_hour: wph,
      director_wiring_planned_hours: PLANNING_DEFAULTS.director_wiring_planned_hours,
      efficiency_factor: eff,
      planned_technicians: techCount,
      productive_hours_per_day: hoursPerDay,
      estimated_hours: Math.round(estimatedHours * 100) / 100,
      estimated_working_days: Math.round(estimatedDays * 100) / 100,
      difference_hours: Math.round(
        (estimatedHours - PLANNING_DEFAULTS.director_wiring_planned_hours) * 100,
      ) / 100,
      exceeds_planned: estimatedHours > PLANNING_DEFAULTS.director_wiring_planned_hours,
      formula: 'estimated_hours = total_wires ÷ (target_wires_per_hour × efficiency_factor) ÷ technician_count',
    };
  }

  /**
   * Copy template stages/deps into a panel workflow.
   * mode=replace (default): remove current stages and rebuild from template copy.
   * Template rows are never mutated.
   */
  async applyTemplate(
    workflowId: number,
    body: { template_id: number; mode?: 'replace' | 'merge' },
    user: Actor,
  ) {
    const workflow = await this.prisma.panel_workflows.findUnique({
      where: { id: workflowId },
      include: { stages: true },
    });
    if (!workflow) throw new NotFoundException('Workflow not found');
    if (workflow.status === 'ARCHIVED') {
      throw new BadRequestException('Cannot apply a template to an archived workflow');
    }

    const templateId = Number(body.template_id);
    if (!templateId) throw new BadRequestException('template_id is required');
    const template = await this.prisma.panel_workflow_templates.findUnique({
      where: { id: templateId },
      include: { stages: { orderBy: { sequence: 'asc' } } },
    });
    if (!template) throw new NotFoundException('Template not found');
    if (!template.stages.length) {
      throw new BadRequestException('Template has no stages to apply');
    }

    const mode = body.mode === 'merge' ? 'merge' : 'replace';

    await this.prisma.$transaction(async (tx) => {
      if (mode === 'replace') {
        await tx.panel_workflow_stages.deleteMany({ where: { workflow_id: workflowId } });
      }

      const existingKeys = mode === 'merge'
        ? new Set((await tx.panel_workflow_stages.findMany({
          where: { workflow_id: workflowId },
          select: { stage_key: true },
        })).map((s) => s.stage_key))
        : new Set<string>();

      const maxSeqRow = await tx.panel_workflow_stages.aggregate({
        where: { workflow_id: workflowId },
        _max: { sequence: true },
      });
      let nextSeq = (maxSeqRow._max.sequence || 0) + 1;

      const createdByKey = new Map<string, number>();
      for (const s of template.stages) {
        if (mode === 'merge' && existingKeys.has(s.stage_key)) continue;
        const sequence = mode === 'replace' ? s.sequence : nextSeq++;
        const row = await tx.panel_workflow_stages.create({
          data: {
            workflow_id: workflowId,
            stage_key: s.stage_key,
            name: s.name,
            sequence,
            enabled: (s as any).enabled_by_default !== false,
            mandatory: s.mandatory,
            requires_approval: s.requires_approval,
            approval_role: s.approval_role,
            planned_duration_minutes: s.default_duration_minutes,
            planned_duration_value: (s as any).default_duration_value ?? null,
            duration_unit: (s as any).duration_unit ?? null,
            confirmation_required: !!(s as any).confirmation_required,
            supervisor_input_required: !!(s as any).supervisor_input_required,
            status: 'PLANNED',
          },
        });
        createdByKey.set(s.stage_key, row.id);
      }

      // Resolve deps among newly created stages + existing (merge)
      const allStages = await tx.panel_workflow_stages.findMany({
        where: { workflow_id: workflowId },
      });
      const idByKey = new Map(allStages.map((s) => [s.stage_key, s.id]));

      for (const s of template.stages) {
        if (!s.default_dep_stage_key) continue;
        if (mode === 'merge' && !createdByKey.has(s.stage_key)) continue;
        const stageId = idByKey.get(s.stage_key);
        const prereqId = idByKey.get(s.default_dep_stage_key);
        if (!stageId || !prereqId || stageId === prereqId) continue;
        try {
          await tx.panel_workflow_stage_deps.create({
            data: {
              workflow_id: workflowId,
              stage_id: stageId,
              prerequisite_stage_id: prereqId,
            },
          });
        } catch (e: any) {
          if (e?.code !== 'P2002') throw e;
        }
      }

      await tx.panel_workflows.update({
        where: { id: workflowId },
        data: {
          template_id: template.id,
          updated_by: user.id,
          status: workflow.status === 'NOT_PLANNED' ? 'PLANNED' : workflow.status,
        },
      });

      await tx.panel_workflow_history.create({
        data: {
          workflow_id: workflowId,
          project_code: workflow.project_code,
          frame_id: workflow.frame_id,
          event_type: 'template_applied',
          new_value: JSON.stringify({
            template_id: template.id,
            template_code: template.code,
            mode,
            stages_copied: createdByKey.size,
          }),
          user_id: user.id,
          user_role: user.role,
        },
      });
    });

    return this.getWorkflow(workflowId);
  }

  /**
   * Preview safe Director Planning Template v1 upgrade (no writes).
   * Does not use replace — reports renames, adds, duration updates, legacy retain.
   */
  async previewDirectorUpgrade(workflowId: number) {
    const workflow = await this.prisma.panel_workflows.findUnique({
      where: { id: workflowId },
      include: {
        stages: {
          orderBy: { sequence: 'asc' },
          include: { assignees: true, deps_as_stage: true },
        },
        stage_deps: true,
      },
    });
    if (!workflow) throw new NotFoundException('Workflow not found');
    if (workflow.status === 'ARCHIVED') {
      throw new BadRequestException('Cannot upgrade an archived workflow');
    }

    const productiveHours = await this.productiveHoursForProject(workflow.project_code);
    const preview = buildDirectorUpgradePreview(
      workflow.stages as any,
      workflow.stage_deps as any,
      {
        planning_template_version: (workflow as any).planning_template_version ?? null,
        productiveHours,
      },
    );

    return {
      workflow_id: workflow.id,
      project_code: workflow.project_code,
      frame_id: workflow.frame_id,
      ...preview,
      display_version: preview.planning_template_version === DIRECTOR_WA1_TEMPLATE_CODE
        ? DIRECTOR_PLANNING_TEMPLATE_LABEL
        : 'Legacy',
    };
  }

  /**
   * Safe Director upgrade: merge/rename/add only. Never deletes in-use stages or resets progress.
   */
  async applyDirectorUpgrade(
    workflowId: number,
    body: { archive_unused_legacy_keys?: string[] },
    user: Actor,
  ) {
    const workflow = await this.prisma.panel_workflows.findUnique({
      where: { id: workflowId },
      include: {
        stages: {
          orderBy: { sequence: 'asc' },
          include: { assignees: true },
        },
        stage_deps: true,
      },
    });
    if (!workflow) throw new NotFoundException('Workflow not found');
    if (workflow.status === 'ARCHIVED') {
      throw new BadRequestException('Cannot upgrade an archived workflow');
    }

    const productiveHours = await this.productiveHoursForProject(workflow.project_code);
    const preview = buildDirectorUpgradePreview(
      workflow.stages as any,
      workflow.stage_deps as any,
      {
        planning_template_version: (workflow as any).planning_template_version ?? null,
        productiveHours,
      },
    );

    const archiveKeys = new Set(
      (body.archive_unused_legacy_keys || [])
        .map((k: unknown) => (k == null ? '' : String(k).trim()))
        .filter(Boolean),
    );
    for (const key of archiveKeys) {
      const allowed = preview.unused_archive_candidates.some((c) => c.stage_key === key);
      if (!allowed) {
        throw new BadRequestException(
          `Cannot archive stage key ${key}: it is in use or not an unused legacy candidate`,
        );
      }
    }

    const template = await this.ensureDirectorWa1Template(user);

    await this.prisma.$transaction(async (tx) => {
      // 1) Renames (legacy key → Director key)
      for (const r of preview.renames) {
        const def = DEFAULT_PANEL_STAGES.find((d) => d.stage_key === r.to_key);
        await tx.panel_workflow_stages.update({
          where: { id: r.stage_id },
          data: {
            stage_key: r.to_key,
            name: r.to_name,
            is_legacy: false,
            confirmation_required: def?.confirmation_required ?? false,
            supervisor_input_required: def?.supervisor_input_required ?? false,
            terminology_unconfirmed: !!def?.terminology_unconfirmed,
            mandatory: def?.mandatory ?? true,
          },
        });
      }

      // 2) Safe duration updates
      for (const d of preview.duration_updates) {
        if (!d.safe) continue;
        await tx.panel_workflow_stages.update({
          where: { id: d.stage_id },
          data: {
            planned_duration_value: d.to_value != null ? new Prisma.Decimal(d.to_value) : null,
            duration_unit: d.to_unit,
            planned_duration_minutes: durationToMinutes(
              d.to_value,
              d.to_unit,
              productiveHours,
            ),
          },
        });
      }

      // 3) Also sync names/flags for existing Director keys (idempotent polish)
      const afterRename = await tx.panel_workflow_stages.findMany({
        where: { workflow_id: workflowId },
      });
      const byKey = new Map(afterRename.map((s) => [s.stage_key, s]));
      for (const def of DEFAULT_PANEL_STAGES) {
        const row = byKey.get(def.stage_key);
        if (!row) continue;
        await tx.panel_workflow_stages.update({
          where: { id: row.id },
          data: {
            name: def.name,
            is_legacy: false,
            confirmation_required: def.confirmation_required,
            supervisor_input_required: def.supervisor_input_required,
            terminology_unconfirmed: !!def.terminology_unconfirmed,
            mandatory: def.mandatory,
            // Do not flip enabled for HV_RECONNECTION/CUTOUT/MISC if already enabled by supervisor
            ...(row.enabled === false && def.enabled === false ? {} : {}),
          },
        });
      }

      // 4) Add missing Director stages (temp sequences — re-sequenced below)
      const maxSeqRow = await tx.panel_workflow_stages.aggregate({
        where: { workflow_id: workflowId },
        _max: { sequence: true },
      });
      let nextTempSeq = Math.max(1000, (maxSeqRow._max.sequence || 0) + 1);
      for (const a of preview.adds) {
        if (byKey.has(a.stage_key)) continue;
        const def = DEFAULT_PANEL_STAGES.find((d) => d.stage_key === a.stage_key)!;
        const created = await tx.panel_workflow_stages.create({
          data: {
            workflow_id: workflowId,
            stage_key: a.stage_key,
            name: a.name,
            sequence: nextTempSeq++,
            enabled: a.enabled,
            mandatory: a.mandatory,
            requires_approval: def.requires_approval,
            approval_role: def.approval_role,
            status: 'PLANNED',
            planned_duration_value: a.default_duration_value != null
              ? new Prisma.Decimal(a.default_duration_value)
              : null,
            duration_unit: a.duration_unit,
            confirmation_required: a.confirmation_required,
            supervisor_input_required: a.supervisor_input_required,
            terminology_unconfirmed: a.terminology_unconfirmed,
            is_legacy: false,
            planned_duration_minutes: durationToMinutes(
              a.default_duration_value,
              a.duration_unit,
              productiveHours,
            ),
          },
        });
        byKey.set(a.stage_key, created);
      }

      // 5) Mark in-use legacy retained
      for (const leg of preview.legacy_retain) {
        await tx.panel_workflow_stages.update({
          where: { id: leg.stage_id },
          data: { is_legacy: true },
        });
      }

      // 6) Archive unused legacy (disable only — never delete)
      for (const cand of preview.unused_archive_candidates) {
        if (!archiveKeys.has(cand.stage_key)) {
          // Still mark as legacy so UI can badge if kept enabled
          await tx.panel_workflow_stages.update({
            where: { id: cand.stage_id },
            data: { is_legacy: true },
          });
          continue;
        }
        await tx.panel_workflow_stages.update({
          where: { id: cand.stage_id },
          data: { enabled: false, is_legacy: true },
        });
      }

      // 7) Re-sequence: Director catalog order first, then legacy retained
      const allStages = await tx.panel_workflow_stages.findMany({
        where: { workflow_id: workflowId },
      });
      const directorOrder = DEFAULT_PANEL_STAGES.map((d) => d.stage_key);
      const directorSet = new Set(directorOrder);
      const directorRows = directorOrder
        .map((k) => allStages.find((s) => s.stage_key === k))
        .filter(Boolean) as typeof allStages;
      const legacyRows = allStages
        .filter((s) => !directorSet.has(s.stage_key))
        .sort((a, b) => a.sequence - b.sequence);

      let seq = 1;
      // Temporary high sequences to avoid unique (workflow_id, sequence) collisions
      for (const s of allStages) {
        await tx.panel_workflow_stages.update({
          where: { id: s.id },
          data: { sequence: 10000 + s.id },
        });
      }
      for (const s of [...directorRows, ...legacyRows]) {
        await tx.panel_workflow_stages.update({
          where: { id: s.id },
          data: { sequence: seq++ },
        });
      }

      // 8) Rebuild Director deps from catalog; leave non-Director deps intact
      const refreshed = await tx.panel_workflow_stages.findMany({
        where: { workflow_id: workflowId },
      });
      const idByKey = new Map(refreshed.map((s) => [s.stage_key, s.id]));
      const directorIds = new Set(
        refreshed.filter((s) => directorSet.has(s.stage_key)).map((s) => s.id),
      );

      // Remove only deps where both ends are Director stages (rebuild clean)
      const existingDeps = await tx.panel_workflow_stage_deps.findMany({
        where: { workflow_id: workflowId },
      });
      for (const dep of existingDeps) {
        if (directorIds.has(dep.stage_id) && directorIds.has(dep.prerequisite_stage_id)) {
          await tx.panel_workflow_stage_deps.delete({ where: { id: dep.id } });
        }
      }

      for (const def of DEFAULT_PANEL_STAGES) {
        if (!def.depends_on) continue;
        const stageId = idByKey.get(def.stage_key);
        const prereqId = idByKey.get(def.depends_on);
        if (!stageId || !prereqId || stageId === prereqId) continue;
        try {
          await tx.panel_workflow_stage_deps.create({
            data: {
              workflow_id: workflowId,
              stage_id: stageId,
              prerequisite_stage_id: prereqId,
            },
          });
        } catch (e: any) {
          if (e?.code !== 'P2002') throw e;
        }
      }

      await tx.panel_workflows.update({
        where: { id: workflowId },
        data: {
          template_id: template?.id ?? null,
          planning_template_version: DIRECTOR_WA1_TEMPLATE_CODE,
          updated_by: user.id,
          status: workflow.status === 'NOT_PLANNED' ? 'PLANNED' : workflow.status,
        },
      });

      const meaningfulUpgrade = preview.adds.length > 0
        || preview.renames.length > 0
        || preview.duration_updates.length > 0
        || archiveKeys.size > 0
        || !preview.already_director;

      // Idempotent no-op: polish may still run above, but do not append duplicate audit rows.
      if (meaningfulUpgrade) {
        await tx.panel_workflow_history.create({
          data: {
            workflow_id: workflowId,
            project_code: workflow.project_code,
            frame_id: workflow.frame_id,
            event_type: 'director_upgrade_applied',
            new_value: JSON.stringify({
              preview,
              archived_keys: [...archiveKeys],
              version: DIRECTOR_WA1_TEMPLATE_CODE,
            }),
            user_id: user.id,
            user_role: user.role,
          },
        });
      }
    });

    return this.getWorkflow(workflowId);
  }

  async updateWorkflow(
    id: number,
    body: {
      panel_name?: string | null;
      notes?: string | null;
      status?: string;
      planned_completion_at?: string | null;
      forecast_completion_at?: string | null;
      target_completion_at?: string | null;
      efficiency_factor?: number | null;
    },
    user: Actor,
  ) {
    const current = await this.prisma.panel_workflows.findUnique({ where: { id } });
    if (!current) throw new NotFoundException('Workflow not found');

    const data: Prisma.panel_workflowsUpdateInput = { updated_by: user.id };
    if (body.panel_name !== undefined) data.panel_name = body.panel_name;
    if (body.notes !== undefined) data.notes = body.notes;
    if (body.status !== undefined) data.status = String(body.status).trim();
    if (body.planned_completion_at !== undefined) {
      data.planned_completion_at = body.planned_completion_at
        ? new Date(body.planned_completion_at)
        : null;
    }
    if (body.forecast_completion_at !== undefined) {
      data.forecast_completion_at = body.forecast_completion_at
        ? new Date(body.forecast_completion_at)
        : null;
    }
    if (body.target_completion_at !== undefined) {
      data.target_completion_at = body.target_completion_at
        ? new Date(body.target_completion_at)
        : null;
    }
    if (body.efficiency_factor !== undefined) {
      data.efficiency_factor = body.efficiency_factor != null
        ? new Prisma.Decimal(body.efficiency_factor)
        : null;
    }

    const updated = await this.prisma.panel_workflows.update({ where: { id }, data });
    await this.writeHistory({
      workflow_id: id,
      project_code: current.project_code,
      frame_id: current.frame_id,
      event_type: 'workflow_updated',
      previous_value: JSON.stringify({
        status: current.status,
        target_completion_at: current.target_completion_at,
      }),
      new_value: JSON.stringify(body),
      user,
    });
    return this.getWorkflow(updated.id);
  }

  async deleteWorkflow(id: number, user: Actor) {
    const current = await this.prisma.panel_workflows.findUnique({ where: { id } });
    if (!current) throw new NotFoundException('Workflow not found');
    // Soft-archive preserves history rows (hard delete would CASCADE them away).
    const updated = await this.prisma.panel_workflows.update({
      where: { id },
      data: { status: 'ARCHIVED', updated_by: user.id },
    });
    await this.writeHistory({
      workflow_id: id,
      project_code: current.project_code,
      frame_id: current.frame_id,
      event_type: 'workflow_archived',
      previous_value: JSON.stringify({ status: current.status }),
      new_value: JSON.stringify({ status: 'ARCHIVED' }),
      user,
    });
    return {
      archived: true,
      id: updated.id,
      project_code: current.project_code,
      frame_id: current.frame_id,
      status: updated.status,
    };
  }

  async updateStage(
    stageId: number,
    body: Record<string, unknown>,
    user: Actor,
  ) {
    const stage = await this.prisma.panel_workflow_stages.findUnique({
      where: { id: stageId },
      include: { workflow: true },
    });
    if (!stage) throw new NotFoundException('Stage not found');

    const data: Prisma.panel_workflow_stagesUpdateInput = {};
    const strFields = [
      'name', 'status', 'priority', 'instructions', 'remarks',
      'delay_reason', 'approval_status', 'approval_role', 'evidence_path',
    ] as const;
    for (const key of strFields) {
      if (body[key] !== undefined) {
        (data as any)[key] = body[key] == null ? null : String(body[key]);
      }
    }
    if (body.enabled !== undefined) data.enabled = Boolean(body.enabled);
    if (body.mandatory !== undefined) data.mandatory = Boolean(body.mandatory);
    if (body.requires_approval !== undefined) data.requires_approval = Boolean(body.requires_approval);
    if (body.confirmation_required !== undefined) {
      data.confirmation_required = Boolean(body.confirmation_required);
    }
    if (body.supervisor_input_required !== undefined) {
      data.supervisor_input_required = Boolean(body.supervisor_input_required);
    }

    const productiveHours = await this.productiveHoursForProject(stage.workflow.project_code);
    const hasValue = body.planned_duration_value !== undefined;
    const hasUnit = body.duration_unit !== undefined;
    const hasMinutes = body.planned_duration_minutes !== undefined;

    if (hasValue || hasUnit) {
      const nextValue = hasValue
        ? (body.planned_duration_value == null || body.planned_duration_value === ''
          ? null
          : Number(body.planned_duration_value))
        : (stage.planned_duration_value != null ? Number(stage.planned_duration_value) : null);
      const nextUnit = hasUnit
        ? (body.duration_unit == null || body.duration_unit === ''
          ? null
          : String(body.duration_unit))
        : stage.duration_unit;
      data.planned_duration_value = nextValue == null ? null : new Prisma.Decimal(nextValue);
      data.duration_unit = nextUnit;
      data.planned_duration_minutes = durationToMinutes(nextValue, nextUnit, productiveHours);
    } else if (hasMinutes) {
      data.planned_duration_minutes = body.planned_duration_minutes == null
        ? null
        : Number(body.planned_duration_minutes);
    }

    if (body.progress_pct !== undefined) data.progress_pct = Number(body.progress_pct) || 0;
    if (body.delay_minutes !== undefined) {
      data.delay_minutes = body.delay_minutes == null ? null : Number(body.delay_minutes);
    }
    for (const ts of ['planned_start_at', 'planned_finish_at', 'actual_start_at', 'actual_finish_at', 'approved_at'] as const) {
      if (body[ts] !== undefined) {
        (data as any)[ts] = body[ts] ? new Date(String(body[ts])) : null;
      }
    }
    if (body.sequence !== undefined) data.sequence = Number(body.sequence);

    const updated = await this.prisma.panel_workflow_stages.update({
      where: { id: stageId },
      data,
    });
    await this.writeHistory({
      workflow_id: stage.workflow_id,
      stage_id: stageId,
      project_code: stage.workflow.project_code,
      frame_id: stage.workflow.frame_id,
      event_type: 'stage_updated',
      previous_value: JSON.stringify({
        name: stage.name,
        status: stage.status,
        sequence: stage.sequence,
        enabled: stage.enabled,
      }),
      new_value: JSON.stringify(body),
      user,
    });
    return updated;
  }

  async addStage(
    workflowId: number,
    body: {
      stage_key: string;
      name: string;
      sequence?: number;
      mandatory?: boolean;
      requires_approval?: boolean;
      approval_role?: string | null;
    },
    user: Actor,
  ) {
    const workflow = await this.prisma.panel_workflows.findUnique({
      where: { id: workflowId },
      include: { stages: true },
    });
    if (!workflow) throw new NotFoundException('Workflow not found');

    const stage_key = String(body.stage_key || '').trim().toUpperCase().replace(/\s+/g, '_');
    const name = String(body.name || '').trim();
    if (!stage_key || !name) throw new BadRequestException('stage_key and name are required');
    if (workflow.stages.some((s) => s.stage_key === stage_key)) {
      throw new ConflictException(`Stage key ${stage_key} already exists`);
    }

    const maxSeq = workflow.stages.reduce((m, s) => Math.max(m, s.sequence), 0);
    const sequence = body.sequence != null ? Number(body.sequence) : maxSeq + 1;

    const created = await this.prisma.panel_workflow_stages.create({
      data: {
        workflow_id: workflowId,
        stage_key,
        name,
        sequence,
        mandatory: body.mandatory !== false,
        requires_approval: !!body.requires_approval,
        approval_role: body.approval_role ?? null,
        status: 'PLANNED',
      },
    });
    await this.writeHistory({
      workflow_id: workflowId,
      stage_id: created.id,
      project_code: workflow.project_code,
      frame_id: workflow.frame_id,
      event_type: 'stage_added',
      new_value: JSON.stringify({ stage_key, name, sequence }),
      user,
    });
    return created;
  }

  async removeStage(stageId: number, user: Actor) {
    const stage = await this.prisma.panel_workflow_stages.findUnique({
      where: { id: stageId },
      include: { workflow: true },
    });
    if (!stage) throw new NotFoundException('Stage not found');
    await this.writeHistory({
      workflow_id: stage.workflow_id,
      stage_id: stageId,
      project_code: stage.workflow.project_code,
      frame_id: stage.workflow.frame_id,
      event_type: 'stage_removed',
      previous_value: JSON.stringify({ stage_key: stage.stage_key, name: stage.name }),
      user,
    });
    await this.prisma.panel_workflow_stages.delete({ where: { id: stageId } });
    return { deleted: true, id: stageId };
  }

  async addDependency(
    workflowId: number,
    body: { stage_id: number; prerequisite_stage_id: number },
    user: Actor,
  ) {
    const workflow = await this.prisma.panel_workflows.findUnique({
      where: { id: workflowId },
      include: { stages: true, stage_deps: true },
    });
    if (!workflow) throw new NotFoundException('Workflow not found');

    const stageId = Number(body.stage_id);
    const prerequisiteId = Number(body.prerequisite_stage_id);
    if (!stageId || !prerequisiteId || stageId === prerequisiteId) {
      throw new BadRequestException('stage_id and prerequisite_stage_id must be different');
    }
    const ids = new Set(workflow.stages.map((s) => s.id));
    if (!ids.has(stageId) || !ids.has(prerequisiteId)) {
      throw new BadRequestException('Both stages must belong to this workflow');
    }
    if (this.wouldCreateCycle(workflow.stage_deps, stageId, prerequisiteId)) {
      throw new BadRequestException('Dependency would create a cycle');
    }

    try {
      const dep = await this.prisma.panel_workflow_stage_deps.create({
        data: {
          workflow_id: workflowId,
          stage_id: stageId,
          prerequisite_stage_id: prerequisiteId,
        },
      });
      await this.writeHistory({
        workflow_id: workflowId,
        stage_id: stageId,
        project_code: workflow.project_code,
        frame_id: workflow.frame_id,
        event_type: 'dependency_added',
        new_value: JSON.stringify({ stage_id: stageId, prerequisite_stage_id: prerequisiteId }),
        user,
      });
      return dep;
    } catch (e: any) {
      if (e?.code === 'P2002') throw new ConflictException('Dependency already exists');
      throw e;
    }
  }

  async removeDependency(depId: number, user: Actor) {
    const dep = await this.prisma.panel_workflow_stage_deps.findUnique({
      where: { id: depId },
      include: { workflow: true },
    });
    if (!dep) throw new NotFoundException('Dependency not found');
    await this.prisma.panel_workflow_stage_deps.delete({ where: { id: depId } });
    await this.writeHistory({
      workflow_id: dep.workflow_id,
      stage_id: dep.stage_id,
      project_code: dep.workflow.project_code,
      frame_id: dep.workflow.frame_id,
      event_type: 'dependency_removed',
      previous_value: JSON.stringify({
        stage_id: dep.stage_id,
        prerequisite_stage_id: dep.prerequisite_stage_id,
      }),
      user,
    });
    return { deleted: true, id: depId };
  }

  async assignStageUser(
    stageId: number,
    body: { user_id: number; role_hint?: string | null },
    user: Actor,
  ) {
    const stage = await this.prisma.panel_workflow_stages.findUnique({
      where: { id: stageId },
      include: { workflow: true },
    });
    if (!stage) throw new NotFoundException('Stage not found');
    const userId = Number(body.user_id);
    if (!userId) throw new BadRequestException('user_id is required');

    const target = await this.prisma.users.findUnique({ where: { id: userId } });
    if (!target) throw new NotFoundException('User not found');

    // Case D — non-WIRING stages: stage-scoped assignee only (no Digital Wiring Schedule).
    if (String(stage.stage_key).toUpperCase() !== 'WIRING') {
      return this.createStageAssigneeOnly(stage, userId, body.role_hint ?? null, user);
    }

    return this.assignWiringStageWithPanel(stage, userId, target, body.role_hint ?? null, user);
  }

  private async createStageAssigneeOnly(
    stage: {
      id: number;
      workflow_id: number;
      stage_key: string;
      workflow: { project_code: string; frame_id: string };
    },
    userId: number,
    roleHint: string | null,
    user: Actor,
  ) {
    try {
      const row = await this.prisma.panel_workflow_stage_assignees.create({
        data: {
          stage_id: stage.id,
          user_id: userId,
          role_hint: roleHint,
          assigned_by: user.id,
        },
      });
      await this.writeHistory({
        workflow_id: stage.workflow_id,
        stage_id: stage.id,
        project_code: stage.workflow.project_code,
        frame_id: stage.workflow.frame_id,
        event_type: 'assignment_changed',
        new_value: JSON.stringify({ user_id: userId, action: 'assigned', stage_key: stage.stage_key }),
        user,
      });
      return {
        stage_assignee: row,
        panel_assignment: null,
        panel_created: false,
        message: 'Stage assignment created.',
      };
    } catch (e: any) {
      if (e?.code === 'P2002') throw new ConflictException('User already assigned to this stage');
      throw e;
    }
  }

  /**
   * WIRING stage assign must also establish (or respect) the canonical panel
   * wiring assignment in tech_assignments — Technician Dashboard only reads that table.
   */
  private async assignWiringStageWithPanel(
    stage: {
      id: number;
      workflow_id: number;
      stage_key: string;
      workflow: { project_code: string; frame_id: string };
    },
    userId: number,
    target: { id: number; username: string | null; full_name: string | null; role: string; is_active: boolean | null },
    roleHint: string | null,
    user: Actor,
  ) {
    if (!this.techService) {
      throw new BadRequestException('Panel wiring assignment service is unavailable.');
    }
    if (target.role !== 'wiring_technician') {
      throw new BadRequestException('Only wiring technicians can be assigned to the Wiring stage for panel execution.');
    }
    if (target.is_active === false) {
      throw new BadRequestException('This technician account is deactivated and cannot receive assignments');
    }

    const projectCode = stage.workflow.project_code;
    const frameId = stage.workflow.frame_id;

    const activePanel = await this.prisma.tech_assignments.findFirst({
      where: {
        project_code: projectCode,
        frame_id: frameId,
        status: { in: [...ACTIVE_ASSIGNMENT_STATUSES] },
        changeover_locked: { not: true },
      },
    });

    let panelCreated = false;
    let panelAssignment: unknown = null;
    let panelMessage = '';

    if (activePanel) {
      if (activePanel.technician_id === userId) {
        // Case B — same technician already owns the panel.
        panelAssignment = activePanel;
        panelMessage = 'Technician is already assigned to this panel.';
      } else {
        // Case C — another technician owns active wiring work.
        const other = await this.prisma.users.findUnique({ where: { id: activePanel.technician_id } });
        const otherLabel = other?.full_name || other?.username || `technician #${activePanel.technician_id}`;
        throw new ConflictException(
          `This panel is currently assigned to ${otherLabel}. Use the existing Mid Change workflow to transfer active wiring work.`,
        );
      }
    } else {
      // Case A — create canonical panel wiring assignment, then stage link.
      try {
        const created = await this.techService.assignFrame({
          project_code: projectCode,
          frame_id: frameId,
          technician_id: userId,
          assigned_by_id: user.id,
        });
        panelAssignment = created?.assignment ?? created;
        panelCreated = true;
        panelMessage = 'Panel wiring assignment created.';
      } catch (err) {
        // Do not create a stage assignee without a panel assignment.
        throw err;
      }
    }

    let stageAssignee = await this.prisma.panel_workflow_stage_assignees.findUnique({
      where: { stage_id_user_id: { stage_id: stage.id, user_id: userId } },
    });

    if (!stageAssignee) {
      try {
        stageAssignee = await this.prisma.panel_workflow_stage_assignees.create({
          data: {
            stage_id: stage.id,
            user_id: userId,
            role_hint: roleHint,
            assigned_by: user.id,
          },
        });
        await this.writeHistory({
          workflow_id: stage.workflow_id,
          stage_id: stage.id,
          project_code: projectCode,
          frame_id: frameId,
          event_type: 'assignment_changed',
          new_value: JSON.stringify({
            user_id: userId,
            action: 'assigned',
            stage_key: 'WIRING',
            panel_created: panelCreated,
            technician_username: target.username,
          }),
          user,
        });
      } catch (e: any) {
        if (e?.code === 'P2002') {
          stageAssignee = await this.prisma.panel_workflow_stage_assignees.findUnique({
            where: { stage_id_user_id: { stage_id: stage.id, user_id: userId } },
          });
        } else if (panelCreated && panelAssignment && typeof panelAssignment === 'object' && panelAssignment && 'id' in panelAssignment) {
          // Compensating rollback: remove virgin panel assignment if stage link failed.
          try {
            await this.techService.deleteAssignment(Number((panelAssignment as { id: number }).id));
          } catch {
            /* best-effort */
          }
          throw e;
        } else {
          throw e;
        }
      }
    } else if (panelCreated) {
      await this.writeHistory({
        workflow_id: stage.workflow_id,
        stage_id: stage.id,
        project_code: projectCode,
        frame_id: frameId,
        event_type: 'assignment_changed',
        new_value: JSON.stringify({
          user_id: userId,
          action: 'panel_linked',
          stage_key: 'WIRING',
          panel_created: true,
          technician_username: target.username,
        }),
        user,
      });
    }

    return {
      stage_assignee: stageAssignee,
      panel_assignment: panelAssignment,
      panel_created: panelCreated,
      message: panelMessage || (stageAssignee ? 'Wiring stage assignment linked to panel.' : 'Wiring assignment completed.'),
    };
  }

  async removeStageAssignee(assigneeId: number, user: Actor) {
    const row = await this.prisma.panel_workflow_stage_assignees.findUnique({
      where: { id: assigneeId },
      include: { stage: { include: { workflow: true } } },
    });
    if (!row) throw new NotFoundException('Assignee not found');
    await this.prisma.panel_workflow_stage_assignees.delete({ where: { id: assigneeId } });
    await this.writeHistory({
      workflow_id: row.stage.workflow_id,
      stage_id: row.stage_id,
      project_code: row.stage.workflow.project_code,
      frame_id: row.stage.workflow.frame_id,
      event_type: 'assignment_changed',
      previous_value: JSON.stringify({ user_id: row.user_id, action: 'removed' }),
      user,
    });
    return { deleted: true, id: assigneeId };
  }

  async listHistory(workflowId: number) {
    const workflow = await this.prisma.panel_workflows.findUnique({ where: { id: workflowId } });
    if (!workflow) throw new NotFoundException('Workflow not found');
    return this.prisma.panel_workflow_history.findMany({
      where: { workflow_id: workflowId },
      orderBy: { created_at: 'desc' },
    });
  }

  async listTemplates() {
    await this.ensureDirectorWa1Template(null);
    return this.prisma.panel_workflow_templates.findMany({
      include: { stages: { orderBy: { sequence: 'asc' } } },
      orderBy: { name: 'asc' },
    });
  }

  async createTemplate(
    body: {
      code: string;
      name: string;
      description?: string;
      stages?: Array<{
        stage_key: string;
        name: string;
        sequence: number;
        mandatory?: boolean;
        requires_approval?: boolean;
        approval_role?: string | null;
        default_duration_minutes?: number | null;
        default_duration_value?: number | null;
        duration_unit?: string | null;
        confirmation_required?: boolean;
        supervisor_input_required?: boolean;
        enabled_by_default?: boolean;
        default_dep_stage_key?: string | null;
      }>;
    },
    user: Actor,
  ) {
    const code = String(body.code || '').trim().toUpperCase().replace(/\s+/g, '_');
    const name = String(body.name || '').trim();
    if (!code || !name) throw new BadRequestException('code and name are required');

    const productiveHours = PLANNING_DEFAULTS.productive_hours_per_shift;
    const stages = Array.isArray(body.stages) && body.stages.length
      ? body.stages
      : DEFAULT_PANEL_STAGES.map((s) => ({
          stage_key: s.stage_key,
          name: s.name,
          sequence: s.sequence,
          mandatory: s.mandatory,
          requires_approval: s.requires_approval,
          approval_role: s.approval_role,
          default_duration_value: s.default_duration_value,
          duration_unit: s.duration_unit,
          confirmation_required: s.confirmation_required,
          supervisor_input_required: s.supervisor_input_required,
          enabled_by_default: s.enabled,
          default_duration_minutes: durationToMinutes(
            s.default_duration_value,
            s.duration_unit,
            productiveHours,
          ),
          default_dep_stage_key: s.depends_on,
        }));

    try {
      return await this.prisma.panel_workflow_templates.create({
        data: {
          code,
          name,
          description: body.description?.trim() || null,
          is_system: false,
          created_by: user.id,
          stages: {
            create: stages.map((s) => {
              const value = s.default_duration_value ?? null;
              const unit = s.duration_unit ?? null;
              const minutes = s.default_duration_minutes != null
                ? s.default_duration_minutes
                : durationToMinutes(value, unit, productiveHours);
              return {
                stage_key: String(s.stage_key).trim(),
                name: String(s.name).trim(),
                sequence: Number(s.sequence),
                mandatory: s.mandatory !== false,
                requires_approval: !!s.requires_approval,
                approval_role: s.approval_role ?? null,
                default_duration_minutes: minutes,
                default_duration_value: value != null ? new Prisma.Decimal(value) : null,
                duration_unit: unit,
                confirmation_required: !!s.confirmation_required,
                supervisor_input_required: !!s.supervisor_input_required,
                enabled_by_default: s.enabled_by_default !== false,
                default_dep_stage_key: s.default_dep_stage_key ?? null,
              };
            }),
          },
        },
        include: { stages: { orderBy: { sequence: 'asc' } } },
      });
    } catch (e: any) {
      if (e?.code === 'P2002') throw new ConflictException('Template code already exists');
      throw e;
    }
  }

  async deleteTemplate(id: number, user: Actor) {
    const tpl = await this.prisma.panel_workflow_templates.findUnique({ where: { id } });
    if (!tpl) throw new NotFoundException('Template not found');
    if (tpl.is_system && user.role !== 'system_admin') {
      throw new BadRequestException('System templates can only be deleted by system_admin');
    }
    await this.prisma.panel_workflow_templates.delete({ where: { id } });
    return { deleted: true, id };
  }

  async getProductivityDefaults(project_code?: string) {
    const code = project_code?.trim() || null;
    const projectRow = code
      ? await this.prisma.panel_workflow_productivity_defaults.findFirst({
          where: { project_code: code },
        })
      : null;
    const globalRow = await this.prisma.panel_workflow_productivity_defaults.findFirst({
      where: { project_code: null },
    });
    const row = projectRow || globalRow;
    return {
      ...PLANNING_DEFAULTS,
      ...(row
        ? {
            id: row.id,
            project_code: row.project_code,
            regular_hours_per_day: row.regular_hours_per_day != null
              ? Number(row.regular_hours_per_day)
              : PLANNING_DEFAULTS.regular_hours_per_day,
            productive_hours_per_shift: row.productive_hours_per_shift != null
              ? Number(row.productive_hours_per_shift)
              : PLANNING_DEFAULTS.productive_hours_per_shift,
            target_wires_per_day: row.target_wires_per_day
              ?? PLANNING_DEFAULTS.target_wires_per_day,
            target_wires_per_hour: row.target_wires_per_hour
              ?? PLANNING_DEFAULTS.target_wires_per_hour,
            standard_minutes_per_wire: row.standard_minutes_per_wire != null
              ? Number(row.standard_minutes_per_wire)
              : null,
            wire_delay_warning_minutes: row.wire_delay_warning_minutes
              ?? PLANNING_DEFAULTS.wire_delay_warning_minutes,
            break_duration_minutes: row.break_duration_minutes,
            lunch_duration_minutes: row.lunch_duration_minutes,
            allowed_overtime_minutes: row.allowed_overtime_minutes,
            source: projectRow ? 'project' : 'global_db',
          }
        : { source: 'code_defaults' as const, project_code: code }),
    };
  }

  async putProductivityDefaults(
    body: {
      project_code?: string | null;
      regular_hours_per_day?: number | null;
      productive_hours_per_shift?: number | null;
      target_wires_per_day?: number | null;
      target_wires_per_hour?: number | null;
      standard_minutes_per_wire?: number | null;
      wire_delay_warning_minutes?: number | null;
      break_duration_minutes?: number | null;
      lunch_duration_minutes?: number | null;
      allowed_overtime_minutes?: number | null;
    },
    user: Actor,
  ) {
    const project_code = body.project_code?.trim() || null;
    const existing = await this.prisma.panel_workflow_productivity_defaults.findFirst({
      where: project_code == null ? { project_code: null } : { project_code },
    });

    const data = {
      regular_hours_per_day: body.regular_hours_per_day != null
        ? new Prisma.Decimal(body.regular_hours_per_day)
        : undefined,
      productive_hours_per_shift: body.productive_hours_per_shift != null
        ? new Prisma.Decimal(body.productive_hours_per_shift)
        : undefined,
      target_wires_per_day: body.target_wires_per_day ?? undefined,
      target_wires_per_hour: body.target_wires_per_hour ?? undefined,
      standard_minutes_per_wire: body.standard_minutes_per_wire != null
        ? new Prisma.Decimal(body.standard_minutes_per_wire)
        : undefined,
      wire_delay_warning_minutes: body.wire_delay_warning_minutes ?? undefined,
      break_duration_minutes: body.break_duration_minutes ?? undefined,
      lunch_duration_minutes: body.lunch_duration_minutes ?? undefined,
      allowed_overtime_minutes: body.allowed_overtime_minutes ?? undefined,
      updated_by: user.id,
    };

    if (existing) {
      await this.prisma.panel_workflow_productivity_defaults.update({
        where: { id: existing.id },
        data,
      });
    } else {
      await this.prisma.panel_workflow_productivity_defaults.create({
        data: {
          project_code,
          regular_hours_per_day: body.regular_hours_per_day != null
            ? new Prisma.Decimal(body.regular_hours_per_day)
            : new Prisma.Decimal(PLANNING_DEFAULTS.regular_hours_per_day),
          productive_hours_per_shift: body.productive_hours_per_shift != null
            ? new Prisma.Decimal(body.productive_hours_per_shift)
            : new Prisma.Decimal(PLANNING_DEFAULTS.productive_hours_per_shift),
          target_wires_per_day: body.target_wires_per_day
            ?? PLANNING_DEFAULTS.target_wires_per_day,
          target_wires_per_hour: body.target_wires_per_hour
            ?? PLANNING_DEFAULTS.target_wires_per_hour,
          wire_delay_warning_minutes: body.wire_delay_warning_minutes
            ?? PLANNING_DEFAULTS.wire_delay_warning_minutes,
          standard_minutes_per_wire: body.standard_minutes_per_wire != null
            ? new Prisma.Decimal(body.standard_minutes_per_wire)
            : null,
          break_duration_minutes: body.break_duration_minutes ?? null,
          lunch_duration_minutes: body.lunch_duration_minutes ?? null,
          allowed_overtime_minutes: body.allowed_overtime_minutes ?? null,
          updated_by: user.id,
        },
      });
    }
    return this.getProductivityDefaults(project_code || undefined);
  }
}
