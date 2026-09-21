import test from 'node:test';
import assert from 'node:assert/strict';
import {
  LOGIN_SHOWCASE_FEATURES,
  formatLoginErrorMessage,
  LOGIN_SUPPORT_LINE,
} from '../src/components/login/loginShowcaseContent.ts';

test('login showcase exposes exactly three capability highlights', () => {
  assert.equal(LOGIN_SHOWCASE_FEATURES.length, 3);
  assert.deepEqual(
    LOGIN_SHOWCASE_FEATURES.map((f) => f.title),
    ['REAL-TIME EXECUTION', 'DIGITAL WORKFLOWS', 'COMPLETE TRACEABILITY'],
  );
  for (const f of LOGIN_SHOWCASE_FEATURES) {
    assert.ok(f.body.length > 10);
    assert.ok(!/project|substation|technician name|progress %|wire 00/i.test(f.body));
  }
});

test('login showcase support line stays compact and free of fake production data', () => {
  assert.match(LOGIN_SUPPORT_LINE, /industrial wiring/i);
  assert.match(LOGIN_SUPPORT_LINE, /traceability/i);
  assert.ok(!/\d{2,}\s*%/.test(LOGIN_SUPPORT_LINE));
});

test('formatLoginErrorMessage never exposes technical internals', () => {
  const invalid = formatLoginErrorMessage('401 Unauthorized: JWT verify failed at AuthService');
  assert.match(invalid, /Unable to sign in/i);
  assert.match(invalid, /username and password/i);
  assert.ok(!invalid.toLowerCase().includes('jwt'));
  assert.ok(!invalid.toLowerCase().includes('authservice'));

  const network = formatLoginErrorMessage('Network Error: ECONNREFUSED 127.0.0.1:3101');
  assert.match(network, /Unable to sign in/i);
  assert.match(network, /network|server/i);
  assert.ok(!network.includes('ECONNREFUSED'));
  assert.ok(!network.includes('3101'));
});

test('master UI-01 forbids wiring-diagram vocabulary in showcase copy', () => {
  const blob = [
    LOGIN_SUPPORT_LINE,
    ...LOGIN_SHOWCASE_FEATURES.map((f) => `${f.title} ${f.body}`),
  ].join(' ');
  assert.ok(!/SOURCE PANEL|DEST PANEL|Wire 001|Wire 002|Wire 003/i.test(blob));
});
