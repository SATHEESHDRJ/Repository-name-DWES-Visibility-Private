import { useEffect, useRef } from 'react';
import type { TBMarkerGeometry, TBMarkerMatchCandidate } from '../../types/tbMarker';
import { liveTbDebugLog } from '../../utils/liveTbDebugLog';
import {
  bboxToFocusRegion,
  paintTbGroupHighlight,
  resolveLiveTbPaintBbox,
  type TbGroupBbox,
} from './tbGroupHighlightPaint';

export type StatusOverlayGroup = {
  id: number | string;
  page_number: number;
  geometry: TBMarkerGeometry;
  colour: string;
  label: string;
};

/** Normalized page region used to auto-zoom the PDF/image viewer. */
export type LiveTbFocusRegion = {
  page: number;
  x: number;
  y: number;
  width: number;
  height: number;
  token: string | number;
};

type Props = {
  containerRef: React.RefObject<HTMLElement | null>;
  /** Wiring mode: active Source (red). */
  source?: TBMarkerMatchCandidate | null;
  /** Wiring mode: active Destination (blue). */
  destination?: TBMarkerMatchCandidate | null;
  /** Both ends resolve to the same physical TB header group — one dual-stroke outline. */
  samePhysicalGroup?: boolean;
  /** Completion overview: each TB_GROUP once with status colour. */
  statusGroups?: StatusOverlayGroup[] | null;
  paintToken?: string | number;
  /** Fired once per paintToken when a focusable TB region is available. */
  onFocusRegion?: (region: LiveTbFocusRegion | null) => void;
};

const OVERLAY_ATTR = 'data-live-tb-overlay';

function clearOverlays(root: HTMLElement) {
  root.querySelectorAll(`[${OVERLAY_ATTR}]`).forEach(node => node.remove());
}

function isOverlayNode(node: Node): boolean {
  if (!(node instanceof HTMLElement)) return false;
  if (node.hasAttribute(OVERLAY_ATTR)) return true;
  return !!node.closest?.(`[${OVERLAY_ATTR}]`);
}

