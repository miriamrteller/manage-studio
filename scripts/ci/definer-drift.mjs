#!/usr/bin/env node
/**
 * Read-only: SECURITY DEFINER functions on a hosted project (schemas public,
 * private) that are NOT classified in supabase/security/definer-execute.json,
 * i.e. created outside git (dashboard, SQL editor, platform features).
 * 20261101000100_security_definer_hardening.sql aborts on any of them, and
 * they bypass the EXECUTE policy, so each one needs a decision.
 *
 *   DB_URL=… node scripts/ci/definer-drift.mjs --env dev|prod [--md out.md]
 *
 * For each: signature, owner, the table triggers / event triggers that call
 * it, and the first lines of its body (long token-like strings redacted).
 * Runs in a READ ONLY transaction. Exit 0 none, 1 found, 2 could not check.
 */
import { spawnSync } from 'node:child_process';
import { readFileSync, appendFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

export function classifiedNames(path = join(root, 'supabase/security/definer-execute.json')) {
  const doc = JSON.parse(readFileSync(path, 'utf8'));
  const names = new Set();
  for (const v of Object.values(doc)) if (v && Array.isArray(v.functions)) v.functions.forEach((f) => names.add(f));
  return names;
}

/** Strip anything that could be a credential before it reaches a log. */
export function redact(text, maxLines = 15) {
  return String(text ?? '')
    .split('\n')
    .slice(0, maxLines)
    .join('\n')
    .replace(/(['"])[A-Za-z0-9+/=_\-.]{24,}\1/g, "$1<redacted>$1")
    .replace(/\b(sb_secret_|sk_|eyJ)[A-Za-z0-9_\-.]+/g, '<redacted>')
    .replace(/postgres(ql)?:\/\/\S+/g, '<db-url>');
}

const SQL = `BEGIN READ ONLY;
SELECT json_agg(x ORDER BY x.name) FROM (
  SELECT p.proname AS name, n.nspname AS schema,
         p.oid::regprocedure::text AS signature,
         pg_get_userbyid(p.proowner) AS owner,
         pg_get_function_result(p.oid) AS returns,
         (SELECT string_agg(t.tgrelid::regclass::text || '.' || t.tgname || CASE WHEN t.tgenabled = 'D' THEN ' (disabled)' ELSE '' END, ', ')
            FROM pg_trigger t WHERE t.tgfoid = p.oid AND NOT t.tgisinternal) AS table_triggers,
         (SELECT string_agg(e.evtname || ' on ' || e.evtevent || CASE WHEN e.evtenabled = 'D' THEN ' (disabled)' ELSE '' END, ', ')
            FROM pg_event_trigger e WHERE e.evtfoid = p.oid) AS event_triggers,
         p.prosrc AS body
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE p.prosecdef AND n.nspname IN ('public', 'private')
) x;
COMMIT;`;

export function toMarkdown(env, unknown) {
  if (!unknown.length) return `\n**Unclassified definer functions (${env}):** none.\n`;
  const lines = [`\n**Unclassified definer functions (${env}) — not in git; 000100 aborts on these:**\n`];
  for (const f of unknown) {
    lines.push(`- \`${f.signature}\` owner \`${f.owner}\`, returns \`${f.returns}\``);
    lines.push(`  - used by: ${[f.table_triggers && `triggers ${f.table_triggers}`, f.event_triggers && `event triggers ${f.event_triggers}`].filter(Boolean).join('; ') || 'nothing (no trigger or event trigger)'}`);
    lines.push('  <details><summary>body (first lines)</summary>\n', '```sql', redact(f.body).trim(), '```', '  </details>');
  }
  return lines.join('\n') + '\n';
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const argv = process.argv.slice(2);
  const env = argv[argv.indexOf('--env') + 1];
  const md = argv.includes('--md') ? argv[argv.indexOf('--md') + 1] : null;
  try {
    if (!process.env.DB_URL) throw new Error('DB_URL is not set');
    const r = spawnSync('psql', ['-X', '-q', '-tA', '-v', 'ON_ERROR_STOP=1', '-d', process.env.DB_URL, '-c', SQL], { encoding: 'utf8' });
    if (r.status !== 0) throw new Error((r.stderr || '').replace(/postgres(ql)?:\/\/\S+/g, '<db-url>').trim());
    const out0 = r.stdout.trim();
    const json = out0.includes('[') ? out0.slice(out0.indexOf('['), out0.lastIndexOf(']') + 1) : '[]';
    const known = classifiedNames();
    const unknown = (JSON.parse(json) ?? []).filter((f) => !known.has(f.name));
    const out = toMarkdown(env, unknown);
    console.log(out);
    if (md) appendFileSync(md, out);
    process.exit(unknown.length ? 1 : 0);
  } catch (e) {
    console.error(`::error::definer drift check (${env}) could not run: ${e.message}`);
    if (md) appendFileSync(md, `\nUnclassified definer functions (${env}): could not check.\n`);
    process.exit(2);
  }
}
