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
 * - 'staff': a teacher (My classes)
 */

export type NavSectionKey =
  | 'browse'
  | 'main'
  | 'platform'
  | 'portal'
  | 'learning'
  | 'teaching';

export type NavTenantFilter = 'bundled' | 'split';

/** One line of the studio admin's menu; its pages are tabs along the top of the page. */
export type NavAreaKey =
  | 'home'
  | 'leads'
  | 'people'
  | 'classes'
  | 'projects'
  | 'bookings'
  | 'shop'
  | 'finance'
  | 'settings';

export interface NavItem {
  path: string;
  labelKey: string;
  requiredRoles: string[];
  sectionKey: NavSectionKey;
  /** The menu line this page belongs to; pages of one area are its tabs. Omit = its own line. */
  area?: NavAreaKey;
  /** Other pages that count as this tab (e.g. sub-pages reached from it). */
  alsoActiveOn?: string[];
  /** Only this exact address counts (Home at /admin/setup is not the parent of /admin/setup/…). */
  exact?: boolean;
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
  platform: 'nav.section.platform',
  portal: 'nav.section.portal',
  learning: 'nav.section.learning',
  teaching: 'nav.section.teaching',
};

/** The studio home with the setup checklist forced open. */
export const SETUP_GUIDE_PATH = '/admin/setup?guide=open';

/** The Studio settings page's sections, each a tab of Settings (TenantSettingsPage reads ?tab=). */
export const SETTINGS_TAB_IDS = [
  'branding',
  'profile',
  'business',
  'features',
  'locale',
  'payment',
  'invoicing',
  'legal',
  'security',
] as const;

export const SETTINGS_PATH = '/admin/setup/settings';

