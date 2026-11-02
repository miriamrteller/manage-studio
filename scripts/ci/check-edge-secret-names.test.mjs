import { test } from 'node:test';
import assert from 'node:assert/strict';
import { evaluate, compare, loadManifest } from './check-edge-secret-names.mjs';

const m = loadManifest();
const allRequired = [...m.required, ...m.requiredInProd, ...m.requiredOneOf[0], 'SUPABASE_URL'];

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
test('email: Resend alone satisfies the transport rule', () => {
  assert.deepEqual(evaluate([...m.required, ...m.requiredInProd, 'RESEND_API_KEY'], m, 'prod').errors, []);
});
test('email: no transport at all is an error', () => {
  const { errors } = evaluate([...m.required, 'CLOUDFLARE_ACCOUNT_ID'], m, 'prod');
  assert.ok(errors.some((e) => e.includes('email transport')));
});

// ── email transport (EMAIL_TRANSPORT must match a configured transport) ──
import { classifyTransport } from './check-edge-secret-names.mjs';
import { createHash } from 'node:crypto';
const base = [...m.required, ...m.requiredInProd, 'SUPABASE_URL'];
const CF = ['CLOUDFLARE_ACCOUNT_ID', 'CLOUDFLARE_EMAIL_API_TOKEN'];

test('Resend-only prod passes with EMAIL_TRANSPORT=resend or unset', () => {
  assert.deepEqual(evaluate([...base, 'RESEND_API_KEY', 'EMAIL_TRANSPORT'], m, 'prod', { transport: 'resend' }).errors, []);
  assert.deepEqual(evaluate([...base, 'RESEND_API_KEY'], m, 'prod').errors, []);
});
test('EMAIL_TRANSPORT=cloudflare with only the Resend key fails', () => {
  const { errors } = evaluate([...base, 'RESEND_API_KEY', 'EMAIL_TRANSPORT'], m, 'prod', { transport: 'cloudflare' });
  assert.equal(errors.length, 1);
  assert.match(errors[0], /EMAIL_TRANSPORT=cloudflare but CLOUDFLARE_ACCOUNT_ID \+ CLOUDFLARE_EMAIL_API_TOKEN not set/);
});
test('EMAIL_TRANSPORT=resend with only Cloudflare fails', () => {
  const { errors } = evaluate([...base, ...CF, 'EMAIL_TRANSPORT'], m, 'prod', { transport: 'resend' });
  assert.match(errors.join(), /EMAIL_TRANSPORT=resend but RESEND_API_KEY not set/);
});
test('no transport at all fails; half a Cloudflare pair warns', () => {
  const r = evaluate([...base, 'CLOUDFLARE_ACCOUNT_ID'], m, 'prod');
  assert.match(r.errors.join(), /missing email transport/);
  assert.match(r.warnings.join(), /incomplete email transport/);
});
test('unrecognised EMAIL_TRANSPORT falls back to the unset rule with a warning', () => {
  const r = evaluate([...base, 'RESEND_API_KEY', 'EMAIL_TRANSPORT'], m, 'prod', { transport: 'unknown' });
  assert.deepEqual(r.errors, []);
  assert.match(r.warnings.join(), /treated as unset/);
});
test('classifyTransport reads only the EMAIL_TRANSPORT digest', () => {
  const h = (v) => createHash('sha256').update(v).digest('hex');
  assert.equal(classifyTransport([{ name: 'APP_URL', value: h('x') }]), undefined);
  assert.equal(classifyTransport([{ name: 'EMAIL_TRANSPORT', value: h('resend') }]), 'resend');
  assert.equal(classifyTransport([{ name: 'EMAIL_TRANSPORT', value: h('cloudflare') }]), 'cloudflare');
  assert.equal(classifyTransport([{ name: 'EMAIL_TRANSPORT', value: h('smtp') }]), 'unknown');
});

// ── Grow base URL (payments audit P1 #2) ──
import { sandboxSecretNames } from './check-edge-secret-names.mjs';
const sha = (v) => createHash('sha256').update(v).digest('hex');
const prodOk = [...m.required, ...m.requiredInProd, 'RESEND_API_KEY'];

test('GROW_API_BASE is required on prod but not on dev', () => {
  const withoutGrow = prodOk.filter((n) => n !== 'GROW_API_BASE');
  assert.match(evaluate(withoutGrow, m, 'prod').errors.join(), /GROW_API_BASE \(required on prod\)/);
  assert.deepEqual(evaluate([...m.required, 'RESEND_API_KEY'], m, 'dev').errors, []);
});
test('a sandbox GROW_API_BASE on prod is an error', () => {
  for (const url of m.sandboxValuesForbiddenInProd.GROW_API_BASE) {
    const hits = sandboxSecretNames([{ name: 'GROW_API_BASE', value: sha(url) }], m);
    assert.deepEqual(hits, ['GROW_API_BASE']);
    assert.match(evaluate(prodOk, m, 'prod', { sandboxNames: hits }).errors.join(), /sandbox on prod/);
  }
  assert.deepEqual(sandboxSecretNames([{ name: 'GROW_API_BASE', value: 'https://sandbox.example/x' }], m), ['GROW_API_BASE']);
});
test('a live GROW_API_BASE passes, and other secrets are never inspected', () => {
  assert.deepEqual(
    sandboxSecretNames([
      { name: 'GROW_API_BASE', value: sha('https://secure.meshulam.co.il/api/light/server/1.0') },
      { name: 'APP_URL', value: 'https://sandbox.example' },
    ], m),
    [],
  );
});
