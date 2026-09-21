import { Injectable, Logger, OnModuleInit, Optional } from '@nestjs/common';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { spawn } from 'child_process';
import type { Flat3dConversionOptions, Flat3dConversionResult, Flat3dRunMeta, Flat3dStageEvent, Flat3dScheduleEntry } from './flat3d-conversion.types';
import type { JobsService } from '../jobs/jobs.service';

function resolveScriptRoot(): string {
  if (process.env.DWES_FLAT3D_SCRIPT_ROOT?.trim()) {
    return path.resolve(process.env.DWES_FLAT3D_SCRIPT_ROOT.trim());
  }
  // Try both repo-root/scripts and cwd/../scripts (backend cwd).
  const fromBackend = path.join(process.cwd(), '..', 'scripts', 'flat3d-conversion');
  if (fs.existsSync(fromBackend)) return fromBackend;
  return path.join(process.cwd(), 'scripts', 'flat3d-conversion');
}

function resolvePython(): string {
  if (process.env.DWES_PYTHON?.trim()) return process.env.DWES_PYTHON.trim();
  return 'python';
}

function uploadDir(): string {
  if (process.env.UPLOAD_DIR?.trim()) {
    const d = process.env.UPLOAD_DIR.trim();
    return path.isAbsolute(d) ? d : path.join(process.cwd(), d);
  }
  return path.join(process.cwd(), 'uploads');
}

function flat3dRunDir(projectCode: string, frameId: string, runId: string): string {
  return path.join(uploadDir(), projectCode, 'flat3d', frameId, runId);
}

function spawnProcess(
  cmd: string,
  args: string[],
  opts: { cwd: string; timeoutMs: number },
): Promise<{ exitCode: number | null; stdout: string; stderr: string; timedOut: boolean }> {
  return new Promise(resolve => {
    let stdout = '';
    let stderr = '';
    let timedOut = false;

    const child = spawn(cmd, args, {
      cwd: opts.cwd,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGTERM');
    }, opts.timeoutMs);

    child.stdout?.on('data', (d: Buffer) => { stdout += d.toString(); });
    child.stderr?.on('data', (d: Buffer) => { stderr += d.toString(); });

    child.on('error', () => {
      clearTimeout(timer);
      resolve({ exitCode: null, stdout, stderr, timedOut });
    });

    child.on('close', code => {
      clearTimeout(timer);
      resolve({ exitCode: code, stdout, stderr, timedOut });
    });
  });
}

@Injectable()
export class Flat3dConversionService implements OnModuleInit {
  private readonly logger = new Logger(Flat3dConversionService.name);

  constructor(
    @Optional() private readonly jobsService: JobsService | null,
  ) {}

  async onModuleInit(): Promise<void> {
    if (this.jobsService) {
      try {
        this.jobsService.registerHandler('flat3d_drawing_convert', async (payload: any) =>
          this.runConversion(payload as Flat3dConversionOptions),
        );
        this.logger.log('Registered flat3d_drawing_convert job handler');
      } catch (err: any) {
        this.logger.warn(`Could not register flat3d_drawing_convert handler: ${err.message}`);
      }
    }
  }