const SETTINGS_TAB_ITEMS: NavItem[] = SETTINGS_TAB_IDS.map((id, index) => ({
  // The first tab is the page's own address, so the menu line opens it without a ?tab=.
  path: index === 0 ? SETTINGS_PATH : `${SETTINGS_PATH}?tab=${id}`,
  labelKey: `settings.tabs.${id}`,
  requiredRoles: ['tenant_admin'],
  sectionKey: 'main' as const,
  area: 'settings' as const,
}));

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
  // The studio admin's working pages: one flat menu of areas (no group to open). Each `area` is
  // one menu line; the pages in it are the tabs along the top of that area (AreaTabs). The menu
  // line opens the area's first visible page. Order = the order the work flows.
  {
    // The studio home with the setup checklist.
    path: '/admin/setup',
    labelKey: 'nav.home',
    requiredRoles: ['tenant_admin'],
    sectionKey: 'main',
    area: 'home',
    exact: true,
  },
  {
    path: '/admin/leads',
    labelKey: 'nav.leads',
    requiredRoles: ['tenant_admin'],
    sectionKey: 'main',
    area: 'leads',
  },
  {
    path: '/admin/leads/get',
    labelKey: 'pages.crm.tabs.get_leads',
    requiredRoles: ['tenant_admin'],
    sectionKey: 'main',
    area: 'leads',
    // The forms and help pages are reached from Get leads.
    alsoActiveOn: ['/admin/leads/forms', '/admin/leads/help'],
  },
  {
    // The enquiry form questions and the daily email (was Settings > Leads).
    path: '/admin/leads/settings',
    labelKey: 'nav.tab.lead_settings',
    requiredRoles: ['tenant_admin'],
    sectionKey: 'main',
    area: 'leads',
  },
  {
    path: '/admin/students',
    labelKey: 'nav.students',
    requiredRoles: ['tenant_admin'],
    sectionKey: 'main',
    area: 'people',
  },
  {
    path: '/admin/families',
    labelKey: 'nav.families',
    requiredRoles: ['tenant_admin'],
    sectionKey: 'main',
    area: 'people',
    // Family accounts (parents pay for children) are a switch; other studios work from Clients.
    needs: 'family_accounts',
  },
  {
    path: '/admin/classes',
    labelKey: 'nav.classes',
    requiredRoles: ['tenant_admin'],
    sectionKey: 'main',
    area: 'classes',
    needs: 'teaches_classes',
  },
  {
    path: '/admin/setup/levels',
    needs: 'teaches_classes',
    featureKey: FEATURES.offerings.structure,
    labelKey: 'nav.levels',
    requiredRoles: ['tenant_admin'],
    sectionKey: 'main',
    area: 'classes',
    moduleKey: 'categories',
  },
  {
    path: '/admin/setup/terms',
    needs: 'teaches_classes',
    featureKey: FEATURES.offerings.structure,
    labelKey: 'nav.terms',
    requiredRoles: ['tenant_admin'],
    sectionKey: 'main',
    area: 'classes',
    moduleKey: 'scheduling',
  },
  {
    path: '/admin/setup/teachers',
    needs: 'teaches_classes',
    labelKey: 'nav.teachers',
    requiredRoles: ['tenant_admin'],
    sectionKey: 'main',
    area: 'classes',
  },
  {
    // Class cards (was a Settings tab).
    path: '/admin/classes/cards',
    needs: 'teaches_classes',
    labelKey: 'settings.tabs.class_cards',
    requiredRoles: ['tenant_admin'],
    sectionKey: 'main',
    area: 'classes',
  },
  {
    path: '/admin/jobs',
    labelKey: 'nav.jobs',
    requiredRoles: ['tenant_admin'],
    sectionKey: 'main',
    area: 'projects',
    needs: 'project',
  },
  {
    path: '/admin/quotes',
    labelKey: 'nav.quotes',
    requiredRoles: ['tenant_admin'],
    sectionKey: 'main',
    area: 'projects',
    needs: 'project',
  },
  {
    // Bookings: one place for the calendar, packages, hours and booking rules (owner, 13 Nov 2026).
    path: '/admin/appointments',
    labelKey: 'nav.tab.calendar',
    requiredRoles: ['tenant_admin'],
    sectionKey: 'main',
    area: 'bookings',
    featureKey: FEATURES.scheduling.clientBooking,
  },
  {
    // Packages (photographers and other non-class studios; "Bookable services" otherwise).
    path: '/admin/packages',
    labelKey: 'nav.booking_services',
    requiredRoles: ['tenant_admin'],
    sectionKey: 'main',
    area: 'bookings',
    featureKey: FEATURES.scheduling.adminBooking,
  },
  {
    // Availability: online booking on/off and its rules, opening hours, blocked times and
    // Google Calendar, on one tab (owner, 13 Nov 2026: no separate Booking rules).
    path: '/admin/setup/booking',
    labelKey: 'nav.tab.availability',
    requiredRoles: ['tenant_admin'],
    sectionKey: 'main',
    area: 'bookings',
    featureKey: FEATURES.scheduling.adminBooking,
  },
  {
    // The photo shop: each shoot's photos sold privately to that shoot's client (beta).
    path: '/admin/photo-shop',
    labelKey: 'nav.photo_shop',
    requiredRoles: ['tenant_admin'],
    sectionKey: 'main',
    area: 'shop',
    needs: 'project',
    featureKey: FEATURES.billing.photoShop,
  },
  {
    // The studio shop: uniforms and items families buy, collected at the studio (beta).
    path: '/admin/shop',
    labelKey: 'nav.tab.studio_shop',
    requiredRoles: ['tenant_admin'],
    sectionKey: 'main',
    area: 'shop',
    needs: 'teaches_classes',
    featureKey: FEATURES.billing.studioShop,
  },
  {
    path: '/admin/finance',
    labelKey: 'nav.tab.overview',
    requiredRoles: ['tenant_admin'],
    sectionKey: 'main',
    area: 'finance',
  },
  {
    path: '/admin/finance/payments',
    labelKey: 'finance.payments.title',
    requiredRoles: ['tenant_admin'],
    sectionKey: 'main',
    area: 'finance',
  },
  {
    path: '/admin/finance/expenses',
    labelKey: 'finance.expenses.title',
    requiredRoles: ['tenant_admin'],
    sectionKey: 'main',
    area: 'finance',
  },
  {
    path: '/admin/finance/expenses/categories',
    labelKey: 'finance.categories.title',
    requiredRoles: ['tenant_admin'],
    sectionKey: 'main',
    area: 'finance',
  },
  {
    path: '/admin/finance/import',
    labelKey: 'finance.import.nav_title',
    requiredRoles: ['tenant_admin'],
    sectionKey: 'main',
    area: 'finance',
  },
  {
    path: '/admin/setup/billing',
    labelKey: 'nav.billing',
    featureKey: FEATURES.people.families,
    requiredRoles: ['tenant_admin'],
    sectionKey: 'main',
    area: 'finance',
  },
  ...SETTINGS_TAB_ITEMS,
  {
    path: '/admin/setup/waivers',
    labelKey: 'nav.waivers',
    requiredRoles: ['tenant_admin'],
    sectionKey: 'main',
    area: 'settings',
  },
  {
    path: '/admin/setup/bundled-payments',
    labelKey: 'settings.bundled.nav_title',
    requiredRoles: ['tenant_admin'],
    sectionKey: 'main',
    area: 'settings',
    tenantFilter: 'bundled',
    // Class-billing provider setup; still linked from the Settings hub.
    needs: 'teaches_classes',
  },
  {
    path: '/admin/setup/payments',
    labelKey: 'settings.payments.title',
    requiredRoles: ['tenant_admin'],
    sectionKey: 'main',
    area: 'settings',
    tenantFilter: 'split',
    /** Stripe dormant — split payment settings only when feature re-enabled (or mock via override). */
    featureKey: FEATURES.billing.stripe,
  },
  {
    path: '/admin/setup/invoicing',
    labelKey: 'settings.invoicing.title',
    requiredRoles: ['tenant_admin'],
    sectionKey: 'main',
    area: 'settings',
    tenantFilter: 'split',
    featureKey: FEATURES.billing.stripe,
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
  {
    path: '/teach',
    labelKey: 'nav.my_classes',
    requiredRoles: ['staff'],
    sectionKey: 'teaching',
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
  'platform',
  'teaching',
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
  let bestLength = -1;
  for (const item of items) {
    const base = basePath(item.path);
    if (pathname === base || (!item.exact && pathname.startsWith(`${base}/`))) {
      if (base.length > bestLength) {
        best = item.path;
        bestLength = base.length;
      }
    }
  }
  return best;
}

/** The path without its ?query (settings tabs share one page). */
export function basePath(path: string): string {
  const q = path.indexOf('?');
  return q === -1 ? path : path.slice(0, q);
}

function matchesPath(pathname: string, path: string): number {
  const base = basePath(path);
  return pathname === base || pathname.startsWith(`${base}/`) ? base.length : -1;
}

/**
 * The tab (page) of an area that the current address belongs to: the longest matching page, its
 * `alsoActiveOn` pages, and for pages that differ only by ?tab= the one naming the current tab
 * (or the plain one when the address names none, or a tab not in the list).
 */
export function resolveActiveTab(
  pathname: string,
  search: string,
  items: NavItem[],
): NavItem | null {
  let best: NavItem[] = [];
  let bestLength = -1;
  for (const item of items) {
    const lengths = [item.path, ...(item.alsoActiveOn ?? [])].map((p) =>
      item.exact && p === item.path ? (pathname === basePath(p) ? p.length : -1) : matchesPath(pathname, p),
    );
    const length = Math.max(...lengths);
    if (length < 0) continue;
    if (length > bestLength) {
      best = [item];
      bestLength = length;
    } else if (length === bestLength) {
      best.push(item);
    }
  }
  if (best.length <= 1) return best[0] ?? null;
  const tab = new URLSearchParams(search).get('tab');
  const named = best.find((item) => tab && item.path.endsWith(`?tab=${tab}`));
  return named ?? best.find((item) => !item.path.includes('?')) ?? best[0];
}

/** One line of the menu: an area (its pages become tabs) or a single page. */
export interface NavEntry {
  key: string;
  /** Where the line goes: the area's first visible page. */
  path: string;
  area?: NavAreaKey;
  items: NavItem[];
}

/** Turn a section's pages into menu lines, one per area, in the order the areas first appear. */
export function groupNavEntries(items: NavItem[]): NavEntry[] {
  const entries: NavEntry[] = [];
  const byArea = new Map<NavAreaKey, NavEntry>();
  for (const item of items) {
    if (!item.area) {
      entries.push({ key: item.path, path: item.path, items: [item] });
      continue;
    }
    const existing = byArea.get(item.area);
    if (existing) {
      existing.items.push(item);
    } else {
      const entry: NavEntry = { key: `area:${item.area}`, path: item.path, area: item.area, items: [item] };
      byArea.set(item.area, entry);
      entries.push(entry);
    }
  }
  return entries;
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
