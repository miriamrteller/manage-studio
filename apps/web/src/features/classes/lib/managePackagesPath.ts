/**
 * Where "Manage classes" / "Manage packages" goes. With Classes ticked (Settings › Business) it is
 * the class manager (/admin/classes); without it, Bookings › Packages, since the class manager is
 * hidden (owner, 13 Nov 2026: follows the ticks, not the business type).
 */
export function managePackagesPath(teachesClasses: boolean): string {
  return teachesClasses ? '/admin/classes' : '/admin/bookings/packages';
}
