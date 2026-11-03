import { useContext } from 'react';
import { UNSAFE_LocationContext } from 'react-router-dom';
import { skinForMarketingPage, skinHint, skinName, type Skin } from '@shared/index';
import { VERTICALS } from '@/features/platform/lib/studioSetupForm';

export interface FieldOption {
  id: string;
  /** From the skin row; undefined = the built-in wording (studio_setup.vertical_<id>). */
  name?: string;
  hint?: string;
}

/**
 * The wizard's "Your field" list: the live skins in their order (the "Other"
 * skin last), or the built-in list while they load or if they cannot load.
 */
export function wizardFieldOptions(liveSkins: Skin[] | undefined, language: string): FieldOption[] {
  if (!liveSkins || liveSkins.length === 0) return VERTICALS.map((id) => ({ id }));
  return liveSkins.map((skin) => ({ id: skin.id, name: skinName(skin, language), hint: skinHint(skin, language) }));
}

/** The field a sign-up link asks for: ?field=<skin id>, else ?from=<marketing page>. Live skins only. */
export function fieldFromSearch(search: string, liveSkins: Skin[]): string | null {
  const params = new URLSearchParams(search);
  const field = params.get('field')?.trim().toLowerCase();
  if (field && liveSkins.some((s) => s.id === field)) return field;
  return skinForMarketingPage(liveSkins, params.get('from'))?.id ?? null;
}

const SIGNUP_FIELD_KEY = 'opalswift.signup_field';

/**
 * Self-serve sign-up goes through an email link that drops the page's query, so the
 * field a marketing link asked for is remembered in this browser until the wizard uses it.
 */
export function rememberSignupField(search: string): void {
  const params = new URLSearchParams(search);
  const value = params.get('field') ? `field=${params.get('field')}` : params.get('from') ? `from=${params.get('from')}` : null;
  if (!value) return;
  try {
    localStorage.setItem(SIGNUP_FIELD_KEY, value);
  } catch {
    // Storage blocked: the link still works when the wizard opens on the same page.
  }
}

/** The page's own ?field / ?from, else the one remembered at sign-up (used once). */
export function signupFieldSearch(search: string): string {
  const params = new URLSearchParams(search);
  if (params.get('field') || params.get('from')) return search;
  try {
    const remembered = localStorage.getItem(SIGNUP_FIELD_KEY);
    localStorage.removeItem(SIGNUP_FIELD_KEY);
    return remembered ? `?${remembered}` : '';
  } catch {
    return '';
  }
}

/** The page's query string: the router's when there is one, else the browser's. */
export function usePageSearch(): string {
  const routed = useContext(UNSAFE_LocationContext) as { location?: { search?: string } } | null;
  return routed?.location?.search ?? window.location.search;
}
