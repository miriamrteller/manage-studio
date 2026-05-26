import { supabase } from '@/lib/supabase';

/**
 * Links the logged-in auth user to the guardian/adult person record created during enrolment.
 * Uses SECURITY DEFINER RPC — required because parents cannot UPDATE family_members via RLS.
 */
export async function linkAuthUserToPerson(personId: string): Promise<void> {
  const { error } = await supabase.rpc('link_auth_user_to_person', {
    p_person_id: personId,
  });

  if (error) {
    throw new Error(error.message);
  }
}
