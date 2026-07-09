const test = require('node:test');
const assert = require('node:assert/strict');
const { BadRequestException, ConflictException, NotFoundException } = require('@nestjs/common');
const { ProjectsService } = require('../dist/projects/projects.service');
const { MockStore } = require('../dist/data/mock-store');
const { FrameStore } = require('../dist/frames/frame-store');

function prismaForProjects(overrides = {}) {
  return {
    projects: {
      findUnique: async () => null,
      create: async ({ data }) => ({ id: 1, ...data }),
      update: async ({ data }) => ({ ...data }),
      ...(overrides.projects || {}),
    },
    tech_assignments: {
      findMany: async () => [],
      ...(overrides.tech_assignments || {}),
    },
  };
}

test('ProjectsService.create rejects empty panel list', async () => {
  const service = new ProjectsService(prismaForProjects());
  await assert.rejects(
    () => service.create({ code: 'P1', client: 'Client', name: 'Project', panels: [] }),
    (err) => err instanceof BadRequestException && err.message === 'At least one panel is required',
  );
});

test('ProjectsService.create rejects duplicate project code', async () => {
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
    (err) => err instanceof ConflictException && err.message === 'Project code already exists',
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
    code: 'PRJ-CREATE',
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

test('ProjectsService.submitToDirector rejects unknown project', async () => {
  const service = new ProjectsService(prismaForProjects());
  await assert.rejects(
    () => service.submitToDirector('MISSING'),
    (err) => err instanceof NotFoundException && err.message === 'Project MISSING not found',
  );
});

test('ProjectsService.submitToDirector rejects when no completed panels exist', async () => {
  const service = new ProjectsService(prismaForProjects({
    projects: { findUnique: async () => ({ code: 'PRJ-1', is_active: true }) },
    tech_assignments: { findMany: async () => [] },
  }));

  await assert.rejects(
    () => service.submitToDirector('PRJ-1'),
    (err) => err instanceof BadRequestException && err.message === 'No completed panels to submit',
  );
});

test('ProjectsService.submitToDirector rejects when QC is pending', async () => {
  const service = new ProjectsService(prismaForProjects({
    projects: { findUnique: async () => ({ code: 'PRJ-2', is_active: true }) },
    tech_assignments: {
      findMany: async () => [{ review_status: 'ready_for_qc' }],
    },
  }));

  await assert.rejects(
    () => service.submitToDirector('PRJ-2'),
    (err) => err instanceof BadRequestException && err.message === '1 panel(s) still pending QC check',
  );
});

test('ProjectsService.submitToDirector rejects when completed panels are not approved', async () => {
  const service = new ProjectsService(prismaForProjects({
    projects: { findUnique: async () => ({ code: 'PRJ-3', is_active: true }) },
    tech_assignments: {
      findMany: async () => [
        { review_status: 'approved' },
        { review_status: 'rework' },
      ],
    },
  }));

  await assert.rejects(
    () => service.submitToDirector('PRJ-3'),
    (err) => err instanceof BadRequestException && err.message === '1 panel(s) not yet approved',
  );
});

test('ProjectsService.submitToDirector updates state when all completed panels are approved', async () => {
  const updates = [];
  const service = new ProjectsService(prismaForProjects({
    projects: {
      findUnique: async () => ({ code: 'PRJ-4', is_active: true }),
      update: async (args) => {
        updates.push(args);
        return args;
      },
    },
    tech_assignments: {
      findMany: async () => [
        { review_status: 'approved' },
        { review_status: 'approved' },
      ],
    },
  }));

  const result = await service.submitToDirector('PRJ-4');
  assert.equal(result.message, 'Project submitted to director with 2 approved panels');
  assert.equal(updates.length, 1);
  assert.deepEqual(updates[0], {
    where: { code: 'PRJ-4' },
    data: { project_state: 'submitted_to_director' },
  });
});
