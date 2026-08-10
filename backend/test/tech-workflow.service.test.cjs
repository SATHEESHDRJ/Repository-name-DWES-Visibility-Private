const test = require('node:test');
const assert = require('node:assert/strict');
const { BadRequestException, ConflictException, ForbiddenException } = require('@nestjs/common');
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
      findMany: async () => [],
      create: async ({ data }) => ({ id: 2, ...data }),
      update: async ({ data }) => ({ id: 1, ...data }),
      delete: async () => ({}),
      ...(overrides.tech_assignments || {}),
    },
    users: {
      findUnique: async () => null,
      findMany: async () => [],
      ...(overrides.users || {}),
    },
    projects: {
      findMany: async () => [],
      ...(overrides.projects || {}),
    },
    tech_audit_log: {
      create: async () => ({}),
      createMany: async () => ({ count: 0 }),
      findMany: async () => [],
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

test('TechService.assignFrame rejects a technician who already has an active panel', async () => {
  let lookup = 0;
  const service = new TechService(workflowPrisma({
    users: { findUnique: async () => ({ id: 8, role: 'wiring_technician' }) },
    tech_assignments: {
      findFirst: async () => {
        lookup += 1;
        return lookup === 1 ? null : { id: 55, technician_id: 8, status: 'in_progress' };
      },
    },
  }));
  await assert.rejects(
    () => service.assignFrame({ project_code: 'PRJ', frame_id: 'frame', technician_id: 8, assigned_by_id: 1 }),
    err => err instanceof ConflictException && err.message.includes('already assigned to an active panel'),
  );
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

test('TechService.executeMidChange direct transfer closes the source and creates a waiting-for-resume continuation', async () => {
  const source = {
    id: 21, project_code: 'PRJ_A', frame_id: 'panel-a', panel_name: 'Panel A', technician_id: 7,
    assigned_by: 2, status: 'paused', started_at: new Date(Date.now() - 60_000),
    changeover_locked: false, cables_total: 4, cables_src_done: 3, cables_dst_done: 2,
    cable_status: JSON.stringify({ 0: { src: true, dst: true, note: 'done first' } }),
    total_wiring_seconds: 320, approved_at: null, approved_by: 2,
  };
  const updates = [];
  const creates = [];
  const audits = [];
  const service = new TechService(workflowPrisma({
    tech_assignments: {
      findUnique: async () => source,
      findFirst: async () => null, // receiving technician has no active panel → direct transfer
      update: async ({ where, data }) => { updates.push({ where, data }); return { ...source, ...data }; },
      create: async ({ data }) => { const created = { id: 90, ...data }; creates.push(created); return created; },
    },
    users: {
      findUnique: async ({ where }) => ({ id: where.id, role: 'wiring_technician', is_active: true, full_name: where.id === 7 ? 'Old Tech' : 'New Tech' }),
    },
    tech_audit_log: {
      create: async ({ data }) => { audits.push(data); return { id: 1, ...data }; },
    },
  }));

  const result = await service.executeMidChange(7, source.id, 8, 'Shift handoff');
  assert.equal(result.type, 'transfer');
  assert.equal(result.new_assignment_id, 90);
  // continuation: carried progress, waiting for resume, linked to the closed segment
  assert.equal(creates.length, 1);
  assert.equal(creates[0].technician_id, 8);
  assert.equal(creates[0].status, 'assigned');
  assert.equal(creates[0].cables_src_done, 3);
  assert.equal(creates[0].cables_dst_done, 2);
  assert.equal(creates[0].cable_status, source.cable_status);
  assert.equal(creates[0].handover_from_id, source.id);
  assert.equal(creates[0].total_wiring_seconds, 0);
  // closed segment: paused + locked, banked time NOT double-counted for a paused source
  const close = updates.find(update => update.data.changeover_locked === true);
  assert.equal(close.data.total_wiring_seconds, 320);
  assert.ok(updates.some(update => update.data.handover_to_id === 90));
  assert.equal(audits[0].action, 'mid_change_transfer');
  assert.equal(JSON.parse(audits[0].details).reason, 'Shift handoff');
});

test('TechService.executeMidChange rejects a missing reason before any assignment writes', async () => {
  let writes = 0;
  const service = new TechService(workflowPrisma({
    tech_assignments: {
      update: async () => { writes += 1; return {}; },
      create: async () => { writes += 1; return {}; },
    },
  }));
  await assert.rejects(
    () => service.executeMidChange(7, 21, 8, '   '),
    err => err instanceof BadRequestException && err.message.includes('reason is required'),
  );
  assert.equal(writes, 0);
});

test('TechService.executeMidChange rejects an invalid receiving technician before any writes', async () => {
  const source = {
    id: 21, technician_id: 7, status: 'in_progress', changeover_locked: false,
    project_code: 'PRJ_A', frame_id: 'panel-a', panel_name: 'Panel A',
  };
  let writes = 0;
  const service = new TechService(workflowPrisma({
    tech_assignments: {
      findUnique: async () => source,
      findFirst: async () => null,
      update: async () => { writes += 1; return {}; },
      create: async () => { writes += 1; return {}; },
    },
    users: {
      findUnique: async ({ where }) => (where.id === 7
        ? { id: 7, role: 'wiring_technician', is_active: true, full_name: 'Initiator' }
        : null),
    },
  }));
  await assert.rejects(
    () => service.executeMidChange(7, source.id, 999, 'Transfer to nobody'),
    err => err instanceof BadRequestException && err.message.includes('active wiring technician'),
  );
  assert.equal(writes, 0);
});

test('TechService.executeMidChange rejects interchange with a technician who has not started their panel', async () => {
  const source = {
    id: 21, technician_id: 7, status: 'in_progress', changeover_locked: false,
    project_code: 'PRJ_A', frame_id: 'panel-a', panel_name: 'Panel A',
  };
  let writes = 0;
  const service = new TechService(workflowPrisma({
    tech_assignments: {
      findUnique: async () => source,
      findFirst: async () => ({ id: 33, technician_id: 8, status: 'assigned', changeover_locked: false }),
      update: async () => { writes += 1; return {}; },
      create: async () => { writes += 1; return {}; },
    },
    users: { findUnique: async ({ where }) => ({ id: where.id, role: 'wiring_technician', is_active: true, full_name: 'Tech' }) },
  }));
  await assert.rejects(
    () => service.executeMidChange(7, source.id, 8, 'Swap'),
    err => err instanceof ConflictException && err.message.includes('must start their assigned panel'),
  );
  assert.equal(writes, 0);
});

test('TechService.executeMidChange interchange atomically closes both segments and creates two continuations', async () => {
  const source = {
    id: 41, project_code: 'PRJ_A', frame_id: 'panel-a', panel_name: 'Panel A', technician_id: 7,
    assigned_by: 2, status: 'in_progress', started_at: new Date(Date.now() - 60_000),
    changeover_locked: false, cables_total: 4, cables_src_done: 2, cables_dst_done: 1,
    cable_status: '{}', total_wiring_seconds: 0, approved_at: null, approved_by: 2,
  };
  const target = {
    id: 42, project_code: 'PRJ_B', frame_id: 'panel-b', panel_name: 'Panel B', technician_id: 8,
    assigned_by: 2, status: 'in_progress', started_at: new Date(Date.now() - 120_000),
    changeover_locked: false, cables_total: 6, cables_src_done: 4, cables_dst_done: 3,
    cable_status: '{}', total_wiring_seconds: 0, approved_at: null, approved_by: 2,
  };
  const updates = [];
  const creates = [];
  const auditBatches = [];
  const service = new TechService(workflowPrisma({
    tech_assignments: {
      findUnique: async () => source,
      findFirst: async () => target,
      update: async ({ where, data }) => {
        updates.push({ where, data });
        return { ...(where.id === source.id ? source : target), ...data };
      },
      create: async ({ data }) => {
        const created = { id: 100 + creates.length, ...data };
        creates.push(created);
        return created;
      },
    },
    users: {
      findUnique: async ({ where }) => ({ id: where.id, role: 'wiring_technician', is_active: true, full_name: where.id === 7 ? 'Tech A' : 'Tech B' }),
    },
    tech_audit_log: {
      createMany: async ({ data }) => { auditBatches.push(data); return { count: data.length }; },
    },
  }));

  const result = await service.executeMidChange(7, source.id, 8, 'Workload balancing');
  assert.equal(result.type, 'interchange');
  assert.equal(creates.length, 2);
  // initiator continues the target's panel; the receiving technician continues the source panel
  assert.equal(creates[0].technician_id, 7);
  assert.equal(creates[0].frame_id, 'panel-b');
  assert.equal(creates[0].cables_src_done, 4);
  assert.equal(creates[0].status, 'assigned');
  assert.equal(creates[1].technician_id, 8);
  assert.equal(creates[1].frame_id, 'panel-a');
  assert.equal(creates[1].cables_src_done, 2);
  assert.equal(creates[1].status, 'assigned');
  assert.ok(updates.some(update => update.where.id === 41 && update.data.changeover_locked === true));
  assert.ok(updates.some(update => update.where.id === 42 && update.data.changeover_locked === true));
  assert.equal(auditBatches[0].length, 2);
});

test('TechService.updateCableStatus blocks un-checking a cable completed by the previous technician', async () => {
  const priorSegment = {
    id: 77,
    cable_status: JSON.stringify({ 0: { src: true, dst: true, note: 'done by tech A' } }),
  };
  const continuation = {
    id: 90, technician_id: 8, handover_from_id: 77,
    project_code: 'PRJ', frame_id: 'frame', panel_name: '=H000', status: 'in_progress',
    cables_total: 4, cables_src_done: 1, cables_dst_done: 1,
    cable_status: JSON.stringify({ 0: { src: true, dst: true, note: 'done by tech A' } }),
  };
  let writes = 0;
  const service = new TechService(workflowPrisma({
    tech_assignments: {
      findUnique: async ({ where }) => (where.id === 77 ? priorSegment : continuation),
      update: async () => { writes += 1; return {}; },
    },
  }));
  await assert.rejects(
    () => service.updateCableStatus(90, 8, 0, 'src', false),
    err => err instanceof ForbiddenException && err.message.includes('previous technician'),
  );
  assert.equal(writes, 0);
  // The same cable index CAN still be re-affirmed or annotated (no guard on value=true)
  const ok = await service.updateCableStatus(90, 8, 0, 'src', true);
  assert.equal(ok.assignment_id, 90);
});

/* ── Skip / mapping-issue workflow (audit-only cable actions) ─────────────── */

test('TechService.cableAction skip records audit + note without completing the cable', async () => {
  const updates = [];
  const audits = [];
  const service = new TechService(workflowPrisma({
    tech_assignments: {
      findUnique: async () => ({
        id: 70, technician_id: 8, status: 'in_progress', started_at: new Date(),
        project_code: 'PRJ', frame_id: 'frame', panel_name: '=H000',
        cables_total: 4, cables_src_done: 1, cables_dst_done: 1,
        cable_status: JSON.stringify({ 0: { src: true, dst: true, note: '' } }),
      }),
      update: async ({ data }) => { updates.push(data); return { id: 70, ...data }; },
    },
    users: { findUnique: async () => ({ id: 8, full_name: 'Tech Eight' }) },
    tech_audit_log: { create: async ({ data }) => { audits.push(data); return data; } },
  }));

  const result = await service.cableAction(70, 8, 2, 'skip', 'Material waiting');
  // Cable stays pending: counts unchanged, no src/dst mutation, no status change.
  assert.equal(result.cables_src_done, 1);
  assert.equal(result.cables_dst_done, 1);
  assert.equal(updates.length, 1);
  assert.equal(updates[0].cables_src_done, undefined);
  assert.equal(updates[0].status, undefined); // no auto-start from a skip
  const savedCs = JSON.parse(updates[0].cable_status);
  assert.equal(savedCs['2'].src, false);
  assert.equal(savedCs['2'].dst, false);
  assert.match(savedCs['2'].note, /\[SKIPPED .*\] Material waiting/);
  // Audit: who / when / which cable / why.
  assert.equal(audits.length, 1);
  assert.equal(audits[0].action, 'cable_skip');
  assert.equal(audits[0].technician_id, 8);
  assert.match(audits[0].details, /Cable 3: Material waiting/);
});

test('TechService.cableAction skip requires a reason of at least 3 characters', async () => {
  const service = new TechService(workflowPrisma({
    tech_assignments: {
      findUnique: async () => ({
        id: 71, technician_id: 8, status: 'in_progress',
        project_code: 'PRJ', frame_id: 'frame', panel_name: '=H000',
        cables_total: 4, cable_status: '{}',
      }),
    },
  }));
  await assert.rejects(
    () => service.cableAction(71, 8, 0, 'skip', ''),
    (err) => err instanceof BadRequestException && /at least 3 characters/.test(err.message),
  );
});

test('TechService.cableAction skip rejects another technician\'s assignment', async () => {
  const service = new TechService(workflowPrisma({
    tech_assignments: {
      findUnique: async () => ({
        id: 72, technician_id: 99, status: 'in_progress',
        project_code: 'PRJ', frame_id: 'frame', panel_name: '=H000',
        cables_total: 4, cable_status: '{}',
      }),
    },
  }));
  await assert.rejects(
    () => service.cableAction(72, 8, 0, 'skip', 'not mine'),
    (err) => err instanceof BadRequestException && /Not your assignment/.test(err.message),
  );
});

test('TechService.cableAction skip rejects an out-of-range cable index', async () => {
  const service = new TechService(workflowPrisma({
    tech_assignments: {
      findUnique: async () => ({
        id: 73, technician_id: 8, status: 'in_progress',
        project_code: 'PRJ', frame_id: 'frame', panel_name: '=H000',
        cables_total: 4, cable_status: '{}',
      }),
    },
  }));
  await assert.rejects(
    () => service.cableAction(73, 8, 9, 'skip', 'out of range'),
    (err) => err instanceof BadRequestException && /out of range/.test(err.message),
  );
});

test('TechService.cableAction flag_issue sets the issue flag without completing', async () => {
  const updates = [];
  const audits = [];
  const service = new TechService(workflowPrisma({
    tech_assignments: {
      findUnique: async () => ({
        id: 74, technician_id: 8, status: 'in_progress',
        project_code: 'PRJ', frame_id: 'frame', panel_name: '=H000',
        cables_total: 4, cables_src_done: 0, cables_dst_done: 0,
        cable_status: '{}',
      }),
      update: async ({ data }) => { updates.push(data); return { id: 74, ...data }; },
    },
    users: { findUnique: async () => ({ id: 8, full_name: 'Tech Eight' }) },
    tech_audit_log: { create: async ({ data }) => { audits.push(data); return data; } },
  }));
  await service.cableAction(74, 8, 1, 'flag_issue', 'Terminal label mismatch');
  const savedCs = JSON.parse(updates[0].cable_status);
  assert.equal(savedCs['1'].issue, true);
  assert.equal(savedCs['1'].src, false);
  assert.equal(savedCs['1'].dst, false);
  assert.match(savedCs['1'].note, /\[MAPPING ISSUE .*\] Terminal label mismatch/);
  assert.equal(audits[0].action, 'cable_mapping_issue');
});

test('TechService.updateCableStatus stamps technicianId when marking src true', async () => {
  const updates = [];
  const service = new TechService(workflowPrisma({
    tech_assignments: {
      findUnique: async () => ({
        id: 80, project_code: 'PRJ', frame_id: 'frame', panel_name: '=H000',
        technician_id: 7, status: 'in_progress', started_at: new Date(), handover_from_id: null,
        cables_src_done: 0, cables_dst_done: 0,
        cable_status: JSON.stringify({ 0: { src: false, dst: false, note: '' } }),
      }),
      update: async args => { updates.push(args); return { id: 80, ...args.data }; },
    },
    users: { findUnique: async () => ({ id: 7, full_name: 'Cable Tech' }) },
  }));
  await service.updateCableStatus(80, 7, 0, 'src', true);
  const cs = JSON.parse(updates[0].data.cable_status);
  assert.equal(cs['0'].technicianId, 7);
});

test('TechService.updateCableStatus clears technicianId when both ends reset', async () => {
  const updates = [];
  const service = new TechService(workflowPrisma({
    tech_assignments: {
      findUnique: async () => ({
        id: 81, project_code: 'PRJ', frame_id: 'frame', panel_name: '=H000',
        technician_id: 7, status: 'in_progress', started_at: new Date(), handover_from_id: null,
        cables_src_done: 1, cables_dst_done: 0,
        cable_status: JSON.stringify({ 0: { src: true, dst: false, note: '', technicianId: 7 } }),
      }),
      update: async args => { updates.push(args); return { id: 81, ...args.data }; },
    },
    users: { findUnique: async () => ({ id: 7, full_name: 'Cable Tech' }) },
  }));
  await service.updateCableStatus(81, 7, 0, 'src', false);
  const cs = JSON.parse(updates[0].data.cable_status);
  assert.equal(cs['0'].src, false);
  assert.equal(cs['0'].technicianId, undefined);
});

test('TechService.cableAction complete stamps technicianId on the cable entry', async () => {
  const updates = [];
  const service = new TechService(workflowPrisma({
    tech_assignments: {
      findUnique: async () => ({
        id: 82, project_code: 'PRJ', frame_id: 'frame', panel_name: '=H000',
        technician_id: 9, status: 'in_progress', started_at: new Date(), handover_from_id: null,
        cables_total: 4, cables_src_done: 0, cables_dst_done: 0,
        cable_status: JSON.stringify({ 2: { src: false, dst: false, note: '' } }),
      }),
      update: async args => { updates.push(args); return { id: 82, ...args.data }; },
    },
    users: { findUnique: async () => ({ id: 9, full_name: 'Action Tech' }) },
  }));
  await service.cableAction(82, 9, 2, 'complete', '');
  const cs = JSON.parse(updates[0].data.cable_status);
  assert.equal(cs['2'].src, true);
  assert.equal(cs['2'].dst, true);
  assert.equal(cs['2'].technicianId, 9);
});

test('TechService.cableAction source_end_open records openEnd without completing cable + audit', async () => {
  const updates = [];
  const audits = [];
  const service = new TechService(workflowPrisma({
    tech_assignments: {
      findUnique: async () => ({
        id: 83, project_code: 'PRJ', frame_id: 'frame', panel_name: '=H000',
        technician_id: 9, status: 'in_progress', started_at: new Date(), handover_from_id: null,
        cables_total: 4, cables_src_done: 0, cables_dst_done: 0,
        cable_status: JSON.stringify({ 1: { src: false, dst: false, note: '' } }),
      }),
      update: async args => { updates.push(args); return { id: 83, ...args.data }; },
    },
    users: { findUnique: async () => ({ id: 9, full_name: 'Open Tech' }) },
    tech_audit_log: { create: async args => { audits.push(args.data); return args.data; } },
  }));
  const result = await service.cableAction(83, 9, 1, 'source_end_open', '');
  const cs = JSON.parse(updates[0].data.cable_status);
  assert.equal(cs['1'].src, false);
  assert.equal(cs['1'].dst, false);
  assert.equal(cs['1'].openEnd, 'source');
  assert.match(cs['1'].note, /SOURCE END OPEN/);
  assert.equal(result.cables_src_done, 0);
  assert.equal(result.cables_dst_done, 0);
  assert.ok(audits.some(a => a.action === 'cable_src_open'));
});

test('TechService.cableAction destination_end_open records openEnd without completing cable + audit', async () => {
  const updates = [];
  const audits = [];
  const service = new TechService(workflowPrisma({
    tech_assignments: {
      findUnique: async () => ({
        id: 84, project_code: 'PRJ', frame_id: 'frame', panel_name: '=H000',
        technician_id: 9, status: 'in_progress', started_at: new Date(), handover_from_id: null,
        cables_total: 4, cables_src_done: 0, cables_dst_done: 0,
        cable_status: JSON.stringify({ 0: { src: false, dst: false, note: '' } }),
      }),
      update: async args => { updates.push(args); return { id: 84, ...args.data }; },
    },
    users: { findUnique: async () => ({ id: 9, full_name: 'Open Tech' }) },
    tech_audit_log: { create: async args => { audits.push(args.data); return args.data; } },
  }));
  await service.cableAction(84, 9, 0, 'destination_end_open', '');
  const cs = JSON.parse(updates[0].data.cable_status);
  assert.equal(cs['0'].src, false);
  assert.equal(cs['0'].dst, false);
  assert.equal(cs['0'].openEnd, 'destination');
  assert.match(cs['0'].note, /DESTINATION END OPEN/);
  assert.ok(audits.some(a => a.action === 'cable_dst_open'));
});

test('TechService.cableAction complete preserves prior openEnd marker', async () => {
  const updates = [];
  const service = new TechService(workflowPrisma({
    tech_assignments: {
      findUnique: async () => ({
        id: 85, project_code: 'PRJ', frame_id: 'frame', panel_name: '=H000',
        technician_id: 9, status: 'in_progress', started_at: new Date(), handover_from_id: null,
        cables_total: 4, cables_src_done: 0, cables_dst_done: 0,
        cable_status: JSON.stringify({
          2: {
            src: false,
            dst: false,
            note: '[SOURCE END OPEN 2026-01-01T00:00:00.000Z] Source end intentionally not terminated',
            openEnd: 'source',
            technicianId: 9,
          },
        }),
      }),
      update: async args => { updates.push(args); return { id: 85, ...args.data }; },
    },
    users: { findUnique: async () => ({ id: 9, full_name: 'Open Tech' }) },
    tech_audit_log: { create: async () => ({}) },
  }));
  await service.cableAction(85, 9, 2, 'complete', '');
  const cs = JSON.parse(updates[0].data.cable_status);
  assert.equal(cs['2'].src, true);
  assert.equal(cs['2'].dst, true);
  assert.equal(cs['2'].openEnd, 'source');
  assert.match(cs['2'].note, /SOURCE END OPEN/);
});

test('TechService.cableAction selecting both open ends sets openEnd both', async () => {
  const updates = [];
  let cableStatus = JSON.stringify({ 0: { src: false, dst: false, note: '', openEnd: 'source' } });
  const service = new TechService(workflowPrisma({
    tech_assignments: {
      findUnique: async () => ({
        id: 86, project_code: 'PRJ', frame_id: 'frame', panel_name: '=H000',
        technician_id: 9, status: 'in_progress', started_at: new Date(), handover_from_id: null,
        cables_total: 4, cables_src_done: 0, cables_dst_done: 0,
        cable_status: cableStatus,
      }),
      update: async args => {
        updates.push(args);
        cableStatus = args.data.cable_status;
        return { id: 86, ...args.data };
      },
    },
    users: { findUnique: async () => ({ id: 9, full_name: 'Open Tech' }) },
    tech_audit_log: { create: async () => ({}) },
  }));
  await service.cableAction(86, 9, 0, 'destination_end_open', '');
  const cs = JSON.parse(updates[0].data.cable_status);
  assert.equal(cs['0'].openEnd, 'both');
  assert.equal(cs['0'].src, false);
  assert.equal(cs['0'].dst, false);
  assert.match(cs['0'].note, /DESTINATION END OPEN/);
});

test('TechService.cableAction reset_all preserves baseline technicianId on Mid Change handover', async () => {
  const prior = process.env.DEMO_MODE;
  process.env.DEMO_MODE = 'true';
  try {
    const updates = [];
    const service = new TechService(workflowPrisma({
      tech_assignments: {
        findUnique: async ({ where }) => {
          if (where.id === 90) {
            return {
              id: 90, project_code: 'PRJ', frame_id: 'frame', panel_name: '=H000',
              technician_id: 11, status: 'in_progress', handover_from_id: 89,
              cables_total: 2, cables_src_done: 1, cables_dst_done: 1,
              cable_status: JSON.stringify({
                0: { src: true, dst: true, note: '', technicianId: 5 },
                1: { src: true, dst: false, note: '', technicianId: 11 },
              }),
            };
          }
          if (where.id === 89) {
            return {
              id: 89, cable_status: JSON.stringify({
                0: { src: true, dst: true, note: '', technicianId: 5 },
              }),
            };
          }
          return null;
        },
        update: async args => { updates.push(args); return { id: 90, ...args.data }; },
      },
    }));
    await service.cableAction(90, 11, 0, 'reset_all', '');
    const cs = JSON.parse(updates[0].data.cable_status);
    assert.equal(cs['0'].technicianId, 5);
    assert.equal(cs['1'].technicianId, undefined);
    assert.equal(cs['1'].src, false);
    assert.equal(cs['1'].dst, false);
  } finally {
    if (prior === undefined) delete process.env.DEMO_MODE;
    else process.env.DEMO_MODE = prior;
  }
});
