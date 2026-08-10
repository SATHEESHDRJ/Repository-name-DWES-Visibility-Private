const test = require('node:test');
const assert = require('node:assert/strict');
const { BadRequestException, ConflictException, ForbiddenException } = require('@nestjs/common');

const { TbMarkersService } = require('../dist/tb-markers/tb-markers.service');
const { TbMarkerMatchService } = require('../dist/tb-markers/tb-marker-match.service');
const {
  parseTerminalRange,
  isTerminalInRange,
} = require('../dist/tb-markers/terminal-range');

function makeUser(partial) {
  return {
    id: partial.id ?? 1,
    role: partial.role,
  };
}

function makePrisma(seed = {}) {
  const markers = new Map(); // id -> marker
  const projects = new Map(); // code -> {code}
  const techAssignments = []; // list of {project_code, frame_id, technician_id}
  const drawingAssets = new Map(); // id -> {id, project_code, frame_id}
  const history = [];

  let nextMarkerId = 1;
  let nextHistoryId = 1;

  for (const p of seed.projects || []) projects.set(p.code, p);
  for (const a of seed.tech_assignments || []) techAssignments.push(a);
  for (const a of seed.drawing_assets || []) drawingAssets.set(a.id, a);

  for (const m of seed.tb_markers || []) {
    const id = m.id ?? nextMarkerId++;
    nextMarkerId = Math.max(nextMarkerId, id + 1);
    markers.set(id, { id, ...m });
  }

  const tb_markers = {
    findMany: async ({ where = {}, select } = {}) => {
      const result = [];
      for (const m of markers.values()) {
        if (where.id && typeof where.id === 'object' && where.id.not != null) {
          if (m.id === where.id.not) continue;
        } else if (where.id != null) {
          if (m.id !== where.id) continue;
        }

        if (where.project_code != null && m.project_code !== where.project_code) continue;
        if (where.frame_id != null && m.frame_id !== where.frame_id) continue;
        if (where.marker_type != null && m.marker_type !== where.marker_type) continue;
        if (where.tb_number != null && m.tb_number !== where.tb_number) continue;
        if (where.terminal_group != null && m.terminal_group !== where.terminal_group) continue;
        if (where.page_number != null && m.page_number !== where.page_number) continue;

        if ('drawing_asset_id' in where) {
          if (m.drawing_asset_id !== where.drawing_asset_id) continue;
        }

        // Minimal support for our tests' select usage.
        if (select) {
          const out = {};
          for (const k of Object.keys(select)) {
            if (select[k]) out[k] = m[k];
          }
          result.push(out);
        } else {
          result.push(m);
        }
      }
      return result;
    },

    findUnique: async ({ where }) => {
      if (!where || where.id == null) return null;
      return markers.get(where.id) ?? null;
    },

    create: async ({ data }) => {
      const id = nextMarkerId++;
      const row = {
        id,
        created_at: new Date(),
        updated_at: new Date(),
        ...data,
      };
      markers.set(id, row);
      return row;
    },

    update: async ({ where, data }) => {
      const cur = markers.get(where.id);
      if (!cur) throw Object.assign(new Error('missing'), { code: 'P2025' });
      const next = { ...cur, ...data, updated_at: new Date() };
      markers.set(where.id, next);
      return next;
    },

    delete: async ({ where }) => {
      markers.delete(where.id);
      return {};
    },
  };

  return {
    tb_markers,
    tb_marker_history: {
      create: async ({ data }) => {
        const row = { id: nextHistoryId++, created_at: new Date(), ...data };
        history.push(row);
        return row;
      },
    },
    drawing_assets: {
      findUnique: async ({ where, select } = {}) => {
        const asset = drawingAssets.get(where.id);
        if (!asset) return null;
        if (select) {
          const out = {};
          for (const k of Object.keys(select)) if (select[k]) out[k] = asset[k];
          return out;
        }
        return asset;
      },
    },
    projects: {
      findFirst: async ({ where, select } = {}) => {
        const code = where?.code;
        const p = projects.get(code);
        if (!p) return null;
        if (select) {
          const out = {};
          for (const k of Object.keys(select)) if (select[k]) out[k] = p[k];
          return out;
        }
        return p;
      },
    },
    tech_assignments: {
      findFirst: async ({ where } = {}) => {
        const hit = techAssignments.find(a => (
          a.project_code === where.project_code
          && a.frame_id === where.frame_id
          && a.technician_id === where.technician_id
        ));
        return hit ? { id: hit.id ?? 1 } : null;
      },
    },
    __history: history,
  };
}

