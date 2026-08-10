const test = require('node:test');
const assert = require('node:assert/strict');
const {
  buildDirectorUpgradePreview,
  isStageInUse,
  resolveDirectorKey,
} = require('../dist/panel-workflow/panel-workflow.director-upgrade');
const {
  DEFAULT_PANEL_STAGES,
  DIRECTOR_WA1_TEMPLATE_CODE,
} = require('../dist/panel-workflow/panel-workflow.constants');
const { PanelWorkflowService } = require('../dist/panel-workflow/panel-workflow.service');

test('resolveDirectorKey maps legacy W1 keys', () => {
  assert.equal(resolveDirectorKey('AC_DC_TESTING'), 'QAQC_PENDING_PUNCH');
  assert.equal(resolveDirectorKey('FAT_CLEARANCE'), 'FAT_PUNCH_CLEARANCE');
  assert.equal(resolveDirectorKey('PACKING_READINESS'), 'PACKING_PUNCH_CLEARANCE');
  assert.equal(resolveDirectorKey('WIRING'), 'WIRING');
});

test('isStageInUse detects assignees, progress, actuals, status, deps', () => {
  assert.equal(isStageInUse({ id: 1, stage_key: 'HV_TESTING', assignees: [{ id: 1 }] }).inUse, true);
  assert.equal(isStageInUse({ id: 1, stage_key: 'HV_TESTING', progress_pct: 10 }).inUse, true);
  assert.equal(isStageInUse({ id: 1, stage_key: 'HV_TESTING', actual_start_at: new Date() }).inUse, true);
  assert.equal(isStageInUse({ id: 1, stage_key: 'HV_TESTING', status: 'IN_PROGRESS' }).inUse, true);
  assert.equal(
    isStageInUse({ id: 2, stage_key: 'HV_TESTING', status: 'PLANNED' }, [
      { stage_id: 9, prerequisite_stage_id: 2 },
    ]).inUse,
    true,
  );
  assert.equal(isStageInUse({ id: 1, stage_key: 'HV_TESTING', status: 'PLANNED', progress_pct: 0 }).inUse, false);
});

test('preview maps legacy catalog: renames, adds, retain in-use HV_TESTING', () => {
  const stages = [
    { id: 1, stage_key: 'WIRING', name: 'Wiring', sequence: 1, status: 'IN_PROGRESS', progress_pct: 5, assignees: [{ id: 1 }], planned_duration_minutes: 480 },
    { id: 2, stage_key: 'AC_DC_TESTING', name: 'QC / QA', sequence: 2, status: 'PLANNED', progress_pct: 0 },
    { id: 3, stage_key: 'HV_TESTING', name: 'HV Testing', sequence: 3, status: 'PLANNED', progress_pct: 20 },
    { id: 4, stage_key: 'HV_REWORK', name: 'HV Rework', sequence: 4, status: 'PLANNED', progress_pct: 0 },
    { id: 5, stage_key: 'FAT_CLEARANCE', name: 'FAT Clearance', sequence: 5, status: 'PLANNED', progress_pct: 0 },
    { id: 6, stage_key: 'PACKING_READINESS', name: 'Packing Readiness', sequence: 6, status: 'PLANNED', progress_pct: 0 },
    { id: 7, stage_key: 'PACKING', name: 'Packing', sequence: 7, status: 'PLANNED', progress_pct: 0 },
    { id: 8, stage_key: 'DISPATCH', name: 'Dispatch', sequence: 8, status: 'PLANNED', progress_pct: 0 },
  ];
  const preview = buildDirectorUpgradePreview(stages, [], { productiveHours: 10 });

  assert.ok(preview.renames.some(r => r.from_key === 'AC_DC_TESTING' && r.to_key === 'QAQC_PENDING_PUNCH'));
  assert.ok(preview.renames.some(r => r.from_key === 'FAT_CLEARANCE' && r.to_key === 'FAT_PUNCH_CLEARANCE'));
  assert.ok(preview.renames.some(r => r.from_key === 'PACKING_READINESS' && r.to_key === 'PACKING_PUNCH_CLEARANCE'));

  assert.ok(preview.adds.some(a => a.stage_key === 'PANEL_ASSEMBLY'));
  assert.ok(preview.adds.some(a => a.stage_key === 'HS_SHORTING'));
  assert.ok(preview.adds.some(a => a.stage_key === 'HV_RECONNECTION'));
  assert.ok(!preview.adds.some(a => a.stage_key === 'WIRING'), 'WIRING must not be duplicated');

  assert.ok(preview.legacy_retain.some(l => l.stage_key === 'HV_TESTING'));
  assert.ok(preview.unused_archive_candidates.some(c => c.stage_key === 'HV_REWORK'));
  assert.ok(preview.unused_archive_candidates.some(c => c.stage_key === 'DISPATCH'));
});

