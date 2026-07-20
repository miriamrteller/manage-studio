/**
 * U1 credential RPC contract — atomic invoice4u/invoice4u slugs.
 * Static analysis of migration SQL (no live DB required in CI).
 * Run: pnpm -C apps/web test invoice4u-credential-rpc.test.ts
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it, expect } from 'vitest';

const migrationsDir = resolve(__dirname, '../../../../supabase/migrations');
const invoice4uMigration = readFileSync(
  resolve(migrationsDir, '20260720000100_invoice4u_credentials.sql'),
  'utf8',
);
const financeMigration = readFileSync(
  resolve(migrationsDir, '20260608001600_finance.sql'),
  'utf8',
);

describe('save_tenant_invoice4u_credentials (U1)', () => {
  it('defines RPC with api key, clearing company type, and optional account label', () => {
    expect(invoice4uMigration).toMatch(
      /CREATE OR REPLACE FUNCTION save_tenant_invoice4u_credentials\s*\(\s*p_api_key\s+TEXT,\s*p_clearing_company_type\s+TEXT,\s*p_account_label\s+TEXT DEFAULT NULL\s*\)/s,
    );
  });

  it('sets payment_provider and invoicing_provider to invoice4u atomically', () => {
    const updateBlock =
      invoice4uMigration.match(/UPDATE tenants SET[\s\S]*?WHERE id = v_tenant_id;/)?.[0] ?? '';
    expect(updateBlock).toContain("payment_provider             = 'invoice4u'");
    expect(updateBlock).toContain("invoicing_provider           = 'invoice4u'");
  });

  it('stores API key in secret_enc and clearing company in public_key (D4)', () => {
    expect(invoice4uMigration).toContain(
      'payment_provider_public_key  = NULLIF(trim(p_clearing_company_type),',
    );
    expect(invoice4uMigration).toContain(
      'payment_provider_secret_enc  = pgp_sym_encrypt(trim(p_api_key), enc_key)',
    );
    expect(invoice4uMigration).toContain(
      'payment_provider_account_id  = NULLIF(trim(p_account_label),',
    );
  });

  it('revokes non-invoice4u payment_method_tokens', () => {
    expect(invoice4uMigration).toContain("AND provider <> 'invoice4u'");
    expect(invoice4uMigration).toContain('revoked_at = now()');
  });

  it('grants execute to authenticated', () => {
    expect(invoice4uMigration).toContain(
      'GRANT EXECUTE ON FUNCTION save_tenant_invoice4u_credentials(TEXT, TEXT, TEXT) TO authenticated',
    );
  });
});

describe('existing credential RPCs unchanged (U1 regression)', () => {
  it('grow RPC still sets grow/grow atomically', () => {
    const growBlock =
      financeMigration.match(
        /CREATE OR REPLACE FUNCTION save_tenant_grow_credentials[\s\S]*?END;\s*\$\$;/,
      )?.[0] ?? '';
    expect(growBlock).toContain("payment_provider             = 'grow'");
    expect(growBlock).toContain("invoicing_provider           = 'grow'");
    expect(growBlock).not.toContain("'invoice4u'");
  });
});