  async runConversion(opts: Flat3dConversionOptions): Promise<Flat3dConversionResult> {
    const { projectCode, frameId, sourceFilePath, originalName } = opts;
    const stages: Flat3dStageEvent[] = [];
    const notes: string[] = [];
    const now = () => new Date().toISOString();

    const stage = (s: Flat3dStageEvent['stage'], detail?: string) => {
      stages.push({ stage: s, at: now(), ...(detail ? { detail } : {}) });
    };

    // PDF input is not a CAD source — return honesty fallback immediately.
    if (/\.pdf$/i.test(originalName)) {
      stage('FAILED', 'PDF input cannot produce Flat 3D GLB. Use Approved 2D path for PDF sources.');
      return {
        status: 'FAILED',
        runId: crypto.randomUUID(),
        runDir: '',
        stages,
        notes: ['PDF input detected. Flat 3D conversion requires a DWG or DXF source. Falling back to Approved 2D only.'],
        fallback: 'APPROVED_2D_ONLY',
        failureReason: 'PDF input is not supported for Flat 3D CAD conversion. Upload a DWG or DXF file to use this pipeline.',
      };
    }

    if (!/\.(dwg|dxf)$/i.test(originalName)) {
      stage('FAILED', `Unsupported input format: ${originalName}`);
      return {
        status: 'FAILED',
        runId: crypto.randomUUID(),
        runDir: '',
        stages,
        notes: [`Unsupported input format: ${originalName}. Only DWG and DXF files are supported.`],
        failureReason: `Unsupported input format: ${originalName}`,
      };
    }

    if (!fs.existsSync(sourceFilePath)) {
      stage('FAILED', `Source file not found: ${sourceFilePath}`);
      return {
        status: 'FAILED',
        runId: crypto.randomUUID(),
        runDir: '',
        stages,
        notes: [`Source file not found on disk: ${sourceFilePath}`],
        failureReason: `Source file not found: ${sourceFilePath}`,
      };
    }

    const runId = crypto.randomUUID();
    const runDir = flat3dRunDir(projectCode, frameId, runId);
    const sourceDir = path.join(runDir, 'source');
    const outDir = path.join(runDir, 'out');

    fs.mkdirSync(sourceDir, { recursive: true });
    fs.mkdirSync(outDir, { recursive: true });

    // Copy source file immutably into the run dir.
    const ext = path.extname(originalName);
    const sourceDestPath = path.join(sourceDir, `source${ext}`);
    fs.copyFileSync(sourceFilePath, sourceDestPath);

    stage('INGEST', `Copied source to ${sourceDestPath}`);

    // Write schedule.json if cables provided.
    let scheduleJsonPath = opts.scheduleJsonPath;
    if (!scheduleJsonPath && opts.scheduleJsonPath === undefined) {
      // Caller did not provide a path; if one was written alongside sourceFilePath we pick it up
    }

    const cliArgs = [
      '-m', 'flat3d.cli',
      '--input', sourceDestPath,
      '--out', outDir,
      '--project-code', projectCode,
      '--frame-id', frameId,
    ];

    if (scheduleJsonPath && fs.existsSync(scheduleJsonPath)) {
      cliArgs.push('--schedule-json', scheduleJsonPath);
    }

    if (opts.drawingRevision !== undefined && opts.drawingRevision !== null) {
      cliArgs.push('--drawing-revision', String(opts.drawingRevision));
    }

    const libredwgBinDir = process.env.DWES_LIBREDWG_BIN_DIR?.trim();
    if (libredwgBinDir) {
      cliArgs.push('--libredwg-bin-dir', libredwgBinDir);
    }

    if (opts.skipGltfValidator) {
      cliArgs.push('--skip-gltf-validator');
    }

    const scriptRoot = resolveScriptRoot();
    const pythonCmd = resolvePython();
    const timeoutMs = Number(process.env.DWES_FLAT3D_TIMEOUT_MS) || 180_000;

    this.logger.log(`flat3d run ${runId}: spawning ${pythonCmd} ${cliArgs.join(' ')} cwd=${scriptRoot}`);

    const result = await spawnProcess(pythonCmd, cliArgs, { cwd: scriptRoot, timeoutMs });

    if (result.timedOut) {
      stage('FAILED', `CLI timed out after ${timeoutMs}ms`);
      this.persistRunMeta(runDir, {
        runId, runDir,
        status: 'FAILED',
        stages,
        notes: [`Conversion timed out after ${timeoutMs}ms`],
        failureReason: `Timed out after ${timeoutMs}ms`,
        createdAt: now(),
      });
      return {
        status: 'FAILED', runId, runDir, stages,
        notes: [`Conversion timed out after ${timeoutMs}ms`],
        failureReason: `Timed out after ${timeoutMs}ms`,
      };
    }

    if (result.exitCode !== 0) {
      const detail = (result.stderr || result.stdout || '').slice(0, 800);
      stage('FAILED', `CLI exit ${result.exitCode}`);
      notes.push(`CLI stdout: ${result.stdout.slice(0, 400)}`);
      if (result.stderr) notes.push(`CLI stderr: ${result.stderr.slice(0, 400)}`);
      this.persistRunMeta(runDir, {
        runId, runDir, status: 'FAILED', stages, notes,
        failureReason: `Python CLI exited with code ${result.exitCode}: ${detail.slice(0, 400)}`,
        createdAt: now(),
      });
      return {
        status: 'FAILED', runId, runDir, stages, notes,
        failureReason: `Python CLI exited with code ${result.exitCode}`,
      };
    }

    // Read outputs from outDir.
    const reportPath = path.join(outDir, 'report.json');
    const manifestPath = path.join(outDir, 'manifest.json');
    const glbPath = path.join(outDir, 'model.glb');

    let reportData: any = {};
    let overlay: Flat3dConversionResult['overlay'];

    if (fs.existsSync(reportPath)) {
      try {
        reportData = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
        if (reportData.stages && Array.isArray(reportData.stages)) {
          for (const s of reportData.stages) {
            if (s.stage && !stages.some(x => x.stage === s.stage)) {
              stages.push({ stage: s.stage, at: s.at || now(), detail: s.detail });
            }
          }
        }
        if (reportData.overlay) {
          overlay = {
            matched_device_pct: reportData.overlay.matched_device_pct,
            missing_devices: reportData.overlay.missing_devices,
            positional_deviation_mm: reportData.overlay.positional_deviation_mm,
          };
        }
        if (Array.isArray(reportData.notes)) notes.push(...reportData.notes.map(String));
      } catch (e: any) {
        notes.push(`Could not parse report.json: ${e.message}`);
      }
    }

    if (!fs.existsSync(glbPath)) {
      stage('FAILED', 'model.glb not found in output directory');
      this.persistRunMeta(runDir, {
        runId, runDir, status: 'FAILED', stages, notes,
        failureReason: 'Python CLI succeeded but model.glb was not produced',
        createdAt: now(),
      });
      return {
        status: 'FAILED', runId, runDir, stages, notes, overlay,
        failureReason: 'Python CLI succeeded but model.glb was not produced',
      };
    }

    const glbBuffer = fs.readFileSync(glbPath);
    const glbFilename = `flat3d_${runId}.glb`;

    stage('READY_FOR_REVIEW', 'GLB produced by flat3d CLI');

    const meta: Flat3dRunMeta = {
      runId, runDir, status: 'READY_FOR_REVIEW', stages, notes, overlay, createdAt: now(),
    };
    this.persistRunMeta(runDir, meta);

    return {
      status: 'READY_FOR_REVIEW',
      runId, runDir,
      glbBuffer,
      glbFilename,
      stages,
      overlay,
      notes,
    };
  }

