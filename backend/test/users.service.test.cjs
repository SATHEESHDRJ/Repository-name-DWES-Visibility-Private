const test = require('node:test');
const assert = require('node:assert/strict');
const { ForbiddenException, NotFoundException } = require('@nestjs/common');
const { UsersService } = require('../dist/users/users.service');

function userPrisma(overrides = {}) {
  return {
    users: {
      findUnique: async () => null,
      update: async ({ data }) => ({ id: 1, ...data }),
      delete: async () => ({}),
      ...(overrides.users || {}),
    },
    tech_assignments: {
      count: async () => 0,
      ...(overrides.tech_assignments || {}),
    },
    session_log: {
      count: async () => 0,
      ...(overrides.session_log || {}),
    },
    panel_inspections: {
      count: async () => 0,
      ...(overrides.panel_inspections || {}),
    },
    projects: {
      findMany: async () => [],
      ...(overrides.projects || {}),
    },
  };
}

test('UsersService.remove rejects unknown user', async () => {
  const service = new UsersService(userPrisma());
  await assert.rejects(
    () => service.remove(99, { id: 1, role: 'system_admin' }),
    (err) => err instanceof NotFoundException && err.message === 'User 99 not found',
  );
});

test('UsersService.remove blocks non-admin/supervisor deletion', async () => {
  const target = { id: 4, role: 'wiring_technician', is_active: true };
  const service = new UsersService(userPrisma({
    users: { findUnique: async () => target },
  }));

  await assert.rejects(
    () => service.remove(4, { id: 2, role: 'qaqc_engineer' }),
    (err) => err instanceof ForbiddenException && err.message === 'You do not have permission to delete users',
  );
});

test('UsersService.remove deactivates user when linked records exist', async () => {
  const target = {
    id: 5,
    username: 'tech5',
    hashed_password: 'secret',
    role: 'wiring_technician',
    is_active: true,
  };
  const updates = [];
  const deletes = [];
  const service = new UsersService(userPrisma({
    users: {
      findUnique: async () => target,
      update: async (args) => {
        updates.push(args);
        return { ...target, ...args.data };
      },
      delete: async (args) => {
        deletes.push(args);
        return args;
      },
    },
    tech_assignments: { count: async () => 2 },
    session_log: { count: async () => 1 },
    panel_inspections: { count: async () => 3 },
  }));

  const result = await service.remove(5, { id: 1, role: 'system_admin' });

  assert.equal(result.deactivated, true);
  assert.equal(result.counts.assignments, 2);
  assert.equal(result.counts.sessions, 1);
  assert.equal(result.counts.inspections, 3);
  assert.equal(updates.length, 1);
  assert.deepEqual(updates[0], { where: { id: 5 }, data: { is_active: false } });
  assert.equal(deletes.length, 0);
});

test('UsersService.remove hard-deletes user with no dependencies', async () => {
  const target = {
    id: 6,
    username: 'tech6',
    hashed_password: 'secret',
    role: 'wiring_technician',
    is_active: true,
  };
  const deletes = [];
  const service = new UsersService(userPrisma({
    users: {
      findUnique: async () => target,
      delete: async (args) => {
        deletes.push(args);
        return args;
      },
    },
  }));

  const result = await service.remove(6, { id: 1, role: 'system_admin' });
  assert.equal(result.deactivated, false);
  assert.equal(result.message, 'User deleted');
  assert.deepEqual(deletes, [{ where: { id: 6 } }]);
});
