import { Injectable } from '@nestjs/common';
import { execFile } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

export interface StoredCadFile {
  path: string;
  originalName: string;
  size: number;
}

export interface ProviderHealth {
  available: boolean;
  provider: string;
  version: string | null;
  detail?: string;
}

export interface CadInspection {
  valid: boolean;
  format: 'dwg' | 'dxf';
  version: string | null;
  detail?: string;
}

export interface ConversionResult {
  format: 'dxf';
  buffer: Buffer;
  provider: string;
  version: string;
}

export interface PreviewResult {
  format: 'pdf' | 'svg';
  buffer: Buffer;
  contentType: string;
  provider: string;
  version: string;
}

export interface CadLayer { name: string }
export interface CadTextEntity { text: string; layer?: string }

export interface CadConversionProvider {
  healthCheck(): Promise<ProviderHealth>;
  inspect(file: StoredCadFile): Promise<CadInspection>;
  convertToDxf(file: StoredCadFile): Promise<ConversionResult>;
  generatePreview(file: StoredCadFile): Promise<PreviewResult>;
  extractLayers(file: StoredCadFile): Promise<CadLayer[]>;
  extractTextEntities(file: StoredCadFile): Promise<CadTextEntity[]>;
}

class CadProviderUnavailableError extends Error {}

function boundedNumber(raw: string | undefined, fallback: number, min: number, max: number): number {
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? Math.min(max, Math.max(min, Math.floor(parsed))) : fallback;
}

function safeDetail(value: unknown): string {
  return String(value ?? '').replace(/[\r\n\t]+/g, ' ').slice(0, 500);
}

function parseArgv(raw: string | undefined, fallback: string[]): string[] {
  if (!raw?.trim()) return fallback;
  const parsed: unknown = JSON.parse(raw);
  if (!Array.isArray(parsed) || parsed.length === 0 || parsed.length > 64
      || parsed.some(value => typeof value !== 'string' || value.length > 500)) {
    throw new Error('CAD command argv must be a non-empty JSON string array');
  }
  return parsed as string[];
}

function validateStoredFile(file: StoredCadFile): void {
  if (!path.isAbsolute(file.path) || !fs.existsSync(file.path)) throw new Error('Stored CAD source is unavailable');
  const stat = fs.lstatSync(file.path);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size !== file.size) throw new Error('Stored CAD source metadata mismatch');
}

@Injectable()
export class LocalLibreDwgProvider implements CadConversionProvider {
  readonly name = 'LibreDWG external process';

  async healthCheck(): Promise<ProviderHealth> {
    try {
      const executable = this.executable('dwgread');
      const result = await this.run(executable, ['--version'], undefined, 10_000);
      const version = this.parseVersion(result.stdout || result.stderr);
      return { available: true, provider: this.name, version };
    } catch (error) {
      return { available: false, provider: this.name, version: null, detail: safeDetail(error instanceof Error ? error.message : error) };
    }
  }

  async inspect(file: StoredCadFile): Promise<CadInspection> {
    validateStoredFile(file);
    const format = path.extname(file.originalName).toLowerCase() === '.dxf' ? 'dxf' : 'dwg';
    if (format === 'dxf') return { valid: true, format, version: 'manual DXF fallback' };
    const health = await this.requireHealth();
    const result = await this.run(this.executable('dwgread'), ['-h', file.path], path.dirname(file.path));
    return { valid: true, format, version: health.version, detail: safeDetail(result.stdout) };
  }

  async convertToDxf(file: StoredCadFile): Promise<ConversionResult> {
    validateStoredFile(file);
    const health = await this.requireHealth();
    return this.withWorkDir(async workDir => {
      const output = path.join(workDir, 'converted.dxf');
      const template = parseArgv(process.env.DWES_LIBREDWG_DWG2DXF_ARGS_JSON, ['-o', '{output}', '{input}']);
      await this.run(this.executable('dwg2dxf'), this.resolveArgs(template, file.path, output), workDir);
      const buffer = this.readBoundedOutput(output, 'DXF');
      const text = buffer.subarray(0, Math.min(buffer.length, 4096)).toString('utf8');
      if (!/(?:^|\r?\n)\s*0\s*\r?\n\s*SECTION/i.test(text)) throw new Error('LibreDWG output is not a valid DXF file');
      return { format: 'dxf', buffer, provider: this.name, version: health.version ?? 'unknown' };
    });
  }

  async generatePreview(file: StoredCadFile): Promise<PreviewResult> {
    validateStoredFile(file);
    const health = await this.requireHealth();
    return this.withWorkDir(async workDir => {
      const previewFormat = process.env.DWES_LIBREDWG_PREVIEW_FORMAT === 'svg' ? 'svg' : 'pdf';
      const output = path.join(workDir, `preview.${previewFormat}`);
      const raw = process.env.DWES_LIBREDWG_PREVIEW_ARGS_JSON;
      if (!raw?.trim()) throw new CadProviderUnavailableError('LibreDWG preview command is not configured');
      const template = parseArgv(raw, []);
      const tool = String(process.env.DWES_LIBREDWG_PREVIEW_TOOL || 'dwgbmp').trim();
      await this.run(this.executable(tool), this.resolveArgs(template, file.path, output), workDir);
      const buffer = this.readBoundedOutput(output, 'preview');
      return {
        format: previewFormat,
        buffer,
        contentType: previewFormat === 'pdf' ? 'application/pdf' : 'image/svg+xml',
        provider: this.name,
        version: health.version ?? 'unknown',
      };
    });
  }

