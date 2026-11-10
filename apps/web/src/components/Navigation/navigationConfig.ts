import { PARENT_ROLE_NAMES } from '@/lib/parentRoles';
import type { PresetModules, FeatureKey, ProfileGate, StudioProfile } from '@shared/index';
import { EXISTING_STUDIO_PROFILE, FEATURES, profileHasGate } from '@shared/index';
import {
  tenantUsesSplitProviders,
  tenantUsesBundledPayments,
} from '@/lib/tenantProviderRouting';

export {
  tenantUsesGrow,
  tenantUsesIcount,
  tenantUsesSplitProviders,
  tenantUsesBundledPayments,
} from '@/lib/tenantProviderRouting';

/**
 * Navigation Configuration
 *
 * Defines routes shown in the nav drawer, filtered by user roles and tenant settings.
 *
 * Role values come from useCurrentUser().user.role (array of strings):
 * - 'tenant_admin': Full system access
 * - 'super_admin': Platform onboarding
 * - 'parent', 'guardian', or 'account_holder': Parent portal access
 * - 'student' or 'adult_student': Student dashboard access
 * - 'teacher': (reserved for future use)
 */

export type NavSectionKey =
  | 'browse'
  | 'main'
  | 'finance'
  | 'setup'
  | 'platform'
  | 'portal'
  | 'learning';

export type NavTenantFilter = 'bundled' | 'split';

export interface NavItem {
  path: string;
  labelKey: string;
  requiredRoles: string[];
  sectionKey: NavSectionKey;
  /** Indented child item (e.g. setup sub-pages) */
  indent?: boolean;
  /** Hide item when the named module is disabled for this tenant */
  moduleKey?: keyof PresetModules;
  /** Show only for bundled (grow/icount) vs split (stripe+…) payment setup */
  tenantFilter?: NavTenantFilter;
  /** Hide item unless the tenant has this feature flag enabled */
  featureKey?: FeatureKey;
  /**
   * Grey the item out (still visible, not clickable) while the tenant has
   * online booking turned off in Booking Settings. Only takes effect when the
   * viewer can read that setting (tenant admins) — see useBookingEnabled.
   */
  disableWhenBookingOff?: boolean;
  /**
   * Show only when the studio's business profile has this (payment flow or switch).
   * Omit = core page, always shown. Hiding never deletes data and never blocks a deep link.
   */
  needs?: ProfileGate;
  /** Show only when there is no studio (app.opalswift.com): e.g. the platform home at "/". */
  withoutStudioOnly?: boolean;
  /** Signed-out item that also works with no studio (app.opalswift.com): log in, sign up. */
  worksWithoutStudio?: boolean;
}

export interface NavSection {
  sectionKey: NavSectionKey;
  labelKey: string;
  items: NavItem[];
}

export interface NavTenantContext {
  country?: string | null;
  payment_provider?: string | null;
}

export const SECTION_LABELS: Record<NavSectionKey, string> = {
  browse: 'nav.section.browse',
  main: 'nav.section.main',
  finance: 'nav.section.finance',
  setup: 'nav.section.setup',
  platform: 'nav.section.platform',
  portal: 'nav.section.portal',
  learning: 'nav.section.learning',
};

/** The studio home with the setup checklist forced open. */
export const SETUP_GUIDE_PATH = '/admin/setup?guide=open';

