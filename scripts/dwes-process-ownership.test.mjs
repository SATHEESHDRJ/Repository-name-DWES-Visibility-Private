import assert from 'node:assert/strict';
import test from 'node:test';
import {
  inspectWindowsPortOwner,
  isDwesProcessCommand,
  parsePortOwnerJson,
} from './dwes-process-ownership.mjs';

const workspace = 'C:\\Users\\sathe\\OneDrive\\Desktop\\DWES';

test('recognizes direct Vite and Nest listeners in the exact DWES workspace', () => {
  assert.equal(isDwesProcessCommand(
    '"C:\\Program Files\\nodejs\\node.exe" "C:\\Users\\sathe\\OneDrive\\Desktop\\DWES\\node_modules\\vite\\bin\\vite.js" --host --port 5175',
    workspace,
  ), true);
  assert.equal(isDwesProcessCommand(
    'node C:/Users/sathe/OneDrive/Desktop/DWES/backend/node_modules/@nestjs/cli/bin/nest.js start --watch',
    workspace,
  ), true);
  assert.equal(isDwesProcessCommand(
    'node C:/Users/sathe/OneDrive/Desktop/DWES/backend/dist/main.js',
    workspace,
  ), true);
});

test('does not claim listeners from sibling workspaces or unrelated DWES node commands', () => {
  assert.equal(isDwesProcessCommand(
    'node C:/Users/sathe/OneDrive/Desktop/DWES-copy/node_modules/vite/bin/vite.js --port 5175',
    workspace,
  ), false);
  assert.equal(isDwesProcessCommand(
    'node C:/Users/sathe/OneDrive/Desktop/OtherApp/node_modules/vite/bin/vite.js --port 5175',
    workspace,
  ), false);
  assert.equal(isDwesProcessCommand(
    'node C:/Users/sathe/OneDrive/Desktop/DWES/scripts/data-migration.mjs --note vite',
    workspace,
  ), false);
  assert.equal(isDwesProcessCommand('', workspace), false);
});

test('parses JSON without corrupting command lines that contain pipe characters', () => {
  const output = JSON.stringify({
    port: 5175,
    pid: 33748,
    processName: 'node',
    pathValue: 'C:\\Program Files\\nodejs\\node.exe',
    commandLine: 'node "C:\\DWES\\node_modules\\vite\\bin\\vite.js" --label "a|b"',
    parentProcessId: 100,
  });
  const owner = parsePortOwnerJson(output, 5175);
  assert.equal(owner?.pid, 33748);
  assert.match(owner?.commandLine || '', /a\|b/);
});

test('Windows inspection uses the CIM command line returned by PowerShell', () => {
  let invocation;
  const owner = inspectWindowsPortOwner(5175, {
    platform: 'win32',
    execFile(command, args, options) {
      invocation = { command, args, options };
      return JSON.stringify({
        port: 5175,
        pid: 41,
        processName: 'node',
        pathValue: 'C:\\Program Files\\nodejs\\node.exe',
        commandLine: `node "${workspace}\\node_modules\\vite\\bin\\vite.js" --port 5175`,
        parentProcessId: 7,
      });
    },
  });

  assert.equal(invocation?.command, 'powershell.exe');
  assert.match(invocation?.args.join(' ') || '', /Get-CimInstance/);
  assert.match(owner?.commandLine || '', /vite\.js/);
  assert.equal(isDwesProcessCommand(owner?.commandLine, workspace), true);
});

test('inspection fails closed when command details cannot be queried', () => {
  assert.equal(inspectWindowsPortOwner(5175, {
    platform: 'win32',
    execFile() { throw new Error('access denied'); },
  }), null);
  assert.equal(inspectWindowsPortOwner(70000, { platform: 'win32' }), null);
});
