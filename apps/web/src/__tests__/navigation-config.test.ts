import { describe, it, expect } from 'vitest';
import {
  buildNavSections,
  matchesTenantFilter,
  navigationConfig,
  resolveActiveNavPath,
  tenantUsesGrow,
  tenantUsesIcount,
} from '@/components/Navigation/navigationConfig';
import { BUNDLED_PAYMENTS_SETUP_PATH } from '@/lib/bundledProviderUi';

describe('navigationConfig', () => {
  it('includes admin students, families, and finance sub-pages for tenant_admin', () => {
    const sections = buildNavSections(navigationConfig, ['tenant_admin']);
    const paths = sections.flatMap((section) => section.items.map((item) => item.path));

    expect(paths).toContain('/admin/students');
    expect(paths).toContain('/admin/families');
    expect(paths).toContain('/admin/finance');
    expect(paths).toContain('/admin/finance/payments');
    expect(paths).toContain('/admin/finance/expenses');
    expect(paths).toContain('/admin/finance/expenses/categories');
    expect(paths).toContain('/admin/setup/tax');
  });

  it('shows bundled payments setup for grow slug (generic nav, not grow-only path)', () => {
    const growTenant = { country: 'IL', payment_provider: 'grow' as const };
    const setupItems = navigationConfig.filter(
      (item) => matchesTenantFilter(item, growTenant) && item.sectionKey === 'setup',
    );
    const setupPaths = setupItems.map((item) => item.path);

    expect(setupPaths).toContain(BUNDLED_PAYMENTS_SETUP_PATH);
    expect(setupPaths).not.toContain('/admin/setup/grow');
    expect(setupPaths).not.toContain('/admin/setup/payments');
    expect(setupPaths).not.toContain('/admin/setup/invoicing');
  });

  it('IL tenant with icount slug is not treated as Grow (I3-T1)', () => {
    const icountTenant = { country: 'IL', payment_provider: 'icount' as const };
    expect(tenantUsesGrow(icountTenant)).toBe(false);
    expect(tenantUsesIcount(icountTenant)).toBe(true);

    const setupItems = navigationConfig.filter(
      (item) => matchesTenantFilter(item, icountTenant) && item.sectionKey === 'setup',
    );
    const setupPaths = setupItems.map((item) => item.path);

    expect(setupPaths).toContain(BUNDLED_PAYMENTS_SETUP_PATH);
    expect(setupPaths).not.toContain('/admin/setup/grow');
    expect(setupPaths).not.toContain('/admin/setup/payments');
  });

  it('grow slug tenant uses same bundled nav as icount (I3-T2)', () => {
    const growTenant = { country: 'IL', payment_provider: 'grow' as const };
    const setupItems = navigationConfig.filter(
      (item) => matchesTenantFilter(item, growTenant) && item.sectionKey === 'setup',
    );
    const setupPaths = setupItems.map((item) => item.path);

    expect(setupPaths).toContain(BUNDLED_PAYMENTS_SETUP_PATH);
    expect(setupPaths).not.toContain('/admin/setup/icount');
  });

  it('shows split payment/invoicing links for non-bundled tenants', () => {
    const usTenant = { country: 'US', payment_provider: 'stripe' as const };
    const setupItems = navigationConfig.filter(
      (item) => matchesTenantFilter(item, usTenant) && item.sectionKey === 'setup',
    );
    const setupPaths = setupItems.map((item) => item.path);

    expect(setupPaths).toContain('/admin/setup/payments');
    expect(setupPaths).toContain('/admin/setup/invoicing');
    expect(setupPaths).not.toContain(BUNDLED_PAYMENTS_SETUP_PATH);
  });

  it('includes platform onboard only for super_admin', () => {
    const adminSections = buildNavSections(navigationConfig, ['tenant_admin']);
    const superSections = buildNavSections(navigationConfig, ['super_admin']);

    expect(
      adminSections.flatMap((section) => section.items).some((item) => item.path === '/platform/onboard'),
    ).toBe(false);
    expect(
      superSections.flatMap((section) => section.items).some((item) => item.path === '/platform/onboard'),
    ).toBe(true);
  });

  it('highlights the most specific nav path', () => {
    const items = navigationConfig.filter((item) => item.path.startsWith('/admin/finance'));

    expect(resolveActiveNavPath('/admin/finance/payments', items)).toBe('/admin/finance/payments');
    expect(resolveActiveNavPath('/admin/finance', items)).toBe('/admin/finance');
    expect(resolveActiveNavPath('/admin/finance/expenses/categories', items)).toBe(
      '/admin/finance/expenses/categories',
    );
  });
});
