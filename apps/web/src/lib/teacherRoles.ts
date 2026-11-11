/** The role a teacher's login gets once linked to their teacher record (database: 'staff'). */
export const TEACHER_ROLE = 'staff';

export function hasTeacherRole(roles: string[] | undefined): boolean {
  return roles?.includes(TEACHER_ROLE) ?? false;
}
