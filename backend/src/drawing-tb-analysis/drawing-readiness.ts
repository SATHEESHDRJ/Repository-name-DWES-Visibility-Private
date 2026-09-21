/**
 * Drawing readiness + worker health for LIVE TB (Phase 3).
 */
import { spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import type { DrawingReadinessType } from './live-tb-contracts';

export type WorkerHealthReport = {
  pdfjs: 'ok' | 'missing' | 'error';
  ocr_python: 'ok' | 'missing' | 'error' | 'unconfigured';
  opencv: 'ok' | 'missing' | 'unconfigured';
  paddleocr: 'ok' | 'missing' | 'unconfigured';
  locate_anything: 'ok' | 'missing' | 'unavailable' | 'unconfigured';
  locate_model_loaded: boolean;
  locate_mode: string;
  locate_status: string;
  /** future_cloud | remote_gpu | local — app healthy ≠ grounding ready */
  locate_execution_mode: string;
  locate_anything_provider?: {
    required: boolean;
    execution_mode: string;
    available: boolean;
    status: string;
    model_loaded?: boolean;
    inference_ready?: boolean;
  };
  cuda: boolean;
  gpu: string;
  queue: 'ok' | 'inline_fallback' | 'error';
  notes: string[];
};

export function classifyDrawingReadiness(input: {
  drawingPath: string;
  pageTypes?: string[];
}): { type: DrawingReadinessType; page_count: number; searchable: boolean; notes: string[] } {
  const notes: string[] = [];
  const p = String(input.drawingPath || '');
  const lower = p.toLowerCase();
  if (!p || !fs.existsSync(p)) {
    return { type: 'UNSUPPORTED', page_count: 0, searchable: false, notes: ['drawing_missing'] };
  }
  if (/\.(png|jpe?g|gif|webp|bmp)$/i.test(lower)) {
    return { type: 'IMAGE', page_count: 1, searchable: false, notes: ['image_asset'] };
  }
  const types = (input.pageTypes || []).map(t => String(t));
  const searchable = types.some(t =>
    t === 'SEARCHABLE_PDF' || t === 'SEARCHABLE_VECTOR_PDF',
  );
  const outlined = types.some(t =>
    t === 'VECTOR_PDF_WITHOUT_TEXT' || t === 'VECTOR_PDF_WITH_OUTLINED_TEXT',
  );
  const flattened = types.some(t => t === 'FLATTENED_PDF');
  const scanned = types.some(t => t === 'SCANNED_PDF');
  const imagePage = types.some(t => t === 'IMAGE');

  if (searchable && (outlined || flattened || scanned || imagePage)) {
    notes.push('mixed_page_types');
    return { type: 'MIXED', page_count: types.length || 1, searchable: true, notes };
  }
  if (searchable) {
    return { type: 'SEARCHABLE_VECTOR_PDF', page_count: types.length || 1, searchable: true, notes };
  }
  if (scanned) {
    return { type: 'SCANNED_PDF', page_count: types.length || 1, searchable: false, notes };
  }
  if (flattened) {
    return { type: 'FLATTENED_PDF', page_count: types.length || 1, searchable: false, notes };
  }
  if (outlined || types.every(t => ['VECTOR_PDF_WITHOUT_TEXT', 'UNSUPPORTED'].includes(t))) {
    notes.push('may_be_outlined_or_scanned');
    return {
      type: 'VECTOR_PDF_WITH_OUTLINED_TEXT',
      page_count: types.length || 1,
      searchable: false,
      notes,
    };
  }
  if (imagePage) {
    return { type: 'IMAGE', page_count: types.length || 1, searchable: false, notes };
  }
  return { type: 'UNSUPPORTED', page_count: types.length || 1, searchable: false, notes };
}

function probeTesseractCli(python: string): Promise<{ ok: boolean; note: string }> {
  return new Promise(resolve => {
    const code = [
      'import sys',
      'try:',
      ' import pytesseract',
      ' from PIL import Image',
      ' import io',
      ' img=Image.new("L",(32,32),255)',
      ' pytesseract.image_to_string(img)',
      ' print("ok")',
      'except Exception as e:',
      ' print("err:"+str(e)); sys.exit(2)',
    ].join('\n');
    const child = spawn(python, ['-c', code], { stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    let err = '';
    const timer = setTimeout(() => {
      try { child.kill(); } catch { /* ignore */ }
      resolve({ ok: false, note: 'ocr_tesseract_probe_timeout' });
    }, 8000);
    child.stdout.on('data', d => { out += String(d); });
    child.stderr.on('data', d => { err += String(d); });
    child.on('error', e => {
      clearTimeout(timer);
      resolve({ ok: false, note: `ocr_python_spawn:${(e as Error).message || e}` });
    });
    child.on('close', codeExit => {
      clearTimeout(timer);
      if (codeExit === 0 && /ok/.test(out)) {
        resolve({ ok: true, note: 'ocr_tesseract_probe_ok' });
      } else {
        resolve({ ok: false, note: `ocr_tesseract_probe_failed:${(err || out || codeExit).toString().slice(0, 120)}` });
      }
    });
  });
}

export async function probeWorkerHealth(): Promise<WorkerHealthReport> {
  const notes: string[] = [];
  let pdfjs: WorkerHealthReport['pdfjs'] = 'missing';
  try {
    await import('pdfjs-dist/legacy/build/pdf.mjs');
    pdfjs = 'ok';
  } catch (err: any) {
    pdfjs = 'error';
    notes.push(`pdfjs:${err?.message || err}`);
  }

  let ocr_python: WorkerHealthReport['ocr_python'] = 'unconfigured';
  let paddleocr: WorkerHealthReport['paddleocr'] = 'unconfigured';
  let locate_anything: WorkerHealthReport['locate_anything'] = 'unconfigured';
  let locate_model_loaded = false;
  let locate_mode = process.env.DWES_LOCATE_MODE || 'hybrid';
  let locate_status = 'GROUNDING_UNAVAILABLE';
  let locate_execution_mode =
    String(process.env.DWES_GROUNDING_EXECUTION_MODE || 'future_cloud').trim().toLowerCase()
    || 'future_cloud';
  let locate_anything_provider: WorkerHealthReport['locate_anything_provider'] = {
    required: true,
    execution_mode: locate_execution_mode,
    available: false,
    status: 'GROUNDING_UNAVAILABLE',
    model_loaded: false,
    inference_ready: false,
  };
  let cuda = false;
  let gpu = 'unavailable';
  const url = (process.env.DWES_DRAWING_INTELLIGENCE_URL || '').trim();
  const script =
    process.env.DWES_DRAWING_INTELLIGENCE_SCRIPT ||
    path.join(__dirname, '..', '..', 'drawing-intelligence', 'cli_analyse.py');
  const python = process.env.DWES_PYTHON || 'python';

  const applyLocateBody = (body: any) => {
    locate_model_loaded = !!body?.locate_model_loaded;
    locate_mode = String(body?.locate_mode || locate_mode);
    locate_status = String(body?.locate_status || locate_status);
    locate_execution_mode = String(
      body?.locate_execution_mode
      || body?.locate_anything_provider?.execution_mode
      || locate_execution_mode,
    );
    locate_anything = locate_model_loaded
      ? 'ok'
      : (body?.locate_anything || body?.locate_anything_provider?.available
        ? 'unavailable'
        : 'unavailable');
    const detail = body?.locate_anything_provider || body?.locate_anything_detail;
    if (detail && typeof detail === 'object') {
      locate_anything_provider = {
        required: detail.required !== false,
        execution_mode: String(detail.execution_mode || locate_execution_mode),
        available: !!detail.available,
        status: String(detail.status || locate_status),
        model_loaded: !!detail.model_loaded,
        inference_ready: !!detail.inference_ready,
      };
    } else {
      locate_anything_provider = {
        required: true,
        execution_mode: locate_execution_mode,
        available: locate_model_loaded,
        status: locate_status,
        model_loaded: locate_model_loaded,
        inference_ready: locate_model_loaded,
      };
    }
    cuda = !!body?.cuda;
    gpu = String(body?.gpu || gpu);
    if (Array.isArray(body?.locate_notes)) {
      notes.push(...body.locate_notes.map((n: string) => `locate:${n}`));
    }
  };

  if (url) {
    try {
      const res = await fetch(`${url.replace(/\/$/, '')}/health`);
      if (res.ok) {
        const body = await res.json().catch(() => ({} as any));
        if (body?.tesseract === true || body?.ocr === 'ok') {
          ocr_python = 'ok';
          notes.push('ocr_http_health_ok');
        } else if (body?.ok === true && body?.tesseract === false) {
          ocr_python = 'error';
          notes.push('ocr_http_no_tesseract');
        } else {
          const probe = await probeTesseractCli(python);
          notes.push(probe.note);
          ocr_python = probe.ok ? 'ok' : 'error';
        }
        paddleocr = body?.paddleocr === true ? 'ok' : 'missing';
        applyLocateBody(body);
      } else {
        ocr_python = 'error';
        notes.push(`ocr_http_${res.status}`);
      }
    } catch (err: any) {
      ocr_python = 'error';
      notes.push(`ocr_http:${err?.message || err}`);
    }
  } else if (fs.existsSync(script)) {
    const probe = await probeTesseractCli(python);
    notes.push(probe.note);
    ocr_python = probe.ok ? 'ok' : 'error';
    if (!probe.ok) notes.push('ocr_cli_script_present_but_tesseract_unusable');
    // CLI health via health_probe module when available
    try {
      const healthScript = path.join(path.dirname(script), 'health_probe.py');
      if (fs.existsSync(healthScript)) {
        const { spawnSync } = await import('child_process');
        const r = spawnSync(
          python,
          ['-c', 'from health_probe import build_health; import json; print(json.dumps(build_health()))'],
          { cwd: path.dirname(script), encoding: 'utf8', timeout: 15000 },
        );
        if (r.status === 0 && r.stdout) {
          const body = JSON.parse(r.stdout);
          paddleocr = body?.paddleocr === true ? 'ok' : 'missing';
          applyLocateBody(body);
        }
      }
    } catch (err: any) {
      notes.push(`cli_health_probe:${err?.message || err}`);
      locate_anything = 'unavailable';
    }
  } else {
    ocr_python = 'missing';
    notes.push('ocr_worker_unavailable');
  }

  let opencv: WorkerHealthReport['opencv'] = 'unconfigured';
  if (process.env.DWES_TB_SHAPE === '0') {
    opencv = 'unconfigured';
    notes.push('opencv_disabled_by_env');
  } else {
    opencv = ocr_python === 'ok' ? 'ok' : 'missing';
    if (opencv === 'missing') notes.push('opencv_requires_ocr_worker');
  }

  const queue: WorkerHealthReport['queue'] =
    process.env.REDIS_URL || process.env.DWES_REDIS_URL
      ? 'ok'
      : 'inline_fallback';

  return {
    pdfjs,
    ocr_python,
    opencv,
    paddleocr,
    locate_anything,
    locate_model_loaded,
    locate_mode,
    locate_status,
    locate_execution_mode,
    locate_anything_provider,
    cuda,
    gpu,
    queue,
    notes,
  };
}
