#!/usr/bin/env node
/**
 * DWES OCI full go-live orchestrator (Windows-friendly).
 * Reads deploy-secrets.local.env, runs terraform → DNS → bootstrap → gh secrets → migration → k6.
 *
 * Safety: never terraform destroy; never delete DNS/data; additive migration only.
 * Usage: node scripts/go-live.mjs [--from=terraform|dns|bootstrap|github|migrate|post]
 */
import { spawnSync, execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const artifacts = path.join(root, 'docs', 'go-live-artifacts');
const secretsFile = path.join(root, 'deploy-secrets.local.env');
const tfDir = path.join(root, 'infra', 'oci', 'terraform');
const tfVars = path.join(tfDir, 'terraform.tfvars');
const tfOutputs = path.join(artifacts, 'terraform-outputs.json');

const FROM = process.argv.find((a) => a.startsWith('--from='))?.split('=')[1] ?? 'terraform';
const STEPS = ['terraform', 'dns', 'bootstrap', 'github', 'migrate', 'post'];
const startIdx = STEPS.indexOf(FROM);
if (startIdx < 0) {
  console.error(`Unknown --from=${FROM}; use ${STEPS.join('|')}`);
  process.exit(1);
}

function log(msg) {
  const line = `[go-live ${new Date().toISOString()}] ${msg}`;
  console.log(line);
  fs.appendFileSync(path.join(artifacts, 'go-live.log'), line + '\n');
}

function run(cmd, args, opts = {}) {
  log(`$ ${cmd} ${args.join(' ')}`);
  const r = spawnSync(cmd, args, { stdio: 'inherit', shell: true, ...opts });
  if (r.status !== 0) {
    throw new Error(`Command failed (${r.status}): ${cmd} ${args.join(' ')}`);
  }
}

function runCapture(cmd, args, opts = {}) {
  log(`$ ${cmd} ${args.join(' ')}`);
  const r = spawnSync(cmd, args, { encoding: 'utf8', shell: true, ...opts });
  if (r.status !== 0) {
    throw new Error((r.stderr || r.stdout || `exit ${r.status}`).trim());
  }
  return (r.stdout || '').trim();
}

function expandHome(p) {
  if (!p) return p;
  return p.replace(/^%USERPROFILE%/i, os.homedir()).replace(/^~/, os.homedir());
}

function loadSecrets() {
  if (!fs.existsSync(secretsFile)) {
    throw new Error(
      `Missing ${secretsFile} — copy deploy-secrets.local.env.example and fill values`,
    );
  }
  const env = {};
  for (const line of fs.readFileSync(secretsFile, 'utf8').split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const eq = t.indexOf('=');
    if (eq < 0) continue;
    const k = t.slice(0, eq).trim();
    let v = t.slice(eq + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    env[k] = expandHome(v);
  }
  return env;
}

function ociBin() {
  const candidates = [
    process.env.OCI_CLI_BIN,
    'oci',
    path.join(
      process.env.LOCALAPPDATA || '',
      'Programs',
      'Python',
      'Python38',
      'Scripts',
      'oci.exe',
    ),
  ].filter(Boolean);
  for (const c of candidates) {
    try {
      execSync(`"${c}" --version`, { stdio: 'ignore' });
      return c;
    } catch {
      /* try next */
    }
  }
  throw new Error('oci CLI not found — install oci-cli or set OCI_CLI_BIN');
}

function ghBin() {
  const candidates = [process.env.GH_CLI_BIN, 'gh'];
  for (const c of candidates) {
    try {
      execSync(`"${c}" --version`, { stdio: 'ignore' });
      return c;
    } catch {
      /* try next */
    }
  }
  throw new Error('gh CLI not found — install GitHub CLI or set GH_CLI_BIN');
}

function ensureOciConfig(s) {
  const ociDir = path.join(os.homedir(), '.oci');
  const configPath = path.join(ociDir, 'config');
  if (fs.existsSync(configPath)) return configPath;
  if (!s.OCI_TENANCY_OCID || !s.OCI_USER_OCID || !s.OCI_FINGERPRINT) {
    throw new Error('~/.oci/config missing and OCI_TENANCY_OCID/OCI_USER_OCID/OCI_FINGERPRINT not in secrets');
  }
  const keyFile = expandHome(s.OCI_API_KEY_FILE || path.join(ociDir, 'oci_api_key.pem'));
  if (!fs.existsSync(keyFile)) {
    throw new Error(`OCI API key not found: ${keyFile}`);
  }
  fs.mkdirSync(ociDir, { recursive: true });
  const body = [
    '[DEFAULT]',
    `user=${s.OCI_USER_OCID}`,
    `fingerprint=${s.OCI_FINGERPRINT}`,
    `tenancy=${s.OCI_TENANCY_OCID}`,
    `region=${s.OCI_REGION || 'me-dubai-1'}`,
    `key_file=${keyFile.replace(/\\/g, '/')}`,
    '',
  ].join('\n');
  fs.writeFileSync(configPath, body, { mode: 0o600 });
  log(`Wrote ${configPath} from deploy-secrets (not committed)`);
  return configPath;
}

function writeTfVars(s, adIndex = 0) {
  const body = `compartment_id           = "${s.OCI_COMPARTMENT_ID}"
object_storage_namespace = "${s.OCI_OBJECT_STORAGE_NAMESPACE}"
region                   = "${s.OCI_REGION || 'me-dubai-1'}"
ssh_public_key           = "${s.OCI_SSH_PUBLIC_KEY}"
project_name             = "${s.TF_PROJECT_NAME || 'dwes-prod'}"
app_ocpus                = ${s.TF_APP_OCPUS || 2}
app_memory_gb            = ${s.TF_APP_MEMORY_GB || 12}
data_volume_gb           = ${s.TF_DATA_VOLUME_GB || 100}
bastion_client_cidr_allow_list = ${s.OCI_BASTION_CLIENT_CIDR || '["0.0.0.0/0"]'}
alert_email              = "${s.OCI_ALERT_EMAIL || s.CERTBOT_EMAIL || ''}"
availability_domain_index = ${adIndex}
`;
  fs.writeFileSync(tfVars, body, { mode: 0o600 });
  log(`Wrote ${tfVars} (git-ignored via local path — do not commit)`);
}

function terraformDocker(args) {
  const ociHome = path.join(os.homedir(), '.oci').replace(/\\/g, '/');
  const tfMount = tfDir.replace(/\\/g, '/');
  const dockerArgs = [
    'run',
    '--rm',
    '-v',
    `${tfMount}:/tf`,
    '-v',
    `${ociHome}:/root/.oci`,
    '-w',
    '/tf',
    'hashicorp/terraform:1.5',
    ...args,
  ];
  run('docker', dockerArgs);
}

function terraformApplyWithAdRetry(s) {
  for (let ad = 0; ad < 3; ad++) {
    writeTfVars(s, ad);
    try {
      terraformDocker(['init', '-input=false']);
      terraformDocker(['plan', '-input=false', '-var-file=terraform.tfvars', '-out=tfplan']);
      terraformDocker(['apply', '-input=false', 'tfplan']);
      return;
    } catch (e) {
      const msg = String(e.message || e);
      if (/capacity|Out of host capacity|limit/i.test(msg) && ad < 2) {
        log(`AD index ${ad} capacity error — retrying AD ${ad + 1}`);
        continue;
      }
      throw e;
    }
  }
}

function saveTerraformOutputs() {
  const out = runCapture('docker', [
    'run',
    '--rm',
    '-v',
    `${tfDir.replace(/\\/g, '/')}:/tf`,
    '-w',
    '/tf',
    'hashicorp/terraform:1.5',
    'output',
    '-json',
  ]);
  fs.writeFileSync(tfOutputs, out);
  return JSON.parse(out);
}

function cloudflareDns(s, ip) {
  const token = s.CLOUDFLARE_API_TOKEN;
  const zone = s.CLOUDFLARE_ZONE_ID;
  const domain = s.DWES_DOMAIN;
  if (!token || !zone || !domain) throw new Error('CLOUDFLARE_API_TOKEN, CLOUDFLARE_ZONE_ID, DWES_DOMAIN required');

  const name = domain.includes('.') ? domain.split('.')[0] : domain;
  const list = runCapture('curl', [
    '-sS',
    '-H',
    `Authorization: Bearer ${token}`,
    `https://api.cloudflare.com/client/v4/zones/${zone}/dns_records?type=A&name=${domain}`,
  ]);
  const records = JSON.parse(list).result || [];
  const payload = JSON.stringify({ type: 'A', name: domain, content: ip, proxied: false, ttl: 300 });
  if (records.length) {
    run('curl', [
      '-sS',
      '-X',
      'PUT',
      '-H',
      `Authorization: Bearer ${token}`,
      '-H',
      'Content-Type: application/json',
      '--data',
      payload,
      `https://api.cloudflare.com/client/v4/zones/${zone}/dns_records/${records[0].id}`,
    ]);
  } else {
    run('curl', [
      '-sS',
      '-X',
      'POST',
      '-H',
      `Authorization: Bearer ${token}`,
      '-H',
      'Content-Type: application/json',
      '--data',
      payload,
      `https://api.cloudflare.com/client/v4/zones/${zone}/dns_records`,
    ]);
  }
  log(`DNS A ${domain} → ${ip} (proxied=false)`);
}

async function pollDns(domain, ip, maxSec = 600) {
  const start = Date.now();
  while (Date.now() - start < maxSec * 1000) {
    try {
      const resolved = runCapture('nslookup', [domain]);
      if (resolved.includes(ip)) {
        log(`DNS resolved ${domain} → ${ip}`);
        return;
      }
    } catch {
      /* wait */
    }
    await new Promise((r) => setTimeout(r, 15000));
  }
  throw new Error(`DNS did not resolve to ${ip} within ${maxSec}s`);
}

function vaultStoreSecrets(s, outputs) {
  const oci = ociBin();
  const vaultId = outputs.vault_id.value;
  const keyId = outputs.vault_key_id.value;
  const compartmentId = s.OCI_COMPARTMENT_ID;
  const jwt = crypto.randomBytes(48).toString('base64url');
  const pg = crypto.randomBytes(24).toString('base64url');

  for (const [name, content] of [
    ['dwes-jwt-secret', jwt],
    ['dwes-postgres-password', pg],
  ]) {
    run(oci, [
      'vault',
      'secret',
      'create-base64',
      '--compartment-id',
      compartmentId,
      '--vault-id',
      vaultId,
      '--secret-name',
      name,
      '--key-id',
      keyId,
      '--secret-content-content',
      Buffer.from(content).toString('base64'),
      '--secret-content-stage',
      'CURRENT',
    ]);
  }
  return { jwt, pg };
}

function bastionBootstrap(s, outputs) {
  const oci = ociBin();
  const bastionId = outputs.bastion_id.value;
  const instanceId = outputs.app_instance_id.value;
  const vmUser = 'dwes';
  const sshKey = expandHome(s.OCI_VM_SSH_KEY_FILE);
  const pubKey = expandHome(s.OCI_BASTION_SSH_PUBLIC_KEY_FILE);
  const domain = s.DWES_DOMAIN;

  const sessionJson = path.join(artifacts, 'bastion-session.json');
  run(oci, [
    'bastion',
    'session',
    'create-managed-ssh-session',
    '--bastion-id',
    bastionId,
    '--ssh-public-key-file',
    pubKey,
    '--target-resource-id',
    instanceId,
    '--target-resource-port',
    '22',
    '--target-resource-operating-system-user-name',
    vmUser,
    '--session-ttl',
    '3600',
    '--wait-for-state',
    'SUCCEEDED',
    '--max-wait-seconds',
    '300',
    `--output=json`,
  ]);

  // Remote bootstrap script (secrets already in vault or passed inline for first boot)
  const remote = `
set -euo pipefail
cd /opt/dwes || { sudo mkdir -p /opt/dwes && sudo chown dwes:dwes /opt/dwes && git clone . /opt/dwes; }
cp infra/docker/.env.production.example infra/docker/.env
sed -i "s|^DWES_DOMAIN=.*|DWES_DOMAIN=${domain}|" infra/docker/.env
sed -i "s|^CORS_ORIGINS=.*|CORS_ORIGINS=https://${domain}|" infra/docker/.env
sed -i "s|^RP_ID=.*|RP_ID=${domain}|" infra/docker/.env
sed -i "s|^RP_ORIGIN=.*|RP_ORIGIN=https://${domain}|" infra/docker/.env
bash infra/oci/scripts/fetch-secrets.sh || true
chmod 600 infra/docker/.env
bash infra/oci/scripts/init-letsencrypt.sh
docker compose -f infra/docker/docker-compose.yml --env-file infra/docker/.env up -d
curl -fsS https://${domain}/healthz
curl -fsS https://${domain}/api/health
`;
  fs.writeFileSync(path.join(artifacts, 'bootstrap-remote.sh'), remote);
  log('Bootstrap remote script written — run via Bastion SSH (see docs/GO-LIVE-REPORT.md if session SSH fails on Windows)');
}

function setGithubSecrets(s, outputs) {
  const gh = ghBin();
  const privKey = fs.readFileSync(expandHome(s.OCI_VM_SSH_KEY_FILE), 'utf8');
  const pubKey = fs.readFileSync(expandHome(s.OCI_BASTION_SSH_PUBLIC_KEY_FILE), 'utf8');
  const apiKey = fs.readFileSync(expandHome(s.OCI_API_KEY_FILE || path.join(os.homedir(), '.oci', 'oci_api_key.pem')), 'utf8');

  const secrets = {
    OCI_OCIR_HOST: s.OCI_OCIR_HOST,
    OCI_OCIR_NAMESPACE: s.OCI_OCIR_NAMESPACE,
    OCI_OCIR_USERNAME: s.OCI_OCIR_USERNAME,
    OCI_OCIR_AUTH_TOKEN: s.OCI_OCIR_AUTH_TOKEN,
    OCI_BASTION_ID: outputs.bastion_id.value,
    OCI_VM_INSTANCE_ID: outputs.app_instance_id.value,
    OCI_VM_HOST: outputs.app_private_ip?.value || outputs.app_public_ip.value,
    OCI_VM_USER: 'dwes',
    OCI_VM_SSH_KEY: privKey,
    OCI_BASTION_SSH_PUBLIC_KEY: pubKey,
    OCI_TENANCY_OCID: s.OCI_TENANCY_OCID,
    OCI_USER_OCID: s.OCI_USER_OCID,
    OCI_FINGERPRINT: s.OCI_FINGERPRINT,
    OCI_PRIVATE_KEY: apiKey,
    DWES_SMOKE_USER: s.DWES_SMOKE_USER || '',
    DWES_SMOKE_PASS: s.DWES_SMOKE_PASS || '',
  };

  for (const [name, value] of Object.entries(secrets)) {
    if (!value) {
      log(`SKIP gh secret ${name} (empty)`);
      continue;
    }
    run(gh, ['secret', 'set', name, '--body', value], { cwd: root });
  }

  const tag = `v-go-live-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}`;
  run('git', ['tag', '-f', tag], { cwd: root });
  run('git', ['push', 'origin', tag, '--force'], { cwd: root });
  log(`Pushed tag ${tag} — watch Deploy Production OCI workflow`);
}

function migrateData(s) {
  const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const dumpDir = path.join(root, 'backend', 'backups');
  fs.mkdirSync(dumpDir, { recursive: true });
  const dumpPath = path.join(dumpDir, `cutover_${stamp}.dump`);
  const pgHost = s.LOCAL_PG_HOST || 'host.docker.internal';
  const pgPort = s.LOCAL_PG_PORT || '5432';
  const pgUser = s.LOCAL_PG_USER || 'postgres';
  const pgDb = s.LOCAL_PG_DB || 'WiringSchemeDB';
  const pgPass = s.LOCAL_PG_PASSWORD || 'postgres';
  run('docker', [
    'run',
    '--rm',
    '-v',
    `${dumpDir.replace(/\\/g, '/')}:/out`,
    '-e',
    `PGPASSWORD=${pgPass}`,
    'postgres:18-alpine',
    'pg_dump',
    '-h',
    pgHost,
    '-p',
    pgPort,
    '-U',
    pgUser,
    '-Fc',
    '-f',
    `/out/cutover_${stamp}.dump`,
    pgDb,
  ]);
  fs.writeFileSync(
    path.join(artifacts, 'migration-manifest.json'),
    JSON.stringify(
      {
        dump: dumpPath,
        uploads_dir: path.join(root, 'backend', 'uploads'),
        upload_file_count: fs.existsSync(path.join(root, 'backend', 'uploads'))
          ? fs.readdirSync(path.join(root, 'backend', 'uploads'), { recursive: true }).filter((f) => {
              try {
                return fs.statSync(path.join(root, 'backend', 'uploads', f)).isFile();
              } catch {
                return false;
              }
            }).length
          : 0,
        created_at: new Date().toISOString(),
      },
      null,
      2,
    ),
  );
  log(`Dump written ${dumpPath}`);
}

function postDeploy(s, outputs, domain) {
  const base = `https://${domain}`;
  run('node', [path.join(root, 'scripts', 'k6-smoke.mjs'), base], { cwd: root });

  const oci = ociBin();
  if (s.OCI_ALERT_EMAIL && outputs.notification_topic_id?.value) {
    run(oci, [
      'ons',
      'subscription',
      'create',
      '--compartment-id',
      s.OCI_COMPARTMENT_ID,
      '--topic-id',
      outputs.notification_topic_id.value,
      '--protocol',
      'EMAIL',
      '--subscription-endpoint',
      s.OCI_ALERT_EMAIL,
    ]);
  }
  log('Post-deploy: trigger backup on VM — bash infra/oci/scripts/backup-oci.sh');
  log('Post-deploy: certbot renew --dry-run on VM');
}

async function main() {
  fs.mkdirSync(artifacts, { recursive: true });
  log(`Starting from step: ${FROM}`);
  const s = loadSecrets();
  ensureOciConfig(s);

  let outputs = fs.existsSync(tfOutputs) ? JSON.parse(fs.readFileSync(tfOutputs, 'utf8')) : null;

  if (startIdx <= 0) {
    terraformApplyWithAdRetry(s);
    outputs = saveTerraformOutputs();
    fs.writeFileSync(path.join(artifacts, 'app-public-ip.txt'), outputs.app_public_ip.value);
  }

  const domain = s.DWES_DOMAIN;
  const publicIp = outputs?.app_public_ip?.value;

  if (startIdx <= 1 && publicIp) {
    cloudflareDns(s, publicIp);
    await pollDns(domain, publicIp);
  }

  if (startIdx <= 2 && outputs) {
    vaultStoreSecrets(s, outputs);
    bastionBootstrap(s, outputs);
  }

  if (startIdx <= 3 && outputs) {
    setGithubSecrets(s, outputs);
  }

  if (startIdx <= 4) {
    migrateData(s);
  }

  if (startIdx <= 5 && outputs) {
    postDeploy(s, outputs, domain);
  }

  log('Go-live orchestrator finished — see docs/GO-LIVE-REPORT.md');
}

main().catch((err) => {
  log(`FATAL: ${err.message}`);
  console.error(err);
  process.exit(1);
});
