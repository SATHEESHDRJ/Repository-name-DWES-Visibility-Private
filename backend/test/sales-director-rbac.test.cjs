// Verifies the removed sales_director role is not granted on any guarded route.
require('reflect-metadata');
const test = require('node:test');
const assert = require('node:assert/strict');

const { DirectorController } = require('../dist/director/director.controller');
const { TechController } = require('../dist/tech/tech.controller');
const { QAQCController } = require('../dist/qaqc/qaqc.controller');
const { SupervisorController } = require('../dist/supervisor/supervisor.controller');
const { UsersController } = require('../dist/users/users.controller');
const rbac = require('../dist/users/users-rbac');

const ROLES_KEY = 'roles';

function rolesFor(Controller, method) {
  const handler = Controller.prototype[method];
  const onMethod = Reflect.getMetadata(ROLES_KEY, handler);
  if (onMethod) return onMethod;
  return Reflect.getMetadata(ROLES_KEY, Controller) || [];
}

function assertExcludesSales(Controller, method, label) {
  const roles = rolesFor(Controller, method);
  assert.ok(roles.length > 0, `${label}: expected @Roles guard metadata, found none`);
  assert.ok(
    !roles.includes('sales_director'),
    `${label}: sales_director must NOT be allowed (roles: ${roles.join(', ')})`,
  );
}

test('sales_director role is rejected by assertRoleSupported', () => {
  const { ForbiddenException } = require('@nestjs/common');
  assert.throws(
    () => rbac.assertRoleSupported('sales_director'),
    err => err instanceof ForbiddenException,
  );
});

test('director endpoints allow ops_director only (no sales_director)', () => {
  for (const method of ['stats', 'projects', 'projectsSummary', 'workforce', 'activity', 'export']) {
    const roles = rolesFor(DirectorController, method);
    assert.ok(roles.includes('ops_director'), `director/${method} must allow ops_director`);
    assert.ok(!roles.includes('sales_director'), `director/${method} must not allow sales_director`);
  }
});

test('sales_director is excluded from personnel-identity and audit endpoints', () => {
  assertExcludesSales(TechController, 'audit', 'tech/audit');
  assertExcludesSales(QAQCController, 'stats', 'qaqc/stats');
  assertExcludesSales(UsersController, 'findAll', 'users (roster list)');
  assertExcludesSales(UsersController, 'findTechs', 'users/technicians');
  assertExcludesSales(SupervisorController, 'allPanels', 'supervisor/all-panels');
  assertExcludesSales(SupervisorController, 'panelActivity', 'supervisor/panel-activity');
});
