import { execFileSync } from 'node:child_process';
import path from 'node:path';

function normalizeCommandText(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/\\/g, '/')
    .replace(/\/{2,}/g, '/');
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * A listener is DWES-owned only when its command line contains this exact
 * workspace path and a known frontend/backend entry point. Requiring both
 * prevents a different Vite/Nest project (or an unrelated node process) from
 * being stopped merely because it happens to use a DWES port.
 */
export function isDwesProcessCommand(commandLine, workspaceRoot) {
  if (!commandLine || !workspaceRoot) return false;

  const normalizedCommand = normalizeCommandText(commandLine);
  const normalizedRoot = normalizeCommandText(path.resolve(workspaceRoot)).replace(/\/$/, '');
  if (!normalizedRoot) return false;

  // Match the workspace as a path token, not as a prefix of e.g. "DWES-copy".
  const workspaceToken = new RegExp(
    `(^|[\\s"'=/(])${escapeRegExp(normalizedRoot)}(?=$|[\\s"'/])`,
  );
  if (!workspaceToken.test(normalizedCommand)) return false;

  const knownServerEntrypoints = [
    /(?:^|\/)node_modules\/vite\/bin\/vite\.js(?=$|[\s"'])/,
    /(?:^|\/)node_modules\/@nestjs\/cli\/bin\/nest\.js(?=$|[\s"'])/,
    /(?:^|\/)backend\/dist(?:\/src)?\/main(?:\.js)?(?=$|[\s"'])/,
  ];

  return knownServerEntrypoints.some((pattern) => pattern.test(normalizedCommand));
}

export function parsePortOwnerJson(output, fallbackPort) {
  const text = String(output || '').trim();
  if (!text) return null;

  try {
    const raw = JSON.parse(text);
    const pid = Number(raw.pid);
    const port = Number(raw.port || fallbackPort);
    if (!Number.isInteger(pid) || pid <= 0 || !Number.isInteger(port)) return null;
    return {
      port,
      pid,
      processName: String(raw.processName || ''),
      pathValue: String(raw.pathValue || ''),
      commandLine: String(raw.commandLine || ''),
      parentProcessId: Number(raw.parentProcessId) || null,
    };
  } catch {
    return null;
  }
}

/**
 * Command line of one PID (Windows), or '' when unavailable. Used by the dev
 * runner and the e2e temp-backend harness to verify a PID still belongs to
 * THIS checkout before any kill — never terminate by PID number alone.
 */
export function getWindowsProcessCommandLine(
  pid,
  { platform = process.platform, execFile = execFileSync } = {},
) {
  const numericPid = Number(pid);
  if (platform !== 'win32' || !Number.isInteger(numericPid) || numericPid <= 0) return '';
  try {
    const output = execFile('powershell.exe', [
      '-NoProfile',
      '-NonInteractive',
      '-Command',
      `(Get-CimInstance -ClassName Win32_Process -Filter "ProcessId = ${numericPid}" -ErrorAction SilentlyContinue).CommandLine`,
    ], { encoding: 'utf8', windowsHide: true });
    return String(output || '').trim();
  } catch {
    return '';
  }
}

/**
 * Get-Process does not provide CommandLine on Windows PowerShell. Querying
 * Win32_Process through CIM returns the actual node invocation, including the
 * Vite/Nest script path used to prove workspace ownership.
 */
export function inspectWindowsPortOwner(
  port,
  { platform = process.platform, execFile = execFileSync } = {},
) {
  const numericPort = Number(port);
  if (platform !== 'win32' || !Number.isInteger(numericPort) || numericPort < 1 || numericPort > 65535) {
    return null;
  }

  const command = [
    `$connection = Get-NetTCPConnection -LocalPort ${numericPort} -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1`,
    'if ($null -eq $connection) { exit 0 }',
    '$ownerPid = [int]$connection.OwningProcess',
    '$cim = Get-CimInstance -ClassName Win32_Process -Filter "ProcessId = $ownerPid" -ErrorAction SilentlyContinue',
    '$fallback = Get-Process -Id $ownerPid -ErrorAction SilentlyContinue',
    'if ($null -eq $cim -and $null -eq $fallback) { exit 0 }',
    '$processName = if ($null -ne $cim -and $cim.Name) { [IO.Path]::GetFileNameWithoutExtension([string]$cim.Name) } elseif ($null -ne $fallback) { [string]$fallback.ProcessName } else { "" }',
    '$pathValue = if ($null -ne $cim -and $cim.ExecutablePath) { [string]$cim.ExecutablePath } elseif ($null -ne $fallback -and $fallback.Path) { [string]$fallback.Path } else { "" }',
    '$commandLine = if ($null -ne $cim -and $cim.CommandLine) { [string]$cim.CommandLine } else { "" }',
    '$parentPid = if ($null -ne $cim) { [int]$cim.ParentProcessId } else { 0 }',
    `[ordered]@{ port = ${numericPort}; pid = $ownerPid; processName = $processName; pathValue = $pathValue; commandLine = $commandLine; parentProcessId = $parentPid } | ConvertTo-Json -Compress`,
  ].join('; ');

  try {
    const output = execFile('powershell.exe', [
      '-NoProfile',
      '-NonInteractive',
      '-Command',
      command,
    ], { encoding: 'utf8', windowsHide: true });
    return parsePortOwnerJson(output, numericPort);
  } catch {
    return null;
  }
}
