const test = require('node:test');
const assert = require('node:assert/strict');
const { firstValueFrom, NEVER, timeout } = require('rxjs');
const { EventsController } = require('../dist/events/events.controller');

test('SSE stream emits a body heartbeat immediately after authentication', async () => {
  const controller = new EventsController(
    { asObservable: () => NEVER },
    { tech_assignments: { findMany: async () => [] } },
  );
  const startedAt = Date.now();

  const message = await firstValueFrom(
    controller.stream({ id: 1, role: 'system_admin' }).pipe(timeout({ first: 500 })),
  );

  assert.equal(message.data.scope, 'heartbeat');
  assert.ok(Date.now() - startedAt < 500, 'first SSE body frame should not wait for the 25s heartbeat interval');
});
