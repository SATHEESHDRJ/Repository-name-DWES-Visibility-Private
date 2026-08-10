const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { loadDemoAccounts } = require('../dist/common/demo-accounts');

function withManifest(accounts, run) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dwes-demo-accounts-'));
  const file = path.join(dir, 'accounts.json');
  fs.writeFileSync(file, JSON.stringify(accounts), { mode: 0o600 });
  const previous = process.env.DWES_DEMO_ACCOUNTS_FILE;
  process.env.DWES_DEMO_ACCOUNTS_FILE = file;
  try {
    return run();
  } finally {
    if (previous === undefined) delete process.env.DWES_DEMO_ACCOUNTS_FILE;
    else process.env.DWES_DEMO_ACCOUNTS_FILE = previous;
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

const valid = {
  username: 'private-local-user',
  password: 'private-local-password',
  role: 'system_admin',
  full_name: 'Private Local User',
  employee_id: 'LOCAL-001',
};

test('loads and validates a private demo account manifest', () => {
  withManifest([valid], () => {
    const accounts = loadDemoAccounts();
    assert.equal(accounts.length, 1);
    assert.equal(accounts[0].role, 'system_admin');
  });
});

test('rejects example placeholders and duplicate usernames', () => {
  withManifest([{ ...valid, password: '<replace-me>' }], () => {
    assert.throws(() => loadDemoAccounts(), /example placeholder/);
  });
  withManifest([valid, valid], () => {
    assert.throws(() => loadDemoAccounts(), /Duplicate demo username/);
  });
});
