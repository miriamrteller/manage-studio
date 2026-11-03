import { supabase } from '@/lib/supabase';
import queryClient from '@/lib/query-client';
import { clearLastActivity, markSignedOutForInactivity } from './activityStore';

/**
 * Signs this device out (scope 'local': other devices stay signed in), forgets everything
 * cached for the user, and records that it happened so other tabs show the notice too.
 * Never throws: a failed network call still leaves this browser signed out locally.
 */
export async function signOutForInactivity(): Promise<void> {
  try {
    await supabase.auth.signOut({ scope: 'local' });
  } catch (err) {
    console.warn('[inactivity] sign-out call failed:', err instanceof Error ? err.message : err);
  }
  queryClient.clear();
  clearLastActivity();
  markSignedOutForInactivity();
}
