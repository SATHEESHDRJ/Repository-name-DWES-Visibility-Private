const test = require('node:test');
const assert = require('node:assert/strict');
const { BadRequestException, ConflictException, NotFoundException } = require('@nestjs/common');
const { PanelWorkflowService } = require('../dist/panel-workflow/panel-workflow.service');

function makeHarness(opts = {}) {
  const workflows = new Map();
  const stages = new Map();
  const assignees = new Map();
  const history = [];
  const users = new Map(Object.entries(opts.users || {}).map(([id, u]) => [Number(id), u]));
  const techAssignments = [...(opts.techAssignments || [])];
  let assigneeSeq = 1;
  let histSeq = 1;
  let assignCalls = 0;

  if (opts.workflow) {
    workflows.set(opts.workflow.id, opts.workflow);
  }
  for (const s of opts.stages || []) stages.set(s.id, s);
  for (const a of opts.assignees || []) assignees.set(a.id, a);

  const prisma = {
    panel_workflow_stages: {
      findUnique: async ({ where, include }) => {
        const row = stages.get(where.id);
        if (!row) return null;
        if (include?.workflow) return { ...row, workflow: workflows.get(row.workflow_id) };
        return row;
      },
    },
    users: {
      findUnique: async ({ where }) => users.get(where.id) || null,
    },
    tech_assignments: {
      findFirst: async ({ where }) => {
        return techAssignments.find((row) => {
          if (where.project_code && row.project_code !== where.project_code) return false;
          if (where.frame_id && row.frame_id !== where.frame_id) return false;
          if (where.technician_id && row.technician_id !== where.technician_id) return false;
          if (where.status?.in && !where.status.in.includes(row.status)) return false;
          if (where.changeover_locked?.not === true && row.changeover_locked === true) return false;
          return true;
        }) || null;
      },
    },
    panel_workflow_stage_assignees: {
      findUnique: async ({ where }) => {
        if (where.stage_id_user_id) {
          for (const a of assignees.values()) {
            if (a.stage_id === where.stage_id_user_id.stage_id
              && a.user_id === where.stage_id_user_id.user_id) return a;
          }
        }
        return null;
      },
      create: async ({ data }) => {
        for (const a of assignees.values()) {
          if (a.stage_id === data.stage_id && a.user_id === data.user_id) {
            const err = new Error('dup');
            err.code = 'P2002';
            throw err;
          }
        }
        const row = { id: assigneeSeq++, ...data, assigned_at: new Date() };
        assignees.set(row.id, row);
        return row;
      },
    },
    panel_workflow_history: {
      create: async ({ data }) => {
        const row = { id: histSeq++, ...data, created_at: new Date() };
        history.push(row);
        return row;
      },
    },
  };

  const techService = {
    assignFrame: async (dto) => {
      assignCalls += 1;
      if (opts.assignFrameError) throw opts.assignFrameError;
      const assignment = {
        id: 900 + assignCalls,
        project_code: dto.project_code,
        frame_id: dto.frame_id,
        technician_id: dto.technician_id,
        status: 'assigned',
        changeover_locked: false,
        cables_total: 10,
      };
      techAssignments.push(assignment);
      return { assignment };
    },
    deleteAssignment: async (id) => {
      const idx = techAssignments.findIndex((a) => a.id === id);
      if (idx >= 0) techAssignments.splice(idx, 1);
      return { message: 'Assignment deleted' };
    },
  };

  const service = new PanelWorkflowService(prisma, opts.withTech === false ? undefined : techService);
  return { service, prisma, techAssignments, assignees, history, getAssignCalls: () => assignCalls };
}

const supervisor = { id: 3, role: 'prod_supervisor' };

test('WIRING Case A creates panel assignment then stage assignee', async () => {
  const harness = makeHarness({
    users: {
      42: { id: 42, username: 'tech3', full_name: 'Yidnekachew Mamo', role: 'wiring_technician', is_active: true },
    },
    workflow: { id: 1, project_code: '001', frame_id: 'frame_e01' },
    stages: [{ id: 43, workflow_id: 1, stage_key: 'WIRING', name: 'Wiring' }],
  });
  const result = await harness.service.assignStageUser(43, { user_id: 42 }, supervisor);
  assert.equal(result.panel_created, true);
  assert.equal(result.panel_assignment.technician_id, 42);
  assert.equal(result.stage_assignee.user_id, 42);
  assert.equal(harness.getAssignCalls(), 1);
  assert.match(result.message, /Panel wiring assignment created/i);
});

test('WIRING Case A with existing stage assignee still creates missing panel assignment', async () => {
  const harness = makeHarness({
    users: {
      42: { id: 42, username: 'tech3', full_name: 'Yidnekachew Mamo', role: 'wiring_technician', is_active: true },
    },
    workflow: { id: 1, project_code: '001', frame_id: 'frame_e01' },
    stages: [{ id: 43, workflow_id: 1, stage_key: 'WIRING', name: 'Wiring' }],
    assignees: [{ id: 1, stage_id: 43, user_id: 42, role_hint: 'stage' }],
  });
  const result = await harness.service.assignStageUser(43, { user_id: 42 }, supervisor);
  assert.equal(result.panel_created, true);
  assert.equal(result.stage_assignee.id, 1);
  assert.equal(harness.getAssignCalls(), 1);
  assert.equal(harness.assignees.size, 1);
});

