const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dwes-bootstrap-'));
const prevCwd = process.cwd();

test.before(() => {
  process.chdir(tmpDir);
  process.env.NODE_ENV = 'production';
  process.env.DEMO_MODE = 'false';
});

test.after(() => {
  process.chdir(prevCwd);
});

const { ProductionBootstrapService } = require('../dist/auth/production-bootstrap.service');

function createService() {
  const svc = new ProductionBootstrapService();
  svc.onModuleInit();
  return svc;
}

test('statusForUser inactive in demo mode', () => {
  process.env.DEMO_MODE = 'true';
  const svc = createService();
  const status = svc.statusForUser(1, 'system_admin', false);
  assert.equal(status.required, false);
  process.env.DEMO_MODE = 'false';
});

test('statusForUser requires password only for admin in production (webauthn deferred)', () => {
  const svc = createService();
  const status = svc.statusForUser(42, 'system_admin', false);
  assert.equal(status.required, true);
  assert.equal(status.needs_password_rotation, true);
  assert.equal(status.needs_webauthn_enrollment, false);
});

test('recordPasswordRotation clears bootstrap when webauthn deferred', () => {
  const svc = createService();
  const userId = 7;
  svc.recordPasswordRotation(userId);
  // ops_director is password-only (not in BOOTSTRAP_ROLES) until fingerprint is re-enabled
  const status = svc.statusForUser(userId, 'ops_director', false);
  assert.equal(status.needs_password_rotation, false);
  assert.equal(status.needs_webauthn_enrollment, false);
  assert.equal(status.required, false);
});

test('recordWebAuthnEnrollment remains compatible', () => {
  const svc = createService();
  const userId = 8;
  svc.recordPasswordRotation(userId);
  svc.recordWebAuthnEnrollment(userId);
  const status = svc.statusForUser(userId, 'system_admin', false);
  assert.equal(status.required, false);
});

test('technician role never requires bootstrap', () => {
  const svc = createService();
  const status = svc.statusForUser(1, 'wiring_technician', false);
  assert.equal(status.required, false);
});

test('ops_director never requires bootstrap while fingerprint is deferred', () => {
  const svc = createService();
  const status = svc.statusForUser(55, 'ops_director', false);
  assert.equal(status.required, false);
  assert.equal(status.needs_password_rotation, false);
  assert.equal(status.needs_webauthn_enrollment, false);
});

test('deferWebAuthnEnrollment clears webauthn requirement without credentials', () => {
  const svc = createService();
  const userId = 99;
  svc.recordPasswordRotation(userId);
  svc.deferWebAuthnEnrollment(userId);
  const status = svc.statusForUser(userId, 'system_admin', false);
  assert.equal(status.needs_webauthn_enrollment, false);
  assert.equal(status.required, false);
});
