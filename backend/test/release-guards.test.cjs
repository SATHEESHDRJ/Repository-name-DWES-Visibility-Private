// Release-readiness guards: DEMO_MODE-off 404s and inactive-technician assignment rejection.
const test = require('node:test');
const assert = require('node:assert/strict');
const { NotFoundException, BadRequestException } = require('@nestjs/common');
const { AuthController } = require('../dist/auth/auth.controller');
const { TechService } = require('../dist/tech/tech.service');
const { MockStore } = require('../dist/data/mock-store');

// ── DEMO_MODE off → dev demo endpoints must 404 ────────────────────────────────
test('auth dev demo endpoints return 404 when DEMO_MODE is disabled', async () => {
  const saved = process.env.DEMO_MODE;
  process.env.DEMO_MODE = 'false';
  try {
    const controller = new AuthController({}, {});
    await assert.rejects(async () => controller.demoRoles(), err => err instanceof NotFoundException);
    await assert.rejects(
      () => controller.demoLogin({ username: 'anyone' }, { ip: '127.0.0.1' }),
      err => err instanceof NotFoundException,
    );
  } finally {
    if (saved === undefined) delete process.env.DEMO_MODE;
    else process.env.DEMO_MODE = saved;
  }
});

// ── deactivated technicians cannot receive assignments ─────────────────────────
test('TechService.assignFrame rejects a deactivated technician before any write', async () => {
  const frame = { id: 'frame_inactive', project_code: 'PRJ_INACTIVE', panel_name: '=H900', cable_count: 1, cables: [{}] };
  MockStore.frames.push(frame);
  let writes = 0;
  try {
    const prisma = {
      users: { findUnique: async () => ({ id: 99, role: 'wiring_technician', is_active: false }) },
      tech_assignments: {
        findFirst: async () => null,
        create: async () => { writes += 1; return {}; },
      },
      tech_audit_log: { create: async () => { writes += 1; return {}; } },
    };
    prisma.$transaction = async cb => cb(prisma);
    const service = new TechService(prisma);
    await assert.rejects(
      () => service.assignFrame({ project_code: 'PRJ_INACTIVE', frame_id: 'frame_inactive', technician_id: 99, assigned_by_id: 1 }),
      err => err instanceof BadRequestException && err.message.includes('deactivated'),
    );
    assert.equal(writes, 0);
  } finally {
    MockStore.frames = MockStore.frames.filter(item => item !== frame);
  }
});