  private persistRunMeta(runDir: string, meta: Flat3dRunMeta): void {
    try {
      fs.mkdirSync(runDir, { recursive: true });
      const metaPath = path.join(runDir, 'run-meta.json');
      // Write atomically.
      const tmp = `${metaPath}.tmp-${process.pid}`;
      fs.writeFileSync(tmp, JSON.stringify(meta, null, 2), 'utf8');
      try { fs.renameSync(tmp, metaPath); } catch { fs.copyFileSync(tmp, metaPath); fs.unlinkSync(tmp); }
    } catch (e: any) {
      this.logger.warn(`Could not persist run meta for ${runDir}: ${e.message}`);
    }
  }

  async getLatestRun(projectCode: string, frameId: string): Promise<Flat3dRunMeta | null> {
    const frameDir = path.join(uploadDir(), projectCode, 'flat3d', frameId);
    if (!fs.existsSync(frameDir)) return null;

    const runs = fs.readdirSync(frameDir, { withFileTypes: true })
      .filter(d => d.isDirectory())
      .map(d => {
        const full = path.join(frameDir, d.name);
        return { name: d.name, mtime: fs.statSync(full).mtimeMs };
      })
      .sort((a, b) => b.mtime - a.mtime);

    for (const run of runs) {
      const metaPath = path.join(frameDir, run.name, 'run-meta.json');
      if (!fs.existsSync(metaPath)) continue;
      try {
        return JSON.parse(fs.readFileSync(metaPath, 'utf8')) as Flat3dRunMeta;
      } catch {
        continue;
      }
    }
    return null;
  }

  buildScheduleJson(cables: Array<{ source_device?: string; source_terminal?: string; dest_device?: string; dest_terminal?: string; ferrule?: string; ref?: string; color?: string; size?: string; path?: string }>): Flat3dScheduleEntry[] {
    return cables.map(c => ({
      cable_ref: c.ref,
      source_device: c.source_device,
      source_terminal: c.source_terminal,
      dest_device: c.dest_device,
      dest_terminal: c.dest_terminal,
      ferrule: c.ferrule,
      color: c.color,
      size: c.size,
      path: c.path,
    }));
  }

  writeScheduleJson(entries: Flat3dScheduleEntry[], targetPath: string): void {
    fs.mkdirSync(path.dirname(targetPath), { recursive: true });
    fs.writeFileSync(targetPath, JSON.stringify(entries, null, 2), 'utf8');
  }
}
