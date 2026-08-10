const test = require('node:test');
const assert = require('node:assert/strict');
const { BadRequestException, ConflictException, NotFoundException } = require('@nestjs/common');
const { PanelWorkflowService } = require('../dist/panel-workflow/panel-workflow.service');
const {
  DEFAULT_PANEL_STAGES,
  PLANNING_DEFAULTS,
} = require('../dist/panel-workflow/panel-workflow.constants');

function makePrisma(seed = {}) {
  const workflows = new Map(seed.workflows || []);
  const stages = new Map(seed.stages || []);
  const deps = new Map(seed.deps || []);
  const history = [];
  const assignees = new Map();
  const templates = new Map();
  const productivity = [];
  let seq = { wf: 1, stage: 1, dep: 1, hist: 1, asg: 1, tpl: 1, prod: 1 };

  const prisma = {
    panel_workflows: {
      findUnique: async ({ where }) => {
        if (where.id != null) return workflows.get(where.id) || null;
        if (where.project_code_frame_id) {
          for (const w of workflows.values()) {
            if (w.project_code === where.project_code_frame_id.project_code
              && w.frame_id === where.project_code_frame_id.frame_id) return w;
          }
        }
        return null;
      },
      create: async ({ data }) => {
        const row = { id: seq.wf++, ...data, created_at: new Date(), updated_at: new Date() };
        workflows.set(row.id, row);
        return row;
      },
      update: async ({ where, data }) => {
        const cur = workflows.get(where.id);
        if (!cur) throw Object.assign(new Error('missing'), { code: 'P2025' });
        const next = { ...cur, ...data, updated_at: new Date() };
        workflows.set(where.id, next);
        return next;
      },
      delete: async ({ where }) => {
        workflows.delete(where.id);
        return {};
      },
    },
    panel_workflow_stages: {
      findUnique: async ({ where, include }) => {
        const row = stages.get(where.id);
        if (!row) return null;
        if (include?.workflow) return { ...row, workflow: workflows.get(row.workflow_id) };
        return row;
      },
      create: async ({ data }) => {
        const row = { id: seq.stage++, progress_pct: 0, enabled: true, status: 'PLANNED', ...data };
        stages.set(row.id, row);
        return row;
      },
      update: async ({ where, data }) => {
        const cur = stages.get(where.id);
        const next = { ...cur, ...data };
        stages.set(where.id, next);
        return next;
      },
      delete: async ({ where }) => { stages.delete(where.id); return {}; },
    },
    panel_workflow_stage_deps: {
      create: async ({ data }) => {
        const row = { id: seq.dep++, ...data };
        deps.set(row.id, row);
        return row;
      },
      findUnique: async ({ where, include }) => {
        const row = deps.get(where.id);
        if (!row) return null;
        if (include?.workflow) return { ...row, workflow: workflows.get(row.workflow_id) };
        return row;
      },
      delete: async ({ where }) => { deps.delete(where.id); return {}; },
    },
    panel_workflow_history: {
      create: async ({ data }) => {
        const row = { id: seq.hist++, created_at: new Date(), ...data };
        history.push(row);
        return row;
      },
      findMany: async ({ where }) => history.filter(h => h.workflow_id === where.workflow_id).reverse(),
    },
    panel_workflow_stage_assignees: {
      create: async ({ data }) => {
        const row = { id: seq.asg++, ...data };
        assignees.set(row.id, row);
        return row;
      },
      findUnique: async () => null,
      delete: async () => ({}),
    },
    panel_workflow_templates: {
      findMany: async () => [...templates.values()],
      findUnique: async ({ where, include }) => {
        let row = null;
        if (where.id != null) row = templates.get(where.id) || null;
        else if (where.code) {
          for (const t of templates.values()) {
            if (t.code === where.code) { row = t; break; }
          }
        }
        if (!row) return null;
        if (include?.stages) return row;
        return row;
      },
      create: async ({ data }) => {
        const { stages: stageCreate, ...rest } = data;
        const row = {
          id: seq.tpl++,
          ...rest,
          stages: (stageCreate?.create || []).map((s, i) => ({ id: i + 1, ...s })),
        };
        templates.set(row.id, row);
        return row;
      },
      delete: async ({ where }) => { templates.delete(where.id); return {}; },
    },
    panel_workflow_productivity_defaults: {
      findFirst: async ({ where }) => {
        if (where.project_code === null) return productivity.find(p => p.project_code == null) || null;
        return productivity.find(p => p.project_code === where.project_code) || null;
      },
      create: async ({ data }) => {
        const row = { id: seq.prod++, ...data };
        productivity.push(row);
        return row;
      },
      update: async ({ where, data }) => {
        const idx = productivity.findIndex(p => p.id === where.id);
        productivity[idx] = { ...productivity[idx], ...data };
        return productivity[idx];
      },
    },
    users: {
      findUnique: async ({ where }) => (where.id === 9 ? { id: 9, role: 'wiring_technician' } : null),
    },
    $transaction: async (fn) => fn(prisma),
  };

  // enrich findUnique workflow with stages/deps for getWorkflow path used after create
  const origWfFind = prisma.panel_workflows.findUnique;
  prisma.panel_workflows.findUnique = async (args) => {
    const row = await origWfFind(args);
    if (!row) return null;
    if (args.include) {
      const stageRows = [...stages.values()].filter(s => s.workflow_id === row.id)
        .sort((a, b) => a.sequence - b.sequence)
        .map(s => ({
          ...s,
          assignees: [...assignees.values()].filter(a => a.stage_id === s.id),
          deps_as_stage: [...deps.values()].filter(d => d.stage_id === s.id),
        }));
      return {
        ...row,
        stages: stageRows,
        stage_deps: [...deps.values()].filter(d => d.workflow_id === row.id),
      };
    }
    return row;
  };

  // For addDependency / create path that includes stages+deps
  const wrapFindWithInclude = prisma.panel_workflows.findUnique;
  prisma.panel_workflows.findUnique = async (args) => {
    const row = await wrapFindWithInclude(args);
    if (!row || !args.include?.stages) {
      if (row && args.include?.stages === undefined && args.include) return row;
    }
    if (!row) return null;
    if (args.include?.stages || args.include?.stage_deps) {
      const stageRows = [...stages.values()].filter(s => s.workflow_id === row.id);
      return {
        ...row,
        stages: stageRows,
        stage_deps: [...deps.values()].filter(d => d.workflow_id === row.id),
      };
    }
    return row;
  };

  prisma.__stores = { workflows, stages, deps, history, productivity };
  return prisma;
}

