/**
 * Browser-side canvas budget clamp for oversized scanned PDFs.
 * Page-normalized overlay coordinates stay in original page space.
 */

export const PDF_CANVAS_MAX_EDGE = 8192;
export const PDF_CANVAS_MAX_PIXELS = 16_777_216;

export function clampPdfCanvasRender(opts: {
  viewportWidth: number;
  viewportHeight: number;
  pixelRatio: number;
  maxCanvasEdge?: number;
  maxCanvasPixels?: number;
}): { cssScale: number; pixelRatio: number; clamped: boolean } {
  const maxEdge = opts.maxCanvasEdge ?? PDF_CANVAS_MAX_EDGE;
  const maxPixels = opts.maxCanvasPixels ?? PDF_CANVAS_MAX_PIXELS;
  const w0 = Math.max(1, opts.viewportWidth);
  const h0 = Math.max(1, opts.viewportHeight);
  let pr = Math.max(1, opts.pixelRatio);
  let cssScale = 1;

  let cw = w0 * pr;
  let ch = h0 * pr;

  if (Math.max(cw, ch) > maxEdge || cw * ch > maxPixels) {
    // Prefer lowering devicePixelRatio first
    const edgeScale = maxEdge / Math.max(cw, ch);
    const pixelScale = Math.sqrt(maxPixels / (cw * ch));
    const need = Math.min(1, edgeScale, pixelScale);
    const newPr = Math.max(1, pr * need);
    if (newPr < pr && (w0 * newPr) * (h0 * newPr) <= maxPixels && Math.max(w0 * newPr, h0 * newPr) <= maxEdge) {
      return { cssScale: 1, pixelRatio: newPr, clamped: true };
    }
    cssScale = need;
    pr = Math.max(1, Math.min(pr, 1.5));
    cw = w0 * cssScale * pr;
    ch = h0 * cssScale * pr;
    if (cw * ch > maxPixels || Math.max(cw, ch) > maxEdge) {
      const again = Math.min(
        maxEdge / Math.max(w0 * pr, h0 * pr),
        Math.sqrt(maxPixels / (w0 * pr * h0 * pr)),
      );
      cssScale = Math.min(cssScale, again);
    }
    return { cssScale, pixelRatio: pr, clamped: true };
  }

  return { cssScale: 1, pixelRatio: pr, clamped: false };
}
