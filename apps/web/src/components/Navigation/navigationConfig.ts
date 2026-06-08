import { PARENT_ROLE_NAMES } from '@/lib/parentRoles';
import type { PresetModules } from '@shared/index';

/**
 * Navigation Configuration
 *
 * Defines routes shown in the nav drawer, filtered by user roles.
 *
 * Role values come from useCurrentUser().user.role (array of strings):
 * - 'tenant_admin': Full system access
 * - 'parent', 'guardian', or 'account_holder': Parent portal access
 * - 'student' or 'adult_student': Student dashboard access
 * - 'teacher': (reserved for future use)
 */

export type NavSectionKey =
  | 'browse'
  | 'administration'
  | 'setup'
  | 'portal'
  | 'learning';

export interface NavItem {
  path: string;
  labelKey: string;
  requiredRoles: string[];
  sectionKey: NavSectionKey;
  /** Non-clickable section heading inside the drawer */
  isGroupLabel?: boolean;
  /** Indented child item (e.g. setup sub-pages) */
  indent?: boolean;
  /** Hide item when the named module is disabled for this tenant */
  moduleKey?: keyof PresetModules;
}

export interface NavSection {
  sectionKey: NavSectionKey;
  labelKey: string;
  items: NavItem[];
}

export const SECTION_LABELS: Record<NavSectionKey, string> = {
  browse: 'nav.section.browse',
  administration: 'nav.section.administration',
  setup: 'pages.admin.setup.title',
  portal: 'nav.section.portal',
  learning: 'nav.section.learning',
};

/** Authenticated navigation items (flattened; no dropdowns) */
export const navigationConfig: NavItem[] = [
  {
    path: '/classes',
    labelKey: 'nav.classes',
    requiredRoles: [],
    sectionKey: 'browse',
  },
  {
    path: '/admin/students',
    labelKey: 'nav.students',
    requiredRoles: ['tenant_admin'],
    sectionKey: 'administration',
  },
  {
    path: '/admin/setup',
    labelKey: 'pages.admin.setup.title',
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
    path: '/admin/setup/waivers',
    labelKey: 'nav.waivers',
    requiredRoles: ['tenant_admin'],
    sectionKey: 'setup',
    indent: true,
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
  'setup',
  'portal',
  'learning',
];

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
 * Build grouped nav sections for the drawer, hiding empty groups.
 */
export function buildNavSections(
  items: NavItem[],
  userRoles: string[] | null
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