/** Authenticated navigation items (flattened; grouped in the drawer) */
export const navigationConfig: NavItem[] = [
  {
    // The studio's public homepage. Not shown in the studio admin's own menu (see buildNavSections).
    path: '/',
    labelKey: 'nav.home',
    requiredRoles: [],
    sectionKey: 'browse',
  },
  {
    path: '/classes',
    labelKey: 'nav.classes',
    requiredRoles: [],
    sectionKey: 'browse',
    needs: 'teaches_classes',
  },
  {
    path: '/book',
    labelKey: 'nav.book_appointment',
    requiredRoles: [],
    sectionKey: 'browse',
    featureKey: FEATURES.scheduling.clientBooking,
    disableWhenBookingOff: true,
  },
  // The studio admin's working pages, at the top level (no group to open). Leads first, then the
  // business's core pages in the order the work flows. Admins do not see the public "Browse" pages.
  {
    path: '/admin/leads',
    labelKey: 'nav.leads',
    requiredRoles: ['tenant_admin'],
    sectionKey: 'main',
  },
  {
    path: '/admin/students',
    labelKey: 'nav.students',
    requiredRoles: ['tenant_admin'],
    sectionKey: 'main',
  },
  {
    path: '/admin/families',
    labelKey: 'nav.families',
    requiredRoles: ['tenant_admin'],
    sectionKey: 'main',
    // Family accounts (parents pay for children) are a switch; other studios work from Clients.
    needs: 'family_accounts',
  },
  {
    // The studio's classes (the page that used to sit under Setup as "Manage classes").
    path: '/admin/classes',
    labelKey: 'nav.classes',
    requiredRoles: ['tenant_admin'],
    sectionKey: 'main',
    needs: 'teaches_classes',
  },
  {
    path: '/admin/jobs',
    labelKey: 'nav.jobs',
    requiredRoles: ['tenant_admin'],
    sectionKey: 'main',
    needs: 'project',
  },
  {
    path: '/admin/quotes',
    labelKey: 'nav.quotes',
    requiredRoles: ['tenant_admin'],
    sectionKey: 'main',
    needs: 'project',
  },
  {
    // The photo shop: each shoot's photos sold privately to that shoot's client (beta).
    path: '/admin/photo-shop',
    labelKey: 'nav.photo_shop',
    requiredRoles: ['tenant_admin'],
    sectionKey: 'main',
    needs: 'project',
    featureKey: FEATURES.billing.photoShop,
  },
  {
    // The studio shop: uniforms and items families buy, collected at the studio (beta).
    path: '/admin/shop',
    labelKey: 'nav.shop',
    requiredRoles: ['tenant_admin'],
    sectionKey: 'main',
    needs: 'teaches_classes',
    featureKey: FEATURES.billing.studioShop,
  },
  {
    path: '/admin/appointments',
    labelKey: 'nav.appointments',
    requiredRoles: ['tenant_admin'],
    sectionKey: 'main',
    featureKey: FEATURES.scheduling.clientBooking,
  },
  {
    path: '/admin/notifications',
    labelKey: 'nav.notifications',
    requiredRoles: ['tenant_admin'],
    sectionKey: 'main',
  },
  {
    path: '/admin/finance',
    labelKey: 'finance.hub.title',
    requiredRoles: ['tenant_admin'],
    sectionKey: 'finance',
  },
  {
    path: '/admin/finance/payments',
    labelKey: 'finance.payments.title',
    requiredRoles: ['tenant_admin'],
    sectionKey: 'finance',
    indent: true,
  },
  {
    path: '/admin/finance/expenses',
    labelKey: 'finance.expenses.title',
    requiredRoles: ['tenant_admin'],
    sectionKey: 'finance',
    indent: true,
  },
  {
    path: '/admin/finance/expenses/categories',
    labelKey: 'finance.categories.title',
    requiredRoles: ['tenant_admin'],
    sectionKey: 'finance',
    indent: true,
  },
  {
    path: '/admin/finance/import',
    labelKey: 'finance.import.nav_title',
    requiredRoles: ['tenant_admin'],
    sectionKey: 'finance',
    indent: true,
  },
  {
    path: '/admin/setup',
    labelKey: 'nav.setup_overview',
    requiredRoles: ['tenant_admin'],
    sectionKey: 'setup',
  },
  {
    // Reopens the "Finish setup" checklist on the studio home (see AdminPanel).
    path: SETUP_GUIDE_PATH,
    labelKey: 'setup_guide.menu',
    requiredRoles: ['tenant_admin'],
    sectionKey: 'setup',
    indent: true,
  },
  {
    path: '/admin/setup/settings',
    labelKey: 'settings.hub.page_title',
    requiredRoles: ['tenant_admin'],
    sectionKey: 'setup',
    indent: true,
  },
  {
    path: '/admin/setup/bundled-payments',
    labelKey: 'settings.bundled.nav_title',
    requiredRoles: ['tenant_admin'],
    sectionKey: 'setup',
    indent: true,
    tenantFilter: 'bundled',
    // Class-billing provider setup; still linked from the Settings hub.
    needs: 'teaches_classes',
  },
  {
    path: '/admin/setup/payments',
    labelKey: 'settings.payments.title',
    requiredRoles: ['tenant_admin'],
    sectionKey: 'setup',
    indent: true,
    tenantFilter: 'split',
    /** Stripe dormant — split payment settings only when feature re-enabled (or mock via override). */
    featureKey: FEATURES.billing.stripe,
  },
  {
    path: '/admin/setup/invoicing',
    labelKey: 'settings.invoicing.title',
    requiredRoles: ['tenant_admin'],
    sectionKey: 'setup',
    indent: true,
    tenantFilter: 'split',
    featureKey: FEATURES.billing.stripe,
  },
  {
    path: '/admin/setup/billing',
    labelKey: 'nav.billing',
    requiredRoles: ['tenant_admin'],
    sectionKey: 'setup',
    indent: true,
  },
  {
    path: '/admin/setup/levels',
    needs: 'teaches_classes',
    labelKey: 'nav.levels',
    requiredRoles: ['tenant_admin'],
    sectionKey: 'setup',
    indent: true,
    moduleKey: 'categories',
  },
  {
    path: '/admin/setup/terms',
    needs: 'teaches_classes',
    labelKey: 'nav.terms',
    requiredRoles: ['tenant_admin'],
    sectionKey: 'setup',
    indent: true,
    moduleKey: 'scheduling',
  },
  {
    path: '/admin/packages',
    labelKey: 'nav.booking_services',
    requiredRoles: ['tenant_admin'],
    sectionKey: 'setup',
    indent: true,
    featureKey: FEATURES.scheduling.adminBooking,
  },
  {
    path: '/admin/setup/booking',
    labelKey: 'nav.booking_settings',
    requiredRoles: ['tenant_admin'],
    sectionKey: 'setup',
    indent: true,
    featureKey: FEATURES.scheduling.adminBooking,
  },
  {
    path: '/admin/setup/waivers',
    labelKey: 'nav.waivers',
    requiredRoles: ['tenant_admin'],
    sectionKey: 'setup',
    indent: true,
  },
  {
    // The platform home lists the studios; on a studio host "/" is the studio's own home.
    path: '/',
    labelKey: 'nav.platform_studios',
    requiredRoles: ['super_admin'],
    sectionKey: 'platform',
    withoutStudioOnly: true,
  },
  {
    path: '/platform/onboard',
    labelKey: 'nav.platform_onboard',
    requiredRoles: ['super_admin'],
    sectionKey: 'platform',
  },
  {
    path: '/platform/features',
    labelKey: 'nav.platform_features',
    requiredRoles: ['super_admin'],
    sectionKey: 'platform',
  },
  {
    path: '/platform/feedback',
    labelKey: 'nav.platform_feedback',
    requiredRoles: ['super_admin'],
    sectionKey: 'platform',
  },
  {
    path: '/platform/skins',
    labelKey: 'nav.platform_skins',
    requiredRoles: ['super_admin'],
    sectionKey: 'platform',
  },
  {
    path: '/dashboard/portal',
    labelKey: 'nav.my_account',
    requiredRoles: [...PARENT_ROLE_NAMES],
    sectionKey: 'portal',
  },
  {
    path: '/dashboard/student',
    labelKey: 'nav.student_dashboard',
    requiredRoles: ['student', 'adult_student'],
    sectionKey: 'learning',
  },
];

