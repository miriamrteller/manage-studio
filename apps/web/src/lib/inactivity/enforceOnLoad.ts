import { supabase } from '@/lib/supabase';
import { isInactive, readLastActivity } from './activityStore';
import { INACTIVITY_LOGIN_PATH } from './config';
import { signOutForInactivity } from './signOutForInactivity';

/**
 * Runs BEFORE the app renders. A browser reopened after a long break still holds a valid
 * saved session; if the last recorded activity is older than the limit, the user is signed
 * out here, so no signed-in page is ever drawn, and the address is switched to the sign-in
 * page with the notice. Returns true when it signed someone out.
 *
 * The common case (no stored time, or a recent one) returns at once without any waiting.
 */
export async function enforceInactivityOnLoad(now: number = Date.now()): Promise<boolean> {
  if (!isInactive(now, readLastActivity())) return false;

  let signedIn = false;
  try {
    const { data } = await supabase.auth.getSession();
    signedIn = Boolean(data.session);
  } catch {
    signedIn = false;
  }

  if (!signedIn) {
    // Nothing to sign out of; just drop the stale time so it cannot linger.
    const { clearLastActivity } = await import('./activityStore');
    clearLastActivity();
    return false;
  }

  await signOutForInactivity();
  window.history.replaceState(null, '', INACTIVITY_LOGIN_PATH);
  return true;
}
