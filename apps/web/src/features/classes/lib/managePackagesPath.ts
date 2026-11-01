import type { VerticalId } from '@shared/index';

/**
 * Where "Manage classes" / "Manage packages" goes. Photographers manage their
 * packages under Setup → Packages (/admin/setup/services); the class manager
 * (/admin/setup/classes, with term and level fields) is hidden from them.
 */
export function managePackagesPath(vertical: VerticalId | null | undefined): string {
  return vertical === 'photographer' ? '/admin/setup/services' : '/admin/setup/classes';
}