test('QAQC display name in catalog is QA/QC Pending Punch Points', () => {
  const qa = DEFAULT_PANEL_STAGES.find(s => s.stage_key === 'QAQC_PENDING_PUNCH');
  assert.equal(qa.name, 'QA/QC Pending Punch Points');
  const hs = DEFAULT_PANEL_STAGES.find(s => s.stage_key === 'HS_SHORTING');
  assert.equal(hs.terminology_unconfirmed, true);
});

function makePrisma() {
  const workflows = new Map();
  const stages = new Map();
  const deps = new Map();
  const history = [];
  const templates = new Map();
  let seq = { wf: 1, stage: 1, dep: 1, hist: 1, tpl: 1 };

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
          stages: [...stages.values()]
            .filter(s => s.workflow_id === row.id)
            .sort((a, b) => a.sequence - b.sequence)
            .map(s => ({ ...s, assignees: s.assignees || [] })),
          stage_deps: [...deps.values()].filter(d => d.workflow_id === row.id),
        };
      },
      create: async ({ data }) => {
        const row = { id: seq.wf++, planning_template_version: null, ...data };
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
          is_legacy: false,
          terminology_unconfirmed: false,
          assignees: [],
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
      findMany: async ({ where }) => [...stages.values()].filter(s => s.workflow_id === where.workflow_id),
      aggregate: async () => ({ _max: { sequence: Math.max(0, ...[...stages.values()].map(s => s.sequence)) } }),
      deleteMany: async ({ where }) => {
        for (const [id, s] of stages.entries()) {
          if (s.workflow_id === where.workflow_id) stages.delete(id);
        }
        return { count: 0 };
      },
    },
    panel_workflow_stage_deps: {
      create: async ({ data }) => {
        const row = { id: seq.dep++, ...data };
        deps.set(row.id, row);
        return row;
      },
      findMany: async ({ where }) => [...deps.values()].filter(d => d.workflow_id === where.workflow_id),
      delete: async ({ where }) => {
        deps.delete(where.id);
        return { id: where.id };
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
      findUnique: async ({ where }) => {
        if (where.id != null) return templates.get(where.id) || null;
        if (where.code) {
          for (const t of templates.values()) if (t.code === where.code) return { ...t, stages: t.stages || [] };
        }
        return null;
      },
      create: async ({ data }) => {
        const { stages: stageCreate, ...rest } = data;
        const row = {
          id: seq.tpl++,
          version: 'v1',
          ...rest,
          stages: (stageCreate?.create || []).map((s, i) => ({ id: i + 1, ...s })),
        };
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
      update: async ({ where, data }) => data,
      create: async ({ data }) => data,
    },
    panel_workflow_productivity_defaults: {
      findFirst: async () => null,
    },
    $transaction: async (fn) => fn(prisma),
    __stores: { workflows, stages, deps, history, templates },
  };
  return prisma;
}

