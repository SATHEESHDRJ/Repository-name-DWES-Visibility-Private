const test = require('node:test');
const assert = require('node:assert/strict');
const { FramesService } = require('../dist/frames/frames.service');
const { MockStore } = require('../dist/data/mock-store');

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
        assert.deepEqual(where.is_hidden, { not: true });
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
          is_hidden: { not: true },
        });
        return null;
      },
    },
  }));
  assert.equal(await service.technicianAssignedToFrame('PRJ-1', 'frame_abc', 7), false);
});

test('FramesService drawing access excludes hidden former assignments', async () => {
  const service = new FramesService(prismaForFrames({
    tech_assignments: {
      findFirst: async ({ where }) => {
        assert.deepEqual(where.is_hidden, { not: true });
        return null;
      },
    },
  }));
  assert.equal(await service.technicianAssignedToFrame('PRJ-1', 'frame_hidden', 7), false);
});

test('FramesService.technicianAssignedFrameIds deduplicates frame ids', async () => {
  const service = new FramesService(prismaForFrames({
    tech_assignments: {
      findMany: async ({ where }) => {
        assert.equal(where.project_code, 'PRJ-2');
        assert.equal(where.technician_id, 3);
        assert.deepEqual(where.is_hidden, { not: true });
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

test('FramesService.getPanelDrawings never returns another panel drawing', () => {
  const service = new FramesService(prismaForFrames());
  const originalFrames = MockStore.frames;
  try {
    MockStore.frames = [
      { id: 'frame_a', project_code: 'PRJ-SCOPE' },
      { id: 'frame_b', project_code: 'PRJ-SCOPE' },
    ];
    service.getDrawings = () => [
      { id: 'drawing_a', frame_id: 'frame_a' },
      { id: 'drawing_b', frame_id: 'frame_b' },
      { id: 'legacy_unscoped' },
    ];
    assert.deepEqual(service.getPanelDrawings('PRJ-SCOPE', 'frame_a').map(d => d.id), ['drawing_a']);
    assert.deepEqual(service.getPanelDrawings('PRJ-SCOPE', 'frame_b').map(d => d.id), ['drawing_b']);
  } finally {
    MockStore.frames = originalFrames;
  }
});

test('FramesService.getPanelDrawingFile refuses a drawing id owned by another panel', () => {
  const service = new FramesService(prismaForFrames());
  service.getPanelDrawings = (_projectCode, frameId) => frameId === 'frame_a' ? [{ id: 'drawing_a' }] : [{ id: 'drawing_b' }];
  service.getDrawingFile = (_projectCode, drawingId) => ({ id: drawingId });
  assert.equal(service.getPanelDrawingFile('PRJ-SCOPE', 'frame_a', 'drawing_b'), null);
  assert.deepEqual(service.getPanelDrawingFile('PRJ-SCOPE', 'frame_a', 'drawing_a'), { id: 'drawing_a' });
});
