/**
 * Mirrors resolveLiveTbPaintBbox from tbGroupHighlightPaint.ts for node:test.
 * Prefer strip_bbox; never paint terminal_cell as primary LIVE TB outline.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

function validBbox(g) {
  if (!g) return false;
  const { x, y, width, height } = g;
  if (![x, y, width, height].every((n) => typeof n === 'number' && Number.isFinite(n))) return false;
  if (width <= 0 || height <= 0) return false;
  if (width > 0.95 || height > 0.95) return false;
  return true;
}

function resolveLiveTbPaintBbox(candidate) {
  if (!candidate?.geometry) return null;
  const g = candidate.geometry;
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
  if (g.paint_mode === 'terminal_cell') return null;
  if (validBbox(g)) {
    return { x: g.x, y: g.y, width: g.width, height: g.height, rotation: g.rotation };
  }
  return null;
}

function liveTbGroupLabel(role, header) {
  const h = String(header || '').trim() || '—';
  if (role === 'same') return `SRC + DST · ${h}`;
  if (role === 'destination') return `DST · ${h}`;
  return `SRC · ${h}`;
}

test('prefer strip_bbox over terminal cell for X9 / 18', () => {
  const bbox = resolveLiveTbPaintBbox({
    tb_number: 'X9',
    geometry: {
      x: 0.18,
      y: 0.30,
      width: 0.01,
      height: 0.01,
      paint_mode: 'terminal_cell',
      strip_bbox: { x: 0.175, y: 0.254, width: 0.032, height: 0.157 },
    },
  });
  assert.deepEqual(bbox, {
    x: 0.175,
    y: 0.254,
    width: 0.032,
    height: 0.157,
    rotation: undefined,
  });
});

test('terminal_cell alone does not produce a paint bbox', () => {
  const bbox = resolveLiveTbPaintBbox({
    tb_number: 'X9',
    geometry: {
      x: 0.18,
      y: 0.30,
      width: 0.01,
      height: 0.01,
      paint_mode: 'terminal_cell',
    },
  });
  assert.equal(bbox, null);
});

test('header_group geometry paints complete strip', () => {
  const bbox = resolveLiveTbPaintBbox({
    tb_number: 'XTA-1',
    geometry: {
      x: 0.482,
      y: 0.395,
      width: 0.03,
      height: 0.06,
      paint_mode: 'header_group',
    },
  });
  assert.equal(bbox?.width, 0.03);
  assert.equal(bbox?.height, 0.06);
});

test('X9/12 and X9/16 share one header label style', () => {
  assert.equal(liveTbGroupLabel('same', 'X9'), 'SRC + DST · X9');
  assert.equal(liveTbGroupLabel('source', 'X9'), 'SRC · X9');
  assert.equal(liveTbGroupLabel('destination', 'XTA-1'), 'DST · XTA-1');
});

test('no geometry → no circle', () => {
  assert.equal(resolveLiveTbPaintBbox(null), null);
  assert.equal(resolveLiveTbPaintBbox({ geometry: {} }), null);
});

/* ── Header group contract: NEVER naked terminal_cell ─────────────────────── */

test('terminal_cell with strip_bbox → uses strip (never naked cell)', () => {
  const bbox = resolveLiveTbPaintBbox({
    tb_number: 'X1A',
    geometry: {
      x: 0.21, y: 0.21, width: 0.02, height: 0.015,
      paint_mode: 'terminal_cell',
      strip_bbox: { x: 0.2, y: 0.2, width: 0.04, height: 0.03 },
    },
  });
  assert.deepEqual(bbox, {
    x: 0.2, y: 0.2, width: 0.04, height: 0.03,
    rotation: undefined,
  });
});

test('paint_mode header_group with strip_bbox always paints strip', () => {
  const bbox = resolveLiveTbPaintBbox({
    tb_number: 'X9',
    geometry: {
      x: 0.175, y: 0.254, width: 0.032, height: 0.157,
      paint_mode: 'header_group',
      strip_bbox: { x: 0.175, y: 0.254, width: 0.032, height: 0.157 },
    },
  });
  assert.ok(bbox, 'header_group should always produce a bbox');
  assert.equal(bbox.width, 0.032);
  assert.equal(bbox.height, 0.157);
});

test('naked terminal_cell without strip_bbox → null (never paint cell alone)', () => {
  const bbox = resolveLiveTbPaintBbox({
    tb_number: 'X1A',
    geometry: {
      x: 0.21, y: 0.21, width: 0.02, height: 0.015,
      paint_mode: 'terminal_cell',
    },
  });
  assert.equal(bbox, null, 'must not paint naked terminal cell');
});

/* ── Transform / page-nav contract ────────────────────────────────────────── */

test('normalized bbox with page attribute preserved', () => {
  const candidate = {
    tb_number: 'X5A-C',
    page_number: 3,
    geometry: {
      x: 0.1, y: 0.1, width: 0.08, height: 0.12,
      paint_mode: 'header_group',
      strip_bbox: { x: 0.1, y: 0.1, width: 0.08, height: 0.12 },
    },
  };
  const bbox = resolveLiveTbPaintBbox(candidate);
  assert.ok(bbox);
  assert.equal(candidate.page_number, 3);
  assert.equal(bbox.x, 0.1);
  assert.equal(bbox.width, 0.08);
});