  async extractLayers(file: StoredCadFile): Promise<CadLayer[]> {
    validateStoredFile(file);
    await this.requireHealth();
    const result = await this.run(this.executable('dwglayers'), [file.path], path.dirname(file.path));
    return result.stdout.split(/\r?\n/).map(name => name.trim()).filter(Boolean).slice(0, 10_000).map(name => ({ name }));
  }

  async extractTextEntities(file: StoredCadFile): Promise<CadTextEntity[]> {
    validateStoredFile(file);
    await this.requireHealth();
    const result = await this.run(this.executable('dwgread'), ['-O', 'json', file.path], path.dirname(file.path));
    const parsed: unknown = JSON.parse(result.stdout);
    const text: CadTextEntity[] = [];
    this.collectText(parsed, text);
    return text.slice(0, 50_000);
  }

  private async requireHealth(): Promise<ProviderHealth> {
    const health = await this.healthCheck();
    if (!health.available) throw new CadProviderUnavailableError(health.detail || 'LibreDWG is unavailable');
    return health;
  }

  private executable(tool: string): string {
    if (!/^[a-zA-Z0-9_-]+$/.test(tool)) throw new Error('Unsafe LibreDWG tool name');
    const binDir = String(process.env.DWES_LIBREDWG_BIN_DIR || '').trim();
    if (!binDir || !path.isAbsolute(binDir)) throw new CadProviderUnavailableError('DWES_LIBREDWG_BIN_DIR is not configured');
    const executable = path.resolve(binDir, process.platform === 'win32' ? `${tool}.exe` : tool);
    const relative = path.relative(path.resolve(binDir), executable);
    if (relative.startsWith('..') || path.isAbsolute(relative) || !fs.existsSync(executable)) {
      throw new CadProviderUnavailableError(`LibreDWG tool ${tool} is unavailable`);
    }
    return executable;
  }

  private resolveArgs(template: string[], input: string, output: string): string[] {
    const joined = template.join('\0');
    if (!joined.includes('{input}') || !joined.includes('{output}')) {
      throw new Error('CAD argv must contain {input} and {output} placeholders');
    }
    return template.map(arg => arg.replaceAll('{input}', input).replaceAll('{output}', output));
  }

  private async run(executable: string, args: string[], cwd?: string, overrideTimeout?: number) {
    const timeout = overrideTimeout ?? boundedNumber(process.env.DWES_CAD_TIMEOUT_MS, 60_000, 1_000, 10 * 60_000);
    return execFileAsync(executable, args, {
      cwd,
      windowsHide: true,
      timeout,
      maxBuffer: 2 * 1024 * 1024,
      shell: false,
      env: {
        PATH: process.env.PATH || '',
        Path: process.env.Path || process.env.PATH || '',
        SystemRoot: process.env.SystemRoot || '',
        WINDIR: process.env.WINDIR || '',
        HOME: process.env.HOME || '',
        TMP: cwd || os.tmpdir(),
        TEMP: cwd || os.tmpdir(),
      },
    });
  }

  private async withWorkDir<T>(work: (workDir: string) => Promise<T>): Promise<T> {
    const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dwes-ga-cad-'));
    try {
      return await work(workDir);
    } finally {
      fs.rmSync(workDir, { recursive: true, force: true });
    }
  }

  private readBoundedOutput(output: string, label: string): Buffer {
    if (!fs.existsSync(output)) throw new Error(`${label} conversion produced no output`);
    const stat = fs.lstatSync(output);
    const maxBytes = boundedNumber(process.env.DWES_CAD_MAX_OUTPUT_MB, 100, 1, 500) * 1024 * 1024;
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size <= 0 || stat.size > maxBytes) {
      throw new Error(`${label} output is empty, unsafe, or exceeds the configured limit`);
    }
    return fs.readFileSync(output);
  }

  private parseVersion(output: string): string | null {
    const clean = safeDetail(output);
    const match = clean.match(/(?:LibreDWG|dwgread)[^0-9]*([0-9]+(?:\.[0-9]+){1,3})/i);
    return match?.[1] ?? (clean ? clean.slice(0, 100) : null);
  }

  private collectText(value: unknown, output: CadTextEntity[]): void {
    if (output.length >= 50_000 || value === null || value === undefined) return;
    if (Array.isArray(value)) {
      for (const child of value) this.collectText(child, output);
      return;
    }
    if (typeof value !== 'object') return;
    const row = value as Record<string, unknown>;
    const candidate = typeof row.text === 'string' ? row.text : typeof row.value === 'string' ? row.value : null;
    if (candidate?.trim()) output.push({ text: candidate.trim().slice(0, 2_000), ...(typeof row.layer === 'string' ? { layer: row.layer.slice(0, 200) } : {}) });
    for (const child of Object.values(row)) this.collectText(child, output);
  }
}

@Injectable()
export class CadProviderRegistry {
  constructor(private readonly libreDwg: LocalLibreDwgProvider) {}

  provider(): CadConversionProvider {
    const configured = String(process.env.DWES_CAD_PROVIDER || 'libredwg').trim().toLowerCase();
    if (configured !== 'libredwg') throw new CadProviderUnavailableError(`CAD provider ${configured} is not configured`);
    return this.libreDwg;
  }

  async healthCheck(): Promise<ProviderHealth> {
    try {
      return await this.provider().healthCheck();
    } catch (error) {
      return {
        available: false,
        provider: 'unconfigured',
        version: null,
        detail: safeDetail(error instanceof Error ? error.message : error),
      };
    }
  }
}
