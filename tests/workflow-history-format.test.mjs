/**
 * Mirrors workflowHistoryFormat.ts for node:test (keep in sync with source).
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
    (typeof person.full_name === 'string' && person.full_name.trim())
    || (typeof person.name === 'string' && person.name.trim())
    || '';
  const username = typeof person.username === 'string'
    ? person.username.trim().replace(/^@/, '')
    : '';
  if (name && username) return `${name} (@${username})`;
  if (name) return name;
  if (username) return `@${username}`;
  return emptyLabel;
}

const EVENT_LABELS = {
  stage_updated: 'Workflow Stage Updated',
  director_upgrade_applied: 'Director Planning Defaults Applied',
  workflow_created: 'Panel Workflow Created',
  assignment_changed: 'Stage Assignment Updated',
};

function historyEventLabel(eventType) {
  return EVENT_LABELS[eventType] || eventType;
}

function historyEventCategory(eventType) {
  const t = String(eventType || '');
  if (t.includes('assign')) return 'assignments';
  if (t === 'director_upgrade_applied' || t === 'workflow_created') return 'system';
  if (t.includes('stage')) return 'planning';
  return 'system';
}

function historyRoleLabel(role) {
  if (role === 'prod_supervisor') return 'Production Supervisor';
  if (role === 'system_admin') return 'System Administrator';
  return role;
}

function formatDurationPair(value, unit) {
  if (value == null || value === '') return 'Not set';
  const n = Number(value);
  const u = String(unit || '').toLowerCase();
  if (u === 'days') return n === 1 ? '1 working day' : `${n} working days`;
  if (u === 'hours') return n === 1 ? '1 hour' : `${n} hours`;
  return String(n);
}

function safeParseJson(raw) {
  if (raw == null || raw === '') return null;
  try { return JSON.parse(raw); } catch { return null; }
}

function buildHistoryDiffs(previousRaw, newRaw) {
  const prev = safeParseJson(previousRaw) || {};
  const next = safeParseJson(newRaw) || {};
  const lines = [];
  if (prev.planned_duration_value !== next.planned_duration_value
    || prev.duration_unit !== next.duration_unit) {
    lines.push({
      label: 'Planned duration',
      from: formatDurationPair(prev.planned_duration_value, prev.duration_unit),
      to: formatDurationPair(next.planned_duration_value, next.duration_unit),
    });
  }
  return { lines, parseFailed: false };
}

function buildDirectorUpgradeSummary(newRaw) {
  const parsed = safeParseJson(newRaw);
  if (!parsed?.preview) return null;
  const preview = parsed.preview;
  return {
    template: preview.label || 'Director Planning Template v1',
    added: (preview.adds || []).map(a => a.name),
    renamed: (preview.renames || []).map(r => `${r.from_name} → ${r.to_name}`),
    durations: (preview.duration_updates || []).map(d => `${d.stage_key} → ${formatDurationPair(d.to_value, d.to_unit)}`),
    legacy: (preview.legacy_retain || []).map(l => l.name),
    archived: (parsed.archived_keys || []).map(k => {
      const hit = (preview.unused_archive_candidates || []).find(c => c.stage_key === k);
      return hit?.name || k;
    }),
  };
}

function formatHistoryDateUae(value) {
  const d = new Date(value);
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Dubai',
    day: '2-digit', month: 'short', year: 'numeric',
    hour: 'numeric', minute: '2-digit', hour12: true,
  }).format(d);
}

test('history event labels and categories', () => {
  assert.equal(historyEventLabel('stage_updated'), 'Workflow Stage Updated');
  assert.equal(historyEventLabel('director_upgrade_applied'), 'Director Planning Defaults Applied');
  assert.equal(historyEventLabel('workflow_created'), 'Panel Workflow Created');
  assert.equal(historyEventCategory('assignment_changed'), 'assignments');
  assert.equal(historyEventCategory('director_upgrade_applied'), 'system');
  assert.equal(historyEventCategory('stage_updated'), 'planning');
  assert.equal(historyRoleLabel('prod_supervisor'), 'Production Supervisor');
  assert.equal(historyRoleLabel('system_admin'), 'System Administrator');
});

test('diff shows planned duration change', () => {
  const { lines } = buildHistoryDiffs(
    JSON.stringify({ name: 'Panel Assembly', status: 'PLANNED' }),
    JSON.stringify({ planned_duration_value: 2, duration_unit: 'days', status: 'PLANNED' }),
  );
  const duration = lines.find(l => l.label === 'Planned duration');
  assert.ok(duration);
  assert.equal(duration.from, 'Not set');
  assert.equal(duration.to, '2 working days');
});

test('person object never becomes [object Object]', () => {
  const label = formatPersonLabel({ name: 'Subin Rajendran', username: 'subin' });
  assert.equal(label, 'Subin Rajendran (@subin)');
  assert.ok(!label.includes('[object Object]'));
});

test('director upgrade summary extracts structured sections', () => {
  const summary = buildDirectorUpgradeSummary(JSON.stringify({
    version: 'DIRECTOR_WA1_V1',
    archived_keys: ['DISPATCH'],
    preview: {
      label: 'Director Planning Template v1',
      adds: [{ name: 'Panel Assembly' }, { name: 'HV Shorting' }],
      renames: [{ from_name: 'QC / QA', to_name: 'QA/QC Pending Punch Points' }],
      duration_updates: [{ stage_key: 'WIRING', to_value: 11, to_unit: 'hours' }],
      legacy_retain: [{ name: 'HV Testing' }],
      unused_archive_candidates: [{ stage_key: 'DISPATCH', name: 'Dispatch' }],
    },
  }));
  assert.equal(summary.template, 'Director Planning Template v1');
  assert.deepEqual(summary.added, ['Panel Assembly', 'HV Shorting']);
  assert.ok(summary.renamed[0].includes('QA/QC Pending Punch Points'));
  assert.ok(summary.durations[0].includes('11 hours'));
  assert.deepEqual(summary.legacy, ['HV Testing']);
  assert.deepEqual(summary.archived, ['Dispatch']);
});

test('UAE date formatting returns non-empty string', () => {
  const s = formatHistoryDateUae('2026-07-29T07:38:00.000Z');
  assert.ok(s);
  assert.match(s, /2026/);
});