/** Unauthenticated navigation items */
export const publicNavigationConfig: NavItem[] = [
  {
    // The studio's public homepage. Not shown in the studio admin's own menu (see buildNavSections).
    path: '/',
    labelKey: 'nav.home',
    requiredRoles: [],
    sectionKey: 'browse',
  },
  {
    path: '/classes',
    labelKey: 'nav.classes',
    requiredRoles: [],
    sectionKey: 'browse',
    needs: 'teaches_classes',
  },
  {
    path: '/book',
    labelKey: 'nav.book_appointment',
    requiredRoles: [],
    sectionKey: 'browse',
    featureKey: FEATURES.scheduling.clientBooking,
    disableWhenBookingOff: true,
  },
  {
    path: '/login',
    labelKey: 'nav.login',
    requiredRoles: [],
    sectionKey: 'browse',
    worksWithoutStudio: true,
  },
  {
    path: '/signup',
    labelKey: 'nav.signup',
    requiredRoles: [],
    sectionKey: 'browse',
    worksWithoutStudio: true,
  },
];

const SECTION_ORDER: NavSectionKey[] = [
  'browse',
  'main',
  'finance',
  'setup',
  'platform',
  'portal',
  'learning',
];

/** Profile visibility: an item with `needs` shows only when the studio's profile has it. */
export function matchesProfile(item: NavItem, profile: StudioProfile | null | undefined): boolean {
  if (!item.needs) return true;
  return profileHasGate(profile ?? EXISTING_STUDIO_PROFILE, item.needs);
}

