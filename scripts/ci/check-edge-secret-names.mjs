#!/usr/bin/env node
/**
 * Compares Edge Function secret NAMES on a Supabase project against
 * supabase/edge-secrets.json. Never reads, prints or stores a value: the
 * Management API returns a digest, and this script keeps only `name`.
 *
 *   SUPABASE_ACCESS_TOKEN=… node scripts/ci/check-edge-secret-names.mjs --env prod --ref <ref>
 *   SUPABASE_ACCESS_TOKEN=… node scripts/ci/check-edge-secret-names.mjs --compare <devRef> <prodRef>
 *
 * --env prod fails on: a missing required name, any *_MOCK name, any dev-only
 * name (an unset mock flag selects the LIVE adapter, a set one lets anyone
 * forge a "paid" callback — on prod they must not exist at all).
 * --env dev fails only on missing required names.
 * Unknown names (in no list) are reported as warnings, so the manifest stays
 * current. Exit 0 = clean, 1 = problems, 2 = could not check.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

export function loadManifest(path = join(root, 'supabase/edge-secrets.json')) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

/** Pure: names + manifest + env → { errors, warnings }. */
export function evaluate(names, manifest, env) {
  const have = new Set(names.filter((n) => !manifest.platformProvided.includes(n)));
  const known = new Set([...manifest.required, ...manifest.optional, ...manifest.devOnly]);
  const forbidden = (manifest.forbiddenInProdPatterns ?? []).map((p) => new RegExp(p));
  const errors = [];
  const warnings = [];
  for (const n of manifest.required) {
    if (!have.has(n)) errors.push(`missing required secret ${n}`);
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

export async function fetchSecretNames(ref, token = process.env.SUPABASE_ACCESS_TOKEN) {
  if (!token) throw new Error('SUPABASE_ACCESS_TOKEN is not set');
  if (!/^[a-z]{20}$/.test(ref ?? '')) throw new Error(`not a project ref: ${ref}`);
  const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/secrets`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`Management API ${res.status} listing secrets for ${ref}`);
  const body = await res.json();
  return body.map((s) => s.name);
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
  const names = await fetchSecretNames(ref);
  const { errors, warnings } = evaluate(names, manifest, env);
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
