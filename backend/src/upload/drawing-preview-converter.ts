import { spawnSync } from 'child_process';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { isSafeInlineSvg } from '../common/safe-svg.util';

export interface DrawingPreviewConversion {
  status: 'ready' | 'failed';
  filename: string;
  contentType: string;
  format: 'pdf' | 'svg';
  buffer?: Buffer;
  error?: string;
}

function boundedNumber(raw: string | undefined, fallback: number, min: number, max: number) {
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? Math.min(max, Math.max(min, Math.floor(parsed))) : fallback;
}

function failure(message: string, format: 'pdf' | 'svg'): DrawingPreviewConversion {
  return { status: 'failed', filename: '', contentType: '', format, error: message.slice(0, 500) };
}

function validatePdf(buffer: Buffer) {
  return buffer.length >= 8
    && buffer.subarray(0, 5).toString('ascii') === '%PDF-'
    && buffer.subarray(Math.max(0, buffer.length - 2048)).includes(Buffer.from('%%EOF'));
}


/**
 * Optional DWG/DXF preview adapter. The executable is an administrator-controlled,
 * absolute path and argv is a JSON string array. No command string or shell is used.
 */
export function convertCadDrawingPreview(source: Buffer, sourceName: string): DrawingPreviewConversion {
  const format = String(process.env.DWES_CAD_PREVIEW_FORMAT || 'pdf').toLowerCase() === 'svg' ? 'svg' : 'pdf';
  const executable = String(process.env.DWES_CAD_PREVIEW_EXECUTABLE || '').trim();
  const argsJson = String(process.env.DWES_CAD_PREVIEW_ARGS_JSON || '').trim();
  if (!executable || !argsJson) {
    return failure('Secure DWG/DXF preview conversion is not configured. The original engineering source file is preserved unchanged.', format);
  }
  if (!path.isAbsolute(executable) || !fs.existsSync(executable)) {
    return failure('The configured CAD preview executable is unavailable or is not an absolute path.', format);
  }

  let template: string[];
  try {
    const parsed = JSON.parse(argsJson) as unknown;
    if (!Array.isArray(parsed) || !parsed.length || parsed.length > 64 || parsed.some(arg => typeof arg !== 'string')) {
      throw new Error('argv must be a non-empty JSON string array');
    }
    template = parsed as string[];
  } catch (error) {
    return failure(`Invalid DWES_CAD_PREVIEW_ARGS_JSON: ${error instanceof Error ? error.message : 'invalid JSON'}`, format);
  }
  const joined = template.join('\0');
  if (!joined.includes('{input}') || !joined.includes('{output}')) {
    return failure('CAD preview argv template must contain both {input} and {output} placeholders.', format);
  }

  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dwes-cad-preview-'));
  const safeExt = path.extname(sourceName).toLowerCase().replace(/[^.a-z0-9]/g, '') || '.cad';
  const inputPath = path.join(workDir, `source${safeExt}`);
  const outputPath = path.join(workDir, `preview.${format}`);
  const timeout = boundedNumber(process.env.DWES_CAD_PREVIEW_TIMEOUT_MS, 60_000, 1_000, 10 * 60_000);
  const maxOutputBytes = boundedNumber(process.env.DWES_CAD_PREVIEW_MAX_MB, 100, 1, 500) * 1024 * 1024;

  try {
    fs.writeFileSync(inputPath, source);
    const argv = template.map(arg => arg.replaceAll('{input}', inputPath).replaceAll('{output}', outputPath));
    const result = spawnSync(executable, argv, {
      cwd: workDir,
      shell: false,
      windowsHide: true,
      timeout,
      maxBuffer: 1024 * 1024,
      encoding: 'utf8',
      env: {
        PATH: process.env.PATH || '',
        Path: process.env.Path || process.env.PATH || '',
        SystemRoot: process.env.SystemRoot || '',
        WINDIR: process.env.WINDIR || '',
        HOME: process.env.HOME || '',
        TMP: workDir,
        TEMP: workDir,
      },
    });
    if (result.error || result.status !== 0) {
      const detail = result.error?.message || String(result.stderr || '').trim() || `exit code ${result.status}`;
      return failure(`CAD preview conversion failed: ${detail}`, format);
    }
    if (!fs.existsSync(outputPath)) return failure('CAD preview conversion completed without producing an output file.', format);
    const stat = fs.lstatSync(outputPath);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size <= 0 || stat.size > maxOutputBytes) {
      return failure(`CAD preview output is empty or exceeds the ${Math.floor(maxOutputBytes / 1024 / 1024)} MB limit.`, format);
    }
    const buffer = fs.readFileSync(outputPath);
    if (format === 'pdf' ? !validatePdf(buffer) : !isSafeInlineSvg(buffer)) {
      return failure(`CAD preview output is not a valid safe ${format.toUpperCase()} file.`, format);
    }
    const suffix = crypto.createHash('sha256').update(buffer).digest('hex').slice(0, 12);
    return {
      status: 'ready',
      filename: `preview-${suffix}.${format}`,
      contentType: format === 'pdf' ? 'application/pdf' : 'image/svg+xml',
      format,
      buffer,
    };
  } catch (error) {
    return failure(`CAD preview conversion failed: ${error instanceof Error ? error.message : 'unknown error'}`, format);
  } finally {
    fs.rmSync(workDir, { recursive: true, force: true });
  }
}
