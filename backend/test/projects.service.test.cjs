const test = require('node:test');
const assert = require('node:assert/strict');
const { BadRequestException, ConflictException, NotFoundException } = require('@nestjs/common');
const { ProjectsService } = require('../dist/projects/projects.service');
const { MockStore } = require('../dist/data/mock-store');
const { FrameStore } = require('../dist/frames/frame-store');

function prismaForProjects(overrides = {}) {
  const projectOverrides = overrides.projects || {};
  return {
    projects: {
      findUnique: async () => null,
      findFirst: projectOverrides.findFirst || projectOverrides.findUnique || (async () => null),
      findMany: async () => [],
      create: async ({ data }) => ({ id: 1, ...data }),
      update: async ({ data }) => ({ ...data }),
      ...projectOverrides,
    },
    tech_assignments: {
      findMany: async () => [],
      findFirst: async () => null,
      update: async (args) => args,
      ...(overrides.tech_assignments || {}),
    },
    tech_audit_log: {
      create: async (args) => args,
      findFirst: async () => null,
      ...(overrides.tech_audit_log || {}),
    },
    users: {
      findUnique: async () => null,
      ...(overrides.users || {}),
    },
  };
}

test('ProjectsService.findAll always requests active database projects only', async () => {
  const service = new ProjectsService(prismaForProjects({
    projects: {
      findMany: async (args) => {
        assert.deepEqual(args, { where: { is_active: true }, orderBy: { sequence: 'asc' } });
        return [{ code: 'ACTIVE', is_active: true }];
      },
    },
  }));
  assert.deepEqual(await service.findAll(), [{ code: 'ACTIVE', is_active: true }]);
});

test('ProjectsService.create rejects empty panel list', async () => {
  const service = new ProjectsService(prismaForProjects());
  await assert.rejects(
    () => service.create({ code: 'P1', client: 'Client', name: 'Project', panels: [] }),
    (err) => err instanceof BadRequestException && err.message === 'At least one panel is required',
  );
});

test('ProjectsService.create rejects duplicate project numbering', async () => {
  const service = new ProjectsService(prismaForProjects({
    projects: { findUnique: async () => ({ code: 'P1' }) },
  }));

  await assert.rejects(
    () => service.create({
      code: 'P1',
      client: 'Client',
      name: 'Project',
      panels: [{ name: 'Panel 1', voltage_level: '11kV' }],
    }),
    (err) => err instanceof ConflictException && err.message === 'Project numbering already exists',
  );
});

test('ProjectsService.codeAvailability checks normalized project numbering', async () => {
  let requestedCode = '';
  const service = new ProjectsService(prismaForProjects({
    projects: {
      findUnique: async ({ where }) => {
        requestedCode = where.code;
        return null;
      },
    },
  }));

  const result = await service.codeAvailability(' enowa-001 ');
  assert.equal(requestedCode, 'ENOWA-001');
  assert.deepEqual(result, { code: 'ENOWA-001', available: true });
});

test('ProjectsService.create rejects route-unsafe project numbering', async () => {
  const service = new ProjectsService(prismaForProjects());
  await assert.rejects(
    () => service.create({
      code: 'ENOWA/001',
      client: 'ENOWA',
      name: 'ENOWA Project',
      panels: [{ name: '=H001', voltage_level: '132KV' }],
    }),
    (err) => err instanceof BadRequestException && err.message.includes('Project numbering may contain only'),
  );
});

test('ProjectsService.create persists initial panel metadata', async () => {
  const oldSave = FrameStore.save;
  const initialFrames = [...MockStore.frames];
  FrameStore.save = () => {};

  const service = new ProjectsService(prismaForProjects({
    projects: {
      findUnique: async () => null,
      create: async ({ data }) => ({ id: 9, ...data }),
    },
  }));

  const created = await service.create({
    code: ' prj-create ',
    client: 'Client',
    name: 'New Project',
    panels: [{
      name: ' Main Panel ',
      type: 'Control',
      description: 'Primary',
      voltage_level: ' 11kV ',
      system_type: 'LV',
    }],
  });

  assert.equal(created.code, 'PRJ-CREATE');
  assert.equal(created.panels.length, 1);
  assert.equal(created.panels[0].name, 'Main Panel');
  assert.equal(created.panels[0].voltage_level, '11kV');
  assert.equal(created.panels[0].type, 'Control');
  assert.equal(MockStore.frames.some((f) => f.project_code === 'PRJ-CREATE' && f.panel_name === 'Main Panel'), true);

  MockStore.frames = initialFrames;
  FrameStore.save = oldSave;
});

