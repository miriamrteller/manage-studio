import { supabase } from '@/lib/supabase';
import queryClient from '@/lib/query-client';
import { withTimeout } from '@/lib/withTimeout';
import { clearLastActivity, markSignedOutForInactivity } from './activityStore';

/**
 * Signs this device out (scope 'local': other devices stay signed in), forgets everything
 * cached for the user, and records that it happened so other tabs show the notice too.
 * Never throws: a failed network call still leaves this browser signed out locally.
 */
export async function signOutForInactivity(): Promise<void> {
  try {
    // Bounded: a sign-out that never answers (stuck lock or network) must not hold the app back.
    await withTimeout(supabase.auth.signOut({ scope: 'local' }), 3_000, null);
  } catch (err) {
    console.warn('[inactivity] sign-out call failed:', err instanceof Error ? err.message : err);
  }
  dropSavedSession();
  queryClient.clear();
  clearLastActivity();
  markSignedOutForInactivity();
}

/** Removes the saved session from this browser directly, whatever the sign-out call did. */
export function dropSavedSession(): void {
  try {
    if (typeof localStorage === 'undefined') return;
    for (const key of Object.keys(localStorage)) {
      if (key.startsWith('sb-') && key.includes('-auth-token')) localStorage.removeItem(key);
    }
  } catch {
    // storage unavailable: nothing saved to drop
  }
}
