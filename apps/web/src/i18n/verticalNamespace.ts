import type { VerticalId } from '@shared/index';

/** The base wording (dance / generic copy) every tenant falls back to. */
export const BASE_NAMESPACE = 'translation';

/** Wording overlay for photographer tenants: src/i18n/verticals/photographer.*.json. */
export const PHOTOGRAPHER_NAMESPACE = 'photographer';

/**
 * Overlay namespace for a tenant vertical, or null when the vertical uses the
 * base wording unchanged. Only photographer has an overlay today; dance,
 * generic and unknown verticals always get null.
 */
export function overlayNamespaceFor(vertical: VerticalId | null | undefined): string | null {
  return vertical === 'photographer' ? PHOTOGRAPHER_NAMESPACE : null;
}