test('upgrade adds missing stages without duplicating WIRING; retains in-use HV_TESTING', async () => {
  const prisma = makePrisma();
  const svc = new PanelWorkflowService(prisma);
  const wfRow = await prisma.panel_workflows.create({
    data: {
      project_code: 'DU',
      frame_id: 'D00+Q01',
      status: 'PLANNED',
      planning_template_version: null,
    },
  });
  const wiring = await prisma.panel_workflow_stages.create({
    data: {
      workflow_id: wfRow.id,
      stage_key: 'WIRING',
      name: 'Wiring',
      sequence: 1,
      status: 'IN_PROGRESS',
      progress_pct: 5,
      assignees: [{ id: 99 }],
      planned_duration_value: 8,
      duration_unit: 'hours',
      planned_duration_minutes: 480,
    },
  });
  await prisma.panel_workflow_stages.create({
    data: {
      workflow_id: wfRow.id,
      stage_key: 'AC_DC_TESTING',
      name: 'QC / QA',
      sequence: 2,
      status: 'PLANNED',
    },
  });
  await prisma.panel_workflow_stages.create({
    data: {
      workflow_id: wfRow.id,
      stage_key: 'HV_TESTING',
      name: 'HV Testing',
      sequence: 3,
      status: 'PLANNED',
      progress_pct: 40,
    },
  });
  await prisma.panel_workflow_stages.create({
    data: {
      workflow_id: wfRow.id,
      stage_key: 'DISPATCH',
      name: 'Dispatch',
      sequence: 4,
      status: 'PLANNED',
      progress_pct: 0,
    },
  });

  const preview = await svc.previewDirectorUpgrade(wfRow.id);
  assert.ok(preview.adds.some(a => a.stage_key === 'PANEL_ASSEMBLY'));
  assert.ok(!preview.adds.some(a => a.stage_key === 'WIRING'));
  assert.ok(preview.legacy_retain.some(l => l.stage_key === 'HV_TESTING'));
  assert.ok(preview.unused_archive_candidates.some(c => c.stage_key === 'DISPATCH'));

  const upgraded = await svc.applyDirectorUpgrade(wfRow.id, {
    archive_unused_legacy_keys: ['DISPATCH'],
  }, { id: 1, role: 'prod_supervisor' });

  const wiringAfter = upgraded.stages.find(s => s.stage_key === 'WIRING');
  assert.ok(wiringAfter);
  assert.equal(wiringAfter.id, wiring.id);
  assert.equal(wiringAfter.progress_pct, 5);
  assert.equal(upgraded.stages.filter(s => s.stage_key === 'WIRING').length, 1);

  const qa = upgraded.stages.find(s => s.stage_key === 'QAQC_PENDING_PUNCH');
  assert.ok(qa);
  assert.equal(qa.name, 'QA/QC Pending Punch Points');

  const hv = upgraded.stages.find(s => s.stage_key === 'HV_TESTING');
  assert.ok(hv);
  assert.equal(hv.is_legacy, true);
  assert.equal(hv.progress_pct, 40);

  const dispatch = upgraded.stages.find(s => s.stage_key === 'DISPATCH');
  assert.equal(dispatch.enabled, false);
  assert.equal(dispatch.is_legacy, true);

  assert.equal(upgraded.planning_template_version, DIRECTOR_WA1_TEMPLATE_CODE);

  // Idempotent second upgrade
  const again = await svc.applyDirectorUpgrade(wfRow.id, {}, { id: 1, role: 'prod_supervisor' });
  assert.equal(again.stages.filter(s => s.stage_key === 'WIRING').length, 1);
  assert.equal(again.stages.filter(s => s.stage_key === 'PANEL_ASSEMBLY').length, 1);
  assert.equal(again.planning_template_version, DIRECTOR_WA1_TEMPLATE_CODE);

  const hist = await prisma.panel_workflow_history.findMany();
  assert.ok(hist.some(h => h.event_type === 'director_upgrade_applied'));
});

test('createWorkflow sets planning_template_version DIRECTOR_WA1_V1', async () => {
  const prisma = makePrisma();
  const svc = new PanelWorkflowService(prisma);
  const wf = await svc.createWorkflow(
    { project_code: 'NEW', frame_id: 'H001' },
    { id: 1, role: 'prod_supervisor' },
  );
  assert.equal(wf.planning_template_version, DIRECTOR_WA1_TEMPLATE_CODE);
  assert.equal(wf.stages.length, DEFAULT_PANEL_STAGES.length);
  const hs = wf.stages.find(s => s.stage_key === 'HS_SHORTING');
  assert.equal(hs.terminology_unconfirmed, true);
});
