#!/usr/bin/env node
/**
 * Post-squash + pg_cron validation for linked remote Supabase dev.
 *
 * Requires repo-root .env:
 *   SUPABASE_PROJECT_REF + SUPABASE_DB_PASSWORD  (or SUPABASE_DB_URL)
 *   CRON_SECRET — for HTTP smokes + optional --set-gucs
 *
 * Usage:
 *   pnpm smoke:cron:dev              # all automated checks
 *   pnpm smoke:cron:dev -- --set-gucs   # UPSERT private.platform_config (needs CRON_SECRET)
 *   pnpm smoke:cron:dev -- --print-gucs-sql  # paste into SQL Editor (no psql needed)
 *   pnpm smoke:cron:dev -- --with-tests # also run vitest dunning tests
 *   pnpm smoke:cron:dev -- --checklist  # agent prompt + human preflight
 *
 * Dashboard (human): enable pg_cron + pg_net; set Edge secrets CRON_SECRET, APP_URL.
 */
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadEnv } from './load-env.mjs';
import {
  resolveConnectableDbUrl,
  resolveFunctionsBaseUrl,
  resolveProjectRef,
  runPsqlQuery,
  sqlLiteral,
} from './lib/psql-dev.mjs';

loadEnv();

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const args = new Set(process.argv.slice(2));

const ENGAGEMENT_1001 = '00000000-0000-0000-0000-000000001001';
const ENGAGEMENT_1002 = '00000000-0000-0000-0000-000000001002';

/** @type {{ name: string; pass: boolean; detail: string; skip?: boolean }[]} */
const results = [];

function record(name, pass, detail, skip = false) {
  results.push({ name, pass, detail, skip });
  const tag = skip ? 'SKIP' : pass ? 'PASS' : 'FAIL';
  console.log(`[${tag}] ${name}${detail ? ` — ${detail}` : ''}`);
}

function buildCronConfigSql(functionsBase, cronSecret) {
  return `INSERT INTO private.platform_config (key, value) VALUES
  ('supabase_functions_url', ${sqlLiteral(functionsBase)}),
  ('cron_secret', ${sqlLiteral(cronSecret)})
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;`;
}

/** @deprecated alias */
function buildGucsSql(functionsBase, cronSecret) {
  return [buildCronConfigSql(functionsBase, cronSecret)];
}

function printCronConfigSql(functionsBase, cronSecret) {
  console.log(`
Could not connect via psql. Run this in Supabase Dashboard → SQL Editor:

${buildCronConfigSql(functionsBase, cronSecret)}

Then re-run: pnpm smoke:cron:dev

Note: ALTER DATABASE ... SET app.settings.* fails on hosted Supabase (permission denied).
`);
}

function printAgentChecklist() {
  console.log(`
Fresh DB + cron smoke (remote Supabase dev)
===========================================

Human preflight (Dashboard — agent cannot do):
  [ ] Database → Extensions: pg_cron, pg_net enabled
  [ ] Edge Functions → Secrets: CRON_SECRET, APP_URL
  [ ] Edge functions deployed: run-enrolment-payment-dunning, run-monthly-billing,
      send-waiver-reminder, issue-document

Repo .env (required for this script):
  SUPABASE_PROJECT_REF + SUPABASE_DB_PASSWORD  (or SUPABASE_DB_URL)
  CRON_SECRET=...   (same value as Edge secret + DB GUC)

If not done yet:
  pnpm smoke:cron:dev -- --set-gucs
  pnpm seed:dev -- --finance

Agent / automated:
  pnpm smoke:cron:dev
  pnpm smoke:cron:dev -- --with-tests

Full doc: docs/deployment/FRESH_DB_CRON_SMOKE.md
`);
}

function runTests() {
  console.log('\nRunning vitest dunning tests...');
  spawnSync('pnpm', ['-C', 'packages/shared', 'build'], {
    stdio: 'inherit',
    shell: true,
    cwd: root,
  });
  const test = spawnSync(
    'pnpm',
    [
      '-C',
      'apps/web',
      'test',
      '--',
      'payment-dunning-collections',
      'enrolment-payment-dunning',
      'enrolment-dunning-time',
    ],
    { stdio: 'inherit', shell: true, cwd: root },
  );
  record('vitest dunning tests', test.status === 0, test.status === 0 ? 'green' : `exit ${test.status}`);
}

async function postDunningCron(functionsBase, cronSecret) {
  const url = `${functionsBase}/functions/v1/run-enrolment-payment-dunning`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-cron-secret': cronSecret,
    },
    body: '{}',
  });
  const text = await res.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    body = text.slice(0, 200);
  }
  return { status: res.status, body };
}

function engagementRow(dbUrl, id) {
  const sql = `
    SELECT payment_dunning_attempt_count || ',' || COALESCE(payment_dunning_next_at::text, '')
    FROM engagements WHERE id = '${id}'::uuid;
  `;
  try {
    return runPsqlQuery(dbUrl, sql);
  } catch {
    return null;
  }
}

