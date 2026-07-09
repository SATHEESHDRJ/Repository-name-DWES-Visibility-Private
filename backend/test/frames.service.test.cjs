const test = require('node:test');
const assert = require('node:assert/strict');
const { FramesService } = require('../dist/frames/frames.service');

function prismaForFrames(overrides = {}) {
  return {
    tech_assignments: {
      findFirst: async () => null,
      findMany: async () => [],
      ...(overrides.tech_assignments || {}),
    },
  };
}

test('FramesService.technicianAssignedToProject returns true when assignment exists', async () => {
  const service = new FramesService(prismaForFrames({
    tech_assignments: {
      findFirst: async ({ where }) => {
        assert.equal(where.project_code, 'PRJ-1');
        assert.equal(where.technician_id, 7);
        return { id: 42 };
      },
    },
  }));
  assert.equal(await service.technicianAssignedToProject('PRJ-1', 7), true);
});

test('FramesService.technicianAssignedToFrame requires matching frame_id', async () => {
  const service = new FramesService(prismaForFrames({
    tech_assignments: {
      findFirst: async ({ where }) => {
        assert.deepEqual(where, {
          project_code: 'PRJ-1',
          frame_id: 'frame_abc',
          technician_id: 7,
        });
        return null;
      },
    },
  }));
  assert.equal(await service.technicianAssignedToFrame('PRJ-1', 'frame_abc', 7), false);
});

test('FramesService.technicianAssignedFrameIds deduplicates frame ids', async () => {
  const service = new FramesService(prismaForFrames({
    tech_assignments: {
      findMany: async ({ where }) => {
        assert.equal(where.project_code, 'PRJ-2');
        assert.equal(where.technician_id, 3);
        return [
          { frame_id: 'frame_a' },
          { frame_id: 'frame_b' },
          { frame_id: 'frame_a' },
        ];
      },
    },
  }));
  assert.deepEqual(await service.technicianAssignedFrameIds('PRJ-2', 3), ['frame_a', 'frame_b']);
});
