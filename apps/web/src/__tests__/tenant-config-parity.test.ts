/**
 * get_tenant_config_by_host delegates to get_tenant_config_by_subdomain (SELECT *), so the
 * two must declare exactly the same RETURNS TABLE columns. A migration that changes one
 * without the other breaks custom-domain tenants at runtime; this fails first.
 * Run: pnpm -C apps/web test tenant-config-parity.test.ts
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve, join } from 'node:path';

const MIGRATIONS = resolve(__dirname, '../../../../supabase/migrations');

/** RETURNS TABLE column list of the newest CREATE FUNCTION <name>(…) across migrations. */
function latestReturnColumns(fn: string): { file: string; columns: string[]; body: string } {
  const files = readdirSync(MIGRATIONS).filter((f) => f.endsWith('.sql')).sort();
  const re = new RegExp(
    `CREATE\\s+(?:OR\\s+REPLACE\\s+)?FUNCTION\\s+(?:public\\.)?${fn}\\s*\\([^)]*\\)\\s*RETURNS\\s+TABLE\\s*\\(([\\s\\S]*?)\\)\\s*LANGUAGE([\\s\\S]*?)\\$\\$;`,
    'gi',
  );
  let found: { file: string; columns: string[]; body: string } | null = null;
  for (const file of files) {
    const sql = readFileSync(join(MIGRATIONS, file), 'utf8');
    for (const m of sql.matchAll(re)) {
      const columns = m[1]
        .split('\n')
        .map((line) => line.replace(/--.*$/, '').trim().replace(/,$/, ''))
        .filter(Boolean)
        .map((line) => line.split(/\s+/).map((p, i) => (i === 0 ? p.toLowerCase() : p.toUpperCase())).join(' '));
      found = { file, columns, body: m[2] };
    }
  }
  if (!found) throw new Error(`No CREATE FUNCTION ${fn} … RETURNS TABLE found in migrations`);
  return found;
}

describe('tenant config RPC parity', () => {
  const bySubdomain = latestReturnColumns('get_tenant_config_by_subdomain');
  const byHost = latestReturnColumns('get_tenant_config_by_host');

  it('by_host returns exactly the columns by_subdomain returns', () => {
    expect(
      byHost.columns,
      `get_tenant_config_by_host (${byHost.file}) and get_tenant_config_by_subdomain (${bySubdomain.file}) ` +
        'must declare the same RETURNS TABLE columns, in the same order. Update both in the same migration.',
    ).toEqual(bySubdomain.columns);
  });

  it('by_host is (re)defined no earlier than by_subdomain', () => {
    expect(byHost.file >= bySubdomain.file, `redefine get_tenant_config_by_host after ${bySubdomain.file}`).toBe(true);
  });

  it('by_host still delegates to by_subdomain', () => {
    expect(byHost.body).toMatch(/FROM\s+get_tenant_config_by_subdomain\s*\(/i);
  });
});
