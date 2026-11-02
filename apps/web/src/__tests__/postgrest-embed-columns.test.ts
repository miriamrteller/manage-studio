/**
 * Every column named inside a PostgREST embed such as
 * `payer:people!billing_accounts_person_id_fkey(name, email)` must exist on that
 * table in the migrations. A made-up column makes the whole request fail with a
 * 400 ("column people_1.phone does not exist") only on a real database, which
 * mocked unit tests never see. This reads the migrations, so it needs no stack.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const MIGRATIONS = resolve(__dirname, '../../../../supabase/migrations');
const SRC = resolve(__dirname, '..');
const CHECKED_TABLES = ['people', 'accounts', 'tenants', 'billing_accounts'];

/** Columns of `table` from its CREATE TABLE and any ALTER TABLE … ADD COLUMN. */
function columnsOf(table: string): Set<string> {
  const cols = new Set<string>();
  for (const file of readdirSync(MIGRATIONS).filter((f) => f.endsWith('.sql')).sort()) {
    const sql = readFileSync(join(MIGRATIONS, file), 'utf8');
    const create = new RegExp(`CREATE TABLE (?:IF NOT EXISTS )?(?:public\\.)?${table}\\s*\\(([\\s\\S]*?)\\n\\);`, 'i').exec(sql);
    for (const line of (create?.[1] ?? '').split('\n')) {
      const m = /^\s{1,4}([a-z_][a-z0-9_]*)\s+[A-Za-z]/.exec(line);
      if (m && !/^(constraint|primary|unique|foreign|check)$/i.test(m[1])) cols.add(m[1]);
    }
    const alter = new RegExp(`ALTER TABLE (?:IF EXISTS )?(?:ONLY )?(?:public\\.)?${table}\\b([\\s\\S]*?);`, 'gi');
    for (const a of sql.matchAll(alter)) {
      for (const m of a[1].matchAll(/ADD COLUMN (?:IF NOT EXISTS )?([a-z_][a-z0-9_]*)/gi)) cols.add(m[1]);
    }
  }
  return cols;
}

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = join(dir, e.name);
    if (e.isDirectory()) return e.name === '__tests__' ? [] : sourceFiles(p);
    return /\.tsx?$/.test(e.name) ? [p] : [];
  });
}

describe('PostgREST embeds only name real columns', () => {
  it('the migration reader knows the people table', () => {
    const people = columnsOf('people');
    expect(people.has('name')).toBe(true);
    expect(people.has('emergency_contact_phone')).toBe(true);
    // There is no payer phone on people; a select that asks for one breaks Billing Accounts.
    expect(people.has('phone')).toBe(false);
  });

  const embeds: Array<{ file: string; table: string; cols: string[] }> = [];
  for (const file of sourceFiles(SRC)) {
    const text = readFileSync(file, 'utf8');
    for (const m of text.matchAll(/(?:[a-z_]+:)?([a-z_]+)!(?:[a-z_]+)(?:!inner)?\(([^()]*)\)/g)) {
      if (!CHECKED_TABLES.includes(m[1])) continue;
      const cols = m[2].split(',').map((c) => c.trim()).filter((c) => /^[a-z_][a-z0-9_]*$/.test(c));
      if (cols.length) embeds.push({ file: file.replace(SRC + '/', ''), table: m[1], cols });
    }
  }

  it('finds the embeds in the app', () => {
    expect(embeds.some((e) => e.file.endsWith('billingAccountView.ts'))).toBe(true);
  });

  it.each(embeds.map((e) => [`${e.file} → ${e.table}(${e.cols.join(', ')})`, e] as const))('%s', (_label, e) => {
    const known = columnsOf(e.table);
    const missing = e.cols.filter((c) => !known.has(c));
    expect(missing).toEqual([]);
  });
});
