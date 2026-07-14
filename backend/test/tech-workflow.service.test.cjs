const test = require('node:test');
const assert = require('node:assert/strict');
const { BadRequestException, ConflictException } = require('@nestjs/common');
const { TechService } = require('../dist/tech/tech.service');
const { MockStore } = require('../dist/data/mock-store');

const guardedFrame = { id: 'frame', project_code: 'PRJ', panel_name: '=H000', cable_count: 4, cables: [{}, {}, {}, {}] };
MockStore.frames.push(guardedFrame);
test.after(() => {
  MockStore.frames = MockStore.frames.filter(item => item !== guardedFrame);
});

function workflowPrisma(overrides = {}) {
  const prisma = {
    tech_assignments: {
      findUnique: async () => null,
      findFirst: async () => null,
      create: async ({ data }) => ({ id: 2, ...data }),
      update: async ({ data }) => ({ id: 1, ...data }),
      delete: async () => ({}),
      ...(overrides.tech_assignments || {}),
    },
    users: {
      findUnique: async () => null,
      ...(overrides.users || {}),
    },
    tech_audit_log: {
      create: async () => ({}),
      ...(overrides.tech_audit_log || {}),
    },
  };
  prisma.$transaction = async callback => callback(prisma);
  return prisma;
}

test('TechService.assignFrame rejects a panel that already has an active assignment', async () => {
  const frame = { id: 'frame_guard', project_code: 'PRJ_GUARD', panel_name: '=H001', cable_count: 1, cables: [{}] };
  MockStore.frames.push(frame);
  try {
    const service = new TechService(workflowPrisma({
      users: { findUnique: async () => ({ id: 8, role: 'wiring_technician' }) },
      tech_assignments: {
        findFirst: async ({ where }) => {
          assert.equal(where.project_code, 'PRJ_GUARD');
          assert.equal(where.frame_id, 'frame_guard');
          assert.equal(where.technician_id, undefined);
          return { id: 41, technician_id: 7, status: 'assigned' };
        },
      },
    }));
    await assert.rejects(
      () => service.assignFrame({ project_code: 'PRJ_GUARD', frame_id: 'frame_guard', technician_id: 8, assigned_by_id: 1 }),
      (err) => err instanceof ConflictException && err.message.includes('already has an active technician'),
    );
  } finally {
    MockStore.frames = MockStore.frames.filter(item => item !== frame);
  }
});

test('TechService.deleteAssignment only removes an original assigned-before-start row', async () => {
  const deleted = [];
  const service = new TechService(workflowPrisma({
    tech_assignments: {
      findUnique: async () => ({
        id: 9, project_code: 'PRJ', frame_id: 'frame', status: 'assigned',
        started_at: null, handover_from_id: null, changeover_locked: false,
        cables_src_done: 0, cables_dst_done: 0, cable_status: '{}',
      }),
      delete: async args => { deleted.push(args); return {}; },
    },
  }));
  const result = await service.deleteAssignment(9);
  assert.equal(result.message, 'Assignment deleted');
  assert.deepEqual(deleted, [{ where: { id: 9 } }]);
});

for (const row of [
  { status: 'in_progress', started_at: new Date(), handover_from_id: null, changeover_locked: false },
  { status: 'paused', started_at: new Date(), handover_from_id: null, changeover_locked: false },
  { status: 'assigned', started_at: null, handover_from_id: 4, changeover_locked: false },
]) {
  test(`TechService.deleteAssignment rejects protected ${row.status} workflow state`, async () => {
    const service = new TechService(workflowPrisma({
      tech_assignments: {
        findUnique: async () => ({ id: 9, project_code: 'PRJ', frame_id: 'frame', ...row }),
      },
    }));
    await assert.rejects(
      () => service.deleteAssignment(9),
      (err) => err instanceof BadRequestException && err.message.includes('mid-changeover'),
    );
  });
}

