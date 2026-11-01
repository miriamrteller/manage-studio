import { test } from 'node:test';
import assert from 'node:assert/strict';
import { diff } from './migration-drift.mjs';

const repo = [{ version: '1', file: '1_a.sql' }, { version: '2', file: '2_b.sql' }];
test('in sync', () => assert.deepEqual(diff(repo, ['1', '2'], 'dev'), { unknown: [], pending: [], drift: false }));
test('pending on dev is drift', () => assert.equal(diff(repo, ['1'], 'dev').drift, true));
test('pending on prod is not drift', () => {
  const r = diff(repo, ['1'], 'prod');
  assert.equal(r.drift, false);
  assert.deepEqual(r.pending, ['2_b.sql']);
});
test('unknown version is drift everywhere', () => assert.deepEqual(diff(repo, ['1', '2', '3'], 'prod').unknown, ['3']));
