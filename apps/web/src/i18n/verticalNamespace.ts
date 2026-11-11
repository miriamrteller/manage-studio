import type { VerticalId } from '@shared/index';

/** The base wording (dance / generic copy) every tenant falls back to. */
export const BASE_NAMESPACE = 'translation';

/** Wording overlay for photographer tenants: src/i18n/verticals/photographer.*.json. */
export const PHOTOGRAPHER_NAMESPACE = 'photographer';

/**
 * Wording overlay for dance studios: src/i18n/verticals/dance.*.json. Holds only
 * what differs from the neutral base, e.g. the enrolment form is a
 * "health declaration" (docs/legal/07b), where other studios see "form".
 */
export const DANCE_NAMESPACE = 'dance';

/**
 * Wording overlay for studios with family accounts switched off
 * (src/i18n/verticals/no-families.*.json): "families" become "clients" or
 * "accounts", "parents" become "clients".
 */
export const NO_FAMILIES_NAMESPACE = 'no-families';

/** The vertical overlay a studio's wording starts from, before the families switch. */
function verticalOverlay(vertical: VerticalId | null | undefined): string | null {
  if (vertical === 'photographer') return PHOTOGRAPHER_NAMESPACE;
  if (vertical === 'dance-studio') return DANCE_NAMESPACE;
  return null;
}

/**
 * Namespace that holds a vertical overlay with the no-families wording under it
 * (the vertical's own wording wins where both define a key). Built in i18n.ts.
 */
export function withoutFamiliesNamespace(overlay: string | null): string {
  return overlay ? `${overlay}+${NO_FAMILIES_NAMESPACE}` : NO_FAMILIES_NAMESPACE;
}

/**
 * Overlay namespace for a tenant, or null when it uses the base wording
 * unchanged. Photographer and dance have overlays; generic, beautician and
 * unknown verticals get null. With family accounts off, every vertical gets
 * the no-families wording too (a missing profile counts as families on).
 */
export function overlayNamespaceFor(
  vertical: VerticalId | null | undefined,
  options: { familyAccounts?: boolean } = {},
): string | null {
  const overlay = verticalOverlay(vertical);
  if (options.familyAccounts === false) return withoutFamiliesNamespace(overlay);
  return overlay;
}
