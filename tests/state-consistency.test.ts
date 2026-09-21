import test from 'node:test';
import assert from 'node:assert/strict';
import { LatestRequestGate } from '../src/utils/latestRequestGate.ts';
import { excludeDeletedEntity, reconcileProjectSelection } from '../src/utils/entityConsistency.ts';

test('a stale response cannot restore a record after a newer request', async () => {
  const gate = new LatestRequestGate();
  const applied: string[] = [];
  const first = gate.begin();
  let releaseOld!: () => void;
  const oldResponse = new Promise<void>(resolve => { releaseOld = resolve; }).then(() => {
    if (gate.isLatest(first)) applied.push('deleted-project');
  });

  const second = gate.begin();
  if (gate.isLatest(second)) applied.push('fresh-project');
  releaseOld();
  await oldResponse;

  assert.deepEqual(applied, ['fresh-project']);
});

test('deletion invalidation blocks an in-flight response before refetch', () => {
  const gate = new LatestRequestGate();
  const request = gate.begin();
  gate.invalidate();
  assert.equal(gate.isLatest(request), false);
});

test('navigation, refresh, and multiple logged-in roles select only currently valid projects', () => {
  const projects = [{ code: 'NEXT' }, { code: 'LAST' }];
  assert.equal(reconcileProjectSelection(projects, 'DELETED')?.code, 'NEXT');
  assert.equal(reconcileProjectSelection(projects, 'NEXT')?.code, 'NEXT');
  assert.equal(reconcileProjectSelection([], 'DELETED'), null);

  const technicianProjects = [{ code: 'TECH-ASSIGNED' }];
  assert.equal(reconcileProjectSelection(technicianProjects, 'DIRECTOR-ONLY')?.code, 'TECH-ASSIGNED');
});

test('project and panel deletion purge assignment and workflow records independently', () => {
  const records = [
    { projectCode: 'P1', panelId: 'A' },
    { projectCode: 'P1', panelId: 'B' },
    { projectCode: 'P2', panelId: 'C' },
  ];
  assert.deepEqual(excludeDeletedEntity(records, { projectCode: 'P1', frameId: 'A' }), [
    { projectCode: 'P1', panelId: 'B' },
    { projectCode: 'P2', panelId: 'C' },
  ]);
  assert.deepEqual(excludeDeletedEntity(records, { projectCode: 'P1' }), [
    { projectCode: 'P2', panelId: 'C' },
  ]);
});
