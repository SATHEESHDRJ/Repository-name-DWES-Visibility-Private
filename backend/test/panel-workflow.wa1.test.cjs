const test = require('node:test');
const assert = require('node:assert/strict');
const { PanelWorkflowService } = require('../dist/panel-workflow/panel-workflow.service');
const {
  DEFAULT_PANEL_STAGES,
  PLANNING_DEFAULTS,
  DIRECTOR_WA1_TEMPLATE_CODE,
  durationToMinutes,
  minutesToDisplayHours,
} = require('../dist/panel-workflow/panel-workflow.constants');

test('durationToMinutes converts days using configured productive hours (not hard-coded 10)', () => {
  assert.equal(durationToMinutes(0.5, 'days', 10), 300);
  assert.equal(durationToMinutes(0.5, 'days', 8), 240);
  assert.equal(durationToMinutes(2, 'days', 10), 1200);
  assert.equal(durationToMinutes(11, 'hours', 10), 660);
  assert.equal(durationToMinutes(3, 'hours', null), 180);
  assert.equal(durationToMinutes(90, 'minutes', 10), 90);
  assert.equal(durationToMinutes(null, 'days', 10), null);
});

test('minutesToDisplayHours rounds to two decimals', () => {
  assert.equal(minutesToDisplayHours(300), 5);
  assert.equal(minutesToDisplayHours(660), 11);
  assert.equal(minutesToDisplayHours(null), null);
});

test('WA1 catalog flags confirmation and supervisor-input stages', () => {
  const hv = DEFAULT_PANEL_STAGES.find(s => s.stage_key === 'HV_RECONNECTION');
  assert.ok(hv);
  assert.equal(hv.confirmation_required, true);
  assert.equal(hv.enabled, false);
  assert.equal(hv.default_duration_value, null);

  const packingPunch = DEFAULT_PANEL_STAGES.find(s => s.stage_key === 'PACKING_PUNCH_CLEARANCE');
  assert.equal(packingPunch.supervisor_input_required, true);
  assert.equal(packingPunch.default_duration_value, null);

  const cutout = DEFAULT_PANEL_STAGES.find(s => s.stage_key === 'CUTOUT');
  assert.equal(cutout.supervisor_input_required, true);
  assert.equal(cutout.enabled, false);

  const misc = DEFAULT_PANEL_STAGES.find(s => s.stage_key === 'MISCELLANEOUS');
  assert.equal(misc.supervisor_input_required, true);
  assert.equal(misc.mandatory, false);
});

// Minimal prisma stub shared with create/ensure/updateStage tests
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
        const row = { id: seq.wf++, ...data };
        workflows.set(row.id, row);
        return row;
      },
      update: async ({ where, data }) => {
        const next = { ...workflows.get(where.id), ...data };
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
      create: async ({ data }) => {
        const row = {
          id: seq.stage++,
          progress_pct: 0,
          enabled: true,
          confirmation_required: false,
          supervisor_input_required: false,
          ...data,
        };
        stages.set(row.id, row);
        return row;
      },
      update: async ({ where, data }) => {
        const next = { ...stages.get(where.id), ...data };
        stages.set(where.id, next);
        return next;
      },
      deleteMany: async ({ where }) => {
        for (const [id, s] of stages.entries()) {
          if (s.workflow_id === where.workflow_id) stages.delete(id);
        }
        return { count: 0 };
      },
      findMany: async ({ where }) => [...stages.values()].filter(s => s.workflow_id === where.workflow_id),
      aggregate: async () => ({ _max: { sequence: Math.max(0, ...[...stages.values()].map(s => s.sequence)) } }),
    },
    panel_workflow_stage_deps: {
      create: async ({ data }) => {
        const row = { id: seq.dep++, ...data };
        deps.set(row.id, row);
        return row;
      },
    },
    panel_workflow_history: {
      create: async ({ data }) => {
        const row = { id: seq.hist++, ...data };
        history.push(row);
        return row;
      },
      findMany: async () => history,
    },
    panel_workflow_templates: {
      findMany: async () => [...templates.values()],
      findUnique: async ({ where, include }) => {
        let row = null;
        if (where.id != null) row = templates.get(where.id) || null;
        if (where.code) {
          for (const t of templates.values()) if (t.code === where.code) row = t;
        }
        if (!row) return null;
        if (!include) return row;
        return { ...row, stages: row.stages || [] };
      },
      create: async ({ data }) => {
        const { stages: stageCreate, ...rest } = data;
        const row = {
          id: seq.tpl++,
          version: 'v1',
          ...rest,
          stages: (stageCreate?.create || []).map((s, i) => ({ id: i + 1, template_id: 0, ...s })),
        };
        row.stages = row.stages.map(s => ({ ...s, template_id: row.id }));
        templates.set(row.id, row);
        return row;
      },
      update: async ({ where, data }) => {
        const next = { ...templates.get(where.id), ...data };
        templates.set(where.id, next);
        return next;
      },
    },
    panel_workflow_template_stages: {
      update: async ({ where, data }) => {
        for (const t of templates.values()) {
          const idx = (t.stages || []).findIndex(s => s.id === where.id);
          if (idx >= 0) {
            t.stages[idx] = { ...t.stages[idx], ...data };
            return t.stages[idx];
          }
        }
        return null;
      },
      create: async ({ data }) => {
        const t = templates.get(data.template_id);
        const row = { id: (t?.stages?.length || 0) + 100, ...data };
        if (t) {
          t.stages = [...(t.stages || []), row];
          templates.set(t.id, t);
        }
        return row;
      },
    },
    panel_workflow_productivity_defaults: {
      findFirst: async ({ where }) => {
        if (where.project_code === null) return productivity.find(p => p.project_code == null) || null;
        return productivity.find(p => p.project_code === where.project_code) || null;
      },
    },
    $transaction: async (fn) => fn(prisma),
    __stores: { workflows, stages, deps, history, templates },
  };
  return prisma;
}

