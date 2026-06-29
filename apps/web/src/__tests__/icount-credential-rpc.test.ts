/**
 * I1 credential RPC contract — atomic icount/icount slugs; Grow RPC unchanged.
 * Static analysis of migration SQL (no live DB required in CI).
 * Run: pnpm -C apps/web test icount-credential-rpc.test.ts
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it, expect } from 'vitest';

const migrationsDir = resolve(__dirname, '../../../../supabase/migrations');
const icountMigration = readFileSync(
  resolve(migrationsDir, '20260628000100_icount_credentials.sql'),
  'utf8',
);
const financeMigration = readFileSync(
  resolve(migrationsDir, '20260608001600_finance.sql'),
  'utf8',
);

describe('save_tenant_icount_credentials (I1-T9)', () => {
  it('defines RPC with company id, page id, and api token params', () => {
    expect(icountMigration).toMatch(
      /CREATE OR REPLACE FUNCTION save_tenant_icount_credentials\s*\(\s*p_company_id TEXT,\s*p_page_id\s+TEXT,\s*p_api_token\s+TEXT\s*\)/s,
    );
  });

  it('sets payment_provider and invoicing_provider to icount atomically', () => {
    const updateBlock = icountMigration.match(/UPDATE tenants SET[\s\S]*?WHERE id = v_tenant_id;/)?.[0] ?? '';
    expect(updateBlock).toContain("payment_provider             = 'icount'");
    expect(updateBlock).toContain("invoicing_provider           = 'icount'");
  });

  it('stores cid and CC page id in payment provider columns', () => {
    expect(icountMigration).toContain('payment_provider_account_id  = NULLIF(trim(p_company_id),');
    expect(icountMigration).toContain('payment_provider_public_key  = NULLIF(trim(p_page_id),');
    expect(icountMigration).toContain('payment_provider_secret_enc  = CASE');
  });

  it('defines save_icount_webhook_secret for bundled tenants', () => {
    expect(icountMigration).toContain('CREATE OR REPLACE FUNCTION save_icount_webhook_secret');
    expect(icountMigration).toContain('payment_provider_webhook_enc');
    expect(icountMigration).toContain("payment_provider = 'icount'");
    expect(icountMigration).toContain("invoicing_provider = 'icount'");
  });

  it('grants execute to authenticated', () => {
    expect(icountMigration).toContain(
      'GRANT EXECUTE ON FUNCTION save_tenant_icount_credentials(TEXT, TEXT, TEXT) TO authenticated',
    );
    expect(icountMigration).toContain(
      'GRANT EXECUTE ON FUNCTION save_icount_webhook_secret(TEXT) TO authenticated',
    );
  });
});

describe('save_tenant_grow_credentials unchanged (I1-T10)', () => {
  it('still sets grow/grow atomically and never icount', () => {
    const growBlock =
      financeMigration.match(
        /CREATE OR REPLACE FUNCTION save_tenant_grow_credentials[\s\S]*?END;\s*\$\$;/,
      )?.[0] ?? '';
    expect(growBlock).toContain("payment_provider             = 'grow'");
    expect(growBlock).toContain("invoicing_provider           = 'grow'");
    expect(growBlock).not.toContain("'icount'");
  });
});
