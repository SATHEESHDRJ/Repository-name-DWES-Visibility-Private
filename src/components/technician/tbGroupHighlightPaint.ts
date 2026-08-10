/**
 * Shared LIVE TB group highlight paint (presentation style only).
 *
 * Callers MUST supply bbox from Match API / verified TB_GROUP (or Demo-only
 * static boxes). This module never embeds schedule/demo coordinates.
 */
import type { TBMarkerGeometry, TBMarkerMatchCandidate } from '../../types/tbMarker';

export type TbGroupHighlightRole = 'source' | 'destination' | 'same';

export type TbGroupBbox = {
  x: number;
  y: number;
  width: number;
  height: number;
  rotation?: number;
};

export const LIVE_TB_SRC_COLOR = '#dc2626';
export const LIVE_TB_DST_COLOR = '#2563eb';

function hexToRgba(hex: string, alpha: number) {
  const h = hex.replace('#', '');
  if (h.length !== 6) return `rgba(100,116,139,${alpha})`;
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

function validBbox(g: Partial<TbGroupBbox> | null | undefined): g is TbGroupBbox {
  if (!g) return false;
  const { x, y, width, height } = g;
  if (typeof x !== 'number' || typeof y !== 'number' || typeof width !== 'number' || typeof height !== 'number') {
    return false;
  }
  if (![x, y, width, height].every(n => Number.isFinite(n))) return false;
  if (width <= 0 || height <= 0) return false;
  if (width > 0.95 || height > 0.95) return false;
  return true;
}

/**
 * Prefer complete physical strip (`strip_bbox`) over a single terminal cell.
 * Never invent coordinates — returns null when no usable group bbox exists.
 */
export function resolveLiveTbPaintBbox(
  candidate: TBMarkerMatchCandidate | null | undefined,
): TbGroupBbox | null {
  if (!candidate?.geometry) return null;
  const g = candidate.geometry as TBMarkerGeometry & {
    paint_mode?: string;
    strip_bbox?: TbGroupBbox | null;
    stripBbox?: TbGroupBbox | null;
  };

  const strip = g.strip_bbox || g.stripBbox;
  if (validBbox(strip)) {
    return {
      x: strip.x,
      y: strip.y,
      width: strip.width,
      height: strip.height,
      rotation: strip.rotation ?? g.rotation,
    };
  }

  // Do not paint a tiny terminal-cell oval as the primary LIVE TB location.
  if (g.paint_mode === 'terminal_cell') {
    return null;
  }

  if (validBbox(g)) {
    return {
      x: g.x,
      y: g.y,
      width: g.width,
      height: g.height,
      rotation: g.rotation,
    };
  }
  return null;
}

export function liveTbGroupLabel(role: TbGroupHighlightRole, header: string): string {
  const h = String(header || '').trim() || '—';
  if (role === 'same') return `SRC + DST · ${h}`;
  if (role === 'destination') return `DST · ${h}`;
  return `SRC · ${h}`;
}

type PaintOpts = {
  host: HTMLElement;
  bbox: TbGroupBbox;
  role: TbGroupHighlightRole;
  header: string;
  /** DOM attribute name for overlay nodes (real vs demo). */
  attrName: string;
  /** Optional explicit label; defaults from role+header. */
  label?: string;
  zIndex?: number;
};

/**
 * Paint a rounded rectangle sized to the physical TB strip bbox.
 * role=same → red inner + blue outer.
 */
export function paintTbGroupHighlight(opts: PaintOpts): { bbox: TbGroupBbox; label: string } | null {
  const { host, bbox, role, header, attrName } = opts;
  if (!validBbox(bbox)) return null;

  const { x, y, width, height } = bbox;
  const stroke = role === 'destination' ? LIVE_TB_DST_COLOR : LIVE_TB_SRC_COLOR;
  const dualStroke = role === 'same' ? LIVE_TB_DST_COLOR : undefined;
  const label = opts.label || liveTbGroupLabel(role, header);
  const z = opts.zIndex ?? 5;
  const cx = x + width / 2;
  const rx = Math.min(0.012, Math.max(0.004, width * 0.35));
  const ry = Math.min(0.012, Math.max(0.004, height * 0.12));

  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute(attrName, role);
  svg.setAttribute('viewBox', '0 0 1 1');
  svg.setAttribute('preserveAspectRatio', 'none');
  svg.classList.add('live-tb-overlay', 'live-tb-overlay--group');
  Object.assign(svg.style, {
    position: 'absolute',
    left: '0',
    top: '0',
    width: '100%',
    height: '100%',
    pointerEvents: 'none',
    overflow: 'visible',
    zIndex: String(z),
  });

  const addRect = (
    pad: number,
    strokeColor: string,
    fillAlpha: number,
    strokeWidth: string,
  ) => {
    const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    rect.setAttribute('x', String(Math.max(0, x - pad)));
    rect.setAttribute('y', String(Math.max(0, y - pad)));
    rect.setAttribute('width', String(width + pad * 2));
    rect.setAttribute('height', String(height + pad * 2));
    rect.setAttribute('rx', String(rx + pad * 0.5));
    rect.setAttribute('ry', String(ry + pad * 0.5));
    if (bbox.rotation) {
      rect.setAttribute('transform', `rotate(${bbox.rotation} ${cx} ${y + height / 2})`);
    }
    rect.setAttribute('fill', fillAlpha > 0 ? hexToRgba(strokeColor, fillAlpha) : 'none');
    rect.setAttribute('stroke', strokeColor);
    rect.setAttribute('stroke-width', strokeWidth);
    rect.setAttribute('vector-effect', 'non-scaling-stroke');
    svg.appendChild(rect);
    return rect;
  };

  if (dualStroke) {
    addRect(0.006, dualStroke, 0, '3.5');
    const inner = addRect(0, stroke, 0.16, '3');
    inner.style.filter = `drop-shadow(0 0 3px ${hexToRgba(stroke, 0.45)})`;
  } else {
    addRect(0.004, stroke, 0, '1.5').setAttribute('stroke-opacity', '0.45');
    const main = addRect(0, stroke, 0.18, '3.5');
    main.style.filter = `drop-shadow(0 0 4px ${hexToRgba(stroke, 0.5)})`;
  }

  const tag = document.createElement('div');
  tag.setAttribute(attrName, `${role}-label`);
  tag.className = 'live-tb-overlay-label';
  tag.textContent = label;
  Object.assign(tag.style, {
    position: 'absolute',
    left: `${cx * 100}%`,
    top: `${Math.max(0, y) * 100}%`,
    transform: 'translate(-50%, -125%)',
    pointerEvents: 'none',
    zIndex: String(z + 1),
    fontSize: '11px',
    fontWeight: '800',
    lineHeight: '1.2',
    padding: '2px 8px',
    borderRadius: '999px',
    color: '#fff',
    background: dualStroke
      ? 'linear-gradient(90deg, #dc2626 0%, #dc2626 50%, #2563eb 50%, #2563eb 100%)'
      : stroke,
    whiteSpace: 'nowrap',
    boxShadow: '0 1px 4px rgba(0,0,0,0.4)',
  });

  if (getComputedStyle(host).position === 'static') host.style.position = 'relative';
  host.appendChild(svg);
  host.appendChild(tag);
  return { bbox, label };
}

export function bboxToFocusRegion(bbox: TbGroupBbox, pad = 0.02) {
  return {
    x: Math.max(0, bbox.x - pad),
    y: Math.max(0, bbox.y - pad),
    width: Math.min(1, bbox.width + pad * 2),
    height: Math.min(1, bbox.height + pad * 2),
  };
}
