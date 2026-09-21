const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dwes-install-link-'));
const prevCwd = process.cwd();

const ACTOR = { id: 42, role: 'wiring_technician' };
const ACTOR_ADMIN = { id: 1, role: 'system_admin' };

test.before(() => {
  process.chdir(tmpDir);
  process.env.DWES_DOMAIN = 'dwes.ingenious-network.com';
  process.env.RP_ORIGIN = 'https://dwes.ingenious-network.com';
  delete process.env.INSTALL_LINK_IP_ALLOWLIST;
});

test.after(() => {
  process.chdir(prevCwd);
  delete process.env.INSTALL_LINK_IP_ALLOWLIST;
});

const { TeamInstallLinkStoreService } = require('../dist/auth/team-install-link-store.service');
const { TeamInstallLinkService } = require('../dist/auth/team-install-link.service');

function createServices() {
  const store = new TeamInstallLinkStoreService();
  store.onModuleInit();
  const svc = new TeamInstallLinkService(store);
  return { store, svc };
}

function validateOk(svc, token, ip = '203.0.113.10', actor = ACTOR) {
  const result = svc.validateForAuthenticatedUser(token, ip, actor);
  assert.equal(result.ok, true);
  return result;
}

function validateFail(svc, token, ip = '203.0.113.10', actor = ACTOR) {
  const result = svc.validateForAuthenticatedUser(token, ip, actor);
  assert.equal(result.ok, false);
  return result;
}

test('valid token validates for authenticated user, records visit, and builds official domain URL', () => {
  const { store, svc } = createServices();
  const { shareUrl } = svc.regenerate({ actorUserId: 1, expiryDays: 30 });
  assert.match(shareUrl, /^https:\/\/dwes\.ingenious-network\.com\/install\//);

  const token = shareUrl.split('/install/')[1];
  const open = validateOk(svc, token);
  assert.equal(open.organizationName, 'Ingenious Network FZC');

  const status = svc.getAdminStatus();
  assert.equal(status.status, 'active');
  assert.equal(status.visitCount, 1);
  store._dangerResetForTests();
});

test('authenticated failure does not increment visit count', () => {
  const { store, svc } = createServices();
  svc.regenerate({ actorUserId: 1 });
  validateFail(svc, store.generateToken());
  assert.equal(svc.getAdminStatus().visitCount, 0);
  store._dangerResetForTests();
});

test('expired link is rejected for authenticated user', () => {
  const { store, svc } = createServices();
  const token = store.generateToken();
  store.insertLink({
    tokenHash: store.hashToken(token),
    campaignLabel: 'Test',
    organizationName: 'Ingenious Network FZC',
    createdByUserId: 1,
    expiresAt: new Date(Date.now() - 60_000).toISOString(),
  });
  validateFail(svc, token);
  store._dangerResetForTests();
});

test('revoked link is rejected after disable', () => {
  const { store, svc } = createServices();
  const { shareUrl } = svc.regenerate({ actorUserId: 1 });
  const token = shareUrl.split('/install/')[1];
  svc.disable(1);
  validateFail(svc, token);
  store._dangerResetForTests();
});

test('malformed and unknown tokens fail safely for authenticated user', () => {
  const { store, svc } = createServices();
  validateFail(svc, 'short');
  validateFail(svc, 'x'.repeat(80));
  validateFail(svc, store.generateToken());
  store._dangerResetForTests();
});

test('regenerate rotates hash — old token stops working', () => {
  const { store, svc } = createServices();
  const first = svc.regenerate({ actorUserId: 1 });
  const oldToken = first.shareUrl.split('/install/')[1];
  const second = svc.regenerate({ actorUserId: 1 });
  assert.notEqual(first.shareUrl, second.shareUrl);
  validateFail(svc, oldToken);
  validateOk(svc, second.shareUrl.split('/install/')[1]);
  store._dangerResetForTests();
});

test('unsupported role is denied defensively in service', () => {
  const { store, svc } = createServices();
  const { shareUrl } = svc.regenerate({ actorUserId: 1 });
  const token = shareUrl.split('/install/')[1];
  validateFail(svc, token, '127.0.0.1', { id: 9, role: 'unknown_role' });
  assert.equal(svc.getAdminStatus().visitCount, 0);
  store._dangerResetForTests();
});

test('IP allowlist denies when client IP not listed', () => {
  process.env.INSTALL_LINK_IP_ALLOWLIST = '10.0.0.1';
  try {
    const { store, svc } = createServices();
    const { shareUrl } = svc.regenerate({ actorUserId: 1 });
    const token = shareUrl.split('/install/')[1];
    validateFail(svc, token, '203.0.113.10');
    validateOk(svc, token, '10.0.0.1');
    store._dangerResetForTests();
  } finally {
    delete process.env.INSTALL_LINK_IP_ALLOWLIST;
  }
});

test('audit records actor on authenticated validation success', () => {
  const { store, svc } = createServices();
  const { shareUrl } = svc.regenerate({ actorUserId: 1 });
  const token = shareUrl.split('/install/')[1];
  validateOk(svc, token, '127.0.0.1', ACTOR_ADMIN);
  const row = store._getLastAuditForTests();
  assert.ok(row);
  assert.equal(row.action, 'validate_success');
  assert.equal(row.actor_user_id, ACTOR_ADMIN.id);
  assert.match(row.detail, /actor_role:system_admin/);
  store._dangerResetForTests();
});

test('brute-force style attempts do not reveal validity via response shape', () => {
  const { store, svc } = createServices();
  svc.regenerate({ actorUserId: 1 });
  for (let i = 0; i < 50; i += 1) {
    const guess = store.generateToken();
    const result = svc.validateForAuthenticatedUser(guess, '198.51.100.1', ACTOR);
    assert.equal(result.ok, false);
  }
  store._dangerResetForTests();
});

test('install link controller exposes validate only (open removed)', () => {
  const src = fs.readFileSync(
    path.join(prevCwd, 'src/auth/install-link.controller.ts'),
    'utf8',
  );
  assert.doesNotMatch(src, /@Post\('open'\)/);
  assert.match(src, /@Post\('validate'\)/);
});