test('TechService.deleteAssignment rejects an assigned row after the first cable update', async () => {
  const service = new TechService(workflowPrisma({
    tech_assignments: {
      findUnique: async () => ({
        id: 9, project_code: 'PRJ', frame_id: 'frame', status: 'assigned',
        started_at: null, handover_from_id: null, changeover_locked: false,
        cables_src_done: 1, cables_dst_done: 0,
        cable_status: JSON.stringify({ 0: { src: true, dst: false } }),
      }),
    },
  }));
  await assert.rejects(
    () => service.deleteAssignment(9),
    (err) => err instanceof BadRequestException && err.message.includes('mid-changeover'),
  );
});

test('TechService.updateCableStatus auto-starts an assigned panel on its first cable update', async () => {
  const updates = [];
  const service = new TechService(workflowPrisma({
    tech_assignments: {
      findUnique: async () => ({
        id: 12, project_code: 'PRJ', frame_id: 'frame', panel_name: '=H001',
        technician_id: 7, status: 'assigned', started_at: null,
        cables_src_done: 0, cables_dst_done: 0,
        cable_status: JSON.stringify({ 0: { src: false, dst: false, note: '' } }),
      }),
      update: async args => { updates.push(args); return { id: 12, ...args.data }; },
    },
    users: { findUnique: async () => ({ id: 7, full_name: 'Cable Tech' }) },
  }));

  await service.updateCableStatus(12, 7, 0, 'src', true);
  assert.equal(updates[0].data.status, 'in_progress');
  assert.ok(updates[0].data.started_at instanceof Date);
  assert.equal(updates[0].data.cables_src_done, 1);
});

test('TechService.changeover validates the replacement before pausing current work', async () => {
  let writes = 0;
  const service = new TechService(workflowPrisma({
    tech_assignments: {
      findUnique: async () => ({
        id: 1, project_code: 'PRJ', frame_id: 'frame', technician_id: 7,
        status: 'in_progress', changeover_locked: false,
      }),
      update: async () => { writes += 1; return {}; },
    },
    users: { findUnique: async () => null },
  }));
  await assert.rejects(
    () => service.changeover(1, 8, 2, 'Shift change'),
    (err) => err instanceof BadRequestException && err.message === 'Invalid new technician',
  );
  assert.equal(writes, 0);
});

test('TechService.changeover carries wiring progress and links immutable history', async () => {
  const old = {
    id: 1, project_code: 'PRJ', frame_id: 'frame', panel_name: '=H001', technician_id: 7,
    status: 'in_progress', changeover_locked: false, handover_from_id: null,
    cables_total: 4, cables_src_done: 3, cables_dst_done: 2,
    cable_status: JSON.stringify({ 0: { src: true, dst: true }, 1: { src: true, dst: false } }),
    total_wiring_seconds: 320, started_at: new Date('2026-07-12T06:00:00.000Z'),
  };
  const updates = [];
  const creates = [];
  const service = new TechService(workflowPrisma({
    tech_assignments: {
      findUnique: async () => old,
      findFirst: async () => null,
      update: async args => {
        updates.push(args);
        return { ...old, ...args.data };
      },
      create: async args => {
        creates.push(args);
        return { id: 2, ...args.data };
      },
    },
    users: {
      findUnique: async ({ where }) => where.id === 8
        ? { id: 8, role: 'wiring_technician', full_name: 'New Tech' }
        : { id: 7, role: 'wiring_technician', full_name: 'Old Tech' },
    },
  }));

  const result = await service.changeover(1, 8, 2, 'Shift change');
  const transferred = creates[0].data;
  assert.equal(transferred.cable_status, old.cable_status);
  assert.equal(transferred.cables_src_done, 3);
  assert.equal(transferred.cables_dst_done, 2);
  assert.equal(transferred.total_wiring_seconds, 320);
  assert.equal(transferred.started_at, old.started_at);
  assert.equal(transferred.handover_from_id, 1);
  assert.equal(updates[1].data.handover_to_id, 2);
  assert.equal(updates[1].data.changeover_locked, true);
  assert.equal(result.new_assignment_id, 2);
});
