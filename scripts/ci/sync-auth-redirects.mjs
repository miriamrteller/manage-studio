#!/usr/bin/env node
/**
 * Keeps prod Supabase Auth's redirect allowlist (uri_allow_list) in step with
 * the studios' active custom domains, so sign-in links can return to a
 * studio's own address and nobody edits the Supabase dashboard by hand.
 *
 * - Adds `https://<domain>/**` for every tenants.custom_domain.
 * - Removes entries ONLY for hosts this pipeline manages (any hostname ever in
 *   tenant_custom_domains or tenants.custom_domain) that are no longer active.
 * - Never touches anything else: opalswift.com, localhost, or entries added by
 *   hand for other hosts.
 * - Writes only when the list changes. `--dry-run` prints the change only.
 *
 * Env: SUPABASE_AUTH_SYNC_TOKEN (personal access token for this one job),
 *      SUPABASE_PROD_DB_URL, PROJECT_REF. Run by .github/workflows/auth-redirects-sync.yml.
 */
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

const NEVER_TOUCH = [/(^|\.)opalswift\.com$/, /^localhost$/, /(^|\.)localhost$/, /^127\.0\.0\.1$/];

export function entryHost(entry) {
  try {
    return new URL(entry.replace(/\*/g, 'x')).hostname.toLowerCase();
  } catch {
    return null;
  }
}

/**
 * current: the allowlist as Supabase returns it (comma-separated string).
 * active: hosts that must be allowed. managed: every host this pipeline owns.
 * Returns { list, added, removed } with list in the same comma format.
 */
export function reconcile(current, active, managed) {
  const entries = (current ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  const activeSet = new Set([...active].map((h) => h.toLowerCase()));
  const managedSet = new Set([...managed, ...active].map((h) => h.toLowerCase()));
  const removed = [];
  const kept = entries.filter((e) => {
    const host = entryHost(e);
    if (!host || NEVER_TOUCH.some((re) => re.test(host))) return true;
    if (managedSet.has(host) && !activeSet.has(host)) {
      removed.push(e);
      return false;
    }
    return true;
  });
  const added = [];
  for (const host of [...activeSet].sort()) {
    if (NEVER_TOUCH.some((re) => re.test(host))) continue;
    const want = `https://${host}/**`;
    if (!kept.includes(want)) {
      kept.push(want);
      added.push(want);
    }
  }
  return { list: kept.join(','), added, removed };
}

function psqlColumn(dbUrl, sql) {
  const out = execFileSync('psql', [dbUrl, '-X', '-At', '-v', 'ON_ERROR_STOP=1', '-c', sql], { encoding: 'utf8' });
  return out.split('\n').map((s) => s.trim()).filter(Boolean);
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const token = process.env.SUPABASE_AUTH_SYNC_TOKEN;
  const dbUrl = process.env.SUPABASE_PROD_DB_URL;
  const ref = process.env.PROJECT_REF;
  if (!token || !dbUrl || !ref) throw new Error('SUPABASE_AUTH_SYNC_TOKEN, SUPABASE_PROD_DB_URL and PROJECT_REF are required');

  const active = psqlColumn(dbUrl, 'SELECT custom_domain FROM tenants WHERE custom_domain IS NOT NULL ORDER BY 1');
  const managed = psqlColumn(dbUrl,
    'SELECT hostname FROM tenant_custom_domains UNION SELECT custom_domain FROM tenants WHERE custom_domain IS NOT NULL');

  const api = `https://api.supabase.com/v1/projects/${ref}/config/auth`;
  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
  const res = await fetch(api, { headers });
  if (!res.ok) throw new Error(`reading auth config failed: HTTP ${res.status}`);
  const config = await res.json();
  const { list, added, removed } = reconcile(config.uri_allow_list, active, managed);

  const summary = [
    `Active custom domains: ${active.length}`,
    `Added: ${added.length ? added.join(', ') : 'none'}`,
    `Removed: ${removed.length ? removed.join(', ') : 'none'}`,
  ];
  console.log(summary.join('\n'));
  if (process.env.GITHUB_STEP_SUMMARY) {
    const { appendFileSync } = await import('node:fs');
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, `### Auth redirect allowlist\n\n${summary.map((l) => `- ${l}`).join('\n')}\n`);
  }
  if (!added.length && !removed.length) return;
  if (dryRun) {
    console.log('Dry run: not writing.');
    return;
  }
  const patch = await fetch(api, { method: 'PATCH', headers, body: JSON.stringify({ uri_allow_list: list }) });
  if (!patch.ok) throw new Error(`updating auth config failed: HTTP ${patch.status}`);
  console.log('Allowlist updated.');
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main().catch((err) => {
    console.error(`::error::${err.message}`);
    process.exit(1);
  });
}
