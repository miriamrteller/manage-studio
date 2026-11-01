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
 * Overlay namespace for a tenant vertical, or null when the vertical uses the
 * base wording unchanged. Photographer and dance have overlays; generic,
 * beautician and unknown verticals always get null.
 */
export function overlayNamespaceFor(vertical: VerticalId | null | undefined): string | null {
  if (vertical === 'photographer') return PHOTOGRAPHER_NAMESPACE;
  if (vertical === 'dance-studio') return DANCE_NAMESPACE;
  return null;
}
