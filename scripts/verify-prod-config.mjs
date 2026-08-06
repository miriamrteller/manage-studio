/**
 * Production readiness check for the linked Supabase project.
 *
 * Read-only. Verifies the things that fail silently rather than loudly — the
 * encryption key in particular, where a wrong value still "works" and encrypts
 * real credentials with something public.
 *
 * Usage (with the repo linked to the PROD project):
 *   node scripts/verify-prod-config.mjs
 */
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadEnv } from './load-env.mjs';
import { resolveConnectableDbUrl, resolveProjectRef } from './lib/psql-dev.mjs';
import { DEV_PROJECT_REF } from './lib/assert-dev-project.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
loadEnv();

/** Keys that must never appear in production — they are public in git. */
const DEV_KEYS = [
  'UEJrMG6V+56CEafyEu+H8wIzIdm+fO3El58wQ7323nU=',
  '0uT6CrQXiMJab+raSRxxx0j7ZLYvwKCb2HCoQusCfiY=',
];

const results = [];
function record(name, ok, detail) {
  results.push({ name, ok, detail });
  const mark = ok ? '[32mPASS[0m' : '[31mFAIL[0m';
  console.log(`  ${mark}  ${name}${detail ? ` — ${detail}` : ''}`);
}

let dbUrl;
try {
  dbUrl = resolveConnectableDbUrl(root);
} catch (e) {
  console.error(e.message);
  process.exit(1);
}

/**
 * The Supabase session pooler intermittently drops the first connection
 * ("server closed the connection unexpectedly"). Observed twice while building
 * this script. Retrying matters here specifically: a transient blip on a
 * production readiness check reads as "your encryption key is missing", which
 * is exactly the wrong thing to make someone doubt.
 */
function q(sql, attempt = 1) {
  const r = spawnSync('psql', ['-d', dbUrl, '-tAc', sql], { encoding: 'utf8', shell: false });
  if (r.error) throw new Error(`psql failed to start: ${r.error.message}`);
  if (r.status !== 0) {
    const err = (r.stderr || '').trim();
    const transient = /server closed the connection|connection reset|could not connect|timeout expired/i.test(err);
    if (transient && attempt < 3) return q(sql, attempt + 1);
    throw new Error(err || `psql exited ${r.status}`);
  }
  return (r.stdout || '').trim();
}

const ref = resolveProjectRef();
console.log(`\nVerifying project: ${ref ?? '(unknown)'}\n`);

if (ref === DEV_PROJECT_REF) {
  console.log(
    '[33mThis is the DEV project. These checks describe production readiness,\n' +
      'so failures below are expected here.[0m\n',
  );
}

try {
  // --- encryption key -------------------------------------------------------
  const key = q("SELECT value FROM private.platform_config WHERE key = 'encryption_key'");
  if (!key) {
    record('encryption_key set', false, 'missing — credential RPCs will raise');
  } else if (DEV_KEYS.includes(key)) {
    record('encryption_key is not a dev key', false, 'DEV KEY IN USE — public in git, rotate now');
  } else {
    record('encryption_key set and non-dev', true, `${key.length} chars`);
  }

  // --- cron config ----------------------------------------------------------
  const fnUrl = q("SELECT value FROM private.platform_config WHERE key = 'supabase_functions_url'");
  record('supabase_functions_url set', Boolean(fnUrl), fnUrl || 'missing');
  if (fnUrl && ref) {
    record(
      'supabase_functions_url matches linked ref',
      fnUrl.includes(ref),
      fnUrl.includes(ref) ? undefined : `points at a different project than ${ref}`,
    );
  }
  const cronSecret = q("SELECT value FROM private.platform_config WHERE key = 'cron_secret'");
  record('cron_secret set', Boolean(cronSecret), cronSecret ? 'set' : 'missing');

  // --- extensions + jobs ----------------------------------------------------
  for (const ext of ['pg_cron', 'pg_net']) {
    const on = q(`SELECT 1 FROM pg_extension WHERE extname = '${ext}'`) === '1';
    record(`${ext} enabled`, on, on ? undefined : 'not installed');
  }
  const jobCount = Number(q('SELECT count(*) FROM cron.job') || '0');
  record('cron.job has scheduled jobs', jobCount > 0, `${jobCount} job(s)`);

  // --- no demo data ---------------------------------------------------------
  const demoTenants = q(
    "SELECT count(*) FROM tenants WHERE id = '00000000-0000-0000-0000-000000000001'::uuid",
  );
  record('no seed tenant present', demoTenants === '0', `${demoTenants} seed tenant(s)`);

  // --- schema sanity --------------------------------------------------------
  const migrations = Number(
    q('SELECT count(*) FROM supabase_migrations.schema_migrations') || '0',
  );
  record('migration chain applied', migrations > 0, `${migrations} migration(s) recorded`);
} catch (e) {
  console.error(`\nCheck aborted: ${e.message}\n`);
  process.exit(1);
}

const failed = results.filter((r) => !r.ok);
console.log(
  failed.length === 0
    ? '\n[32mAll checks passed.[0m\n'
    : `\n[31m${failed.length} check(s) failed.[0m\n`,
);
process.exit(failed.length === 0 ? 0 : 1);