test('WIRING Case B links stage without creating duplicate panel assignment', async () => {
  const harness = makeHarness({
    users: {
      42: { id: 42, username: 'tech3', full_name: 'Yidnekachew Mamo', role: 'wiring_technician', is_active: true },
    },
    workflow: { id: 1, project_code: '001', frame_id: 'frame_e01' },
    stages: [{ id: 43, workflow_id: 1, stage_key: 'WIRING', name: 'Wiring' }],
    techAssignments: [{
      id: 10, project_code: '001', frame_id: 'frame_e01', technician_id: 42,
      status: 'assigned', changeover_locked: false,
    }],
  });
  const result = await harness.service.assignStageUser(43, { user_id: 42 }, supervisor);
  assert.equal(result.panel_created, false);
  assert.equal(harness.getAssignCalls(), 0);
  assert.match(result.message, /already assigned to this panel/i);
  assert.equal(result.stage_assignee.user_id, 42);
});

test('WIRING Case C blocks when another technician owns the panel', async () => {
  const harness = makeHarness({
    users: {
      42: { id: 42, username: 'tech3', full_name: 'Yidnekachew Mamo', role: 'wiring_technician', is_active: true },
      41: { id: 41, username: 'tech2', full_name: 'Other Tech', role: 'wiring_technician', is_active: true },
    },
    workflow: { id: 1, project_code: '001', frame_id: 'frame_e01' },
    stages: [{ id: 43, workflow_id: 1, stage_key: 'WIRING', name: 'Wiring' }],
    techAssignments: [{
      id: 10, project_code: '001', frame_id: 'frame_e01', technician_id: 41,
      status: 'in_progress', changeover_locked: false,
    }],
  });
  await assert.rejects(
    () => harness.service.assignStageUser(43, { user_id: 42 }, supervisor),
    (err) => err instanceof ConflictException
      && /Other Tech/.test(err.message)
      && /Mid Change/.test(err.message),
  );
  assert.equal(harness.getAssignCalls(), 0);
  assert.equal(harness.assignees.size, 0);
});

test('Case D non-WIRING creates stage assignee only', async () => {
  const harness = makeHarness({
    users: {
      42: { id: 42, username: 'tech3', full_name: 'Yidnekachew Mamo', role: 'wiring_technician', is_active: true },
    },
    workflow: { id: 1, project_code: '001', frame_id: 'frame_e01' },
    stages: [{ id: 50, workflow_id: 1, stage_key: 'QAQC_PENDING_PUNCH', name: 'QA/QC' }],
  });
  const result = await harness.service.assignStageUser(50, { user_id: 42 }, supervisor);
  assert.equal(result.panel_created, false);
  assert.equal(result.panel_assignment, null);
  assert.equal(result.stage_assignee.user_id, 42);
  assert.equal(harness.getAssignCalls(), 0);
});

test('WIRING rejects non wiring_technician role', async () => {
  const harness = makeHarness({
    users: {
      99: { id: 99, username: 'qa1', full_name: 'QA', role: 'qaqc_engineer', is_active: true },
    },
    workflow: { id: 1, project_code: '001', frame_id: 'frame_e01' },
    stages: [{ id: 43, workflow_id: 1, stage_key: 'WIRING', name: 'Wiring' }],
  });
  await assert.rejects(
    () => harness.service.assignStageUser(43, { user_id: 99 }, supervisor),
    (err) => err instanceof BadRequestException && /wiring technicians/i.test(err.message),
  );
});

test('WIRING propagates missing schedule error from assignFrame without stage row', async () => {
  const harness = makeHarness({
    users: {
      42: { id: 42, username: 'tech3', full_name: 'Yidnekachew Mamo', role: 'wiring_technician', is_active: true },
    },
    workflow: { id: 1, project_code: '001', frame_id: 'frame_e01' },
    stages: [{ id: 43, workflow_id: 1, stage_key: 'WIRING', name: 'Wiring' }],
    assignFrameError: new BadRequestException('Upload the panel wiring schedule before assigning a technician.'),
  });
  await assert.rejects(
    () => harness.service.assignStageUser(43, { user_id: 42 }, supervisor),
    (err) => err instanceof BadRequestException && /wiring schedule/i.test(err.message),
  );
  assert.equal(harness.assignees.size, 0);
});

test('assignStageUser 404 for unknown stage', async () => {
  const harness = makeHarness({ users: { 42: { id: 42, role: 'wiring_technician', is_active: true } } });
  await assert.rejects(
    () => harness.service.assignStageUser(999, { user_id: 42 }, supervisor),
    (err) => err instanceof NotFoundException,
  );
});