function dunningKeyCount(dbUrl) {
  try {
    return Number(
      runPsqlQuery(
        dbUrl,
        `SELECT COUNT(*) FROM notification_log WHERE variables->>'dunning_key' IS NOT NULL`,
      ),
    );
  } catch {
    return null;
  }
}

async function main() {
  if (args.has('--checklist')) {
    printAgentChecklist();
    process.exit(0);
  }

  const cronSecret = process.env.CRON_SECRET?.trim() || '';
  const functionsBase = resolveFunctionsBaseUrl();

  if (args.has('--print-gucs-sql')) {
    if (!cronSecret || !functionsBase) {
      console.error('Need CRON_SECRET in .env and a resolvable project ref');
      process.exit(1);
    }
    console.log(
      `-- Paste into Supabase Dashboard → SQL Editor → Run\n\n${buildCronConfigSql(functionsBase, cronSecret)}`,
    );
    process.exit(0);
  }

  let dbUrl;
  try {
    dbUrl = resolveConnectableDbUrl(root);
  } catch (e) {
    console.error(e.message);
    if (cronSecret && functionsBase) {
      console.error('\nAlternatively, set cron config without psql:\n');
      console.log(buildCronConfigSql(functionsBase, cronSecret));
    }
    printAgentChecklist();
    process.exit(1);
  }
  if (!dbUrl) {
    console.error('Missing SUPABASE_PROJECT_REF + SUPABASE_DB_PASSWORD (or SUPABASE_DB_URL) in .env');
    printAgentChecklist();
    process.exit(1);
  }

  if (args.has('--set-gucs')) {
    if (!cronSecret) {
      console.error('--set-gucs requires CRON_SECRET in .env');
      process.exit(1);
    }
    if (!functionsBase) {
      console.error('Cannot resolve project ref for functions URL');
      process.exit(1);
    }
    console.log('Setting cron config in private.platform_config via psql...');
    try {
      runPsqlQuery(dbUrl, buildCronConfigSql(functionsBase, cronSecret));
      console.log('Cron config set. pg_cron jobs will read it on next run.\n');
    } catch (e) {
      console.error(e.message);
      printCronConfigSql(functionsBase, cronSecret);
      process.exit(1);
    }
  }

  console.log('Smoke: squash schema + pg_cron (remote dev)\n');

  // --- DB connectivity ---
  try {
    runPsqlQuery(dbUrl, 'SELECT 1');
    record('psql connectivity', true, 'ok');
  } catch (e) {
    record('psql connectivity', false, e.message);
    printSummary();
    process.exit(1);
  }

  // --- Migrations ---
  try {
    const n = Number(
      runPsqlQuery(
        dbUrl,
        `SELECT COUNT(*) FROM supabase_migrations.schema_migrations WHERE version LIKE '202606%'`,
      ),
    );
    record('migrations (202606*)', n >= 27, `count=${n} (expect ≥27)`);
  } catch (e) {
    record('migrations (202606*)', false, e.message);
  }

  // --- Dunning schema ---
  try {
    const cols = runPsqlQuery(
      dbUrl,
      `SELECT COUNT(*) FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'engagements'
         AND column_name LIKE 'payment_dunning%'`,
    );
    record('engagements.payment_dunning_* columns', Number(cols) === 2, `count=${cols}`);
  } catch (e) {
    record('engagements.payment_dunning_* columns', false, e.message);
  }

  try {
    const idx = runPsqlQuery(
      dbUrl,
      `SELECT COUNT(*) FROM pg_indexes WHERE indexname = 'idx_notification_log_dunning_key'`,
    );
    record('idx_notification_log_dunning_key', Number(idx) === 1, '');
  } catch (e) {
    record('idx_notification_log_dunning_key', false, e.message);
  }

  // --- RPCs ---
  try {
    const rpcs = runPsqlQuery(
      dbUrl,
      `SELECT COUNT(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = 'public' AND p.proname IN (
         'get_finance_summary', 'get_admin_dashboard_overview', 'resolve_notification_blast_recipients'
       )`,
    );
    record('folded RPCs present', Number(rpcs) === 3, `count=${rpcs}`);
  } catch (e) {
    record('folded RPCs present', false, e.message);
  }

  // --- Extensions + cron ---
  try {
    const ext = runPsqlQuery(
      dbUrl,
      `SELECT COUNT(*) FROM pg_extension WHERE extname IN ('pg_cron', 'pg_net')`,
    );
    record('extensions pg_cron + pg_net', Number(ext) === 2, `count=${ext}`);
  } catch (e) {
    record('extensions pg_cron + pg_net', false, e.message);
  }

  try {
    const jobs = runPsqlQuery(dbUrl, `SELECT COUNT(*) FROM cron.job`);
    record('cron.job rows', Number(jobs) >= 7, `count=${jobs} (expect ≥7)`);
  } catch (e) {
    record('cron.job rows', false, e.message);
  }

  // --- Cron config (platform_config; hosted Supabase cannot ALTER DATABASE GUCs) ---
  try {
    const cfg = runPsqlQuery(
      dbUrl,
      `SELECT COUNT(*) FROM private.platform_config
       WHERE key IN ('supabase_functions_url', 'cron_secret') AND length(value) > 0`,
    );
    const n = Number(cfg);
    record('cron platform_config', n === 2, n === 2 ? 'both keys set' : `count=${n} — run --print-gucs-sql`);
  } catch (e) {
    record('cron platform_config', false, e.message);
  }

  try {
    const url = runPsqlQuery(dbUrl, `SELECT get_supabase_functions_url()`);
    const hasUrl = url.length > 0 && url.includes('.supabase.co');
    record('get_supabase_functions_url()', hasUrl, hasUrl ? 'ok' : 'empty');
  } catch (e) {
    record(
      'get_supabase_functions_url()',
      false,
      e.message.includes('not configured') ? 'missing — run --print-gucs-sql' : e.message,
    );
  }

  try {
    const secretLen = Number(runPsqlQuery(dbUrl, `SELECT length(get_cron_secret())`));
    record('get_cron_secret()', secretLen > 0, secretLen > 0 ? 'ok' : 'missing — run --print-gucs-sql');
  } catch (e) {
    record(
      'get_cron_secret()',
      false,
      e.message.includes('not configured') ? 'missing — run --print-gucs-sql' : e.message,
    );
  }

  // --- Seed fixtures ---
  try {
    const seeded = runPsqlQuery(
      dbUrl,
      `SELECT COUNT(*) FROM engagements WHERE id IN (
         '${ENGAGEMENT_1001}'::uuid, '${ENGAGEMENT_1002}'::uuid
       )`,
    );
    const ok = Number(seeded) === 2;
    record(
      'seed-finance dunning fixtures (1001, 1002)',
      ok,
      ok ? 'present' : `count=${seeded} — run: pnpm seed:dev -- --finance`,
    );
  } catch (e) {
    record('seed-finance dunning fixtures (1001, 1002)', false, e.message);
  }

  // --- HTTP dunning ---
  if (!cronSecret) {
    record('HTTP run-enrolment-payment-dunning', false, 'CRON_SECRET not in .env', true);
  } else if (!functionsBase) {
    record('HTTP run-enrolment-payment-dunning', false, 'cannot resolve project ref', true);
  } else {
    try {
      const before1001 = engagementRow(dbUrl, ENGAGEMENT_1001);
      const before1002 = engagementRow(dbUrl, ENGAGEMENT_1002);
      const keysBefore = dunningKeyCount(dbUrl);

      const first = await postDunningCron(functionsBase, cronSecret);
      const httpOk = first.status === 200;
      record(
        'HTTP run-enrolment-payment-dunning',
        httpOk,
        `status=${first.status}${httpOk ? '' : ` body=${JSON.stringify(first.body).slice(0, 120)}`}`,
      );

      if (httpOk) {
        const after1001 = engagementRow(dbUrl, ENGAGEMENT_1001);
        const after1002 = engagementRow(dbUrl, ENGAGEMENT_1002);
        const moved =
          (before1001 !== after1001 && after1001 !== null) ||
          (before1002 !== after1002 && after1002 !== null);
        record(
          'dunning counters moved (1001 or 1002)',
          moved,
          moved ? `1001: ${before1001} → ${after1001}` : 'no change (may already be exhausted)',
        );

        const keysAfterFirst = dunningKeyCount(dbUrl);
        if (keysBefore !== null && keysAfterFirst !== null && keysAfterFirst > keysBefore) {
          const second = await postDunningCron(functionsBase, cronSecret);
          const keysAfterSecond = dunningKeyCount(dbUrl);
          record(
            'dunning idempotency (re-POST)',
            keysAfterSecond === keysAfterFirst && second.status === 200,
            `notification_log dunning rows: ${keysAfterFirst} → ${keysAfterSecond}`,
          );
        } else {
          record(
            'dunning idempotency (re-POST)',
            true,
            'skipped — no new dunning_key rows on first run',
            true,
          );
        }
      }
    } catch (e) {
      record('HTTP run-enrolment-payment-dunning', false, e.message);
    }
  }

  if (args.has('--with-tests')) {
    runTests();
  }

  printSummary();
  process.exit(results.some((r) => !r.pass && !r.skip) ? 1 : 0);
}

function printSummary() {
  console.log('\n--- Summary ---');
  const pad = Math.max(...results.map((r) => r.name.length), 8);
  for (const r of results) {
    const status = r.skip ? 'SKIP' : r.pass ? 'PASS' : 'FAIL';
    console.log(`${status.padEnd(5)} ${r.name.padEnd(pad)}  ${r.detail}`);
  }
  const failed = results.filter((r) => !r.pass && !r.skip).length;
  const passed = results.filter((r) => r.pass).length;
  console.log(`\n${passed} passed, ${failed} failed, ${results.length - passed - failed} skipped`);
  if (failed > 0) {
    console.log('\nSee docs/deployment/FRESH_DB_CRON_SMOKE.md for fixes.');
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
