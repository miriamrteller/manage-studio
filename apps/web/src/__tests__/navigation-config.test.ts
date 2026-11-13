import { describe, it, expect } from 'vitest';
import {
  buildNavSections,
  groupNavEntries,
  resolveActiveTab,
  matchesTenantFilter,
  matchesProfile,
  navigationConfig,
  publicNavigationConfig,
  resolveActiveNavPath,
  tenantUsesGrow,
  tenantUsesIcount,
} from '@/components/Navigation/navigationConfig';
import { BUNDLED_PAYMENTS_SETUP_PATH } from '@/lib/bundledProviderUi';
import { profileForSkin } from './helpers/skinProfiles';

describe('navigationConfig', () => {
  it('includes admin students, families, and finance sub-pages for tenant_admin', () => {
    const sections = buildNavSections(navigationConfig, ['tenant_admin']);
    const paths = sections.flatMap((section) => section.items.map((item) => item.path));

    expect(paths).toContain('/admin/students');
    expect(paths).toContain('/admin/families');
    // Notifications open from the bell in the top bar, not the menu.
    expect(paths).not.toContain('/admin/notifications');
    expect(paths).toContain('/admin/finance');
    expect(paths).toContain('/admin/finance/payments');
    expect(paths).toContain('/admin/finance/expenses');
    expect(paths).toContain('/admin/finance/expenses/categories');
  });

  it('shows bundled payments setup for grow slug (generic nav, not grow-only path)', () => {
    const growTenant = { country: 'IL', payment_provider: 'grow' as const };
    const setupItems = navigationConfig.filter(
      (item) => matchesTenantFilter(item, growTenant) && item.area === 'settings',
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
      (item) => matchesTenantFilter(item, icountTenant) && item.area === 'settings',
    );
    const setupPaths = setupItems.map((item) => item.path);

    expect(setupPaths).toContain(BUNDLED_PAYMENTS_SETUP_PATH);
    expect(setupPaths).not.toContain('/admin/setup/grow');
    expect(setupPaths).not.toContain('/admin/setup/payments');
  });

  it('grow slug tenant uses same bundled nav as icount (I3-T2)', () => {
    const growTenant = { country: 'IL', payment_provider: 'grow' as const };
    const setupItems = navigationConfig.filter(
      (item) => matchesTenantFilter(item, growTenant) && item.area === 'settings',
    );
    const setupPaths = setupItems.map((item) => item.path);

    expect(setupPaths).toContain(BUNDLED_PAYMENTS_SETUP_PATH);
    expect(setupPaths).not.toContain('/admin/setup/icount');
  });

  it('split payment/invoicing nav matches non-bundled tenants but requires stripe feature (dormant)', () => {
    const usTenant = { country: 'US', payment_provider: 'stripe' as const };
    const setupItems = navigationConfig.filter(
      (item) => matchesTenantFilter(item, usTenant) && item.area === 'settings',
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

describe('profile nav visibility (menu per existing skin)', () => {
  const adminPaths = (vertical: 'photographer' | 'dance-studio' | 'generic') =>
    buildNavSections(
      navigationConfig.filter((item) => matchesProfile(item, profileForSkin(vertical))),
      ['tenant_admin'],
    ).flatMap((section) => section.items.map((item) => item.path));

  it('photographer hides class-only pages and shows jobs', () => {
    const paths = adminPaths('photographer');
    expect(paths).toContain('/admin/jobs');
    expect(paths).toContain('/admin/leads');
    expect(paths).not.toContain('/admin/families');
    expect(paths).not.toContain('/classes');
    expect(paths).not.toContain('/admin/setup/levels');
    expect(paths).not.toContain('/admin/setup/terms');
    expect(paths).not.toContain('/admin/classes');
  });

  it('dance and generic tenants are unchanged (no jobs, class pages intact)', () => {
    for (const vertical of ['dance-studio', 'generic'] as const) {
      const paths = adminPaths(vertical);
      expect(paths).not.toContain('/admin/jobs');
      expect(paths).not.toContain('/classes'); // the public pages are not in the admin menu
      expect(paths).toContain('/admin/setup/levels');
      expect(paths).toContain('/admin/setup/terms');
      expect(paths).toContain('/admin/classes');
    }
  });

  it('treats a missing profile as an existing class studio', () => {
    const jobs = navigationConfig.find((item) => item.path === '/admin/jobs');
    const classes = navigationConfig.find((item) => item.path === '/classes');
    expect(jobs && matchesProfile(jobs, null)).toBe(false);
    expect(classes && matchesProfile(classes, undefined)).toBe(true);
  });

  it('hides the public classes browse link for photographers only', () => {
    const publicClasses = publicNavigationConfig.find((item) => item.path === '/classes');
    expect(publicClasses && matchesProfile(publicClasses, profileForSkin('photographer'))).toBe(false);
    expect(publicClasses && matchesProfile(publicClasses, profileForSkin('dance-studio'))).toBe(true);
  });
});

describe('menu follows the switches, not the skin', () => {
  const menu = (profile: Parameters<typeof matchesProfile>[1]) =>
    buildNavSections(
      navigationConfig.filter((item) => matchesProfile(item, profile)),
      ['tenant_admin'],
    ).flatMap((section) => section.items.map((item) => item.path));
  const general = { paymentFlow: 'both', teachesClasses: false, familyAccounts: false, clientBooking: false } as const;

  it('a new general studio sees projects and quotes but no class pages or families', () => {
    const paths = menu(general);
    expect(paths).toEqual(expect.arrayContaining(['/admin/jobs', '/admin/quotes', '/admin/leads']));
    for (const gone of ['/admin/classes', '/admin/setup/levels', '/admin/setup/terms', '/admin/families']) {
      expect(paths).not.toContain(gone);
    }
  });

  it('each switch brings back exactly its pages', () => {
    expect(menu({ ...general, teachesClasses: true })).toEqual(
      expect.arrayContaining(['/admin/classes', '/admin/setup/levels', '/admin/setup/terms']),
    );
    expect(menu({ ...general, teachesClasses: true })).not.toContain('/admin/families');
    expect(menu({ ...general, familyAccounts: true })).toContain('/admin/families');
  });

  it('a monthly-only studio has no jobs or quotes; per-project and both studios do', () => {
    expect(menu({ ...general, paymentFlow: 'recurring' })).not.toContain('/admin/jobs');
    expect(menu({ ...general, paymentFlow: 'project' })).toContain('/admin/quotes');
    expect(menu({ ...general, paymentFlow: 'both' })).toContain('/admin/jobs');
  });
});

describe('admin menu: one flat list of areas, pages are tabs', () => {
  const adminMenu = (vertical: 'photographer' | 'dance-studio' | 'generic' | 'beautician') =>
    buildNavSections(
      navigationConfig.filter((item) => matchesProfile(item, profileForSkin(vertical))),
      ['tenant_admin'],
    );
  const lines = (vertical: 'photographer' | 'dance-studio' | 'generic' | 'beautician') =>
    adminMenu(vertical).flatMap((s) => groupNavEntries(s.items).map((e) => e.area ?? e.path));

  it('has one section and no groups to open', () => {
    for (const vertical of ['dance-studio', 'generic', 'photographer', 'beautician'] as const) {
      expect(adminMenu(vertical).map((s) => s.sectionKey)).toEqual(['main']);
    }
  });

  it('dance and generic: Home, Leads, Students, Classes, Bookings, Shop, Finance, Settings', () => {
    for (const vertical of ['dance-studio', 'generic'] as const) {
      expect(lines(vertical)).toEqual(['home', 'leads', 'people', 'classes', 'bookings', 'shop', 'finance', 'settings']);
    }
  });

  it('photographer: Home, Leads, Clients, Shoots, Bookings, Shop, Finance, Settings', () => {
    expect(lines('photographer')).toEqual(['home', 'leads', 'people', 'projects', 'bookings', 'shop', 'finance', 'settings']);
  });

  it('beautician: no classes, shoots or shop', () => {
    expect(lines('beautician')).toEqual(['home', 'leads', 'people', 'bookings', 'finance', 'settings']);
  });

  it('Bookings holds the calendar, packages, availability and booking rules, in that order', () => {
    const bookings = groupNavEntries(adminMenu('photographer')[0].items).find((e) => e.area === 'bookings')!;
    expect(bookings.items.map((i) => i.path)).toEqual([
      '/admin/appointments', '/admin/packages', '/admin/setup/booking/availability', '/admin/setup/booking',
    ]);
    expect(bookings.path).toBe('/admin/appointments');
  });

  it('a menu line opens its first page', () => {
    const entries = groupNavEntries(adminMenu('dance-studio')[0].items);
    expect(entries.find((e) => e.area === 'classes')!.path).toBe('/admin/classes');
    expect(entries.find((e) => e.area === 'settings')!.path).toBe('/admin/setup/settings');
  });

  it('finds the current tab: most specific page, sub-pages, and Settings ?tab=', () => {
    const items = adminMenu('dance-studio')[0].items;
    const area = (key: string) => groupNavEntries(items).find((e) => e.area === key)!.items;
    expect(resolveActiveTab('/admin/setup/booking/availability', '', area('bookings'))?.path).toBe('/admin/setup/booking/availability');
    expect(resolveActiveTab('/admin/setup/booking', '', area('bookings'))?.path).toBe('/admin/setup/booking');
    expect(resolveActiveTab('/admin/leads/forms', '', area('leads'))?.path).toBe('/admin/leads/get');
    expect(resolveActiveTab('/admin/families/f1', '', area('people'))?.path).toBe('/admin/families');
    expect(resolveActiveTab('/admin/setup/settings', '?tab=legal', area('settings'))?.path).toBe('/admin/setup/settings?tab=legal');
    expect(resolveActiveTab('/admin/setup/settings', '', area('settings'))?.path).toBe('/admin/setup/settings');
    expect(resolveActiveTab('/admin/setup/settings', '?tab=nope', area('settings'))?.path).toBe('/admin/setup/settings');
  });

  it('other roles are unchanged: parents and students keep Browse and their own page', () => {
    const parent = buildNavSections(navigationConfig, ['account_holder']).flatMap((s) => s.items.map((i) => i.path));
    expect(parent).toEqual(['/', '/classes', '/book', '/dashboard/portal']);
    const student = buildNavSections(navigationConfig, ['student']).flatMap((s) => s.items.map((i) => i.path));
    expect(student).toEqual(['/', '/classes', '/book', '/dashboard/student']);
  });

  it('the public menu (signed out) is unchanged', () => {
    const sections = buildNavSections(publicNavigationConfig, []);
    expect(sections.flatMap((s) => s.items.map((i) => i.path))).toEqual(['/', '/classes', '/book', '/login', '/signup']);
  });
});
