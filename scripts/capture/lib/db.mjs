/**
 * Dev-pinned psql access for capture scripts — same safety posture as
 * seed-capture.mjs: loads .env.dev directly, refuses anything but the pinned
 * dev project, no bypass.
 */
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { DEV_PROJECT_REF } from '../config.mjs';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

function parseEnvFile(filePath) {
  const out = {};
  for (const line of readFileSync(filePath, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const sep = trimmed.indexOf('=');
    if (sep === -1) continue;
    let value = trimmed.slice(sep + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    out[trimmed.slice(0, sep).trim()] = value;
  }
  return out;
}

/**
 * Session-pooler host for the pinned dev project (region ap-northeast-2).
 * The direct db.<ref> host is IPv6-only on this machine and the supabase-CLI
 * fallback is flaky (exits 1 while printing valid output), so pin the pooler
 * explicitly — psql-dev uses SUPABASE_DB_POOLER_HOST directly when set.
 */
const DEV_POOLER_HOST = 'aws-1-ap-northeast-2.pooler.supabase.com';

/** Returns { runSql(sql) } bound to the dev DB, or throws. */
export async function devDb() {
  const devEnv = parseEnvFile(join(repoRoot, '.env.dev'));
  for (const key of ['SUPABASE_PROJECT_REF', 'SUPABASE_URL', 'SUPABASE_DB_PASSWORD', 'SUPABASE_DB_URL', 'SUPABASE_DB_POOLER_HOST']) {
    if (devEnv[key] !== undefined) process.env[key] = devEnv[key];
    else delete process.env[key];
  }
  if (!process.env.SUPABASE_DB_POOLER_HOST && !process.env.SUPABASE_DB_URL) {
    process.env.SUPABASE_DB_POOLER_HOST = DEV_POOLER_HOST;
  }
  delete process.env.ALLOW_NON_DEV_PROJECT;

  if (process.env.SUPABASE_PROJECT_REF !== DEV_PROJECT_REF) {
    throw new Error(`refusing: .env.dev ref "${process.env.SUPABASE_PROJECT_REF}" != pinned dev "${DEV_PROJECT_REF}"`);
  }
  const { assertDevProject } = await import(pathToFileURL(join(repoRoot, 'scripts', 'lib', 'assert-dev-project.mjs')).href);
  assertDevProject('capture db helper');
  const { resolveConnectableDbUrl } = await import(pathToFileURL(join(repoRoot, 'scripts', 'lib', 'psql-dev.mjs')).href);
  const url = resolveConnectableDbUrl(repoRoot);

  // Non-ASCII SQL (Hebrew tenant names) is mangled to '?' when passed as a
  // psql -c argument on Windows (ANSI argv conversion). Route every statement
  // through a UTF-8 temp file with client_encoding pinned instead.
  const runSql = (sql) => {
    const dir = mkdtempSync(join(tmpdir(), 'capture-sql-'));
    const file = join(dir, 'stmt.sql');
    writeFileSync(file, `SET client_encoding TO 'UTF8';\n${sql};\n`, 'utf8');
    try {
      const result = spawnSync(
        'psql',
        ['-d', url, '-v', 'ON_ERROR_STOP=1', '-t', '-A', '-f', file],
        { encoding: 'utf8', shell: false, env: { ...process.env, PGCLIENTENCODING: 'UTF8' } },
      );
      if (result.error) throw new Error(`psql failed: ${result.error.message}`);
      if (result.status !== 0) {
        throw new Error((result.stderr || result.stdout || `psql exited ${result.status}`).trim());
      }
      return (result.stdout ?? '').trim();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  };

  return { runSql };
}
