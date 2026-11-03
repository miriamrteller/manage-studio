import { supabase } from '@/lib/supabase';
import { isInactive, readLastActivity } from './activityStore';
import { INACTIVITY_LOGIN_PATH } from './config';
import { signOutForInactivity } from './signOutForInactivity';
import { AUTH_WAIT_MS, withTimeout } from '@/lib/withTimeout';

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

  // If the session cannot be read in time (a refresh that never answers), assume it exists: the
  // user has been away past the limit, so signing out is the safe answer and never blocks the app.
  let signedIn = true;
  try {
    const result = await withTimeout(supabase.auth.getSession(), AUTH_WAIT_MS, 'timeout' as const);
    signedIn = result === 'timeout' ? true : Boolean(result.data.session);
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
  // The router was created when the page loaded, so changing only the address bar would leave it
  // on the old page. A full load of the sign-in address starts it there, with the notice.
  window.location.replace(INACTIVITY_LOGIN_PATH);
  return true;
}