test('ProjectsService.create converts a concurrent unique constraint race into a numbering conflict', async () => {
  const service = new ProjectsService(prismaForProjects({
    projects: {
      findUnique: async () => null,
      create: async () => { throw { code: 'P2002' }; },
    },
  }));

  await assert.rejects(
    () => service.create({
      code: 'ENOWA-001',
      client: 'ENOWA',
      name: 'ENOWA Project',
      panels: [{ name: '=H001', voltage_level: '132KV' }],
    }),
    (err) => err instanceof ConflictException && err.message === 'Project numbering already exists',
  );
});

test('ProjectsService.submitToDirector rejects unknown project', async () => {
  const service = new ProjectsService(prismaForProjects());
  await assert.rejects(
    () => service.submitToDirector('MISSING'),
    (err) => err instanceof NotFoundException && err.message === 'Project MISSING not found',
  );
});

test('ProjectsService.submitToDirector requires panel target when QA/QC workflow is disabled', async () => {
  const service = new ProjectsService(prismaForProjects({
    projects: { findFirst: async () => ({ code: 'PRJ-1', is_active: true }) },
  }));

  await assert.rejects(
    () => service.submitToDirector('PRJ-1'),
    (err) => err instanceof BadRequestException && err.message === 'Panel frame or assignment id is required',
  );
});

test('ProjectsService.submitToDirector rejects when no completed panels exist (QA enabled legacy)', async () => {
  process.env.QA_QC_WORKFLOW_ENABLED = 'true';
  try {
    const service = new ProjectsService(prismaForProjects({
      projects: { findFirst: async () => ({ code: 'PRJ-1', is_active: true }) },
      tech_assignments: { findMany: async () => [] },
    }));

    await assert.rejects(
      () => service.submitToDirector('PRJ-1'),
      (err) => err instanceof BadRequestException && err.message === 'No completed panels to submit',
    );
  } finally {
    delete process.env.QA_QC_WORKFLOW_ENABLED;
  }
});

test('ProjectsService.submitToDirector rejects when QC is pending', async () => {
  process.env.QA_QC_WORKFLOW_ENABLED = 'true';
  try {
    const service = new ProjectsService(prismaForProjects({
      projects: { findFirst: async () => ({ code: 'PRJ-2', is_active: true }) },
      tech_assignments: {
        findMany: async () => [{ review_status: 'ready_for_qc' }],
      },
    }));

    await assert.rejects(
      () => service.submitToDirector('PRJ-2'),
      (err) => err instanceof BadRequestException && err.message === '1 panel(s) still pending QC check',
    );
  } finally {
    delete process.env.QA_QC_WORKFLOW_ENABLED;
  }
});

test('ProjectsService.submitToDirector rejects when completed panels are marked rework', async () => {
  process.env.QA_QC_WORKFLOW_ENABLED = 'true';
  try {
    const service = new ProjectsService(prismaForProjects({
      projects: { findFirst: async () => ({ code: 'PRJ-3', is_active: true }) },
      tech_assignments: {
        findMany: async () => [
          { review_status: 'approved' },
          { review_status: 'rework' },
        ],
      },
    }));

    await assert.rejects(
      () => service.submitToDirector('PRJ-3'),
      (err) => err instanceof BadRequestException && err.message === '1 panel(s) still marked for rework',
    );
  } finally {
    delete process.env.QA_QC_WORKFLOW_ENABLED;
  }
});

test('ProjectsService.submitToDirector updates state and writes audit rows', async () => {
  process.env.QA_QC_WORKFLOW_ENABLED = 'true';
  try {
    const projectUpdates = [];
    const auditRows = [];
    const service = new ProjectsService(prismaForProjects({
      projects: {
        findFirst: async () => ({ code: 'PRJ-4', is_active: true, project_state: 'active' }),
        update: async (args) => {
          projectUpdates.push(args);
          return args;
        },
      },
      tech_assignments: {
        findMany: async () => [
          { id: 1, review_status: 'approved', frame_id: 'F1', panel_name: 'P1', technician_id: 9, status: 'completed' },
          { id: 2, review_status: 'approved', frame_id: 'F2', panel_name: 'P2', technician_id: 9, status: 'completed' },
        ],
        update: async (args) => args,
      },
      tech_audit_log: {
        findFirst: async () => null,
        create: async (args) => {
          auditRows.push(args);
          return args;
        },
      },
      users: { findUnique: async () => ({ full_name: 'Tech' }) },
    }));

    const result = await service.submitToDirector('PRJ-4', { id: 5, full_name: 'Sup One', username: 'sup1' });
    assert.equal(result.message, 'Project submitted to director with 2 completed panel(s)');
    assert.equal(result.submission_status, 'submitted');
    assert.equal(projectUpdates.length, 1);
    assert.deepEqual(projectUpdates[0], {
      where: { code: 'PRJ-4' },
      data: { project_state: 'submitted_to_director' },
    });
    assert.equal(auditRows.length, 2);
    assert.equal(auditRows[0].data.action, 'submitted_to_director');
  } finally {
    delete process.env.QA_QC_WORKFLOW_ENABLED;
  }
});

