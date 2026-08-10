import test from 'node:test';
import assert from 'node:assert/strict';
import {
  resolveSelectedPanelId,
  rememberSelectedPanel,
  pruneSelectedPanels,
  type SelectedPanelByProject,
} from '../src/utils/panelSelection.ts';

// The Status workspace remounts on dashboard tab changes, so the selected panel is
// kept in the (out-of-tree) session store. These tests cover the pure resolution +
// memory rules that back that persistence.

test('tab navigation persistence: a remembered valid panel is restored', () => {
  // User selects =H002 for project A, then navigates away (component remounts).
  const remembered = rememberSelectedPanel({}, 'PROJ_A', 'H002');
  // On return, the stored panel still exists among the project's panels.
  assert.equal(
    resolveSelectedPanelId(remembered['PROJ_A'], ['H001', 'H002', 'H003']),
    'H002',
  );
});

test('project-specific persistence: each project keeps its own panel', () => {
  let map: SelectedPanelByProject = {};
  map = rememberSelectedPanel(map, 'PROJ_A', 'H002');
  map = rememberSelectedPanel(map, 'PROJ_B', 'K009');
  assert.equal(resolveSelectedPanelId(map['PROJ_A'], ['H001', 'H002']), 'H002');
  assert.equal(resolveSelectedPanelId(map['PROJ_B'], ['K009', 'K010']), 'K009');
});

test('cross-project isolation: a panel is never carried into another project', () => {
  const map = rememberSelectedPanel({}, 'PROJ_A', 'H002');
  // Switching to PROJ_B, whose panels do not include H002 → falls back to B's first.
  assert.equal(resolveSelectedPanelId(map['PROJ_B'], ['K009', 'K010']), 'K009');
  // The A entry itself is unchanged / never leaks the B selection.
  assert.equal(map['PROJ_A'], 'H002');
});

test('invalid stored panel falls back to the first available panel', () => {
  assert.equal(resolveSelectedPanelId('DOES_NOT_EXIST', ['H001', 'H002']), 'H001');
});

test('deleted panel falls back to the first available panel', () => {
  // Panel H002 was remembered, then deleted from the project.
  assert.equal(resolveSelectedPanelId('H002', ['H001', 'H003']), 'H001');
});

test('unauthorized panel is rejected: available list is the access source of truth', () => {
  // The available list only contains panels the user may access; a stored panel
  // outside it (e.g. access revoked) is never selected.
  assert.equal(resolveSelectedPanelId('H002', ['H001']), 'H001');
});

test('empty project selects nothing', () => {
  assert.equal(resolveSelectedPanelId('H002', []), '');
  assert.equal(resolveSelectedPanelId(undefined, []), '');
});

test('remembering an empty panel clears the project entry (never stores "")', () => {
  const map = rememberSelectedPanel({ PROJ_A: 'H002' }, 'PROJ_A', '');
  assert.equal('PROJ_A' in map, false);
});

test('remember is immutable and scoped by project code', () => {
  const before: SelectedPanelByProject = { PROJ_A: 'H001' };
  const after = rememberSelectedPanel(before, 'PROJ_B', 'K001');
  assert.notEqual(before, after);          // no mutation
  assert.equal(before['PROJ_B'], undefined);
  assert.equal(after['PROJ_A'], 'H001');
  assert.equal(after['PROJ_B'], 'K001');
  // A blank project code is a no-op.
  assert.equal(rememberSelectedPanel(before, '', 'X'), before);
});

test('pruneSelectedPanels drops entries for projects that no longer exist / are inaccessible', () => {
  const map: SelectedPanelByProject = { PROJ_A: 'H002', GONE: 'X1', PROJ_B: 'K009' };
  assert.deepEqual(pruneSelectedPanels(map, ['PROJ_A', 'PROJ_B']), {
    PROJ_A: 'H002',
    PROJ_B: 'K009',
  });
  assert.deepEqual(pruneSelectedPanels(map, []), {});
});
