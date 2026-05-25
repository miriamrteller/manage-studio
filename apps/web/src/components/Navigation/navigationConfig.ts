/**
 * Navigation Configuration
 * 
 * Defines all authenticated routes that appear in the topbar.
 * Routes are conditionally rendered based on user roles.
 * 
 * Role values come from useCurrentUser().user.role (array of strings):
 * - 'tenant_admin': Full system access
 * - 'parent' or 'guardian': Parent/guardian portal access
 * - 'student' or 'adult_student': Student dashboard access
 * - 'teacher': (reserved for future use)
 */

export interface NavItem {
  path: string;
  labelKey: string;
  requiredRoles: string[];
  dropdownItems?: NavItem[];
}

export const navigationConfig: NavItem[] = [
  // Classes - visible to all authenticated users
  {
    path: '/classes',
    labelKey: 'nav.classes',
    requiredRoles: [], // Empty means visible to all authenticated users
  },

  // Admin Links
  {
    path: '/admin/people',
    labelKey: 'nav.people',
    requiredRoles: ['tenant_admin'],
  },
  {
    path: '/admin/families',
    labelKey: 'nav.families',
    requiredRoles: ['tenant_admin'],
  },
  // Admin Setup (with dropdown sub-items)
  {
    path: '/admin/setup',
    labelKey: 'pages.admin.setup.title',
    requiredRoles: ['tenant_admin'],
    dropdownItems: [
      {
        path: '/admin/setup/billing',
        labelKey: 'nav.billing',
        requiredRoles: ['tenant_admin'],
      },
      {
        path: '/admin/setup/levels',
        labelKey: 'nav.levels',
        requiredRoles: ['tenant_admin'],
      },
      {
        path: '/admin/setup/terms',
        labelKey: 'nav.terms',
        requiredRoles: ['tenant_admin'],
      },
      {
        path: '/admin/setup/classes',
        labelKey: 'nav.manage_classes',
        requiredRoles: ['tenant_admin'],
      },
    ],
  },

  // Parent/Guardian Portal
  {
    path: '/dashboard/portal',
    labelKey: 'nav.portal',
    requiredRoles: ['parent', 'guardian'],
  },

  // Student Dashboard
  {
    path: '/dashboard/student',
    labelKey: 'nav.student_dashboard',
    requiredRoles: ['student', 'adult_student'],
  },
];

/**
 * Check if a user (with given roles) can access a route.
 * 
 * Rules:
 * - If requiredRoles is empty, user can access (visible to all authenticated)
 * - If requiredRoles has items, user must have at least one matching role
 * 
 * @param userRoles User's role array from useCurrentUser().user.role
 * @param requiredRoles Route's required roles
 * @returns true if user can access this route
 */
export function canAccessRoute(userRoles: string[], requiredRoles: string[]): boolean {
  // Empty requiredRoles = accessible to all
  if (requiredRoles.length === 0) {
    return true;
  }

  // Check if user has at least one required role
  return userRoles.some((role) => requiredRoles.includes(role));
}