test('Terminal range parsing + inclusion', async () => {
  const p1 = parseTerminalRange('5-10');
  assert.equal(p1.type, 'numeric_range');
  assert.equal(p1.start, 5);
  assert.equal(p1.end, 10);

  const p2 = parseTerminalRange('5 to 10');
  assert.equal(p2.type, 'numeric_range');
  assert.equal(p2.start, 5);
  assert.equal(p2.end, 10);

  const p3 = parseTerminalRange('1..12');
  assert.equal(p3.type, 'numeric_range');
  assert.equal(p3.start, 1);
  assert.equal(p3.end, 12);

  const p4 = parseTerminalRange('A1-A8');
  assert.equal(p4.type, 'alpha_range');
  assert.equal(p4.prefix, 'A');
  assert.equal(p4.start, 1);
  assert.equal(p4.end, 8);

  assert.equal(isTerminalInRange('7', '5-10'), true);
  assert.equal(isTerminalInRange('11', '5-10'), false);
  assert.equal(isTerminalInRange('A5', 'A1-A8'), true);
  assert.equal(isTerminalInRange('B5', 'A1-A8'), false);
  assert.equal(isTerminalInRange('A1', 'A1'), true);
});

test('TB markers CRUD + geometry validation + history', async () => {
  const projectCode = 'P1';
  const frameId = 'F1';

  const prisma = makePrisma({
    projects: [{ code: projectCode, is_active: true }],
  });
  const svc = new TbMarkersService(prisma);

  const supervisor = makeUser({ id: 10, role: 'prod_supervisor' });

  await assert.rejects(() => svc.createMarker({
    project_code: projectCode,
    frame_id: frameId,
    marker_type: 'SOURCE_GROUP',
    tb_number: 'TB1',
    terminal_group: '5-10',
    geometry: { x: -0.1, y: 0.1, width: 0.2, height: 0.2 },
  }, supervisor), (err) => {
    assert.ok(err instanceof BadRequestException);
    assert.match(err.message, /Geometry x\/y must be within/);
    return true;
  });

  const created = await svc.createMarker({
    project_code: projectCode,
    frame_id: frameId,
    marker_type: 'SOURCE_GROUP',
    tb_number: 'TB 1',
    terminal_group: '5 to 10',
    page_number: 1,
    geometry: { x: 0.1, y: 0.2, width: 0.2, height: 0.1, rotation: 0 },
    notes: 'n1',
    view_name: 'front',
  }, supervisor);

  assert.equal(created.tb_number, 'TB1');
  assert.equal(created.terminal_group, '5-10');
  assert.equal(prisma.__history.length, 1);
  assert.equal(prisma.__history[0].event_type, 'tb_marker_created');

  const updated = await svc.updateMarker(created.id, {
    notes: 'n2',
    geometry: { x: 0.2, y: 0.3, width: 0.2, height: 0.1, rotation: 0 },
  }, supervisor);

  assert.equal(updated.notes, 'n2');
  assert.equal(updated.geometry.x, 0.2);
  assert.ok(prisma.__history.length >= 2, 'update should add history rows');

  await svc.deleteMarker(created.id, supervisor);
  assert.ok(prisma.__history.some(h => h.event_type === 'tb_marker_deleted'));
});

test('Near-duplicate detection requires confirmation', async () => {
  const prisma = makePrisma({
    projects: [{ code: 'P1', is_active: true }],
  });
  const svc = new TbMarkersService(prisma);
  const supervisor = makeUser({ id: 10, role: 'prod_supervisor' });

  const m1 = await svc.createMarker({
    project_code: 'P1',
    frame_id: 'F1',
    marker_type: 'SOURCE_GROUP',
    tb_number: 'TB1',
    terminal_group: '5-10',
    page_number: 1,
    geometry: { x: 0.1, y: 0.1, width: 0.2, height: 0.1, rotation: 0 },
  }, supervisor);

  await assert.rejects(() => svc.createMarker({
    project_code: 'P1',
    frame_id: 'F1',
    marker_type: 'SOURCE_GROUP',
    tb_number: 'TB1',
    terminal_group: '5-10',
    page_number: 1,
    geometry: { x: 0.11, y: 0.105, width: 0.19, height: 0.09, rotation: 0 },
  }, supervisor), (err) => {
    assert.ok(err instanceof ConflictException);
    assert.equal(err?.response?.code, 'NEAR_DUPLICATE');
    return true;
  });

  const m2 = await svc.createMarker({
    project_code: 'P1',
    frame_id: 'F1',
    marker_type: 'SOURCE_GROUP',
    tb_number: 'TB1',
    terminal_group: '5-10',
    page_number: 1,
    geometry: { x: 0.11, y: 0.105, width: 0.19, height: 0.09, rotation: 0 },
    confirm_near_duplicate: true,
  }, supervisor);

  assert.ok(m2.id > m1.id);
});

