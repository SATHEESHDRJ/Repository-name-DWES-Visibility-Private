/**
 * Oversized scanned-page guards for LIVE TB / PDF preview.
 * Original PDF bytes stay untouched; consumers downscale or tile for render/OCR.
 */

export type DrawingJobLifecycle =
  | 'QUEUED'
  | 'PROCESSING'
  | 'READY'
  | 'PARTIAL'
  | 'FAILED';

export type PagePixelBudget = {
  /** Single edge (width or height) above this is unsafe at full DPI. */
  maxEdgePx: number;
  /** Width × height above this risks OOM / canvas limits. */
  maxPixels: number;
  /** Soft preview edge for cached optimised raster (keeps aspect). */
  previewMaxEdgePx: number;
};

export const DEFAULT_PAGE_PIXEL_BUDGET: PagePixelBudget = {
  maxEdgePx: 8192,
  maxPixels: 40_000_000, // ~40 MP
  previewMaxEdgePx: 4096,
};

export type PageDimensionInput = {
  widthPx: number;
  heightPx: number;
  dpi?: number;
};

export type OversizedAssessment = {
  unsafe: boolean;
  reason: string | null;
  widthPx: number;
  heightPx: number;
  pixels: number;
  /** Scale factor ≤ 1 to fit preview budget while preserving aspect. */
  previewScale: number;
  previewWidthPx: number;
  previewHeightPx: number;
  /** Recommended OCR/render DPI when downscaling from a nominal DPI. */
  recommendedDpi: number | null;
  lifecycleHint: DrawingJobLifecycle;
};

function clampPositive(n: number): number {
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.floor(n);
}

/**
 * Assess whether a rendered page pixmap is unsafe for full-resolution processing.
 * Coordinate mapping must remain in original page space (0..1); previewScale is
 * display/OCR only — never rewrite stored geometry to preview pixels.
 */
export function assessOversizedPage(
  input: PageDimensionInput,
  budget: PagePixelBudget = DEFAULT_PAGE_PIXEL_BUDGET,
): OversizedAssessment {
  const widthPx = clampPositive(input.widthPx);
  const heightPx = clampPositive(input.heightPx);
  const pixels = widthPx * heightPx;
  const edge = Math.max(widthPx, heightPx);
  const reasons: string[] = [];

  if (widthPx === 0 || heightPx === 0) {
    return {
      unsafe: true,
      reason: 'invalid_dimensions',
      widthPx,
      heightPx,
      pixels,
      previewScale: 1,
      previewWidthPx: 0,
      previewHeightPx: 0,
      recommendedDpi: null,
      lifecycleHint: 'FAILED',
    };
  }

  if (edge > budget.maxEdgePx) reasons.push(`edge_${edge}_gt_${budget.maxEdgePx}`);
  if (pixels > budget.maxPixels) reasons.push(`pixels_${pixels}_gt_${budget.maxPixels}`);

  const previewScale =
    edge <= budget.previewMaxEdgePx
      ? 1
      : budget.previewMaxEdgePx / edge;

  const previewWidthPx = Math.max(1, Math.floor(widthPx * previewScale));
  const previewHeightPx = Math.max(1, Math.floor(heightPx * previewScale));

  const nominalDpi = input.dpi && input.dpi > 0 ? input.dpi : 350;
  const recommendedDpi =
    previewScale < 1
      ? Math.max(72, Math.floor(nominalDpi * previewScale))
      : nominalDpi;

  return {
    unsafe: reasons.length > 0,
    reason: reasons.length ? reasons.join('|') : previewScale < 1 ? 'preview_downscale' : null,
    widthPx,
    heightPx,
    pixels,
    previewScale,
    previewWidthPx,
    previewHeightPx,
    recommendedDpi,
    // Unsafe pages still process via optimised preview → PARTIAL until full OCR completes.
    lifecycleHint: reasons.length > 0 ? 'PARTIAL' : previewScale < 1 ? 'PROCESSING' : 'READY',
  };
}

/**
 * Clamp a canvas render so width*height*pixelRatio stays within browser-safe limits.
 * Returns adjusted scale (CSS pixels) and pixelRatio; page-normalized coords unchanged.
 */
export function clampCanvasRenderScale(opts: {
  viewportWidth: number;
  viewportHeight: number;
  pixelRatio: number;
  maxCanvasEdge?: number;
  maxCanvasPixels?: number;
}): { scaleFactor: number; pixelRatio: number; clamped: boolean; reason: string | null } {
  const maxEdge = opts.maxCanvasEdge ?? 8192;
  const maxPixels = opts.maxCanvasPixels ?? 16_777_216; // common browser canvas limit ~16MP
  const w0 = Math.max(1, opts.viewportWidth);
  const h0 = Math.max(1, opts.viewportHeight);
  let pr = Math.max(1, opts.pixelRatio);

  let cw = w0 * pr;
  let ch = h0 * pr;
  let scaleFactor = 1;
  const reasons: string[] = [];

  if (Math.max(cw, ch) > maxEdge) {
    const s = maxEdge / Math.max(cw, ch);
    scaleFactor *= s;
    cw *= s;
    ch *= s;
    reasons.push('edge');
  }
  if (cw * ch > maxPixels) {
    const s = Math.sqrt(maxPixels / (cw * ch));
    scaleFactor *= s;
    cw *= s;
    ch *= s;
    reasons.push('pixels');
  }
  // Prefer reducing devicePixelRatio before shrinking CSS scale when possible
  if (pr > 1 && scaleFactor < 1) {
    const need = scaleFactor;
    const newPr = Math.max(1, pr * need);
    if (newPr < pr) {
      pr = newPr;
      // Recompute: absorb into pixelRatio; keep CSS scale = 1 when PR alone suffices
      const trialW = w0 * pr;
      const trialH = h0 * pr;
      if (Math.max(trialW, trialH) <= maxEdge && trialW * trialH <= maxPixels) {
        return { scaleFactor: 1, pixelRatio: pr, clamped: true, reason: reasons.join('|') || 'dpr' };
      }
    }
  }

  return {
    scaleFactor,
    pixelRatio: pr,
    clamped: scaleFactor < 1 || reasons.length > 0,
    reason: reasons.length ? reasons.join('|') : null,
  };
}
