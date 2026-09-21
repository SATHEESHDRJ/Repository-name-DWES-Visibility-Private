import { Injectable, Logger } from '@nestjs/common';
import { spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import type { TbGroupCandidate } from './expected-headers';
import { normalizeDeviceName } from '../tb-markers/terminal-range';
import { crossVerifyTbHeader } from './excel-ga-cross-verify';
import {
  extractPdfTextLayout,
  findTerminalRangeNearHeader,
  isPhysicalStripKind,
  type PdfHeaderHit,
} from './pdf-text-layer';
import {
  classifyHeaderView,
  classifyPageView,
  isLiveTbEligibleView,
  isLiveTbRejectedView,
  type LiveTbViewClass,
} from './live-tb-view-classification';
import {
  buildAnalyseOnceCacheKey,
  fuseHeaderEvidence,
} from './evidence-fusion';
import { LIVE_TB_PIPELINE_VERSION } from './live-tb-contracts';

export type WorkerAnalysisRequest = {
  projectCode: string;
  frameId: string;
  drawingPath: string;
  drawingChecksum: string;
  drawingRevision: string;
  expectedHeaders: string[];
  /** Schedule terminals per physical TB header for Excel–GA cross-verify. */
  scheduleTerminalsByHeader?: Record<string, string[]>;
  /** Phase 2 enrichment: higher DPI / alt preprocess */
  enrichment?: boolean;
};

export type WorkerAnalysisResult = {
  page_types: string[];
  candidates: TbGroupCandidate[];
  engine: string;
  notes: string[];
  headers_found?: string[];
  headers_missing?: string[];
  headers_legend_only?: string[];
  headers_unresolved?: string[];
  grounding_unavailable?: boolean;
  locate_status?: string;
  locate_health?: Record<string, unknown>;
  evidence_by_header?: Record<string, unknown>;
  stages_run?: string[];
  pipeline_version?: string;
  analyse_once_cache_key?: string;
};

/**
 * Nest pdfjs searchable path + mandatory visual evidence package when render succeeds.
 * LocateAnything / OCR / OpenCV are complementary — not OCR-only fallbacks.
 */
@Injectable()
export class DrawingIntelligenceClient {
  private readonly logger = new Logger(DrawingIntelligenceClient.name);
  /** In-process analyse-once cache keyed by drawing hash + pipeline settings. */
  private static readonly analyseCache = new Map<string, WorkerAnalysisResult>();

  /** Strip non-JSON prefixes (e.g. Tesseract "warning: ...") from CLI stdout. */
  static extractJsonPayload(stdout: string): string {
    const text = String(stdout || '').trim();
    if (!text) {
      throw new Error('empty python CLI stdout');
    }
    const start = text.indexOf('{');
    if (start < 0) {
      throw new Error(`python CLI stdout is not JSON: ${text.slice(0, 120)}`);
    }
    let depth = 0;
    for (let i = start; i < text.length; i++) {
      const ch = text[i];
      if (ch === '{') depth += 1;
      else if (ch === '}') {
        depth -= 1;
        if (depth === 0) {
          return text.slice(start, i + 1);
        }
      }
    }
    throw new Error(`python CLI stdout JSON is truncated: ${text.slice(0, 120)}`);
  }

  async analyse(req: WorkerAnalysisRequest): Promise<WorkerAnalysisResult> {
    // Honour analyse-once cache before expensive OCR (wire changes must not re-OCR).
    const preliminaryKey = buildAnalyseOnceCacheKey({
      drawingChecksum: req.drawingChecksum,
      locateModelRevision: '',
      ocrVersions: 'tesseract',
      renderSettings: req.enrichment ? 'dpi400' : 'dpi350',
      pipelineVersion: LIVE_TB_PIPELINE_VERSION,
    });
    if (!req.enrichment) {
      const early = DrawingIntelligenceClient.analyseCache.get(preliminaryKey);
      if (early) {
        return { ...early, notes: [...(early.notes || []), 'analyse_once_cache_hit'] };
      }
    }

    const nestResult = await this.localPdfTextFallback(req);
    const renderOk = !nestResult.notes.includes('drawing_missing');
    // Max-accuracy: always request full visual evidence package when drawing exists.
    const runVisual = renderOk && (this.requiresOcrWorker(nestResult) || req.expectedHeaders.length > 0);

    let visual: WorkerAnalysisResult | null = null;
    if (runVisual) {
      visual = await this.runVisualEvidencePackage(req);
    }

    let merged = visual
      ? this.mergeEvidencePackages(visual, nestResult)
      : nestResult;

    // When OCR was required but the visual worker produced nothing, stamp an
    // explicit failure note so status logic cannot claim SCHEDULE_DRAWING_MISMATCH.
    if (runVisual && !visual) {
      const notes = [...(merged.notes || [])];
      if (!notes.some(n => /ocr_stage_failed|ocr_worker_unavailable/i.test(String(n)))) {
        notes.push('ocr_worker_unavailable');
        notes.push('ocr_stage_failed');
      }
      merged = { ...merged, notes };
    }

    merged = this.applyEvidenceFusion(merged);
    merged.pipeline_version = merged.pipeline_version || 'max-accuracy-evidence-fusion-v1';
    merged.analyse_once_cache_key = buildAnalyseOnceCacheKey({
      drawingChecksum: req.drawingChecksum,
      locateModelRevision: String((merged.locate_health as any)?.locate_model_revision || ''),
      ocrVersions: String((merged.notes || []).find(n => String(n).startsWith('ocr_providers=')) || 'tesseract'),
      renderSettings: req.enrichment ? 'dpi400' : 'dpi350',
      pipelineVersion: LIVE_TB_PIPELINE_VERSION,
    });

    if (!req.enrichment) {
      // Store under both preliminary (checksum+pipeline) and full keys.
      DrawingIntelligenceClient.analyseCache.set(preliminaryKey, merged);
      if (merged.analyse_once_cache_key && merged.analyse_once_cache_key !== preliminaryKey) {
        DrawingIntelligenceClient.analyseCache.set(merged.analyse_once_cache_key, merged);
      }
      while (DrawingIntelligenceClient.analyseCache.size > 32) {
        const first = DrawingIntelligenceClient.analyseCache.keys().next().value;
        if (!first) break;
        DrawingIntelligenceClient.analyseCache.delete(first);
      }
    }
    return merged;
  }

  private async runVisualEvidencePackage(req: WorkerAnalysisRequest): Promise<WorkerAnalysisResult | null> {
    const url = (process.env.DWES_DRAWING_INTELLIGENCE_URL || '').replace(/\/$/, '');
    if (url) {
      try {
        const res = await fetch(`${url}/analyse`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            drawing_path: req.drawingPath,
            expected_headers: req.expectedHeaders,
            schedule_terminals_by_header: req.scheduleTerminalsByHeader || {},
            enrichment: !!req.enrichment,
            dpi: req.enrichment ? 400 : 350,
            full_evidence: true,
            generation_mode: process.env.DWES_LOCATE_MODE || 'hybrid',
          }),
        });
        if (res.ok) {
          const data = (await res.json()) as WorkerAnalysisResult;
          return this.postClassifyOcrCandidates(data);
        }
        this.logger.warn(`Drawing intelligence HTTP ${res.status}; trying CLI`);
      } catch (err: any) {
        this.logger.warn(`Drawing intelligence unreachable: ${err?.message || err}`);
      }
    }

    const py = process.env.DWES_PYTHON || 'python';
    const script =
      process.env.DWES_DRAWING_INTELLIGENCE_SCRIPT ||
      path.join(__dirname, '..', '..', 'drawing-intelligence', 'cli_analyse.py');
    if (fs.existsSync(script)) {
      try {
        const ocr = await this.runPythonCli(py, script, req);
        return this.postClassifyOcrCandidates(ocr);
      } catch (err: any) {
        this.logger.warn(`Python CLI analysis failed: ${err?.message || err}`);
      }
    }
    return null;
  }

  /** Fuse Nest pdfjs + visual worker; preserve locate/evidence fields. */
  private mergeEvidencePackages(
    visual: WorkerAnalysisResult,
    nest: WorkerAnalysisResult,
  ): WorkerAnalysisResult {
    const base = this.mergeOcrNotes(visual, nest);
    return {
      ...base,
      grounding_unavailable: visual.grounding_unavailable ?? nest.grounding_unavailable,
      locate_status: visual.locate_status || nest.locate_status,
      locate_health: visual.locate_health || nest.locate_health,
      evidence_by_header: {
        ...(nest.evidence_by_header || {}),
        ...(visual.evidence_by_header || {}),
      },
      stages_run: [
        ...new Set([...(nest.stages_run || ['PDF_TEXT']), ...(visual.stages_run || [])]),
      ],
      pipeline_version: visual.pipeline_version || nest.pipeline_version,
      notes: [
        ...(base.notes || []),
        'full_evidence_package',
        visual.grounding_unavailable ? 'GROUNDING_UNAVAILABLE' : 'locate_participated_or_complete',
      ],
    };
  }

  /**
   * Apply strict multi-evidence HIGH gate (LocateAnything required when env set).
   */
  private applyEvidenceFusion(result: WorkerAnalysisResult): WorkerAnalysisResult {
    const notes = [...(result.notes || [])];
    const evidenceMap = (result.evidence_by_header || {}) as Record<string, any>;
    const groundingUnavailable = !!(
      result.grounding_unavailable
      || result.locate_status === 'LOCATE_UNAVAILABLE'
      || notes.some(n => String(n).includes('GROUNDING_UNAVAILABLE'))
    );

    const byHeader = new Map<string, TbGroupCandidate[]>();
    for (const c of result.candidates || []) {
      const h = normalizeDeviceName(c.tb_number);
      const list = byHeader.get(h) || [];
      list.push(c);
      byHeader.set(h, list);
    }

    const candidates = (result.candidates || []).map(c => {
      const h = normalizeDeviceName(c.tb_number);
      const peers = Math.max(0, (byHeader.get(h) || []).length - 1);
      const ev = (c as any).evidence || evidenceMap[h] || {
        header: h,
        schedule: { exact: true },
        pdf_text: { matched: String(c.detection_method || '').includes('PDFJS') },
        tesseract: { matched: String(c.detection_method || '').includes('OCR') },
        paddleocr: { matched: false },
        locate_text: { matched: false, status: result.locate_status },
        locate_physical_group: { matched: false, status: result.locate_status },
        opencv_strip: { matched: String(c.detection_method || '').includes('SHAPE') },
        view: { view_name: c.view_name, region: (c.geometry as any)?.view_classification },
        candidate_unique: peers === 0,
        checksum_current: true,
      };
      // Nest pdfjs hits count as pdf_text matched
      if (String(c.detection_method || '').includes('PDFJS')) {
        ev.pdf_text = { ...(ev.pdf_text || {}), matched: true };
      }
      const g = c.geometry as any;
      const hasBox = !!(g && Number(g.width) > 0.002 && Number(g.height) > 0.002);
      const decision = fuseHeaderEvidence({
        evidence: ev,
        groundingUnavailable,
        locateStatus: result.locate_status,
        paintablePeerCount: peers,
        hasRealBox: hasBox,
      });
      const reasons = [...(c.reasons || []), ...decision.reasons];
      return {
        ...c,
        confidence: decision.confidence,
        confidence_score:
          decision.confidence === 'HIGH' ? 0.95
            : decision.confidence === 'AMBIGUOUS' ? 0.4
              : decision.confidence === 'MEDIUM' ? 0.6
                : 0.25,
        reasons,
        evidence: ev,
      };
    });

    notes.push('evidence_fusion_applied');
    if (groundingUnavailable) notes.push('GROUNDING_UNAVAILABLE');
    return {
      ...result,
      candidates,
      notes,
      grounding_unavailable: groundingUnavailable,
    };
  }

  /**
   * OCR/shape worker when:
   * - pages have no searchable glyphs, OR
   * - searchable Nest path found zero physical TB headers (legend-only / absent)
   *   while schedule expected headers exist — INTERNAL/REAR labels are often
   *   outlined and missing from the text layer (pipeline stage 2 recovery).
   * Cross-verify still rejects legend/front; OCR must not invent HIGH alone.
   */
  private requiresOcrWorker(result: WorkerAnalysisResult): boolean {
    if (result.notes.includes('image_requires_ocr_worker')) return true;
    if (result.notes.includes('drawing_missing')) return false;
    const types = result.page_types || [];
    if (!types.length) return false;
    const noSearchable = types.every(t =>
      [
        'VECTOR_PDF_WITHOUT_TEXT',
        'VECTOR_PDF_WITH_OUTLINED_TEXT',
        'IMAGE',
        'UNSUPPORTED',
        'FLATTENED_PDF',
        'SCANNED_PDF',
      ].includes(String(t)),
    );
    if (noSearchable) return true;
    const found = result.headers_found || [];
    const missing = result.headers_missing || [];
    const legend = result.headers_legend_only || [];
    if (
      found.length === 0
      && (missing.length > 0 || legend.length > 0)
      && result.notes.some(n =>
        String(n).includes('schedule_drawing_mismatch')
        || String(n).startsWith('non_physical_only:')
        || String(n).startsWith('unresolved:'),
      )
    ) {
      return true;
    }
    return false;
  }

  /**
   * Apply Nest view classifiers to OCR candidates that lack view_name,
   * and demote rejected-view HIGH to MEDIUM/LOW.
   */
  private postClassifyOcrCandidates(result: WorkerAnalysisResult): WorkerAnalysisResult {
    const notes = [...(result.notes || [])];
    const candidates = (result.candidates || []).map(c => {
      const pageHint = String((c as any).page_compact || (c.geometry as any)?.page_compact || '');
      const pageView = classifyPageView(pageHint || String(c.view_name || ''));
      const kind = String((c.geometry as any)?.region_kind || 'strip_candidate');
      const nearby = String((c.geometry as any)?.nearby_compact || '');
      let view = (c.view_name as LiveTbViewClass) || 'UNKNOWN';
      if (!c.view_name) {
        view = classifyHeaderView({
          pageView: pageView === 'UNKNOWN' && nearby ? classifyPageView(nearby) : pageView,
          neighborhoodKind: kind,
          nearbyCompact: nearby || pageHint,
        });
      }

      let confidence = c.confidence;
      const reasons = [...(c.reasons || [])];
      if (isLiveTbRejectedView(view)) {
        confidence = 'LOW';
        reasons.push(`Rejected view ${view} — not AUTO_VERIFIED`);
      } else if (!isLiveTbEligibleView(view) && confidence === 'HIGH') {
        confidence = 'MEDIUM';
        reasons.push(`View ${view} not eligible for HIGH — capped at MEDIUM`);
      } else if (isLiveTbEligibleView(view)) {
        if (!reasons.some(r => String(r).startsWith('view='))) {
          reasons.push(`view=${view}`);
        }
      }

      const g = { ...(c.geometry as any) };
      g.view_classification = view;
      g.region_kind = kind;

      return {
        ...c,
        view_name: view,
        confidence,
        reasons,
        geometry: g,
      };
    });

    notes.push('ocr_post_classified_views');
    return { ...result, candidates, notes };
  }

  private mergeOcrNotes(
    ocr: WorkerAnalysisResult,
    nest: WorkerAnalysisResult,
  ): WorkerAnalysisResult {
    // Prefer OCR physical candidates when Nest found none; keep Nest legend notes.
    const nestHigh = (nest.candidates || []).filter(c => c.confidence === 'HIGH');
    const ocrHigh = (ocr.candidates || []).filter(c => c.confidence === 'HIGH');
    const useOcr = nestHigh.length === 0 && (ocrHigh.length > 0 || (ocr.candidates || []).length > 0);
    const merged = useOcr ? { ...ocr } : { ...nest, candidates: nest.candidates };
    if (!useOcr && ocrHigh.length) {
      merged.candidates = [...nestHigh, ...ocrHigh];
      merged.headers_found = [...new Set([...(nest.headers_found || []), ...(ocr.headers_found || [])])];
    }
    return {
      ...merged,
      notes: [
        ...(nest.notes || []),
        'ocr_worker_path',
        useOcr ? 'ocr_preferred_no_nest_high' : 'nest_preferred_or_ocr_empty',
        ...(ocr.notes || []),
      ],
      page_types: nest.page_types?.length ? nest.page_types : ocr.page_types,
      headers_legend_only: [
        ...new Set([...(nest.headers_legend_only || []), ...(ocr.headers_legend_only || [])]),
      ],
    };
  }

  private runPythonCli(
    python: string,
    script: string,
    req: WorkerAnalysisRequest,
  ): Promise<WorkerAnalysisResult> {
    return new Promise((resolve, reject) => {
      const payload = JSON.stringify({
        drawing_path: req.drawingPath,
        expected_headers: req.expectedHeaders,
        schedule_terminals_by_header: req.scheduleTerminalsByHeader || {},
        enrichment: !!req.enrichment,
        dpi: req.enrichment ? 400 : 350,
      });
      const child = spawn(python, [script], { stdio: ['pipe', 'pipe', 'pipe'] });
      let stdout = '';
      let stderr = '';
      child.stdout.on('data', d => {
        stdout += String(d);
      });
      child.stderr.on('data', d => {
        stderr += String(d);
      });
      child.on('error', reject);
      child.on('close', code => {
        if (code !== 0) {
          reject(new Error(stderr || `python exit ${code}`));
          return;
        }
        try {
          // Tesseract/Pillow may emit "warning: ..." on stdout before JSON.
          const jsonText = DrawingIntelligenceClient.extractJsonPayload(stdout);
          resolve(JSON.parse(jsonText) as WorkerAnalysisResult);
        } catch (e) {
          reject(e);
        }
      });
      child.stdin.write(payload);
      child.stdin.end();
    });
  }

  /**
   * Searchable-PDF path: pdfjs glyphs + Excel–GA cross-verify.
   * Legend/BOM/title/notes never become HIGH physical TB_GROUP markers.
   */
  private async localPdfTextFallback(req: WorkerAnalysisRequest): Promise<WorkerAnalysisResult> {
    const notes: string[] = ['local_pdf_text_fallback'];
    if (!fs.existsSync(req.drawingPath)) {
      return {
        page_types: ['UNSUPPORTED'],
        candidates: [],
        engine: 'nest-fallback',
        notes: ['drawing_missing'],
        headers_found: [],
        headers_missing: req.expectedHeaders.map(h => normalizeDeviceName(h)),
      };
    }
    const buf = fs.readFileSync(req.drawingPath);
    const lower = req.drawingPath.toLowerCase();
    if (/\.(png|jpe?g|gif|webp|bmp)$/i.test(lower)) {
      notes.push('image_requires_ocr_worker');
      return {
        page_types: ['IMAGE'],
        candidates: [],
        engine: 'nest-fallback',
        notes,
        headers_found: [],
        headers_missing: req.expectedHeaders.map(h => normalizeDeviceName(h)),
      };
    }

    const expected = req.expectedHeaders.map(h => normalizeDeviceName(h)).filter(Boolean);
    const scheduleMap = req.scheduleTerminalsByHeader || {};
    const layout = await extractPdfTextLayout(buf, expected);
    notes.push(...layout.notes);

    const candidates: TbGroupCandidate[] = [];
    const headers_found: string[] = [];
    const headers_missing: string[] = [];
    const legendOnly: string[] = [];
    const unresolved: string[] = [];
    const byHeader = new Map<string, PdfHeaderHit[]>();
    for (const hit of layout.hits) {
      const list = byHeader.get(hit.header) || [];
      list.push(hit);
      byHeader.set(hit.header, list);
    }

    for (const header of expected) {
      const hits = byHeader.get(header) || [];
      if (!hits.length) {
        headers_missing.push(header);
        continue;
      }

      const stripHits = hits.filter(h => isPhysicalStripKind(h.kind));
      if (!stripHits.length) {
        legendOnly.push(header);
        headers_missing.push(header);
        notes.push(`non_physical_only:${header}:${[...new Set(hits.map(h => h.kind))].join(',')}`);
        continue;
      }

      const pageCompact = layout.compactTextByPage[stripHits[0].pageNumber - 1] || '';
      const term = findTerminalRangeNearHeader(pageCompact, header);
      const peers = stripHits.length - 1;
      const hasBox = stripHits.some(
        h => h.geometry.width > 0.002 && h.geometry.height > 0.002,
      );
      const verified = crossVerifyTbHeader({
        header,
        hits,
        scheduleTerminals: scheduleMap[header] || [],
        terminalRangeFound: term.found,
        terminalRange: term.range,
        hasGlyphBox: hasBox,
        peers,
      });

      if (verified.confidence === 'LOW' || !verified.usableHits.length) {
        unresolved.push(header);
        headers_missing.push(header);
        notes.push(`unresolved:${header}:${verified.reasons.join('|')}`);
        continue;
      }

      headers_found.push(header);
      for (const hit of verified.usableHits) {
        if (hit.geometry.width <= 0.002 || hit.geometry.height <= 0.002) continue;
        const cells = hit.terminalCells || [];
        const cellMap: Record<string, { x: number; y: number; width: number; height: number }> = {};
        for (const c of cells) {
          cellMap[String(c.terminal)] = {
            x: c.x,
            y: c.y,
            width: c.width,
            height: c.height,
          };
        }
        const range =
          hit.detectedTerminalRange
          || (term.found ? term.range : '')
          || (cells.length
            ? `${Math.min(...cells.map(c => Number(c.terminal)))}-${Math.max(...cells.map(c => Number(c.terminal)))}`
            : 'UNVERIFIED');
        candidates.push({
          tb_number: header,
          terminal_group: range,
          page_number: hit.pageNumber,
          view_name: hit.viewClassification || null,
          geometry: {
            x: hit.geometry.x,
            y: hit.geometry.y,
            width: hit.geometry.width,
            height: hit.geometry.height,
            rotation: hit.geometry.rotation || 0,
            // Evidence payload (stored in JSON column; no schema migrate)
            view_classification: hit.viewClassification,
            region_kind: hit.kind,
            strip_bbox: { ...hit.geometry },
            tb_header: header,
            detected_terminal_range: range,
            terminal_cells: cellMap,
            orientation: hit.geometry.height >= hit.geometry.width ? 'vertical' : 'horizontal',
            confidence: verified.confidence,
          } as any,
          detection_method: 'PDFJS_REAR_STRIP_CELL_CROSS_VERIFIED',
          confidence: verified.confidence,
          confidence_score:
            verified.confidence === 'HIGH' ? 0.92
              : verified.confidence === 'AMBIGUOUS' ? 0.4
                : 0.55,
          reasons: verified.reasons,
        });
      }

      if (verified.confidence === 'MEDIUM' || verified.confidence === 'AMBIGUOUS') {
        unresolved.push(header);
      }
    }

    if (req.enrichment) {
      notes.push('enrichment_pass_text_layout');
    }

    if (headers_found.length === 0 && expected.length > 0) {
      notes.push('schedule_drawing_mismatch_no_physical_tb_headers_in_drawing');
      if (legendOnly.length) notes.push(`legend_only_headers:${legendOnly.join(',')}`);
    }

    return {
      page_types: layout.pageTypes,
      candidates,
      engine: layout.engine || 'nest-fallback',
      notes,
      headers_found,
      headers_missing,
      headers_legend_only: legendOnly,
      headers_unresolved: unresolved,
    };
  }
}
