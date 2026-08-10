const test = require('node:test');
const assert = require('node:assert/strict');
const { BadRequestException, NotFoundException } = require('@nestjs/common');
const { PanelWorkflowService } = require('../dist/panel-workflow/panel-workflow.service');
const { PLANNING_DEFAULTS } = require('../dist/panel-workflow/panel-workflow.constants');

function makePrisma() {
  const workflows = new Map();
  const stages = new Map();
  const deps = new Map();
  const history = [];
  const templates = new Map();
  const productivity = [];
  let seq = { wf: 1, stage: 1, dep: 1, hist: 1, tpl: 1, prod: 1 };

  const prisma = {
    panel_workflows: {
      findUnique: async ({ where, include }) => {
        let row = null;
        if (where.id != null) row = workflows.get(where.id) || null;
        if (where.project_code_frame_id) {
          for (const w of workflows.values()) {
            if (w.project_code === where.project_code_frame_id.project_code
              && w.frame_id === where.project_code_frame_id.frame_id) row = w;
          }
        }
        if (!row) return null;
        if (!include) return row;
        return {
          ...row,
          stages: [...stages.values()].filter(s => s.workflow_id === row.id).sort((a, b) => a.sequence - b.sequence),
          stage_deps: [...deps.values()].filter(d => d.workflow_id === row.id),
        };
      },
      create: async ({ data }) => {
        const row = { id: seq.wf++, ...data, created_at: new Date(), updated_at: new Date() };
        workflows.set(row.id, row);
        return row;
      },
      update: async ({ where, data }) => {
        const cur = workflows.get(where.id);
        const next = { ...cur, ...data, updated_at: new Date() };
        workflows.set(where.id, next);
        return next;
      },
    },
    panel_workflow_stages: {
      findUnique: async ({ where, include }) => {
        const row = stages.get(where.id);
        if (!row) return null;
        if (include?.workflow) return { ...row, workflow: workflows.get(row.workflow_id) };
        return row;
      },
      findMany: async ({ where, select }) => {
        let rows = [...stages.values()].filter(s => !where?.workflow_id || s.workflow_id === where.workflow_id);
        if (select) return rows.map(r => Object.fromEntries(Object.keys(select).map(k => [k, r[k]])));
        return rows;
      },
      create: async ({ data }) => {
        const row = { id: seq.stage++, progress_pct: 0, enabled: true, status: 'PLANNED', ...data };
        stages.set(row.id, row);
        return row;
      },
      update: async ({ where, data }) => {
        const next = { ...stages.get(where.id), ...data };
        stages.set(where.id, next);
        return next;
      },
      deleteMany: async ({ where }) => {
        for (const [id, s] of [...stages.entries()]) {
          if (s.workflow_id === where.workflow_id) {
            stages.delete(id);
            for (const [did, d] of [...deps.entries()]) {
              if (d.stage_id === id || d.prerequisite_stage_id === id) deps.delete(did);
            }
          }
        }
        return { count: 0 };
      },
      aggregate: async ({ where }) => {
        const rows = [...stages.values()].filter(s => s.workflow_id === where.workflow_id);
        const max = rows.reduce((m, s) => Math.max(m, s.sequence), 0);
        return { _max: { sequence: max || null } };
      },
    },
    panel_workflow_stage_deps: {
      create: async ({ data }) => {
        const exists = [...deps.values()].some(d =>
          d.stage_id === data.stage_id && d.prerequisite_stage_id === data.prerequisite_stage_id);
        if (exists) {
          const err = new Error('unique');
          err.code = 'P2002';
          throw err;
        }
        const row = { id: seq.dep++, ...data };
        deps.set(row.id, row);
        return row;
      },
    },
    panel_workflow_history: {
      create: async ({ data }) => {
        const row = { id: seq.hist++, created_at: new Date(), ...data };
        history.push(row);
        return row;
      },
    },
    panel_workflow_templates: {
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
      findMany: async () => [...templates.values()],
    },
    panel_workflow_productivity_defaults: {
      findFirst: async () => null,
    },
    $transaction: async (fn) => fn(prisma),
    __stores: { workflows, stages, deps, history, templates },
  };
  return prisma;
}

