const test = require('node:test');
const assert = require('node:assert/strict');
const bcrypt = require('bcryptjs');
const { UnauthorizedException } = require('@nestjs/common');
const { AuthService } = require('../dist/auth/auth.service');

function createTokenStoreMock() {
  return {
    createRefreshToken: () => ({ token: 'refresh-test', expiresAt: new Date() }),
    validateRefreshToken: () => null,
    revokeRefreshToken: () => {},
    revokeAllForUser: () => {},
  };
}

function createBootstrapMock() {
  return {
    statusForUser: () => ({
      required: false,
      needs_password_rotation: false,
      needs_webauthn_enrollment: false,
    }),
  };
}

function createWebAuthnStoreMock() {
  return { byUserId: () => [] };
}

function createAuthService(jwtService, prisma, tokenStore = createTokenStoreMock()) {
  return new AuthService(
    jwtService,
    prisma,
    tokenStore,
    createBootstrapMock(),
    createWebAuthnStoreMock(),
  );
}

function createPrismaMock(overrides = {}) {
  const calls = { updates: [], sessionLogs: [] };
  const prisma = {
    users: {
      findUnique: async () => null,
      update: async (args) => {
        calls.updates.push(args);
        return args;
      },
      ...(overrides.users || {}),
    },
    session_log: {
      create: async (args) => {
        calls.sessionLogs.push(args);
        return args;
      },
      ...(overrides.session_log || {}),
    },
  };
  return { prisma, calls };
}

test('AuthService.login rejects unknown users', async () => {
  const { prisma } = createPrismaMock();
  const service = createAuthService({ sign: () => 'unused' }, prisma);
  await assert.rejects(
    () => service.login('missing', 'password', '127.0.0.1'),
    (err) => err instanceof UnauthorizedException && err.message === 'Invalid credentials',
  );
});

test('AuthService.login rejects password mismatch', async () => {
  const hashed_password = await bcrypt.hash('correct-password', 10);
  const user = {
    id: 8,
    username: 'tech1',
    hashed_password,
    full_name: 'Tech One',
    employee_id: 'EMP-8',
    role: 'wiring_technician',
    is_active: true,
  };
  const { prisma } = createPrismaMock({
    users: {
      findUnique: async ({ where }) => (where.username === user.username ? user : null),
    },
  });
  const service = createAuthService({ sign: () => 'unused' }, prisma);

  await assert.rejects(
    () => service.login('tech1', 'wrong-password', '127.0.0.1'),
    (err) => err instanceof UnauthorizedException && err.message === 'Invalid credentials',
  );
});

test('AuthService.login rejects disabled accounts', async () => {
  const user = {
    id: 9,
    username: 'disabled',
    hashed_password: await bcrypt.hash('password', 10),
    full_name: 'Disabled User',
    employee_id: 'EMP-9',
    role: 'wiring_technician',
    is_active: false,
  };
  const { prisma } = createPrismaMock({
    users: {
      findUnique: async ({ where }) => {
        if (where.username === user.username) return user;
        if (where.id === user.id) return user;
        return null;
      },
    },
  });
  const service = createAuthService({ sign: () => 'unused' }, prisma);

  await assert.rejects(
    () => service.login('disabled', 'password', '127.0.0.1'),
    (err) => err instanceof UnauthorizedException && err.message === 'Account is disabled',
  );
});

test('AuthService.login issues token, updates login timestamp, and writes session log', async () => {
  const hashed_password = await bcrypt.hash('tech-password', 10);
  const user = {
    id: 11,
    username: 'tech11',
    hashed_password,
    full_name: 'Tech Eleven',
    employee_id: 'EMP-11',
    role: 'wiring_technician',
    is_active: true,
  };

  const { prisma, calls } = createPrismaMock({
    users: {
      findUnique: async ({ where }) => {
        if (where.username === user.username) return user;
        if (where.id === user.id) return user;
        return null;
      },
    },
  });

  let signedPayload = null;
  const jwtService = {
    sign: (payload) => {
      signedPayload = payload;
      return 'signed-token';
    },
  };
  const service = createAuthService(jwtService, prisma);

  const result = await service.login('tech11', 'tech-password', '10.0.0.1', 'PRJ-1');

  assert.equal(result.access_token, 'signed-token');
  assert.equal(result.refresh_token, 'refresh-test');
  assert.equal(result.user.id, 11);
  assert.equal(result.user.username, 'tech11');
  assert.equal(result.user.hashed_password, undefined);
  assert.deepEqual(signedPayload, {
    sub: 11,
    username: 'tech11',
    role: 'wiring_technician',
    full_name: 'Tech Eleven',
    employee_id: 'EMP-11',
  });
  assert.equal(calls.updates.length, 1);
  assert.equal(calls.updates[0].where.id, 11);
  assert.equal(calls.sessionLogs.length, 1);
  assert.deepEqual(calls.sessionLogs[0].data, {
    user_id: 11,
    action: 'login',
    project_code: 'PRJ-1',
    login_role: 'wiring_technician',
    ip_address: '10.0.0.1',
  });
});
