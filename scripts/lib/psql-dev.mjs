/**
 * Shared psql helpers for linked Supabase dev (remote only).
 */
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

/** @type {string | null} */
let cachedConnectableDbUrl = null;

export function resolveProjectRef() {
  if (process.env.SUPABASE_PROJECT_REF) {
    return process.env.SUPABASE_PROJECT_REF;
  }
  const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL ?? '';
  const match = url.match(/https:\/\/([^.]+)\.supabase\.co/);
  return match?.[1] ?? null;
}

export function resolveFunctionsBaseUrl() {
  const ref = resolveProjectRef();
  if (!ref) return null;
  return `https://${ref}.supabase.co`;
}

export function buildDirectDbUrl(ref, password) {
  const encoded = encodeURIComponent(password);
  return `postgresql://postgres:${encoded}@db.${ref}.supabase.co:5432/postgres`;
}

export function buildSessionPoolerDbUrl(ref, password, host) {
  const encoded = encodeURIComponent(password);
  return `postgresql://postgres.${ref}:${encoded}@${host}:5432/postgres`;
}

/**
 * Preferred URL from env (may still be IPv6-only direct host).
 */
export function resolveDbUrl() {
  if (process.env.SUPABASE_DB_URL) {
    return process.env.SUPABASE_DB_URL;
  }
  const ref = resolveProjectRef();
  const password = process.env.SUPABASE_DB_PASSWORD;
  if (!ref || !password) {
    return null;
  }
  if (process.env.SUPABASE_DB_POOLER_HOST) {
    return buildSessionPoolerDbUrl(ref, password, process.env.SUPABASE_DB_POOLER_HOST);
  }
  return buildDirectDbUrl(ref, password);
}

/**
 * Parse linked-project pooler host from Supabase CLI dry-run output.
 * Newer projects use aws-1-<region>.pooler.supabase.com (not aws-0).
 */
export function resolveDbUrlFromSupabaseCli(cwd = scriptRoot) {
  const out = runSupabaseLinkedDryRun(cwd);
  if (!out) {
    return null;
  }
  const host = out.match(/export PGHOST="([^"]+)"/)?.[1];
  const port = out.match(/export PGPORT="([^"]+)"/)?.[1] ?? '5432';
  const user = out.match(/export PGUSER="([^"]+)"/)?.[1];
  const password =
    process.env.SUPABASE_DB_PASSWORD?.trim() ||
    out.match(/export PGPASSWORD="([^"]+)"/)?.[1];
  if (!host || !user || !password) {
    return null;
  }
  const encoded = encodeURIComponent(password);
  return `postgresql://${user}:${encoded}@${host}:${port}/postgres`;
}

function runSupabaseLinkedDryRun(cwd) {
  const attempts = [
    () =>
      spawnSync('pnpm', ['exec', 'supabase', 'db', 'dump', '--linked', '--dry-run'], {
        encoding: 'utf8',
        shell: true,
        cwd,
      }),
    () =>
      spawnSync('npx', ['supabase', 'db', 'dump', '--linked', '--dry-run'], {
        encoding: 'utf8',
        shell: true,
        cwd,
      }),
    () =>
      spawnSync('supabase', ['db', 'dump', '--linked', '--dry-run'], {
        encoding: 'utf8',
        shell: false,
        cwd,
      }),
  ];
  for (const run of attempts) {
    const result = run();
    if (result.status === 0 && result.stdout) {
      return result.stdout;
    }
  }
  return null;
}

function isDnsError(message) {
  return message.includes('could not translate host name');
}

function connectivityTip() {
  return (
    `Tip: add SUPABASE_DB_URL to .env from Dashboard → Database → Connection string (URI, session mode), ` +
    `or set SUPABASE_DB_PASSWORD to your real database password (not a placeholder). ` +
    `On Windows the direct db.<ref>.supabase.co host is often IPv6-only.`
  );
}

/**
 * Resolve a URL that works with local psql (pooler fallback when direct host is IPv6-only).
 */
export function resolveConnectableDbUrl(cwd = scriptRoot) {
  if (cachedConnectableDbUrl) {
    return cachedConnectableDbUrl;
  }

  const explicit = process.env.SUPABASE_DB_URL?.trim();
  if (explicit) {
    cachedConnectableDbUrl = explicit;
    return explicit;
  }

  const ref = resolveProjectRef();
  const password = process.env.SUPABASE_DB_PASSWORD?.trim();
  if (!ref || !password) {
    return null;
  }

  if (process.env.SUPABASE_DB_POOLER_HOST) {
    cachedConnectableDbUrl = buildSessionPoolerDbUrl(
      ref,
      password,
      process.env.SUPABASE_DB_POOLER_HOST,
    );
    return cachedConnectableDbUrl;
  }

  const direct = buildDirectDbUrl(ref, password);
  try {
    runPsqlQuery(direct, 'SELECT 1');
    cachedConnectableDbUrl = direct;
    return direct;
  } catch (e) {
    if (!isDnsError(e.message)) {
      throw e;
    }
  }

  const fromCli = resolveDbUrlFromSupabaseCli(cwd);
  if (fromCli) {
    console.log(
      `Direct db.${ref}.supabase.co is not reachable (IPv6-only). Using linked session pooler.`,
    );
    runPsqlQuery(fromCli, 'SELECT 1');
    cachedConnectableDbUrl = fromCli;
    return fromCli;
  }

  throw new Error(
    `could not translate host name "db.${ref}.supabase.co" to address\n\n${connectivityTip()}`,
  );
}

/**
 * Run a single SQL statement; returns trimmed stdout (empty string on no rows).
 * shell:false — required on Windows; shell:true splits -c SQL on spaces.
 */
export function runPsqlQuery(dbUrl, sql) {
  const result = spawnSync(
    'psql',
    ['-d', dbUrl, '-v', 'ON_ERROR_STOP=1', '-t', '-A', '-c', sql],
    { encoding: 'utf8', shell: false },
  );
  if (result.error) {
    throw new Error(
      `psql failed: ${result.error.message}. Is psql installed and on PATH?`,
    );
  }
  if (result.status !== 0) {
    const err = (result.stderr || result.stdout || '').trim();
    if (isDnsError(err)) {
      throw new Error(`${err}\n\n${connectivityTip()}`);
    }
    if (err.includes('password authentication failed')) {
      throw new Error(
        `${err}\n\nYour SUPABASE_DB_PASSWORD in .env does not match the project database password. ` +
          `Reset or copy it from Dashboard → Project Settings → Database, or paste the full ` +
          `session-mode URI as SUPABASE_DB_URL.`,
      );
    }
    throw new Error(err || `psql exited ${result.status}`);
  }
  return (result.stdout ?? '').trim();
}

export function sqlLiteral(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}
