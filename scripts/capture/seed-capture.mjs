#!/usr/bin/env node
/**
 * Runs seed-capture.sql against the DEV Supabase project — and only the dev
 * project, regardless of what repo-root .env currently points at.
 *
 * Unlike seed-dev.mjs (which reads the active .env and may refuse when the repo
 * is switched to prod), this loads `.env.dev` DIRECTLY and force-overrides the
 * SUPABASE_* connection vars, then still runs assertDevProject as a second
 * lock. There is deliberately no ALLOW_NON_DEV_PROJECT escape hatch here:
 * portfolio captures must never touch production data.
 *
 * Usage: node scripts/capture/seed-capture.mjs
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { DEV_PROJECT_REF } from './config.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..', '..');

// --- Load .env.dev with OVERRIDE semantics for connection vars -------------
function parseEnvFile(filePath) {
  const out = {};
  if (!existsSync(filePath)) return out;
  for (const line of readFileSync(filePath, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const sep = trimmed.indexOf('=');
    if (sep === -1) continue;
    const key = trimmed.slice(0, sep).trim();
    let value = trimmed.slice(sep + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

const devEnv = parseEnvFile(join(root, '.env.dev'));
if (!devEnv.SUPABASE_PROJECT_REF) {
  console.error('.env.dev is missing SUPABASE_PROJECT_REF — cannot pin the dev project.');
  process.exit(1);
}

// Force the connection vars to the dev project. Overrides shell + root .env.
for (const key of [
  'SUPABASE_PROJECT_REF',
  'SUPABASE_URL',
  'SUPABASE_DB_PASSWORD',
  'SUPABASE_DB_URL',
  'SUPABASE_DB_POOLER_HOST',
]) {
  if (devEnv[key] !== undefined) {
    process.env[key] = devEnv[key];
  } else {
    delete process.env[key];
  }
}
// Direct db.<ref> host is IPv6-only here and the supabase-CLI pooler fallback
// is flaky; pin the dev project's session-pooler host unless .env.dev names one.
if (!process.env.SUPABASE_DB_POOLER_HOST && !process.env.SUPABASE_DB_URL) {
  process.env.SUPABASE_DB_POOLER_HOST = 'aws-1-ap-northeast-2.pooler.supabase.com';
}

// Never allow the dev-guard bypass in this script.
delete process.env.ALLOW_NON_DEV_PROJECT;

// --- Hard pin ---------------------------------------------------------------
if (process.env.SUPABASE_PROJECT_REF !== DEV_PROJECT_REF) {
  console.error(
    `REFUSING TO SEED: .env.dev points at "${process.env.SUPABASE_PROJECT_REF}" ` +
      `but the capture suite is pinned to dev project "${DEV_PROJECT_REF}".\n` +
      `If the dev project genuinely moved, update DEV_PROJECT_REF in scripts/capture/config.mjs.`,
  );
  process.exit(1);
}

// Second lock: the shared guard used by every destructive dev script.
const { assertDevProject } = await import(
  pathToFileURL(join(root, 'scripts', 'lib', 'assert-dev-project.mjs')).href
);
assertDevProject('capture seed');

const { resolveConnectableDbUrl } = await import(
  pathToFileURL(join(root, 'scripts', 'lib', 'psql-dev.mjs')).href
);

let dbUrl;
try {
  dbUrl = resolveConnectableDbUrl(root);
} catch (e) {
  console.error(e.message);
  process.exit(1);
}
if (!dbUrl) {
  console.error('Could not resolve a dev DB connection from .env.dev (SUPABASE_DB_PASSWORD or SUPABASE_DB_URL).');
  process.exit(1);
}

const sqlFile = join(here, 'seed-capture.sql');
console.log(`Seeding capture fixture into dev project ${DEV_PROJECT_REF} ...`);
const result = spawnSync('psql', ['-d', dbUrl, '-v', 'ON_ERROR_STOP=1', '-f', sqlFile], {
  stdio: 'inherit',
  shell: false,
});

if (result.error) {
  console.error(`psql failed to start: ${result.error.message}`);
  console.error('Install psql or run scripts/capture/seed-capture.sql in the Supabase SQL Editor (dev project only!).');
  process.exit(1);
}
process.exit(result.status ?? 0);
