import { test } from 'node:test';
import assert from 'node:assert/strict';
import { reconcile } from './sync-auth-redirects.mjs';

const BASE = 'https://*.opalswift.com/**,https://app.opalswift.com/**,http://localhost:5173/**';

test('adds an active domain once', () => {
  const r = reconcile(BASE, ['app.studio.com'], []);
  assert.deepEqual(r.added, ['https://app.studio.com/**']);
  assert.deepEqual(r.removed, []);
  assert.equal(r.list, `${BASE},https://app.studio.com/**`);
  assert.deepEqual(reconcile(r.list, ['app.studio.com'], []).added, []);
});

test('adopts a hand-added entry and keeps it while active', () => {
  const current = `${BASE},https://app.creativeballetacademy.com/auth/callback`;
  const r = reconcile(current, ['app.creativeballetacademy.com'], ['app.creativeballetacademy.com']);
  assert.deepEqual(r.removed, []);
  assert.deepEqual(r.added, ['https://app.creativeballetacademy.com/**']);
});

test('removes every entry for a managed host that is no longer active', () => {
  const current = `${BASE},https://app.gone.com/**,https://app.gone.com/auth/callback`;
  const r = reconcile(current, [], ['app.gone.com']);
  assert.deepEqual(r.removed, ['https://app.gone.com/**', 'https://app.gone.com/auth/callback']);
  assert.equal(r.list, BASE);
});

test('never touches opalswift, localhost or hosts it does not manage', () => {
  const current = `${BASE},https://partner.example.org/**`;
  const r = reconcile(current, [], ['app.opalswift.com', 'localhost']);
  assert.deepEqual(r.removed, []);
  assert.equal(r.list, current);
  assert.deepEqual(reconcile(BASE, ['app.opalswift.com'], []).added, []);
});

test('empty or missing allowlist', () => {
  assert.equal(reconcile('', ['app.a.com'], []).list, 'https://app.a.com/**');
  assert.equal(reconcile(null, [], []).list, '');
});
