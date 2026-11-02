/**
 * provision-studio (edge): one way to add a studio. Provider options, offline/none
 * provisioning, and the owner invite.
 * Run: pnpm -C apps/web test studio-setup-provisioning.test.ts
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it, expect, vi } from 'vitest';
import {
  exactIlikePattern,
  inviteStudioOwner,
  provisionStudio,
  ProvisionStudioSchema,
  STUDIO_INVOICING_PROVIDERS,
  STUDIO_PAYMENT_PROVIDERS,
  type ProvisionStudioDeps,
} from '../../../../supabase/functions/_shared/provision-studio';
import { UNFINISHED_INVOICING_PROVIDERS } from '../../../../supabase/functions/_shared/provider-pairing';
import { STUDIO_INVOICING_OPTIONS, STUDIO_PAYMENT_OPTIONS } from '@/features/platform/services/studioSetupService';
import { INITIAL_FORM, toSetupRequest } from '@/features/platform/lib/studioSetupForm';

const migration = readFileSync(
  resolve(__dirname, '../../../../supabase/migrations/20261101133015_provision_studio.sql'),
  'utf8',
);

function sqlList(column: string): string[] {
  const match = migration.match(new RegExp(`${column} NOT IN \\(([^)]*)\\)`));
  if (!match) throw new Error(`no list for ${column}`);
  return match[1].split(',').map((s) => s.trim().replace(/'/g, ''));
}

const base = {
  name: 'Creative Ballet',
  subdomain: 'creativeballet',
  plan: 'professional',
  vertical: 'dance-studio',
  ownerEmail: 'Owner@Example.com',
  paymentProvider: 'grow',
  invoicingProvider: 'grow',
};

function fakeDeps(over: Partial<ProvisionStudioDeps> = {}): ProvisionStudioDeps {
  return {
    provisionStudio: vi.fn(async () => 'tenant-new'),
    findProfileByEmail: vi.fn(async () => null),
    tenantSubdomain: vi.fn(async () => 'creativeballet'),
    inviteUser: vi.fn(async () => ({ userId: 'user-new' })),
    assignOwner: vi.fn(async () => {}),
    ...over,
  };
}

describe('provider options', () => {
  it('the wizard, the edge function and the database offer the same providers', () => {
    expect([...STUDIO_PAYMENT_OPTIONS].sort()).toEqual([...STUDIO_PAYMENT_PROVIDERS].sort());
    expect([...STUDIO_INVOICING_OPTIONS].sort()).toEqual([...STUDIO_INVOICING_PROVIDERS].sort());
    expect(sqlList('p_payment_provider').sort()).toEqual([...STUDIO_PAYMENT_PROVIDERS].sort());
    // The database still accepts Yesh and Tranzila (existing data); the edge function, which
    // runs first, no longer offers them because they are not built yet.
    expect(sqlList('p_invoicing_provider').sort()).toEqual(
      [...STUDIO_INVOICING_PROVIDERS, ...UNFINISHED_INVOICING_PROVIDERS].sort(),
    );
  });

  it('Yesh and Tranzila invoicing are not offered until they are built', () => {
    for (const slug of UNFINISHED_INVOICING_PROVIDERS) {
      expect(STUDIO_INVOICING_OPTIONS as readonly string[]).not.toContain(slug);
      expect(ProvisionStudioSchema.safeParse({ ...base, invoicingProvider: slug }).success).toBe(false);
    }
  });

  it('refuses invoicing that cannot issue documents for the payment choice', () => {
    const ok = (paymentProvider: string, invoicingProvider: string) =>
      ProvisionStudioSchema.safeParse({ ...base, paymentProvider, invoicingProvider }).success;
    // Grow / iCount / Invoice4U documents only come with their own card charges.
    expect(ok('grow', 'grow')).toBe(true);
    expect(ok('offline', 'grow')).toBe(false);
    expect(ok('ypay', 'icount')).toBe(false);
    expect(ok('grow', 'invoice4u')).toBe(false);
    // YPay: its own charges and cash / bank transfers, never another provider's card payment.
    expect(ok('offline', 'ypay')).toBe(true);
    expect(ok('grow', 'ypay')).toBe(false);
    // Green Invoice and "none" work with anything.
    for (const p of STUDIO_PAYMENT_PROVIDERS) {
      expect(ok(p, 'green_invoice')).toBe(true);
      expect(ok(p, 'none')).toBe(true);
    }
  });

  it('pay at the studio, no documents, and YPay are accepted', () => {
    expect(ProvisionStudioSchema.safeParse({ ...base, paymentProvider: 'offline', invoicingProvider: 'none' }).success).toBe(true);
    expect(ProvisionStudioSchema.safeParse({ ...base, paymentProvider: 'ypay', invoicingProvider: 'ypay' }).success).toBe(true);
  });

  it('never mock or stripe', () => {
    for (const p of ['mock', 'stripe']) {
      expect(ProvisionStudioSchema.safeParse({ ...base, paymentProvider: p }).success).toBe(false);
    }
    expect(ProvisionStudioSchema.safeParse({ ...base, invoicingProvider: 'mock' }).success).toBe(false);
    expect(migration).not.toMatch(/p_payment_provider NOT IN \([^)]*'mock'/);
  });

  it('new studios default to English and OpalSwift colours', () => {
    const parsed = ProvisionStudioSchema.parse(base);
    expect(parsed).toMatchObject({ languageDefault: 'en', primaryColor: '#5B6CFF', accentColor: '#21D1C2', ownerEmail: 'owner@example.com' });
    expect(migration).toMatch(/language_default SET DEFAULT 'en'/);
    expect(migration).toMatch(/primary_color SET DEFAULT '#5B6CFF'/);
    expect(migration).toMatch(/accent_color SET DEFAULT '#21D1C2'/);
  });

  it('the wizard defaults to Grow with Grow documents (nothing needs connecting to finish)', () => {
    const request = toSetupRequest({ ...INITIAL_FORM, name: 'X', subdomain: 'x', ownerEmail: 'a@b.co' });
    expect(request).toMatchObject({ paymentProvider: 'grow', invoicingProvider: 'grow', languageDefault: 'en', currency: 'ILS' });
    expect(ProvisionStudioSchema.safeParse(request).success).toBe(true);
  });
});

describe('provisionStudio', () => {
  it('creates an offline + no-documents studio and invites the owner as its admin', async () => {
    const deps = fakeDeps();
    const input = ProvisionStudioSchema.parse({ ...base, paymentProvider: 'offline', invoicingProvider: 'none' });
    const result = await provisionStudio(deps, input);
    expect(result).toEqual({ ok: true, tenantId: 'tenant-new', subdomain: 'creativeballet', owner: { status: 'invited' } });
    expect(deps.provisionStudio).toHaveBeenCalledWith(expect.objectContaining({ paymentProvider: 'offline', invoicingProvider: 'none' }));
    expect(deps.inviteUser).toHaveBeenCalledWith('owner@example.com', 'creativeballet');
    expect(deps.assignOwner).toHaveBeenCalledWith('tenant-new', 'user-new');
  });

  it('refuses an email that belongs to another studio, before creating anything', async () => {
    const deps = fakeDeps({ findProfileByEmail: vi.fn(async () => ({ id: 'u-1', tenant_id: 'other' })) });
    const result = await provisionStudio(deps, ProvisionStudioSchema.parse(base));
    expect(result).toEqual({ ok: false, error: 'email_in_other_studio' });
    expect(deps.provisionStudio).not.toHaveBeenCalled();
    expect(deps.inviteUser).not.toHaveBeenCalled();
  });

  it('a failed invite still returns the studio, so the invite can be sent again', async () => {
    const deps = fakeDeps({ inviteUser: vi.fn(async () => { throw new Error('smtp down'); }) });
    const result = await provisionStudio(deps, ProvisionStudioSchema.parse(base));
    expect(result).toMatchObject({ ok: true, tenantId: 'tenant-new', owner: { status: 'failed', reason: 'invite_failed' } });
    expect(deps.assignOwner).not.toHaveBeenCalled();
  });
});

describe('the platform owner as a studio owner', () => {
  const superAdmin = { id: 'u-owner', tenant_id: 'platform', role: ['super_admin'] };

  it("refuses the platform owner's own email, before creating anything", async () => {
    const deps = fakeDeps({ findProfileByEmail: vi.fn(async () => superAdmin) });
    const result = await provisionStudio(deps, ProvisionStudioSchema.parse(base));
    expect(result).toEqual({ ok: false, error: 'email_is_platform_owner' });
    expect(deps.provisionStudio).not.toHaveBeenCalled();
    expect(deps.assignOwner).not.toHaveBeenCalled();
  });

  it('never makes a super admin one studio\'s admin, even inside that studio', async () => {
    const deps = fakeDeps({ findProfileByEmail: vi.fn(async () => ({ ...superAdmin, tenant_id: 'tenant-new' })) });
    expect(await inviteStudioOwner(deps, 'tenant-new', 'owner@example.com')).toEqual({
      status: 'failed',
      reason: 'email_is_platform_owner',
    });
    expect(deps.assignOwner).not.toHaveBeenCalled();
  });

  it('assign_studio_owner skips super_admin profiles in the database too', () => {
    expect(migration).toMatch(/AND NOT \('super_admin' = ANY \(role\)\)/);
  });
});

describe('inviteStudioOwner (send again)', () => {
  it('an owner who already accepted is made admin, not invited twice', async () => {
    const deps = fakeDeps({ findProfileByEmail: vi.fn(async () => ({ id: 'u-1', tenant_id: 'tenant-new' })) });
    expect(await inviteStudioOwner(deps, 'tenant-new', 'owner@example.com')).toEqual({ status: 'already_owner' });
    expect(deps.inviteUser).not.toHaveBeenCalled();
    expect(deps.assignOwner).toHaveBeenCalledWith('tenant-new', 'u-1');
  });

  it('never moves an account from another studio', async () => {
    const deps = fakeDeps({ findProfileByEmail: vi.fn(async () => ({ id: 'u-1', tenant_id: 'other' })) });
    expect(await inviteStudioOwner(deps, 'tenant-new', 'owner@example.com')).toEqual({
      status: 'failed',
      reason: 'email_in_other_studio',
    });
    expect(deps.assignOwner).not.toHaveBeenCalled();
  });
});

/** Postgres ILIKE with the default backslash escape, for checking patterns in tests. */
function ilikeMatches(pattern: string, value: string): boolean {
  let re = '';
  for (let i = 0; i < pattern.length; i++) {
    const ch = pattern[i];
    if (ch === '\\') re += pattern[++i].replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    else if (ch === '%') re += '.*';
    else if (ch === '_') re += '.';
    else re += ch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
  return new RegExp(`^${re}$`, 'i').test(value);
}

describe('owner email lookup is exact', () => {
  it('an underscore or percent in the email is not a wildcard', () => {
    const pattern = exactIlikePattern('a_b@x.com');
    expect(ilikeMatches('a_b@x.com', 'axb@x.com')).toBe(true); // the bug, unescaped
    expect(ilikeMatches(pattern, 'axb@x.com')).toBe(false);
    expect(ilikeMatches(pattern, 'a_b@x.com')).toBe(true);
    expect(ilikeMatches(pattern, 'A_B@X.com')).toBe(true); // still case-insensitive
    expect(ilikeMatches(exactIlikePattern('100%@x.com'), '100abc@x.com')).toBe(false);
    expect(exactIlikePattern('a\\b_c%d')).toBe('a\\\\b\\_c\\%d');
  });

  it('the Edge Function uses the exact pattern', () => {
    const src = readFileSync(resolve(__dirname, '../../../../supabase/functions/provision-studio/index.ts'), 'utf8');
    expect(src).toMatch(/\.ilike\("email", exactIlikePattern\(email\)\)/);
  });
});
