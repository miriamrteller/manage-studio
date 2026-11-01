#!/usr/bin/env node
/**
 * Compares Edge Function secret NAMES on a Supabase project against
 * supabase/edge-secrets.json. Never reads, prints or stores a value: the
 * Management API returns a SHA-256 digest per secret, and this script keeps
 * only `name` — plus, for EMAIL_TRANSPORT alone, whether that digest equals
 * sha256("resend") or sha256("cloudflare") (see classifyTransport).
 *
 *   SUPABASE_ACCESS_TOKEN=… node scripts/ci/check-edge-secret-names.mjs --env prod --ref <ref>
 *   SUPABASE_ACCESS_TOKEN=… node scripts/ci/check-edge-secret-names.mjs --compare <devRef> <prodRef>
 *
 * --env prod fails on: a missing required name, no complete `requiredOneOf` group
 * (or not the one EMAIL_TRANSPORT selects), any *_MOCK name, any dev-only
 * name (an unset mock flag selects the LIVE adapter, a set one lets anyone
 * forge a "paid" callback — on prod they must not exist at all).
 * --env dev fails only on missing required names.
 * Unknown names (in no list) are reported as warnings, so the manifest stays
 * current. Exit 0 = clean, 1 = problems, 2 = could not check.
 */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

export function loadManifest(path = join(root, 'supabase/edge-secrets.json')) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

/**
 * Email transport rule, mirroring _shared/email-client.ts:
 *   EMAIL_TRANSPORT=resend      → RESEND_API_KEY must be set
 *   EMAIL_TRANSPORT=cloudflare  → both Cloudflare names must be set
 *   unset / unrecognised        → either one complete group (requiredOneOf)
 * `transport` is 'resend' | 'cloudflare' | 'unknown' | undefined (not set).
 */
const TRANSPORT_GROUP = { resend: 'RESEND_API_KEY', cloudflare: 'CLOUDFLARE_ACCOUNT_ID' };

/** Pure: names + manifest + env (+ EMAIL_TRANSPORT value class) → { errors, warnings }. */
export function evaluate(names, manifest, env, { transport } = {}) {
  const have = new Set(names.filter((n) => !manifest.platformProvided.includes(n)));
  const known = new Set([...manifest.required, ...manifest.optional, ...manifest.devOnly]);
  const forbidden = (manifest.forbiddenInProdPatterns ?? []).map((p) => new RegExp(p));
  const errors = [];
  const warnings = [];
  for (const n of manifest.required) {
    if (!have.has(n)) errors.push(`missing required secret ${n}`);
  }
  const groups = manifest.requiredOneOf ?? [];
  const chosen = TRANSPORT_GROUP[transport] && groups.find((g) => g.includes(TRANSPORT_GROUP[transport]));
  if (chosen) {
    const missing = chosen.filter((n) => !have.has(n));
    if (missing.length) {
      errors.push(`EMAIL_TRANSPORT=${transport} but ${missing.join(' + ')} not set — every email would fail`);
    }
  } else if (groups.length && !groups.some((g) => g.every((n) => have.has(n)))) {
    errors.push(`missing email transport: set one of ${groups.map((g) => g.join(' + ')).join(' | ')}`);
  }
  if (transport === 'unknown') {
    warnings.push('EMAIL_TRANSPORT is set to something other than resend/cloudflare — it is treated as unset');
  }
  for (const g of groups) {
    const present = g.filter((n) => have.has(n));
    if (present.length && present.length < g.length) {
      warnings.push(`incomplete email transport: ${present.join(' + ')} set without ${g.filter((n) => !have.has(n)).join(' + ')}`);
    }
  }
  for (const n of have) {
    const isForbidden = forbidden.some((re) => re.test(n));
    if (env === 'prod' && isForbidden) errors.push(`${n} is set on prod — mock/dev flags must be unset in production`);
    else if (env === 'prod' && manifest.devOnly.includes(n)) errors.push(`${n} is a dev-only secret and is set on prod`);
    else if (!known.has(n) && !isForbidden && !/^WAIVER_HMAC_KEY_V\d+$/.test(n)) {
      warnings.push(`${n} is not listed in supabase/edge-secrets.json — add it (or remove the secret)`);
    }
  }
  return { errors, warnings };
}