test('createWorkflow seeds WA1 durations and confirmation flags', async () => {
  const prisma = makePrisma();
  const svc = new PanelWorkflowService(prisma);
  const wf = await svc.createWorkflow(
    { project_code: 'WA1', frame_id: 'frame_wa1', panel_name: '=H001' },
    { id: 1, role: 'prod_supervisor' },
  );
  assert.equal(wf.stages.length, 11);
  const assembly = wf.stages.find(s => s.stage_key === 'PANEL_ASSEMBLY');
  assert.equal(Number(assembly.planned_duration_value), 2);
  assert.equal(assembly.duration_unit, 'days');
  assert.equal(assembly.planned_duration_minutes, 1200);

  const hv = wf.stages.find(s => s.stage_key === 'HV_RECONNECTION');
  assert.equal(hv.confirmation_required, true);
  assert.equal(hv.enabled, false);

  const punch = wf.stages.find(s => s.stage_key === 'PACKING_PUNCH_CLEARANCE');
  assert.equal(punch.supervisor_input_required, true);
  assert.equal(punch.planned_duration_minutes, null);
});

test('ensureWorkflow does not overwrite an existing active workflow', async () => {
  const prisma = makePrisma();
  const svc = new PanelWorkflowService(prisma);
  const first = await svc.ensureWorkflow(
    { project_code: 'WA1E', frame_id: 'f1', panel_name: '=H001' },
    { id: 1, role: 'prod_supervisor' },
  );
  const stageCount = first.stages.length;
  const second = await svc.ensureWorkflow(
    { project_code: 'WA1E', frame_id: 'f1', panel_name: '=H001' },
    { id: 1, role: 'prod_supervisor' },
  );
  assert.equal(second.id, first.id);
  assert.equal(second.ensured, false);
  assert.equal(second.stages.length, stageCount);
  assert.equal(prisma.__stores.workflows.size, 1);
});

test('updateStage recomputes minutes from value+unit using productive hours', async () => {
  const prisma = makePrisma();
  prisma.panel_workflow_productivity_defaults.findFirst = async ({ where }) => {
    if (where.project_code === 'WA1U') {
      return { project_code: 'WA1U', productive_hours_per_shift: 8, regular_hours_per_day: 8 };
    }
    return null;
  };
  const svc = new PanelWorkflowService(prisma);
  const wf = await svc.createWorkflow(
    { project_code: 'WA1U', frame_id: 'f2' },
    { id: 1, role: 'prod_supervisor' },
  );
  const assembly = wf.stages.find(s => s.stage_key === 'PANEL_ASSEMBLY');
  const updated = await svc.updateStage(assembly.id, {
    planned_duration_value: 0.5,
    duration_unit: 'days',
  }, { id: 1, role: 'prod_supervisor' });
  assert.equal(updated.planned_duration_minutes, 240); // 0.5 × 8h × 60
});

test('estimateWiring keeps 22 wph and director 11h without overwriting', async () => {
  const prisma = makePrisma();
  const svc = new PanelWorkflowService(prisma);
  const est = await svc.estimateWiring({
    project_code: 'WA1',
    total_wires: 935,
    technician_count: 1,
  });
  assert.equal(est.target_wires_per_hour, 22);
  assert.equal(est.director_wiring_planned_hours, 11);
  assert.equal(est.estimated_hours, Math.round((935 / 22) * 100) / 100);
  assert.equal(est.exceeds_planned, true);
  assert.ok(est.difference_hours > 0);
});

test('listTemplates seeds DIRECTOR_WA1_V1 system template once', async () => {
  const prisma = makePrisma();
  const svc = new PanelWorkflowService(prisma);
  const list1 = await svc.listTemplates();
  const list2 = await svc.listTemplates();
  const matches = list2.filter(t => t.code === DIRECTOR_WA1_TEMPLATE_CODE);
  assert.equal(matches.length, 1);
  assert.equal(matches[0].is_system, true);
  assert.equal(matches[0].stages.length, 11);
  assert.equal(list1.length, list2.length);
  assert.equal(PLANNING_DEFAULTS.target_wires_per_hour, 22);
});
