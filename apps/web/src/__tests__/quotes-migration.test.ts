/**
 * Static contract checks for 20261030000300_quotes.sql (no live DB in CI).
 * The executable version — real Postgres, incl. a two-session double-click
 * race — is supabase/tests/quotes/run.sh.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const sql = readFileSync(
  resolve(__dirname, '../../../../supabase/migrations/20261030000300_quotes.sql'),
  'utf8',
);
const acceptBody = sql.match(/CREATE OR REPLACE FUNCTION accept_quote\([\s\S]*?\n\$\$;/)?.[0] ?? '';

describe('accept_quote transaction', () => {
  it('exists and runs as one plpgsql function', () => {
    expect(acceptBody).toContain('LANGUAGE plpgsql SECURITY DEFINER');
  });

  it('locks the quote row before deciding anything', () => {
    const lock = acceptBody.indexOf('FOR UPDATE');
    expect(lock).toBeGreaterThan(-1);
    expect(lock).toBeLessThan(acceptBody.indexOf("v_q.status = 'accepted'"));
  });

  it('replays the stored result when already accepted (idempotent)', () => {
    expect(acceptBody).toMatch(
      /IF v_q\.status = 'accepted' THEN\s+RETURN v_q\.accepted_result \|\| jsonb_build_object\('already_accepted', true\);/,
    );
  });

  it('converts (Thread A helpers) → books → payment requests → settles, in order', () => {
    const order = [
      'FROM job_resolve_client(v_q.tenant_id, NULL, v_lead.name, v_lead.email, v_lead.phone)',
      'v_engagement := job_insert(',
      "DO UPDATE SET job_status = 'booked'",
      'create_shoot_payment_requests(p_engagement_id := v_engagement, p_requests := v_requests)',
      "UPDATE quotes SET status = 'accepted'",
      "'quote_accepted', 'quote', v_q.id",
    ].map((needle) => acceptBody.indexOf(needle));
    expect(order.every((i) => i > -1)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });

  it('builds deposit + balance requests in the shared contract shape', () => {
    for (const key of ["'label'", "'amount_minor'", "'due_date'", "'max_installments'"]) {
      expect(acceptBody).toContain(key);
    }
    expect(acceptBody).toContain('GREATEST(COALESCE(v_shoot_date, v_today), v_today)');
  });

  it('is callable by the service role only', () => {
    expect(sql).toContain('REVOKE ALL ON FUNCTION accept_quote(TEXT, UUID, UUID[])                      FROM PUBLIC, anon, authenticated;');
    expect(sql).toMatch(/GRANT EXECUTE ON FUNCTION accept_quote\(TEXT, UUID, UUID\[\]\)\s+TO service_role;/);
  });

  it('does not call convert_lead_to_job (it requires a signed-in admin; the client is anonymous)', () => {
    expect(acceptBody).not.toMatch(/(:=|PERFORM|FROM)\s+convert_lead_to_job\s*\(/);
  });

  it('refuses a lead quote without a package before mutating anything', () => {
    expect(acceptBody.indexOf("'no_package'")).toBeLessThan(acceptBody.indexOf('UPDATE quote_lines'));
  });
});

describe('quotes schema', () => {
  it('never reads a people.phone column (the base chain has none)', () => {
    expect(sql).not.toMatch(/\b(ap|ep|p|pp)\.phone\b/);
  });

  it('stores gross totals with a deposit that always sums back to the total', () => {
    expect(sql).toContain('CONSTRAINT quotes_deposit_sum CHECK (deposit_minor + balance_minor = total_minor)');
    expect(sql).toContain('SELECT ((p_total_minor::bigint * p_deposit_percent + 50) / 100)::int;');
    expect(sql).not.toMatch(/vat_minor|pretax_minor/);
  });

  it('enables RLS with tenant-admin policies on every new table', () => {
    for (const table of ['quotes', 'quote_lines', 'tenant_automatic_emails', 'automatic_email_log']) {
      expect(sql).toContain(`ALTER TABLE ${table}`);
      expect(sql).toMatch(new RegExp(`CREATE POLICY ${table}_super_admin ON ${table}`));
    }
  });

  it('only exposes the public quote RPCs to anon', () => {
    const anonGrants = [...sql.matchAll(/GRANT EXECUTE ON FUNCTION (\w+)\([^)]*\)\s+TO anon/g)].map((m) => m[1]);
    expect(anonGrants.sort()).toEqual(['decline_public_quote', 'get_public_quote']);
  });

  it('schedules the shoot-email cron idempotently', () => {
    expect(sql).toContain("WHERE command ILIKE '%/functions/v1/run-shoot-emails%';");
    expect(sql).toContain("'7 * * * *'");
  });
});