/** Pure: names present in one project but not the other, minus env-specific ones. */
export function compare(devNames, prodNames, manifest) {
  const envSpecific = (n) =>
    manifest.devOnly.includes(n) ||
    manifest.platformProvided.includes(n) ||
    (manifest.forbiddenInProdPatterns ?? []).some((p) => new RegExp(p).test(n));
  const dev = new Set(devNames);
  const prod = new Set(prodNames);
  return {
    onlyDev: [...dev].filter((n) => !prod.has(n) && !envSpecific(n)).sort(),
    onlyProd: [...prod].filter((n) => !dev.has(n) && !envSpecific(n)).sort(),
  };
}

const sha256 = (v) => createHash('sha256').update(v).digest('hex');

/**
 * Which transport EMAIL_TRANSPORT selects, without reading secret values: the
 * Management API returns a SHA-256 digest per secret, compared here with the
 * digests of the only two meaningful words. Nothing is printed or kept.
 */
export function classifyTransport(secrets) {
  const entry = secrets.find((s) => s.name === 'EMAIL_TRANSPORT');
  if (!entry) return undefined;
  const v = String(entry.value ?? '');
  for (const t of ['resend', 'cloudflare']) {
    if (v === sha256(t) || v === t) return t;
  }
  return 'unknown';
}

export async function fetchSecrets(ref, token = process.env.SUPABASE_ACCESS_TOKEN) {
  if (!token) throw new Error('SUPABASE_ACCESS_TOKEN is not set');
  if (!/^[a-z]{20}$/.test(ref ?? '')) throw new Error(`not a project ref: ${ref}`);
  const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/secrets`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`Management API ${res.status} listing secrets for ${ref}`);
  const body = await res.json();
  return body.map((s) => ({ name: s.name, value: s.name === 'EMAIL_TRANSPORT' ? s.value : undefined }));
}

export async function fetchSecretNames(ref, token) {
  return (await fetchSecrets(ref, token)).map((s) => s.name);
}

async function main(argv) {
  const manifest = loadManifest();
  const arg = (k) => argv[argv.indexOf(k) + 1];
  if (argv.includes('--compare')) {
    const [devRef, prodRef] = [arg('--compare'), argv[argv.indexOf('--compare') + 2]];
    const { onlyDev, onlyProd } = compare(await fetchSecretNames(devRef), await fetchSecretNames(prodRef), manifest);
    console.log(`Only on dev  (${devRef}): ${onlyDev.join(', ') || '—'}`);
    console.log(`Only on prod (${prodRef}): ${onlyProd.join(', ') || '—'}`);
    return onlyDev.length || onlyProd.length ? 1 : 0;
  }
  const env = arg('--env');
  const ref = arg('--ref');
  if (!['dev', 'prod'].includes(env)) throw new Error('usage: --env dev|prod --ref <ref>  |  --compare <devRef> <prodRef>');
  const secrets = await fetchSecrets(ref);
  const names = secrets.map((s) => s.name);
  const transport = classifyTransport(secrets);
  const { errors, warnings } = evaluate(names, manifest, env, { transport });
  console.log(`EMAIL_TRANSPORT: ${transport ?? 'not set'}`);
  console.log(`Edge secrets on ${env} (${ref}): ${names.length} name(s)`);
  for (const w of warnings) console.log(`::warning::${w}`);
  for (const e of errors) console.log(`::error::${e}`);
  if (!errors.length) console.log('Edge secret names OK.');
  return errors.length ? 1 : 0;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main(process.argv.slice(2)).then(
    (code) => process.exit(code),
    (e) => { console.error(`::error::${e.message}`); process.exit(2); },
  );
}
