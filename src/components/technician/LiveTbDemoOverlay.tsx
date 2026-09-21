/**
 * ================================================================
 * DEMO ONLY — PRESENTATION VISUALIZATION
 * DO NOT USE FOR LIVE TB MATCHING
 * DO NOT USE FOR ACCEPTANCE
 * DO NOT PERSIST THESE COORDINATES
 * ================================================================
 *
 * Frontend-only Director presentation overlays. Never calls Match API,
 * analysis, OCR, LocateAnything, or writes TB markers / DB.
 *
 * Geometry is page-normalized on E01_R1.pdf page 2 physical TB banks
 * (LEFT SIDE X9 + RIGHT SIDE XTA-1), visually confirmed. Never paint
 * table/legend/equipment/FRONT VIEW.
 */
import { useEffect, useState } from 'react';
import { paintTbGroupHighlight } from './tbGroupHighlightPaint';

export type LiveTbDemoScenario = 'dual' | 'same_header';

/** Page-normalized (0–1) presentation boxes — not real TB_GROUP data. */
type DemoBox = {
  page: number;
  x: number;
  y: number;
  width: number;
  height: number;
  label: string;
  /** Visible physical TB header on the drawing (not invented). */
  header: string;
  role: 'source' | 'destination' | 'same';
};

/**
 * E01_R1 page 2 — physical vertical TB banks only (visually confirmed).
 * SRC · X9     = LEFT SIDE long ~70-terminal strip.
 * DST · XTA-1  = RIGHT SIDE physical strip (not the device-ref table).
 * Presentation-only — not acceptance / Match geometry.
 */
const DEMO_DUAL: DemoBox[] = [
  {
    page: 2,
    x: 0.175,
    y: 0.254,
    width: 0.032,
    height: 0.157,
    label: 'SRC · X9',
    header: 'X9',
    role: 'source',
  },
  {
    page: 2,
    x: 0.482,
    y: 0.395,
    width: 0.030,
    height: 0.060,
    label: 'DST · XTA-1',
    header: 'XTA-1',
    role: 'destination',
  },
];

const DEMO_SAME: DemoBox[] = [
  {
    page: 2,
    x: 0.175,
    y: 0.254,
    width: 0.032,
    height: 0.157,
    label: 'SRC + DST · X9',
    header: 'X9',
    role: 'same',
  },
];

/** False only when no validated physical strip exists for this demo GA. */
export const DEMO_HAS_PHYSICAL_TB = DEMO_DUAL.length > 0;

/** Demo wire-chip copy — headers must match overlay geometry. */
export const LIVE_TB_DEMO_WIRE = {
  dual: {
    wireId: 'DEMO-001',
    sourceHeader: 'X9',
    sourceTerminal: '18',
    destHeader: 'XTA-1',
    destTerminal: '12',
  },
  same_header: {
    wireId: 'DEMO-001',
    sourceHeader: 'X9',
    sourceTerminal: '12',
    destHeader: 'X9',
    destTerminal: '16',
  },
} as const;

const DEMO_ATTR = 'data-live-tb-demo-overlay';

function clearDemo(root: HTMLElement) {
  root.querySelectorAll(`[${DEMO_ATTR}]`).forEach(n => n.remove());
}

function centerInPdfViewport(target: HTMLElement) {
  const viewport = target.closest('.pdf-viewer')?.querySelector<HTMLElement>('.pdf-viewer-viewport');
  if (!viewport) {
    target.scrollIntoView({ block: 'center', inline: 'center' });
    return;
  }
  const tr = target.getBoundingClientRect();
  const vr = viewport.getBoundingClientRect();
  const nextLeft = viewport.scrollLeft + (tr.left + tr.width / 2) - (vr.left + vr.width / 2);
  const nextTop = viewport.scrollTop + (tr.top + tr.height / 2) - (vr.top + vr.height / 2);
  viewport.scrollTo({
    left: Math.max(0, nextLeft),
    top: Math.max(0, nextTop),
    behavior: 'auto',
  });
}

type Props = {
  active: boolean;
  scenario: LiveTbDemoScenario;
  containerRef: React.RefObject<HTMLElement | null>;
  paintToken?: string | number;
};

export default function LiveTbDemoOverlay({
  active,
  scenario,
  containerRef,
  paintToken,
}: Props) {
  const [ready, setReady] = useState(false);
  const boxes = scenario === 'same_header' ? DEMO_SAME : DEMO_DUAL;
  const hasPhysical = DEMO_HAS_PHYSICAL_TB && boxes.length > 0;

  useEffect(() => {
    const root = containerRef.current;
    if (!root || !active) {
      if (root) clearDemo(root);
      setReady(false);
      return;
    }

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
        clearDemo(root);

        if (!hasPhysical) {
          setReady(true);
          return;
        }

        const hostForPage = (pageNum: number) => {
          if (pdfPages.length) {
            return root.querySelector<HTMLElement>(`.pdf-viewer-page[data-page="${pageNum}"]`);
          }
          return imageStage;
        };

        let firstHost: HTMLElement | null = null;
        let firstTag: HTMLElement | null = null;
        for (const box of boxes) {
          const host = hostForPage(box.page) || imageStage;
          if (!host) continue;
          if (!firstHost) firstHost = host;
          paintTbGroupHighlight({
            host,
            bbox: { x: box.x, y: box.y, width: box.width, height: box.height },
            role: box.role,
            header: box.header,
            label: box.label,
            attrName: DEMO_ATTR,
            zIndex: 8,
          });
          if (!firstTag) {
            firstTag = host.querySelector<HTMLElement>(`[${DEMO_ATTR}="${box.role}-label"]`);
          }
        }

        // Demo-only: centre physical strip in the PDF viewport after focusRegion settles.
        const scrollTarget = firstTag || firstHost;
        if (scrollTarget) {
          requestAnimationFrame(() => {
            centerInPdfViewport(scrollTarget);
            window.setTimeout(() => centerInPdfViewport(scrollTarget), 450);
          });
        }
        setReady(true);
      } finally {
        painting = false;
        mo?.observe(root, { childList: true, subtree: true });
      }
    };

    mo = new MutationObserver(() => paint());
    paint();
    return () => {
      mo?.disconnect();
      clearDemo(root);
    };
  }, [active, scenario, containerRef, paintToken, hasPhysical, boxes]);

  if (!active) return null;

  return (
    <div className="live-tb-demo-chrome" aria-hidden={!ready}>
      {hasPhysical ? (
        <div className="live-tb-demo-legend" role="note">
          <span className="live-tb-demo-legend__src"><i /> RED = SOURCE</span>
          <span className="live-tb-demo-legend__dst"><i /> BLUE = DESTINATION</span>
        </div>
      ) : (
        <div className="live-tb-demo-empty" role="status">
          No physical TB group is shown on this drawing page.
          Select the Internal/Rear TB view for the visual demonstration.
        </div>
      )}
    </div>
  );
}

/** Exported for report / screenshot tooling — not for matching. */
export const LIVE_TB_DEMO_GEOMETRY = {
  dual: DEMO_DUAL,
  same_header: DEMO_SAME,
  hasPhysicalTb: DEMO_HAS_PHYSICAL_TB,
};
