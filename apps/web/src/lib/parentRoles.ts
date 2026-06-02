/** Roles that grant access to the parent portal and parent enrolment flows. */
export const PARENT_ROLE_NAMES = ['parent', 'guardian', 'account_holder'] as const;

export function hasParentRole(roles: string[] | undefined): boolean {
  return roles?.some((r) => (PARENT_ROLE_NAMES as readonly string[]).includes(r)) ?? false;
}