test('ProjectsService.submitToDirector per-panel writes one audit when wiring is complete', async () => {
  const auditRows = [];
  const cableStatus = JSON.stringify({ 0: { src: true, dst: true } });
  const assignment = {
    id: 10,
    project_code: 'PRJ-P',
    frame_id: 'F-H001',
    panel_name: '=H001',
    technician_id: 3,
    status: 'completed',
    completed_at: new Date(),
    cables_total: 1,
    cable_status: cableStatus,
    review_status: null,
  };
  const service = new ProjectsService(prismaForProjects({
    projects: { findFirst: async () => ({ code: 'PRJ-P', is_active: true }) },
    tech_assignments: {
      // submitToDirector's target.frameId branch (no assignmentId) resolves the panel
      // via findMany({ orderBy: { id: 'desc' }, take: 1 }), not findFirst — it always
      // wants the *latest* assignment for a frame (matters after a mid-change/rework
      // cycle leaves older rows for the same frame_id). findFirst is only reached on
      // the assignmentId-provided path, which this test doesn't exercise.
      findFirst: async () => null,
      findMany: async () => [assignment],
    },
    tech_audit_log: {
      findFirst: async () => null,
      create: async (args) => {
        auditRows.push(args);
        return args;
      },
    },
    users: { findUnique: async () => ({ full_name: 'Tech One' }) },
  }));

  const result = await service.submitToDirector(
    'PRJ-P',
    { id: 1, full_name: 'Supervisor', username: 'sup' },
    { frameId: 'F-H001' },
  );
  assert.equal(result.submission_status, 'submitted');
  assert.equal(auditRows.length, 1);
  assert.equal(auditRows[0].data.action, 'submitted_to_director');
  assert.equal(auditRows[0].data.frame_id, 'F-H001');
});

test('ProjectsService.submitToDirector per-panel retry is idempotent: one audit row, one publish, same result replayed', async () => {
  const auditRows = [];
  const publishedEvents = [];
  const cableStatus = JSON.stringify({ 0: { src: true, dst: true } });
  const assignment = {
    id: 11,
    project_code: 'PRJ-Q',
    frame_id: 'F-H002',
    panel_name: '=H002',
    technician_id: 3,
    status: 'completed',
    completed_at: new Date(),
    cables_total: 1,
    cable_status: cableStatus,
    review_status: null,
  };
  const service = new ProjectsService(prismaForProjects({
    projects: { findFirst: async () => ({ code: 'PRJ-Q', is_active: true }) },
    tech_assignments: {
      findFirst: async () => null,
      findMany: async () => [assignment],
    },
    tech_audit_log: {
      // Simulates real persistence: once submitToDirector's own create() has run,
      // a retry must see that row on the next findFirst — this is what actually
      // drives the idempotent early-return, not a hardcoded null/non-null switch.
      findFirst: async () => auditRows[0] ? { ...auditRows[0].data, id: 1 } : null,
      create: async (args) => {
        auditRows.push(args);
        return args;
      },
    },
    users: { findUnique: async () => ({ full_name: 'Tech One' }) },
  }));
  service.events = { publish: (event) => publishedEvents.push(event) };

  const target = { frameId: 'F-H002' };
  const actor = { id: 1, full_name: 'Supervisor', username: 'sup' };

  const first = await service.submitToDirector('PRJ-Q', actor, target);
  assert.equal(first.submission_status, 'submitted');
  assert.equal(first.idempotent, false);

  const second = await service.submitToDirector('PRJ-Q', actor, target);
  assert.equal(second.submission_status, 'submitted');
  assert.equal(second.idempotent, true, 'a retry must be recognized as idempotent, not treated as a new submission');

  assert.equal(auditRows.length, 1, 'a retried submission must not write a second audit entry');
  assert.equal(publishedEvents.length, 1, 'a retried submission must not publish a second SSE event');
});
