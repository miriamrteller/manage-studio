import { supabase } from '@/lib/supabase';

/**
 * Links the logged-in auth user to an adult person's own record (solo adult enrolment).
 * Uses `link_auth_user_to_person` RPC — sets people.user_profile_id when there is no family account.
 *
 * Do NOT call:
 * - at pending_payment creation / checkout prepare
 * - with a minor student's person_id (use linkGuardianForEngagement after payment instead)
 * - during admin enrolment on behalf of a family
 */
export async function linkAuthUserToPerson(personId: string): Promise<void> {
  const { error } = await supabase.rpc('link_auth_user_to_person', {
    p_person_id: personId,
  });

  if (error) {
    throw new Error(error.message);
  }
}

/**
 * Links the logged-in auth user to the guardian account_holder for a paid/active engagement.
 * Requires auth email to match guardian email. Call after payment from AuthCallbackPage.
 */
export async function linkGuardianForEngagement(engagementId: string): Promise<void> {
  const { error } = await supabase.rpc('link_auth_user_to_guardian_for_engagement', {
    p_engagement_id: engagementId,
  });

  if (error) {
    throw new Error(error.message);
  }
}

/**
 * Links the signed-in user to every family account row in their own studio that carries
 * their (verified) email and is not linked yet. Safe to call on every sign-in: it never
 * changes an existing link. Returns how many rows were linked.
 */
export async function linkMyGuardianAccounts(): Promise<number> {
  const { data, error } = await supabase.rpc('link_my_guardian_accounts');

  if (error) {
    throw new Error(error.message);
  }

  return typeof data === 'number' ? data : 0;
}
