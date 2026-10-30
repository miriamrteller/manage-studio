import { describe, it, expect } from 'vitest';
import {
  buildNavSections,
  matchesTenantFilter,
  matchesVertical,
  navigationConfig,
  publicNavigationConfig,
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
    expect(paths).toContain('/admin/notifications');
    expect(paths).toContain('/admin/finance');
    expect(paths).toContain('/admin/finance/payments');
    expect(paths).toContain('/admin/finance/expenses');
    expect(paths).toContain('/admin/finance/expenses/categories');
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

  it('split payment/invoicing nav matches non-bundled tenants but requires stripe feature (dormant)', () => {
    const usTenant = { country: 'US', payment_provider: 'stripe' as const };
    const setupItems = navigationConfig.filter(
      (item) => matchesTenantFilter(item, usTenant) && item.sectionKey === 'setup',
    );
    const payments = setupItems.find((item) => item.path === '/admin/setup/payments');
    const invoicing = setupItems.find((item) => item.path === '/admin/setup/invoicing');

    expect(payments?.featureKey).toBe('billing:payments.stripe');
    expect(invoicing?.featureKey).toBe('billing:payments.stripe');
    expect(setupItems.map((item) => item.path)).not.toContain(BUNDLED_PAYMENTS_SETUP_PATH);
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

describe('vertical nav visibility', () => {
  const adminPaths = (vertical: 'photographer' | 'dance-studio' | 'generic') =>
    buildNavSections(
      navigationConfig.filter((item) => matchesVertical(item, vertical)),
      ['tenant_admin'],
    ).flatMap((section) => section.items.map((item) => item.path));

  it('photographer hides class-only pages and shows jobs', () => {
    const paths = adminPaths('photographer');
    expect(paths).toContain('/admin/jobs');
    expect(paths).toContain('/admin/leads');
    expect(paths).toContain('/admin/families');
    expect(paths).not.toContain('/classes');
    expect(paths).not.toContain('/admin/setup/levels');
    expect(paths).not.toContain('/admin/setup/terms');
    expect(paths).not.toContain('/admin/setup/classes');
  });

  it('dance and generic tenants are unchanged (no jobs, class pages intact)', () => {
    for (const vertical of ['dance-studio', 'generic'] as const) {
      const paths = adminPaths(vertical);
      expect(paths).not.toContain('/admin/jobs');
      expect(paths).toContain('/classes');
      expect(paths).toContain('/admin/setup/levels');
      expect(paths).toContain('/admin/setup/terms');
      expect(paths).toContain('/admin/setup/classes');
    }
  });

  it('treats a missing vertical as generic', () => {
    const jobs = navigationConfig.find((item) => item.path === '/admin/jobs');
    const classes = navigationConfig.find((item) => item.path === '/classes');
    expect(jobs && matchesVertical(jobs, null)).toBe(false);
    expect(classes && matchesVertical(classes, undefined)).toBe(true);
  });

  it('hides the public classes browse link for photographers only', () => {
    const publicClasses = publicNavigationConfig.find((item) => item.path === '/classes');
    expect(publicClasses && matchesVertical(publicClasses, 'photographer')).toBe(false);
    expect(publicClasses && matchesVertical(publicClasses, 'dance-studio')).toBe(true);
  });
});
