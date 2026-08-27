import { describe, it, expect } from 'vitest';
import { isMemberOfTenant } from '@/lib/tenantMembership';

const CREATIVEBALLET = '00000000-0000-0000-0000-000000000001';
const STUDIOAVIV = '00000000-0000-0000-0000-000000000002';

describe('isMemberOfTenant', () => {
  it('allows a tenant_admin on their own tenant', () => {
    expect(
      isMemberOfTenant({ role: ['tenant_admin'], tenant_id: CREATIVEBALLET }, CREATIVEBALLET),
    ).toBe(true);
  });

  it("rejects a tenant_admin on another tenant's subdomain", () => {
    expect(
      isMemberOfTenant({ role: ['tenant_admin'], tenant_id: STUDIOAVIV }, CREATIVEBALLET),
    ).toBe(false);
  });

  it('rejects portal roles from another tenant too', () => {
    expect(
      isMemberOfTenant({ role: ['account_holder'], tenant_id: STUDIOAVIV }, CREATIVEBALLET),
    ).toBe(false);
  });

  it('allows super_admin on any tenant (platform role)', () => {
    expect(
      isMemberOfTenant(
        { role: ['super_admin', 'tenant_admin'], tenant_id: CREATIVEBALLET },
        STUDIOAVIV,
      ),
    ).toBe(true);
  });

  it('rejects a profile with no tenant_id', () => {
    expect(isMemberOfTenant({ role: ['tenant_admin'] }, CREATIVEBALLET)).toBe(false);
  });
});
