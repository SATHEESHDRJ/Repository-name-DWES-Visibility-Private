'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { resolvePgDumpExecutable, resolvePgDumpConnection } = require('../dist/common/pg-dump.util');

test('resolvePgDumpExecutable honors PG_DUMP_PATH', () => {
  const prev = process.env.PG_DUMP_PATH;
  process.env.PG_DUMP_PATH = '/custom/bin/pg_dump';
  try {
    assert.equal(resolvePgDumpExecutable(), '/custom/bin/pg_dump');
  } finally {
    if (prev === undefined) delete process.env.PG_DUMP_PATH;
    else process.env.PG_DUMP_PATH = prev;
  }
});

test('resolvePgDumpExecutable defaults to pg_dump on non-win32', () => {
  const prevPath = process.env.PG_DUMP_PATH;
  delete process.env.PG_DUMP_PATH;
  const originalPlatform = Object.getOwnPropertyDescriptor(process, 'platform');
  Object.defineProperty(process, 'platform', { value: 'linux', configurable: true });
  try {
    assert.equal(resolvePgDumpExecutable(), 'pg_dump');
  } finally {
    if (originalPlatform) {
      Object.defineProperty(process, 'platform', originalPlatform);
    } else {
      delete process.platform;
    }
    if (prevPath === undefined) delete process.env.PG_DUMP_PATH;
    else process.env.PG_DUMP_PATH = prevPath;
  }
});

test('resolvePgDumpConnection parses DATABASE_URL', () => {
  const prev = process.env.DATABASE_URL;
  process.env.DATABASE_URL = 'postgresql://dwes_user:secret%21@postgres:5432/WiringSchemeDB';
  try {
    const conn = resolvePgDumpConnection();
    assert.equal(conn.host, 'postgres');
    assert.equal(conn.port, '5432');
    assert.equal(conn.user, 'dwes_user');
    assert.equal(conn.password, 'secret!');
    assert.equal(conn.database, 'WiringSchemeDB');
  } finally {
    if (prev === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = prev;
  }
});