test('estimateWiring computes hours from wires and targets without writing DB', async () => {
  const prisma = makePrisma();
  const svc = new PanelWorkflowService(prisma);
  const est = await svc.estimateWiring({
    project_code: 'PRJ_E',
    total_wires: 220,
    technician_count: 1,
    efficiency_factor: 1,
  });
  assert.equal(est.total_wires, 220);
  assert.equal(est.target_wires_per_hour, PLANNING_DEFAULTS.target_wires_per_hour);
  assert.equal(est.estimated_hours, 10);
  assert.equal(est.estimated_working_days, 1);
  assert.equal(est.configurable_planning_values, true);
  assert.equal(prisma.__stores.history.length, 0);
});

test('ensureWorkflow creates once then returns existing', async () => {
  const prisma = makePrisma();
  const svc = new PanelWorkflowService(prisma);
  const first = await svc.ensureWorkflow(
    { project_code: 'PRJ_EN', frame_id: 'f1', panel_name: '=T1' },
    { id: 1, role: 'prod_supervisor' },
  );
  assert.equal(first.ensured, true);
  assert.equal(first.stages.length, 11);
  const second = await svc.ensureWorkflow(
    { project_code: 'PRJ_EN', frame_id: 'f1' },
    { id: 1, role: 'prod_supervisor' },
  );
  assert.equal(second.ensured, false);
  assert.equal(second.id, first.id);
});

test('applyTemplate replace copies template stages and writes history', async () => {
  const prisma = makePrisma();
  const svc = new PanelWorkflowService(prisma);
  const wf = await svc.createWorkflow(
    { project_code: 'PRJ_TPL', frame_id: 'f2' },
    { id: 1, role: 'prod_supervisor' },
  );
  prisma.__stores.templates.set(50, {
    id: 50,
    code: 'STD_CP',
    name: 'Standard Control Panel',
    stages: [
      {
        stage_key: 'WIRING', name: 'Wiring', sequence: 1, mandatory: true,
        requires_approval: false, approval_role: null, default_duration_minutes: 600,
        default_dep_stage_key: null,
      },
      {
        stage_key: 'AC_DC_TESTING', name: 'AC/DC Testing', sequence: 2, mandatory: true,
        requires_approval: false, approval_role: null, default_duration_minutes: null,
        default_dep_stage_key: 'WIRING',
      },
    ],
  });

  const applied = await svc.applyTemplate(wf.id, { template_id: 50, mode: 'replace' }, {
    id: 1, role: 'prod_supervisor',
  });
  assert.equal(applied.stages.length, 2);
  assert.equal(applied.template_id, 50);
  assert.ok(prisma.__stores.history.some(h => h.event_type === 'template_applied'));
  assert.equal(applied.stages.find(s => s.stage_key === 'WIRING').planned_duration_minutes, 600);
});

test('applyTemplate throws NotFound for missing template', async () => {
  const prisma = makePrisma();
  const svc = new PanelWorkflowService(prisma);
  const wf = await svc.createWorkflow(
    { project_code: 'PRJ_TPL2', frame_id: 'f3' },
    { id: 1, role: 'prod_supervisor' },
  );
  await assert.rejects(
    () => svc.applyTemplate(wf.id, { template_id: 999 }, { id: 1, role: 'prod_supervisor' }),
    (err) => err instanceof NotFoundException,
  );
});

test('applyTemplate rejects empty template_id', async () => {
  const prisma = makePrisma();
  const svc = new PanelWorkflowService(prisma);
  const wf = await svc.createWorkflow(
    { project_code: 'PRJ_TPL3', frame_id: 'f4' },
    { id: 1, role: 'prod_supervisor' },
  );
  await assert.rejects(
    () => svc.applyTemplate(wf.id, {}, { id: 1, role: 'prod_supervisor' }),
    (err) => err instanceof BadRequestException,
  );
});
