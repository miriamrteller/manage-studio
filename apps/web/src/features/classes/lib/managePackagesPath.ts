import type { VerticalId } from '@shared/index';

/**
 * Where "Manage classes" / "Manage packages" goes. Photographers manage their
 * packages under Setup → Packages (/admin/packages); the class manager
 * (/admin/classes, with term and level fields) is hidden from them.
 */
export function managePackagesPath(vertical: VerticalId | null | undefined): string {
  return vertical === 'photographer' ? '/admin/packages' : '/admin/classes';
}
