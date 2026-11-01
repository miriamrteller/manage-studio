import { test } from 'node:test';
import assert from 'node:assert/strict';
import { evaluate, compare, loadManifest } from './check-edge-secret-names.mjs';

const m = loadManifest();
const allRequired = [...m.required, 'SUPABASE_URL'];

test('prod with every required name and no mocks passes', () => {
  assert.deepEqual(evaluate(allRequired, m, 'prod').errors, []);
});
test('prod flags YPAY_MOCK and dev-only names', () => {
  const { errors } = evaluate([...allRequired, 'YPAY_MOCK', 'SYNC_ISSUE_DOCUMENT_IN_DEV'], m, 'prod');
  assert.equal(errors.length, 2);
  assert.match(errors.join(), /YPAY_MOCK/);
});
test('dev may keep mock flags', () => {
  assert.deepEqual(evaluate([...allRequired, 'YPAY_MOCK', 'GROW_MOCK'], m, 'dev').errors, []);
});
test('missing required names are errors', () => {
  const { errors } = evaluate(['APP_URL'], m, 'dev');
  assert.ok(errors.some((e) => e.includes('CRON_SECRET')));
});
test('unknown names warn, HMAC versions do not', () => {
  const { warnings } = evaluate([...allRequired, 'WAIVER_HMAC_KEY_V2', 'SOMETHING_NEW'], m, 'prod');
  assert.deepEqual(warnings.length, 1);
});
test('compare ignores env-specific names', () => {
  const r = compare([...m.required, 'YPAY_MOCK', 'GROW_API_BASE'], [...m.required, 'APP_ROOT_DOMAIN'], m);
  assert.deepEqual(r, { onlyDev: ['GROW_API_BASE'], onlyProd: ['APP_ROOT_DOMAIN'] });
});
