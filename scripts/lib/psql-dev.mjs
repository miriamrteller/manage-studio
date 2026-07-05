/**
 * Shared psql helpers for linked Supabase dev (remote only).
 */
import { spawnSync } from 'node:child_process';

export function resolveDbUrl() {
  if (process.env.SUPABASE_DB_URL) {
    return process.env.SUPABASE_DB_URL;
  }
  const ref = process.env.SUPABASE_PROJECT_REF;
  const password = process.env.SUPABASE_DB_PASSWORD;
  if (!ref || !password) {
    return null;
  }
  const encoded = encodeURIComponent(password);
  return `postgresql://postgres:${encoded}@db.${ref}.supabase.co:5432/postgres`;
}

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
    if (err.includes('could not translate host name')) {
      throw new Error(
        `${err}\n\nTip: set SUPABASE_DB_URL in .env to the full connection string from ` +
          `Supabase Dashboard → Project Settings → Database → Connection string (URI, session mode).`,
      );
    }
    throw new Error(err || `psql exited ${result.status}`);
  }
  return (result.stdout ?? '').trim();
}

export function sqlLiteral(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}
