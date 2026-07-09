#!/usr/bin/env node
/**
 * Preflight checks before npm run go-live.
 * Exits 0 only when deploy-secrets.local.env + OCI config + SSH keys are present.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const secrets = path.join(root, 'deploy-secrets.local.env');
const ociConfig = path.join(os.homedir(), '.oci', 'config');
const requiredSecretKeys = [
  'DWES_DOMAIN',
  'CLOUDFLARE_API_TOKEN',
  'CLOUDFLARE_ZONE_ID',
  'OCI_COMPARTMENT_ID',
  'OCI_OBJECT_STORAGE_NAMESPACE',
  'OCI_SSH_PUBLIC_KEY',
  'OCI_OCIR_NAMESPACE',
  'OCI_OCIR_AUTH_TOKEN',
];

let ok = true;
function fail(msg) {
  console.error(`[preflight] FAIL: ${msg}`);
  ok = false;
}
function pass(msg) {
  console.log(`[preflight] OK: ${msg}`);
}

if (!fs.existsSync(secrets)) {
  fail(`Missing ${secrets} — copy deploy-secrets.local.env.example`);
} else {
  pass('deploy-secrets.local.env exists');
  const env = fs.readFileSync(secrets, 'utf8');
  for (const k of requiredSecretKeys) {
    const m = env.match(new RegExp(`^${k}=(.*)$`, 'm'));
    const v = m?.[1]?.trim().replace(/^["']|["']$/g, '') ?? '';
    if (!v || /CHANGE_ME|xxxx|your_namespace|example\.com|\.\.\./i.test(v)) {
      fail(`deploy-secrets missing or placeholder ${k}`);
    } else pass(`${k} set`);
  }
}

if (!fs.existsSync(ociConfig)) {
  fail(`Missing ${ociConfig}`);
} else {
  pass('~/.oci/config exists');
  try {
    const oci =
      process.env.OCI_CLI_BIN ||
      'C:\\Users\\sathe\\AppData\\Local\\Programs\\Python\\Python38\\Scripts\\oci.exe';
    execSync(`"${oci}" iam region get --region me-dubai-1`, { stdio: 'ignore' });
    pass('OCI CLI authenticated');
  } catch {
    fail('OCI CLI cannot authenticate — check ~/.oci/config and API key');
  }
}

for (const tool of ['docker', 'terraform', 'curl']) {
  try {
    execSync(`${tool} --version`, { stdio: 'ignore', shell: true });
    pass(`${tool} available`);
  } catch {
    fail(`${tool} not in PATH`);
  }
}

const gh = 'C:\\Program Files\\GitHub CLI\\gh.exe';
try {
  execSync(`"${gh}" auth status`, { stdio: 'ignore' });
  pass('gh authenticated');
} catch {
  fail('gh not authenticated — run: gh auth login');
}

const dumpDir = path.join(root, 'backend', 'backups');
if (fs.existsSync(dumpDir) && fs.readdirSync(dumpDir).some((f) => f.endsWith('.dump'))) {
  pass('cutover dump present in backend/backups/');
} else {
  fail('No cutover .dump in backend/backups/ — run migration prep first');
}

process.exit(ok ? 0 : 1);
