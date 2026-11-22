/**
 * Studio shop guest orders are paid through hidden records: one offering per studio
 * (offering_type 'shop') and one engagement per buyer (status 'shop'). Row policies hide
 * them from every app and portal read; server code is not covered by those, so each
 * database function and Edge Function query that reads offerings or engagements must have
 * been reviewed (supabase/security/shop-hidden-records-reviewed.json). A new one fails here
 * until someone checks it can't show a hidden "Shop" class, student or booking.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = join(__dirname, '../../../..');
const reviewed = JSON.parse(readFileSync(join(ROOT, 'supabase/security/shop-hidden-records-reviewed.json'), 'utf8')) as {
  database_functions: string[];
  edge_function_exceptions: Record<string, string>;
};

function walk(dir: string, keep: (p: string) => boolean, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) {
      if (name === 'node_modules' || name === 'email-dist') continue;
      walk(p, keep, out);
    } else if (keep(p)) {
      out.push(p);
    }
  }
  return out;
}

/** Latest definition of every function in the migrations whose body reads offerings or engagements. */
function databaseFunctionsReadingThem(): string[] {
  const dir = join(ROOT, 'supabase/migrations');
  const latest = new Map<string, boolean>();
  const head = /CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+(?:(public|private)\.)?"?([a-z_0-9]+)"?\s*\(/gi;
  for (const file of readdirSync(dir).filter((f) => f.endsWith('.sql')).sort()) {
    const sql = readFileSync(join(dir, file), 'utf8');
    for (const m of sql.matchAll(head)) {
      const start = (m.index ?? 0) + m[0].length;
      const as = /AS\s+(\$[a-z_]*\$)/i.exec(sql.slice(start, start + 3000));
      if (!as) continue;
      const bodyStart = start + as.index + as[0].length;
      const body = sql.slice(bodyStart, sql.indexOf(as[1], bodyStart));
      latest.set(`${(m[1] ?? 'public').toLowerCase()}.${m[2].toLowerCase()}`, /\b(engagements|offerings)\b/i.test(body));
    }
  }
  return [...latest].filter(([, reads]) => reads).map(([name]) => name).sort();
}

/** Edge Function queries on offerings/engagements with no id, status or type filter, and no write. */
function unfilteredEdgeQueries(): string[] {
  const files = walk(join(ROOT, 'supabase/functions'), (p) => p.endsWith('.ts') && !/test/i.test(p));
  const found: string[] = [];
  for (const file of files) {
    const src = readFileSync(file, 'utf8');
    for (const m of src.matchAll(/from\((["'])(engagements|offerings)\1\)/g)) {
      const chain = src.slice((m.index ?? 0) + m[0].length, (m.index ?? 0) + m[0].length + 500).split(';')[0];
      const filtered =
        /\.(eq|in)\((["'])(id|status|offering_type|offering_id|engagement_id|person_id)\2/.test(chain) ||
        /^\s*\.(insert|update|upsert|delete)\(/.test(chain);
      if (!filtered) found.push(relative(ROOT, file));
    }
  }
  return [...new Set(found)].sort();
}

describe('hidden shop records stay hidden', () => {
  it('every database function that reads offerings or engagements has been reviewed', () => {
    const now = databaseFunctionsReadingThem();
    const unreviewed = now.filter((n) => !reviewed.database_functions.includes(n));
    const stale = reviewed.database_functions.filter((n) => !now.includes(n));
    expect({ unreviewed, stale }).toEqual({ unreviewed: [], stale: [] });
  });

  it('every Edge Function query without an id, status or type filter has been reviewed', () => {
    const exceptions = Object.keys(reviewed.edge_function_exceptions).filter((k) => !k.startsWith('$'));
    expect(unfilteredEdgeQueries()).toEqual(exceptions.sort());
  });

  it('the app and portal reads are hidden by row policies', () => {
    const sql = readFileSync(join(ROOT, 'supabase/migrations/20261122192657_studio_shop_guest_checkout.sql'), 'utf8');
    expect(sql).toMatch(/CREATE POLICY offerings_hide_shop ON offerings AS RESTRICTIVE FOR ALL\s+USING \(offering_type <> 'shop'\)/);
    expect(sql).toMatch(/CREATE POLICY engagements_hide_shop ON engagements AS RESTRICTIVE FOR ALL\s+USING \(status <> 'shop'\)/);
  });
});