function hexToRgba(hex: string, alpha: number) {
  const h = hex.replace('#', '');
  if (h.length !== 6) return `rgba(100,116,139,${alpha})`;
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

/** Completion-mode status oval (unchanged compact treatment). */
function appendStatusOval(
  host: HTMLElement,
  geometry: TBMarkerGeometry,
  stroke: string,
  label: string,
  role: string,
): TbGroupBbox | null {
  if (!geometry || geometry.width <= 0 || geometry.height <= 0) return null;
  const bbox: TbGroupBbox = {
    x: geometry.x,
    y: geometry.y,
    width: geometry.width,
    height: geometry.height,
    rotation: geometry.rotation,
  };
  const cx = bbox.x + bbox.width / 2;
  const cy = bbox.y + bbox.height / 2;
  const rx = Math.min(0.026, Math.max(0.011, bbox.width / 2));
  const ry = Math.min(0.022, Math.max(0.009, bbox.height / 2));

  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute(OVERLAY_ATTR, role);
  svg.setAttribute('viewBox', '0 0 1 1');
  svg.setAttribute('preserveAspectRatio', 'none');
  svg.classList.add('live-tb-overlay', 'live-tb-overlay--oval');
  Object.assign(svg.style, {
    position: 'absolute',
    left: '0',
    top: '0',
    width: '100%',
    height: '100%',
    pointerEvents: 'none',
    overflow: 'visible',
    zIndex: '5',
  });

  const ellipse = document.createElementNS('http://www.w3.org/2000/svg', 'ellipse');
  ellipse.setAttribute('cx', String(cx));
  ellipse.setAttribute('cy', String(cy));
  ellipse.setAttribute('rx', String(rx));
  ellipse.setAttribute('ry', String(ry));
  ellipse.setAttribute('fill', hexToRgba(stroke, 0.22));
  ellipse.setAttribute('stroke', stroke);
  ellipse.setAttribute('stroke-width', '3');
  ellipse.setAttribute('vector-effect', 'non-scaling-stroke');
  svg.appendChild(ellipse);

  const tag = document.createElement('div');
  tag.setAttribute(OVERLAY_ATTR, `${role}-label`);
  tag.className = 'live-tb-overlay-label';
  tag.textContent = label;
  Object.assign(tag.style, {
    position: 'absolute',
    left: `${cx * 100}%`,
    top: `${Math.max(0, (cy - ry) * 100)}%`,
    transform: 'translate(-50%, -120%)',
    pointerEvents: 'none',
    zIndex: '6',
    fontSize: '11px',
    fontWeight: '700',
    lineHeight: '1.2',
    padding: '2px 6px',
    borderRadius: '999px',
    color: '#fff',
    background: stroke,
    whiteSpace: 'nowrap',
    boxShadow: '0 1px 3px rgba(0,0,0,0.35)',
  });

  if (getComputedStyle(host).position === 'static') host.style.position = 'relative';
  host.appendChild(svg);
  host.appendChild(tag);
  return bbox;
}

/**
 * Read-only TB group markers. Wiring mode: Source red / Destination blue
 * rounded strip outlines from Match strip_bbox / header group geometry.
 * Completion mode: status-coloured ovals.
 */
export default function DrawingMarkerOverlay({
  containerRef,
  source = null,
  destination = null,
  samePhysicalGroup = false,
  statusGroups = null,
  paintToken,
  onFocusRegion,
}: Props) {
  const focusDone = useRef(false);

  useEffect(() => {
    const root = containerRef.current;
    if (!root) return;
    focusDone.current = false;

    let mo: MutationObserver | null = null;
    let painting = false;

    const paint = () => {
      if (painting) return;
      painting = true;
      mo?.disconnect();
      try {
        const pdfPages = root.querySelectorAll<HTMLElement>('.pdf-viewer-page[data-page]');
        const imageStage = root.querySelector<HTMLElement>('.file-viewer-image-stage, .file-viewer-image');
        if (!pdfPages.length && !imageStage) {
          mo?.observe(root, { childList: true, subtree: true });
          return;
        }

        clearOverlays(root);

        const hostForPage = (pageNum: number) => {
          if (pdfPages.length) {
            return root.querySelector<HTMLElement>(`.pdf-viewer-page[data-page="${pageNum}"]`);
          }
          return imageStage;
        };

        let painted = 0;
        const focusBoxes: Array<{ page: number; bbox: TbGroupBbox }> = [];

        if (statusGroups?.length) {
          statusGroups.forEach(g => {
            const host = hostForPage(g.page_number) || imageStage;
            if (!host) return;
            const bbox = appendStatusOval(host, g.geometry, g.colour || '#64748b', g.label, `status-${g.id}`);
            if (bbox) {
              painted += 1;
              focusBoxes.push({ page: g.page_number || 1, bbox });
            }
          });
        } else {
          const srcBox = resolveLiveTbPaintBbox(source);
          const dstBox = resolveLiveTbPaintBbox(destination);
          const sameTb =
            !!source
            && !!destination
            && String(source.tb_number).toUpperCase() === String(destination.tb_number).toUpperCase();
          const sameGeom =
            !!srcBox
            && !!dstBox
            && srcBox.x === dstBox.x
            && srcBox.y === dstBox.y
            && srcBox.width === dstBox.width
            && srcBox.height === dstBox.height
            && source!.page_number === destination!.page_number;
          const useCombined =
            (samePhysicalGroup || (sameTb && sameGeom))
            && !!source
            && !!destination
            && !!srcBox;

          if (useCombined && source && srcBox) {
            const host = hostForPage(source.page_number) || imageStage;
            if (host) {
              const paintedBox = paintTbGroupHighlight({
                host,
                bbox: srcBox,
                role: 'same',
                header: source.tb_number,
                attrName: OVERLAY_ATTR,
              });
              if (paintedBox) {
                painted += 1;
                focusBoxes.push({ page: source.page_number || 1, bbox: paintedBox.bbox });
              }
            }
          } else {
            if (source && srcBox) {
              const host = hostForPage(source.page_number) || imageStage;
              if (host) {
                const paintedBox = paintTbGroupHighlight({
                  host,
                  bbox: srcBox,
                  role: 'source',
                  header: source.tb_number,
                  attrName: OVERLAY_ATTR,
                });
                if (paintedBox) {
                  painted += 1;
                  focusBoxes.push({ page: source.page_number || 1, bbox: paintedBox.bbox });
                }
              }
            }
            if (destination && dstBox) {
              const host = hostForPage(destination.page_number) || imageStage;
              if (host) {
                const paintedBox = paintTbGroupHighlight({
                  host,
                  bbox: dstBox,
                  role: 'destination',
                  header: destination.tb_number,
                  attrName: OVERLAY_ATTR,
                });
                if (paintedBox) {
                  painted += 1;
                  focusBoxes.push({ page: destination.page_number || 1, bbox: paintedBox.bbox });
                }
              }
            }
          }
        }

        liveTbDebugLog('DrawingMarkerOverlay.tsx:paint', 'Overlay group paint pass', {
          pdfPages: pdfPages.length,
          hasImage: !!imageStage,
          painted,
          hasSrc: !!source,
          hasDst: !!destination,
          srcTb: source?.tb_number ?? null,
          dstTb: destination?.tb_number ?? null,
          srcPage: source?.page_number ?? null,
          dstPage: destination?.page_number ?? null,
          usedStripSrc: !!(source?.geometry as { strip_bbox?: unknown } | undefined)?.strip_bbox,
          usedStripDst: !!(destination?.geometry as { strip_bbox?: unknown } | undefined)?.strip_bbox,
        }, 'D');

        if (!focusDone.current) {
          focusDone.current = true;
          if (focusBoxes.length && onFocusRegion) {
            const primary = focusBoxes[0];
            const box = bboxToFocusRegion(primary.bbox);
            onFocusRegion({
              page: primary.page,
              ...box,
              token: paintToken ?? `${primary.page}-${primary.bbox.x}-${primary.bbox.y}`,
            });
          } else if (onFocusRegion) {
            onFocusRegion(null);
          }
        }

        mo?.observe(root, { childList: true, subtree: true });
      } finally {
        painting = false;
      }
    };

    mo = new MutationObserver((mutations) => {
      const substantive = mutations.some((mutation) => {
        const nodes = [...mutation.addedNodes, ...mutation.removedNodes];
        return nodes.some((n) => {
          if (!(n instanceof HTMLElement)) return false;
          if (isOverlayNode(n)) return false;
          return (
            n.classList.contains('pdf-viewer-page')
            || n.classList.contains('pdf-viewer-pages')
            || n.classList.contains('pdf-viewer-canvas')
            || !!n.querySelector?.('.pdf-viewer-page, .pdf-viewer-canvas, .file-viewer-image-stage')
          );
        });
      });
      if (substantive) paint();
    });

    paint();
    const ro = new ResizeObserver(() => paint());
    ro.observe(root);
    return () => {
      mo?.disconnect();
      ro.disconnect();
      clearOverlays(root);
    };
  }, [containerRef, source, destination, samePhysicalGroup, statusGroups, paintToken, onFocusRegion]);

  return null;
}

/** @deprecated Prefer resolveLiveTbPaintBbox + paintTbGroupHighlight for wiring mode. */
export { resolveLiveTbPaintBbox } from './tbGroupHighlightPaint';
