// Sales Director route-level RBAC policy — asserts the @Roles metadata the
// RolesGuard enforces, so a future edit that re-grants sales_director access to a
// personnel/audit endpoint fails the build. Complements release-guards.test.cjs
// (which covers the users-rbac helpers and DEMO_MODE-off 404s).
require('reflect-metadata');
const test = require('node:test');
const assert = require('node:assert/strict');

const { DirectorController } = require('../dist/director/director.controller');
const { TechController } = require('../dist/tech/tech.controller');
const { QAQCController } = require('../dist/qaqc/qaqc.controller');
const { SupervisorController } = require('../dist/supervisor/supervisor.controller');
const { UsersController } = require('../dist/users/users.controller');

const ROLES_KEY = 'roles';

// Mirror RolesGuard.getAllAndOverride([handler, class]): method metadata wins,
// else the class-level @Roles applies.
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

function assertIncludesSales(Controller, method, label) {
  const roles = rolesFor(Controller, method);
  assert.ok(
    roles.includes('sales_director'),
    `${label}: sales_director should be allowed on the aggregate view (roles: ${roles.join(', ')})`,
  );
}

// ── Aggregate director views the Sales Director dashboard actually uses ─────────
test('sales_director keeps the aggregate director endpoints', () => {
  assertIncludesSales(DirectorController, 'stats', 'director/stats');
  assertIncludesSales(DirectorController, 'projects', 'director/projects');
  assertIncludesSales(DirectorController, 'projectsSummary', 'director/projects-summary');
});

// ── Personnel identity / audit / remarks — never sales_director ────────────────
test('sales_director is excluded from personnel-identity and audit endpoints', () => {
  assertExcludesSales(DirectorController, 'workforce', 'director/workforce');
  assertExcludesSales(DirectorController, 'activity', 'director/activity');
  assertExcludesSales(DirectorController, 'export', 'director/export');
  assertExcludesSales(TechController, 'audit', 'tech/audit');
  assertExcludesSales(QAQCController, 'stats', 'qaqc/stats');
  assertExcludesSales(UsersController, 'findAll', 'users (roster list)');
  assertExcludesSales(UsersController, 'findTechs', 'users/technicians');
  // Supervisor controller guards every route at the class level.
  assertExcludesSales(SupervisorController, 'allPanels', 'supervisor/all-panels');
  assertExcludesSales(SupervisorController, 'panelActivity', 'supervisor/panel-activity');
});
