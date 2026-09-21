/**
 * Mirrors formatPersonLabel from workflowTypes.ts for node:test.
 * Keep in sync when changing person display rules.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

function formatPersonLabel(value, emptyLabel = 'Unassigned') {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed || emptyLabel;
  }
  if (!value || typeof value !== 'object') return emptyLabel;

  const person = value;
  const name =
    (typeof person.displayName === 'string' && person.displayName.trim())
    || (typeof person.display_name === 'string' && person.display_name.trim())
    || (typeof person.full_name === 'string' && person.full_name.trim())
    || (typeof person.name === 'string' && person.name.trim())
    || '';

  const username = typeof person.username === 'string'
    ? person.username.trim().replace(/^@/, '')
    : '';

  const employeeId = typeof person.employee_id === 'string'
    ? person.employee_id.trim()
    : (typeof person.employee_id === 'number' ? String(person.employee_id) : '');

  if (name && username) return `${name} (@${username})`;
  if (name) return name;
  if (username) return `@${username}`;
  if (employeeId) return employeeId;
  return emptyLabel;
}

test('formatPersonLabel renders id/name/username object safely', () => {
  const label = formatPersonLabel({ id: 7, name: 'Viju Vijayan', username: 'tech1' });
  assert.equal(label, 'Viju Vijayan (@tech1)');
  assert.equal(typeof label, 'string');
});

test('formatPersonLabel handles null and missing person', () => {
  assert.equal(formatPersonLabel(null), 'Unassigned');
  assert.equal(formatPersonLabel(undefined), 'Unassigned');
  assert.equal(formatPersonLabel({ id: 1 }), 'Unassigned');
});

test('formatPersonLabel handles username-only and string values', () => {
  assert.equal(formatPersonLabel({ id: 2, username: '@tech9' }), '@tech9');
  assert.equal(formatPersonLabel('  Alice  '), 'Alice');
  assert.equal(formatPersonLabel(''), 'Unassigned');
});

test('formatPersonLabel never returns an object (React #31 guard)', () => {
  const cases = [
    { id: 1, name: 'A', username: 'a' },
    { id: 2, name: 'B' },
    null,
    'plain',
  ];
  for (const c of cases) {
    const out = formatPersonLabel(c);
    assert.equal(typeof out, 'string');
    assert.notEqual(out, '[object Object]');
  }
});