test('Technician cannot create markers (permission)', async () => {
  const prisma = makePrisma({
    projects: [{ code: 'P1', is_active: true }],
    tech_assignments: [{ project_code: 'P1', frame_id: 'F1', technician_id: 55, id: 999 }],
  });
  const svc = new TbMarkersService(prisma);

  const technician = makeUser({ id: 55, role: 'wiring_technician' });

  await assert.rejects(() => svc.createMarker({
    project_code: 'P1',
    frame_id: 'F1',
    marker_type: 'SOURCE_GROUP',
    tb_number: 'TB1',
    terminal_group: '5-10',
    geometry: { x: 0.1, y: 0.1, width: 0.2, height: 0.1, rotation: 0 },
  }, technician), (err) => {
    assert.ok(err instanceof ForbiddenException);
    assert.match(err.message, /Not authorized to create markers/);
    return true;
  });
});

test('TB marker matching: header-group paint; prefer exact terminal when present', async () => {
  const prisma = makePrisma({
    tb_markers: [
      {
        id: 1,
        project_code: 'P1',
        frame_id: 'F1',
        marker_type: 'TB_GROUP',
        tb_number: 'X1A',
        terminal_group: '5-10',
        page_number: 1,
        view_name: 'REAR_WIRING_VIEW',
        geometry: {
          x: 0.1, y: 0.1, width: 0.08, height: 0.12, rotation: 0,
          strip_bbox: { x: 0.1, y: 0.1, width: 0.08, height: 0.12 },
          view_classification: 'PHYSICAL_TB_BANK',
        },
        drawing_checksum: 'sha-current',
        marker_status: 'ACTIVE',
      },
      {
        id: 2,
        project_code: 'P1',
        frame_id: 'F1',
        marker_type: 'SOURCE_GROUP',
        tb_number: 'X1A',
        terminal_group: '7',
        page_number: 2,
        view_name: 'REAR_WIRING_VIEW',
        geometry: {
          x: 0.2, y: 0.2, width: 0.04, height: 0.03, rotation: 0,
          strip_bbox: { x: 0.2, y: 0.2, width: 0.04, height: 0.03 },
          view_classification: 'PHYSICAL_TB_BANK',
          terminal_cells: { '7': { x: 0.21, y: 0.21, width: 0.02, height: 0.015 } },
        },
        drawing_checksum: 'sha-current',
        marker_status: 'ACTIVE',
      },
      {
        id: 3,
        project_code: 'P1',
        frame_id: 'F1',
        marker_type: 'DESTINATION_GROUP',
        tb_number: 'X2B',
        terminal_group: '3',
        page_number: 1,
        view_name: 'INTERNAL_VIEW',
        geometry: {
          x: 0.3, y: 0.3, width: 0.06, height: 0.1, rotation: 0,
          strip_bbox: { x: 0.3, y: 0.3, width: 0.06, height: 0.1 },
          view_classification: 'INTERNAL_VIEW',
        },
        drawing_checksum: 'sha-current',
        marker_status: 'ACTIVE',
      },
      {
        id: 4,
        project_code: 'P1',
        frame_id: 'F1',
        marker_type: 'TB_GROUP',
        tb_number: 'X329',
        terminal_group: 'UNVERIFIED',
        page_number: 1,
        view_name: 'REAR_WIRING_VIEW',
        geometry: {
          x: 0.55, y: 0.4, width: 0.05, height: 0.08, rotation: 0,
          strip_bbox: { x: 0.55, y: 0.4, width: 0.05, height: 0.08 },
          view_classification: 'REAR_WIRING_VIEW',
        },
        drawing_checksum: 'sha-current',
        marker_status: 'ACTIVE',
      },
      {
        id: 5,
        project_code: 'P1',
        frame_id: 'F1',
        marker_type: 'TB_GROUP',
        tb_number: 'X9',
        terminal_group: '1-70',
        page_number: 2,
        view_name: 'REAR_WIRING_VIEW',
        geometry: {
          x: 0.175, y: 0.254, width: 0.032, height: 0.157, rotation: 0,
          strip_bbox: { x: 0.175, y: 0.254, width: 0.032, height: 0.157 },
          view_classification: 'PHYSICAL_TB_BANK',
        },
        drawing_checksum: 'sha-current',
        marker_status: 'ACTIVE',
      },
    ],
  });

  const matchSvc = new TbMarkerMatchService(prisma);
  const supervisor = makeUser({ id: 10, role: 'prod_supervisor' });

  const res1 = await matchSvc.matchWireEndpoints(
    'P1',
    'F1',
    { device: 'X1A', terminal: '7' },
    { device: 'X2B', terminal: '3' },
    supervisor,
    'sha-current',
  );

  assert.equal(res1.source_unmatched, false);
  assert.equal(res1.destination_unmatched, false);
  assert.equal(res1.best_source?.id, 2, 'exact terminal / cell marker should win');
  assert.equal(res1.best_destination?.id, 3);
  assert.equal(res1.best_source?.geometry?.paint_mode, 'terminal_cell');
  assert.equal(res1.best_destination?.geometry?.paint_mode, 'header_group');

  const res2 = await matchSvc.matchWireEndpoints(
    'P1',
    'F1',
    { device: 'X1A', terminal: '8' },
    { device: 'X2B', terminal: '9' }, // terminal outside group 3 — still header-group match
    supervisor,
    'sha-current',
  );

  assert.equal(res2.source_unmatched, false);
  assert.equal(res2.destination_unmatched, false, 'header-group match does not require exact terminal');
  assert.equal(res2.best_source?.id, 1, 'range/header inclusion should match 5-10 strip');
  assert.equal(res2.best_destination?.id, 3);
  assert.equal(res2.best_destination?.geometry?.paint_mode, 'header_group');
  assert.equal(res2.same_physical_group, false, 'different TB headers are not same_physical_group');

  // Same physical TB both ends (X329/12 → X329/16 style)
  const resSame = await matchSvc.matchWireEndpoints(
    'P1',
    'F1',
    { device: 'X329', terminal: '12' },
    { device: 'X329', terminal: '16' },
    supervisor,
    'sha-current',
  );
  assert.equal(resSame.source_unmatched, false);
  assert.equal(resSame.destination_unmatched, false);
  assert.equal(resSame.best_source?.id, 4);
  assert.equal(resSame.best_destination?.id, 4);
  assert.equal(resSame.same_physical_group, true, 'both ends on same marker/tb+page+geom');
  assert.equal(resSame.best_source?.geometry?.paint_mode, 'header_group');
  assert.equal(resSame.best_destination?.geometry?.paint_mode, 'header_group');
  assert.ok(resSame.best_source?.geometry?.strip_bbox, 'strip_bbox present for complete TB group paint');
  assert.equal(resSame.best_source?.geometry?.strip_bbox?.width, 0.05);
  assert.equal(resSame.best_destination?.geometry?.strip_bbox?.height, 0.08);

  // X9 / 12 → X9 / 16 share ONE physical TB_GROUP (not X9/12 and X9/16 groups)
  const resX9 = await matchSvc.matchWireEndpoints(
    'P1',
    'F1',
    { device: 'X9', terminal: '12' },
    { device: 'X9', terminal: '16' },
    supervisor,
    'sha-current',
  );
  assert.equal(resX9.source_unmatched, false);
  assert.equal(resX9.destination_unmatched, false);
  assert.equal(resX9.best_source?.id, 5);
  assert.equal(resX9.best_destination?.id, 5);
  assert.equal(resX9.same_physical_group, true, 'X9/12 and X9/16 map to one X9 TB_GROUP');
  assert.equal(resX9.best_source?.tb_number, 'X9');
  assert.equal(resX9.best_destination?.tb_number, 'X9');
  assert.equal(resX9.best_source?.geometry?.paint_mode, 'header_group');
  assert.deepEqual(resX9.best_source?.geometry?.strip_bbox, {
    x: 0.175, y: 0.254, width: 0.032, height: 0.157, rotation: 0,
  });

  // X9 / 18 also resolves to the same physical X9 group
  const resX918 = await matchSvc.matchWireEndpoints(
    'P1',
    'F1',
    { device: 'X9', terminal: '18' },
    { device: 'X9', terminal: '40' },
    supervisor,
    'sha-current',
  );
  assert.equal(resX918.best_source?.id, 5);
  assert.equal(resX918.best_destination?.id, 5);
  assert.equal(resX918.same_physical_group, true);

  const res3 = await matchSvc.matchWireEndpoints(
    'P1',
    'F1',
    { device: 'X99', terminal: '1' },
    { device: 'X2B', terminal: '3' },
    supervisor,
    'sha-current',
  );
  assert.equal(res3.source_unmatched, true, 'absent TB header stays unmatched');
  assert.equal(res3.destination_unmatched, false);
});

