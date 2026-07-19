import { PARENT_ROLE_NAMES } from '@/lib/parentRoles';
import type { PresetModules, FeatureKey } from '@shared/index';
import { FEATURES } from '@shared/index';
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
  | 'administration'
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
  administration: 'nav.section.administration',
  finance: 'nav.section.finance',
  setup: 'nav.section.setup',
  platform: 'nav.section.platform',
  portal: 'nav.section.portal',
  learning: 'nav.section.learning',
};

/** Authenticated navigation items (flattened; grouped in the drawer) */
export const navigationConfig: NavItem[] = [
  {
    path: '/classes',
    labelKey: 'nav.classes',
    requiredRoles: [],
    sectionKey: 'browse',
  },
  {
    path: '/book',
    labelKey: 'nav.book_appointment',
    requiredRoles: [],
    sectionKey: 'browse',
    featureKey: FEATURES.scheduling.clientBooking,
  },
  {
    path: '/admin/students',
    labelKey: 'nav.students',
    requiredRoles: ['tenant_admin'],
    sectionKey: 'administration',
  },
  {
    path: '/admin/families',
    labelKey: 'nav.families',
    requiredRoles: ['tenant_admin'],
    sectionKey: 'administration',
  },
  {
    path: '/admin/notifications',
    labelKey: 'nav.notifications',
    requiredRoles: ['tenant_admin'],
    sectionKey: 'administration',
  },
  {
    path: '/admin/appointments',
    labelKey: 'nav.appointments',
    requiredRoles: ['tenant_admin'],
    sectionKey: 'administration',
    featureKey: FEATURES.scheduling.clientBooking,
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
    path: '/admin/setup',
    labelKey: 'nav.setup_overview',
    requiredRoles: ['tenant_admin'],
    sectionKey: 'setup',
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
    labelKey: 'nav.levels',
    requiredRoles: ['tenant_admin'],
    sectionKey: 'setup',
    indent: true,
    moduleKey: 'categories',
  },
  {
    path: '/admin/setup/terms',
    labelKey: 'nav.terms',
    requiredRoles: ['tenant_admin'],
    sectionKey: 'setup',
    indent: true,
    moduleKey: 'scheduling',
  },
  {
    path: '/admin/setup/classes',
    labelKey: 'nav.manage_classes',
    requiredRoles: ['tenant_admin'],
    sectionKey: 'setup',
    indent: true,
  },
  {
    path: '/admin/setup/services',
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
    path: '/platform/onboard',
    labelKey: 'nav.platform_onboard',
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
    path: '/classes',
    labelKey: 'nav.classes',
    requiredRoles: [],
    sectionKey: 'browse',
  },
  {
    path: '/book',
    labelKey: 'nav.book_appointment',
    requiredRoles: [],
    sectionKey: 'browse',
    featureKey: FEATURES.scheduling.clientBooking,
  },
  {
    path: '/login',
    labelKey: 'nav.login',
    requiredRoles: [],
    sectionKey: 'browse',
  },
  {
    path: '/signup',
    labelKey: 'nav.signup',
    requiredRoles: [],
    sectionKey: 'browse',
  },
];

const SECTION_ORDER: NavSectionKey[] = [
  'browse',
  'administration',
  'finance',
  'setup',
  'platform',
  'portal',
  'learning',
];

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
  if (pathname === '/' || pathname === '/classes') {
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
  const visibleItems = items.filter((item) => canAccessRoute(roles, item.requiredRoles));

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