test('DEFAULT_PANEL_STAGES defines Director WA1 planning catalog', () => {
  assert.equal(DEFAULT_PANEL_STAGES.length, 11);
  assert.equal(DEFAULT_PANEL_STAGES[0].stage_key, 'PANEL_ASSEMBLY');
  assert.equal(DEFAULT_PANEL_STAGES[1].stage_key, 'WIRING');
  assert.equal(DEFAULT_PANEL_STAGES[1].default_duration_value, 11);
  assert.equal(DEFAULT_PANEL_STAGES[1].duration_unit, 'hours');
  assert.equal(DEFAULT_PANEL_STAGES[10].stage_key, 'PANEL_COMPLETION');
  assert.equal(PLANNING_DEFAULTS.target_wires_per_hour, 22);
  assert.equal(PLANNING_DEFAULTS.director_wiring_planned_hours, 11);
  assert.equal(PLANNING_DEFAULTS.configurable_planning_values, true);
});

test('createWorkflow copies default stages and recommended dependencies', async () => {
  const prisma = makePrisma();
  const svc = new PanelWorkflowService(prisma);
  const wf = await svc.createWorkflow(
    { project_code: 'PRJ_W1', frame_id: 'frame_w1', panel_name: '=H001' },
    { id: 1, role: 'prod_supervisor' },
  );
  assert.equal(wf.project_code, 'PRJ_W1');
  assert.equal(wf.stages.length, 11);
  assert.ok(wf.stage_deps.length >= 8);
  assert.equal(prisma.__stores.history[0].event_type, 'workflow_created');
  const wiring = wf.stages.find(s => s.stage_key === 'WIRING');
  assert.equal(Number(wiring.planned_duration_value), 11);
  assert.equal(wiring.duration_unit, 'hours');
  assert.equal(wiring.planned_duration_minutes, 660);
});

test('createWorkflow rejects duplicate active workflow', async () => {
  const prisma = makePrisma();
  const svc = new PanelWorkflowService(prisma);
  await svc.createWorkflow(
    { project_code: 'PRJ_DUP', frame_id: 'f1' },
    { id: 1, role: 'prod_supervisor' },
  );
  await assert.rejects(
    () => svc.createWorkflow({ project_code: 'PRJ_DUP', frame_id: 'f1' }, { id: 1, role: 'prod_supervisor' }),
    (err) => err instanceof ConflictException,
  );
});

test('addDependency rejects cycles', async () => {
  const prisma = makePrisma();
  const svc = new PanelWorkflowService(prisma);
  const wf = await svc.createWorkflow(
    { project_code: 'PRJ_CYC', frame_id: 'f2' },
    { id: 1, role: 'prod_supervisor' },
  );
  const wiring = wf.stages.find(s => s.stage_key === 'WIRING');
  const qaqc = wf.stages.find(s => s.stage_key === 'QAQC_PENDING_PUNCH');
  // QAQC already depends on WIRING; adding WIRING → QAQC creates a cycle
  await assert.rejects(
    () => svc.addDependency(wf.id, { stage_id: wiring.id, prerequisite_stage_id: qaqc.id }, { id: 1, role: 'prod_supervisor' }),
    (err) => err instanceof BadRequestException && /cycle/i.test(err.message),
  );
});

test('getProductivityDefaults returns code defaults when no DB row', async () => {
  const prisma = makePrisma();
  const svc = new PanelWorkflowService(prisma);
  const defaults = await svc.getProductivityDefaults();
  assert.equal(defaults.source, 'code_defaults');
  assert.equal(defaults.regular_hours_per_day, 10);
  assert.equal(defaults.wire_delay_warning_minutes, 15);
  assert.equal(defaults.configurable_planning_values, true);
});

test('getByPanel returns null when no workflow exists', async () => {
  const prisma = makePrisma();
  const svc = new PanelWorkflowService(prisma);
  const row = await svc.getByPanel('NONE', 'none');
  assert.equal(row, null);
});

test('deleteWorkflow soft-archives and keeps history', async () => {
  const prisma = makePrisma();
  const svc = new PanelWorkflowService(prisma);
  const wf = await svc.createWorkflow(
    { project_code: 'PRJ_ARC', frame_id: 'f3' },
    { id: 1, role: 'prod_supervisor' },
  );
  const result = await svc.deleteWorkflow(wf.id, { id: 1, role: 'prod_supervisor' });
  assert.equal(result.archived, true);
  assert.equal(result.status, 'ARCHIVED');
  const still = await prisma.panel_workflows.findUnique({ where: { id: wf.id } });
  assert.equal(still.status, 'ARCHIVED');
  assert.ok(prisma.__stores.history.some(h => h.event_type === 'workflow_archived'));
});

test('getWorkflow throws NotFound for missing id', async () => {
  const prisma = makePrisma();
  const svc = new PanelWorkflowService(prisma);
  await assert.rejects(() => svc.getWorkflow(99999), (err) => err instanceof NotFoundException);
});
