#!/usr/bin/env node
/**
 * Run supabase/seed.sql (and optionally seed-finance.sql) against linked dev via psql.
 *
 * Requires in repo-root .env:
 *   SUPABASE_PROJECT_REF
 *   SUPABASE_DB_PASSWORD
 * Or override: SUPABASE_DB_URL=postgresql://postgres:...@db.<ref>.supabase.co:5432/postgres
 *
 * Usage:
 *   pnpm seed:dev                 # seed.sql only
 *   pnpm seed:dev -- --finance    # seed.sql + seed-finance.sql (post Stage 1 schema)
 *   pnpm seed:dev -- --skin=therapist
 *   pnpm seed:dev -- --all-skins
 *   pnpm seed:dev -- --all-skins --no-base
 *   pnpm seed:dev -- --checklist  # print manual SQL Editor steps (no psql)
 *
 * Hosted parent login: run `pnpm seed:auth-parent` before seed if auth.users missing.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadEnv } from './load-env.mjs';
import { resolveConnectableDbUrl } from './lib/psql-dev.mjs';

loadEnv();

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const checklistOnly = args.includes('--checklist');
const withFinance = args.includes('--finance');
const seedBase = !args.includes('--no-base');
const allSkins = args.includes('--all-skins');
const skinArg = args.find((arg) => arg.startsWith('--skin=')) ?? null;
const requestedSkin = skinArg ? skinArg.split('=')[1]?.trim() : null;
const skinSeedFiles = {
  therapist: 'supabase/seed-therapist.sql',
  photographer: 'supabase/seed-photographer.sql',
  sofer: 'supabase/seed-sofer.sql',
  artclass: 'supabase/seed-artclass.sql',
};
const validSkins = Object.keys(skinSeedFiles);

function printChecklist() {
  console.log(`
Dev seed checklist (linked Supabase — not local Docker)
======================================================
1. [YOU] reset_dev_db.sql in SQL Editor (full rebuild only — Stage 1)
2. [AGENT] pnpm db:sync
3. [YOU] pnpm seed:auth-parent  (hosted dev — skip if auth users already exist)
4. [YOU] pnpm seed:dev          (or paste seed.sql in SQL Editor)
5. [YOU] pnpm seed:dev -- --skin=therapist   (or photographer / sofer / artclass)
6. [YOU] pnpm seed:dev -- --all-skins        (optional: seed all demo skins)
7. [YOU] pnpm seed:dev -- --finance          (after Stage 1 schema — or paste seed-finance.sql)

Finance test logins (see supabase/seed-finance.sql header):
  Parent: miriamrstern@gmail.com / devPassword123
  Admin:  miriamrteller@gmail.com / devPassword123
`);
}

function runPsqlFile(dbUrl, relativePath) {
  const filePath = join(root, relativePath);
  if (!existsSync(filePath)) {
    console.error(`Missing file: ${relativePath}`);
    process.exit(1);
  }
  console.log(`Running ${relativePath} ...`);
  const result = spawnSync(
    'psql',
    ['-d', dbUrl, '-v', 'ON_ERROR_STOP=1', '-f', filePath],
    { stdio: 'inherit', shell: false },
  );
  if (result.error) {
    console.error(`
psql not found or failed to start: ${result.error.message}

Run manually in Supabase SQL Editor:
  ${relativePath}
`);
    process.exit(1);
  }
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

if (checklistOnly) {
  printChecklist();
  process.exit(0);
}

let dbUrl;
try {
  dbUrl = resolveConnectableDbUrl(root);
} catch (e) {
  console.error(e.message);
  printChecklist();
  process.exit(1);
}
if (!dbUrl) {
  console.error('Set SUPABASE_PROJECT_REF + SUPABASE_DB_PASSWORD (or SUPABASE_DB_URL) in .env');
  printChecklist();
  process.exit(1);
}

if (requestedSkin && !validSkins.includes(requestedSkin)) {
  console.error(
    `Unknown --skin value "${requestedSkin}". Valid values: ${validSkins.join(', ')}`,
  );
  process.exit(1);
}

if (seedBase) {
  runPsqlFile(dbUrl, 'supabase/seed.sql');
} else {
  console.log('Skipping supabase/seed.sql (--no-base)');
}

if (requestedSkin) {
  runPsqlFile(dbUrl, skinSeedFiles[requestedSkin]);
}

if (allSkins) {
  for (const skin of validSkins) {
    // Avoid double-running the same file when both --skin and --all-skins are passed.
    if (skin === requestedSkin) continue;
    runPsqlFile(dbUrl, skinSeedFiles[skin]);
  }
}

if (withFinance) {
  runPsqlFile(dbUrl, 'supabase/seed-finance.sql');
} else {
  console.log(
    '\nTip: after Stage 1 finance schema, run: pnpm seed:dev -- --finance',
  );
}

console.log('\nSeed complete.');
