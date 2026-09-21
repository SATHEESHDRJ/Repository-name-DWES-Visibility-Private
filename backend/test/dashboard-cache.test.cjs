const test = require('node:test');
const assert = require('node:assert/strict');
const { DashboardCacheService } = require('../dist/common/cache/dashboard-cache.service');

// onModuleInit() is intentionally never called in these tests: with no REDIS_URL set
// in the test process, it would be a no-op anyway. These exercise the in-memory
// fallback path directly, which is what a single dev instance runs on today.

test('DashboardCacheService.acquireLock: is mutually exclusive until released', async () => {
  const cache = new DashboardCacheService();
  const key = `lock-${Date.now()}`;

  const owner1 = await cache.acquireLock(key, 5_000);
  assert.notEqual(owner1, false, 'first acquire must succeed');

  const owner2 = await cache.acquireLock(key, 5_000);
  assert.equal(owner2, false, 'second acquire while held must fail');

  await cache.releaseLock(key, owner1);
  const owner3 = await cache.acquireLock(key, 5_000);
  assert.notEqual(owner3, false, 'acquire after release must succeed');
});

test('DashboardCacheService.releaseLock: only the owning token can release (owner-safe compare-and-delete)', async () => {
  const cache = new DashboardCacheService();
  const key = `owner-safe-${Date.now()}`;

  const owner = await cache.acquireLock(key, 5_000);
  assert.notEqual(owner, false);

  await cache.releaseLock(key, 'not-the-real-owner');
  const stillHeld = await cache.acquireLock(key, 5_000);
  assert.equal(stillHeld, false, 'a release with the wrong owner token must not free the lock');

  await cache.releaseLock(key, owner);
  const freed = await cache.acquireLock(key, 5_000);
  assert.notEqual(freed, false, 'a release with the correct owner token must free the lock');
});

test('DashboardCacheService.acquireLock: bounded TTL expires an abandoned lock', async () => {
  const cache = new DashboardCacheService();
  const key = `ttl-${Date.now()}`;

  const owner = await cache.acquireLock(key, 40);
  assert.notEqual(owner, false);
  // Simulates a crashed holder that never calls releaseLock.
  await new Promise(resolve => setTimeout(resolve, 60));

  const afterExpiry = await cache.acquireLock(key, 5_000);
  assert.notEqual(afterExpiry, false, 'an expired lock must be acquirable again without an explicit release');
});

test('DashboardCacheService set/get: TTL expiry (cache miss -> set -> hit -> expiry)', async () => {
  const cache = new DashboardCacheService();
  const key = `entry-${Date.now()}`;

  assert.equal(cache.get(key), undefined, 'cache miss before any set()');

  cache.set(key, { value: 42 }, 40);
  assert.deepEqual(cache.get(key), { value: 42 }, 'cache hit immediately after set()');

  await new Promise(resolve => setTimeout(resolve, 60));
  assert.equal(cache.get(key), undefined, 'entry must expire after its TTL elapses');
});

test('DashboardCacheService.invalidate: clears matching keys without touching others', () => {
  const cache = new DashboardCacheService();
  cache.set('supervisor:allPanels', ['a'], 30_000);
  cache.set('director:core', ['b'], 30_000);

  cache.invalidate('supervisor:');
  assert.equal(cache.get('supervisor:allPanels'), undefined);
  assert.deepEqual(cache.get('director:core'), ['b']);
});

test('DashboardCacheService.getStatus: reports Redis as not configured when REDIS_URL is unset', () => {
  const cache = new DashboardCacheService();
  const status = cache.getStatus();
  assert.equal(status.redisActive, false);
});
