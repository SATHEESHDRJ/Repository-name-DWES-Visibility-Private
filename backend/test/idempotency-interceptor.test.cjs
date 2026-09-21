const test = require('node:test');
const assert = require('node:assert/strict');
const { lastValueFrom, of, from } = require('rxjs');
const { ConflictException } = require('@nestjs/common');
const { IdempotencyInterceptor } = require('../dist/common/guards/idempotency.interceptor');

function makeContext(req) {
  const res = { statusCode: 200, status(code) { this.statusCode = code; return this; } };
  return {
    switchToHttp: () => ({ getRequest: () => req, getResponse: () => res }),
  };
}

function makeHandler(fn) {
  return { handle: () => fn() };
}

test('IdempotencyInterceptor: ten concurrent requests with the same key produce exactly one execution and share the result', async () => {
  const interceptor = new IdempotencyInterceptor(); // no cacheService -> in-memory fallback path
  let executions = 0;
  const key = `concurrent-${Date.now()}`;

  const runOne = async () => {
    const req = {
      method: 'POST',
      originalUrl: '/api/tech/cable-action',
      headers: { 'x-idempotency-key': key },
      body: { assignment_id: 1, cable_index: 0, action: 'complete' },
    };
    const ctx = makeContext(req);
    const handler = makeHandler(() => from((async () => {
      executions += 1;
      await new Promise(resolve => setTimeout(resolve, 60));
      return { ok: true, mutated: executions };
    })()));
    const obs = await interceptor.intercept(ctx, handler);
    return lastValueFrom(obs);
  };

  const results = await Promise.all(Array.from({ length: 10 }, runOne));

  assert.equal(executions, 1, 'the wrapped handler must run exactly once for 10 concurrent duplicate requests');
  const serialized = results.map(r => JSON.stringify(r));
  assert.ok(
    serialized.every(body => body === serialized[0]),
    `all 10 responses must be the single real result, got: ${serialized.join(', ')}`,
  );
});

test('IdempotencyInterceptor: a request replayed after completion returns the cached result without re-running the handler', async () => {
  const interceptor = new IdempotencyInterceptor();
  let executions = 0;
  const key = `replay-${Date.now()}`;
  const req = {
    method: 'POST',
    originalUrl: '/api/tech/cable-action',
    headers: { 'x-idempotency-key': key },
    body: {},
  };

  const first = await interceptor.intercept(makeContext(req), makeHandler(() => {
    executions += 1;
    return of({ ok: true, run: executions });
  }));
  await lastValueFrom(first);

  const replayReq = { ...req };
  const second = await interceptor.intercept(makeContext(replayReq), makeHandler(() => {
    executions += 1;
    return of({ ok: true, run: executions });
  }));
  const secondBody = await lastValueFrom(second);

  assert.equal(executions, 1, 'the second (replayed) request must not invoke the handler again');
  assert.deepEqual(secondBody, { ok: true, run: 1 });
  assert.equal(replayReq.__dwesIdempotentReplay, true, 'replay must be marked so EventsInterceptor skips a duplicate publish');
});

test('IdempotencyInterceptor: a genuinely new key (no header, different body) is not blocked by an unrelated in-flight key', async () => {
  const interceptor = new IdempotencyInterceptor();
  const reqA = { method: 'POST', originalUrl: '/api/tech/cable-action', headers: {}, body: { a: 1 } };
  const reqB = { method: 'POST', originalUrl: '/api/tech/cable-action', headers: {}, body: { b: 2 } };

  const handlerA = makeHandler(() => from(new Promise(resolve => setTimeout(() => resolve({ who: 'A' }), 80))));
  const handlerB = makeHandler(() => of({ who: 'B' }));

  const [obsA, obsB] = await Promise.all([
    interceptor.intercept(makeContext(reqA), handlerA),
    interceptor.intercept(makeContext(reqB), handlerB),
  ]);
  const [resultA, resultB] = await Promise.all([lastValueFrom(obsA), lastValueFrom(obsB)]);

  assert.deepEqual(resultA, { who: 'A' });
  assert.deepEqual(resultB, { who: 'B' });
});

test('IdempotencyInterceptor: GET requests are never intercepted', async () => {
  const interceptor = new IdempotencyInterceptor();
  const req = { method: 'GET', originalUrl: '/api/tech/my-panels', headers: {}, body: {} };
  let ran = false;
  const handler = makeHandler(() => { ran = true; return of({ ok: true }); });
  const obs = await interceptor.intercept(makeContext(req), handler);
  await lastValueFrom(obs);
  assert.equal(ran, true);
});