export function matchesTenantFilter(
  item: NavItem,
  tenant: NavTenantContext | null | undefined,
): boolean {
  if (!item.tenantFilter) return true;
  switch (item.tenantFilter) {
    case 'bundled':
      return tenantUsesBundledPayments(tenant);
    case 'split':
      return tenantUsesSplitProviders(tenant);
    default:
      return true;
  }
}

/**
 * Check if a user (with given roles) can access a route.
 */
export function canAccessRoute(userRoles: string[], requiredRoles: string[]): boolean {
  if (requiredRoles.length === 0) {
    return true;
  }
  return userRoles.some((role) => requiredRoles.includes(role));
}

/**
 * Longest-prefix match so hub routes (e.g. /admin/finance) are not active on sub-pages.
 */
export function resolveActiveNavPath(pathname: string, items: NavItem[]): string | null {
  // Without a studio, "/" is the platform home (its own menu item).
  if (pathname === '/' && items.some((item) => item.path === '/')) {
    return '/';
  }
  if (pathname === '/') {
    // The studio homepage is its own menu item (Home).
    return items.some((item) => item.path === '/') ? '/' : null;
  }
  if (pathname === '/classes') {
    return '/classes';
  }

  let best: string | null = null;
  for (const item of items) {
    const { path } = item;
    if (pathname === path || pathname.startsWith(`${path}/`)) {
      if (!best || path.length > best.length) {
        best = path;
      }
    }
  }
  return best;
}

/**
 * Build grouped nav sections for the drawer, hiding empty groups.
 */
export function buildNavSections(
  items: NavItem[],
  userRoles: string[] | null,
): NavSection[] {
  const roles = userRoles ?? [];
  // A studio admin works from their own pages; the public "Browse" pages (what a client sees)
  // are not in their menu. Every other role keeps them.
  const isStudioAdmin = roles.includes('tenant_admin');
  const visibleItems = items.filter(
    (item) =>
      canAccessRoute(roles, item.requiredRoles) && !(isStudioAdmin && item.sectionKey === 'browse'),
  );

  const grouped = new Map<NavSectionKey, NavItem[]>();
  for (const item of visibleItems) {
    const list = grouped.get(item.sectionKey) ?? [];
    list.push(item);
    grouped.set(item.sectionKey, list);
  }

  return SECTION_ORDER.filter((key) => grouped.has(key)).map((sectionKey) => ({
    sectionKey,
    labelKey: SECTION_LABELS[sectionKey],
    items: grouped.get(sectionKey)!,
  }));
}
