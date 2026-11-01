#!/usr/bin/env node
/**
 * Read-only migration drift check for one hosted project.
 *
 * Compares supabase/migrations/*.sql (git = source of truth) with
 * supabase_migrations.schema_migrations on the target database, inside a
 * READ ONLY transaction (the query cannot write, whatever the role allows).
 *
 *   DB_URL=… node scripts/ci/migration-drift.mjs --env dev|prod [--md out.md]
 *
 * Result categories:
 *   unknown  — applied on the project but not in git. Always drift: someone
 *              changed the schema outside the pipeline (dashboard, CLI, MCP).
 *   pending  — in git but not applied. Drift on dev (deploy-dev should have
 *              applied it); on prod it is just "not released yet" (info).
 * Exit: 0 clean, 1 drift, 2 could not check. Never prints the URL.
 */
import { spawnSync } from 'node:child_process';
import { readdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

export function repoVersions(dir = join(root, 'supabase/migrations')) {
  return readdirSync(dir)
    .map((f) => f.match(/^(\d{14})_.+\.sql$/))
    .filter(Boolean)
    .map((m) => ({ version: m[1], file: m[0] }))
    .sort((a, b) => a.version.localeCompare(b.version));
}

export function diff(repo, applied, env) {
  const repoSet = new Set(repo.map((r) => r.version));
  const appliedSet = new Set(applied);
  const unknown = [...appliedSet].filter((v) => !repoSet.has(v)).sort();
  const pending = repo.filter((r) => !appliedSet.has(r.version)).map((r) => r.file);
  const drift = unknown.length > 0 || (env === 'dev' && pending.length > 0);
  return { unknown, pending, drift };
}

function appliedVersions(url) {
  const sql =
    'BEGIN READ ONLY; SELECT version FROM supabase_migrations.schema_migrations ORDER BY version; COMMIT;';
  for (let attempt = 1; attempt <= 3; attempt++) {
    const r = spawnSync('psql', ['-X', '-q', '-tA', '-v', 'ON_ERROR_STOP=1', '-d', url, '-c', sql], { encoding: 'utf8' });
    if (r.status === 0) return r.stdout.split('\n').map((s) => s.trim()).filter((s) => /^\d+$/.test(s));
    // Redact anything URL-shaped from psql's error before showing it.
    const msg = (r.stderr || '').replace(/postgres(ql)?:\/\/\S+/g, '<db-url>').trim();
    if (attempt === 3) throw new Error(msg || `psql exited ${r.status}`);
    spawnSync('sleep', ['10']);
  }
}

export function toMarkdown(env, ref, result) {
  const lines = [`### ${env} (\`${ref ?? 'unknown ref'}\`)`, ''];
  if (result.unknown.length) {
    lines.push(`**Applied on ${env} but not in git (drift):**`, ...result.unknown.map((v) => `- \`${v}\``), '');
  }
  if (result.pending.length) {
    lines.push(
      env === 'dev' ? '**In git but not applied on dev (drift — deploy-dev should have applied these):**' : '**Waiting for the next prod release (not drift):**',
      ...result.pending.map((f) => `- \`${f}\``),
      '',
    );
  }
  if (!result.unknown.length && !result.pending.length) lines.push('In sync with `main`.', '');
  return lines.join('\n');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const argv = process.argv.slice(2);
  const env = argv[argv.indexOf('--env') + 1];
  const mdOut = argv.includes('--md') ? argv[argv.indexOf('--md') + 1] : null;
  try {
    if (!['dev', 'prod'].includes(env)) throw new Error('usage: --env dev|prod');
    if (!process.env.DB_URL) throw new Error('DB_URL is not set');
    const result = diff(repoVersions(), appliedVersions(process.env.DB_URL), env);
    const md = toMarkdown(env, process.env.PROJECT_REF, result);
    console.log(md);
    if (mdOut) writeFileSync(mdOut, md);
    process.exit(result.drift ? 1 : 0);
  } catch (e) {
    console.error(`::error::drift check (${env}) could not run: ${e.message}`);
    if (mdOut) writeFileSync(mdOut, `### ${env}\n\nCould not check: ${e.message}\n`);
    process.exit(2);
  }
}
